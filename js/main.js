// ==========================================================================
// 1. SELETTORI DOM LOCALI (Zero dipendenze esterne per evitare errori di modulo)
// ==========================================================================
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

// ==========================================================================
// 2. GESTIONE AUTENTICAZIONE GLOBALE (Immediata per evitare Uncaught TypeError)
// ==========================================================================
window.handleAuthClick = async function() {
  try {
    const { signInWithGoogle, signOutUser } = await import('./api.js');
    const { state } = await import('./state.js');
    const { toast } = await import('./render.js');
    if (state.user) {
      await signOutUser();
      toast('Disconnesso con successo', 'info');
    } else {
      await signInWithGoogle();
    }
  } catch (err) {
    console.error('Errore durante autenticazione:', err);
  }
};

// ==========================================================================
// 3. IMPORT MODULI
// ==========================================================================
import { 
  state, 
  save, 
  saveD, 
  saveM, 
  saveLocalOnly, 
  pushUndo, 
  undo, 
  setSyncStatus 
} from './state.js';

import { 
  uid, 
  iso, 
  monday, 
  findConflictingMatches, 
  isWithinOneDayOrLess, 
  isMissingRequirements, 
  getUrgentIncompleteMatches, 
  getPendingPostponedMatches 
} from './rules.js';

import { render, toast } from './render.js';

import { 
  openModal, 
  openMonthRecapModal, 
  openPersonStatsModal, 
  openAlertsModal 
} from './modals.js';

import { 
  generateWhatsAppText, 
  copyMonthRecapWhatsApp, 
  copyReadOnlyLink, 
  exportSelectedMonthsJSON, 
  generateMonthPDF 
} from './export.js';

import { 
  initSupabase, 
  loadAllDataFromCloud, 
  saveMatchToCloud, 
  saveDayMetaToCloud, 
  deleteMatchFromCloud,
  applyCloudData 
} from './api.js';

// ==========================================================================
// 4. PARSER IMPORTAZIONE JSON
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
// 5. REGISTRAZIONE EVENTI
// ==========================================================================
function setupEventListeners() {
  // Ricerca globale
  const qInput = $('#q');
  if (qInput) {
    qInput.oninput = e => {
      state.searchQuery = e.target.value.toLowerCase();
      render();
    };
  }

  // Filtro Categoria
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
      openModal(null);
    };
  }

  // Undo (Annulla modifica)
  const undoBtn = $('#undoBtn');
  if (undoBtn) {
    undoBtn.onclick = () => {
      if (state.READONLY) return;
      undo();
      render();
      toast('Azione annullata', 'info');
    };
  }

  // Pulsante Oggi (Scroll e highlight)
  const todayBtn = $('#todayBtn');
  if (todayBtn) {
    todayBtn.onclick = () => {
      const nowIso = iso(new Date());
      const mStr = nowIso.slice(0, 7);
      state.currentMonth = mStr;
      render();
      setTimeout(() => {
        const el = $(`[data-day="${nowIso}"]`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('hl');
          setTimeout(() => el.classList.remove('hl'), 1500);
        } else {
          toast('Nessuna gara in programma oggi', 'info');
        }
      }, 100);
    };
  }

  // Pulsante Badge Avvisi
  const alertBtn = $('#alertBadgeBtn');
  if (alertBtn) {
    alertBtn.onclick = () => {
      openAlertsModal();
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
          if (!Array.isArray(data)) {
            throw new Error('Il file JSON non contiene un elenco (array) valido.');
          }

          const { newItems, wi } = fromExportFormat(data);
          if (!newItems.length && !Object.keys(wi).length) {
            throw new Error('Nessun dato valido estratto dal file.');
          }

          pushUndo();
          const map = new Map(state.items.map(i => [i.id, i]));
          newItems.forEach(i => map.set(i.id, i));
          state.items = [...map.values()];
          Object.assign(state.dayMeta, wi);

          save();
          saveD();
          render();
          toast(`${newItems.length} partite importate con successo!`, 'success');
        } catch (err) {
          console.error('Dettaglio errore importazione JSON:', err);
          toast('Errore importazione: ' + err.message, 'warning');
        }
      };
      reader.readAsText(file);
    };
  }

  // Esportazione JSON e PDF
  const expBtn = $('#exportBtn');
  if (expBtn) {
    expBtn.onclick = () => {
      if (!state.currentMonth) {
        toast('Seleziona un mese da esportare', 'warning');
        return;
      }
      exportSelectedMonthsJSON([state.currentMonth], toast);
    };
  }

  const pdfBtn = $('#pdfBtn');
  if (pdfBtn) {
    pdfBtn.onclick = () => {
      if (!state.currentMonth) {
        toast('Seleziona un mese per il PDF', 'warning');
        return;
      }
      generateMonthPDF(state.currentMonth, toast);
    };
  }

  // Condivisione link sola lettura
  const shareBtn = $('#shareBtn');
  if (shareBtn) {
    shareBtn.onclick = () => copyReadOnlyLink(toast);
  }

  // Input file invisibile globale per il caricamento referto
  let directUploadInput = $('#directReportInput');
  if (!directUploadInput) {
    directUploadInput = document.createElement('input');
    directUploadInput.type = 'file';
    directUploadInput.id = 'directReportInput';
    directUploadInput.accept = 'application/pdf,image/*';
    directUploadInput.style.display = 'none';
    document.body.appendChild(directUploadInput);
  }

  directUploadInput.onchange = e => {
    const file = e.target.files[0];
    const matchId = directUploadInput.dataset.targetMatchId;
    e.target.value = '';
    if (!file || !matchId) return;

    if (file.size > 8 * 1024 * 1024) {
      toast('File troppo grande (max 8MB)', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = ev => {
      const match = state.items.find(x => x.id === matchId);
      if (match) {
        pushUndo();
        match.fileData = ev.target.result;
        match.fileName = file.name;
        save();
        render();
        toast('Referto salvato!', 'success');
      }
    };
    reader.readAsDataURL(file);
  };

  // Navigazione ad albero laterale (Anni, Mesi, Settimane)
  const navTree = $('#navTree') || $('.nav-tree');
  if (navTree) {
    navTree.onclick = e => {
      const mLink = e.target.closest('[data-nav-month]');
      if (mLink) {
        e.preventDefault();
        const m = mLink.dataset.navMonth;
        if (m && state.currentMonth !== m) {
          state.currentMonth = m;
          render();
        }
        return;
      }

      const wLink = e.target.closest('.nav-week-link');
      if (wLink) {
        e.preventDefault();
        const wStart = wLink.dataset.weekStart;
        const mParent = wLink.dataset.month;
        if (mParent && state.currentMonth !== mParent) {
          state.currentMonth = mParent;
          render();
        }
        setTimeout(() => {
          const wEl = $(`[data-week="${wStart}"]`);
          if (wEl) {
            wEl.open = true;
            wEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            wEl.classList.add('hl');
            setTimeout(() => wEl.classList.remove('hl'), 1500);
          }
        }, 50);
        return;
      }
    };
  }

  // Delegazione eventi su #list
  const list = $('#list');
  if (list) {
    list.onclick = e => {
      // 1. Tasto Referto (📄)
      const rBtn = e.target.closest('.reportBtn');
      if (rBtn) {
        e.stopPropagation();
        const mId = rBtn.dataset.id;
        const match = state.items.find(x => x.id === mId);
        if (!match) return;

        if (match.fileData) {
          const w = window.open('');
          if (w) {
            if (match.fileData.startsWith('data:application/pdf')) {
              w.document.write(`<iframe src="${match.fileData}" frameborder="0" style="border:0; top:0; left:0; bottom:0; right:0; width:100%; height:100%;" allowfullscreen></iframe>`);
            } else {
              w.document.write(`<img src="${match.fileData}" style="max-width:100%; height:auto; display:block; margin:auto;" />`);
            }
          }
        } else {
          if (state.READONLY) return;
          directUploadInput.dataset.targetMatchId = mId;
          directUploadInput.click();
        }
        return;
      }

      // 2. Tasto WhatsApp settimana
      const wBtn = e.target.closest('.waBtn');
      if (wBtn) {
        e.stopPropagation();
        const wStart = wBtn.dataset.weekStart;
        if (wStart) {
          const start = new Date(wStart + 'T12:00');
          const end = new Date(start);
          end.setDate(end.getDate() + 6);
          generateWhatsAppText(start, end, '', toast);
        }
        return;
      }

      // 3. Tasto WhatsApp mese
      const waMonthBtn = e.target.closest('#waRecapBtn');
      if (waMonthBtn) {
        e.stopPropagation();
        if (state.currentMonth) {
          copyMonthRecapWhatsApp(state.currentMonth, toast);
        }
        return;
      }

      // 4. Click sul nome per aprire statistiche
      const personEl = e.target.closest('.clickable-person');
      if (personEl) {
        e.stopPropagation();
        const name = personEl.dataset.name;
        if (name) openPersonStatsModal(name);
        return;
      }

      // 5. Check Rapido (Ghost)
      const gBtn = e.target.closest('.ghostBtn');
      if (gBtn) {
        e.stopPropagation();
        if (state.READONLY) return;
        const mId = gBtn.dataset.id;
        const match = state.items.find(x => x.id === mId);
        if (match) {
          pushUndo();
          match.ghost = !match.ghost;
          save();
          render();
        }
        return;
      }

      // 6. Pulsante Modifica
      const edBtn = e.target.closest('.editBtn');
      if (edBtn) {
        e.stopPropagation();
        if (state.READONLY) return;
        const mId = edBtn.dataset.id;
        const match = state.items.find(x => x.id === mId);
        if (match) openModal(match);
        return;
      }

      // 7. Click sulla card partita
      const matchCard = e.target.closest('.match');
      if (matchCard && !e.target.closest('a') && !e.target.closest('button')) {
        if (state.READONLY) return;
        const mId = matchCard.dataset.id;
        const match = state.items.find(x => x.id === mId);
        if (match) openModal(match);
        return;
      }

      // 8. Apertura/Chiusura Sì/No
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
        state.dayMeta[dayStr] ??= {};
        state.dayMeta[dayStr][type] = val;
        saveD();
        render();
        return;
      }
    };

    // Modifica nome referente apertura/chiusura
    list.onchange = e => {
      const input = e.target.closest('input[data-wn]');
      if (input) {
        if (state.READONLY) return;
        const dayEl = input.closest('.day');
        if (!dayEl) return;
        const dayStr = dayEl.dataset.day;
        const typeName = input.dataset.wn;
        pushUndo();
        state.dayMeta[dayStr] ??= {};
        state.dayMeta[dayStr][typeName] = input.value.trim();
        saveD();
      }
    };
  }

  // Delegazione click colonna laterale riepilogo
  const sidebar = $('#sidebarRecap') || $('.recap');
  if (sidebar) {
    sidebar.onclick = e => {
      const row = e.target.closest('.recap-item-compact');
      if (row) {
        const name = row.dataset.name;
        if (name) openPersonStatsModal(name);
        return;
      }
      const recapHeader = e.target.closest('h4');
      if (recapHeader && state.currentMonth) {
        openMonthRecapModal(state.currentMonth);
      }
    };
  }

  // Chiusura modali su click sullo sfondo scuro
  document.addEventListener('click', e => {
    if (e.target.classList.contains('modal-overlay')) {
      e.target.classList.remove('open');
      e.target.style.display = 'none';
    }
  });

  // Chiusura modali su tasto Escape
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const openModals = $$('.modal-overlay.open, .modal.open, #matchModal');
      openModals.forEach(m => {
        m.classList.remove('open');
        if (m.close && typeof m.close === 'function') m.close();
        if (m.style) m.style.display = 'none';
      });
    }
  });
}

// ==========================================================================
// 6. INIZIALIZZAZIONE E AVVIO
// ==========================================================================
async function initApp() {
  const params = new URLSearchParams(window.location.search);
  state.READONLY = params.get('readonly') === 'true';

  if (state.READONLY) {
    document.body.classList.add('ro');
    const newBtn = $('#newBtn');
    if (newBtn) newBtn.style.display = 'none';
    const importBtn = $('#importBtn');
    if (importBtn) importBtn.style.display = 'none';
  }

  // Caricamento locale iniziale
  try {
    const rawItems = localStorage.getItem('partite-v1');
    if (rawItems) state.items = JSON.parse(rawItems);
    const rawMeta = localStorage.getItem('partite-d-v1');
    if (rawMeta) state.dayMeta = JSON.parse(rawMeta);
    const rawMolt = localStorage.getItem('partite-m-v1');
    if (rawMolt) state.molt = JSON.parse(rawMolt);
  } catch (e) {
    console.warn('Errore lettura dati da localStorage:', e);
  }

  setupEventListeners();

  if (!state.currentMonth) {
    state.currentMonth = iso(new Date()).slice(0, 7);
  }

  render();

  // Sincronizzazione Supabase
  try {
    const isOnline = initSupabase();
    if (isOnline) {
      setSyncStatus('syncing');
      await loadAllDataFromCloud();
      setSyncStatus('connected');
      render();
    } else {
      setSyncStatus('offline');
    }
  } catch (err) {
    console.error('Errore sincronizzazione Cloud:', err);
    setSyncStatus('error');
  }
}

document.addEventListener('DOMContentLoaded', initApp);
