// ==========================================================================
// 1. SELETTORI E UTILITY GLOBALI
// ==========================================================================
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

window.triggerHaptic = function() {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try { navigator.vibrate(10); } catch(e) {}
  }
};

window.handleAuthClick = () => {
  import('./modals.js').then(m => {
    if (m.promptLogin) m.promptLogin();
  }).catch(console.error);
};

// ==========================================================================
// 2. IMPORT MODULI
// ==========================================================================
import { 
  state, 
  save, 
  saveD, 
  pushUndo, 
  popUndoState, 
  refreshUndoBtn 
} from './state.js';

import { 
  uid, 
  iso, 
  monday 
} from './rules.js';

import { 
  card, 
  esc, 
  params, 
  setParam, 
  slotHTML, 
  recapHTML, 
  renderNavTree, 
  updateAlertStatusBadge, 
  updateIncompleteBadge 
} from './render.js';

import { 
  openAddModal, 
  openEditModal, 
  openConflictsModal, 
  openViewFileModal, 
  openResocontoModal 
} from './modals.js';

import { 
  generateWhatsAppText, 
  copyReadOnlyLink, 
  exportSelectedMonthsJSON, 
  generateMonthPDF 
} from './export.js';

import * as api from './api.js';

window.state = state;

function toast(msg, type = 'info') {
  let toastEl = $('#toast');
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.id = 'toast';
    document.body.appendChild(toastEl);
  }
  toastEl.className = 'toast show ' + type;
  toastEl.textContent = msg;
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => {
    toastEl.className = 'toast';
  }, 2500);
}

// ==========================================================================
// 3. PARSER UNIVERSALE IMPORTAZIONE JSON (Gestisce ogni variante di formato)
// ==========================================================================
function parseImportJSON(data) {
  const newItems = [];
  const wi = {};

  if (!Array.isArray(data)) {
    // Se è un oggetto con chiave items/partite
    if (data && typeof data === 'object') {
      if (Array.isArray(data.items)) data = data.items;
      else if (Array.isArray(data.partite)) data = data.partite;
      else throw new Error("Il file JSON non contiene un elenco valido");
    } else {
      throw new Error("Il file JSON non contiene un elenco valido");
    }
  }

  data.forEach(entry => {
    if (!entry) return;

    // Formato 1: Struttura a giorni { data: 'YYYY-MM-DD', partite: [...], apertura: {...}, chiusura: {...} }
    if (entry.data && (entry.partite || entry.apertura || entry.chiusura)) {
      const dateStr = entry.data;

      if (entry.apertura || entry.chiusura) {
        wi[dateStr] = {
          ap: (entry.apertura && (entry.apertura.si === true || entry.apertura.si === 'si')) ? 'si' : 'no',
          apNome: (entry.apertura && entry.apertura.nome) ? entry.apertura.nome : '',
          ch: (entry.chiusura && (entry.chiusura.si === true || entry.chiusura.si === 'si')) ? 'si' : 'no',
          chNome: (entry.chiusura && entry.chiusura.nome) ? entry.chiusura.nome : ''
        };
      }

      if (Array.isArray(entry.partite)) {
        entry.partite.forEach(p => {
          newItems.push({
            id: p.id || uid(),
            date: dateStr,
            time: p.orario || p.time || '18:00',
            title: p.partita || p.title || '',
            cat: p.cat || '',
            t1: p.tavolo1 || p.t1 || '',
            t2: p.tavolo2 || p.t2 || '',
            arb: p.arbitro || p.arb || '',
            friendly: !!(p.amichevole || p.friendly),
            score: p.score || '',
            status: p.status || '',
            fileData: p.fileData || null,
            fileName: p.fileName || null,
            ghost: !!p.ghost
          });
        });
      }
    } 
    // Formato 2: Singolo oggetto partita { date: 'YYYY-MM-DD', time: '18:00', title: '...' }
    else if (entry.date || entry.data) {
      const dateStr = entry.date || entry.data;
      newItems.push({
        id: entry.id || uid(),
        date: dateStr,
        time: entry.time || entry.orario || '18:00',
        title: entry.title || entry.partita || '',
        cat: entry.cat || '',
        t1: entry.t1 || entry.tavolo1 || '',
        t2: entry.t2 || entry.tavolo2 || '',
        arb: entry.arb || entry.arbitro || '',
        friendly: !!(entry.friendly || entry.amichevole),
        score: entry.score || '',
        status: entry.status || '',
        fileData: entry.fileData || null,
        fileName: entry.fileName || null,
        ghost: !!entry.ghost
      });
    }
  });

  return { newItems, wi };
}

// ==========================================================================
// 4. RENDERING PRINCIPALE
// ==========================================================================
export function render() {
  const listEl = $('#list');
  if (!listEl) return;

  const mParam = (params && params.m) || state.currentMonth || iso(new Date()).slice(0, 7);
  state.currentMonth = mParam;

  let filtered = (state.items || []).filter(item => {
    if (!item.date || !item.date.startsWith(mParam)) return false;
    if (state.filterCat && state.filterCat !== 'all' && item.cat !== state.filterCat) return false;
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      const matchText = `${item.title || ''} ${item.cat || ''} ${item.t1 || ''} ${item.t2 || ''} ${item.arb || ''}`.toLowerCase();
      if (!matchText.includes(q)) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    const da = (a.date || '') + (a.time || '');
    const db = (b.date || '') + (b.time || '');
    return da.localeCompare(db);
  });

  const weeksMap = new Map();
  filtered.forEach(item => {
    const d = new Date(item.date + 'T12:00:00');
    const wStart = monday(d);
    if (!weeksMap.has(wStart)) weeksMap.set(wStart, new Map());
    const dayMap = weeksMap.get(wStart);
    if (!dayMap.has(item.date)) dayMap.set(item.date, []);
    dayMap.get(item.date).push(item);
  });

  if (weeksMap.size === 0) {
    listEl.innerHTML = `
      <div style="text-align:center; padding: 40px 10px; color: var(--muted, #888);">
        Nessuna partita per il mese di ${mParam}.
      </div>`;
  } else {
    let html = '';
    const sortedWeeks = [...weeksMap.keys()].sort();

    sortedWeeks.forEach(wStart => {
      const days = weeksMap.get(wStart);
      const wDate = new Date(wStart + 'T12:00:00');
      const wEnd = new Date(wDate);
      wEnd.setDate(wEnd.getDate() + 6);

      const dStartStr = `${wDate.getDate()} ${wDate.toLocaleDateString('it-IT', { month: 'short' })}`;
      const dEndStr = `${wEnd.getDate()} ${wEnd.toLocaleDateString('it-IT', { month: 'short' })}`;

      html += `<details class="week" data-week="${wStart}" open>`;
      html += `
        <summary>
          <span>Settimana ${dStartStr} - ${dEndStr}</span>
          <div class="summary-actions">
            <button class="btn btn-sm waBtn" data-week-start="${wStart}" title="Condividi su WhatsApp">📲 WA</button>
          </div>
        </summary>
        <div class="week-days">`;

      const sortedDays = [...days.keys()].sort();
      sortedDays.forEach(dayStr => {
        const matches = days.get(dayStr);
        const dayDate = new Date(dayStr + 'T12:00:00');
        const dayName = dayDate.toLocaleDateString('it-IT', { weekday: 'long' });
        const dayFormatted = `${dayName.charAt(0).toUpperCase() + dayName.slice(1)} ${dayDate.getDate()} ${dayDate.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}`;

        const meta = (state.dayMeta && state.dayMeta[dayStr]) || {};

        html += `
          <div class="day" data-day="${dayStr}">
            <div class="day-head">
              <span class="day-title">${dayFormatted}</span>
            </div>
            ${typeof slotHTML === 'function' ? slotHTML('ap', meta.ap, meta.apNome) : ''}
            <div class="day-matches">
              ${matches.map(m => (typeof card === 'function' ? card(m) : '')).join('')}
            </div>
            ${typeof slotHTML === 'function' ? slotHTML('ch', meta.ch, meta.chNome) : ''}
          </div>`;
      });

      html += `</div></details>`;
    });

    listEl.innerHTML = html;
  }

  const sidebarEl = $('#sidebarRecap') || $('.recap-content');
  if (sidebarEl && typeof recapHTML === 'function') {
    sidebarEl.innerHTML = recapHTML(state.currentMonth);
  }

  try {
    if (typeof renderNavTree === 'function') renderNavTree();
  } catch (err) {}

  try {
    if (typeof updateAlertStatusBadge === 'function') updateAlertStatusBadge();
    if (typeof updateIncompleteBadge === 'function') updateIncompleteBadge();
    if (typeof refreshUndoBtn === 'function') refreshUndoBtn();
  } catch (err) {}
}

// ==========================================================================
// 5. REGISTRAZIONE EVENTI & GESTIONE IMPORTAZIONE FILE
// ==========================================================================
function setupEventListeners() {
  const qInput = $('#q');
  if (qInput) {
    qInput.oninput = e => {
      state.searchQuery = e.target.value.toLowerCase();
      render();
    };
  }

  const fCat = $('#filterCat');
  if (fCat) {
    fCat.onchange = e => {
      state.filterCat = e.target.value;
      render();
    };
  }

  const newBtn = $('#newBtn');
  if (newBtn) {
    newBtn.onclick = () => {
      if (state.READONLY) return;
      openAddModal();
    };
  }

  const undoBtn = $('#undoBtn');
  if (undoBtn) {
    undoBtn.onclick = () => {
      if (state.READONLY) return;
      if (typeof popUndoState === 'function') popUndoState();
      render();
      toast('Azione annullata', 'info');
    };
  }

  const todayBtn = $('#todayBtn');
  if (todayBtn) {
    todayBtn.onclick = () => {
      const nowIso = iso(new Date());
      const mStr = nowIso.slice(0, 7);
      state.currentMonth = mStr;
      if (typeof setParam === 'function') setParam('m', mStr);
      render();
    };
  }

  const alertBtn = $('#alertBadgeBtn');
  if (alertBtn) {
    alertBtn.onclick = () => {
      if (typeof openConflictsModal === 'function') openConflictsModal();
    };
  }

  // --- IMPORTAZIONE JSON DIRETTA E IMMEDIATA ---
  const impBtn = $('#importBtn');
  const impF = $('#importFile');
  if (impBtn && impF) {
    impBtn.onclick = () => {
      if (state.READONLY) {
        alert("Modalità sola lettura attiva.");
        return;
      }
      impF.value = '';
      impF.click();
    };

    impF.onchange = e => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const raw = JSON.parse(reader.result);
          const { newItems, wi } = parseImportJSON(raw);

          if (!newItems.length && !Object.keys(wi).length) {
            alert('Nessuna partita o dato trovato nel file selezionato.');
            return;
          }

          pushUndo();

          // Sostituisci o unisci per ID
          const map = new Map((state.items || []).map(i => [i.id, i]));
          newItems.forEach(i => map.set(i.id, i));
          state.items = [...map.values()];
          
          state.dayMeta = state.dayMeta || {};
          Object.assign(state.dayMeta, wi);

          // Salva in locale
          save();
          saveD();

          // Se la prima partita ha una data valida, vai a quel mese per vederle subito
          if (newItems.length > 0 && newItems[0].date) {
            state.currentMonth = newItems[0].date.slice(0, 7);
            if (typeof setParam === 'function') setParam('m', state.currentMonth);
          }

          // Invia al cloud se disponibile
          if (typeof api.cloudPushNow === 'function') {
            api.cloudPushNow().catch(console.warn);
          }

          render();
          toast(`${newItems.length} partite caricate con successo!`, 'success');
        } catch (err) {
          console.error(err);
          alert('Errore durante la lettura del JSON: ' + err.message);
        }
      };
      reader.readAsText(file);
    };
  }

  // Esportazioni
  const expBtn = $('#exportBtn');
  if (expBtn) {
    expBtn.onclick = () => {
      if (!state.currentMonth) return;
      exportSelectedMonthsJSON([state.currentMonth], toast);
    };
  }

  const pdfBtn = $('#pdfBtn');
  if (pdfBtn) {
    pdfBtn.onclick = () => {
      if (!state.currentMonth) return;
      generateMonthPDF(state.currentMonth, toast);
    };
  }

  const shareBtn = $('#shareBtn');
  if (shareBtn) {
    shareBtn.onclick = () => copyReadOnlyLink(toast);
  }

  // Click su partite
  const list = $('#list');
  if (list) {
    list.onclick = e => {
      const rBtn = e.target.closest('.reportBtn');
      if (rBtn) {
        e.stopPropagation();
        const mId = rBtn.dataset.id;
        const match = (state.items || []).find(x => x.id === mId);
        if (match && match.fileData) openViewFileModal(match.fileData, match.fileName);
        else if (match && !state.READONLY) openEditModal(match);
        return;
      }

      const wBtn = e.target.closest('.waBtn');
      if (wBtn) {
        e.stopPropagation();
        const wStart = wBtn.dataset.weekStart;
        if (wStart) {
          const start = new Date(wStart + 'T12:00:00');
          const end = new Date(start);
          end.setDate(end.getDate() + 6);
          generateWhatsAppText(start, end, '', toast);
        }
        return;
      }

      const personEl = e.target.closest('.clickable-person');
      if (personEl) {
        e.stopPropagation();
        const name = personEl.dataset.name;
        if (name) openResocontoModal(name);
        return;
      }

      const matchCard = e.target.closest('.match');
      if (matchCard && !e.target.closest('a') && !e.target.closest('button')) {
        if (state.READONLY) return;
        const mId = matchCard.dataset.id;
        const match = (state.items || []).find(x => x.id === mId);
        if (match) openEditModal(match);
        return;
      }

      const ynBtn = e.target.closest('.slot .yn button');
      if (ynBtn) {
        if (state.READONLY) return;
        const slotEl = ynBtn.closest('.slot');
        const dayEl = ynBtn.closest('.day');
        if (!slotEl || !dayEl) return;
        const dayStr = dayEl.dataset.day;
        const type = slotEl.dataset.type;
        const val = ynBtn.dataset.val;

        pushUndo();
        state.dayMeta = state.dayMeta || {};
        state.dayMeta[dayStr] ??= {};
        state.dayMeta[dayStr][type] = val;
        saveD();
        render();
        return;
      }
    };

    list.onchange = e => {
      const input = e.target.closest('input[data-wn]');
      if (input && !state.READONLY) {
        const dayEl = input.closest('.day');
        if (!dayEl) return;
        const dayStr = dayEl.dataset.day;
        const typeName = input.dataset.wn;
        pushUndo();
        state.dayMeta = state.dayMeta || {};
        state.dayMeta[dayStr] ??= {};
        state.dayMeta[dayStr][typeName] = input.value.trim();
        saveD();
      }
    };
  }

  const navTreeEl = $('#navTree') || $('.nav-tree');
  if (navTreeEl) {
    navTreeEl.onclick = e => {
      const mLink = e.target.closest('[data-nav-month]');
      if (mLink) {
        e.preventDefault();
        const m = mLink.dataset.navMonth;
        if (m && state.currentMonth !== m) {
          state.currentMonth = m;
          if (typeof setParam === 'function') setParam('m', m);
          render();
        }
      }
    };
  }
}

// ==========================================================================
// 6. INIZIALIZZAZIONE
// ==========================================================================
async function initApp() {
  const urlP = new URLSearchParams(window.location.search);
  state.READONLY = urlP.get('readonly') === 'true';

  try {
    const rawItems = localStorage.getItem('partite-v1');
    state.items = rawItems ? JSON.parse(rawItems) : (state.items || []);

    const rawMeta = localStorage.getItem('partite-d-v1');
    state.dayMeta = rawMeta ? JSON.parse(rawMeta) : (state.dayMeta || {});

    const rawMolt = localStorage.getItem('partite-m-v1');
    state.molt = rawMolt ? JSON.parse(rawMolt) : (state.molt || {});

    const rawCats = localStorage.getItem('partite-cats-v1');
    state.categories = rawCats ? JSON.parse(rawCats) : (state.categories || {});

    const rawNames = localStorage.getItem('partite-names-v1');
    state.names = rawNames ? JSON.parse(rawNames) : (state.names || []);
  } catch (e) {
    console.warn('Errore localStorage:', e);
  }

  state.items = state.items || [];
  state.dayMeta = state.dayMeta || {};
  state.molt = state.molt || {};
  state.categories = state.categories || {};
  state.names = state.names || [];

  if (!state.currentMonth) {
    state.currentMonth = (params && params.m) || iso(new Date()).slice(0, 7);
  }

  setupEventListeners();
  render();

  try {
    if (typeof api.registerCloudCallback === 'function') {
      api.registerCloudCallback(() => render());
    }
    if (typeof api.cloudPullSafe === 'function') {
      await api.cloudPullSafe();
      render();
    }
  } catch (err) {}
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
