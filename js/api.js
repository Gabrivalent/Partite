import { state, saveLocalOnly, saveDLocalOnly } from './state.js';
import { STORAGE_KEYS } from './config.js';

export let sb = null;

const SUPABASE_URL = 'https://tuo-progetto.supabase.co';
const SUPABASE_ANON_KEY = 'tua-chiave-anon';

if (window.supabase && SUPABASE_URL !== 'https://tuo-progetto.supabase.co') {
  try {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch(e) {
    console.warn('Impossibile inizializzare Supabase', e);
  }
}

let syncStateCallbacks = [];
export function registerCloudCallback(cb) {
  syncStateCallbacks.push(cb);
}

export function setSyncVisualState(status, text) {
  const dot = document.getElementById('syncDot');
  const txt = document.getElementById('syncTextStatus');
  if (!dot) return;

  dot.className = 'sync-dot ' + status;
  if (txt && text) txt.textContent = text;
}

// Coda offline: se non c'è internet, salviamo lo stato di "modifiche in sospeso"
let isSyncing = false;

export async function cloudPushNow() {
  if (!sb) {
    setSyncVisualState('green', 'Locale (No Cloud)');
    return true;
  }

  // Se il browser è offline, blocchiamo il tentativo e lo segnamo come offline
  if (!navigator.onLine) {
    setSyncVisualState('orange', 'Offline - Modifiche salvate localmente');
    state.isDirty = true;
    return false;
  }

  setSyncVisualState('orange', 'Salvataggio in corso...');
  try {
    const payload = {
      items: state.items,
      dayMeta: state.dayMeta,
      molt: state.molt,
      names: state.names,
      categories: state.categories,
      updated_at: new Date().toISOString()
    };

    const { error } = await sb
      .from('user_data')
      .upsert({ id: 'main_store', data: payload });

    if (error) throw error;

    state.isDirty = false;
    setSyncVisualState('green', 'Sincronizzato Cloud');
    return true;
  } catch(e) {
    console.error('Errore push cloud:', e);
    setSyncVisualState('red', 'Errore sincronizzazione');
    state.isDirty = true;
    return false;
  }
}

let pushTimer = null;
export function scheduleCloudPush() {
  saveLocalOnly();
  if (!sb) return;

  if (!navigator.onLine) {
    setSyncVisualState('orange', 'Offline - In attesa di rete...');
    state.isDirty = true;
    return;
  }

  setSyncVisualState('orange', 'Modifiche non salvate...');
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    cloudPushNow();
  }, 1200);
}

export async function cloudFetchRaw() {
  if (!sb || !navigator.onLine) return null;
  try {
    const { data, error } = await sb
      .from('user_data')
      .select('data')
      .eq('id', 'main_store')
      .single();

    if (error) return null;
    return data;
  } catch(e) {
    return null;
  }
}

export function applyCloudData(remoteData) {
  if (!remoteData) return;
  if (Array.isArray(remoteData.items)) {
    state.items = remoteData.items;
    localStorage.setItem(STORAGE_KEYS.ITEMS, JSON.stringify(state.items));
  }
  if (remoteData.dayMeta) {
    state.dayMeta = remoteData.dayMeta;
    localStorage.setItem(STORAGE_KEYS.DAYS, JSON.stringify(state.dayMeta));
  }
  if (remoteData.molt) {
    state.molt = remoteData.molt;
    localStorage.setItem(STORAGE_KEYS.MOLT, JSON.stringify(state.molt));
  }
  if (Array.isArray(remoteData.names)) {
    state.names = remoteData.names;
    localStorage.setItem(STORAGE_KEYS.NAMES, JSON.stringify(state.names));
  }
  if (Array.isArray(remoteData.categories)) {
    state.categories = remoteData.categories;
    localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(state.categories));
  }

  syncStateCallbacks.forEach(cb => cb());
}

export async function cloudPullSafe(showAlert = true) {
  if (!sb) return;
  if (!navigator.onLine) {
    setSyncVisualState('orange', 'Sei offline');
    return;
  }
  try {
    const res = await cloudFetchRaw();
    if (res && res.data) {
      applyCloudData(res.data);
      setSyncVisualState('green', 'Aggiornato da Cloud');
    }
  } catch(e) {
    setSyncVisualState('red', 'Errore connessione');
  }
}

export function setupSupabaseRealtime({ isModalOpen, onRealtimeUpdate }) {
  if (!sb) return;

  // Ascoltatori nativi di rete del browser per gestire l'offline in tempo reale
  window.addEventListener('online', () => {
    setSyncVisualState('orange', 'Connessione ristabilita, sync...');
    if (state.isDirty) {
      cloudPushNow(); // Sincronizza subito le modifiche fatte offline
    } else {
      cloudPullSafe(false);
    }
  });

  window.addEventListener('offline', () => {
    setSyncVisualState('orange', 'Modalità offline attiva');
  });

  try {
    sb.channel('public:user_data')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_data', filter: 'id=eq.main_store' }, payload => {
        if (isModalOpen && isModalOpen()) return;
        if (payload.new && payload.new.data) {
          applyCloudData(payload.new.data);
          if (onRealtimeUpdate) onRealtimeUpdate();
        }
      })
      .subscribe();
  } catch(e) {}
}
