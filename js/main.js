import { 
  state, 
  pushUndo, 
  popUndoState, 
  save, 
  saveD, 
  applyTheme, 
  logEvent,
  registerStateCallbacks 
} from './state.js';
import { 
  sb, 
  cloudPullSafe, 
  setupSupabaseRealtime, 
  scheduleCloudPush,
  registerCloudCallback 
} from './api.js';
import { iso, monday, isRefereeNeeded } from './rules.js';
import { 
  params, 
  writeHash, 
  setParam, 
  renderNamesList, 
  renderCategoriesList, 
  updateIncompleteBadge, 
  updateAlertStatusBadge, 
  slotHTML, 
  recapHTML, 
  card, 
  renderNavTree, 
  renderHistoryView,
  esc 
} from './render.js';
import { 
  openAddModal, 
  openEditModal, 
  openQuickCloseModal, 
  openCompensiDetailModal, 
  openResocontoModal, 
  openConflictsModal, 
  openUrgentIncompleteModal, 
  openPendingModal, 
  openSettingsModal, 
  openViewFileModal,
  promptLogin 
} from './modals.js';
import { 
  generateWhatsAppText, 
  copyMonthRecapWhatsApp, 
  copyReadOnlyLink 
} from './export.js';

let toastTimeout = null;
export function toast(msg, type = 'normal') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast show' + (type === 'warning' ? ' toast-warning' : (type === 'success' ? ' toast-success' : ''));
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    el.className = 'toast';
  }, 2400);
}

export function triggerHaptic(type = 'light') {
  if (!navigator.vibrate) return;
  if (type === 'light') navigator.vibrate(12);
  else if (type === 'medium') navigator.vibrate(28);
  else if (type === 'warning') navigator.vibrate([30, 50, 30]);
}

export function updateRecap(m) {
  const aside = document.querySelector('.recap');
  if (!aside) return;
  aside.outerHTML = recapHTML(m);
}

function hideAccessGate() {
  const gateIds = ['authGateModal', 'accessGateModal', 'loginGate', 'authGate', 'gateModal', 'authOverlay'];
  gateIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.setProperty('display', 'none', 'important');
  });
  document.querySelectorAll('.auth-gate-overlay, .gate-overlay, .login-gate-overlay, .access-gate').forEach(el => {
    el.style.setProperty('display', 'none', 'important');
    el.classList.remove('active', 'show');
  });
}

export function render() {
  const p = params();
  const todayIso = iso(new Date());
  const activeMonth = p.get('m') || todayIso.slice(0, 7);
  const activeWeek = p.get('s') || iso(monday(todayIso));
  const filterPerson = (p.get('person') || '').trim().toLowerCase();

  const isHistoryView = p.get('view') === 'history';
  const histViewEl = document.getElementById('historyView');
  const calViewEl = document.getElementById('calendarView');
  const bNavCal = document.getElementById('bNavCal');
  const bNavHist = document.getElementById('bNavHistory');

  if (isHistoryView) {
    if (histViewEl) histViewEl.style.display = 'block';
    if (calViewEl) calViewEl.style.display = 'none';
    if (bNavCal) bNavCal.classList.remove('active');
    if (bNavHist) bNavHist.classList.add('active');
    renderHistoryView(p.get('hq') || '');
    return;
  } else {
    if (histViewEl) histViewEl.style.display = 'none';
    if (calViewEl) calViewEl.style.display = 'block';
    if (bNavCal) bNavCal.classList.add('active');
    if (bNavHist) bNavHist.classList.remove('active');
  }

  const groupedTree = {};
  state.items.forEach(it => {
    if (!it.date) return;
    const m = it.date.slice(0, 7);
    const w = iso(monday(it.date));
    ((groupedTree[m] ??= {})[w] ??= []).push(it);
  });
  renderNavTree(groupedTree, activeMonth, activeWeek);

  const catFilter = state.filterCat ? state.filterCat.toLowerCase() : '';
  const searchFilter = (p.get('q') || '').toLowerCase().trim();

  const mTitleEl = document.getElementById('currentMonthTitle');
  if (mTitleEl) {
    mTitleEl.textContent = new Date(activeMonth + '-15T12:00').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  }

  const wMon = new Date(activeWeek + 'T12:00');
  const wSun = new Date(wMon);
  wSun.setDate(wSun.getDate() + 6);
  const wTitleEl = document.getElementById('currentWeekTitle');
  if (wTitleEl) {
    wTitleEl.textContent = `${wMon.getDate()} ${wMon.toLocaleDateString('it-IT', { month: 'short' })} – ${wSun.getDate()} ${wSun.toLocaleDateString('it-IT', { month: 'short' })}`;
  }

  const personBanner = document.getElementById('personFilterBanner');
  if (personBanner) {
    if (filterPerson) {
      personBanner.style.display = 'flex';
      const pNameSpan = personBanner.querySelector('.person-name');
      if (pNameSpan) pNameSpan.textContent = filterPerson.toUpperCase();
    } else {
      personBanner.style.display = 'none';
    }
  }

  const daysWrapper = document.getElementById('daysWrapper');
  if (!daysWrapper) return;

  let daysHtml = '';
  for (let d = 0; d < 7; d++) {
    const curDate = new Date(wMon);
    curDate.setDate(curDate.getDate() + d);
    const dStr = iso(curDate);
    const isToday = (dStr === todayIso);

    const matchesOfDay = state.items.filter(it => {
      if (it.date !== dStr) return false;
      if (catFilter && (it.cat || '').toLowerCase() !== catFilter) return false;
      if (searchFilter) {
        const text = `${it.title} ${it.cat} ${it.t1} ${it.t2} ${it.arb}`.toLowerCase();
        if (!text.includes(searchFilter)) return false;
      }
      if (filterPerson) {
        const pNames = [it.t1, it.t2, it.arb].map(x => (x || '').toLowerCase());
        const meta = state.dayMeta[dStr] || {};
        const isAp = (meta.ap === 'si' && (meta.apNome || '').toLowerCase() === filterPerson);
        const isCh = (meta.ch === 'si' && (meta.chNome || '').toLowerCase() === filterPerson);
        if (!pNames.includes(filterPerson) && !isAp && !isCh) return false;
      }
      return true;
    }).sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));

    const dayName = curDate.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
    const cardsHtml = matchesOfDay.length
      ? matchesOfDay.map(m => card(m)).join('')
      : '<div class="no-matches-day">Nessuna partita</div>';

    const slotsBlock = state.READONLY ? '' : `
      <div class="day-slots-bar">
        ${slotHTML(dStr, 'ap')}
        ${slotHTML(dStr, 'ch')}
      </div>
    `;

    daysHtml += `
      <section class="day-card${isToday ? ' is-today' : ''}" data-day="${dStr}">
        <div class="day-header">
          <span class="day-title">${dayName.toUpperCase()}</span>
          ${isToday ? '<span class="today-badge">OGGI</span>' : ''}
        </div>
        ${slotsBlock}
        <div class="day-matches-list">${cardsHtml}</div>
      </section>
    `;
  }

  daysWrapper.innerHTML = daysHtml;

  const sideWrap = document.getElementById('sideRecapWrapper');
  if (sideWrap) {
    sideWrap.innerHTML = recapHTML(activeMonth);
  }

  updateIncompleteBadge();
  updateAlertStatusBadge(
    () => openConflictsModal(render),
    () => openUrgentIncompleteModal(render),
    () => openPendingModal(render, triggerHaptic, toast),
    toast
  );
}

export function setAuthMode(isAdmin) {
  state.READONLY = !isAdmin;
  document.body.classList.toggle('readonly-mode', !isAdmin);

  if (isAdmin) {
    hideAccessGate();
  }

  const btn = document.getElementById('authModeBtn');
  if (btn) {
    btn.textContent = isAdmin ? '🔓 Admin' : '🔒 Lettura';
    btn.title = isAdmin ? 'Autenticato come Amministratore' : 'Accesso Sola Lettura. Clicca per accedere.';
  }
  render();
}

window.handleAuthClick = () => {
  if (state.READONLY) {
    promptLogin(triggerHaptic, toast, setAuthMode);
  } else {
    if (confirm('Vuoi disconnetterti e passare alla modalità sola lettura?')) {
      if (sb) sb.auth.signOut();
      setAuthMode(false);
      toast('Modalità sola lettura attiva');
    }
  }
};

function shiftWeek(offset) {
  const p = params();
  const cur = p.get('s') || iso(monday(iso(new Date())));
  const d = new Date(cur + 'T12:00');
  d.setDate(d.getDate() + (offset * 7));
  const newW = iso(d);
  p.set('s', newW);
  p.set('m', newW.slice(0, 7));
  writeHash(p);
  render();
}

function shiftMonth(offset) {
  const p = params();
  const cur = p.get('m') || iso(new Date()).slice(0, 7);
  const [y, m] = cur.split('-').map(Number);
  const d = new Date(y, m - 1 + offset, 1, 12, 0);
  const newM = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  p.set('m', newM);
  p.set('s', iso(monday(newM + '-01')));
  writeHash(p);
  render();
}

function resetToCurrent() {
  const today = new Date();
  const p = params();
  p.set('m', iso(today).slice(0, 7));
  p.set('s', iso(monday(iso(today))));
  writeHash(p);
  render();
}

function openQuickAssignMenu(chipEl, role, matchId) {
  if (state.READONLY) return;
  const match = state.items.find(x => x.id === matchId);
  if (!match) return;

  const oldMenu = document.getElementById('quickAssignDropdown');
  if (oldMenu) oldMenu.remove();

  const menu = document.createElement('div');
  menu.id = 'quickAssignDropdown';
  menu.className = 'quick-assign-dropdown';

  const roleLabels = { t1: 'Tavolo 1', t2: 'Tavolo 2', arb: 'Arbitro' };
  const namesHtml = state.names.map(n => `
    <button type="button" class="quick-assign-item${match[role] === n ? ' selected' : ''}" data-name="${esc(n)}">
      ${esc(n)}
    </button>
  `).join('');

  menu.innerHTML = `
    <div class="quick-assign-header">
      <span>Assegna ${roleLabels[role] || role}</span>
      <button type="button" id="qaClose" class="pill-btn-sm" style="min-height:22px;padding:1px 6px">✕</button>
    </div>
    <button type="button" class="quick-assign-item remove-assign" data-name="">— Rimuovi assegnazione —</button>
    <div class="quick-assign-list">${namesHtml}</div>
  `;

  document.body.appendChild(menu);

  const rect = chipEl.getBoundingClientRect();
  const top = rect.bottom + window.scrollY + 6;
  const left = Math.min(Math.max(10, rect.left + window.scrollX), window.innerWidth - 220);
  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;

  menu.addEventListener('click', e => {
    const btn = e.target.closest('[data-name]');
    if (btn) {
      triggerHaptic('light');
      pushUndo();
      const val = btn.dataset.name;
      match[role] = val;
      save();
      logEvent('edit', `Assegnato ${roleLabels[role]}: ${val || '(vuoto)'} a "${match.title || 'Gara'}"`);
      menu.remove();
      render();
      toast(`Assegnato: ${val || 'Rimosso'}`);
      return;
    }
    if (e.target.id === 'qaClose') {
      menu.remove();
    }
  });

  const outsideClick = evt => {
    if (!menu.contains(evt.target) && !chipEl.contains(evt.target)) {
      menu.remove();
      document.removeEventListener('click', outsideClick);
    }
  };
  setTimeout(() => document.addEventListener('click', outsideClick), 50);
}

document.addEventListener('click', e => {
  // Gestione click del pulsante Accedi sul gate
  const gateLoginBtn = e.target.closest('.auth-gate-box button, #btnGateLogin, .gate-login-btn');
  if (gateLoginBtn || (e.target.tagName === 'BUTTON' && e.target.textContent.includes('Accedi con Account'))) {
    e.preventDefault();
    promptLogin(triggerHaptic, toast, setAuthMode);
    return;
  }

  // Toggle compatto per la colonna compensi
  const recapTog = e.target.closest('#recapToggleBtn');
  if (recapTog) {
    e.preventDefault();
    state._recapExpanded = !state._recapExpanded;
    triggerHaptic('light');
    const p = params();
    updateRecap(p.get('m') || iso(new Date()).slice(0, 7));
    return;
  }

  const recapItem = e.target.closest('[data-compname]');
  if (recapItem) {
    const name = recapItem.dataset.compname;
    const p = +recapItem.dataset.p || 0;
    const a = +recapItem.dataset.a || 0;
    const c = +recapItem.dataset.c || 0;
    const m = recapItem.dataset.m || params().get('m') || iso(new Date()).slice(0, 7);
    openCompensiDetailModal(name, { p, a, c }, m, triggerHaptic, toast, updateRecap);
    return;
  }

  const editBtn = e.target.closest('[data-edit]');
  if (editBtn) {
    const matchEl = editBtn.closest('[data-id]');
    if (matchEl) {
      triggerHaptic('light');
      openEditModal(matchEl.dataset.id, triggerHaptic, toast, render);
    }
    return;
  }

  const ghostBtn = e.target.closest('[data-ghost]');
  if (ghostBtn) {
    const id = ghostBtn.dataset.ghost || ghostBtn.closest('[data-id]')?.dataset.id;
    if (id) {
      openQuickCloseModal(id, triggerHaptic, toast, render);
    }
    return;
  }

  const qaChip = e.target.closest('[data-quickassign]');
  if (qaChip && !state.READONLY) {
    const matchEl = qaChip.closest('[data-id]');
    if (matchEl) {
      triggerHaptic('light');
      openQuickAssignMenu(qaChip, qaChip.dataset.quickassign, matchEl.dataset.id);
      return;
    }
  }

  const viewFileBtn = e.target.closest('[data-viewfile]');
  if (viewFileBtn) {
    const mId = viewFileBtn.dataset.viewfile;
    const it = state.items.find(x => x.id === mId);
    if (it && it.fileData) {
      openViewFileModal(it.fileData, it.fileName, it.title, triggerHaptic);
    }
    return;
  }

  const upFileBtn = e.target.closest('[data-uploadfile]');
  if (upFileBtn) {
    const mId = upFileBtn.dataset.uploadfile;
    openEditModal(mId, triggerHaptic, toast, render);
    return;
  }

  const ynBtn = e.target.closest('.slot [data-yn]');
  if (ynBtn && !state.READONLY) {
    triggerHaptic('light');
    const slot = ynBtn.closest('.slot');
    const d = slot.dataset.d;
    const k = slot.dataset.k;
    const val = ynBtn.dataset.yn;

    state.dayMeta[d] ??= {};
    state.dayMeta[d][k] = val;
    saveD();
    render();
    return;
  }

  const pickM = e.target.closest('[data-pickm]');
  if (pickM) {
    const m = pickM.dataset.pickm;
    setParam('m', m, render);
    return;
  }

  const navW = e.target.closest('[data-navw]');
  if (navW) {
    const m = navW.dataset.navm;
    const w = navW.dataset.navw;
    const p = params();
    p.set('m', m);
    p.set('s', w);
    writeHash(p);
    render();
    return;
  }

  const qp = e.target.closest('[data-quickperson]');
  if (qp) {
    const name = qp.dataset.quickperson;
    setParam('person', name, render);
    toast(`Filtro attivo: ${name}`);
    return;
  }

  if (e.target.closest('#clearPersonFilterBtn')) {
    setParam('person', '', render);
    toast('Filtro persona rimosso');
    return;
  }

  const waRecapBtn = e.target.closest('[data-warecap]');
  if (waRecapBtn) {
    const m = waRecapBtn.dataset.warecap;
    copyMonthRecapWhatsApp(m, toast);
    return;
  }
});

document.addEventListener('change', e => {
  const wn = e.target.closest('[data-wn]');
  if (wn && !state.READONLY) {
    const slot = wn.closest('.slot');
    const d = slot.dataset.d;
    const k = slot.dataset.k;
    state.dayMeta[d] ??= {};
    state.dayMeta[d][k + 'Nome'] = wn.value.trim();
    saveD();
    const p = params();
    updateRecap(p.get('m') || iso(new Date()).slice(0, 7));
  }
});

let touchStartX = 0;
let touchStartY = 0;
document.addEventListener('touchstart', e => {
  touchStartX = e.changedTouches[0].screenX;
  touchStartY = e.changedTouches[0].screenY;
}, { passive: true });

document.addEventListener('touchend', e => {
  const diffX = e.changedTouches[0].screenX - touchStartX;
  const diffY = e.changedTouches[0].screenY - touchStartY;
  if (Math.abs(diffX) > 75 && Math.abs(diffY) < 45) {
    if (diffX > 0) {
      shiftWeek(-1);
    } else {
      shiftWeek(1);
    }
  }
}, { passive: true });

window.addEventListener('DOMContentLoaded', async () => {
  renderNamesList();
  renderCategoriesList();

  if (sb) {
    const { data } = await sb.auth.getSession();
    const hasSession = !!data?.session;
    setAuthMode(hasSession);
    if (hasSession) hideAccessGate();

    sb.auth.onAuthStateChange((_event, session) => {
      const isAuth = !!session;
      setAuthMode(isAuth);
      if (isAuth) hideAccessGate();
    });
  } else {
    const urlRo = new URLSearchParams(window.location.search).get('readonly') === 'true';
    setAuthMode(!urlRo);
    if (!urlRo) hideAccessGate();
  }

  registerStateCallbacks({
    onSave: () => scheduleCloudPush(),
    onBadgeUpdate: () => updateIncompleteBadge()
  });

  registerCloudCallback(() => {
    render();
  });

  document.getElementById('btnPrevWeek')?.addEventListener('click', () => shiftWeek(-1));
  document.getElementById('btnNextWeek')?.addEventListener('click', () => shiftWeek(1));
  document.getElementById('btnPrevMonth')?.addEventListener('click', () => shiftMonth(-1));
  document.getElementById('btnNextMonth')?.addEventListener('click', () => shiftMonth(1));
  document.getElementById('btnToday')?.addEventListener('click', resetToCurrent);

  document.getElementById('btnAddMatch')?.addEventListener('click', () => {
    triggerHaptic('light');
    openAddModal(triggerHaptic, toast, render);
  });

  document.getElementById('btnOpenSettings')?.addEventListener('click', () => {
    openSettingsModal(toast, render);
  });

  document.getElementById('btnOpenResoconto')?.addEventListener('click', () => {
    openResocontoModal(triggerHaptic, toast, updateRecap);
  });

  document.getElementById('btnExportWA')?.addEventListener('click', () => {
    const p = params();
    const curW = p.get('s') || iso(monday(iso(new Date())));
    const dStart = new Date(curW + 'T12:00');
    const dEnd = new Date(dStart);
    dEnd.setDate(dEnd.getDate() + 6);
    generateWhatsAppText(dStart, dEnd, '', toast);
  });

  document.getElementById('filterCat')?.addEventListener('change', e => {
    state.filterCat = e.target.value;
    render();
  });

  document.getElementById('searchInput')?.addEventListener('input', e => {
    setParam('q', e.target.value.trim(), render);
  });

  document.getElementById('historySearchInput')?.addEventListener('input', e => {
    setParam('hq', e.target.value.trim(), render);
  });

  document.getElementById('bNavCal')?.addEventListener('click', () => {
    setParam('view', '', render);
  });

  document.getElementById('bNavAdd')?.addEventListener('click', () => {
    triggerHaptic('light');
    openAddModal(triggerHaptic, toast, render);
  });

  document.getElementById('bNavHistory')?.addEventListener('click', () => {
    setParam('view', 'history', render);
  });

  const impFile = document.getElementById('importFile');
  if (impFile) {
    impFile.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = evt => {
        try {
          const parsed = JSON.parse(evt.target.result);
          if (Array.isArray(parsed)) {
            pushUndo();
            let added = 0;
            parsed.forEach(day => {
              if (day.data && Array.isArray(day.partite)) {
                day.partite.forEach(pObj => {
                  state.items.push({
                    id: Math.random().toString(36).slice(2, 10),
                    date: day.data,
                    time: pObj.orario || '',
                    title: pObj.partita || '',
                    cat: pObj.cat || '',
                    t1: pObj.tavolo1 || '',
                    t2: pObj.tavolo2 || '',
                    arb: pObj.arbitro || '',
                    friendly: !!pObj.amichevole,
                    score: pObj.score || '',
                    status: pObj.status || '',
                    fileData: pObj.fileData || null,
                    fileName: pObj.fileName || null,
                    ghost: !!pObj.ghost,
                    ts: Date.now()
                  });
                  added++;
                });
              }
            });
            save();
            render();
            toast(`Importate con successo ${added} partite!`, 'success');
          }
        } catch (err) {
          console.error(err);
          toast('File JSON non valido o corrotto', 'warning');
        }
        impFile.value = '';
      };
      reader.readAsText(file);
    });
  }

  window.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      if (popUndoState()) {
        render();
        toast('Modifica annullata', 'warning');
      }
    }
  });

  cloudPullSafe(false).then(() => {
    render();
  });

  setupSupabaseRealtime({
    isModalOpen: () => !!document.querySelector('.modal-overlay'),
    onRealtimeUpdate: () => render()
  });

  render();
});
