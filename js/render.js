import { state } from './state.js';
import { esc } from './render.js';

export function renderCollaboratorProfile(name) {
  state.activeCollabProfile = name;
  let container = document.getElementById('collaboratorProfileView');
  
  if (!container) {
    container = document.createElement('div');
    container.id = 'collaboratorProfileView';
    container.className = 'ov';
    document.body.appendChild(container);
  }

  const cleanName = name.toLowerCase();
  const v = Object.assign({ p: 10, a: 10, c: 10 }, state.molt[cleanName]);

  const matchedItems = state.items.filter(it => 
    (it.t1 && it.t1.toLowerCase() === cleanName) || 
    (it.t2 && it.t2.toLowerCase() === cleanName) || 
    (it.arb && it.arb.toLowerCase() === cleanName)
  );

  let totalGare = matchedItems.length;
  let totalCompenso = totalGare * v.p;

  const monthsSet = [...new Set(matchedItems.map(it => it.date.slice(0, 7)))].sort().reverse();
  const currentFilterMonth = state.profileMonthFilter || '';

  const filteredItems = currentFilterMonth 
    ? matchedItems.filter(it => it.date.startsWith(currentFilterMonth))
    : matchedItems;

  const monthFilteredGare = filteredItems.length;
  const monthFilteredComp = monthFilteredGare * v.p;

  const postsHtml = filteredItems.length ? filteredItems.map(it => `
    <div style="background:var(--card);border-radius:10px;padding:10px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <span style="font-weight:700;font-size:13.5px">${esc(it.title || 'Gara')}</span>
        <span style="font-size:12px;color:var(--mute)">${esc(it.date)}</span>
      </div>
      <div style="font-size:12.5px;color:var(--mute);display:flex;gap:8px">
        <span>Cat: <b>${esc(it.cat || 'n.d.')}</b></span>
        <span>Ruolo: <b>${it.t1?.toLowerCase() === cleanName ? 'T1' : (it.t2?.toLowerCase() === cleanName ? 'T2' : 'Arbitro')}</b></span>
        ${it.score ? `<span>Score: <b>${esc(it.score)}</b></span>` : ''}
      </div>
    </div>
  `).join('') : '<p style="color:var(--mute);text-align:center;padding:20px;font-size:13px">Nessuna partita in questo periodo.</p>';

  const monthsOptions = monthsSet.map(m => `<option value="${m}" ${m === currentFilterMonth ? 'selected' : ''}>${m}</option>`).join('');
  const statsHtml = `
    <div style="background:var(--card);border-radius:12px;padding:14px;margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h4 style="margin:0;font-size:14px">📊 Metriche e Compensi</h4>
        <select id="profileMonthSelect" style="padding:4px 8px;border-radius:8px;font-size:12px">
          <option value="">Tutta la Stagione</option>
          ${monthsOptions}
        </select>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;text-align:center">
        <div style="background:var(--surface);padding:10px;border-radius:8px">
          <span style="font-size:11px;color:var(--mute);display:block">Gare Periodo</span>
          <strong style="font-size:18px">${monthFilteredGare}</strong>
        </div>
        <div style="background:var(--surface);padding:10px;border-radius:8px">
          <span style="font-size:11px;color:var(--mute);display:block">Compenso Stimato</span>
          <strong style="font-size:18px;color:#4ade80">${monthFilteredComp}€</strong>
        </div>
      </div>
    </div>
  `;

  const partnersCount = {};
  matchedItems.forEach(it => {
    [it.t1, it.t2, it.arb].forEach(p => {
      if (p && p.toLowerCase() !== cleanName) {
        partnersCount[p] = (partnersCount[p] || 0) + 1;
      }
    });
  });
  const sortedPartners = Object.entries(partnersCount).sort((a, b) => b[1] - a[1]);
  const partnersHtml = sortedPartners.length ? sortedPartners.map(([pName, cnt]) => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--divider);font-size:13px">
      <span>🤝 ${esc(pName)}</span>
      <span style="color:var(--mute);font-weight:600">${cnt} gare insieme</span>
    </div>
  `).join('') : '<p style="color:var(--mute);text-align:center;padding:20px;font-size:13px">Nessuna collaborazione registrata.</p>';

  const activeTab = state.profileActiveTab || 'posts';

  container.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" style="max-width:540px;height:90vh;display:flex;flex-direction:column">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <h3 style="margin:0">Profilo Collaboratore</h3>
        <button id="closeProfileView" class="pill-btn-sm" style="min-height:28px">✕</button>
      </div>

      <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--divider)">
        <div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,var(--acc),#ec4899);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:22px">
          ${esc(name.slice(0, 2).toUpperCase())}
        </div>
        <div style="flex:1">
          <h2 style="margin:0 0 4px;font-size:18px">${esc(name)}</h2>
          <div style="display:flex;gap:16px;font-size:13px;text-align:center">
            <div><strong>${totalGare}</strong><span style="display:block;color:var(--mute);font-size:11px">Gare</span></div>
            <div><strong style="color:#4ade80">${totalCompenso}€</strong><span style="display:block;color:var(--mute);font-size:11px">Totale</span></div>
          </div>
        </div>
      </div>

      <div style="display:flex;border-bottom:1px solid var(--divider);margin-bottom:12px">
        <button type="button" class="ig-tab-btn" data-igtab="posts" style="flex:1;padding:8px;background:none;border:none;font-weight:700;cursor:pointer;color:var(--text);border-bottom:2px solid ${activeTab === 'posts' ? 'var(--acc)' : 'transparent'}">🏀 Partite</button>
        <button type="button" class="ig-tab-btn" data-igtab="stats" style="flex:1;padding:8px;background:none;border:none;font-weight:700;cursor:pointer;color:var(--text);border-bottom:2px solid ${activeTab === 'stats' ? 'var(--acc)' : 'transparent'}">📊 Statistiche</button>
        <button type="button" class="ig-tab-btn" data-igtab="tags" style="flex:1;padding:8px;background:none;border:none;font-weight:700;cursor:pointer;color:var(--text);border-bottom:2px solid ${activeTab === 'tags' ? 'var(--acc)' : 'transparent'}">🤝 Tag</button>
      </div>

      <div style="flex:1;overflow-y:auto;padding-right:2px">
        ${activeTab === 'stats' ? statsHtml : (activeTab === 'tags' ? partnersHtml : postsHtml)}
      </div>
    </div>
  `;

  container.style.display = 'flex';
}
