import { state } from './state.js';
import { monday, iso, isMissingRequirements, isWithinOneDayOrLess, getMatchOutcome, getCategoryFipUrl, findConflictingMatches, getConflictClusters, getUrgentIncompleteMatches, getPendingPostponedMatches } from './rules.js';
import { computeRecapRows } from './export.js';

export const $ = s => document.querySelector(s);
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function params() { return new URLSearchParams(state.mem !== null ? state.mem : location.hash.slice(1)); }

export function writeHash(p) {
  const s = p.toString();
  const searchPart = window.location.search || '';
  try {
    history.replaceState(null, '', location.pathname + searchPart + (s ? '#' + s : ''));
    state.mem = null;
  } catch(e) {
    state.mem = s;
  }
}

export function setParam(k, v, onRender) {
  const p = params();
  v ? p.set(k, v) : p.delete(k);
  writeHash(p);
  if (onRender) onRender();
}

export function renderNamesList() {
  const dl = document.getElementById('namesList');
  if (dl) dl.innerHTML = state.names.map(n => `<option value="${esc(n)}">`).join('');
}

export function renderCategoriesList() {
  const dl = document.getElementById('categoriesList');
  if (dl) dl.innerHTML = state.categories.map(c => `<option value="${esc(c)}">`).join('');
  const sel = document.getElementById('filterCat');
  if (sel) {
    const cur = sel.value;
    sel.innerHTML = '<option value="">Tutte le categorie</option>' + state.categories.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    sel.value = state.categories.includes(cur) ? cur : '';
  }
}

export function updateIncompleteBadge() {
  const b = document.getElementById('incCount');
  if (!b) return;
  const count = state.items.filter(isMissingRequirements).length;
  b.textContent = count ? `(${count})` : '';
}

export function updateAlertStatusBadge(openConflicts, openUrgent, openPending, toast) {
  const btn = document.getElementById('conflictAlertBtn');
  const bNavIcon = document.getElementById('bNavAlertIcon');
  if (!btn) return;

  const clusters = getConflictClusters();
  const clusterCount = clusters.length;
  const urgentIncomplete = getUrgentIncompleteMatches();
  const pendingPostponed = getPendingPostponedMatches();

  if (clusterCount > 0) {
    btn.className = 'alert-btn-standalone status-conflict';
    btn.textContent = `❗ ${clusterCount}`;
    btn.title = `${clusterCount} gruppo/i di partite in conflitto di orario! Clicca per risolvere.`;
    btn.onclick = openConflicts;
    if (bNavIcon) bNavIcon.textContent = `❗ ${clusterCount}`;
    return;
  }

  if (urgentIncomplete.length > 0) {
    btn.className = 'alert-btn-standalone status-urgent-incomplete';
    btn.textContent = `⚠️ ${urgentIncomplete.length}`;
    btn.title = `${urgentIncomplete.length} gara/e a meno di un giorno ancora con turni incompleti!`;
    btn.onclick = openUrgent;
    if (bNavIcon) bNavIcon.textContent = `⚠️ ${urgentIncomplete.length}`;
    return;
  }

  if (pendingPostponed.length > 0) {
    btn.className = 'alert-btn-standalone status-pending';
    btn.textContent = `⏳ ${pendingPostponed.length}`;
    btn.title = `${pendingPostponed.length} partita/e rinviata/e senza data di recupero. Clicca per gestire.`;
    btn.onclick = openPending;
    if (bNavIcon) bNavIcon.textContent = `⏳ ${pendingPostponed.length}`;
    return;
  }

  btn.className = 'alert-btn-standalone status-ok';
  btn.textContent = `✓`;
  btn.title = `Nessun conflitto o urgenza rilevata. Calendario regolare.`;
  btn.onclick = () => toast('Calendario regolare: nessun conflitto.');
  if (bNavIcon) bNavIcon.textContent = '✓';
}

export function slotHTML(d, k) {
  const label = k === 'ap' ? 'Apertura' : 'Chiusura', wk = state.dayMeta[d] || {}, v = wk[k] || '';
  const nomeVal = wk[k+'Nome'] || '';
  return `<div class="slot" data-d="${d}" data-k="${k}"><span class="sl">${label}:</span>
    <div class="yn" role="group"><button data-yn="si" aria-pressed="${v === 'si'}">Sì</button><button data-yn="no" aria-pressed="${v === 'no'}">No</button></div>
    ${v === 'si' ? (state.READONLY ? `<span class="val clickable-person" data-quickperson="${esc(nomeVal)}" title="Filtra impegni di ${esc(nomeVal)}">${esc(nomeVal) || '—'}</span>` : `<input data-wn list="namesList" value="${esc(nomeVal)}" placeholder="Nome">`) : ''}</div>`;
}

export function recapHTML(m) {
  if (state.READONLY) return '';

  const rows = computeRecapRows(m);
  if (!rows.length) {
    return `<aside class="recap" data-m="${m}"><h4>Riepilogo del mese</h4><p>Nessun dato (partite con check ✓).</p></aside>`;
  }

  const itemsHtml = rows.map(r => {
    const v = Object.assign({ p: 10, a: 10, c: 10 }, state.molt[r.n.toLowerCase()]);
    const tot = (r.p * v.p) + (r.a * v.a) + (r.c * v.c);
    const subText = `${r.p} part. • ${r.a + r.c} ap/ch`;
    
    return `<div class="recap-item-compact" data-compname="${esc(r.n)}" data-p="${r.p}" data-a="${r.a}" data-c="${r.c}" data-m="${m}" title="Clicca per aprire dettaglio">
      <div class="recap-item-left">
        <span class="recap-item-name">${esc(r.n)}</span>
        <span class="recap-item-sub">${subText}</span>
      </div>
      <span class="recap-item-amount">${tot}€</span>
    </div>`;
  }).join('');

  return `<aside class="recap" data-m="${m}">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <h4>Riepilogo del mese</h4>
      <span style="font-size:11px;color:var(--mute)">Tocca per dettagli</span>
    </div>
    <div class="recap-list-wrap">${itemsHtml}</div>
  </aside>`;
}

export function card(i, hasConflict, isUrgentIncomplete) {
  const isCancelled = i.status === 'annullata';
  const isPostponed = i.status === 'rinviata';
  const ghostOn = !state.READONLY && (!!i.ghost || isCancelled || isPostponed);
  const missingReq = isMissingRequirements(i);

  const t1Val = (i.t1 && i.t1.trim()) 
    ? `<span class="clickable-person" data-quickperson="${esc(i.t1.trim())}">${esc(i.t1.trim())}</span>`
    : '<span class="empty-req">Manca</span>';

  const t2Required = !i.friendly;
  const t2Val = (i.t2 && i.t2.trim())
    ? `<span class="clickable-person" data-quickperson="${esc(i.t2.trim())}">${esc(i.t2.trim())}</span>`
    : (t2Required ? '<span class="empty-req">Manca</span>' : '<span class="empty-opt">—</span>');

  const arbNeeded = isRefereeNeeded(i.cat, i.friendly);
  const arbVal = (i.arb && i.arb.trim())
    ? `<span class="clickable-person" data-quickperson="${esc(i.arb.trim())}">${esc(i.arb.trim())}</span>`
    : (arbNeeded ? '<span class="empty-req">Manca</span>' : '<span class="empty-opt">FIP</span>');

  const catHtml = i.cat ? `<span class="cat-pill">${esc(i.cat)}</span>` : '';
  const friendlyHtml = i.friendly ? `<span class="friendly-badge" title="Amichevole">A</span>` : '';

  const outcome = getMatchOutcome(i);
  const scoreHtml = outcome ? `<span class="score-pill ${outcome.type}">${esc(outcome.label)}</span>` : '';

  const fipUrl = getCategoryFipUrl(i.cat);
  const fipBtnHtml = fipUrl ? `<a href="${esc(fipUrl)}" target="_blank" rel="noopener noreferrer" class="fipBtn" title="Risultati FIP">🌐</a>` : '';

  const hasFile = !!(i.fileData);
  const fileBtnHtml = hasFile
    ? `<button class="reportBtn has-file" data-viewfile="${i.id}" type="button" title="Visualizza Referto Gara">📄 Referto ✓</button>`
    : '';

  let badgeHtml = '';
  if (isCancelled) badgeHtml = `<div class="cancelled-badge">❌ CANCELLATA</div>`;
  else if (isPostponed) badgeHtml = `<div class="postponed-badge">🔄 RINVIATA ${i.postponedDate ? '➔ ' + i.postponedDate : '(Da def.)'}</div>`;
  else if (hasConflict && !state.READONLY) badgeHtml = `<div class="conflict-badge">⚠️ CONFLITTO</div>`;
  else if (isUrgentIncomplete && !state.READONLY) badgeHtml = `<div class="urgent-badge">⏰ INCOMPLETA</div>`;

  return `<div class="match${isCancelled ? ' cancelled' : (isPostponed ? ' postponed' : (ghostOn ? ' ghost' : ''))}${missingReq && !state.READONLY ? ' missing-t1' : ''}${hasConflict && !state.READONLY ? ' conflict-match' : ''}${isUrgentIncomplete && !state.READONLY ? ' urgent-incomplete' : ''}" data-id="${i.id}">
    ${badgeHtml}
    <div class="m-card-header">
      <div style="display:flex;align-items:center;gap:6px">
        <span class="m-time-pill">${i.time || '--:--'}</span>
        ${catHtml}
        ${friendlyHtml}
      </div>
      <div class="m-actions">
        ${fileBtnHtml}
        ${fipBtnHtml}
        ${scoreHtml}
        ${!state.READONLY && !isCancelled ? `<button class="ghostBtn" data-ghost aria-pressed="${!!i.ghost}" title="Esito / Check">✓</button>` : ''}
        ${!state.READONLY && !i.ghost && !isCancelled && !isPostponed ? `<button class="editBtn" data-edit title="Modifica">✏️</button>` : ''}
      </div>
    </div>
    
    <div class="m-title" title="${esc(i.title)}">${esc(i.title) || 'Partita senza titolo'}</div>

    <div class="m-roster-grid">
      <div class="m-roster-chip">
        <span class="chip-lbl">Tavolo 1</span>
        <span class="chip-val">${t1Val}</span>
      </div>
      <div class="m-roster-chip">
        <span class="chip-lbl">Tavolo 2</span>
        <span class="chip-val">${t2Val}</span>
      </div>
      <div class="m-roster-chip">
        <span class="chip-lbl">Arbitro</span>
        <span class="chip-val">${arbVal}</span>
      </div>
    </div>
  </div>`;
}

export function renderNavTree(groupedData, activeMonth, activeWeek) {
  const treeEl = document.getElementById('navTree');
  if (!treeEl) return;

  const years = {};
  Object.keys(groupedData).sort().forEach(m => {
    const y = m.slice(0, 4);
    (years[y] ??= []).push(m);
  });

  const fmtMonth = mStr => new Date(mStr + '-15T12:00').toLocaleDateString('it-IT', { month: 'long' });

  let html = '';
  Object.keys(years).sort().forEach(y => {
    const monthsArr = years[y];
    const isYearOpen = monthsArr.includes(activeMonth);

    let monthsHtml = monthsArr.map(m => {
      const weeksMap = groupedData[m];
      const isCurMonth = m === activeMonth;
      const totGareMese = Object.values(weeksMap).reduce((acc, arr) => acc + arr.length, 0);

      const weeksHtml = Object.keys(weeksMap).sort().map(w => {
        const a = monday(w), b = new Date(a); b.setDate(b.getDate() + 6);
        const wCount = weeksMap[w].length;
        const isCurW = w === activeWeek;
        const wLabel = `${a.getDate()}/${a.getMonth() + 1} - ${b.getDate()}/${b.getMonth() + 1}`;

        return `<button type="button" class="nav-week-link${isCurW ? ' active-week' : ''}" data-navm="${m}" data-navw="${w}">
          <span>Sett. ${wLabel}</span>
          <span class="nav-badge-count">(${wCount})</span>
        </button>`;
      }).join('');

      return `<details class="nav-month${isCurMonth ? ' active-month' : ''}" data-navm="${m}" ${isCurMonth ? 'open' : ''}>
        <summary data-pickm="${m}">
          <span>${fmtMonth(m)}</span>
          <span class="nav-badge-count" style="margin-left:auto">(${totGareMese})</span>
        </summary>
        <div class="nav-weeks-list">
          ${weeksHtml}
        </div>
      </details>`;
    }).join('');

    html += `<details class="nav-year" ${isYearOpen ? 'open' : ''}>
      <summary><span>${y}</span></summary>
      <div>${monthsHtml}</div>
    </details>`;
  });

  treeEl.innerHTML = html;
}
