import { state } from './state.js';
import { iso, monday, isRefereeNeeded } from './rules.js';

export const monthsWithData = () => {
  const s = new Set();
  state.items.forEach(i => s.add(i.date.slice(0, 7)));
  Object.keys(state.dayMeta).forEach(d => s.add(d.slice(0, 7)));
  return [...s].sort();
};

export const monthLabel = m => new Date(m + '-15T12:00').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });

export function computeRecapRows(m) {
  const rec = {}, add = (n, f) => { n = (n || '').trim(); if (!n) return; const k = n.toLowerCase(); (rec[k] ??= { n, p: 0, a: 0, c: 0 })[f]++; };
  const dates = new Set();
  state.items.filter(i => i.date.startsWith(m) && (!state.filterCat || i.cat === state.filterCat) && !!i.ghost && i.status !== 'annullata' && i.status !== 'rinviata').forEach(i => {
    dates.add(i.date); const seen = new Set();
    [i.t1, i.t2, i.arb].forEach(n => { n = (n || '').trim(); const k = n.toLowerCase(); if (!n || seen.has(k)) return; seen.add(k); add(n, 'p'); });
  });
  Object.keys(state.dayMeta).filter(dt => dt.startsWith(m)).forEach(dt => {
    const x = state.dayMeta[dt] || {};
    if (x.ap === 'si') add(x.apNome, 'a');
    if (x.ch === 'si') add(x.chNome, 'c');
  });
  return Object.values(rec).sort((a, b) => b.p - a.p || (b.a + b.c) - (a.a + a.c) || a.n.localeCompare(b.n));
}

export function generateWhatsAppText(startDate, endDate, customTitle, toast) {
  const startStr = iso(startDate), endStr = iso(endDate);
  const filtered = state.items.filter(i => i.date >= startStr && i.date <= endStr && i.status !== 'annullata');
  if (!filtered.length) { toast('Nessuna partita nel periodo', 'warning'); return; }

  const fmtDayHeader = dStr => new Date(dStr + 'T12:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();
  const fmtShort = d => d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });

  let out = `📅 *${customTitle || `TURNI PARTITE: ${fmtShort(startDate)} – ${fmtShort(endDate)}`}*\n\n`;
  const daysMap = {};
  filtered.forEach(i => (daysMap[i.date] ??= []).push(i));

  Object.keys(daysMap).sort().forEach(dayStr => {
    const arr = daysMap[dayStr];
    arr.sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
    out += `🏀 *${fmtDayHeader(dayStr)}*\n`;
    arr.forEach(it => {
      const timeStr = it.time ? `Ore ${it.time} - ` : '';
      const catStr = it.cat ? `[${it.cat}${it.friendly ? ' (AMICHEVOLE)' : ''}] ` : (it.friendly ? '[AMICHEVOLE] ' : '');
      const title = it.title || 'Partita';
      const t1 = it.t1 && it.t1.trim() ? it.t1.trim() : '...';
      const t2 = it.t2 && it.t2.trim() ? it.t2.trim() : '...';

      out += `• ${timeStr}${catStr}${title}\n`;
      out += `  - Tavolo 1: ${t1}\n`;
      if (!it.friendly) {
        out += `  - Tavolo 2: ${t2}\n`;
      }
      if (isRefereeNeeded(it.cat, it.friendly)) {
        const arb = it.arb && it.arb.trim() ? it.arb.trim() : '...';
        out += `  - Arbitro: ${arb}\n`;
      }
      out += '\n';
    });
  });

  try {
    navigator.clipboard.writeText(out.trim());
    toast('Turni copiati per WhatsApp!', 'success');
  } catch(e) { prompt('Copia il testo:', out); }
}

export function copyMonthRecapWhatsApp(m, toast) {
  const rows = computeRecapRows(m);
  if (!rows.length) { toast('Nessun dato presente', 'warning'); return; }
  let out = `📊 *RIEPILOGO TURNI — ${monthLabel(m).toUpperCase()}*\n\n`;
  rows.forEach(r => {
    const v = Object.assign({ p: 10, a: 10, c: 10 }, state.molt[r.n.toLowerCase()]);
    const pv = r.p * v.p, av = r.a * v.a + r.c * v.c, tot = pv + av;
    out += `• *${r.n}*: ${tot}€ (Partite: ${r.p}, Ap/Ch: ${r.a + r.c})\n`;
  });
  try {
    navigator.clipboard.writeText(out.trim());
    toast('Riepilogo copiato per WhatsApp!', 'success');
  } catch(e) { prompt('Copia il testo:', out); }
}

export function copyReadOnlyLink(toast) {
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set('readonly', 'true');
  const fullUrl = url.toString();
  
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(fullUrl).then(() => {
      toast('Link sola lettura copiato!', 'success');
    }).catch(() => {
      prompt('Copia il link sola lettura:', fullUrl);
    });
  } else {
    prompt('Copia il link sola lettura:', fullUrl);
  }
}

export function exportSelectedMonthsJSON(selectedMonths, toast) {
  const days = {};
  state.items.filter(i => selectedMonths.some(m => i.date.startsWith(m))).forEach(i => {
    (days[i.date] ??= []).push({
      partita: i.title || '',
      cat: i.cat || '',
      tavolo1: i.t1 || '',
      tavolo2: i.t2 || '',
      arbitro: i.arb || '',
      orario: i.time || '',
      amichevole: !!i.friendly,
      score: i.score || '',
      status: i.status || '',
      fileData: i.fileData || null,
      fileName: i.fileName || null
    });
  });
  const out = Object.keys(days).filter(d => days[d].length).sort().map(d => {
    const x = state.dayMeta[d] || {};
    return {
      data: d,
      apertura: { si: x.ap === 'si', nome: x.ap === 'si' ? (x.apNome || '') : null },
      chiusura: { si: x.ch === 'si', nome: x.ch === 'si' ? (x.chNome || '') : null },
      partite: days[d]
    };
  });
  if (!out.length) { toast('Nessun dato presente', 'warning'); return; }
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  a.download = `partite_${selectedMonths.join('_')}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function generateMonthPDF(m, toast) {
  if (!(window.jspdf && window.jspdf.jsPDF)) { toast('Libreria non caricata', 'warning'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight();
  const ml = 40, mr = 40, mt = 48, mb = 40; let y = mt;
  const nl = (h = 14) => { y += h; if (y > ph - mb) { doc.addPage(); y = mt; } };

  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text('Partite — ' + monthLabel(m), ml, y);
  nl(24); doc.setDrawColor(200); doc.line(ml, y, pw - mr, y); nl(16);

  if (!state.READONLY) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text('Riepilogo del mese', ml, y); nl(16);
    const rows = computeRecapRows(m);
    doc.setFontSize(10);
    if (!rows.length) { doc.setFont('helvetica', 'normal'); doc.text('Nessun dato.', ml, y); nl(16); }
    else {
      const cols = [{ w: 170, h: 'Nome' }, { w: 90, h: 'Partite' }, { w: 110, h: 'Apert./Chius.' }, { w: 80, h: 'Totale' }];
      doc.setFont('helvetica', 'bold'); let x = ml; cols.forEach(c => { doc.text(c.h, x, y); x += c.w; }); nl(14);
      doc.setDrawColor(220); doc.line(ml, y - 10, pw - mr, y - 10);
      doc.setFont('helvetica', 'normal');
      rows.forEach(r => {
        const v = Object.assign({ p: 10, a: 10, c: 10 }, state.molt[r.n.toLowerCase()]);
        const pv = r.p * v.p, av = r.a * v.a + r.c * v.c, tot = pv + av;
        let x = ml;
        [r.n, String(pv), String(av), String(tot) + '€'].forEach((t, i) => { doc.text(t, x, y); x += cols[i].w; });
        nl(15);
      });
    }
    nl(10);
  }

  const days = {};
  state.items.filter(i => i.date.startsWith(m) && i.status !== 'annullata').forEach(i => (days[i.date] ??= []).push(i));
  Object.keys(state.dayMeta).filter(d => d.startsWith(m)).forEach(d => { if (!days[d]) days[d] = []; });
  const dateKeys = Object.keys(days).sort();
  dateKeys.forEach(dt => {
    const list = days[dt]; if (!list.length) return;
    const x = state.dayMeta[dt] || {};
    doc.setDrawColor(210); doc.line(ml, y, pw - mr, y); nl(16);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text(new Date(dt + 'T12:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }), ml, y);
    nl(14);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    if (!state.READONLY) {
      const ap = x.ap === 'si' ? ('Apertura: sì (' + (x.apNome || '—') + ')') : 'Apertura: no';
      const ch = x.ch === 'si' ? ('Chiusura: sì (' + (x.chNome || '—') + ')') : 'Chiusura: no';
      doc.text(ap + '    ' + ch, ml, y); nl(16);
    }
    list.forEach(it => {
      doc.setFont('helvetica', 'bold'); doc.text(`• ${it.time ? it.time + ' - ' : ''}${it.title || '(senza titolo)'}${it.friendly ? ' [AMICHEVOLE]' : ''}`, ml + 6, y); nl(13);
      doc.setFont('helvetica', 'normal');
      doc.text(`Tavolo 1: ${it.t1 || '—'}    Tavolo 2: ${it.t2 || '—'}    Arbitro: ${it.arb || '—'}`, ml + 16, y);
      nl(16);
    });
    nl(4);
  });
  doc.save('partite_' + m + '.pdf');
  toast('PDF scaricato', 'success');
}
