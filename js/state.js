// ==========================================================================
// STATE MANAGEMENT & PERSISTENCE
// ==========================================================================

export const state = {
  items: [],
  dayMeta: {},
  molt: {},
  categories: {},
  names: [],
  fipLinks: {},
  theme: 'light',
  user: null,
  READONLY: false,
  currentMonth: '',
  searchQuery: '',
  filterCat: 'all',
  undoStack: []
};

let stateCallbacks = [];

export function registerStateCallbacks(cb) {
  if (typeof cb === 'function') {
    stateCallbacks.push(cb);
  }
}

function notifyCallbacks() {
  stateCallbacks.forEach(cb => {
    try { cb(); } catch (e) { console.error(e); }
  });
}

// --------------------------------------------------------------------------
// SALVATAGGIO LOCALE ITEMS (Con protezione QuotaExceededError)
// --------------------------------------------------------------------------
export function saveLocalOnly() {
  try {
    localStorage.setItem('partite-v1', JSON.stringify(state.items));
  } catch (err) {
    if (err.name === 'QuotaExceededError' || err.code === 22) {
      console.warn('Quota localStorage superata: salvataggio compresso senza allegati pesanti');
      try {
        const stripped = (state.items || []).map(item => {
          if (!item.fileData) return item;
          const copy = { ...item };
          delete copy.fileData;
          return copy;
        });
        localStorage.setItem('partite-v1', JSON.stringify(stripped));
      } catch (e2) {
        console.error('Impossibile salvare in localStorage:', e2);
      }
    } else {
      console.error('Errore salvataggio items locale', err);
    }
  }
}

export function save() {
  saveLocalOnly();
  notifyCallbacks();
}

// --------------------------------------------------------------------------
// SALVATAGGIO METADATI GIORNO (Apertura / Chiusura)
// --------------------------------------------------------------------------
export function saveDLocalOnly() {
  try {
    localStorage.setItem('partite-d-v1', JSON.stringify(state.dayMeta));
  } catch (err) {
    console.error('Errore salvataggio dayMeta locale', err);
  }
}

export function saveD() {
  saveDLocalOnly();
  notifyCallbacks();
}

// --------------------------------------------------------------------------
// ALTRE CHIAVI DI STATO
// --------------------------------------------------------------------------
export function saveMoltLocal() {
  try {
    localStorage.setItem('partite-m-v1', JSON.stringify(state.molt));
  } catch (err) {
    console.error('Errore salvataggio moltiplicatori', err);
  }
}

export function saveMolt() {
  saveMoltLocal();
  notifyCallbacks();
}

export function saveCategoriesLocal() {
  try {
    localStorage.setItem('partite-cats-v1', JSON.stringify(state.categories));
  } catch (err) {
    console.error('Errore salvataggio categorie', err);
  }
}

export function saveCategories() {
  saveCategoriesLocal();
  notifyCallbacks();
}

export function saveNamesLocal() {
  try {
    localStorage.setItem('partite-names-v1', JSON.stringify(state.names));
  } catch (err) {
    console.error('Errore salvataggio nomi', err);
  }
}

export function saveNames() {
  saveNamesLocal();
  notifyCallbacks();
}

export function saveFipLinksLocal() {
  try {
    localStorage.setItem('partite-fip-v1', JSON.stringify(state.fipLinks));
  } catch (err) {
    console.error('Errore salvataggio fipLinks', err);
  }
}

export function saveFipLinks() {
  saveFipLinksLocal();
  notifyCallbacks();
}

// --------------------------------------------------------------------------
// GESTIONE UNDO
// --------------------------------------------------------------------------
export function pushUndo() {
  if (state.READONLY) return;
  try {
    const snapshot = {
      items: JSON.parse(JSON.stringify(state.items || [])),
      dayMeta: JSON.parse(JSON.stringify(state.dayMeta || {}))
    };
    state.undoStack = state.undoStack || [];
    state.undoStack.push(snapshot);
    if (state.undoStack.length > 20) state.undoStack.shift();
    refreshUndoBtn();
  } catch (e) {
    console.warn('Impossibile salvare snapshot undo', e);
  }
}

export function popUndoState() {
  if (!state.undoStack || !state.undoStack.length) return false;
  const snap = state.undoStack.pop();
  if (!snap) return false;

  state.items = snap.items;
  state.dayMeta = snap.dayMeta;

  saveLocalOnly();
  saveDLocalOnly();
  refreshUndoBtn();
  return true;
}

export function refreshUndoBtn() {
  const btn = document.getElementById('undoBtn');
  if (!btn) return;
  const count = (state.undoStack && state.undoStack.length) || 0;
  btn.disabled = count === 0;
  btn.title = count > 0 ? `Annulla (${count})` : 'Niente da annullare';
}

// --------------------------------------------------------------------------
// TEMA
// --------------------------------------------------------------------------
export function applyTheme(themeName) {
  const t = themeName || state.theme || 'light';
  state.theme = t;
  document.documentElement.setAttribute('data-theme', t);
}
