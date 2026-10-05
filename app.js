const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function toast(t) { const m = $('#msg'); if (m) { m.textContent = t; m.classList.add('on'); setTimeout(() => m.classList.remove('on'), 2200); } }

// --- REGISTRAZIONE SERVICE WORKER (PWA) ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW fail:', err));
  });
}

// --- GESTIONE TEMI ---
let currentTheme = localStorage.getItem('partite-theme') || 'default';
function applyTheme(themeName) {
  currentTheme = themeName;
  if (themeName === 'default') document.body.removeAttribute('data-theme');
  else document.body.setAttribute('data-theme', themeName);
  localStorage.setItem('partite-theme', themeName);
}
if (currentTheme !== 'default') applyTheme(currentTheme);

// --- STATO E MEMORIA LOCALE ---
const KEY = 'partite-v1';
let items = [];
try { items = JSON.parse(localStorage.getItem(KEY)) || []; } catch(e){}

let dayMeta = {};
try { dayMeta = JSON.parse(localStorage.getItem('partite-giorni-v1')) || {}; } catch(e){}

let molt = {};
try { molt = JSON.parse(localStorage.getItem('partite-molt-v1')) || {}; } catch(e){}

let names = [];
try { names = JSON.parse(localStorage.getItem('partite-nomi-v1')) || []; } catch(e){}

let categories = [];
try { categories = JSON.parse(localStorage.getItem('partite-categorie-v1')) || []; } catch(e){}

let pinHash = null;
let isDirty = false;

const saveLocalOnly = () => {
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch(e){}
  updateIncompleteBadge();
  updateConflictBadge();
  isDirty = true;
};
const saveDLocalOnly = () => {
  try { localStorage.setItem('partite-giorni-v1', JSON.stringify(dayMeta)); } catch(e){}
  isDirty = true;
};
const saveMoltLocal = () => {
  try { localStorage.setItem('partite-molt-v1', JSON.stringify(molt)); } catch(e){}
  isDirty = true;
};
const saveNamesLocal = () => {
  try { localStorage.setItem('partite-nomi-v1', JSON.stringify(names)); } catch(e){}
  isDirty = true;
};
const saveCategoriesLocal = () => {
  try { localStorage.setItem('partite-categorie-v1', JSON.stringify(categories)); } catch(e){}
  isDirty = true;
};

const save = () => { saveLocalOnly(); scheduleCloudPush(); };
const saveD = () => { saveDLocalOnly(); scheduleCloudPush(); };
const saveMolt = () => { saveMoltLocal(); scheduleCloudPush(); };
const saveNames = () => { saveNamesLocal(); scheduleCloudPush(); };
const saveCategories = () => { saveCategoriesLocal(); scheduleCloudPush(); };

// --- SINCRONIZZAZIONE SUPABASE & INDICATORE STATO ---
const qp = new URLSearchParams(location.search);
let READONLY = qp.get('ro') === '1';
const LINK_TOKEN = qp.get('t') || null;
let syncCfg = null;
try { syncCfg = JSON.parse(localStorage.getItem('partite-sync-cfg')) || null; } catch(e){}
if (READONLY && qp.get('su') && qp.get('sk') && qp.get('sb')) {
  syncCfg = { url: qp.get('su'), key: qp.get('sk'), board: qp.get('sb') };
}
if (LINK_TOKEN && qp.get('su') && qp.get('sk') && qp.get('sb')) {
  syncCfg = { url: qp.get('su'), key: qp.get('sk'), board: qp.get('sb') };
}

let sb = null;
function initSync() {
  sb = null;
  if (syncCfg && window.supabase && syncCfg.url && syncCfg.key && syncCfg.board) {
    try { sb = window.supabase.createClient(syncCfg.url, syncCfg.key); } catch(e){ sb = null; }
  }
}
initSync();

let syncOrangeUntil = 0;
function setSyncVisualState(state, tooltip) {
  const dot = document.getElementById('syncDot');
  const wrap = document.getElementById('syncIndicatorWrap');
  if (!wrap || !dot) return;
  wrap.style.display = 'inline-flex';

  if (state === 'orange') {
    syncOrangeUntil = Date.now() + 3000;
    dot.className = 'sync-dot sync-orange';
    dot.title = tooltip || 'Salvataggio in corso…';
  } else if (state === 'green') {
    const remaining = syncOrangeUntil - Date.now();
    if (remaining > 0) {
      setTimeout(() => {
        dot.className = 'sync-dot sync-green';
        dot.title = tooltip || (sb ? 'Sincronizzato' : 'Salvataggio locale');
      }, remaining);
    } else {
      dot.className = 'sync-dot sync-green';
      dot.title = tooltip || (sb ? 'Sincronizzato' : 'Salvataggio locale');
    }
  } else if (state === 'red') {
    dot.className = 'sync-dot sync-red';
    dot.title = tooltip || 'Errore o disconnesso';
  }
}

async function sha256hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function checkLinkToken() {
  if (!LINK_TOKEN || !sb) return true;
  try {
    const { data, error } = await sb.from('access_links').select('role,label').eq('token', LINK_TOKEN).maybeSingle();
    if (error || !data) return false;
    if (data.role === 'viewer') READONLY = true;
    return true;
  } catch(e) { return false; }
}

async function cloudFetchRaw() {
  if (!sb) return null;
  const { data, error } = await sb.from('partite_board').select('data').eq('id', syncCfg.board).maybeSingle();
  if (error) throw error;
  return data && data.data ? data.data : null;
}

function applyCloudData(raw) {
  items = Array.isArray(raw.items) ? raw.items : [];
  dayMeta = raw.dayMeta && typeof raw.dayMeta === 'object' ? raw.dayMeta : {};
  molt = raw.molt && typeof raw.molt === 'object' ? raw.molt : {};
  names = Array.isArray(raw.names) ? raw.names : [];
  categories = Array.isArray(raw.categories) ? raw.categories : [];
  pinHash = raw.pinHash || null;
  isDirty = false;
  saveLocalOnly(); saveDLocalOnly(); saveMoltLocal(); saveNamesLocal(); saveCategoriesLocal();
  isDirty = false;
  renderNamesList(); renderCategoriesList();
}

async function cloudPushNow() {
  if (!sb || READONLY) return false;
  setSyncVisualState('orange', 'Salvataggio in corso…');
  try {
    const { error } = await sb.from('partite_board').upsert({
      id: syncCfg.board,
      data: { items, dayMeta, molt, names, categories, pinHash },
      updated_at: new Date().toISOString()
    });
    if (error) throw error;
    isDirty = false;
    setSyncVisualState('green', 'Tutte le modifiche sono salvate sul cloud');
    return true;
  } catch (err) {
    setSyncVisualState('red', 'Errore salvataggio: dati salvati solo localmente');
    return false;
  }
}

let syncTimer = null;
function scheduleCloudPush() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(cloudPushNow, 1200);
}

async function cloudPullSafe(silent) {
  if (!sb) return false;
  if (isDirty && !READONLY) {
    await cloudPushNow();
  }
  if (!silent) setSyncVisualState('orange', 'Download aggiornamenti…');
  try {
    const raw = await cloudFetchRaw();
    if (raw) {
      applyCloudData(raw);
      setSyncVisualState('green', 'Sincronizzato');
      return true;
    }
    setSyncVisualState('green', 'Pronto');
    return false;
  } catch(e) {
    setSyncVisualState('red', 'Errore connessione');
    return false;
  }
}

setInterval(() => {
  if (isDirty && sb && !READONLY) {
    cloudPushNow();
  }
}, 5000);

let filterCat = '';
let filterIncomplete = false;

function renderNamesList() {
  const dl = document.getElementById('namesList');
  if (dl) dl.innerHTML = names.map(n => `<option value="${esc(n)}">`).join('');
}

function renderCategoriesList() {
  const dl = document.getElementById('categoriesList');
  if (dl) dl.innerHTML = categories.map(c => `<option value="${esc(c)}">`).join('');
  const sel = document.getElementById('filterCat');
  if (sel) {
    const cur = sel.value;
    sel.innerHTML = '<option value="">Tutte le categorie</option>' + categories.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    sel.value = categories.includes(cur) ? cur : '';
  }
}

function isMissingT1(item) {
  return !(item.t1 && item.t1.trim());
}

function updateIncompleteBadge() {
  const b = document.getElementById('incCount');
  if (!b) return;
  const count = items.filter(isMissingT1).length;
  b.textContent = count ? `(${count})` : '';
}

// --- RILEVATORE AVANZATO CONFLITTI ORARI ---
function findConflictingMatches() {
  const conflicts = new Map(); // matchId -> array di altre gare in conflitto
  const groups = {}; // "YYYY-MM-DD_HH:MM" -> array di items
  
  items.forEach(it => {
    if (it.date && it.time && it.time.trim()) {
      const key = `${it.date}_${it.time.trim()}`;
      (groups[key] ??= []).push(it);
    }
  });

  Object.values(groups).forEach(list => {
    if (list.length > 1) {
      list.forEach(m => {
        const others = list.filter(o => o.id !== m.id);
        conflicts.set(m.id, others);
      });
    }
  });

  return conflicts;
}

function updateConflictBadge() {
  const btn = document.getElementById('conflictAlertBtn');
  if (!btn) return;
  const conflictsMap = findConflictingMatches();
  const count = conflictsMap.size;
  if (count > 0) {
    btn.style.display = 'inline-flex';
    btn.textContent = `❗ ${count}`;
    btn.title = `${count} partite in conflitto di orario! Clicca per visualizzarle.`;
  } else {
    btn.style.display = 'none';
  }
}

function openConflictsModal() {
  const conflictsMap = findConflictingMatches();
  if (!conflictsMap.size) { toast('Nessun conflitto presente'); return; }

  const ov = document.createElement('div');
  ov.className = 'ov';
  ov.id = 'conflictOv';

  // Raggruppa per data/ora
  const grouped = {};
  conflictsMap.forEach((others, myId) => {
    const me = items.find(x => x.id === myId);
    if (!me) return;
    const k = `${me.date} alle ${me.time}`;
    (grouped[k] ??= new Set()).add(me);
  });

  let listHtml = '';
  Object.keys(grouped).sort().forEach(dt => {
    const arr = Array.from(grouped[dt]);
    listHtml += `<div style="margin-bottom:12px;border:1px solid #ef4444;border-radius:8px;padding:8px;background:var(--bg)">
      <div style="font-weight:700;color:#ef4444;font-size:13px;margin-bottom:6px">⚠️ Conflitto: ${dt} (${arr.length} gare simultanee)</div>`;
    arr.forEach(it => {
      listHtml += `<div class="conflict-list-item" data-goto="${it.id}">
        <strong>${esc(it.title || 'Partita senza titolo')}</strong>
        <span style="font-size:12px;color:var(--mute)">Cat: ${esc(it.cat || 'n.d.')} | T1: ${esc(it.t1 || 'Vuoto')}</span>
        <span style="font-size:11px;color:var(--acc);font-weight:600">Tocca per andare alla partita ➔</span>
      </div>`;
    });
    listHtml += `</div>`;
  });

  ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Conflitti di Orario" style="max-height:90vh;overflow-y:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <h3 style="margin:0;color:#ef4444">Conflitti di Orario</h3>
      <button id="confCloseTop" style="min-height:28px;padding:2px 8px">✕</button>
    </div>
    <p style="font-size:13px;color:var(--mute);margin:-4px 0 12px">Le seguenti gare si sovrappongono esattamente allo stesso giorno e orario:</p>
    <div>${listHtml}</div>
    <div class="mbtns" style="margin-top:14px"><button class="primary" id="confClose">Chiudi</button></div>
  </div>`;

  document.body.appendChild(ov);
  ov.addEventListener('click', e => {
    if (e.target === ov) ov.remove();
    const itemEl = e.target.closest('[data-goto]');
    if (itemEl) {
      const targetId = itemEl.dataset.goto;
      ov.remove();
      const targetMatch = items.find(x => x.id === targetId);
      if (targetMatch) {
        setParam('m', targetMatch.date.slice(0, 7));
        setParam('s', iso(monday(targetMatch.date)));
        render(targetId);
      }
    }
  });
  document.getElementById('confClose').onclick = () => ov.remove();
  document.getElementById('confCloseTop').onclick = () => ov.remove();
}

// --- COMPONENTE SELETTORE ORARIO OTTIMIZZATO ---
const COMMON_TIMES = ['09:00', '11:00', '11:15', '11:30', '15:00', '15:30', '17:00', '17:30', '18:00', '20:30', '21:00'];
function buildCustomTimePicker(initialVal) {
  let [h, m] = (initialVal || '15:30').split(':');
  if (!h) h = '15';
  if (!m) m = '30';

  const hoursOpts = Array.from({ length: 16 }, (_, i) => String(i + 8).padStart(2, '0'))
    .map(val => `<option value="${val}"${val === h ? ' selected' : ''}>${val}</option>`).join('');

  const minsOpts = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']
    .map(val => `<option value="${val}"${val === m ? ' selected' : ''}>${val}</option>`).join('');

  const chipsHtml = COMMON_TIMES.map(t => `
    <button type="button" class="time-chip${t === initialVal ? ' active' : ''}" data-timeval="${t}">${t}</button>
  `).join('');

  return `
    <div class="time-picker-box" id="timePickerBox">
      <div class="time-dropdowns">
        <label style="margin:0;font-size:13px;font-weight:700">Ore:</label>
        <select id="pickHour">${hoursOpts}</select>
        <span style="font-size:18px;font-weight:700">:</span>
        <label style="margin:0;font-size:13px;font-weight:700">Min:</label>
        <select id="pickMin">${minsOpts}</select>
        <input type="hidden" id="finalTimeVal" value="${initialVal || '15:30'}">
      </div>
      <div style="font-size:11px;color:var(--mute);text-align:center;font-weight:600">Oppure seleziona un orario frequente:</div>
      <div class="time-chips" id="timeChipsWrap">
        ${chipsHtml}
      </div>
    </div>
  `;
}

function bindTimePickerEvents(container) {
  const pHour = container.querySelector('#pickHour');
  const pMin = container.querySelector('#pickMin');
  const hInput = container.querySelector('#finalTimeVal');
  const chips = container.querySelectorAll('.time-chip');

  const updateFromSelects = () => {
    const val = `${pHour.value}:${pMin.value}`;
    hInput.value = val;
    chips.forEach(c => c.classList.toggle('active', c.dataset.timeval === val));
  };

  pHour.onchange = updateFromSelects;
  pMin.onchange = updateFromSelects;

  chips.forEach(chip => {
    chip.onclick = () => {
      const [newH, newM] = chip.dataset.timeval.split(':');
      pHour.value = newH;
      pMin.value = newM;
      hInput.value = chip.dataset.timeval;
      chips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    };
  });
}

function openMoltModal(name, counts, month) {
  const key = name.toLowerCase(), v = Object.assign({ p: 10, a: 10, c: 10 }, molt[key]);
  const ov = document.createElement('div'); ov.className = 'ov'; ov.id = 'moltOv';
  const calc = () => {
    const gp = +document.getElementById('mp').value || 0, ga = +document.getElementById('ma').value || 0, gc = +document.getElementById('mc').value || 0;
    return counts.p * gp + counts.a * ga + counts.c * gc;
  };
  ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Moltiplicatori">
    <h3>${esc(name)}</h3>
    <div class="frow" style="display:grid;grid-template-columns:1fr 70px;gap:8px;align-items:center"><label for="mp">Partite (${counts.p}) ×</label><input id="mp" type="number" min="0" value="${v.p}"></div>
    <div class="frow" style="display:grid;grid-template-columns:1fr 70px;gap:8px;align-items:center"><label for="ma">Aperture (${counts.a}) ×</label><input id="ma" type="number" min="0" value="${v.a}"></div>
    <div class="frow" style="display:grid;grid-template-columns:1fr 70px;gap:8px;align-items:center"><label for="mc">Chiusure (${counts.c}) ×</label><input id="mc" type="number" min="0" value="${v.c}"></div>
    <div style="display:flex;justify-content:space-between;font-weight:600;margin:10px 0;padding-top:6px;border-top:1px solid var(--line)"><span>Totale</span><span id="mtot">${counts.p * v.p + counts.a * v.a + counts.c * v.c}</span></div>
    <div class="mbtns"><button id="mCancel">Annulla</button><button class="primary" id="mSave">Salva</button></div>
  </div>`;
  document.body.appendChild(ov);
  ov.querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => { document.getElementById('mtot').textContent = calc(); }));
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  document.getElementById('mCancel').onclick = () => ov.remove();
  document.getElementById('mSave').onclick = () => {
    molt[key] = { p: +document.getElementById('mp').value || 0, a: +document.getElementById('ma').value || 0, c: +document.getElementById('mc').value || 0 };
    saveMolt(); ov.remove(); updateRecap(month); toast('Salvati');
  };
  document.getElementById('mp').focus();
}

function exportSelectedMonthsJSON(selectedMonths) {
  const days = {};
  items.filter(i => selectedMonths.some(m => i.date.startsWith(m))).forEach(i => {
    (days[i.date] ??= []).push({ partita: i.title || '', tavolo1: i.t1 || '', tavolo2: i.t2 || '', arbitro: i.arb || '', orario: i.time || '' });
  });
  const out = Object.keys(days).filter(d => days[d].length).sort().map(d => {
    const x = dayMeta[d] || {};
    return {
      data: d,
      apertura: { si: x.ap === 'si', nome: x.ap === 'si' ? (x.apNome || '') : null },
      chiusura: { si: x.ch === 'si', nome: x.ch === 'si' ? (x.chNome || '') : null },
      partite: days[d]
    };
  });
  if (!out.length) { toast('Nessun dato per i mesi selezionati'); return; }
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  const fileName = selectedMonths.length === 1 ? `partite_${selectedMonths[0]}.json` : `partite_multi_${selectedMonths.length}mesi.json`;
  a.download = fileName;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function openExportMultiModal() {
  const months = monthsWithData();
  if (!months.length) { toast('Nessun mese con partite registrate'); return; }
  const ov = document.createElement('div');
  ov.className = 'ov';
  ov.id = 'exportMultiOv';

  const listHtml = months.map(m => `
    <label class="checkbox-item">
      <input type="checkbox" name="mExpChk" value="${m}" checked>
      <span style="font-weight:600">${monthLabel(m)}</span>
    </label>
  `).join('');

  ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Esporta JSON Mesi">
    <h3>Esporta Mesi in JSON</h3>
    <p style="font-size:13px;color:var(--mute);margin:-6px 0 10px">Seleziona i mesi da includere nel file:</p>
    <div style="display:flex;gap:8px;margin-bottom:8px">
      <button type="button" id="chkAllBtn" class="pill-btn-sm">Seleziona tutti</button>
      <button type="button" id="chkNoneBtn" class="pill-btn-sm">Deseleziona tutti</button>
    </div>
    <div id="mChkWrap" style="display:grid;gap:6px;max-height:220px;overflow-y:auto;padding-right:4px">
      ${listHtml}
    </div>
    <div class="mbtns" style="margin-top:14px">
      <button id="expCancel">Annulla</button>
      <button class="primary" id="expDownload">Scarica JSON</button>
    </div>
  </div>`;

  document.body.appendChild(ov);
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  document.getElementById('expCancel').onclick = () => ov.remove();

  document.getElementById('chkAllBtn').onclick = () => {
    ov.querySelectorAll('input[name=mExpChk]').forEach(c => c.checked = true);
  };
  document.getElementById('chkNoneBtn').onclick = () => {
    ov.querySelectorAll('input[name=mExpChk]').forEach(c => c.checked = false);
  };

  document.getElementById('expDownload').onclick = () => {
    const selected = Array.from(ov.querySelectorAll('input[name=mExpChk]:checked')).map(c => c.value);
    if (!selected.length) { toast('Seleziona almeno un mese'); return; }
    exportSelectedMonthsJSON(selected);
    ov.remove();
    toast('File JSON generato');
  };
}

function copyMonthRecapWhatsApp(m) {
  const rows = computeRecapRows(m);
  if (!rows.length) { toast('Nessun dato da riepilogare'); return; }
  const lbl = monthLabel(m).toUpperCase();
  let out = `📊 *RIEPILOGO TURNI — ${lbl}*\n\n`;
  rows.forEach(r => {
    const v = Object.assign({ p: 10, a: 10, c: 10 }, molt[r.n.toLowerCase()]);
    const pv = r.p * v.p, av = r.a * v.a + r.c * v.c, tot = pv + av;
    out += `• *${r.n}*: ${tot}€ (Partite: ${r.p}, Ap/Ch: ${r.a + r.c})\n`;
  });
  out += '\n_Generato dall\'app Partite_';
  try {
    navigator.clipboard.writeText(out);
    toast('Riepilogo del mese copiato per WhatsApp!');
  } catch(e) { prompt('Copia il riepilogo:', out); }
}

function slotHTML(d, k) {
  const label = k === 'ap' ? 'Apertura' : 'Chiusura', wk = dayMeta[d] || {}, v = wk[k] || '';
  return `<div class="slot" data-d="${d}" data-k="${k}"><span class="sl">${label}:</span>
    <div class="yn" role="group"><button data-yn="si" aria-pressed="${v === 'si'}">Sì</button><button data-yn="no" aria-pressed="${v === 'no'}">No</button></div>
    ${v === 'si' ? `<input data-wn list="namesList" value="${esc(wk[k+'Nome'])}" placeholder="Nome">` : ''}</div>`;
}

function computeRecapRows(m) {
  const rec = {}, add = (n, f) => { n = (n || '').trim(); if (!n) return; const k = n.toLowerCase(); (rec[k] ??= { n, p: 0, a: 0, c: 0 })[f]++; };
  const dates = new Set();
  items.filter(i => i.date.startsWith(m) && (!filterCat || i.cat === filterCat)).forEach(i => {
    dates.add(i.date); const seen = new Set();
    [i.t1, i.t2, i.arb].forEach(n => { n = (n || '').trim(); const k = n.toLowerCase(); if (!n || seen.has(k)) return; seen.add(k); add(n, 'p'); });
  });
  dates.forEach(dt => { const x = dayMeta[dt] || {}; if (x.ap === 'si') add(x.apNome, 'a'); if (x.ch === 'si') add(x.chNome, 'c'); });
  return Object.values(rec).sort((a, b) => b.p - a.p || b.a - a.a || a.n.localeCompare(b.n));
}

function recapHTML(m) {
  const rows = computeRecapRows(m);
  return `<aside class="recap" data-m="${m}"><h4>Riepilogo del mese</h4>` + (rows.length
    ? `<table><thead><tr><th>Nome</th><th>Part.</th><th>Ap/Ch</th><th>Totale</th></tr></thead><tbody>${rows.map(r => {
        const v = Object.assign({ p: 10, a: 10, c: 10 }, molt[r.n.toLowerCase()]);
        const pv = r.p * v.p, av = r.a * v.a + r.c * v.c, tot = pv + av;
        return `<tr><td><button class="nb" data-name="${esc(r.n)}" data-p="${r.p}" data-a="${r.a}" data-c="${r.c}" data-m="${m}">${esc(r.n)}</button></td><td>${pv}</td><td>${av}</td><td>${tot}</td></tr>`;
      }).join('')}</tbody></table>`
    : '<p>Nessun dato.</p>') + '</aside>';
}

function updateRecap(m) { const el = document.querySelector(`.recap[data-m="${m}"]`); if (el) el.outerHTML = recapHTML(m); }
const openClose = d => `<div class="oc">${slotHTML(d, 'ap')}${slotHTML(d, 'ch')}</div>`;
const uid = () => Math.random().toString(36).slice(2, 10);
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const monday = s => { const d = new Date(s + 'T12:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };

function closeMenus() {
  document.querySelectorAll('.menuDrop').forEach(d => {
    if (d.hidden) return;
    d.hidden = true;
    const btn = document.getElementById(d.id.replace('Drop', 'Btn'));
    if (btn) btn.setAttribute('aria-expanded', 'false');
  });
}
function initMenu(btnId, dropId) {
  const btn = $('#' + btnId), drop = $('#' + dropId); if (!btn || !drop) return;
  btn.onclick = e => {
    e.stopPropagation();
    const open = drop.hidden;
    closeMenus();
    drop.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  };
  drop.addEventListener('click', e => { if (e.target.closest('button')) closeMenus(); });
}

function encode() { return btoa(unescape(encodeURIComponent(JSON.stringify({ i: items, d: dayMeta })))); }
let pending = null;
function importFromHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const d = p.get('d'); if (!d) return;
  try {
    const x = JSON.parse(decodeURIComponent(escape(atob(d))));
    const inc = Array.isArray(x) ? x : (x.i || []), wi = Array.isArray(x) ? {} : (x.d || {});
    pending = { inc, wi };
    let b = $('#imp');
    if (!b) { b = document.createElement('div'); b.id = 'imp'; b.className = 'imp'; document.querySelector('main').prepend(b); }
    b.innerHTML = `<span>Link con ${inc.length} partite.</span><button class="primary" data-imp="si">Importa</button><button data-imp="no">Ignora</button>`;
  } catch(e) { toast('Dati non validi'); }
  p.delete('d'); writeHash(p);
}

let mem = null;
function params() { return new URLSearchParams(mem !== null ? mem : location.hash.slice(1)); }
function writeHash(p) {
  const s = p.toString();
  try { history.replaceState(null, '', location.pathname + location.search + (s ? '#' + s : '')); mem = null; }
  catch(e) { mem = s; }
}
function setParam(k, v) { const p = params(); v ? p.set(k, v) : p.delete(k); writeHash(p); }

function isU15OrAbove(cat) {
  if (!cat) return false;
  const c = cat.toUpperCase().replace(/\s+/g, '');
  const m = c.match(/^U(\d+)/i);
  if (m) return parseInt(m[1], 10) >= 15;
  return /SERIE|DIVIS|PROMOZ|SENIOR|ECCELL/i.test(cat);
}

// --- CARD DISPLAY-FIRST (CON FLAG CONFLITTO) ---
function card(i, hasConflict) {
  const ghostOn = !READONLY && !!i.ghost;
  const missingT1 = isMissingT1(i);
  const t1Val = (i.t1 && i.t1.trim()) ? esc(i.t1) : '<span class="empty-req">Da assegnare</span>';
  const t2Val = (i.t2 && i.t2.trim()) ? esc(i.t2) : '<span class="empty-opt">—</span>';
  const arbVal = (i.arb && i.arb.trim()) ? esc(i.arb) : '<span class="empty-opt">—</span>';
  const catHtml = i.cat ? `<span class="cat-pill">${esc(i.cat)}</span>` : '';
  const conflictBadge = hasConflict ? `<div class="conflict-badge">⚠️ CONFLITTO ORARIO</div>` : '';

  return `<div class="match${ghostOn ? ' ghost' : ''}${missingT1 ? ' missing-t1' : ''}${hasConflict ? ' conflict-match' : ''}" data-id="${i.id}">
    ${conflictBadge}
    <div class="m-top">
      <div class="m-title" title="${esc(i.title)}">${esc(i.title) || 'Partita (senza nome)'}</div>
      <div class="m-actions">
        ${!READONLY ? `<button class="ghostBtn" data-ghost aria-pressed="${!!i.ghost}" title="Completata">✓</button>` : ''}
        ${!READONLY ? `<button class="editBtn" data-edit title="Modifica dettagli partita">✏️</button>` : ''}
      </div>
    </div>
    <div class="m-meta">
      <div class="m-time">${i.time ? 'Ore ' + i.time : 'Orario n.d.'}</div>
      ${catHtml}
      <div class="m-date">${i.date}</div>
    </div>
    <div class="m-roster">
      <div class="m-row"><span class="lbl">Tavolo 1</span><span class="val">${t1Val}</span></div>
      <div class="m-row"><span class="lbl">Tavolo 2</span><span class="val">${t2Val}</span></div>
      <div class="m-row"><span class="lbl">Arbitro</span><span class="val">${arbVal}</span></div>
    </div>
  </div>`;
}

// --- MODALE MODIFICA PARTITA ---
function openEditModal(matchId) {
  const it = items.find(x => x.id === matchId);
  if (!it) return;

  const ov = document.createElement('div');
  ov.className = 'ov';
  ov.id = 'editModalOv';
  ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Modifica Partita">
    <h3>Modifica Partita</h3>
    <div class="frow"><label for="edDate">Data *</label><input id="edDate" type="date" value="${it.date}"></div>
    
    <div class="frow">
      <label>Orario di Gioco</label>
      ${buildCustomTimePicker(it.time || '15:30')}
    </div>

    <div class="frow"><label for="edTitle">Partita (Squadre)</label><input id="edTitle" type="text" value="${esc(it.title)}"></div>
    <div class="frow"><label for="edCat">Categoria</label><input id="edCat" type="text" list="categoriesList" value="${esc(it.cat)}"></div>
    
    <div style="border-top:1px solid var(--line);margin:12px 0 10px;padding-top:8px">
      <div class="frow"><label for="edT1">Tavolo 1 *</label><input id="edT1" type="text" list="namesList" value="${esc(it.t1)}" placeholder="Nome obbligatorio"></div>
      <div class="frow"><label for="edT2">Tavolo 2</label><input id="edT2" type="text" list="namesList" value="${esc(it.t2)}" placeholder="Nome"></div>
      <div class="frow"><label for="edArb">Arbitro</label><input id="edArb" type="text" list="namesList" value="${esc(it.arb)}" placeholder="Nome"></div>
    </div>

    <div class="mbtns">
      <button id="edDelete" style="background:#fee2e2;border-color:#fca5a5;color:#991b1b;font-weight:600">Elimina Gara</button>
      <div style="display:flex;gap:6px">
        <button id="edCancel">Annulla</button>
        <button class="primary" id="edSave">Salva</button>
      </div>
    </div>
  </div>`;

  document.body.appendChild(ov);
  bindTimePickerEvents(ov);
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  document.getElementById('edCancel').onclick = () => ov.remove();

  const delBtn = document.getElementById('edDelete');
  delBtn.onclick = () => {
    if (delBtn.dataset.arm) {
      pushUndo();
      items = items.filter(x => x.id !== matchId);
      save(); ov.remove(); render();
      toast('Partita eliminata');
    } else {
      delBtn.dataset.arm = '1';
      delBtn.textContent = 'Confermi eliminazione?';
      delBtn.style.background = '#dc2626';
      delBtn.style.color = '#fff';
      setTimeout(() => {
        if (delBtn.isConnected) {
          delete delBtn.dataset.arm;
          delBtn.textContent = 'Elimina Gara';
          delBtn.style.background = '#fee2e2';
          delBtn.style.color = '#991b1b';
        }
      }, 3500);
    }
  };

  document.getElementById('edSave').onclick = () => {
    const newDate = document.getElementById('edDate').value;
    if (!newDate) { toast('La data è obbligatoria'); return; }
    pushUndo();
    it.date = newDate;
    it.time = document.getElementById('finalTimeVal').value;
    it.title = document.getElementById('edTitle').value.trim();
    it.cat = document.getElementById('edCat').value.trim();
    it.t1 = document.getElementById('edT1').value.trim();
    it.t2 = document.getElementById('edT2').value.trim();
    it.arb = document.getElementById('edArb').value.trim();

    save(); ov.remove();
    setParam('m', it.date.slice(0, 7));
    setParam('s', iso(monday(it.date)));
    render(it.id);
    toast('Modifiche salvate');
  };
}

function generateWhatsAppText(startDate, endDate, customTitle) {
  const startStr = iso(startDate), endStr = iso(endDate);
  const filtered = items.filter(i => i.date >= startStr && i.date <= endStr);
  if (!filtered.length) { toast('Nessuna partita programmata in questo periodo'); return; }

  const fmtDayHeader = dStr => new Date(dStr + 'T12:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();
  const fmtShort = d => d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });

  let out = `📅 *${customTitle || `TURNI PARTITE: ${fmtShort(startDate)} – ${fmtShort(endDate)}`}*\n\n`;
  const daysMap = {};
  filtered.forEach(i => (daysMap[i.date] ??= []).push(i));

  Object.keys(daysMap).sort().forEach(dayStr => {
    const arr = daysMap[dayStr];
    arr.sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
    out += `🏀 *${fmtDayHeader(dayStr)}*\n`;
    arr.forEach(it => {
      const timeStr = it.time ? `Ore ${it.time} - ` : '';
      const catStr = it.cat ? `[${it.cat}] ` : '';
      const title = it.title || 'Partita';
      const t1 = it.t1 && it.t1.trim() ? it.t1.trim() : '...';
      const t2 = it.t2 && it.t2.trim() ? it.t2.trim() : '...';

      out += `• ${timeStr}${catStr}${title}\n`;
      out += `  - Tavolo 1: ${t1}\n`;
      out += `  - Tavolo 2: ${t2}\n`;
      if (!isU15OrAbove(it.cat)) {
        const arb = it.arb && it.arb.trim() ? it.arb.trim() : '...';
        out += `  - Arbitro: ${arb}\n`;
      }
      out += '\n';
    });
  });

  out = out.trim();
  try {
    navigator.clipboard.writeText(out);
    toast('Turni copiati per WhatsApp!');
  } catch(e) { prompt('Copia il testo:', out); }
}

function copyWhatsAppRollingToday() {
  const start = new Date();
  start.setHours(12, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  generateWhatsAppText(start, end);
}

function copyWhatsAppFromWeek(wIso) {
  const mon = monday(wIso);
  const start = new Date(mon);
  start.setDate(start.getDate() + 2);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  generateWhatsAppText(start, end);
}

let ready = false;
function render(focusId) {
  ready = false;
  const listEl = $('#list');
  if (!listEl) return;
  const idxOf = new Map(items.map((it, i) => [it.id, i]));
  const p = params(), wantM = p.get('m'), wantW = p.get('s');
  
  const filtered = items.filter(i =>
    (!filterCat || i.cat === filterCat) &&
    (!filterIncomplete || isMissingT1(i))
  );
  const sorted = [...filtered].sort((a, b) => a.date.localeCompare(b.date));
  const months = {};
  sorted.forEach(i => { const m = i.date.slice(0, 7); const w = iso(monday(i.date)); ((months[m] ??= {})[w] ??= []).push(i); });
  const keys = Object.keys(months).sort();
  if (!keys.length) {
    listEl.innerHTML = '<div class="empty">Nessuna partita trovata. Tocca “+ Partita” per iniziare.</div>';
    updateIncompleteBadge();
    updateConflictBadge();
    return;
  }
  const nowM = iso(new Date()).slice(0, 7);
  const open = wantM && months[wantM] ? wantM : (months[nowM] ? nowM : keys[keys.length - 1]);
  const fmt = (d, o) => d.toLocaleDateString('it-IT', o);

  const conflictsMap = findConflictingMatches();

  listEl.innerHTML = keys.map(m => {
    const label = fmt(new Date(m + '-15T12:00'), { month: 'long', year: 'numeric' });
    const count = Object.values(months[m]).reduce((n, a) => n + a.length, 0);
    const wkHtml = Object.keys(months[m]).sort().map(w => {
      const a = monday(w), b = new Date(a); b.setDate(b.getDate() + 6);
      const list = months[m][w], isOpen = wantW ? wantW === w : iso(monday(iso(new Date()))) === w;
      const days = {}; list.forEach(i => (days[i.date] ??= []).push(i));
      Object.values(days).forEach(arr => arr.sort((a, b) => {
        if (!a.time && !b.time) return (b.ts ?? idxOf.get(b.id)) - (a.ts ?? idxOf.get(a.id));
        if (!a.time) return -1;
        if (!b.time) return 1;
        return a.time.localeCompare(b.time);
      }));
      const dayHtml = Object.keys(days).sort().map(dt => `<div class="day"><h4>${fmt(new Date(dt + 'T12:00'), { weekday: 'short', day: 'numeric', month: 'short' })}</h4>${openClose(dt)}<div class="matches">${days[dt].map(it => card(it, conflictsMap.has(it.id))).join('')}</div></div>`).join('');
      return `<details class="week${wantW === w ? ' hl' : ''}" id="w-${w}" data-m="${m}" data-w="${w}"${isOpen ? ' open' : ''}><summary><span class="t">Settimana ${fmt(a, { day: 'numeric', month: 'short' })} – ${fmt(b, { day: 'numeric', month: 'short' })}</span><span class="n">${list.length} ${list.length === 1 ? 'gara' : 'gare'}<button class="waBtn" data-wamsg="${w}" type="button" title="Copia turni (da mercoledì al mercoledì dopo)">📲 WA</button></span></summary>${dayHtml}</details>`;
    }).join('');
    return `<details class="month" data-m="${m}"${m === open ? ' open' : ''}><summary><span class="t">${label}<button class="waBtn" data-warecap="${m}" type="button" title="Copia il riepilogo dei gettoni del mese per WhatsApp">📲 WA Riepilogo</button></span><span class="n">${count} gare</span></summary><div class="mbody">${recapHTML(m)}<div class="mweeks">${wkHtml}</div></div></details>`;
  }).join('');
  setTimeout(() => { ready = true; }, 150);
  updateIncompleteBadge();
  updateConflictBadge();
  if (wantW) { const el = document.getElementById('w-' + wantW); if (el) el.scrollIntoView({ block: 'start' }); }
  if (focusId) {
    const el = document.querySelector(`[data-id="${focusId}"]`);
    if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }
}

// Input slot per apertura/chiusura
document.addEventListener('input', e => {
  if (READONLY) return;
  if (e.target.matches('[data-wn]')) {
    const sl = e.target.closest('.slot'); (dayMeta[sl.dataset.d] ??= {})[sl.dataset.k + 'Nome'] = e.target.value; saveD(); updateRecap(sl.dataset.d.slice(0, 7)); return;
  }
});

document.addEventListener('click', e => {
  const gh = e.target.closest('[data-ghost]');
  if (gh && !READONLY) {
    e.stopPropagation();
    const id = gh.closest('.match').dataset.id;
    const it = items.find(x => x.id === id); if (!it) return;
    pushUndo(); it.ghost = !it.ghost; save(); render();
    return;
  }

  const editBtn = e.target.closest('[data-edit]');
  if (editBtn && !READONLY) {
    e.stopPropagation();
    const id = editBtn.closest('.match')?.dataset?.id;
    if (id) openEditModal(id);
    return;
  }
  const matchCard = e.target.closest('.match');
  if (matchCard && !READONLY && !e.target.closest('button')) {
    openEditModal(matchCard.dataset.id);
    return;
  }

  const warecap = e.target.closest('[data-warecap]');
  if (warecap) {
    e.preventDefault(); e.stopPropagation();
    copyMonthRecapWhatsApp(warecap.dataset.warecap);
    return;
  }

  const wa = e.target.closest('[data-wamsg]');
  if (wa) {
    e.preventDefault(); e.stopPropagation();
    copyWhatsAppFromWeek(wa.dataset.wamsg);
    return;
  }

  const yn = e.target.closest('[data-yn]');
  if (yn && !READONLY) {
    const sl = yn.closest('.slot'), d = sl.dataset.d, k = sl.dataset.k, wk = (dayMeta[d] ??= {});
    pushUndo(); wk[k] = yn.dataset.yn; if (wk[k] === 'no') delete wk[k + 'Nome']; saveD(); updateRecap(d.slice(0, 7));
    sl.outerHTML = slotHTML(d, k);
    if (wk[k] === 'si') { const n = document.querySelector(`.slot[data-d="${d}"][data-k="${k}"] input`); if (n) n.focus(); }
    return;
  }

  const nb = e.target.closest('[data-name]');
  if (nb) { openMoltModal(nb.dataset.name, { p: +nb.dataset.p, a: +nb.dataset.a, c: +nb.dataset.c }, nb.dataset.m); return; }
  const im = e.target.closest('[data-imp]');
  if (im) {
    if (im.dataset.imp === 'si' && pending) {
      pushUndo();
      const map = new Map(items.map(i => [i.id, i])); pending.inc.forEach(i => map.set(i.id, i));
      items = [...map.values()]; save(); Object.assign(dayMeta, pending.wi); saveD();
    }
    pending = null; $('#imp')?.remove(); render();
  }
});

document.addEventListener('toggle', e => {
  if (!ready || !e.target.open) return;
  if (e.target.matches('details.month')) { setParam('m', e.target.dataset.m); setParam('s', ''); }
  else if (e.target.matches('details.week')) { setParam('m', e.target.dataset.m); setParam('s', e.target.dataset.w); }
}, true);

function openAddModal() {
  const ov = document.createElement('div'); ov.className = 'ov'; ov.id = 'addOv';
  ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Nuova partita">
    <h3>Nuova partita</h3>
    <div class="frow"><label for="nDate">Data *</label><input id="nDate" type="date" value="${iso(new Date())}"></div>
    
    <div class="frow">
      <label>Orario di Gioco</label>
      ${buildCustomTimePicker('15:30')}
    </div>

    <div class="frow"><label for="nTitle">Partita</label><input id="nTitle" type="text" placeholder="Es. Squadra A – Squadra B"></div>
    <div class="frow"><label for="nCat">Categoria</label><input id="nCat" type="text" list="categoriesList" placeholder="Es. U17"></div>
    <div class="frow"><label for="nT1">Tavolo 1</label><input id="nT1" type="text" list="namesList" placeholder="Nome"></div>
    <div class="frow"><label for="nT2">Tavolo 2</label><input id="nT2" type="text" list="namesList" placeholder="Nome"></div>
    <div class="frow"><label for="nArb">Arbitro</label><input id="nArb" type="text" list="namesList" placeholder="Nome"></div>
    <p class="err" id="nErr">Inserisci almeno la data.</p>
    <div class="mbtns"><button id="nCancel">Annulla</button><button class="primary" id="nSave">Aggiungi</button></div>
  </div>`;
  document.body.appendChild(ov);
  bindTimePickerEvents(ov);
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  document.getElementById('nCancel').onclick = () => ov.remove();
  document.getElementById('nSave').onclick = () => {
    const date = document.getElementById('nDate').value;
    if (!date) { document.getElementById('nErr').classList.add('on'); document.getElementById('nDate').focus(); return; }
    const time = document.getElementById('finalTimeVal').value;
    const it = { id: uid(), title: document.getElementById('nTitle').value, date, time, cat: document.getElementById('nCat').value,
      t1: document.getElementById('nT1').value, t2: document.getElementById('nT2').value, arb: document.getElementById('nArb').value, ts: Date.now() };
    pushUndo(); items.push(it); save(); ov.remove();
    setParam('m', it.date.slice(0, 7)); setParam('s', iso(monday(it.date))); render(it.id);
  };
  document.getElementById('nDate').focus();
}

// --- MODALE RESOCONTO STAGIONALE ---
function openResocontoModal() {
  const months = monthsWithData();
  const ov = document.createElement('div');
  ov.className = 'ov';
  ov.id = 'resocontoOv';

  const grandTotal = {};
  let totalSpentGeneral = 0;

  months.forEach(m => {
    const rows = computeRecapRows(m);
    rows.forEach(r => {
      const k = r.n.toLowerCase();
      const v = Object.assign({ p: 10, a: 10, c: 10 }, molt[k]);
      const tot = (r.p * v.p) + ((r.a + r.c) * v.a);
      if (!grandTotal[k]) grandTotal[k] = { n: r.n, p: 0, ac: 0, tot: 0 };
      grandTotal[k].p += r.p;
      grandTotal[k].ac += (r.a + r.c);
      grandTotal[k].tot += tot;
      totalSpentGeneral += tot;
    });
  });

  const grandRows = Object.values(grandTotal).sort((a, b) => b.tot - a.tot || a.n.localeCompare(b.n));

  const grandTableHtml = grandRows.length
    ? `<table>
        <thead><tr><th>Nome</th><th>Partite</th><th>Ap/Ch</th><th>Totale Spettante</th></tr></thead>
        <tbody>
          ${grandRows.map(r => `<tr><td><strong>${esc(r.n)}</strong></td><td>${r.p}</td><td>${r.ac}</td><td><strong>${r.tot}€</strong></td></tr>`).join('')}
          <tr style="border-top:2px solid var(--ink);font-weight:700"><td>TOTALE GENERALE</td><td colspan="2"></td><td>${totalSpentGeneral}€</td></tr>
        </tbody>
      </table>`
    : '<p>Nessun dato registrato nella stagione.</p>';

  const monthsBlocksHtml = months.map(m => {
    const rows = computeRecapRows(m);
    let monthSum = 0;
    const table = rows.length
      ? `<table>
          <thead><tr><th>Nome</th><th>Part.</th><th>Ap/Ch</th><th>Totale</th></tr></thead>
          <tbody>
            ${rows.map(r => {
              const v = Object.assign({ p: 10, a: 10, c: 10 }, molt[r.n.toLowerCase()]);
              const tot = (r.p * v.p) + ((r.a + r.c) * v.a);
              monthSum += tot;
              return `<tr><td>${esc(r.n)}</td><td>${r.p}</td><td>${r.a + r.c}</td><td>${tot}€</td></tr>`;
            }).join('')}
            <tr style="border-top:1px solid var(--line);font-weight:700"><td>Totale Mese</td><td colspan="2"></td><td>${monthSum}€</td></tr>
          </tbody>
        </table>`
      : '<p style="color:var(--mute);font-size:12px">Nessuna partita.</p>';

    return `<details class="res-month-block">
      <summary style="display:flex;justify-content:space-between;align-items:center">
        <span>${monthLabel(m)}</span>
        <button class="waBtn" data-warecap="${m}" type="button">📲 WA</button>
      </summary>
      <div style="margin-top:6px">${table}</div>
    </details>`;
  }).join('');

  ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Resoconto Generale" style="max-height:90vh;overflow-y:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h3 style="margin:0">Resoconto Stagionale</h3>
      <button id="resCloseTop" style="min-height:28px;padding:2px 8px">✕</button>
    </div>
    
    <div class="grand-total-box">
      <h4>Totale Generale Compensi</h4>
      ${grandTableHtml}
    </div>

    <h4 style="margin:14px 0 8px;font:700 16px var(--font-title);color:var(--mute);text-transform:uppercase">Dettaglio Singoli Mesi</h4>
    <div class="resoconto-months">
      ${monthsBlocksHtml}
    </div>

    <div class="mbtns" style="margin-top:16px"><button class="primary" id="resClose">Chiudi</button></div>
  </div>`;

  document.body.appendChild(ov);
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  document.getElementById('resClose').onclick = () => ov.remove();
  document.getElementById('resCloseTop').onclick = () => ov.remove();
}

function fromExportFormat(arr) {
  const newItems = [], wi = {};
  arr.forEach(day => {
    const d = day && day.data; if (!d) return;
    wi[d] = {
      ap: (day.apertura && day.apertura.si) ? 'si' : 'no',
      apNome: (day.apertura && day.apertura.si) ? (day.apertura.nome || '') : '',
      ch: (day.chiusura && day.chiusura.si) ? 'si' : 'no',
      chNome: (day.chiusura && day.chiusura.si) ? (day.chiusura.nome || '') : ''
    };
    (day.partite || []).forEach(p => {
      newItems.push({ id: uid(), date: d, title: p.partita || '', t1: p.tavolo1 || '', t2: p.tavolo2 || '', arb: p.arbitro || '', time: p.orario || '' });
    });
  });
  return { newItems, wi };
}
function monthsWithData() {
  const s = new Set();
  items.forEach(i => s.add(i.date.slice(0, 7)));
  Object.keys(dayMeta).forEach(d => s.add(d.slice(0, 7)));
  return [...s].sort();
}
function monthLabel(m) { return new Date(m + '-15T12:00').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }); }

function genToken() {
  const b = new Uint8Array(12); crypto.getRandomValues(b);
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}
function buildAccessLink(token) {
  const p = new URLSearchParams(); p.set('t', token); p.set('su', syncCfg.url); p.set('sk', syncCfg.key); p.set('sb', syncCfg.board);
  return location.origin + location.pathname + '?' + p.toString();
}

// --- ESTRATTORE AVANZATO PDF FIP / UISP ---
async function pdfToLines(file) {
  if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;
  const lines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const rows = {};
    tc.items.forEach(it => {
      const y = Math.round(it.transform[5] / 3) * 3;
      (rows[y] = rows[y] || []).push(it);
    });
    Object.keys(rows).map(Number).sort((a, b) => b - a).forEach(y => {
      const txt = rows[y].sort((a, b) => a.transform[4] - b.transform[4]).map(it => it.str).join(' ').replace(/\s+/g, ' ').trim();
      if (txt) lines.push(txt);
    });
  }
  return lines;
}

function normName(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function extractHomeMatches(lines, teamName) {
  const needle = normName(teamName);
  const out = [];
  
  let detectedCat = '';
  for (let l of lines.slice(0, 15)) {
    const m = l.match(/Under\s*(\d{1,2})|U\s*(\d{1,2})|Serie\s*([A-D])|Divisione/i);
    if (m) {
      if (m[1] || m[2]) detectedCat = 'U' + (m[1] || m[2]);
      else if (m[3]) detectedCat = 'Serie ' + m[3].toUpperCase();
      break;
    }
  }

  const dtRegex = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:[\s\-–—T]+(\d{1,2}:\d{2}))?\b/;

  for (let i = 0; i < lines.length; i++) {
    const lineNorm = normName(lines[i]);
    
    if (needle && lineNorm.includes(needle)) {
      const homeTeam = lines[i].replace(/^\d+\s*/, '').trim();
      let awayTeam = '';
      let matchDate = null;
      let matchTime = '';

      for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
        const nextLine = lines[j].trim();
        
        const dtMatch = nextLine.match(dtRegex);
        if (dtMatch && !matchDate) {
          let [, d, mo, y, t] = dtMatch;
          if (y.length === 2) y = '20' + y;
          matchDate = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
          if (t) matchTime = t;
        }

        if (!awayTeam && nextLine && !dtMatch && !nextLine.match(/^(Palestra|PALASPORT|PALABURSI|PALAZZETTO|Via|pag\.|00\d{4}|\d+ Giornata)/i)) {
          if (!nextLine.match(/^\d+[\s\-]+\d+$/) && !nextLine.includes('(')) {
            awayTeam = nextLine.replace(/^\d+\s*/, '').trim();
          }
        }
      }

      if (!matchDate) {
        const dtMatch = lines[i].match(dtRegex);
        if (dtMatch) {
          let [, d, mo, y, t] = dtMatch;
          if (y.length === 2) y = '20' + y;
          matchDate = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
          if (t) matchTime = t;
        }
      }

      if (matchDate) {
        out.push({
          date: matchDate,
          time: matchTime,
          title: (homeTeam + ' - ' + (awayTeam || 'Avversario')).replace(/\s+/g, ' '),
          cat: detectedCat
        });
      }
    }
  }

  const unique = [];
  const seen = new Set();
  for (let it of out) {
    const k = it.date + '_' + it.time + '_' + it.title;
    if (!seen.has(k)) {
      seen.add(k);
      unique.push(it);
    }
  }
  return unique;
}

let pdfCandidates = [];
function renderPdfPreview() {
  const wrap = document.getElementById('pdfPreviewWrap'); if (!wrap) return;
  if (!pdfCandidates.length) { 
    wrap.innerHTML = '<p style="color:var(--warn);font-size:13px;padding:6px 0">Nessuna gara in casa trovata per la squadra indicata.</p>'; 
    return; 
  }
  wrap.innerHTML = `<p style="color:var(--mute);font-size:12px;margin:4px 0 8px">Trovate ${pdfCandidates.length} gare in casa:</p>` +
    pdfCandidates.map((c, i) => `<div style="border-bottom:1px solid var(--line);padding:8px 0;display:flex;flex-direction:column;gap:6px">
    <input data-pf="title" data-pi="${i}" value="${esc(c.title)}" style="font-weight:700">
    <div style="display:flex;gap:6px">
      <input data-pf="date" data-pi="${i}" type="date" value="${c.date || ''}" style="flex:1">
      <input data-pf="time" data-pi="${i}" type="time" value="${c.time || ''}" style="width:95px" title="Orario">
      <input data-pf="cat" data-pi="${i}" list="categoriesList" value="${esc(c.cat)}" placeholder="Cat." style="width:75px">
      <button data-pf="rm" data-pi="${i}" style="min-height:34px;padding:0 10px" title="Rimuovi">✕</button>
    </div>
  </div>`).join('');
}

$('#pdfImportBtn').onclick = () => {
  const ov = document.createElement('div'); ov.className = 'ov'; ov.id = 'pdfOv';
  ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Importa PDF">
    <h3>Importa da PDF</h3>
    <div class="frow"><label for="pdfFile">File PDF</label><input id="pdfFile" type="file" accept="application/pdf,.pdf"></div>
    <div class="frow"><label for="pdfTeam">Nome squadra di casa</label><input id="pdfTeam" type="text" placeholder="Es. VIS ACADEMY PERSICETO"></div>
    <div class="mbtns"><button id="pdfCancel">Annulla</button><button class="primary" id="pdfGo">Estrai</button></div>
    <div id="pdfPreviewWrap" style="margin-top:10px;max-height:220px;overflow-y:auto"></div>
    <div class="mbtns" id="pdfConfirmBtns" style="display:none;margin-top:10px"><button id="pdfAddAll" class="primary" style="width:100%">Aggiungi al calendario</button></div>
  </div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click', e => {
    if (e.target === ov) { ov.remove(); return; }
    const rm = e.target.closest('[data-pf="rm"]');
    if (rm) { pdfCandidates.splice(+rm.dataset.pi, 1); renderPdfPreview(); return; }
  });
  ov.addEventListener('input', e => {
    const f = e.target.dataset.pf; if (!f || f === 'rm') return;
    pdfCandidates[+e.target.dataset.pi][f] = e.target.value;
  });
  document.getElementById('pdfCancel').onclick = () => ov.remove();
  document.getElementById('pdfGo').onclick = async () => {
    const file = document.getElementById('pdfFile').files[0];
    const team = document.getElementById('pdfTeam').value.trim();
    if (!file || !team) { toast('Inserisci file e nome squadra'); return; }
    if (!window.pdfjsLib) { toast('Libreria non caricata'); return; }
    const btn = document.getElementById('pdfGo'); btn.disabled = true; btn.textContent = 'Estrazione…';
    try {
      const lines = await pdfToLines(file);
      pdfCandidates = extractHomeMatches(lines, team);
      document.getElementById('pdfConfirmBtns').style.display = pdfCandidates.length ? 'flex' : 'none';
      renderPdfPreview();
    } catch(e) { toast('Errore lettura file'); }
    btn.disabled = false; btn.textContent = 'Estrai';
  };
  document.getElementById('pdfAddAll').onclick = () => {
    const valid = pdfCandidates.filter(c => c.date);
    pushUndo();
    valid.forEach(c => {
      items.push({ 
        id: uid(), 
        title: c.title, 
        date: c.date, 
        time: c.time || '', 
        cat: c.cat || '', 
        t1: '', t2: '', arb: '', 
        ts: Date.now() 
      });
    });
    save(); 
    ov.remove(); 
    render();
    toast(`${valid.length} gare aggiunte`);
  };
};

// --- LOGICA ANNULLA & TASTI RAPIDI ---
let undoStack = [];
function pushUndo() {
  undoStack.push(JSON.stringify({ items, dayMeta }));
  if (undoStack.length > 20) undoStack.shift();
  refreshUndoBtn();
}
function refreshUndoBtn() { const b = $('#undoBtn'); if (b) b.disabled = !undoStack.length; }
function performUndo() {
  if (!undoStack.length) { toast('Niente da annullare'); return; }
  const prev = JSON.parse(undoStack.pop());
  items = prev.items; dayMeta = prev.dayMeta;
  save(); saveD();
  refreshUndoBtn(); render();
  toast('Annullato');
}

window.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    if (e.shiftKey) return;
    e.preventDefault();
    performUndo();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    cloudPushNow().then(() => toast('Modifiche salvate sul cloud'));
  }
});

function generateMonthPDF(m) {
  if (!(window.jspdf && window.jspdf.jsPDF)) { toast('Libreria non caricata'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight();
  const ml = 40, mr = 40, mt = 48, mb = 40; let y = mt;
  const nl = (h = 14) => { y += h; if (y > ph - mb) { doc.addPage(); y = mt; } };

  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text('Partite — ' + monthLabel(m), ml, y);
  nl(24); doc.setDrawColor(200); doc.line(ml, y, pw - mr, y); nl(16);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text('Riepilogo del mese', ml, y); nl(16);

  const rows = computeRecapRows(m);
  doc.setFontSize(10);
  if (!rows.length) { doc.setFont('helvetica', 'normal'); doc.text('Nessun dato.', ml, y); nl(16); }
  else {
    const cols = [{ w: 170, h: 'Nome' }, { w: 90, h: 'Partite' }, { w: 110, h: 'Apert./Chius.' }, { w: 80, h: 'Totale' }];
    doc.setFont('helvetica', 'bold'); let x = ml; cols.forEach(c => { doc.text(c.h, x, y); x += c.w; }); nl(14);
    doc.setDrawColor(220); doc.line(ml, y - 10, pw - mr, y - 10);
    doc.setFont('helvetica', 'normal');
    rows.forEach(r => {
      const v = Object.assign({ p: 10, a: 10, c: 10 }, molt[r.n.toLowerCase()]);
      const pv = r.p * v.p, av = r.a * v.a + r.c * v.c, tot = pv + av;
      let x = ml;
      [r.n, String(pv), String(av), String(tot)].forEach((t, i) => { doc.text(t, x, y); x += cols[i].w; });
      nl(15);
    });
  }
  nl(10);
  const days = {};
  items.filter(i => i.date.startsWith(m)).forEach(i => (days[i.date] ??= []).push(i));
  Object.keys(dayMeta).filter(d => d.startsWith(m)).forEach(d => { if (!days[d]) days[d] = []; });
  const dateKeys = Object.keys(days).sort();
  dateKeys.forEach(dt => {
    const list = days[dt]; if (!list.length) return;
    const x = dayMeta[dt] || {};
    doc.setDrawColor(210); doc.line(ml, y, pw - mr, y); nl(16);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text(new Date(dt + 'T12:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }), ml, y);
    nl(14);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    const ap = x.ap === 'si' ? ('Apertura: sì (' + (x.apNome || '—') + ')') : 'Apertura: no';
    const ch = x.ch === 'si' ? ('Chiusura: sì (' + (x.chNome || '—') + ')') : 'Chiusura: no';
    doc.text(ap + '    ' + ch, ml, y); nl(16);
    list.forEach(it => {
      doc.setFont('helvetica', 'bold'); doc.text(`• ${it.time ? it.time + ' - ' : ''}${it.title || '(senza titolo)'}`, ml + 6, y); nl(13);
      doc.setFont('helvetica', 'normal');
      doc.text(`Tavolo 1: ${it.t1 || '—'}    Tavolo 2: ${it.t2 || '—'}    Arbitro: ${it.arb || '—'}`, ml + 16, y);
      nl(16);
    });
    nl(4);
  });
  doc.save('partite_' + m + '.pdf');
  toast('PDF scaricato');
}

function showLock(hash) {
  return new Promise(resolve => {
    const ov = document.createElement('div'); ov.className = 'ov'; ov.id = 'lockOv';
    ov.innerHTML=`<div class="modal" role="dialog" aria-modal="true" aria-label="PIN richiesto">
      <h3>Inserisci il PIN</h3>
      <div class="frow"><label for="lockPin">Accesso protetto da codice.</label><input id="lockPin" type="password" inputmode="numeric" autofocus></div>
      <p class="err" id="lockErr">PIN non corretto.</p>
      <div class="mbtns"><button class="primary" id="lockGo">Entra</button></div>
    </div>`;
    document.body.appendChild(ov);
    const go = async () => {
      const v = document.getElementById('lockPin').value;
      const h = await sha256hex(v);
      if (h === hash) {
        try { sessionStorage.setItem('partite-unlocked-' + syncCfg.board, hash); } catch(e){}
        ov.remove(); resolve(true);
      } else {
        document.getElementById('lockErr').classList.add('on');
        document.getElementById('lockPin').value = ''; document.getElementById('lockPin').focus();
      }
    };
    document.getElementById('lockGo').onclick = go;
    document.getElementById('lockPin').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    document.getElementById('lockPin').focus();
  });
}
function showInvalidLink() {
  document.body.innerHTML = '<main style="max-width:420px;text-align:center;padding-top:80px"><h1 style="font-size:24px">Link non valido</h1><p style="color:var(--mute)">Questo link è stato revocato o non esiste.</p></main>';
}

// --- BIND DEGLI EVENTI ---
function bindEvents() {
  const themeBtn = $('#themeBtn');
  if (themeBtn) {
    themeBtn.onclick = () => {
      const ov = document.createElement('div'); ov.className = 'ov'; ov.id = 'themeOv';
      ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Scegli Tema">
        <h3>Tema / Stile</h3>
        <div class="frow">
          <label for="themeSelectModal">Seleziona aspetto grafico</label>
          <select id="themeSelectModal" style="width:100%;min-height:36px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--ink);padding:6px;font:inherit">
            <option value="default"${currentTheme === 'default' ? ' selected' : ''}>🎨 Standard (Auto Dark/Light)</option>
            <option value="synthwave"${currentTheme === 'synthwave' ? ' selected' : ''}>🕹 Synthwave 80s (Arcade Neon)</option>
            <option value="gazzetta"${currentTheme === 'gazzetta' ? ' selected' : ''}>📰 Gazzetta Rosa (Vintage)</option>
            <option value="tv"${currentTheme === 'tv' ? ' selected' : ''}>📺 Tabellone TV (Alto Contrasto)</option>
          </select>
        </div>
        <div class="mbtns"><button id="themeClose" class="primary">Fatto</button></div>
      </div>`;
      document.body.appendChild(ov);
      ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
      document.getElementById('themeSelectModal').onchange = e => applyTheme(e.target.value);
      document.getElementById('themeClose').onclick = () => ov.remove();
    };
  }

  // Tasti rapidi di sincronizzazione Header
  const qSave = $('#quickSaveBtn');
  if (qSave) qSave.onclick = async () => {
    const ok = await cloudPushNow();
    toast(ok ? 'Salvataggio completato!' : 'Errore durante il salvataggio');
  };

  const qPull = $('#quickPullBtn');
  if (qPull) qPull.onclick = async () => {
    await cloudPullSafe(false);
    render();
    toast('Dati aggiornati!');
  };

  // Tasto Allarme Conflitti (Punto Esclamativo)
  const confAlertBtn = $('#conflictAlertBtn');
  if (confAlertBtn) confAlertBtn.onclick = openConflictsModal;

  // Modale esporta JSON multi-mese
  const expMulti = $('#exportMultiJsonBtn');
  if (expMulti) expMulti.onclick = openExportMultiModal;

  const resBtn = $('#resocontoBtn');
  if (resBtn) resBtn.onclick = openResocontoModal;

  const addBtn = $('#add');
  if (addBtn) addBtn.onclick = openAddModal;

  const waToday = $('#waTodayBtn');
  if (waToday) waToday.onclick = () => copyWhatsAppRollingToday();

  const undoB = $('#undoBtn');
  if (undoB) { undoB.disabled = true; undoB.onclick = performUndo; }

  const todayB = $('#todayBtn');
  if (todayB) {
    todayB.onclick = () => {
      const t = iso(new Date());
      setParam('m', t.slice(0, 7)); setParam('s', iso(monday(t)));
      render();
      setTimeout(() => { const el = document.getElementById('w-' + iso(monday(t))); if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 0);
    };
  }

  const fCat = $('#filterCat');
  if (fCat) fCat.onchange = e => { filterCat = e.target.value; render(); };

  const fInc = $('#filterIncomplete');
  if (fInc) {
    fInc.onclick = e => {
      filterIncomplete = !filterIncomplete;
      e.target.setAttribute('aria-pressed', String(filterIncomplete));
      render();
    };
  }

  const syncB = $('#syncBtn');
  if (syncB) {
    syncB.onclick = () => {
      const c = syncCfg || { url: '', key: '', board: 'partite' };
      const ov = document.createElement('div'); ov.className = 'ov'; ov.id = 'syncOv';
      ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Sincronizzazione">
        <h3>Sincronizzazione</h3>
        <div class="frow"><label for="sUrl">Project URL</label><input id="sUrl" type="text" placeholder="https://xxxx.supabase.co" value="${esc(c.url)}"></div>
        <div class="frow"><label for="sKey">Chiave anon (public)</label><input id="sKey" type="text" placeholder="eyJhbGciOi..." value="${esc(c.key)}"></div>
        <div class="frow"><label for="sBoard">Nome scheda condivisa</label><input id="sBoard" type="text" placeholder="partite" value="${esc(c.board)}"></div>
        <div class="frow"><label for="sPin">PIN di accesso (opzionale)</label><input id="sPin" type="password" inputmode="numeric" placeholder="${pinHash ? 'Attivo' : 'Nessun PIN'}"></div>
        <div class="mbtns"><button id="sOff">Disattiva</button><button id="sCancel">Annulla</button><button class="primary" id="sSave">Salva</button></div>
      </div>`;
      document.body.appendChild(ov);
      ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
      document.getElementById('sCancel').onclick = () => ov.remove();
      document.getElementById('sOff').onclick = () => {
        syncCfg = null; localStorage.removeItem('partite-sync-cfg'); initSync();
        setSyncVisualState('red'); ov.remove(); toast('Disattivata');
      };
      document.getElementById('sSave').onclick = async () => {
        const url = document.getElementById('sUrl').value.trim(), key = document.getElementById('sKey').value.trim(), board = document.getElementById('sBoard').value.trim();
        const newPin = document.getElementById('sPin').value.trim();
        if (!url || !key || !board) { toast('Compila i campi'); return; }
        syncCfg = { url, key, board }; localStorage.setItem('partite-sync-cfg', JSON.stringify(syncCfg));
        initSync(); ov.remove();
        if (!sb) { toast('Configurazione fallita'); return; }
        const found = await cloudPullSafe(false);
        if (newPin) {
          pinHash = await sha256hex(newPin);
          try { sessionStorage.setItem('partite-unlocked-' + syncCfg.board, pinHash); } catch(e){}
        }
        if (!found || newPin) cloudPushNow();
        render();
      };
    };
  }

  const roB = $('#roBtn');
  if (roB) {
    roB.onclick = async () => {
      if (!syncCfg) { toast('Configura prima la sincronizzazione'); return; }
      const p = new URLSearchParams(); p.set('ro', '1'); p.set('su', syncCfg.url); p.set('sk', syncCfg.key); p.set('sb', syncCfg.board);
      const url = location.origin + location.pathname + '?' + p.toString() + location.hash;
      try { await navigator.clipboard.writeText(url); toast('Link copiato'); } catch(e) { prompt('Copia il link:', url); }
    };
  }

  const namesB = $('#namesBtn');
  if (namesB) {
    namesB.onclick = () => {
      const ov = document.createElement('div'); ov.className = 'ov'; ov.id = 'namesOv';
      const rowsHtml = () => names.length
        ? names.map(n => `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--line)"><span>${esc(n)}</span><button data-rmname="${esc(n)}" style="min-height:26px;padding:2px 8px;font-size:12px">✕</button></div>`).join('')
        : '<p style="color:var(--mute);font-size:13px;margin:4px 0">Nessun nome inserito.</p>';
      ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Nomi">
        <h3>Elenco nomi</h3>
        <div id="namesListWrap" style="max-height:220px;overflow-y:auto;margin-bottom:8px">${rowsHtml()}</div>
        <div class="frow" style="display:flex;gap:6px"><input id="newNameInput" type="text" placeholder="Nuovo nome" style="flex:1"><button class="primary" id="addNameBtn">Aggiungi</button></div>
        <div class="mbtns"><button id="namesClose">Chiudi</button></div>
      </div>`;
      document.body.appendChild(ov);
      const refreshList = () => { document.getElementById('namesListWrap').innerHTML = rowsHtml(); };
      ov.addEventListener('click', e => {
        if (e.target === ov) { ov.remove(); return; }
        const rm = e.target.closest('[data-rmname]');
        if (rm) { names = names.filter(n => n.toLowerCase() !== rm.dataset.rmname.toLowerCase()); saveNames(); renderNamesList(); refreshList(); return; }
        if (e.target.id === 'addNameBtn') {
          const inp = document.getElementById('newNameInput'), v = inp.value.trim();
          if (v && !names.some(n => n.toLowerCase() === v.toLowerCase())) {
            names.push(v); names.sort((a, b) => a.localeCompare(b)); saveNames(); renderNamesList(); refreshList();
          }
          inp.value = ''; inp.focus();
        }
      });
      document.getElementById('newNameInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('addNameBtn').click(); } });
      document.getElementById('namesClose').onclick = () => ov.remove();
      document.getElementById('newNameInput').focus();
    };
  }

  const catB = $('#catBtn');
  if (catB) {
    catB.onclick = () => {
      const ov = document.createElement('div'); ov.className = 'ov'; ov.id = 'catOv';
      const rowsHtml = () => categories.length
        ? categories.map(c => `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--line)"><span>${esc(c)}</span><button data-rmcat="${esc(c)}" style="min-height:26px;padding:2px 8px;font-size:12px">✕</button></div>`).join('')
        : '<p style="color:var(--mute);font-size:13px;margin:4px 0">Nessuna categoria.</p>';
      ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Categorie">
        <h3>Categorie</h3>
        <div id="catListWrap" style="max-height:220px;overflow-y:auto;margin-bottom:8px">${rowsHtml()}</div>
        <div class="frow" style="display:flex;gap:6px"><input id="newCatInput" type="text" placeholder="Es. U17" style="flex:1"><button class="primary" id="addCatBtn">Aggiungi</button></div>
        <div class="mbtns"><button id="catClose">Chiudi</button></div>
      </div>`;
      document.body.appendChild(ov);
      const refreshList = () => { document.getElementById('catListWrap').innerHTML = rowsHtml(); };
      ov.addEventListener('click', e => {
        if (e.target === ov) { ov.remove(); return; }
        const rm = e.target.closest('[data-rmcat]');
        if (rm) { categories = categories.filter(c => c.toLowerCase() !== rm.dataset.rmcat.toLowerCase()); saveCategories(); renderCategoriesList(); refreshList(); return; }
        if (e.target.id === 'addCatBtn') {
          const inp = document.getElementById('newCatInput'), v = inp.value.trim();
          if (v && !categories.some(c => c.toLowerCase() === v.toLowerCase())) {
            categories.push(v); categories.sort((a, b) => a.localeCompare(b)); saveCategories(); renderCategoriesList(); refreshList();
          }
          inp.value = ''; inp.focus();
        }
      });
      document.getElementById('newCatInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('addCatBtn').click(); } });
      document.getElementById('catClose').onclick = () => ov.remove();
      document.getElementById('newCatInput').focus();
    };
  }

  const accB = $('#accessBtn');
  if (accB) {
    accB.onclick = async () => {
      if (!sb) { toast('Configura la sincronizzazione'); return; }
      const ov = document.createElement('div'); ov.className = 'ov'; ov.id = 'accessOv';
      ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Accessi">
        <h3>Link di accesso</h3>
        <div id="accessListWrap" style="max-height:200px;overflow-y:auto;margin-bottom:8px"><p style="color:var(--mute);font-size:13px">Caricamento…</p></div>
        <div class="frow"><label for="accLabel">Nome riferimento</label><input id="accLabel" type="text" placeholder="Es. Refertista"></div>
        <div class="frow"><label for="accRole">Permessi</label>
          <select id="accRole" style="width:100%;min-height:34px;border-radius:6px;border:1px solid var(--line);background:var(--bg);color:var(--ink);padding:4px">
            <option value="editor">Modifica</option>
            <option value="viewer">Sola lettura</option>
          </select>
        </div>
        <div class="mbtns"><button id="accClose">Chiudi</button><button class="primary" id="accCreate">Crea link</button></div>
      </div>`;
      document.body.appendChild(ov);
      const wrap = document.getElementById('accessListWrap');
      async function refreshAccess() {
        wrap.innerHTML = '<p style="color:var(--mute);font-size:13px">Caricamento…</p>';
        try {
          const { data, error } = await sb.from('access_links').select('token,role,label,created_at').order('created_at', { ascending: false });
          if (error) throw error;
          if (!data || !data.length) { wrap.innerHTML = '<p style="color:var(--mute);font-size:13px">Nessun link generato.</p>'; return; }
          wrap.innerHTML = data.map(r => `<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--line)">
            <span style="font-size:13px">${esc(r.label || '(senza nome)')} <small style="color:var(--mute)">(${r.role === 'viewer' ? 'lettura' : 'modifica'})</small></span>
            <span>
              <button data-copytok="${r.token}" style="min-height:24px;padding:2px 6px;font-size:11px">Copia</button>
              <button data-revoke="${r.token}" style="min-height:24px;padding:2px 6px;font-size:11px">Revoca</button>
            </span></div>`).join('');
        } catch(e) { wrap.innerHTML = '<p style="color:var(--mute);font-size:13px">Errore nel caricamento.</p>'; }
      }
      refreshAccess();
      ov.addEventListener('click', async e => {
        if (e.target === ov) { ov.remove(); return; }
        const cp = e.target.closest('[data-copytok]');
        if (cp) {
          const url = buildAccessLink(cp.dataset.copytok);
          try { await navigator.clipboard.writeText(url); toast('Link copiato'); } catch(err) { prompt('Copia il link:', url); }
          return;
        }
        const rv = e.target.closest('[data-revoke]');
        if (rv) {
          await sb.from('access_links').delete().eq('token', rv.dataset.revoke);
          toast('Link revocato'); refreshAccess();
          return;
        }
        if (e.target.id === 'accCreate') {
          const label = document.getElementById('accLabel').value.trim(), role = document.getElementById('accRole').value;
          const token = genToken();
          const { error } = await sb.from('access_links').insert({ token, role, label });
          if (error) { toast('Errore creazione link'); return; }
          const url = buildAccessLink(token);
          try { await navigator.clipboard.writeText(url); toast('Link creato e copiato'); } catch(err) { prompt('Copia il link:', url); }
          document.getElementById('accLabel').value = '';
          refreshAccess();
        }
      });
      document.getElementById('accClose').onclick = () => ov.remove();
    };
  }

  const prnB = $('#printBtn');
  if (prnB) {
    prnB.onclick = () => {
      const months = monthsWithData();
      if (!months.length) { toast('Nessuna gara presente'); return; }
      const cur = params().get('m');
      const def = months.includes(cur) ? cur : months[months.length - 1];
      const ov = document.createElement('div'); ov.className = 'ov'; ov.id = 'printOv';
      ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Stampa PDF">
        <h3>Stampa PDF</h3>
        <div class="frow"><label for="pMonth">Mese</label>
          <select id="pMonth" style="width:100%;min-height:36px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--ink);padding:6px">
            ${months.map(m => `<option value="${m}"${m === def ? ' selected' : ''}>${monthLabel(m)}</option>`).join('')}
          </select>
        </div>
        <div class="mbtns"><button id="pCancel">Annulla</button><button class="primary" id="pGo">Genera PDF</button></div>
      </div>`;
      document.body.appendChild(ov);
      ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
      document.getElementById('pCancel').onclick = () => ov.remove();
      document.getElementById('pGo').onclick = () => {
        const m = document.getElementById('pMonth').value; ov.remove();
        generateMonthPDF(m);
      };
    };
  }

  const impB = $('#importBtn');
  if (impB) impB.onclick = () => $('#importFile')?.click();

  const impF = $('#importFile');
  if (impF) {
    impF.onchange = e => {
      const file = e.target.files[0]; e.target.value = ''; if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          if (!Array.isArray(data)) throw new Error();
          const { newItems, wi } = fromExportFormat(data);
          pending = { inc: newItems, wi };
          let b = $('#imp');
          if (!b) { b = document.createElement('div'); b.id = 'imp'; b.className = 'imp'; document.querySelector('main').prepend(b); }
          b.innerHTML = `<span>File con ${newItems.length} partite.</span><button class="primary" data-imp="si">Importa</button><button data-imp="no">Ignora</button>`;
          b.scrollIntoView({ block: 'start' });
        } catch(err) { toast('File non valido'); }
      };
      reader.readAsText(file);
    };
  }

  const shareB = $('#share');
  if (shareB) {
    shareB.onclick = async () => {
      const url = location.origin + location.pathname + '#d=' + encode();
      try { await navigator.clipboard.writeText(url); toast('Link copiato'); } catch(e) { prompt('Copia il link:', url); }
    };
  }

  initMenu('menuBtn', 'menuDrop');
  initMenu('gearBtn', 'gearDrop');
  document.addEventListener('click', e => { if (!e.target.closest('.menuWrap')) closeMenus(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenus(); });
}

// Inizializzazione al caricamento
window.addEventListener('DOMContentLoaded', async () => {
  bindEvents();
  if (READONLY) document.body.classList.add('ro');
  const roEl = document.getElementById('roBanner');
  if (roEl) roEl.style.display = READONLY ? 'block' : 'none';

  renderNamesList();
  renderCategoriesList();
  window.addEventListener('hashchange', () => { mem = null; importFromHash(); render(); });
  importFromHash();

  let unlocked = true;
  if (sb) {
    setSyncVisualState('orange', 'Connessione al cloud…');
    if (LINK_TOKEN) {
      const ok = await checkLinkToken();
      if (!ok) { showInvalidLink(); return; }
      if (READONLY) document.body.classList.add('ro');
    }
    let raw = null;
    try { raw = await cloudFetchRaw(); } catch(e){}
    const remoteHash = raw && raw.pinHash ? raw.pinHash : null;
    if (remoteHash && !LINK_TOKEN) {
      let already = null;
      try { already = sessionStorage.getItem('partite-unlocked-' + syncCfg.board); } catch(e){}
      unlocked = already === remoteHash;
      if (!unlocked) unlocked = await showLock(remoteHash);
    }
    if (unlocked && raw) {
      applyCloudData(raw);
      setSyncVisualState('green', 'Sincronizzato');
    } else if (unlocked) {
      setSyncVisualState('green', 'Pronto');
    }
  } else {
    setSyncVisualState('green', 'Memoria locale attiva');
  }

  if (!unlocked) return;
  render();
  if (READONLY && sb) setInterval(() => cloudPullSafe(true).then(render), 15000);
});