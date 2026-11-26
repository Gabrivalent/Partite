import { SUPABASE_CONFIG } from './config.js';
import {
  state,
  saveLocalOnly,
  saveDLocalOnly,
  saveMoltLocal,
  saveNamesLocal,
  saveCategoriesLocal,
  saveFipLinksLocal
} from './state.js';

export let sb = null;
try {
  if (window.supabase && SUPABASE_CONFIG.url && SUPABASE_CONFIG.key) {
    sb = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key);
  }
} catch(e) {
  sb = null;
}

let lastSyncedUpdatedAt = null;
let isPushing = false;
let pushQueued = false;

export function setSyncVisualState(syncState, tooltip) {
  const dot = document.getElementById('syncDot');
  const wrap = document.getElementById('railSyncWrap');
  if (!wrap || !dot) return;
  wrap.style.display = 'flex';
  if (syncState === 'orange') {
    dot.className = 'sync-dot sync-orange';
    dot.title = tooltip || 'Sincronizzazione in corso…';
  } else if (syncState === 'green') {
    dot.className = 'sync-dot sync-green';
    dot.title = tooltip || (sb ? 'Sincronizzato Cloud' : 'Memoria locale');
  } else if (syncState === 'red') {
    dot.className = 'sync-dot sync-red';
    dot.title = tooltip || 'Cloud non raggiungibile';
  }
}

export async function uploadMatchReportFile(matchId, file) {
  if (!sb) throw new Error('Cloud Supabase non disponibile');
  const fileExt = file.name.split('.').pop();
  const fileNameClean = `${matchId}_${Date.now()}.${fileExt}`;

  const { error } = await sb.storage
    .from('match-reports')
    .upload(fileNameClean, file);

  if (error) throw error;

  const { data } = sb.storage
    .from('match-reports')
    .getPublicUrl(fileNameClean);

  return {
    publicUrl: data.publicUrl,
    originalName: file.name
  };
}

export async function cloudFetchRaw() {
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from('partite_board')
      .select('data, updated_at')
      .eq('id', SUPABASE_CONFIG.board)
      .maybeSingle();

    if (error) {
      console.error('Errore lettura da Supabase:', error);
      return null;
    }
    if (!data) return null;

    lastSyncedUpdatedAt = data.updated_at || null;
    return {
      data: data.data || null,
      updated_at: data.updated_at || null
    };
  } catch(e) {
    console.error('Errore di connessione Supabase:', e);
    return null;
  }
}

let onCloudDataAppliedCallback = null;
export function registerCloudCallback(cb) {
  onCloudDataAppliedCallback = cb;
}

export function applyCloudData(payload, updatedAt = null) {
  if (!payload) return;
  const raw = payload.data ? payload.data : payload;

  const cloudItems = Array.isArray(raw.items) ? raw.items : [];
  if (cloudItems.length === 0 && state.items.length > 0 && !state.isDirty) {
    return;
  }

  state.items = cloudItems;
  state.dayMeta = raw.dayMeta && typeof raw.dayMeta === 'object' ? raw.dayMeta : {};
  state.molt = raw.molt && typeof raw.molt === 'object' ? raw.molt : {};
  state.names = Array.isArray(raw.names) ? raw.names : [];
  state.categories = Array.isArray(raw.categories) ? raw.categories : [];
  if (raw.fipLinks && typeof raw.fipLinks === 'object') {
    state.fipLinks = Object.assign({}, state.fipLinks, raw.fipLinks);
  }

  if (updatedAt) {
    lastSyncedUpdatedAt = updatedAt;
  }

  saveLocalOnly();
  saveDLocalOnly();
  saveMoltLocal();
  saveNamesLocal();
  saveCategoriesLocal();
  saveFipLinksLocal();
  state.isDirty = false;

  if (onCloudDataAppliedCallback) onCloudDataAppliedCallback();
}

export async function cloudPushNow() {
  if (!sb || state.READONLY) return false;

  if (!navigator.onLine) {
    setSyncVisualState('orange', 'In attesa di connessione per salvare…');
    return false;
  }

  if (isPushing) {
    pushQueued = true;
    return true;
  }

  isPushing = true;
  setSyncVisualState('orange');

  try {
    // 1. Controllo di concorrenza ottimistica: verifichiamo che nessuno abbia salvato dopo la nostra ultima lettura
    if (lastSyncedUpdatedAt) {
      const { data: checkData, error: checkError } = await sb
        .from('partite_board')
        .select('updated_at')
        .eq('id', SUPABASE_CONFIG.board)
        .maybeSingle();

      if (!checkError && checkData && checkData.updated_at) {
        const remoteTime = new Date(checkData.updated_at).getTime();
        const localTime = new Date(lastSyncedUpdatedAt).getTime();
        // Conflitto rilevato: se la versione remota è più recente di oltre 2 secondi
        if (remoteTime > localTime + 2000) {
          console.warn('Conflitto rilevato: la versione sul Cloud è più recente.');
          setSyncVisualState('red', 'Conflitto: dati modificati altrove');
          isPushing = false;
          // Eseguiamo un pull sicuro per allineare i dati
          await cloudPullSafe(false);
          return false;
        }
      }
    }

    const newTimestamp = new Date().toISOString();
    const { error } = await sb.from('partite_board').upsert({
      id: SUPABASE_CONFIG.board,
      data: {
        items: state.items,
        dayMeta: state.dayMeta,
        molt: state.molt,
        names: state.names,
        categories: state.categories,
        fipLinks: state.fipLinks
      },
      updated_at: newTimestamp
    });

    if (error) {
      if (error.code === 'PGRST301' || error.message?.includes('JWT')) {
        console.error('Sessione scaduta o non autorizzata:', error);
        window.handleAuthClick && window.handleAuthClick();
      }
      throw error;
    }

    lastSyncedUpdatedAt = newTimestamp;
    state.isDirty = false;
    setSyncVisualState('green', 'Sincronizzato Cloud');
    isPushing = false;

    if (pushQueued) {
      pushQueued = false;
      setTimeout(cloudPushNow, 300);
    }
    return true;
  } catch (err) {
    console.error('Errore durante il salvataggio Cloud:', err);
    setSyncVisualState('red', 'Errore durante il salvataggio');
    isPushing = false;
    return false;
  }
}

let syncTimer = null;
export function scheduleCloudPush() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(cloudPushNow, 1000);
}

export async function cloudPullSafe(silent) {
  if (!sb) return false;
  if (!silent) setSyncVisualState('orange');
  try {
    const res = await cloudFetchRaw();
    if (res && res.data) {
      applyCloudData(res.data, res.updated_at);
      setSyncVisualState('green', 'Sincronizzato Cloud');
      return true;
    }
    setSyncVisualState('green');
    return false;
  } catch(e) {
    console.error('Errore durante il caricamento Cloud:', e);
    setSyncVisualState('red', 'Cloud non raggiungibile');
    return false;
  }
}

// Auto-retry quando torna la connessione Internet
window.addEventListener('online', () => {
  if (state.isDirty && !state.READONLY) {
    cloudPushNow();
  } else {
    cloudPullSafe(true);
  }
});

export function setupSupabaseRealtime({ isModalOpen, onRealtimeUpdate }) {
  if (!sb) return;
  try {
    sb.channel('realtime_partite_board')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'partite_board', filter: `id=eq.${SUPABASE_CONFIG.board}` },
        payload => {
          if (payload.new && payload.new.data) {
            if (!state.isDirty && !isModalOpen()) {
              applyCloudData(payload.new.data, payload.new.updated_at);
              if (onRealtimeUpdate) onRealtimeUpdate();
              setSyncVisualState('green', 'Aggiornato in tempo reale');
            }
          }
        }
      )
      .subscribe(status => {
        if (status === 'SUBSCRIBED') setSyncVisualState('green', 'Connesso Realtime');
      });
  } catch (e) {
    console.warn('Realtime fallback attivo', e);
  }
}
