import { COMMON_TIMES } from './config.js';
import { state, save, saveMolt, saveNames, saveCategories, saveFipLinks, applyTheme, pushUndo } from './state.js';
import { sb } from './api.js';
import { uid, iso, monday, checkPersonRosterConflicts, getConflictClusters, getUrgentIncompleteMatches, getPendingPostponedMatches, isRefereeNeeded } from './rules.js';
import { monthsWithData, monthLabel, computeRecapRows, exportSelectedMonthsJSON, generateMonthPDF, copyReadOnlyLink } from './export.js';
import { esc, setParam, renderNamesList, renderCategoriesList } from './render.js';

export function buildCustomTimePicker(initialVal) {
  let [h, m] = (initialVal || '15:30').split(':');
  if (!h) h = '15';
  if (!m) m = '30';

  const hoursOpts = Array.from({ length: 16 }, (_, i) => String(i + 8).padStart(2, '0'))
    .map(val => `<option value="${val}"${val === h ? ' selected' : ''}>${val}</option>`).join('');

  const minsOpts = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']
    .map(val => `<option value="${val}"${val === m ? ' selected' : ''}>${val}</option>`).join('');

  const chipsHtml = COMMON_TIMES.map(t => `
    <button type="button" class="time-chip${t === initialVal ? ' active' : ''}" data-timeval="${t}">${t}</button>
  `).join('');

  return `
    <div class="time-picker-box" id="timePickerBox">
      <div class="time-dropdowns">
        <label style="margin:0;font-size:13px;font-weight:700">Ore:</label>
        <select id="pickHour">${hoursOpts}</select>
        <span style="font-size:18px;font-weight:700">:</span>
        <label style="margin:0;font-size:13px;font-weight:700">Min:</label>
        <select id="pickMin">${minsOpts}</select>
        <input type="hidden" id="finalTimeVal" value="${initialVal || '15:30'}">
      </div>
      <div class="time-chips">${chipsHtml}</div>
    </div>
  `;
}

export function bindTimePickerEvents(container, triggerHaptic) {
  const pHour = container.querySelector('#pickHour');
  const pMin = container.querySelector('#pickMin');
  const hInput = container.querySelector('#finalTimeVal');
  const chips = container.querySelectorAll('.time-chip');

  const updateFromSelects = () => {
    const val = `${pHour.value}:${pMin.value}`;
    hInput.value = val;
    chips.forEach(c => c.classList.toggle('active', c.dataset.timeval === val));
  };

  pHour.onchange = updateFromSelects;
  pMin.onchange = updateFromSelects;

  chips.forEach(chip => {
    chip.onclick = () => {
      triggerHaptic('light');
      const [newH, newM] = chip.dataset.timeval.split(':');
      pHour.value = newH;
      pMin.value = newM;
      hInput.value = chip.dataset.timeval;
      chips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    };
  });
}

export function openMoltModal(name, counts, month, toast, refreshRecap) {
  if (state.READONLY) return;
  const key = name.toLowerCase(), v = Object.assign({ p: 10, a: 10, c: 10 }, state.molt[key]);
  const ov = document.createElement('div'); ov.className = 'ov'; ov.id = 'moltOv';
  const calc = () => {
    const gp = +document.getElementById('mp').value || 0, ga = +document.getElementById('ma').value || 0, gc = +document.getElementById('mc').value || 0;
    return counts.p * gp + counts.a * ga + counts.c * gc;
  };
  ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Moltiplicatori">
    <h3>${esc(name)}</h3>
    <div class="frow" style="display:grid;grid-template-columns:1fr 70px;gap:8px;align-items:center"><label for="mp">Partite (${counts.p}) ×</label><input id="mp" type="number" inputmode="numeric" min="0" value="${v.p}"></div>
    <div class="frow" style="display:grid;grid-template-columns:1fr 70px;gap:8px;align-items:center"><label for="ma">Aperture (${counts.a}) ×</label><input id="ma" type="number" inputmode="numeric" min="0" value="${v.a}"></div>
    <div class="frow" style="display:grid;grid-template-columns:1fr 70px;gap:8px;align-items:center"><label for="mc">Chiusure (${counts.c}) ×</label><input id="mc" type="number" inputmode="numeric" min="0" value="${v.c}"></div>
    <div style="display:flex;justify-content:space-between;font-weight:600;margin:10px 0;padding-top:8px;border-top:1px solid var(--divider)"><span>Totale</span><span id="mtot">${counts.p * v.p + counts.a * v.a + counts.c * v.c}€</span></div>
    <div class="mbtns"><button id="mCancel">Annulla</button><button class="btn-primary-action" id="mSave">Salva</button></div>
  </div>`;
  document.body.appendChild(ov);
  ov.querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => { document.getElementById('mtot').textContent = calc() + '€'; }));
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  document.getElementById('mCancel').onclick = () => ov.remove();
  document.getElementById('mSave').onclick = () => {
    state.molt[key] = { p: +document.getElementById('mp').value || 0, a: +document.getElementById('ma').value || 0, c: +document.getElementById('mc').value || 0 };
    saveMolt(); ov.remove(); refreshRecap(month); toast('Salvati');
  };
  document.getElementById('mp').focus();
}

export function openCompensiDetailModal(name, r, month, triggerHaptic, toast, refreshRecap) {
  triggerHaptic('light');
  const key = name.toLowerCase();
  const v = Object.assign({ p: 10, a: 10, c: 10 }, state.molt[key]);
  const totPartite = r.p * v.p;
  const totAp = r.a * v.a;
  const totCh = r.c * v.c;
  const grandTot = totPartite + totAp + totCh;

  const ov = document.createElement('div');
  ov.className = 'ov';
  ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Dettaglio Compenso">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h3 style="margin:0">${esc(name)}</h3>
      <button id="detCloseTop" class="pill-btn-sm" style="min-height:28px">✕</button>
    </div>
    <div style="background:var(--card);border-radius:12px;padding:12px;margin-bottom:14px;display:grid;gap:8px">
      <div style="display:flex;justify-content:space-between;font-size:13.5px">
        <span>Partite (${r.p} × ${v.p}€)</span>
        <strong>${totPartite}€</strong>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:13.5px">
        <span>Aperture (${r.a} × ${v.a}€)</span>
        <strong>${totAp}€</strong>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:13.5px">
        <span>Chiusure (${r.c} × ${v.c}€)</span>
        <strong>${totCh}€</strong>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:15px;font-weight:800;border-top:1px solid var(--divider);padding-top:8px;color:#4ade80">
        <span>Totale Riconosciuto</span>
        <span>${grandTot}€</span>
      </div>
    </div>
    <div class="mbtns" style="display:flex;gap:8px">
      ${!state.READONLY ? `<button type="button" id="detEditMolt" class="pill-btn-action" style="flex:1">⚙️ Tariffe</button>` : ''}
      <button type="button" class="btn-primary-action" id="detClose" style="flex:1">Chiudi</button>
    </div>
  </div>`;

  document.body.appendChild(ov);
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  ov.querySelector('#detClose').onclick = () => ov.remove();
  ov.querySelector('#detCloseTop').onclick = () => ov.remove();

  if (!state.READONLY) {
    ov.querySelector('#detEditMolt').onclick = () => {
      ov.remove();
      openMoltModal(name, { p: r.p, a: r.a, c: r.c }, month, toast, refreshRecap);
    };
  }
}

export function openViewFileModal(fileData, fileName, matchTitle, triggerHaptic) {
  triggerHaptic('light');
  const ov = document.createElement('div');
  ov.className = 'ov';
  const isPdf = fileData.startsWith('data:application/pdf') || (fileName && fileName.toLowerCase().endsWith('.pdf'));

  ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" style="max-width:680px;height:85vh;display:flex;flex-direction:column">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <div>
        <h3 style="margin:0;font-size:18px">📄 Referto di Gara</h3>
        <span style="font-size:12px;color:var(--mute)">${esc(matchTitle || '')}</span>
      </div>
      <button id="viewFileCloseTop" class="pill-btn-sm" style="min-height:28px">✕</button>
    </div>
    <div style="flex:1;background:#000;border-radius:12px;overflow:hidden;display:flex;align-items:center;justify-content:center;margin-bottom:12px">
      ${isPdf
        ? `<iframe src="${fileData}" style="width:100%;height:100%;border:none"></iframe>`
        : `<img src="${fileData}" alt="Referto" style="max-width:100%;max-height:100%;object-fit:contain">`
      }
    </div>
    <div class="mbtns" style="display:flex;gap:8px">
      <a href="${fileData}" download="${esc(fileName || 'referto.pdf')}" class="btn-primary-action" style="flex:1;text-decoration:none;display:inline-flex;align-items:center;justify-content:center">⬇ Scarica File</a>
      <button type="button" id="viewFileClose" style="flex:1">Chiudi</button>
    </div>
  </div>`;

  document.body.appendChild(ov);
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  ov.querySelector('#viewFileClose').onclick = () => ov.remove();
  ov.querySelector('#viewFileCloseTop').onclick = () => ov.remove();
}

export function openQuickCloseModal(matchId, triggerHaptic, toast, onRender) {
  const it = state.items.find(x => x.id === matchId);
  if (!it) return;

  const ov = document.createElement('div');
  ov.className = 'ov';
  ov.id = 'quickCloseOv';

  let selectedStatus = it.status || '';
  let homeScore = '';
  let awayScore = '';
  if (it.score && String(it.score).includes('-')) {
    const parts = it.score.split('-');
    homeScore = parts[0]?.trim() || '';
    awayScore = parts[1]?.trim() || '';
  }

  ov.innerHTML = `<div class="modal quick-close-modal" role="dialog" aria-modal="true">
    <div class="quick-close-header">🏁 Gestione Esito / Stato</div>
    <div class="quick-close-sub">${esc(it.title || 'Gara')}</div>

    <div class="quick-outcome-grid" style="grid-template-columns:repeat(3,1fr)">
      <button type="button" class="quick-outcome-btn ${selectedStatus === 'vinta' ? 'active' : ''}" data-outcome="vinta">
        <span style="font-size:16px">🟢</span> Vinta
      </button>
      <button type="button" class="quick-outcome-btn ${selectedStatus === 'persa' ? 'active' : ''}" data-outcome="persa">
        <span style="font-size:16px">🔴</span> Persa
      </button>
      <button type="button" class="quick-outcome-btn ${selectedStatus === 'sospesa' ? 'active' : ''}" data-outcome="sospesa">
        <span style="font-size:16px">⚪</span> Sosp.
      </button>
    </div>

    <div class="quick-outcome-grid" style="grid-template-columns:repeat(2,1fr);margin-bottom:12px">
      <button type="button" class="quick-outcome-btn ${selectedStatus === 'rinviata' ? 'active' : ''}" data-outcome="rinviata">
        <span style="font-size:16px">🔄</span> Rinviata
      </button>
      <button type="button" class="quick-outcome-btn ${selectedStatus === 'annullata' ? 'active' : ''}" data-outcome="annullata">
        <span style="font-size:16px">❌</span> Annullata
      </button>
    </div>

    <div id="postponedFields" style="display:${selectedStatus === 'rinviata' ? 'block' : 'none'};background:var(--card);border-radius:12px;padding:10px;margin-bottom:12px;text-align:left">
      <label style="font-size:11.5px;font-weight:700;color:var(--mute);display:block;margin-bottom:4px">Nuova Data Recupero (Opzionale):</label>
      <input type="date" id="qcPostponedDate" value="${it.postponedDate || ''}" style="margin-bottom:6px">
      <label style="font-size:11.5px;font-weight:700;color:var(--mute);display:block;margin-bottom:4px">Nuovo Orario:</label>
      <input type="time" id="qcPostponedTime" value="${it.postponedTime || it.time || '15:30'}">
    </div>

    <div id="scoreFields" style="display:${selectedStatus === 'rinviata' || selectedStatus === 'annullata' ? 'none' : 'block'}">
      <div style="font-size:12px;color:var(--mute);margin-bottom:4px">Punti (opzionale): Casa - Ospiti</div>
      <div class="quick-score-inputs">
        <input type="number" inputmode="numeric" id="qcHome" placeholder="Casa" value="${esc(homeScore)}">
        <span style="font-weight:800;font-size:18px">:</span>
        <input type="number" inputmode="numeric" id="qcAway" placeholder="Ospiti" value="${esc(awayScore)}">
      </div>
    </div>

    <div style="flex-direction:column;gap:8px;display:flex">
      <button type="button" class="btn-primary-action" id="qcSave" style="width:100%;min-height:42px">✓ Conferma</button>
      <button type="button" id="qcCancel" style="width:100%">Annulla</button>
    </div>
  </div>`;

  document.body.appendChild(ov);
  triggerHaptic('light');

  const outcomeBtns = ov.querySelectorAll('.quick-outcome-btn');
  const postFields = ov.querySelector('#postponedFields');
  const scoreFields = ov.querySelector('#scoreFields');

  outcomeBtns.forEach(btn => {
    btn.onclick = () => {
      triggerHaptic('light');
      const val = btn.dataset.outcome;
      if (selectedStatus === val) {
        selectedStatus = '';
        btn.classList.remove('active');
      } else {
        selectedStatus = val;
        outcomeBtns.forEach(b => b.classList.toggle('active', b === btn));
      }
      postFields.style.display = (selectedStatus === 'rinviata') ? 'block' : 'none';
      scoreFields.style.display = (selectedStatus === 'rinviata' || selectedStatus === 'annullata') ? 'none' : 'block';
    };
  });

  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  ov.querySelector('#qcCancel').onclick = () => ov.remove();

  ov.querySelector('#qcSave').onclick = () => {
    pushUndo();
    if (selectedStatus === 'annullata') {
      it.status = 'annullata';
      it.ghost = true;
      it.postponedDate = '';
      it.postponedTime = '';
      toast('Partita contrassegnata come cancellata', 'warning');
    } else if (selectedStatus === 'rinviata') {
      it.status = 'rinviata';
      it.ghost = true;
      const newD = ov.querySelector('#qcPostponedDate').value.trim();
      const newT = ov.querySelector('#qcPostponedTime').value.trim();
      it.postponedDate = newD;
      it.postponedTime = newT;

      if (newD) {
        const clonedMatch = {
          id: uid(),
          title: it.title,
          date: newD,
          time: newT || it.time,
          cat: it.cat,
          friendly: !!it.friendly,
          score: '',
          status: '',
          t1: '',
          t2: '',
          arb: '',
          fileData: it.fileData || null,
          fileName: it.fileName || null,
          ghost: false,
          ts: Date.now()
        };
        state.items.push(clonedMatch);
        toast('Partita rinviata e clonata alla nuova data!', 'success');
      } else {
        toast('Partita rinviata (da definire)', 'warning');
      }
    } else {
      it.ghost = true;
      const h = ov.querySelector('#qcHome')?.value.trim() || '';
      const a = ov.querySelector('#qcAway')?.value.trim() || '';
      if (h !== '' && a !== '') {
        it.score = `${h}-${a}`;
        if (!selectedStatus) {
          const hn = Number(h), an = Number(a);
          if (hn > an) selectedStatus = 'vinta';
          else if (hn < an) selectedStatus = 'persa';
        }
      }
      it.status = selectedStatus;
      it.postponedDate = '';
      it.postponedTime = '';
      toast('Partita completata ✓', 'success');
    }

    save();
    ov.remove();
    onRender();
  };
}

export function openEditModal(matchId, triggerHaptic, toast, onRender) {
  if (state.READONLY) return;
  const it = state.items.find(x => x.id === matchId);
  if (!it) return;

  if (it.ghost && it.status !== 'rinviata') {
    triggerHaptic('warning');
    toast('Togli prima il check ✓ per modificare la partita', 'warning');
    return;
  }

  const isFriendly = !!it.friendly;
  let currentFileData = it.fileData || null;
  let currentFileName = it.fileName || null;

  const ov = document.createElement('div');
  ov.className = 'ov';
  ov.id = 'editModalOv';
  ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Modifica Partita">
    <h3>Modifica Partita</h3>
    <div class="frow"><label for="edDate">Data *</label><input id="edDate" type="date" value="${it.date}"></div>
    <div class="frow"><label>Orario di Gioco</label>${buildCustomTimePicker(it.time || '15:30')}</div>
    <div class="frow"><label for="edTitle">Partita (Squadre)</label><input id="edTitle" type="text" value="${esc(it.title)}"></div>
    <div class="frow"><label for="edCat">Categoria</label><input id="edCat" type="text" list="categoriesList" value="${esc(it.cat)}"></div>

    <div class="frow" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div>
        <label for="edScore">Punteggio</label>
        <input id="edScore" type="text" placeholder="Es. 72-65" value="${esc(it.score || '')}">
      </div>
      <div>
        <label for="edStatus">Esito Rapido</label>
        <select id="edStatus">
          <option value="" ${!it.status ? 'selected' : ''}>Automatico (da punti)</option>
          <option value="vinta" ${it.status === 'vinta' ? 'selected' : ''}>🟢 Vinta</option>
          <option value="persa" ${it.status === 'persa' ? 'selected' : ''}>🔴 Persa</option>
          <option value="sospesa" ${it.status === 'sospesa' ? 'selected' : ''}>⚪ Sospesa</option>
          <option value="rinviata" ${it.status === 'rinviata' ? 'selected' : ''}>🔄 Rinviata</option>
          <option value="annullata" ${it.status === 'annullata' ? 'selected' : ''}>❌ Annullata</option>
        </select>
      </div>
    </div>

    <div class="frow" style="display:flex;align-items:center;justify-content:space-between;margin:10px 0">
      <label style="margin:0;font-size:13px;font-weight:600">Partita Amichevole:</label>
      <div class="yn" id="edFriendlyYN" role="group">
        <button type="button" data-val="si" aria-pressed="${isFriendly}">Sì</button>
        <button type="button" data-val="no" aria-pressed="${!isFriendly}">No</button>
      </div>
    </div>

    <div style="border-top:1px solid var(--divider);margin:12px 0 10px;padding-top:10px">
      <div class="frow"><label for="edT1">Tavolo 1 *</label><input id="edT1" type="text" list="namesList" value="${esc(it.t1)}" placeholder="Nome obbligatorio"></div>
      <div class="frow"><label for="edT2">Tavolo 2</label><input id="edT2" type="text" list="namesList" value="${esc(it.t2)}" placeholder="Nome"></div>
      <div class="frow"><label for="edArb">Arbitro</label><input id="edArb" type="text" list="namesList" value="${esc(it.arb)}" placeholder="Nome"></div>
    </div>

    <div style="border-top:1px solid var(--divider);margin:12px 0 10px;padding-top:10px">
      <label style="font-size:12.5px;color:var(--mute);font-weight:600;display:block;margin-bottom:4px">Referto Gara (PDF o Immagine):</label>
      <div id="fileUploadContainer" class="file-upload-box">
        <div id="fileLoadedWrap" class="file-upload-loaded" style="display:${currentFileData ? 'flex' : 'none'}">
          <span id="fileLoadedName">✓ ${esc(currentFileName || 'Referto allegato')}</span>
          <button type="button" id="btnRemoveFile" class="pill-btn-sm" style="background:rgba(239,68,68,0.2);color:#fca5a5">Rimuovi</button>
        </div>
        <div id="fileInputWrap" style="display:${currentFileData ? 'none' : 'block'}">
          <input type="file" id="matchFileInput" accept="application/pdf,image/*" style="font-size:13px !important">
          <span style="font-size:11px;color:var(--mute);margin-top:2px;display:block">Carica il referto ufficiale o la foto del referto.</span>
        </div>
      </div>
    </div>

    <div id="edConflictBox" style="display:none"></div>
    <div class="mbtns">
      <button id="edDelete" style="background:rgba(239,68,68,0.2);color:#fca5a5;font-weight:600">Elimina</button>
      <div style="display:flex;gap:8px">
        <button id="edCancel">Annulla</button>
        <button class="btn-primary-action" id="edSave">Salva</button>
      </div>
    </div>
  </div>`;

  document.body.appendChild(ov);
  bindTimePickerEvents(ov, triggerHaptic);

  const fileInput = ov.querySelector('#matchFileInput');
  const fileLoadedWrap = ov.querySelector('#fileLoadedWrap');
  const fileInputWrap = ov.querySelector('#fileInputWrap');
  const fileLoadedName = ov.querySelector('#fileLoadedName');
  const btnRemoveFile = ov.querySelector('#btnRemoveFile');

  fileInput.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast('File troppo grande (max 8MB)', 'warning');
      fileInput.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      currentFileData = ev.target.result;
      currentFileName = file.name;
      fileLoadedName.textContent = `✓ ${file.name}`;
      fileLoadedWrap.style.display = 'flex';
      fileInputWrap.style.display = 'none';
      toast('Referto caricato con successo!', 'success');
    };
    reader.readAsDataURL(file);
  };

  btnRemoveFile.onclick = () => {
    currentFileData = null;
    currentFileName = null;
    fileInput.value = '';
    fileLoadedWrap.style.display = 'none';
    fileInputWrap.style.display = 'block';
    toast('Referto rimosso', 'warning');
  };

  let currentFriendlyVal = isFriendly;
  const ynBtns = ov.querySelectorAll('#edFriendlyYN button');
  ynBtns.forEach(b => {
    b.onclick = () => {
      triggerHaptic('light');
      currentFriendlyVal = (b.dataset.val === 'si');
      ynBtns.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    };
  });

  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  document.getElementById('edCancel').onclick = () => ov.remove();

  const delBtn = document.getElementById('edDelete');
  delBtn.onclick = () => {
    if (delBtn.dataset.arm) {
      pushUndo();
      state.items = state.items.filter(x => x.id !== matchId);
      save(); ov.remove(); onRender();
      toast('Partita eliminata', 'warning');
    } else {
      triggerHaptic('warning');
      delBtn.dataset.arm = '1';
      delBtn.textContent = 'Sicuro?';
      delBtn.style.background = '#dc2626';
      delBtn.style.color = '#fff';
      setTimeout(() => {
        if (delBtn.isConnected) {
          delete delBtn.dataset.arm;
          delBtn.textContent = 'Elimina';
          delBtn.style.background = 'rgba(239,68,68,0.2)';
          delBtn.style.color = '#fca5a5';
        }
      }, 3500);
    }
  };

  document.getElementById('edSave').onclick = () => {
    const newDate = document.getElementById('edDate').value;
    if (!newDate) { toast('La data è obbligatoria', 'warning'); return; }
    const time = document.getElementById('finalTimeVal').value;
    const t1 = document.getElementById('edT1').value.trim();
    const t2 = document.getElementById('edT2').value.trim();
    const arb = document.getElementById('edArb').value.trim();
    const newStatus = document.getElementById('edStatus').value;
    const cat = document.getElementById('edCat').value.trim();

    if (newStatus !== 'annullata' && newStatus !== 'rinviata') {
      const conflicts = checkPersonRosterConflicts(matchId, newDate, time, t1, t2, arb, cat);
      if (conflicts.length && !document.getElementById('edSave').dataset.confirmed) {
        triggerHaptic('warning');
        const box = document.getElementById('edConflictBox');
        box.className = 'person-conflict-alert';
        box.innerHTML = conflicts.join('<br>') + '<br><small>Tocca di nuovo Salva per forzare.</small>';
        box.style.display = 'block';
        document.getElementById('edSave').dataset.confirmed = '1';
        return;
      }
    }

    pushUndo();
    it.date = newDate;
    it.time = time;
    it.title = document.getElementById('edTitle').value.trim();
    it.cat = cat;
    it.friendly = currentFriendlyVal;
    it.score = document.getElementById('edScore').value.trim();
    it.status = newStatus;
    if (newStatus === 'rinviata' && !it.postponedDate) it.postponedDate = '';
    if (newStatus && newStatus !== 'rinviata') it.postponedDate = '';
    it.t1 = t1;
    it.t2 = t2;
    it.arb = arb;
    it.fileData = currentFileData;
    it.fileName = currentFileName;

    if (newStatus === 'rinviata' || newStatus === 'annullata') it.ghost = true;
    save(); ov.remove();
    setParam('m', it.date.slice(0, 7), onRender);
    setParam('s', iso(monday(it.date)), onRender);
    toast('Salvato', 'success');
  };
}

export function openAddModal(triggerHaptic, toast, onRender) {
  if (state.READONLY) return;
  const ov = document.createElement('div'); ov.className = 'ov'; ov.id = 'addOv';
  ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Nuova partita">
    <h3>Nuova partita</h3>
    <div class="frow"><label for="nDate">Data *</label><input id="nDate" type="date" value="${iso(new Date())}"></div>
    <div class="frow"><label>Orario di Gioco</label>${buildCustomTimePicker('15:30')}</div>
    <div class="frow"><label for="nTitle">Partita</label><input id="nTitle" type="text" placeholder="Squadra A – Squadra B"></div>
    <div class="frow"><label for="nCat">Categoria</label><input id="nCat" type="text" list="categoriesList" placeholder="Es. U17"></div>

    <div class="frow" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div>
        <label for="nScore">Punteggio</label>
        <input id="nScore" type="text" placeholder="Es. 72-65">
      </div>
      <div>
        <label for="nStatus">Esito Rapido</label>
        <select id="nStatus">
          <option value="" selected>Automatico (da punti)</option>
          <option value="vinta">🟢 Vinta</option>
          <option value="persa">🔴 Persa</option>
          <option value="sospesa">⚪ Sospesa</option>
          <option value="rinviata">🔄 Rinviata</option>
          <option value="annullata">❌ Annullata</option>
        </select>
      </div>
    </div>

    <div class="frow" style="display:flex;align-items:center;justify-content:space-between;margin:10px 0">
      <label style="margin:0;font-size:13px;font-weight:600">Partita Amichevole:</label>
      <div class="yn" id="nFriendlyYN" role="group">
        <button type="button" data-val="si" aria-pressed="false">Sì</button>
        <button type="button" data-val="no" aria-pressed="true">No</button>
      </div>
    </div>

    <div class="frow"><label for="nT1">Tavolo 1</label><input id="nT1" type="text" list="namesList" placeholder="Nome"></div>
    <div class="frow"><label for="nT2">Tavolo 2</label><input id="nT2" type="text" list="namesList" placeholder="Nome"></div>
    <div class="frow"><label for="nArb">Arbitro</label><input id="nArb" type="text" list="namesList" placeholder="Nome"></div>
    <div id="nConflictBox" style="display:none"></div>
    <p class="err" id="nErr">Inserisci almeno la data.</p>
    <div class="mbtns"><button id="nCancel">Annulla</button><button class="btn-primary-action" id="nSave">Aggiungi</button></div>
  </div>`;
  document.body.appendChild(ov);
  bindTimePickerEvents(ov, triggerHaptic);

  let currentFriendlyVal = false;
  const ynBtns = ov.querySelectorAll('#nFriendlyYN button');
  ynBtns.forEach(b => {
    b.onclick = () => {
      triggerHaptic('light');
      currentFriendlyVal = (b.dataset.val === 'si');
      ynBtns.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    };
  });

  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  document.getElementById('nCancel').onclick = () => ov.remove();
  document.getElementById('nSave').onclick = () => {
    const date = document.getElementById('nDate').value;
    if (!date) {
      toast('Inserisci almeno la data', 'warning');
      document.getElementById('nErr').classList.add('on');
      document.getElementById('nDate').focus();
      return;
    }
    const time = document.getElementById('finalTimeVal').value;
    const t1 = document.getElementById('nT1').value.trim();
    const t2 = document.getElementById('nT2').value.trim();
    const arb = document.getElementById('nArb').value.trim();
    const statusVal = document.getElementById('nStatus').value;
    const cat = document.getElementById('nCat').value.trim();

    if (statusVal !== 'annullata' && statusVal !== 'rinviata') {
      const conflicts = checkPersonRosterConflicts(null, date, time, t1, t2, arb, cat);
      if (conflicts.length && !document.getElementById('nSave').dataset.confirmed) {
        triggerHaptic('warning');
        const box = document.getElementById('nConflictBox');
        box.className = 'person-conflict-alert';
        box.innerHTML = conflicts.join('<br>') + '<br><small>Tocca di nuovo Aggiungi per forzare.</small>';
        box.style.display = 'block';
        document.getElementById('nSave').dataset.confirmed = '1';
        return;
      }
    }

    const it = {
      id: uid(),
      title: document.getElementById('nTitle').value,
      date,
      time,
      cat,
      friendly: currentFriendlyVal,
      score: document.getElementById('nScore').value.trim(),
      status: statusVal,
      t1, t2, arb,
      fileData: null,
      fileName: null,
      ghost: statusVal === 'rinviata' || statusVal === 'annullata',
      ts: Date.now()
    };
    pushUndo(); state.items.push(it); save(); ov.remove();
    setParam('m', it.date.slice(0, 7), onRender); 
    setParam('s', iso(monday(it.date)), onRender);
    toast('Partita aggiunta!', 'success');
  };
  document.getElementById('nDate').focus();
}

export function openResocontoModal(triggerHaptic, toast, refreshRecap) {
  const months = monthsWithData();
  const ov = document.createElement('div');
  ov.className = 'ov';
  ov.id = 'resocontoOv';

  const grandTotal = {};
  let totalSpentGeneral = 0;

  months.forEach(m => {
    const rows = computeRecapRows(m);
    rows.forEach(r => {
      const k = r.n.toLowerCase();
      const v = Object.assign({ p: 10, a: 10, c: 10 }, state.molt[k]);
      const tot = (r.p * v.p) + (r.a * v.a) + (r.c * v.c);
      if (!grandTotal[k]) grandTotal[k] = { n: r.n, p: 0, a: 0, c: 0, tot: 0 };
      grandTotal[k].p += r.p;
      grandTotal[k].a += r.a;
      grandTotal[k].c += r.c;
      grandTotal[k].tot += tot;
      totalSpentGeneral += tot;
    });
  });

  const grandRows = Object.values(grandTotal).sort((a, b) => b.tot - a.tot || a.n.localeCompare(b.n));

  const grandItemsHtml = grandRows.length
    ? grandRows.map(r => `
        <div class="recap-item-compact" data-compname="${esc(r.n)}" data-p="${r.p}" data-a="${r.a}" data-c="${r.c}" title="Dettaglio">
          <div class="recap-item-left">
            <span class="recap-item-name">${esc(r.n)}</span>
            <span class="recap-item-sub">${r.p} gare • ${r.a} ap • ${r.c} ch</span>
          </div>
          <span class="recap-item-amount">${r.tot}€</span>
        </div>
      `).join('')
    : '<p style="color:var(--mute);font-size:13px">Nessun dato registrato nella stagione.</p>';

  const monthsBlocksHtml = months.map(m => {
    const rows = computeRecapRows(m);
    let monthSum = 0;
    const items = rows.length
      ? rows.map(r => {
          const v = Object.assign({ p: 10, a: 10, c: 10 }, state.molt[r.n.toLowerCase()]);
          const tot = (r.p * v.p) + (r.a * v.a) + (r.c * v.c);
          monthSum += tot;
          return `
            <div class="recap-item-compact" data-compname="${esc(r.n)}" data-p="${r.p}" data-a="${r.a}" data-c="${r.c}" data-m="${m}" style="background:var(--surface)">
              <div class="recap-item-left">
                <span class="recap-item-name" style="font-size:13px">${esc(r.n)}</span>
                <span class="recap-item-sub">${r.p} gare • ${r.a + r.c} ap/ch</span>
              </div>
              <span class="recap-item-amount" style="font-size:13.5px">${tot}€</span>
            </div>
          `;
        }).join('')
      : '<p style="color:var(--mute);font-size:12px;margin:4px 0">Nessuna gara con check.</p>';

    return `<details class="res-month-block">
      <summary style="display:flex;justify-content:space-between;align-items:center">
        <span>${monthLabel(m)} (${monthSum}€)</span>
        <button class="waBtn" data-warecap="${m}" type="button">📲 WA</button>
      </summary>
      <div style="margin-top:8px">${items}</div>
    </details>`;
  }).join('');

  ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Resoconto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h3 style="margin:0">Resoconto Compensi</h3>
      <button id="resCloseTop" class="pill-btn-sm" style="min-height:28px">✕</button>
    </div>
    <div class="grand-total-box">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h4 style="margin:0">Totale Stagionale</h4>
        <span style="font-size:17px;font-weight:900;color:#4ade80">${totalSpentGeneral}€</span>
      </div>
      <div style="max-height:220px;overflow-y:auto;padding-right:2px">${grandItemsHtml}</div>
    </div>
    <h4 style="margin:14px 0 8px;font:700 15px var(--font-title);color:var(--mute);text-transform:uppercase">Dettaglio per Mese</h4>
    <div class="resoconto-months" style="max-height:240px;overflow-y:auto">${monthsBlocksHtml}</div>
    <div class="mbtns" style="margin-top:16px"><button class="btn-primary-action" id="resClose" style="width:100%">Chiudi</button></div>
  </div>`;

  document.body.appendChild(ov);
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  document.getElementById('resClose').onclick = () => ov.remove();
  document.getElementById('resCloseTop').onclick = () => ov.remove();
}

export function openConflictsModal(onRender) {
  const clusters = getConflictClusters();
  if (!clusters.length) return;

  const ov = document.createElement('div');
  ov.className = 'ov';
  ov.id = 'conflictOv';

  let listHtml = '';
  clusters.forEach((group, idx) => {
    const firstMatch = group[0];
    const lastMatch = group[group.length - 1];
    const dateFormatted = new Date(firstMatch.date + 'T12:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
    const timeRange = firstMatch.time === lastMatch.time ? `ore ${firstMatch.time}` : `dalle ${firstMatch.time} alle ${lastMatch.time}`;

    listHtml += `<div style="margin-bottom:14px;border-radius:12px;padding:12px;background:var(--card)">
      <div style="font-weight:700;color:#ef4444;font-size:13.5px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">
        <span>⚠️ Conflitto ${idx + 1}: ${dateFormatted} (${timeRange})</span>
        <span style="font-size:11px;background:rgba(239,68,68,0.2);color:#fca5a5;padding:3px 8px;border-radius:6px">${group.length} gare collegate</span>
      </div>
      <div style="display:grid;gap:8px">`;

    group.forEach(it => {
      const rosterList = [
        it.t1 ? `T1: <b>${esc(it.t1)}</b>` : '',
        it.t2 ? `T2: <b>${esc(it.t2)}</b>` : '',
        it.arb ? `Arb: <b>${esc(it.arb)}</b>` : ''
      ].filter(Boolean).join(' | ');

      listHtml += `<div class="conflict-list-item" data-goto="${it.id}">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <strong style="font-size:14px">${esc(it.title || 'Partita senza titolo')}</strong>
          <span style="font-size:13px;font-weight:700;color:var(--date)">Ore ${esc(it.time || 'n.d.')}</span>
        </div>
        <div style="font-size:12px;color:var(--mute)">Cat: ${esc(it.cat || 'n.d.')}${it.friendly ? ' [AMICHEVOLE]' : ''} ${rosterList ? '• ' + rosterList : ''}</div>
        <span style="font-size:11px;color:var(--acc);font-weight:700;margin-top:2px">Vai alla partita ➔</span>
      </div>`;
    });

    listHtml += `</div></div>`;
  });

  ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Conflitti">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h3 style="margin:0;color:#ef4444">Conflitti Raggruppati (${clusters.length})</h3>
      <button id="confCloseTop" style="min-height:28px;padding:2px 8px">✕</button>
    </div>
    <p style="font-size:13px;color:var(--mute);margin:-4px 0 14px">Tutte le partite connesse nello stesso orario/fascia:</p>
    <div>${listHtml}</div>
    <div class="mbtns" style="margin-top:16px"><button class="btn-primary-action" id="confClose" style="width:100%">Chiudi</button></div>
  </div>`;

  document.body.appendChild(ov);
  ov.addEventListener('click', e => {
    if (e.target === ov) ov.remove();
    const itemEl = e.target.closest('[data-goto]');
    if (itemEl) {
      const targetId = itemEl.dataset.goto;
      ov.remove();
      const targetMatch = state.items.find(x => x.id === targetId);
      if (targetMatch) {
        setParam('m', targetMatch.date.slice(0, 7), onRender);
        setParam('s', iso(monday(targetMatch.date)), onRender);
      }
    }
  });
  document.getElementById('confClose').onclick = () => ov.remove();
  document.getElementById('confCloseTop').onclick = () => ov.remove();
}

export function openUrgentIncompleteModal(onRender) {
  const urgentList = getUrgentIncompleteMatches();
  if (!urgentList.length) return;

  const ov = document.createElement('div');
  ov.className = 'ov';
  ov.id = 'urgentOv';

  let listHtml = urgentList.map(it => {
    let reqs = [];
    if (!it.t1?.trim()) reqs.push('Tavolo 1');
    if (!it.friendly && !it.t2?.trim()) reqs.push('Tavolo 2');
    if (isRefereeNeeded(it.cat, it.friendly) && !it.arb?.trim()) reqs.push('Arbitro');

    return `<div class="conflict-list-item" style="border-left:4px solid #f97316" data-goto="${it.id}">
      <strong>${esc(it.title || 'Partita senza titolo')}</strong>
      <span style="font-size:12px;color:var(--mute)">Data: ${esc(it.date)} | Ore: ${esc(it.time || 'n.d.')} | Cat: ${esc(it.cat || 'n.d.')}${it.friendly ? ' [AMICHEVOLE]' : ''}</span>
      <span style="font-size:11px;color:#f97316;font-weight:700">Mancano: ${reqs.join(', ')} ➔</span>
    </div>`;
  }).join('');

  ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Gare imminenti incomplete">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h3 style="margin:0;color:#f97316">Partite Imminenti Incomplete</h3>
      <button id="urgCloseTop" style="min-height:28px;padding:2px 8px">✕</button>
    </div>
    <p style="font-size:13px;color:var(--mute);margin:-4px 0 14px">Gare nelle prossime 24-48h che necessitano ancora di persone al tavolo o arbitro:</p>
    <div style="display:grid;gap:8px">${listHtml}</div>
    <div class="mbtns" style="margin-top:16px"><button class="btn-primary-action" id="urgClose" style="width:100%">Chiudi</button></div>
  </div>`;

  document.body.appendChild(ov);
  ov.addEventListener('click', e => {
    if (e.target === ov) ov.remove();
    const itemEl = e.target.closest('[data-goto]');
    if (itemEl) {
      const targetId = itemEl.dataset.goto;
      ov.remove();
      const targetMatch = state.items.find(x => x.id === targetId);
      if (targetMatch) {
        setParam('m', targetMatch.date.slice(0, 7), onRender);
        setParam('s', iso(monday(targetMatch.date)), onRender);
      }
    }
  });
  document.getElementById('urgClose').onclick = () => ov.remove();
  document.getElementById('urgCloseTop').onclick = () => ov.remove();
}

export function openPendingModal(onRender, triggerHaptic, toast) {
  const pendingList = getPendingPostponedMatches();
  if (!pendingList.length) return;

  const ov = document.createElement('div');
  ov.className = 'ov';
  ov.id = 'pendingOv';

  let listHtml = pendingList.map(it => `
    <div class="conflict-list-item" style="border-left:4px solid #eab308" data-goto="${it.id}">
      <strong>${esc(it.title || 'Partita senza titolo')}</strong>
      <span style="font-size:12px;color:var(--mute)">Data originaria: ${esc(it.date)} | Cat: ${esc(it.cat || 'n.d.')}</span>
      <span style="font-size:11px;color:#eab308;font-weight:700">Rinviata da definire (Clicca per assegnare data) ➔</span>
    </div>
  `).join('');

  ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Partite Rinviate">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h3 style="margin:0;color:#eab308">⏳ Partite Rinviate (Da Definire)</h3>
      <button id="pendCloseTop" style="min-height:28px;padding:2px 8px">✕</button>
    </div>
    <p style="font-size:13px;color:var(--mute);margin:-4px 0 14px">Partite da ricalendarizzare:</p>
    <div style="display:grid;gap:8px">${listHtml}</div>
    <div class="mbtns" style="margin-top:16px"><button class="btn-primary-action" id="pendClose" style="width:100%">Chiudi</button></div>
  </div>`;

  document.body.appendChild(ov);
  ov.addEventListener('click', e => {
    if (e.target === ov) ov.remove();
    const itemEl = e.target.closest('[data-goto]');
    if (itemEl) {
      const targetId = itemEl.dataset.goto;
      ov.remove();
      const targetMatch = state.items.find(x => x.id === targetId);
      if (targetMatch) {
        setParam('m', targetMatch.date.slice(0, 7), onRender);
        setParam('s', iso(monday(targetMatch.date)), onRender);
        openEditModal(targetId, triggerHaptic, toast, onRender);
      }
    }
  });
  document.getElementById('pendClose').onclick = () => ov.remove();
  document.getElementById('pendCloseTop').onclick = () => ov.remove();
}

export function openExportMultiModal(toast) {
  const months = monthsWithData();
  if (!months.length) { toast('Nessun mese con partite', 'warning'); return; }
  const ov = document.createElement('div');
  ov.className = 'ov';
  ov.id = 'exportMultiOv';

  const listHtml = months.map(m => `
    <label class="checkbox-item">
      <input type="checkbox" name="mExpChk" value="${m}" checked>
      <span style="font-weight:600">${monthLabel(m)}</span>
    </label>
  `).join('');

  ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Esporta Mesi">
    <h3>Esporta Mesi in JSON</h3>
    <div style="display:flex;gap:8px;margin-bottom:12px">
      <button type="button" id="chkAllBtn" class="pill-btn-sm">Tutti</button>
      <button type="button" id="chkNoneBtn" class="pill-btn-sm">Nessuno</button>
    </div>
    <div id="mChkWrap" style="display:grid;gap:8px;max-height:220px;overflow-y:auto">
      ${listHtml}
    </div>
    <div class="mbtns" style="margin-top:16px">
      <button id="expCancel">Annulla</button>
      <button class="btn-primary-action" id="expDownload">Scarica JSON</button>
    </div>
  </div>`;

  document.body.appendChild(ov);
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  document.getElementById('expCancel').onclick = () => ov.remove();
  document.getElementById('chkAllBtn').onclick = () => ov.querySelectorAll('input[name=mExpChk]').forEach(c => c.checked = true);
  document.getElementById('chkNoneBtn').onclick = () => ov.querySelectorAll('input[name=mExpChk]').forEach(c => c.checked = false);

  document.getElementById('expDownload').onclick = () => {
    const selected = Array.from(ov.querySelectorAll('input[name=mExpChk]:checked')).map(c => c.value);
    if (!selected.length) { toast('Seleziona un mese', 'warning'); return; }
    exportSelectedMonthsJSON(selected, toast);
    ov.remove();
  };
}

export function openPrintModal(toast) {
  const months = monthsWithData();
  if (!months.length) { toast('Nessuna gara presente', 'warning'); return; }
  const cur = new URLSearchParams(window.location.hash.slice(1)).get('m');
  const def = months.includes(cur) ? cur : months[months.length - 1];
  const ov = document.createElement('div'); ov.className = 'ov'; ov.id = 'printOv';
  ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Stampa PDF">
    <h3>Stampa PDF</h3>
    <div class="frow"><label for="pMonth">Mese</label>
      <select id="pMonth">
        ${months.map(m => `<option value="${m}"${m === def ? ' selected' : ''}>${monthLabel(m)}</option>`).join('')}
      </select>
    </div>
    <div class="mbtns"><button type="button" id="pCancel">Annulla</button><button type="button" class="btn-primary-action" id="pGo">Genera PDF</button></div>
  </div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  document.getElementById('pCancel').onclick = () => ov.remove();
  document.getElementById('pGo').onclick = () => {
    const m = document.getElementById('pMonth').value; ov.remove();
    generateMonthPDF(m, toast);
  };
}

export function openThemeModal() {
  const ov = document.createElement('div'); ov.className = 'ov'; ov.id = 'themeOv';
  ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Scegli Tema">
    <h3>Tema / Stile</h3>
    <div class="frow">
      <label for="themeSelectModal">Aspetto grafico</label>
      <select id="themeSelectModal">
        <option value="default"${state.currentTheme === 'default' ? ' selected' : ''}>🎨 Standard Moderno</option>
        <option value="synthwave"${state.currentTheme === 'synthwave' ? ' selected' : ''}>🕹 Synthwave Neon</option>
        <option value="gazzetta"${state.currentTheme === 'gazzetta' ? ' selected' : ''}>📰 Gazzetta Rosa</option>
        <option value="tv"${state.currentTheme === 'tv' ? ' selected' : ''}>📺 Tabellone TV</option>
      </select>
    </div>
    <div class="mbtns"><button type="button" id="themeClose" class="btn-primary-action" style="width:100%">Fatto</button></div>
  </div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  document.getElementById('themeSelectModal').onchange = e => applyTheme(e.target.value);
  document.getElementById('themeClose').onclick = () => ov.remove();
}

export function openNamesModal() {
  if (state.READONLY) return;
  const ov = document.createElement('div'); ov.className = 'ov'; ov.id = 'namesOv';
  const rowsHtml = () => state.names.length
    ? state.names.map(n => `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--divider)">
        <span style="font-weight:600;font-size:14px">${esc(n)}</span>
        <button type="button" data-rmname="${esc(n)}" style="min-height:26px;padding:2px 8px;font-size:12px;background:rgba(239,68,68,0.2);color:#fca5a5">✕</button>
      </div>`).join('')
    : '<p style="color:var(--mute);font-size:13px;margin:4px 0">Nessun nome inserito.</p>';
  ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Nomi">
    <h3>Elenco Collaboratori</h3>
    <div id="namesListWrap" style="max-height:220px;overflow-y:auto;margin-bottom:10px">${rowsHtml()}</div>
    <div class="frow" style="display:flex;gap:8px"><input id="newNameInput" type="text" placeholder="Nuovo nome" style="flex:1"><button type="button" class="btn-primary-action" id="addNameBtn">Aggiungi</button></div>
    <div class="mbtns"><button type="button" id="namesClose" style="width:100%">Chiudi</button></div>
  </div>`;
  document.body.appendChild(ov);
  const refreshList = () => { document.getElementById('namesListWrap').innerHTML = rowsHtml(); };
  ov.addEventListener('click', e => {
    if (e.target === ov) { ov.remove(); return; }
    const rm = e.target.closest('[data-rmname]');
    if (rm) {
      state.names = state.names.filter(n => n.toLowerCase() !== rm.dataset.rmname.toLowerCase());
      saveNames(); renderNamesList(); refreshList(); return;
    }
    if (e.target.id === 'addNameBtn') {
      const inp = document.getElementById('newNameInput'), v = inp.value.trim();
      if (v && !state.names.some(n => n.toLowerCase() === v.toLowerCase())) {
        state.names.push(v); state.names.sort((a, b) => a.localeCompare(b));
        saveNames(); renderNamesList(); refreshList();
      }
      inp.value = ''; inp.focus();
    }
  });
  document.getElementById('newNameInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('addNameBtn').click(); } });
  document.getElementById('namesClose').onclick = () => ov.remove();
  document.getElementById('newNameInput').focus();
}

export function openCatModal() {
  if (state.READONLY) return;
  const ov = document.createElement('div'); ov.className = 'ov'; ov.id = 'catOv';
  const rowsHtml = () => state.categories.length
    ? state.categories.map(c => `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--divider)"><span>${esc(c)}</span><button type="button" data-rmcat="${esc(c)}" style="min-height:26px;padding:2px 8px;font-size:12px;background:rgba(239,68,68,0.2);color:#fca5a5">✕</button></div>`).join('')
    : '<p style="color:var(--mute);font-size:13px;margin:4px 0">Nessuna categoria.</p>';
  ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Categorie">
    <h3>Categorie</h3>
    <div id="catListWrap" style="max-height:220px;overflow-y:auto;margin-bottom:10px">${rowsHtml()}</div>
    <div class="frow" style="display:flex;gap:8px"><input id="newCatInput" type="text" placeholder="Es. U17" style="flex:1"><button type="button" class="btn-primary-action" id="addCatBtn">Aggiungi</button></div>
    <div class="mbtns"><button type="button" id="catClose" style="width:100%">Chiudi</button></div>
  </div>`;
  document.body.appendChild(ov);
  const refreshList = () => { document.getElementById('catListWrap').innerHTML = rowsHtml(); };
  ov.addEventListener('click', e => {
    if (e.target === ov) { ov.remove(); return; }
    const rm = e.target.closest('[data-rmcat]');
    if (rm) {
      state.categories = state.categories.filter(c => c.toLowerCase() !== rm.dataset.rmcat.toLowerCase());
      saveCategories(); renderCategoriesList(); refreshList(); return;
    }
    if (e.target.id === 'addCatBtn') {
      const inp = document.getElementById('newCatInput'), v = inp.value.trim();
      if (v && !state.categories.some(c => c.toLowerCase() === v.toLowerCase())) {
        state.categories.push(v); state.categories.sort((a, b) => a.localeCompare(b));
        saveCategories(); renderCategoriesList(); refreshList();
      }
      inp.value = ''; inp.focus();
    }
  });
  document.getElementById('newCatInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('addCatBtn').click(); } });
  document.getElementById('catClose').onclick = () => ov.remove();
  document.getElementById('newCatInput').focus();
}

export function openFipLinksModal(toast, onRender) {
  const isAuth = !state.READONLY;
  const ov = document.createElement('div');
  ov.className = 'ov';
  ov.id = 'fipLinksOv';

  const defaultCats = ['U13', 'U14', 'U15', 'U17', 'U19'];
  const allCats = Array.from(new Set([...defaultCats, ...state.categories]));

  const rowsHtml = allCats.map(c => {
    const val = state.fipLinks[c] || '';
    return `
      <div style="margin-bottom:8px">
        <label style="display:block;font-size:12px;font-weight:700;color:var(--date);margin-bottom:3px">${esc(c)}</label>
        <input type="url" data-fipcat="${esc(c)}" value="${esc(val)}" placeholder="Incolla link girone FIP..." ${isAuth ? '' : 'disabled'}>
      </div>
    `;
  }).join('');

  ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Link Risultati FIP">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h3 style="margin:0">🔗 Link Risultati FIP</h3>
      <button id="fipCloseTop" class="pill-btn-sm" style="min-height:28px">✕</button>
    </div>
    <p style="font-size:12px;color:var(--mute);margin:-4px 0 12px">Inserisci i link dei campionati FIP per ciascuna categoria. Verrà mostrato il tasto 🌐 nelle card.</p>
    <div style="max-height:260px;overflow-y:auto;padding-right:4px">${rowsHtml}</div>
    <div class="mbtns" style="margin-top:14px">
      <button type="button" id="fipCancel">Chiudi</button>
      ${isAuth ? '<button type="button" class="btn-primary-action" id="fipSave">Salva</button>' : ''}
    </div>
  </div>`;

  document.body.appendChild(ov);
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  ov.querySelector('#fipCancel').onclick = () => ov.remove();
  ov.querySelector('#fipCloseTop').onclick = () => ov.remove();

  if (isAuth) {
    ov.querySelector('#fipSave').onclick = () => {
      const inputs = ov.querySelectorAll('input[data-fipcat]');
      inputs.forEach(inp => {
        const c = inp.dataset.fipcat;
        const val = inp.value.trim();
        if (val) {
          state.fipLinks[c] = val;
        } else {
          delete state.fipLinks[c];
        }
      });
      saveFipLinks();
      ov.remove();
      onRender();
      toast('Link FIP salvati!', 'success');
    };
  }
}

export function openSettingsModal(toast, onRender) {
  const isAuth = !state.READONLY;
  const ov = document.createElement('div');
  ov.className = 'ov';
  ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Impostazioni">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <h3 style="margin:0">⚙️ Strumenti & Impostazioni</h3>
      <button id="setCloseTop" class="pill-btn-sm" style="min-height:28px">✕</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
      <button type="button" id="sBtnTheme" style="padding:10px;font-size:13px;border-radius:10px">🎨 Tema / Stile</button>
      <button type="button" id="sBtnShareRo" style="padding:10px;font-size:13px;border-radius:10px">🔗 Link Sola Lettura</button>
      <button type="button" id="sBtnFip" style="padding:10px;font-size:13px;border-radius:10px">🌐 Link FIP</button>
      <button type="button" id="sBtnPrint" style="padding:10px;font-size:13px;border-radius:10px">🖨️ Stampa PDF</button>
      <button type="button" id="sBtnExport" style="padding:10px;font-size:13px;border-radius:10px">📤 Esporta JSON</button>
      ${isAuth ? `
        <button type="button" id="sBtnImport" style="padding:10px;font-size:13px;border-radius:10px">📥 Importa JSON</button>
        <button type="button" id="sBtnNames" style="padding:10px;font-size:13px;border-radius:10px">👥 Collaboratori</button>
        <button type="button" id="sBtnCat" style="padding:10px;font-size:13px;border-radius:10px">🏷️ Categorie</button>
      ` : ''}
    </div>
    <div class="mbtns"><button type="button" id="setClose" class="btn-primary-action" style="width:100%">Chiudi</button></div>
  </div>`;

  document.body.appendChild(ov);
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  ov.querySelector('#setClose').onclick = () => ov.remove();
  ov.querySelector('#setCloseTop').onclick = () => ov.remove();

  ov.querySelector('#sBtnTheme').onclick = () => { ov.remove(); openThemeModal(); };
  ov.querySelector('#sBtnShareRo').onclick = () => { ov.remove(); copyReadOnlyLink(toast); };
  ov.querySelector('#sBtnFip').onclick = () => { ov.remove(); openFipLinksModal(toast, onRender); };
  ov.querySelector('#sBtnPrint').onclick = () => { ov.remove(); openPrintModal(toast); };
  ov.querySelector('#sBtnExport').onclick = () => { ov.remove(); openExportMultiModal(toast); };
  if (isAuth) {
    ov.querySelector('#sBtnImport').onclick = () => { ov.remove(); document.getElementById('importFile')?.click(); };
    ov.querySelector('#sBtnNames').onclick = () => { ov.remove(); openNamesModal(); };
    ov.querySelector('#sBtnCat').onclick = () => { ov.remove(); openCatModal(); };
  }
}

export function promptLogin(triggerHaptic, toast, setAuthMode) {
  const oldOv = document.getElementById('loginOv');
  if (oldOv) oldOv.remove();

  const ov = document.createElement('div');
  ov.className = 'ov';
  ov.id = 'loginOv';
  ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Accesso Amministratore">
    <h3>Accesso Gestione</h3>
    <p style="font-size:13px;color:var(--mute);margin:-6px 0 10px">Inserisci le credenziali amministratore per sbloccare le modifiche.</p>

    <div class="frow">
      <label for="loginEmail">Email</label>
      <input id="loginEmail" type="email" placeholder="admin@esempio.com" autocomplete="username" autofocus>
    </div>

    <div class="frow">
      <label for="loginPass">Password</label>
      <input id="loginPass" type="password" placeholder="Password" autocomplete="current-password">
    </div>

    <p class="err" id="loginErr">Credenziali non valide.</p>

    <div class="mbtns">
      <button type="button" id="loginCancel">Annulla</button>
      <button type="button" class="btn-primary-action" id="loginGo">Accedi</button>
    </div>
  </div>`;
  document.body.appendChild(ov);

  const go = async () => {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPass').value;
    const btn = document.getElementById('loginGo');

    if (!email || !password) {
      document.getElementById('loginErr').textContent = 'Inserisci email e password.';
      document.getElementById('loginErr').classList.add('on');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Verifica in corso…';

    try {
      if (!sb) throw new Error('Connessione cloud non disponibile');
      const { data, error } = await sb.auth.signInWithPassword({ email, password });

      if (error || !data.session) {
        throw new Error(error?.message || 'Credenziali errate');
      }

      setAuthMode(true);
      ov.remove();
      toast('Accesso eseguito come Amministratore', 'success');
    } catch (err) {
      triggerHaptic('warning');
      const errEl = document.getElementById('loginErr');
      errEl.textContent = 'Email o password errate.';
      errEl.classList.add('on');
      btn.disabled = false;
      btn.textContent = 'Accedi';
    }
  };

  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  document.getElementById('loginCancel').onclick = () => ov.remove();
  document.getElementById('loginGo').onclick = go;

  document.getElementById('loginPass').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  document.getElementById('loginEmail').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
}
