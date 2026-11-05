// ==========================================================================
// IMPORT DEI MODULI CON I NOMI REALI ESPORTATI
// ==========================================================================
import { 
  state, 
  save, 
  saveD, 
  saveLocalOnly, 
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
  $, 
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
  openUrgentIncompleteModal, 
  openViewFileModal, 
  openResocontoModal, 
  openQuickCloseModal,
  promptLogin 
} from './modals.js';

import { 
  generateWhatsAppText, 
  copyMonthRecapWhatsApp, 
  copyReadOnlyLink, 
  exportSelectedMonthsJSON, 
  generateMonthPDF 
} from './export.js';

import { 
  applyCloudData, 
  cloudPullSafe, 
  cloudPushNow, 
  registerCloudCallback 
} from './api.js';

// Espone state e login per click su interfaccia e debug
window.state = state;
window.handleAuthClick = () => {
  if (typeof promptLogin === 'function') promptLogin();
};

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
// FUNZIONE CENTRALE DI RENDERING (Aggiorna lista partite, sidebar e badge)
// ==========================================================================
export function render() {
  const listEl = $('#list');
  if (!listEl) return;

  const mParam = (params && params.m) || state.currentMonth || iso(new Date()).slice(0, 7);
  state.currentMonth = mParam;

  // 1. Filtra le partite in base al mese, ricerca e categoria
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

  // Ordina per data e orario
  filtered.sort((a, b) => {
    const da = (a.date || '') + (a.time || '');
    const db = (b.date || '') + (b.time || '');
    return da.localeCompare(db);
  });

  // 2. Raggruppa per settimane e giorni
  const weeksMap = new Map();
  filtered.forEach(item => {
    const d = new Date(item.date + 'T12:00:00');
    const wStart = monday(d);
    if (!weeksMap.has(wStart)) weeksMap.set(wStart, new Map());
    const dayMap = weeksMap.get(wStart);
    if (!dayMap.has(item.date)) dayMap.set(item.date, []);
    dayMap.get(item.date).push(item);
  });

  // 3. Genera l'HTML delle settimane
  if (weeksMap.size === 0) {
    listEl.innerHTML = `
      <div style="text-align:center; padding: 40px 10px; color: var(--muted, #888);">
        Nessuna partita programmata per questo mese o filtro selezionato.
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

  // 4. Aggiorna Sidebar Riepilogo
  const sidebarEl = $('#sidebarRecap') || $('.recap-content');
  if (sidebarEl && typeof recapHTML === 'function') {
    sidebarEl.innerHTML = recapHTML(state.currentMonth);
  }

  // 5. Aggiorna Albero laterale e badge di allerta
  if (typeof renderNavTree === 'function') renderNavTree();
  if (typeof updateAlertStatusBadge === 'function') updateAlertStatusBadge();
  if (typeof updateIncompleteBadge === 'function') updateIncompleteBadge();
  if (typeof refreshUndoBtn === 'function') refreshUndoBtn();
}

// ==========================================================================
// IMPORTAZIONE FILE JSON CON CONVERSIONE
// ==========================================================================
function fromExportFormat(arr) {
  const newItems = [];
  const wi = {};

  arr.forEach(d => {
    if (!d || !d.data) return;
    const dateStr = d.data;
    
    if (d.apertura || d.chiusura) {
      wi[dateStr] = {
        ap: (d.apertura && (d.apertura.si === true || d.apertura.si === 'si')) ? 'si' : 'no',
        apNome: (d.apertura && d.apertura.nome) ? d.apertura.nome : '',
        ch: (d.chiusura && (d.chiusura.si === true || d.chiusura.si === 'si')) ? 'si' : 'no',
        chNome: (d.chiusura && d.chiusura.nome) ? d.chiusura.nome : ''
      };
    }

    if (Array.isArray(d.partite)) {
      d.partite.forEach(p => {
        newItems.push({
          id: uid(),
          date: dateStr,
          time: p.orario || '',
          title: p.partita || '',
          cat: p.cat || '',
          t1: p.tavolo1 || '',
          t2: p.tavolo2 || '',
          arb: p.arbitro || '',
          friendly: !!p.amichevole,
          score: p.score || '',
          status: p.status || '',
          fileData: p.fileData || null,
          fileName: p.fileName || null,
          ghost: false
        });
      });
    }
  });

  return { newItems, wi };
}

// ==========================================================================
// REGISTRAZIONE EVENTI
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

  // Nuova Partita
  const newBtn = $('#newBtn');
  if (newBtn) {
    newBtn.onclick = () => {
      if (state.READONLY) return;
      openAddModal();
    };
  }

  // Tasto Undo
  const undoBtn = $('#undoBtn');
  if (undoBtn) {
    undoBtn.onclick = () => {
      if (state.READONLY) return;
      if (typeof popUndoState === 'function') popUndoState();
      render();
      toast('Azione annullata', 'info');
    };
  }

  // Tasto Oggi
  const todayBtn = $('#todayBtn');
  if (todayBtn) {
    todayBtn.onclick = () => {
      const nowIso = iso(new Date());
      const mStr = nowIso.slice(0, 7);
      state.currentMonth = mStr;
      if (typeof setParam === 'function') setParam('m', mStr);
      render();
      setTimeout(() => {
        const el = $(`[data-day="${nowIso}"]`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('hl');
          setTimeout(() => el.classList.remove('hl'), 1500);
        } else {
          toast('Nessuna gara oggi', 'info');
        }
      }, 100);
    };
  }

  // Pulsante Avvisi / Conflitti
  const alertBtn = $('#alertBadgeBtn');
  if (alertBtn) {
    alertBtn.onclick = () => {
      if (typeof openConflictsModal === 'function') openConflictsModal();
    };
  }

  // Importazione JSON
  const impBtn = $('#importBtn');
  const impF = $('#importFile');
  if (impBtn && impF) {
    impBtn.onclick = () => {
      if (state.READONLY) return;
      impF.click();
    };

    impF.onchange = e => {
      if (state.READONLY) return;
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          if (!Array.isArray(data)) throw new Error('File JSON non valido');

          const { newItems, wi } = fromExportFormat(data);
          if (!newItems.length && !Object.keys(wi).length) throw new Error('Nessuna partita trovata');

          pushUndo();
          const map = new Map((state.items || []).map(i => [i.id, i]));
          newItems.forEach(i => map.set(i.id, i));
          state.items = [...map.values()];
          state.dayMeta = state.dayMeta || {};
          Object.assign(state.dayMeta, wi);

          save();
          saveD();
          if (typeof cloudPushNow === 'function') cloudPushNow();
          render();
          toast(`${newItems.length} partite importate!`, 'success');
        } catch (err) {
          console.error(err);
          toast('Errore: ' + err.message, 'warning');
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

  // Delegazione click su lista
  const list = $('#list');
  if (list) {
    list.onclick = e => {
      // Referto
      const rBtn = e.target.closest('.reportBtn');
      if (rBtn) {
        e.stopPropagation();
        const mId = rBtn.dataset.id;
        const match = (state.items || []).find(x => x.id === mId);
        if (!match) return;

        if (match.fileData) {
          openViewFileModal(match.fileData, match.fileName || 'Referto');
        } else {
          if (state.READONLY) return;
          openEditModal(match);
        }
        return;
      }

      // WhatsApp settimana
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

      // Statistiche persona
      const personEl = e.target.closest('.clickable-person');
      if (personEl) {
        e.stopPropagation();
        const name = personEl.dataset.name;
        if (name && typeof openResocontoModal === 'function') openResocontoModal(name);
        return;
      }

      // Ghost check
      const gBtn = e.target.closest('.ghostBtn');
      if (gBtn) {
        e.stopPropagation();
        if (state.READONLY) return;
        const mId = gBtn.dataset.id;
        const match = (state.items || []).find(x => x.id === mId);
        if (match) {
          pushUndo();
          match.ghost = !match.ghost;
          save();
          render();
        }
        return;
      }

      // Modifica card
      const matchCard = e.target.closest('.match');
      if (matchCard && !e.target.closest('a') && !e.target.closest('button')) {
        if (state.READONLY) return;
        const mId = matchCard.dataset.id;
        const match = (state.items || []).find(x => x.id === mId);
        if (match) openEditModal(match);
        return;
      }

      // Apertura / Chiusura
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
      if (input) {
        if (state.READONLY) return;
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

  // Navigazione ad albero a sinistra
  const navTree = $('#navTree') || $('.nav-tree');
  if (navTree) {
    navTree.onclick = e => {
      const mLink = e.target.closest('[data-nav-month]');
      if (mLink) {
        e.preventDefault();
        const m = mLink.dataset.navMonth;
        if (m && state.currentMonth !== m) {
          state.currentMonth = m;
          if (typeof setParam === 'function') setParam('m', m);
          render();
        }
        return;
      }
    };
  }

  // Click riepilogo
  const sidebar = $('#sidebarRecap') || $('.recap');
  if (sidebar) {
    sidebar.onclick = e => {
      const row = e.target.closest('.recap-item-compact');
      if (row) {
        const name = row.dataset.name;
        if (name && typeof openResocontoModal === 'function') openResocontoModal(name);
      }
    };
  }
}

// ==========================================================================
// AVVIO APPLICAZIONE
// ==========================================================================
async function initApp() {
  const urlP = new URLSearchParams(window.location.search);
  state.READONLY = urlP.get('readonly') === 'true';

  if (state.READONLY) {
    document.body.classList.add('ro');
    const newBtn = $('#newBtn');
    if (newBtn) newBtn.style.display = 'none';
  }

  // 1. Carica da localStorage
  try {
    const rawItems = localStorage.getItem('partite-v1');
    if (rawItems) state.items = JSON.parse(rawItems);
    const rawMeta = localStorage.getItem('partite-d-v1');
    if (rawMeta) state.dayMeta = JSON.parse(rawMeta);
  } catch (e) {
    console.warn(e);
  }

  // 2. Mese iniziale
  if (!state.currentMonth) {
    state.currentMonth = (params && params.m) || iso(new Date()).slice(0, 7);
  }

  setupEventListeners();

  // 3. Render immediato dei dati locali
  render();

  // 4. Sincronizzazione cloud sicura con i metodi reali
  try {
    if (typeof registerCloudCallback === 'function') {
      registerCloudCallback(() => render());
    }
    if (typeof cloudPullSafe === 'function') {
      await cloudPullSafe();
      render();
    }
  } catch (err) {
    console.warn('Avvio offline:', err);
  }
}

// Esecuzione immediata
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
