// ==========================================================================
// 1. UTILITY DOM LOCALI & HAPTIC FEEDBACK
// ==========================================================================
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

export function triggerHaptic() {
  try {
    if (typeof window !== 'undefined' && typeof window.triggerHaptic === 'function') {
      window.triggerHaptic();
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10);
    }
  } catch (e) {}
}

import { 
  state, 
  save, 
  saveD, 
  saveMolt, 
  saveCategories, 
  saveNames, 
  saveFipLinks, 
  pushUndo, 
  applyTheme 
} from './state.js';

import { 
  uid, 
  iso, 
  findConflictingMatches, 
  getUrgentIncompleteMatches, 
  getPendingPostponedMatches 
} from './rules.js';

import { render } from './main.js';
import * as api from './api.js';

function getOrCreateModalContainer(id, innerHTML) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.className = 'modal-overlay';
    document.body.appendChild(el);
  }
  el.innerHTML = innerHTML;
  return el;
}

function showModal(el) {
  el.classList.add('open');
  el.style.display = 'flex';
}

function hideModal(el) {
  if (!el) return;
  el.classList.remove('open');
  el.style.display = 'none';
}

export function buildCustomTimePicker(initialVal = '18:00') {
  const [h, m] = (initialVal || '18:00').split(':');
  let hhOpts = '';
  for (let i = 8; i <= 23; i++) {
    const val = String(i).padStart(2, '0');
    hhOpts += `<option value="${val}" ${val === h ? 'selected' : ''}>${val}</option>`;
  }
  const mmOpts = ['00', '15', '30', '45'].map(val => 
    `<option value="${val}" ${val === m ? 'selected' : ''}>${val}</option>`
  ).join('');

  return `
    <div class="time-picker-wrapper" style="display:flex; gap:6px; align-items:center;">
      <select class="tp-hh form-input" style="width: auto;">${hhOpts}</select>
      <span>:</span>
      <select class="tp-mm form-input" style="width: auto;">${mmOpts}</select>
    </div>
  `;
}

export function bindTimePickerEvents(container, targetInput) {
  if (!container || !targetInput) return;
  const hh = container.querySelector('.tp-hh');
  const mm = container.querySelector('.tp-mm');
  const update = () => {
    if (hh && mm) {
      targetInput.value = `${hh.value}:${mm.value}`;
      triggerHaptic();
    }
  };
  if (hh) hh.onchange = update;
  if (mm) mm.onchange = update;
}

export function openAddModal(defaultDate = null) {
  const dVal = defaultDate || (state.currentMonth ? `${state.currentMonth}-01` : iso(new Date()));
  const newMatch = {
    id: null,
    date: dVal,
    time: '18:00',
    title: '',
    cat: '',
    t1: '',
    t2: '',
    arb: '',
    friendly: false,
    score: '',
    status: '',
    fileData: null,
    fileName: null,
    ghost: false
  };
  openEditModal(newMatch, true);
}

export function openEditModal(matchItem, isNew = false) {
  const item = matchItem || {
    id: null,
    date: iso(new Date()),
    time: '18:00',
    title: '',
    cat: '',
    t1: '',
    t2: '',
    arb: '',
    friendly: false,
    score: '',
    status: '',
    fileData: null,
    fileName: null,
    ghost: false
  };

  const cats = Array.isArray(state.categories) ? state.categories : Object.keys(state.categories || {});
  const catOpts = cats.map(c => `<option value="${c}" ${c === item.cat ? 'selected' : ''}>${c}</option>`).join('');

  const namesList = state.names || [];
  const datalistHTML = `<datalist id="names-datalist">${namesList.map(n => `<option value="${n}">`).join('')}</datalist>`;

  const html = `
    <div class="modal-card">
      <div class="modal-header">
        <h3>${isNew ? 'Nuova Partita' : 'Modifica Partita'}</h3>
        <button class="btn-close">&times;</button>
      </div>
      <div class="modal-body">
        ${datalistHTML}
        <form id="matchForm">
          <div class="form-row">
            <label>Data</label>
            <input type="date" name="date" class="form-input" value="${item.date || ''}" required>
          </div>
          <div class="form-row">
            <label>Orario</label>
            <input type="hidden" name="time" id="hiddenTime" value="${item.time || '18:00'}">
            <div id="tpContainer">${buildCustomTimePicker(item.time || '18:00')}</div>
          </div>
          <div class="form-row">
            <label>Descrizione / Squadre</label>
            <input type="text" name="title" class="form-input" placeholder="Es. Vis Basket Persiceto vs ..." value="${item.title || ''}" required>
          </div>
          <div class="form-row">
            <label>Categoria</label>
            <input type="text" name="cat" class="form-input" list="cats-list" value="${item.cat || ''}" placeholder="Seleziona o scrivi...">
            <datalist id="cats-list">${catOpts}</datalist>
          </div>
          <div class="form-row">
            <label>Tavolo 1</label>
            <input type="text" name="t1" class="form-input" list="names-datalist" value="${item.t1 || ''}" placeholder="Nome addetto">
          </div>
          <div class="form-row">
            <label>Tavolo 2</label>
            <input type="text" name="t2" class="form-input" list="names-datalist" value="${item.t2 || ''}" placeholder="Nome addetto">
          </div>
          <div class="form-row">
            <label>Arbitro</label>
            <input type="text" name="arb" class="form-input" list="names-datalist" value="${item.arb || ''}" placeholder="Nome arbitro">
          </div>
          <div class="form-row">
            <label>Stato / Punteggio</label>
            <div style="display:flex; gap:10px;">
              <input type="text" name="score" class="form-input" placeholder="Es. 65 - 58" value="${item.score || ''}">
              <select name="status" class="form-input">
                <option value="" ${!item.status ? 'selected' : ''}>Normale</option>
                <option value="rinviata" ${item.status === 'rinviata' ? 'selected' : ''}>Rinviata</option>
                <option value="sospesa" ${item.status === 'sospesa' ? 'selected' : ''}>Sospesa</option>
              </select>
            </div>
          </div>
          <div class="form-row form-check">
            <label>
              <input type="checkbox" name="friendly" ${item.friendly ? 'checked' : ''}> Amichevole
            </label>
          </div>
          <div class="form-row">
            <label>Referto di Gara (Immagine o PDF)</label>
            <input type="file" id="modalFile" accept="application/pdf,image/*" class="form-input">
            ${item.fileName ? `<div style="font-size:12px; margin-top:4px;">Attuale: <strong>${item.fileName}</strong> <button type="button" id="btnRmFile" style="color:red; background:none; border:none; cursor:pointer;">(Elimina)</button></div>` : ''}
          </div>
        </form>
      </div>
      <div class="modal-footer" style="display:flex; justify-content:space-between;">
        ${!isNew ? `<button type="button" class="btn btn-danger" id="btnDelMatch">Elimina</button>` : '<div></div>'}
        <div style="display:flex; gap:8px;">
          <button type="button" class="btn btn-secondary btn-cancel">Annulla</button>
          <button type="button" class="btn btn-primary" id="btnSaveMatch">Salva</button>
        </div>
      </div>
    </div>
  `;

  const mEl = getOrCreateModalContainer('matchModalOverlay', html);
  showModal(mEl);

  let currentFileData = item.fileData;
  let currentFileName = item.fileName;

  const tpC = mEl.querySelector('#tpContainer');
  const hT = mEl.querySelector('#hiddenTime');
  bindTimePickerEvents(tpC, hT);

  const fileInput = mEl.querySelector('#modalFile');
  if (fileInput) {
    fileInput.onchange = e => {
      const f = e.target.files[0];
      if (!f) return;
      if (f.size > 8 * 1024 * 1024) {
        alert('File troppo grande (max 8MB)');
        return;
      }
      const reader = new FileReader();
      reader.onload = ev => {
        currentFileData = ev.target.result;
        currentFileName = f.name;
        triggerHaptic();
      };
      reader.readAsDataURL(f);
    };
  }

  const btnRmF = mEl.querySelector('#btnRmFile');
  if (btnRmF) {
    btnRmF.onclick = () => {
      currentFileData = null;
      currentFileName = null;
      btnRmF.parentElement.remove();
      triggerHaptic();
    };
  }

  const closeFn = () => hideModal(mEl);
  mEl.querySelector('.btn-close').onclick = closeFn;
  mEl.querySelector('.btn-cancel').onclick = closeFn;

  const btnDel = mEl.querySelector('#btnDelMatch');
  if (btnDel) {
    btnDel.onclick = () => {
      if (confirm('Vuoi eliminare questa partita?')) {
        triggerHaptic();
        pushUndo();
        state.items = (state.items || []).filter(x => x.id !== item.id);
        save();
        closeFn();
        render();
      }
    };
  }

  mEl.querySelector('#btnSaveMatch').onclick = () => {
    const f = mEl.querySelector('#matchForm');
    if (!f.checkValidity()) {
      f.reportValidity();
      return;
    }

    triggerHaptic();
    pushUndo();

    const fData = new FormData(f);
    const savedItem = {
      id: item.id || uid(),
      date: fData.get('date'),
      time: fData.get('time') || '18:00',
      title: fData.get('title').trim(),
      cat: fData.get('cat').trim(),
      t1: fData.get('t1').trim(),
      t2: fData.get('t2').trim(),
      arb: fData.get('arb').trim(),
      friendly: fData.get('friendly') === 'on',
      score: fData.get('score').trim(),
      status: fData.get('status'),
      fileData: currentFileData,
      fileName: currentFileName,
      ghost: item.ghost || false
    };

    if (isNew) {
      state.items = state.items || [];
      state.items.push(savedItem);
    } else {
      const idx = state.items.findIndex(x => x.id === item.id);
      if (idx !== -1) state.items[idx] = savedItem;
    }

    save();
    closeFn();
    render();
  };
}

export function openViewFileModal(fileData, fileName = 'Referto') {
  if (!fileData) return;
  triggerHaptic();

  const isPDF = fileData.startsWith('data:application/pdf');
  const content = isPDF
    ? `<iframe src="${fileData}" style="width:100%; height:80vh; border:none;"></iframe>`
    : `<img src="${fileData}" style="max-width:100%; max-height:80vh; display:block; margin:auto;" />`;

  const html = `
    <div class="modal-card modal-lg" style="max-width:90vw;">
      <div class="modal-header">
        <h3>${fileName}</h3>
        <button class="btn-close">&times;</button>
      </div>
      <div class="modal-body" style="padding:0; overflow:hidden;">
        ${content}
      </div>
    </div>
  `;

  const mEl = getOrCreateModalContainer('viewFileOverlay', html);
  showModal(mEl);
  mEl.querySelector('.btn-close').onclick = () => hideModal(mEl);
}

export function openConflictsModal() {
  triggerHaptic();
  const conflicts = typeof findConflictingMatches === 'function' ? findConflictingMatches() : [];
  const urgent = typeof getUrgentIncompleteMatches === 'function' ? getUrgentIncompleteMatches() : [];
  const postponed = typeof getPendingPostponedMatches === 'function' ? getPendingPostponedMatches() : [];

  let body = '';

  if (conflicts.length > 0) {
    body += `<h4 style="color:var(--danger, #e63946); margin-top:0;">⚠️ Conflitti</h4><ul class="alert-list">`;
    conflicts.forEach(c => {
      body += `<li><strong>${c.name || 'Conflitto'}</strong>: ${c.desc || (c.m1?.title + ' vs ' + c.m2?.title)}</li>`;
    });
    body += `</ul>`;
  }

  if (urgent.length > 0) {
    body += `<h4 style="color:var(--warning, #f4a261);">⏳ Gare Imminenti Senza Addetti</h4><ul class="alert-list">`;
    urgent.forEach(m => {
      body += `<li><strong>${m.date} ${m.time}</strong> - ${m.title}</li>`;
    });
    body += `</ul>`;
  }

  if (postponed.length > 0) {
    body += `<h4 style="color:var(--info, #457b9d);">🔄 Rinviate / Sospese</h4><ul class="alert-list">`;
    postponed.forEach(m => {
      body += `<li><strong>${m.date}</strong> - ${m.title} (${m.status})</li>`;
    });
    body += `</ul>`;
  }

  if (!body) {
    body = `<p style="text-align:center; color:var(--success, #2a9d8f); padding:20px;">Nessun conflitto rilevato.</p>`;
  }

  const html = `
    <div class="modal-card">
      <div class="modal-header">
        <h3>Avvisi</h3>
        <button class="btn-close">&times;</button>
      </div>
      <div class="modal-body">${body}</div>
      <div class="modal-footer">
        <button class="btn btn-secondary btn-close-modal">Chiudi</button>
      </div>
    </div>
  `;

  const mEl = getOrCreateModalContainer('alertsOverlay', html);
  showModal(mEl);
  const close = () => hideModal(mEl);
  mEl.querySelector('.btn-close').onclick = close;
  mEl.querySelector('.btn-close-modal').onclick = close;
}

export function openUrgentIncompleteModal() { openConflictsModal(); }
export function openPendingModal() { openConflictsModal(); }

export function openResocontoModal(personName = '') {
  triggerHaptic();
  const name = personName.trim();
  const currentM = state.currentMonth || iso(new Date()).slice(0, 7);

  let tCount = 0;
  let arbCount = 0;
  let matches = [];

  (state.items || []).forEach(m => {
    if (m.date && m.date.startsWith(currentM)) {
      let isT = (m.t1 === name || m.t2 === name);
      let isA = (m.arb === name);
      if (isT) tCount++;
      if (isA) arbCount++;
      if (isT || isA) matches.push(m);
    }
  });

  const totGare = tCount + arbCount;

  const html = `
    <div class="modal-card">
      <div class="modal-header">
        <h3>Dettaglio: ${name} (${currentM})</h3>
        <button class="btn-close">&times;</button>
      </div>
      <div class="modal-body">
        <div class="stats-summary" style="margin-bottom:15px; display:grid; grid-template-columns: repeat(3, 1fr); gap:10px; text-align:center;">
          <div class="stat-box" style="background:var(--bg-card, #f9f9f9); padding:10px; border-radius:6px;">
            <div style="font-size:20px; font-weight:bold;">${tCount}</div>
            <div style="font-size:12px; color:var(--muted, #666);">Tavolo</div>
          </div>
          <div class="stat-box" style="background:var(--bg-card, #f9f9f9); padding:10px; border-radius:6px;">
            <div style="font-size:20px; font-weight:bold;">${arbCount}</div>
            <div style="font-size:12px; color:var(--muted, #666);">Arbitro</div>
          </div>
          <div class="stat-box" style="background:var(--bg-card, #f9f9f9); padding:10px; border-radius:6px;">
            <div style="font-size:20px; font-weight:bold;">${totGare}</div>
            <div style="font-size:12px; color:var(--muted, #666);">Totale</div>
          </div>
        </div>
        <h4>Elenco Partite</h4>
        <ul style="max-height:200px; overflow-y:auto; padding-left:20px;">
          ${matches.map(m => `<li><strong>${m.date} ${m.time}</strong>: ${m.title} (${m.cat || 'N/D'})</li>`).join('')}
        </ul>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary btn-close-modal">Chiudi</button>
      </div>
    </div>
  `;

  const mEl = getOrCreateModalContainer('resocontoOverlay', html);
  showModal(mEl);
  const close = () => hideModal(mEl);
  mEl.querySelector('.btn-close').onclick = close;
  mEl.querySelector('.btn-close-modal').onclick = close;
}

export function openCompensiDetailModal(personName = '') {
  openResocontoModal(personName);
}

export function openQuickCloseModal(dayStr) {
  triggerHaptic();
  const meta = (state.dayMeta && state.dayMeta[dayStr]) || {};

  const html = `
    <div class="modal-card">
      <div class="modal-header">
        <h3>Apertura/Chiusura: ${dayStr}</h3>
        <button class="btn-close">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-row">
          <label>Apertura Nome</label>
          <input type="text" id="qcApNome" class="form-input" value="${meta.apNome || ''}">
        </div>
        <div class="form-row">
          <label>Chiusura Nome</label>
          <input type="text" id="qcChNome" class="form-input" value="${meta.chNome || ''}">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary btn-close-modal">Annulla</button>
        <button class="btn btn-primary" id="btnSaveQC">Salva</button>
      </div>
    </div>
  `;

  const mEl = getOrCreateModalContainer('quickCloseOverlay', html);
  showModal(mEl);
  const close = () => hideModal(mEl);
  mEl.querySelector('.btn-close').onclick = close;
  mEl.querySelector('.btn-close-modal').onclick = close;

  mEl.querySelector('#btnSaveQC').onclick = () => {
    triggerHaptic();
    pushUndo();
    state.dayMeta = state.dayMeta || {};
    state.dayMeta[dayStr] = state.dayMeta[dayStr] || {};
    state.dayMeta[dayStr].apNome = mEl.querySelector('#qcApNome').value.trim();
    state.dayMeta[dayStr].chNome = mEl.querySelector('#qcChNome').value.trim();
    saveD();
    close();
    render();
  };
}

export function openSettingsModal() {
  triggerHaptic();
  const html = `
    <div class="modal-card">
      <div class="modal-header">
        <h3>Impostazioni</h3>
        <button class="btn-close">&times;</button>
      </div>
      <div class="modal-body" style="display:flex; flex-direction:column; gap:10px;">
        <button class="btn btn-outline" id="btnSetTheme">🎨 Scegli Tema</button>
        <button class="btn btn-outline" id="btnSetCats">🏷️ Gestione Categorie</button>
        <button class="btn btn-outline" id="btnSetNames">👥 Gestione Nomi Suggeriti</button>
        <button class="btn btn-outline" id="btnSetMolt">✖️ Moltiplicatori e Compensi</button>
        <button class="btn btn-outline" id="btnSetFip">🔗 Link FIP Arbitri</button>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary btn-close-modal">Chiudi</button>
      </div>
    </div>
  `;

  const mEl = getOrCreateModalContainer('settingsOverlay', html);
  showModal(mEl);
  const close = () => hideModal(mEl);
  mEl.querySelector('.btn-close').onclick = close;
  mEl.querySelector('.btn-close-modal').onclick = close;

  mEl.querySelector('#btnSetTheme').onclick = () => { close(); openThemeModal(); };
  mEl.querySelector('#btnSetCats').onclick = () => { close(); openCatModal(); };
  mEl.querySelector('#btnSetNames').onclick = () => { close(); openNamesModal(); };
  mEl.querySelector('#btnSetMolt').onclick = () => { close(); openMoltModal(); };
  mEl.querySelector('#btnSetFip').onclick = () => { close(); openFipLinksModal(); };
}

export function openThemeModal() {
  triggerHaptic();
  const themes = ['light', 'dark', 'classic', 'nord', 'dracula'];
  const cur = state.theme || 'light';

  const html = `
    <div class="modal-card">
      <div class="modal-header">
        <h3>Tema Grafico</h3>
        <button class="btn-close">&times;</button>
      </div>
      <div class="modal-body">
        <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:10px;">
          ${themes.map(t => `
            <button class="btn ${t === cur ? 'btn-primary' : 'btn-outline'} btn-theme-choice" data-theme="${t}">
              ${t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          `).join('')}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary btn-close-modal">Chiudi</button>
      </div>
    </div>
  `;

  const mEl = getOrCreateModalContainer('themeOverlay', html);
  showModal(mEl);
  const close = () => hideModal(mEl);
  mEl.querySelector('.btn-close').onclick = close;
  mEl.querySelector('.btn-close-modal').onclick = close;

  mEl.querySelectorAll('.btn-theme-choice').forEach(b => {
    b.onclick = () => {
      triggerHaptic();
      const th = b.dataset.theme;
      state.theme = th;
      localStorage.setItem('partite-theme-v1', th);
      if (typeof applyTheme === 'function') applyTheme(th);
      close();
    };
  });
}

export function openCatModal() {
  triggerHaptic();
  const cats = Array.isArray(state.categories) ? state.categories : Object.keys(state.categories || {});
  const textVal = cats.join('\n');

  const html = `
    <div class="modal-card">
      <div class="modal-header">
        <h3>Categorie Campionato</h3>
        <button class="btn-close">&times;</button>
      </div>
      <div class="modal-body">
        <p style="font-size:12px; color:var(--muted, #666);">Una categoria per riga:</p>
        <textarea id="txtCats" class="form-input" style="height:150px;">${textVal}</textarea>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary btn-close-modal">Annulla</button>
        <button class="btn btn-primary" id="btnSaveCats">Salva</button>
      </div>
    </div>
  `;

  const mEl = getOrCreateModalContainer('catOverlay', html);
  showModal(mEl);
  const close = () => hideModal(mEl);
  mEl.querySelector('.btn-close').onclick = close;
  mEl.querySelector('.btn-close-modal').onclick = close;

  mEl.querySelector('#btnSaveCats').onclick = () => {
    triggerHaptic();
    pushUndo();
    const arr = mEl.querySelector('#txtCats').value.split('\n').map(x => x.trim()).filter(Boolean);
    state.categories = arr;
    if (typeof saveCategories === 'function') saveCategories();
    close();
    render();
  };
}

export function openNamesModal() {
  triggerHaptic();
  const names = state.names || [];
  const textVal = names.join('\n');

  const html = `
    <div class="modal-card">
      <div class="modal-header">
        <h3>Nomi Ufficiali di Campo</h3>
        <button class="btn-close">&times;</button>
      </div>
      <div class="modal-body">
        <p style="font-size:12px; color:var(--muted, #666);">Un nominativo per riga:</p>
        <textarea id="txtNames" class="form-input" style="height:150px;">${textVal}</textarea>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary btn-close-modal">Annulla</button>
        <button class="btn btn-primary" id="btnSaveNames">Salva</button>
      </div>
    </div>
  `;

  const mEl = getOrCreateModalContainer('namesOverlay', html);
  showModal(mEl);
  const close = () => hideModal(mEl);
  mEl.querySelector('.btn-close').onclick = close;
  mEl.querySelector('.btn-close-modal').onclick = close;

  mEl.querySelector('#btnSaveNames').onclick = () => {
    triggerHaptic();
    pushUndo();
    const arr = mEl.querySelector('#txtNames').value.split('\n').map(x => x.trim()).filter(Boolean);
    state.names = arr;
    if (typeof saveNames === 'function') saveNames();
    close();
    render();
  };
}

export function openMoltModal() {
  triggerHaptic();
  const molt = state.molt || {};
  const entries = Object.entries(molt);
  const textVal = entries.map(([k, v]) => `${k}:${v}`).join('\n');

  const html = `
    <div class="modal-card">
      <div class="modal-header">
        <h3>Moltiplicatori / Rimborsi</h3>
        <button class="btn-close">&times;</button>
      </div>
      <div class="modal-body">
        <p style="font-size:12px; color:var(--muted, #666);">Formato: <code>Nome:Valore</code></p>
        <textarea id="txtMolt" class="form-input" style="height:150px;">${textVal}</textarea>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary btn-close-modal">Annulla</button>
        <button class="btn btn-primary" id="btnSaveMolt">Salva</button>
      </div>
    </div>
  `;

  const mEl = getOrCreateModalContainer('moltOverlay', html);
  showModal(mEl);
  const close = () => hideModal(mEl);
  mEl.querySelector('.btn-close').onclick = close;
  mEl.querySelector('.btn-close-modal').onclick = close;

  mEl.querySelector('#btnSaveMolt').onclick = () => {
    triggerHaptic();
    pushUndo();
    const lines = mEl.querySelector('#txtMolt').value.split('\n').map(x => x.trim()).filter(Boolean);
    const newMolt = {};
    lines.forEach(l => {
      const [k, v] = l.split(':');
      if (k && v) newMolt[k.trim()] = parseFloat(v.trim()) || 1;
    });
    state.molt = newMolt;
    if (typeof saveMolt === 'function') saveMolt();
    close();
    render();
  };
}

export function openFipLinksModal() {
  triggerHaptic();
  const links = state.fipLinks || {};
  const entries = Object.entries(links);
  const textVal = entries.map(([k, v]) => `${k}=${v}`).join('\n');

  const html = `
    <div class="modal-card">
      <div class="modal-header">
        <h3>Collegamenti Arbitri FIP</h3>
        <button class="btn-close">&times;</button>
      </div>
      <div class="modal-body">
        <p style="font-size:12px; color:var(--muted, #666);">Formato: <code>Categoria=URL_FIP</code></p>
        <textarea id="txtFip" class="form-input" style="height:150px;">${textVal}</textarea>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary btn-close-modal">Annulla</button>
        <button class="btn btn-primary" id="btnSaveFip">Salva</button>
      </div>
    </div>
  `;

  const mEl = getOrCreateModalContainer('fipOverlay', html);
  showModal(mEl);
  const close = () => hideModal(mEl);
  mEl.querySelector('.btn-close').onclick = close;
  mEl.querySelector('.btn-close-modal').onclick = close;

  mEl.querySelector('#btnSaveFip').onclick = () => {
    triggerHaptic();
    pushUndo();
    const lines = mEl.querySelector('#txtFip').value.split('\n').map(x => x.trim()).filter(Boolean);
    const newLinks = {};
    lines.forEach(l => {
      const idx = l.indexOf('=');
      if (idx !== -1) {
        newLinks[l.slice(0, idx).trim()] = l.slice(idx + 1).trim();
      }
    });
    state.fipLinks = newLinks;
    if (typeof saveFipLinks === 'function') saveFipLinks();
    close();
  };
}

export function openExportMultiModal() {
  triggerHaptic();
  const months = new Set();
  (state.items || []).forEach(m => {
    if (m.date) months.add(m.date.slice(0, 7));
  });
  const sortedMonths = [...months].sort().reverse();

  const html = `
    <div class="modal-card">
      <div class="modal-header">
        <h3>Esportazione Multi-Mese</h3>
        <button class="btn-close">&times;</button>
      </div>
      <div class="modal-body">
        <p style="font-size:12px; color:var(--muted, #666);">Seleziona i mesi:</p>
        <div style="max-height:160px; overflow-y:auto; display:flex; flex-direction:column; gap:6px;">
          ${sortedMonths.map(m => `
            <label style="display:flex; gap:8px; align-items:center;">
              <input type="checkbox" class="cb-export-month" value="${m}" checked> ${m}
            </label>
          `).join('')}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary btn-close-modal">Annulla</button>
        <button class="btn btn-primary" id="btnDoExportMulti">Esporta</button>
      </div>
    </div>
  `;

  const mEl = getOrCreateModalContainer('exportMultiOverlay', html);
  showModal(mEl);
  const close = () => hideModal(mEl);
  mEl.querySelector('.btn-close').onclick = close;
  mEl.querySelector('.btn-close-modal').onclick = close;

  mEl.querySelector('#btnDoExportMulti').onclick = () => {
    triggerHaptic();
    const selected = [...mEl.querySelectorAll('.cb-export-month:checked')].map(c => c.value);
    if (!selected.length) return;
    import('./export.js').then(exp => {
      if (exp.exportSelectedMonthsJSON) exp.exportSelectedMonthsJSON(selected);
      close();
    });
  };
}

export function openPrintModal() {
  triggerHaptic();
  window.print();
}

// Nessun redirect esterno: sincronizzazione diretta
export function promptLogin() {
  triggerHaptic();
  if (state.READONLY) {
    const pwd = window.prompt("Inserisci password amministratore:");
    if (pwd) {
      localStorage.setItem('partite-admin-key', pwd);
      window.location.search = '';
    }
  } else {
    if (confirm("Vuoi forzare il salvataggio su Cloud adesso?")) {
      if (typeof api.cloudPushNow === 'function') {
        api.cloudPushNow().then(() => alert("Sincronizzazione completata!"));
      }
    }
  }
}
