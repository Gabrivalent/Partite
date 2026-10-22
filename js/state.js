// GESTIONE STATO GLOBALE E STORAGE
const STORAGE_KEY_ITEMS = 'partite_items_v2';
const STORAGE_KEY_DAYMETA = 'partite_meta_v2';
const STORAGE_KEY_MOLT = 'partite_molt_v1';
const STORAGE_KEY_NAMES = 'partite_names_v1';
const STORAGE_KEY_CATEGORIES = 'partite_categories_v1';
const STORAGE_KEY_FIP_LINKS = 'partite_fip_links_v1';
const STORAGE_KEY_THEME = 'partite_theme_v1';

const DEFAULT_FIP_LINKS = {
  'U13': 'https://fip.it/risultati/?group=campionati-regionali&regione_codice=EM&comitato_codice=REM&sesso=M&codice_campionato=U13S/M&codice_fase=1&codice_girone=86464',
  'U13S': 'https://fip.it/risultati/?group=campionati-regionali&regione_codice=EM&comitato_codice=REM&sesso=M&codice_campionato=U13S/M&codice_fase=1&codice_girone=86464',
  'U13S/M': 'https://fip.it/risultati/?group=campionati-regionali&regione_codice=EM&comitato_codice=REM&sesso=M&codice_campionato=U13S/M&codice_fase=1&codice_girone=86464',
  'U14': 'https://fip.it/risultati/?group=campionati-regionali&regione_codice=EM&comitato_codice=REM&sesso=M&codice_campionato=U14S/M&codice_fase=1&codice_girone=86449',
  'U14S': 'https://fip.it/risultati/?group=campionati-regionali&regione_codice=EM&comitato_codice=REM&sesso=M&codice_campionato=U14S/M&codice_fase=1&codice_girone=86449',
  'U14S/M': 'https://fip.it/risultati/?group=campionati-regionali&regione_codice=EM&comitato_codice=REM&sesso=M&codice_campionato=U14S/M&codice_fase=1&codice_girone=86449',
  'U15': 'https://fip.it/risultati/?group=campionati-regionali&regione_codice=EM&comitato_codice=REM&sesso=M&codice_campionato=U15G/M&codice_fase=1&codice_girone=85540',
  'U15G': 'https://fip.it/risultati/?group=campionati-regionali&regione_codice=EM&comitato_codice=REM&sesso=M&codice_campionato=U15G/M&codice_fase=1&codice_girone=85540',
  'U15G/M': 'https://fip.it/risultati/?group=campionati-regionali&regione_codice=EM&comitato_codice=REM&sesso=M&codice_campionato=U15G/M&codice_fase=1&codice_girone=85540',
  'U17': 'https://fip.it/risultati/?group=campionati-regionali&regione_codice=EM&comitato_codice=REM&sesso=M&codice_campionato=U17S/M&codice_fase=1&codice_girone=86381',
  'U17S': 'https://fip.it/risultati/?group=campionati-regionali&regione_codice=EM&comitato_codice=REM&sesso=M&codice_campionato=U17S/M&codice_fase=1&codice_girone=86381',
  'U17S/M': 'https://fip.it/risultati/?group=campionati-regionali&regione_codice=EM&comitato_codice=REM&sesso=M&codice_campionato=U17S/M&codice_fase=1&codice_girone=86381',
  'U19': 'https://fip.it/risultati/?group=campionati-regionali&regione_codice=EM&comitato_codice=REM&sesso=M&codice_campionato=U19S/M&codice_fase=1&codice_girone=86357',
  'U19S': 'https://fip.it/risultati/?group=campionati-regionali&regione_codice=EM&comitato_codice=REM&sesso=M&codice_campionato=U19S/M&codice_fase=1&codice_girone=86357',
  'U19S/M': 'https://fip.it/risultati/?group=campionati-regionali&regione_codice=EM&comitato_codice=REM&sesso=M&codice_campionato=U19S/M&codice_fase=1&codice_girone=86357'
};

export const state = {
  items: JSON.parse(localStorage.getItem(STORAGE_KEY_ITEMS) || '[]'),
  dayMeta: JSON.parse(localStorage.getItem(STORAGE_KEY_DAYMETA) || '{}'),
  molt: JSON.parse(localStorage.getItem(STORAGE_KEY_MOLT) || '{}'),
  names: JSON.parse(localStorage.getItem(STORAGE_KEY_NAMES) || '[]'),
  categories: JSON.parse(localStorage.getItem(STORAGE_KEY_CATEGORIES) || '["U13","U14","U15","U17","U19","DR1","Minibasket"]'),
  fipLinks: JSON.parse(localStorage.getItem(STORAGE_KEY_FIP_LINKS) || JSON.stringify(DEFAULT_FIP_LINKS)),
  currentTheme: localStorage.getItem(STORAGE_KEY_THEME) || 'default',
  READONLY: true,
  undoStack: [],
  maxUndo: 15,
  ready: false,
  mem: null,
  pdfCandidates: [],
  filterCat: '',
  filterIncomplete: false,
  searchQuery: '',
  swRegistration: null
};

let onSaveCallbacks = [];
let onBadgeUpdateCallbacks = [];

export function registerStateCallbacks({ onSave, onBadgeUpdate }) {
  if (onSave) onSaveCallbacks.push(onSave);
  if (onBadgeUpdate) onBadgeUpdateCallbacks.push(onBadgeUpdate);
}

function notifySave() {
  onSaveCallbacks.forEach(fn => fn());
  onBadgeUpdateCallbacks.forEach(fn => fn());
}

export function save() {
  localStorage.setItem(STORAGE_KEY_ITEMS, JSON.stringify(state.items));
  notifySave();
}

export function saveD() {
  localStorage.setItem(STORAGE_KEY_DAYMETA, JSON.stringify(state.dayMeta));
  notifySave();
}

export function saveMolt() {
  localStorage.setItem(STORAGE_KEY_MOLT, JSON.stringify(state.molt));
  notifySave();
}

export function saveNames() {
  localStorage.setItem(STORAGE_KEY_NAMES, JSON.stringify(state.names));
  notifySave();
}

export function saveCategoriesLocal() {
  localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(state.categories));
  notifySave();
}

// Alias per compatibilità con altre sezioni o import
export const saveCategories = saveCategoriesLocal;

export function saveFipLinks() {
  localStorage.setItem(STORAGE_KEY_FIP_LINKS, JSON.stringify(state.fipLinks));
  notifySave();
}

export function applyTheme(t) {
  state.currentTheme = t;
  localStorage.setItem(STORAGE_KEY_THEME, t);
  if (t === 'default') {
    document.body.removeAttribute('data-theme');
  } else {
    document.body.setAttribute('data-theme', t);
  }
}

export function pushUndo() {
  state.undoStack.push({
    items: JSON.parse(JSON.stringify(state.items)),
    dayMeta: JSON.parse(JSON.stringify(state.dayMeta))
  });
  if (state.undoStack.length > state.maxUndo) state.undoStack.shift();
  const btn = document.getElementById('undoBtn');
  if (btn) btn.disabled = false;
}

export function popUndoState() {
  if (!state.undoStack.length) return false;
  const last = state.undoStack.pop();
  state.items = last.items;
  state.dayMeta = last.dayMeta;
  localStorage.setItem(STORAGE_KEY_ITEMS, JSON.stringify(state.items));
  localStorage.setItem(STORAGE_KEY_DAYMETA, JSON.stringify(state.dayMeta));
  const btn = document.getElementById('undoBtn');
  if (btn) btn.disabled = state.undoStack.length === 0;
  notifySave();
  return true;
}
