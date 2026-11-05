import { state, registerStateCallbacks, save, saveD, applyTheme, pushUndo, popUndoState } from './state.js';
import { sb, setSyncVisualState, cloudFetchRaw, applyCloudData, cloudPushNow, scheduleCloudPush, cloudPullSafe, setupSupabaseRealtime, registerCloudCallback } from './api.js';
import { uid, iso, monday, findConflictingMatches, isWithinOneDayOrLess, isMissingRequirements } from './rules.js';
import { copyMonthRecapWhatsApp, generateWhatsAppText } from './export.js';
import { $, params, setParam, renderNamesList, renderCategoriesList, updateIncompleteBadge, updateAlertStatusBadge, slotHTML, recapHTML, card, renderNavTree } from './render.js';
import { openEditModal, openAddModal, openQuickCloseModal, openCompensiDetailModal, openViewFileModal, openMoltModal, openResocontoModal, openConflictsModal, openUrgentIncompleteModal, openPendingModal, openSettingsModal, promptLogin } from './modals.js';

function isModalOpen() {
  return !!document.querySelector('.ov');
}

function triggerHaptic(type = 'light') {
  if (window.Telegram?.WebApp?.HapticFeedback) {
    if (type === 'success') window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
    else if (type === 'warning') window.Telegram.WebApp.HapticFeedback.notificationOccurred('warning');
    else window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
    return;
  }
  if (navigator.vibrate) {
    if (type === 'success') navigator.vibrate([30, 40, 40]);
    else if (type === 'warning') navigator.vibrate([50, 60, 50]);
    else navigator.vibrate(35);
  }
}

let toastTimer = null;
function toast(t, hapticType = 'light') {
  triggerHaptic(hapticType);
  const m = $('#msg');
  if (m) {
    m.textContent = t;
    m.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => m.classList.remove('on'), 2300);
  }
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(reg => {
    state.swRegistration = reg;
    reg.update();
  }).catch(() => {});
}

if (state.currentTheme !== 'default') {
  applyTheme(state.currentTheme);
}

registerStateCallbacks({
  onSave: scheduleCloudPush,
  onBadgeUpdate: () => {
    updateIncompleteBadge();
    updateAlertStatusBadge(
      () => openConflictsModal(render),
      () => openUrgentIncompleteModal(render),
      () => openPendingModal(render, triggerHaptic, toast),
      toast
    );
  }
});

registerCloudCallback(() => {
  renderNamesList();
  renderCategoriesList();
  render();
});

const openClose = d => `<div class="oc">${slotHTML(d, 'ap')}${slotHTML(d, 'ch')}</div>`;
function updateRecap(m) { const el = document.querySelector(`.recap[data-m="${m}"]`); if (el) el.outerHTML = recapHTML(m); }

export function render(focusId) {
  state.ready = false;
  const listEl = $('#list');
  if (!listEl) return;
  const idxOf = new Map(state.items.map((it, i) => [it.id, i]));
  const p = params();

  const qLower = state.searchQuery.toLowerCase().trim();
  const filtered = state.items.filter(i => {
    if (state.filterCat && i.cat !== state.filterCat) return false;
    if (state.filterIncomplete && !isMissingRequirements(i)) return false;
    if (qLower) {
      const matchText = [i.title, i.cat, i.t1, i.t2, i.arb, i.date, i.time].filter(Boolean).join(' ').toLowerCase();
      if (!matchText.includes(qLower)) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => a.date.localeCompare(b.date));
  const months = {};
  sorted.forEach(i => {
    const m = i.date.slice(0, 7);
    const w = iso(monday(i.date));
    ((months[m] ??= {})[w] ??= []).push(i);
  });

  const keys = Object.keys(months).sort();
  if (!keys.length) {
    listEl.innerHTML = '<div class="empty">Nessuna partita trovata.' + (!state.READONLY ? ' Tocca “+ Partita” per iniziare.' : '') + '</div>';
    const treeEl = document.getElementById('navTree');
    if (treeEl) treeEl.innerHTML = '<p style="color:var(--mute);font-size:12px;padding:6px">Nessuna gara</p>';
    updateIncompleteBadge();
    updateAlertStatusBadge(
      () => openConflictsModal(render),
      () => openUrgentIncompleteModal(render),
      () => openPendingModal(render, triggerHaptic, toast),
      toast
    );
    return;
  }

const nowM = iso(new Date()).slice(0, 7);
  let activeM = p.get('m');
  if (!activeM || !months[activeM]) {
    activeM = months[nowM] ? nowM : keys[0];
    setParam('m', activeM);
  }
  const activeW = p.get('s');

  renderNavTree(months, activeM, activeW);

  const fmt = (d, o) => d.toLocaleDateString('it-IT', o);
  const conflictsMap = findConflictingMatches();
  const label = fmt(new Date(activeM + '-15T12:00'), { month: 'long', year: 'numeric' });
  const count = Object.values(months[activeM]).reduce((n, a) => n + a.length, 0);

  const wkHtml = Object.keys(months[activeM]).sort().map(w => {
    const a = monday(w), b = new Date(a); b.setDate(b.getDate() + 6);
    const list = months[activeM][w];
    const isOpen = activeW ? activeW === w : true;
    const days = {};
    list.forEach(i => (days[i.date] ??= []).push(i));

    Object.values(days).forEach(arr => arr.sort((a, b) => {
      if (!a.time && !b.time) return (b.ts ?? idxOf.get(b.id)) - (a.ts ?? idxOf.get(a.id));
      if (!a.time) return -1;
      if (!b.time) return 1;
      return a.time.localeCompare(b.time);
    }));

    const dayHtml = Object.keys(days).sort().map(dt => {
      const isUrgentDay = isWithinOneDayOrLess(dt);
      return `<div class="day">
        <h4>${fmt(new Date(dt + 'T12:00'), { weekday: 'short', day: 'numeric', month: 'short' })}</h4>
        ${openClose(dt)}
        <div class="matches">${days[dt].map(it => card(it, conflictsMap.has(it.id), isUrgentDay && isMissingRequirements(it))).join('')}</div>
      </div>`;
    }).join('');

    return `<details class="week${activeW === w ? ' hl' : ''}" id="w-${w}" data-m="${activeM}" data-w="${w}"${isOpen ? ' open' : ''}>
      <summary>
        <span class="t">Settimana ${fmt(a, { day: 'numeric', month: 'short' })} – ${fmt(b, { day: 'numeric', month: 'short' })}</span>
        <span class="n">${list.length} ${list.length === 1 ? 'gara' : 'gare'}<button class="waBtn" data-wamsg="${w}" type="button" title="Copia turni">📲 WA</button></span>
      </summary>
      ${dayHtml}
    </details>`;
  }).join('');

  listEl.innerHTML = `<div class="selected-month-view">
    <div class="selected-month-header">
      <h2>
        ${label}
        <button class="waBtn" data-warecap="${activeM}" type="button" title="Copia riepilogo">📲 WA Riepilogo</button>
      </h2>
      <span style="color:var(--mute);font-weight:700;font-size:14px">${count} gare totali</span>
    </div>
    <div class="mbody">
      ${recapHTML(activeM)}
      <div class="mweeks">${wkHtml}</div>
    </div>
  </div>`;

  setTimeout(() => { state.ready = true; }, 150);
  updateIncompleteBadge();
  updateAlertStatusBadge(
    () => openConflictsModal(render),
    () => openUrgentIncompleteModal(render),
    () => openPendingModal(render, triggerHaptic, toast),
    toast
  );

  if (activeW) {
    const el = document.getElementById('w-' + activeW);
    if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  if (focusId) {
    const el = document.querySelector(`[data-id="${focusId}"]`);
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

function applyQuickPersonFilter(name) {
  const target = (name || '').trim();
  if (!target) return;
  const searchInput = $('#searchFilter');
  if (!searchInput) return;

  if (state.searchQuery.toLowerCase() === target.toLowerCase()) {
    state.searchQuery = '';
    searchInput.value = '';
    toast('Filtro persona rimosso');
  } else {
    state.searchQuery = target;
    searchInput.value = target;
    toast(`Filtro attivo: ${target}`);
  }
  render();
}

document.addEventListener('input', e => {
  if (state.READONLY) return;
  if (e.target.matches('[data-wn]')) {
    const sl = e.target.closest('.slot');
    (state.dayMeta[sl.dataset.d] ??= {})[sl.dataset.k + 'Nome'] = e.target.value;
    saveD();
    updateRecap(sl.dataset.d.slice(0, 7));
  }
});

document.addEventListener('click', e => {
  // Click su referto presente: visualizza anteprima
  const vfBtn = e.target.closest('[data-viewfile]');
  if (vfBtn) {
    e.stopPropagation();
    const it = state.items.find(x => x.id === vfBtn.dataset.viewfile);
    if (it && it.fileData) {
      openViewFileModal(it.fileData, it.fileName, it.title, triggerHaptic);
    }
    return;
  }

  // Click su referto assente: carica subito
  const upBtn = e.target.closest('[data-uploadfile]');
  if (upBtn) {
    e.stopPropagation();
    if (state.READONLY) {
      toast('Nessun referto disponibile per questa gara');
      return;
    }
    const it = state.items.find(x => x.id === upBtn.dataset.uploadfile);
    if (!it) return;

    const fileSelector = document.createElement('input');
    fileSelector.type = 'file';
    fileSelector.accept = 'application/pdf,image/*';
    fileSelector.onchange = ev => {
      const file = ev.target.files[0];
      if (!file) return;
      if (file.size > 8 * 1024 * 1024) {
        toast('File troppo grande (max 8MB)', 'warning');
        return;
      }
      const reader = new FileReader();
      reader.onload = uploadEv => {
        pushUndo();
        it.fileData = uploadEv.target.result;
        it.fileName = file.name;
        save();
        render();
        triggerHaptic('success');
        toast('Referto caricato con successo!', 'success');
      };
      reader.readAsDataURL(file);
    };
    fileSelector.click();
    return;
  }

  const compItem = e.target.closest('[data-compname]');
  if (compItem && !e.target.closest('button')) {
    e.stopPropagation();
    openCompensiDetailModal(
      compItem.dataset.compname,
      { p: +compItem.dataset.p, a: +compItem.dataset.a, c: +compItem.dataset.c },
      compItem.dataset.m || '',
      triggerHaptic,
      toast,
      updateRecap
    );
    return;
  }

  const qPerson = e.target.closest('[data-quickperson]');
  if (qPerson) {
    e.stopPropagation();
    triggerHaptic('light');
    applyQuickPersonFilter(qPerson.dataset.quickperson);
    return;
  }

  const pickM = e.target.closest('[data-pickm]');
  if (pickM) {
    e.preventDefault();
    setParam('m', pickM.dataset.pickm, render);
    setParam('s', '', render);
    triggerHaptic('light');
    return;
  }

  const pickW = e.target.closest('[data-navw]');
  if (pickW) {
    e.preventDefault();
    setParam('m', pickW.dataset.navm, render);
    setParam('s', pickW.dataset.navw, render);
    triggerHaptic('light');
    return;
  }

  const gh = e.target.closest('[data-ghost]');
  if (gh && !state.READONLY) {
    e.stopPropagation();
    const id = gh.closest('.match').dataset.id;
    const it = state.items.find(x => x.id === id); if (!it) return;

    if (it.ghost && it.status !== 'rinviata') {
      pushUndo();
      it.ghost = false;
      it.status = '';
      save();
      render();
      triggerHaptic('light');
      toast('Check rimosso', 'warning');
    } else {
      openQuickCloseModal(id, triggerHaptic, toast, render);
    }
    return;
  }

  const editBtn = e.target.closest('[data-edit]');
  if (editBtn && !state.READONLY) {
    e.stopPropagation();
    const id = editBtn.closest('.match')?.dataset?.id;
    if (id) {
      const it = state.items.find(x => x.id === id);
      if (it?.ghost && it.status !== 'rinviata') {
        toast('Togli prima il check ✓ per modificare', 'warning');
        return;
      }
      triggerHaptic('light');
      openEditModal(id, triggerHaptic, toast, render);
    }
    return;
  }

  const matchCard = e.target.closest('.match');
  if (matchCard && !state.READONLY && !e.target.closest('button') && !e.target.closest('a')) {
    const it = state.items.find(x => x.id === matchCard.dataset.id);
    if (it?.ghost && it.status !== 'rinviata') {
      toast('Partita con check: togli il ✓ per modificarla');
      return;
    }
    triggerHaptic('light');
    openEditModal(matchCard.dataset.id, triggerHaptic, toast, render);
    return;
  }

  const warecap = e.target.closest('[data-warecap]');
  if (warecap) {
    e.preventDefault(); e.stopPropagation();
    copyMonthRecapWhatsApp(warecap.dataset.warecap, toast);
    return;
  }

  const wa = e.target.closest('[data-wamsg]');
  if (wa) {
    e.preventDefault(); e.stopPropagation();
    const mon = monday(wa.dataset.wamsg);
    const start = new Date(mon);
    start.setDate(start.getDate() + 2);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    generateWhatsAppText(start, end, null, toast);
    return;
  }

  const yn = e.target.closest('[data-yn]');
  if (yn && !state.READONLY) {
    triggerHaptic('light');
    const sl = yn.closest('.slot'), d = sl.dataset.d, k = sl.dataset.k, wk = (state.dayMeta[d] ??= {});
    pushUndo();
    wk[k] = yn.dataset.yn;
    if (wk[k] === 'no') delete wk[k + 'Nome'];
    saveD();
    updateRecap(d.slice(0, 7));
    sl.outerHTML = slotHTML(d, k);
    if (wk[k] === 'si') {
      const n = document.querySelector(`.slot[data-d="${d}"][data-k="${k}"] input`);
      if (n) n.focus();
    }
    return;
  }

  const nb = e.target.closest('[data-name]');
  if (nb) {
    triggerHaptic('light');
    if (state.READONLY) {
      applyQuickPersonFilter(nb.dataset.name);
    } else {
      openMoltModal(nb.dataset.name, { p: +nb.dataset.p, a: +nb.dataset.a, c: +nb.dataset.c }, nb.dataset.m, toast, updateRecap);
    }
    return;
  }
});

document.addEventListener('toggle', e => {
  if (!state.ready || !e.target.open) return;
  if (e.target.matches('details.week')) {
    setParam('m', e.target.dataset.m, render);
    setParam('s', e.target.dataset.w, render);
  }
}, true);

function setAuthMode(isAdmin) {
  state.READONLY = !isAdmin;
  const isReadOnlyAllowed = sessionStorage.getItem('partite_readonly_allowed') === '1';

  if (document.body) {
    document.body.classList.toggle('ro', state.READONLY);
    document.body.classList.toggle('locked', !isAdmin && !isReadOnlyAllowed);
  }

  const authBtn = $('#authBtn');
  if (authBtn) {
    authBtn.innerHTML = isAdmin ? '<span class="icon">🔓</span><span class="label">Esci</span>' : '<span class="icon">🔒</span><span class="label">Accedi</span>';
    authBtn.title = isAdmin ? 'Termina sessione amministratore' : 'Accedi come Amministratore per modificare';
  }
  render();
}

window.handleAuthClick = async function() {
  if (state.READONLY) {
    promptLogin(triggerHaptic, toast, setAuthMode);
  } else {
    sessionStorage.removeItem('partite_readonly_allowed');
    if (sb) await sb.auth.signOut();
    setAuthMode(false);
    toast('Disconnesso: accesso bloccato');
  }
};

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
      newItems.push({
        id: uid(),
        date: d,
        title: p.partita || '',
        cat: p.cat || '',
        t1: p.tavolo1 || '',
        t2: p.tavolo2 || '',
        arb: p.arbitro || '',
        time: p.orario || '',
        friendly: !!p.amichevole,
        score: p.score || '',
        status: p.status || '',
        fileData: p.fileData || null,
        fileName: p.fileName || null,
        ghost: false
      });
    });
  });
  return { newItems, wi };
}

function bindEvents() {
  const authBtn = $('#authBtn');
  if (authBtn) authBtn.onclick = () => window.handleAuthClick();

  const sidebar = $('#appSidebar');
  const sidebarToggle = $('#sidebarToggleBtn');
  const mobileMenuBtn = $('#mobileMenuBtn');
  const navBackdrop = $('#navBackdrop');

  if (sidebarToggle) {
    sidebarToggle.onclick = e => {
      e.stopPropagation();
      triggerHaptic('light');
      sidebar.classList.toggle('expanded');
    };
  }

  if (sidebar) {
    sidebar.addEventListener('click', () => {
      if (window.innerWidth >= 860 && !sidebar.classList.contains('expanded')) {
        sidebar.classList.add('expanded');
        triggerHaptic('light');
      }
    });
  }

  const openMobileDrawer = () => {
    triggerHaptic('light');
    sidebar.classList.add('open');
    navBackdrop.classList.add('open');
  };

  const closeMobileDrawer = () => {
    sidebar.classList.remove('open');
    navBackdrop.classList.remove('open');
  };

  if (mobileMenuBtn) mobileMenuBtn.onclick = openMobileDrawer;
  if (navBackdrop) navBackdrop.onclick = closeMobileDrawer;

  document.addEventListener('click', e => {
    if (e.target.closest('[data-pickm]') || e.target.closest('[data-navw]')) {
      if (window.innerWidth < 860) closeMobileDrawer();
    }
  });

  const railHome = $('#railNavHome');
  if (railHome) railHome.onclick = () => {
    const t = iso(new Date());
    setParam('m', t.slice(0, 7), render);
    if (window.innerWidth < 860) closeMobileDrawer();
  };

  const railRes = $('#railNavResoconto');
  if (railRes) railRes.onclick = () => {
    if (window.innerWidth < 860) closeMobileDrawer();
    openResocontoModal(triggerHaptic, toast, updateRecap);
  };

  const railSettings = $('#railNavSettings');
  if (railSettings) railSettings.onclick = () => openSettingsModal(toast, render);

  const todayTopBtn = $('#todayBtn');
  if (todayTopBtn) {
    todayTopBtn.onclick = () => {
      triggerHaptic('light');
      const t = iso(new Date());
      setParam('m', t.slice(0, 7), render);
      setParam('s', iso(monday(t)), render);
    };
  }

  const bNavHome = $('#bNavHome');
  if (bNavHome) bNavHome.onclick = () => {
    triggerHaptic('light');
    const t = iso(new Date());
    setParam('m', t.slice(0, 7), render);
    setParam('s', '', render);
  };

  const bNavToday = $('#bNavToday');
  if (bNavToday) bNavToday.onclick = () => {
    triggerHaptic('light');
    const t = iso(new Date());
    setParam('m', t.slice(0, 7), render);
    setParam('s', iso(monday(t)), render);
  };

  const bNavAdd = $('#bNavAdd');
  if (bNavAdd) bNavAdd.onclick = () => openAddModal(triggerHaptic, toast, render);

  const bNavRes = $('#bNavResoconto');
  if (bNavRes) bNavRes.onclick = () => openResocontoModal(triggerHaptic, toast, updateRecap);

  const bNavAlerts = $('#bNavAlerts');
  if (bNavAlerts) bNavAlerts.onclick = () => {
    const btn = document.getElementById('conflictAlertBtn');
    if (btn) btn.click();
  };

  const qSave = $('#quickSaveBtn');
  if (qSave) qSave.onclick = async () => {
    const ok = await cloudPushNow();
    toast(ok ? 'Salvataggio completato!' : 'Errore salvataggio', ok ? 'success' : 'warning');
  };

  const qPull = $('#quickPullBtn');
  if (qPull) qPull.onclick = async () => {
    await cloudPullSafe(false);
    render();
    toast('Aggiornato!', 'success');
  };

  const addBtn = $('#add');
  if (addBtn) addBtn.onclick = () => openAddModal(triggerHaptic, toast, render);

  const waToday = $('#waTodayBtn');
  if (waToday) waToday.onclick = () => {
    const start = new Date();
    start.setHours(12, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    generateWhatsAppText(start, end, null, toast);
  };

  const undoB = $('#undoBtn');
  if (undoB) {
    undoB.disabled = true;
    undoB.onclick = () => {
      if (popUndoState()) {
        render();
        toast('Modifica annullata', 'warning');
      }
    };
  }

  const searchInput = $('#searchFilter');
  if (searchInput) {
    searchInput.oninput = e => {
      state.searchQuery = e.target.value;
      render();
    };
  }

  const fCat = $('#filterCat');
  if (fCat) fCat.onchange = e => { state.filterCat = e.target.value; render(); };

  const fInc = $('#filterIncomplete');
  if (fInc) {
    fInc.onclick = () => {
      triggerHaptic('light');
      state.filterIncomplete = !state.filterIncomplete;
      fInc.setAttribute('aria-pressed', String(state.filterIncomplete));
      render();
    };
  }

  const impF = $('#importFile');
  if (impF) {
    impF.onchange = e => {
      if (state.READONLY) return;
      const file = e.target.files[0]; e.target.value = ''; if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          if (!Array.isArray(data)) throw new Error();
          const { newItems, wi } = fromExportFormat(data);
          pushUndo();
          const map = new Map(state.items.map(i => [i.id, i]));
          newItems.forEach(i => map.set(i.id, i));
          state.items = [...map.values()];
          Object.assign(state.dayMeta, wi);
          save(); saveD(); render();
          toast(`${newItems.length} partite importate`, 'success');
        } catch(err) { toast('File non valido', 'warning'); }
      };
      reader.readAsText(file);
    };
  }
}

window.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    if (e.shiftKey) return;
    e.preventDefault();
    if (popUndoState()) {
      render();
      toast('Modifica annullata', 'warning');
    }
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    if (!state.READONLY) cloudPushNow().then(() => toast('Modifiche salvate', 'success'));
  }
  if (e.key === 'Escape') {
    const modals = document.querySelectorAll('.ov');
    if (modals.length) modals.forEach(m => m.remove());
  }
});

window.addEventListener('DOMContentLoaded', async () => {
  if (window.Telegram?.WebApp) {
    try {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
      if (window.Telegram.WebApp.setHeaderColor) {
        window.Telegram.WebApp.setHeaderColor('#131415');
      }
    } catch(e) {}
  }

  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = params();
  const hasReadOnlyParam = searchParams.get('readonly') === 'true' || hashParams.get('readonly') === 'true';

  if (hasReadOnlyParam) {
    sessionStorage.setItem('partite_readonly_allowed', '1');
  }

  bindEvents();
  renderNamesList();
  renderCategoriesList();

  if (sb) {
    const { data: { session } } = await sb.auth.getSession();
    setAuthMode(!!session);
    sb.auth.onAuthStateChange((_event, session) => {
      setAuthMode(!!session);
    });
  } else {
    setAuthMode(false);
  }

  window.addEventListener('hashchange', () => {
    state.mem = null;
    render();
  });

  render();

  if (sb) {
    setSyncVisualState('orange', 'Controllo aggiornamenti...');
    try {
      const res = await cloudFetchRaw();
      if (res && res.data) {
        applyCloudData(res.data);
        render();
        setSyncVisualState('green', 'Sincronizzato Cloud');
      } else {
        setSyncVisualState('green');
      }
    } catch(e) {
      setSyncVisualState('red', 'Cloud non raggiungibile');
    }

    setupSupabaseRealtime({
      isModalOpen,
      onRealtimeUpdate: () => {
        render();
        triggerHaptic('light');
      }
    });
  } else {
    setSyncVisualState('green', 'Memoria locale attiva');
  }
});
