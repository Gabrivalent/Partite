import { state } from './state.js';

export function $(sel, root = document) { return root.querySelector(sel); }

export function esc(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function params() {
  return new URLSearchParams(window.location.hash.slice(1));
}

export function setParam(k, v, cb) {
  const p = params();
  if (v) p.set(k, v); else p.delete(k);
  window.location.hash = p.toString();
  if (cb) cb();
}

export function renderNamesList() {
  const dl = $('#namesList');
  if (!dl) return;
  dl.innerHTML = state.names.map(n => `<option value="${esc(n)}">`).join('');
}

export function renderCategoriesList() {
  const dl = $('#categoriesList');
  if (!dl) return;
  dl.innerHTML = state.categories.map(c => `<option value="${esc(c)}">`).join('');
}

export function updateIncompleteBadge() {
  const badge = $('#incompleteBadge');
  if (!badge) return;
  const count = state.items.filter(it => {
    if (it.ghost) return false;
    let reqs = false;
    if (!it.t1?.trim()) reqs = true;
    if (!it.friendly && !it.t2?.trim()) reqs = true;
    const isRefNeeded = ['u13', 'u14', 'u15', 'u17', 'u19', 'esordienti'].some(c => (it.cat || '').toLowerCase().includes(c));
    if (isRefNeeded && !it.arb?.trim()) reqs = true;
    return reqs;
  }).length;

  if (count > 0) {
    badge.textContent = count;
    badge.style.display = 'inline-flex';
  } else {
    badge.style.display = 'none';
  }
}

export function updateAlertStatusBadge(onOpenConflicts, onOpenUrgent, onOpenPending, toast) {
  const btn = $('#conflictAlertBtn');
  if (!btn) return;

  const conflicts = findConflictingMatchesList();
  const urgent = getUrgentCount();
  const pending = getPendingCount();

  const totalAlerts = conflicts.length + urgent + pending;

  if (totalAlerts > 0) {
    let tooltipParts = [];
    if (conflicts.length) tooltipParts.push(`${conflicts.length} conflitti orari`);
    if (urgent) tooltipParts.push(`${urgent} imminenti incomplete`);
    if (pending) tooltipParts.push(`${pending} rinviate da definire`);

    btn.style.display = 'flex';
    btn.title = tooltipParts.join(' • ');
    btn.classList.add('pulse-alert');
    
    btn.onclick = () => {
      if (conflicts.length) {
        onOpenConflicts();
      } else if (urgent) {
        onOpenUrgent();
      } else if (pending) {
        onOpenPending();
      }
    };
  } else {
    btn.style.display = 'none';
    btn.classList.remove('pulse-alert');
  }
}

function findConflictingMatchesList() {
  const map = new Map();
  state.items.forEach(it => {
    if (it.ghost || !it.date || !it.time) return;
    const key = `${it.date}_${it.time}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(it);
  });
  const res = [];
  map.forEach(group => {
    if (group.length > 1) {
      group.forEach(it => res.push(it.id));
    }
  });
  return res;
}

function getUrgentCount() {
  const now = new Date();
  return state.items.filter(it => {
    if (it.ghost || !it.date) return false;
    const matchDate = new Date(it.date + 'T' + (it.time || '15:30'));
    const diffHours = (matchDate - now) / (1000 * 60 * 60);
    if (diffHours >= 0 && diffHours <= 48) {
      if (!it.t1?.trim() || (!it.friendly && !it.t2?.trim())) return true;
    }
    return false;
  }).length;
}

function getPendingCount() {
  return state.items.filter(it => it.status === 'rinviata' && !it.postponedDate).length;
}

export function slotHTML(d, k) {
  const wk = state.dayMeta[d] || {};
  const v = wk[k];
  const name = wk[k + 'Nome'] || '';

  if (v === 'si') {
    return `<div class="slot on" data-d="${d}" data-k="${k}">
      <span class="lbl">${k === 'ap' ? 'Ap.' : 'Ch.'}</span>
      <input type="text" data-wn list="namesList" value="${esc(name)}" placeholder="Nome..." autocomplete="off">
      <button type="button" class="yn-pill" data-yn="no">✕</button>
    </div>`;
  }
  if (v === 'no') {
    return `<div class="slot off" data-d="${d}" data-k="${k}">
      <span class="lbl">${k === 'ap' ? 'Ap.' : 'Ch.'}</span>
      <span class="lbl-no">No</span>
      <button type="button" class="yn-pill" data-yn="si">✓</button>
    </div>`;
  }
  return `<div class="slot" data-d="${d}" data-k="${k}">
    <span class="lbl">${k === 'ap' ? 'Ap.' : 'Ch.'}</span>
    <div class="yn-group">
      <button type="button" class="yn-pill" data-yn="si">Sì</button>
      <button type="button" class="yn-pill" data-yn="no">No</button>
    </div>
  </div>`;
}

export function computeRecapRows(m) {
  const counts = {};
  const getCounts = name => {
    const k = name.toLowerCase();
    if (!counts[k]) counts[k] = { n: name, p: 0, a: 0, c: 0 };
    return counts[k];
  };

  state.items.forEach(it => {
    if (!it.date || it.date.slice(0, 7) !== m) return;
    if (it.t1) getCounts(it.t1).p++;
    if (it.t2) getCounts(it.t2).p++;
    if (it.arb) getCounts(it.arb).p++;
  });

  Object.keys(state.dayMeta).forEach(d => {
    if (d.slice(0, 7) !== m) return;
    const wk = state.dayMeta[d];
    if (wk.ap === 'si' && wk.apNome) getCounts(wk.apNome).a++;
    if (wk.ch === 'si' && wk.chNome) getCounts(wk.chNome).c++;
  });

  return Object.values(counts).sort((a, b) => (b.p + b.a + b.c) - (a.p + a.a + a.c) || a.n.localeCompare(b.n));
}

export function recapHTML(m) {
  const rows = computeRecapRows(m);
  if (!rows.length) return `<div class="recap" data-m="${m}">Nessun compenso nel mese.</div>`;

  let totalMonthSum = 0;
  const items = rows.map(r => {
    const v = Object.assign({ p: 10, a: 10, c: 10 }, state.molt[r.n.toLowerCase()]);
    const tot = (r.p * v.p) + (r.a * v.a) + (r.c * v.c);
    totalMonthSum += tot;
    return `<div class="recap-item" data-name="${esc(r.n)}" data-p="${r.p}" data-a="${r.a}" data-c="${r.c}" data-m="${m}" title="Clicca per dettaglio">
      <span class="rn">${esc(r.n)}</span>
      <span class="rd">${r.p}g • ${r.a}ap • ${r.c}ch</span>
      <span class="rt">${tot}€</span>
    </div>`;
  }).join('');

  return `<div class="recap" data-m="${m}">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-size:12.5px;font-weight:700;color:var(--mute)">
      <span>RIEPILOGO COMPENSI MESE</span>
      <span style="color:#4ade80;font-size:14px">Tot: ${totalMonthSum}€</span>
    </div>
    <div class="recap-grid">${items}</div>
  </div>`;
}

export function card(it, hasConflict, isUrgentIncomplete) {
  const isGhost = !!it.ghost;
  const isFriendly = !!it.friendly;
  const status = it.status || '';

  let statusBadge = '';
  if (status === 'vinta') statusBadge = '<span class="match-badge vinta">🟢 Vinta</span>';
  else if (status === 'persa') statusBadge = '<span class="match-badge persa">🔴 Persa</span>';
  else if (status === 'sospesa') statusBadge = '<span class="match-badge sospesa">⚪ Sospesa</span>';
  else if (status === 'rinviata') statusBadge = `<span class="match-badge rinviata">🔄 Rinviata ${it.postponedDate ? '(' + it.postponedDate + ')' : ''}</span>`;
  else if (status === 'annullata') statusBadge = '<span class="match-badge annullata">❌ Annullata</span>';

  const fipUrl = it.cat && state.fipLinks[it.cat] ? state.fipLinks[it.cat] : null;

  let conflictStyle = hasConflict ? 'border-left: 4px solid #ef4444 !important;' : '';
  let urgentStyle = isUrgentIncomplete ? 'border-left: 4px solid #f97316 !important;' : '';

  const renderRoleChip = (roleKey, roleLabel, val) => {
    const hasVal = val && val.trim();
    return `<button type="button" class="match-role-chip ${hasVal ? 'assigned' : 'empty'}" data-quickassign="${roleKey}" title="Assegna ${roleLabel}">
      <span class="role-lbl">${roleLabel}:</span>
      <span class="role-val">${hasVal ? esc(val) : 'Assegna +'}</span>
    </button>`;
  };

  return `<div class="match${isGhost ? ' ghost' : ''}" data-id="${it.id}" style="${conflictStyle || urgentStyle}">
    <div class="match-top">
      <div class="match-meta-left">
        <span class="match-time">🕒 ${esc(it.time || 'n.d.')}</span>
        <span class="match-cat">${esc(it.cat || 'Categoria')}</span>
        ${isFriendly ? '<span class="match-friendly">Amichevole</span>' : ''}
        ${fipUrl ? `<a href="${fipUrl}" target="_blank" class="fip-link-badge" title="Apri risultati FIP">🌐 FIP</a>` : ''}
      </div>
      <div class="match-meta-right">
        ${it.score ? `<span class="match-score">${esc(it.score)}</span>` : ''}
        ${statusBadge}
        <button type="button" class="match-check-btn ${isGhost ? 'checked' : ''}" data-ghost="1" title="Segna esito / Stato">✓</button>
      </div>
    </div>

    <div class="match-title-row">
      <h3 class="match-title" data-edit="1">${esc(it.title || 'Partita senza titolo')}</h3>
    </div>

    <div class="match-roles-grid">
      ${renderRoleChip('t1', 'T1', it.t1)}
      ${!isFriendly ? renderRoleChip('t2', 'T2', it.t2) : ''}
      ${renderRoleChip('arb', 'Arb', it.arb)}
    </div>

    <div class="match-footer-actions">
      ${it.fileData ? `<button type="button" class="pill-btn-sm" data-viewfile="${it.id}">📄 Referto</button>` : `<button type="button" class="pill-btn-sm" data-uploadfile="${it.id}" style="color:var(--mute)">📎 Allega Referto</button>`}
    </div>
  </div>`;
}

export function renderNavTree(months, activeM, activeW) {
  const treeEl = $('#navTree');
  if (!treeEl) return;

  const fmtM = m => new Date(m + '-15T12:00').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });

  let html = '';
  Object.keys(months).sort().forEach(m => {
    const isMActive = m === activeM;
    html += `<div class="nav-month-group">
      <a href="#m=${m}" class="nav-month-link${isMActive ? ' active' : ''}" data-pickm="${m}">
        <span>📅 ${fmtM(m)}</span>
      </a>`;
    if (isMActive) {
      html += `<div class="nav-weeks-list">`;
      Object.keys(months[m]).sort().forEach(w => {
        const isWActive = activeW === w;
        html += `<a href="#m=${m}&s=${w}" class="nav-week-item${isWActive ? ' active' : ''}" data-navm="${m}" data-navw="${w}">Settimana ${w}</a>`;
      });
      html += `</div>`;
    }
    html += `</div>`;
  });

  treeEl.innerHTML = html;
}

export function renderHistoryView(filterText = '') {
  const listEl = $('#historyList');
  if (!listEl) return;

  const q = filterText.toLowerCase().trim();
  const history = state.history || [];
  const filtered = history.filter(item => !q || item.text.toLowerCase().includes(q) || item.type.toLowerCase().includes(q));

  if (!filtered.length) {
    listEl.innerHTML = '<p style="color:var(--mute);text-align:center;padding:20px;font-size:13px">Nessun evento nella cronologia.</p>';
    return;
  }

  const fmtDate = ts => new Date(ts).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  listEl.innerHTML = filtered.map(item => `
    <div class="history-item">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <span class="history-badge ${item.type}">${item.type.toUpperCase()}</span>
        <span style="font-size:11.5px;color:var(--mute)">${fmtDate(item.ts)}</span>
      </div>
      <div style="font-size:13px;color:var(--text)">${esc(item.text)}</div>
    </div>
  `).join('');
}

export function renderCollaboratorProfile(name) {
  state.activeCollabProfile = name;
  let container = document.getElementById('collaboratorProfileView');
  
  if (!container) {
    container = document.createElement('div');
    container.id = 'collaboratorProfileView';
    container.className = 'ov';
    document.body.appendChild(container);
  }

  const cleanName = name.toLowerCase();
  const v = Object.assign({ p: 10, a: 10, c: 10 }, state.molt[cleanName]);

  const matchedItems = state.items.filter(it => 
    (it.t1 && it.t1.toLowerCase() === cleanName) || 
    (it.t2 && it.t2.toLowerCase() === cleanName) || 
    (it.arb && it.arb.toLowerCase() === cleanName)
  );

  let totalGare = matchedItems.length;
  let totalCompenso = totalGare * v.p;

  const monthsSet = [...new Set(matchedItems.map(it => it.date.slice(0, 7)))].sort().reverse();
  const currentFilterMonth = state.profileMonthFilter || '';

  const filteredItems = currentFilterMonth 
    ? matchedItems.filter(it => it.date.startsWith(currentFilterMonth))
    : matchedItems;

  const monthFilteredGare = filteredItems.length;
  const monthFilteredComp = monthFilteredGare * v.p;

  const postsHtml = filteredItems.length ? filteredItems.map(it => `
    <div style="background:var(--card);border-radius:10px;padding:10px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <span style="font-weight:700;font-size:13.5px">${esc(it.title || 'Gara')}</span>
        <span style="font-size:12px;color:var(--mute)">${esc(it.date)}</span>
      </div>
      <div style="font-size:12.5px;color:var(--mute);display:flex;gap:8px">
        <span>Cat: <b>${esc(it.cat || 'n.d.')}</b></span>
        <span>Ruolo: <b>${it.t1?.toLowerCase() === cleanName ? 'T1' : (it.t2?.toLowerCase() === cleanName ? 'T2' : 'Arbitro')}</b></span>
        ${it.score ? `<span>Score: <b>${esc(it.score)}</b></span>` : ''}
      </div>
    </div>
  `).join('') : '<p style="color:var(--mute);text-align:center;padding:20px;font-size:13px">Nessuna partita in questo periodo.</p>';

  const monthsOptions = monthsSet.map(m => `<option value="${m}" ${m === currentFilterMonth ? 'selected' : ''}>${m}</option>`).join('');
  const statsHtml = `
    <div style="background:var(--card);border-radius:12px;padding:14px;margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h4 style="margin:0;font-size:14px">📊 Metriche e Compensi</h4>
        <select id="profileMonthSelect" style="padding:4px 8px;border-radius:8px;font-size:12px">
          <option value="">Tutta la Stagione</option>
          ${monthsOptions}
        </select>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;text-align:center">
        <div style="background:var(--surface);padding:10px;border-radius:8px">
          <span style="font-size:11px;color:var(--mute);display:block">Gare Periodo</span>
          <strong style="font-size:18px">${monthFilteredGare}</strong>
        </div>
        <div style="background:var(--surface);padding:10px;border-radius:8px">
          <span style="font-size:11px;color:var(--mute);display:block">Compenso Stimato</span>
          <strong style="font-size:18px;color:#4ade80">${monthFilteredComp}€</strong>
        </div>
      </div>
    </div>
  `;

  const partnersCount = {};
  matchedItems.forEach(it => {
    [it.t1, it.t2, it.arb].forEach(p => {
      if (p && p.toLowerCase() !== cleanName) {
        partnersCount[p] = (partnersCount[p] || 0) + 1;
      }
    });
  });
  const sortedPartners = Object.entries(partnersCount).sort((a, b) => b[1] - a[1]);
  const partnersHtml = sortedPartners.length ? sortedPartners.map(([pName, cnt]) => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--divider);font-size:13px">
      <span>🤝 ${esc(pName)}</span>
      <span style="color:var(--mute);font-weight:600">${cnt} gare insieme</span>
    </div>
  `).join('') : '<p style="color:var(--mute);text-align:center;padding:20px;font-size:13px">Nessuna collaborazione registrata.</p>';

  const activeTab = state.profileActiveTab || 'posts';

  container.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" style="max-width:540px;height:90vh;display:flex;flex-direction:column">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <h3 style="margin:0">Profilo Collaboratore</h3>
        <button id="closeProfileView" class="pill-btn-sm" style="min-height:28px">✕</button>
      </div>

      <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--divider)">
        <div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,var(--acc),#ec4899);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:22px">
          ${esc(name.slice(0, 2).toUpperCase())}
        </div>
        <div style="flex:1">
          <h2 style="margin:0 0 4px;font-size:18px">${esc(name)}</h2>
          <div style="display:flex;gap:16px;font-size:13px;text-align:center">
            <div><strong>${totalGare}</strong><span style="display:block;color:var(--mute);font-size:11px">Gare</span></div>
            <div><strong style="color:#4ade80">${totalCompenso}€</strong><span style="display:block;color:var(--mute);font-size:11px">Totale</span></div>
          </div>
        </div>
      </div>

      <div style="display:flex;border-bottom:1px solid var(--divider);margin-bottom:12px">
        <button type="button" class="ig-tab-btn" data-igtab="posts" style="flex:1;padding:8px;background:none;border:none;font-weight:700;cursor:pointer;color:var(--text);border-bottom:2px solid ${activeTab === 'posts' ? 'var(--acc)' : 'transparent'}">🏀 Partite</button>
        <button type="button" class="ig-tab-btn" data-igtab="stats" style="flex:1;padding:8px;background:none;border:none;font-weight:700;cursor:pointer;color:var(--text);border-bottom:2px solid ${activeTab === 'stats' ? 'var(--acc)' : 'transparent'}">📊 Statistiche</button>
        <button type="button" class="ig-tab-btn" data-igtab="tags" style="flex:1;padding:8px;background:none;border:none;font-weight:700;cursor:pointer;color:var(--text);border-bottom:2px solid ${activeTab === 'tags' ? 'var(--acc)' : 'transparent'}">🤝 Tag</button>
      </div>

      <div style="flex:1;overflow-y:auto;padding-right:2px">
        ${activeTab === 'stats' ? statsHtml : (activeTab === 'tags' ? partnersHtml : postsHtml)}
      </div>
    </div>
  `;

  container.style.display = 'flex';
}
