import { state } from './state.js';

export const uid = () => Math.random().toString(36).slice(2, 10);
export const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
export const monday = s => { const d = new Date(s + 'T12:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };

export function isRefereeNeeded(cat, isFriendly) {
  if (isFriendly) return true;
  if (!cat) return true;
  const c = cat.toUpperCase().replace(/\s+/g, '');
  return !(c === 'U15' || c === 'U17' || c === 'U19');
}

export function isMissingRequirements(item) {
  if (item.status === 'rinviata' || item.status === 'annullata') return false;
  const hasT1 = !!(item.t1 && item.t1.trim());
  const hasT2 = !!(item.t2 && item.t2.trim());
  const hasArb = !!(item.arb && item.arb.trim());

  if (!hasT1) return true;
  if (item.friendly) return !hasArb;
  if (!hasT2) return true;
  if (isRefereeNeeded(item.cat, false) && !hasArb) return true;
  return false;
}

export function isWithinOneDayOrLess(dateStr) {
  if (!dateStr) return false;
  const now = new Date();
  const todayIso = iso(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return (dateStr === todayIso || dateStr === iso(tomorrow));
}

export function getUrgentIncompleteMatches() {
  return state.items.filter(it => isWithinOneDayOrLess(it.date) && isMissingRequirements(it));
}

export function getPendingPostponedMatches() {
  return state.items.filter(it => it.status === 'rinviata' && !it.postponedDate);
}

export function getMatchOutcome(item) {
  if (item.status === 'rinviata') return { type: 'suspended', label: item.postponedDate ? `Rinviata (${item.postponedDate})` : 'Rinviata (Da def.)' };
  if (item.status === 'annullata') return { type: 'loss', label: 'Cancellata' };
  if (item.status === 'sospesa') return { type: 'suspended', label: 'Sospesa' };
  if (item.status === 'vinta') return { type: 'win', label: item.score ? `${item.score} (V)` : 'Vinta' };
  if (item.status === 'persa') return { type: 'loss', label: item.score ? `${item.score} (P)` : 'Persa' };

  if (item.score && String(item.score).includes('-')) {
    const [h, a] = item.score.split('-').map(x => parseInt(x.trim(), 10));
    if (!isNaN(h) && !isNaN(a)) {
      if (h > a) return { type: 'win', label: `${h}-${a}` };
      if (h < a) return { type: 'loss', label: `${h}-${a}` };
      return { type: 'suspended', label: `${h}-${a}` };
    }
  }
  return null;
}

export function getCategoryFipUrl(catStr) {
  if (!catStr || !state.fipLinks) return null;
  const cleaned = catStr.trim().toUpperCase().replace(/\s+/g, '');
  for (const k of Object.keys(state.fipLinks)) {
    const testK = k.toUpperCase().replace(/\s+/g, '');
    if (cleaned === testK || cleaned.startsWith(testK) || testK.startsWith(cleaned)) {
      return state.fipLinks[k];
    }
  }
  return null;
}

export function checkPersonRosterConflicts(targetMatchId, date, timeStr, t1, t2, arb, targetCategory = '') {
  if (!date || !timeStr) return [];

  const catUpper = (targetCategory || '').toUpperCase().replace(/\s+/g, '');
  const excludedYears = ['2019', '2018', '2017', '2016', 'U6', 'U7', 'U8', 'U9', 'U10'];
  if (excludedYears.some(y => catUpper.includes(y))) {
    return [];
  }

  const assigned = [t1, t2, arb].map(x => (x || '').trim().toLowerCase()).filter(Boolean);
  if (!assigned.length) return [];

  const [th, tm] = timeStr.split(':').map(Number);
  const targetMinutes = th * 60 + tm;
  const conflicts = [];

  state.items.filter(it => it.id !== targetMatchId && it.date === date && it.time && it.status !== 'annullata' && it.status !== 'rinviata').forEach(it => {
    const otherCatUpper = (it.cat || '').toUpperCase().replace(/\s+/g, '');
    if (excludedYears.some(y => otherCatUpper.includes(y))) return;

    const [oh, om] = it.time.split(':').map(Number);
    const otherMinutes = oh * 60 + om;
    const diff = Math.abs(targetMinutes - otherMinutes);

    if (diff < 120) {
      const otherNames = [it.t1, it.t2, it.arb].map(x => (x || '').trim().toLowerCase()).filter(Boolean);
      assigned.forEach(n => {
        if (otherNames.includes(n)) {
          conflicts.push(`⚠️ <b>${n.toUpperCase()}</b> è già impegnato alle ${it.time} (${it.title || 'Altra gara'})`);
        }
      });
    }
  });

  return [...new Set(conflicts)];
}

export function findConflictingMatches() {
  const conflicts = new Map();
  const excludedYears = ['2019', '2018', '2017', '2016', 'U6', 'U7', 'U8', 'U9', 'U10'];

  const validItems = state.items.filter(it => {
    if (it.status === 'annullata' || it.status === 'rinviata' || !it.date || !it.time) return false;
    const catUpper = (it.cat || '').toUpperCase().replace(/\s+/g, '');
    return !excludedYears.some(y => catUpper.includes(y));
  });

  validItems.forEach((m) => {
    const [mh, mm] = m.time.split(':').map(Number);
    const mMinutes = mh * 60 + mm;

    validItems.forEach((other) => {
      if (m.id === other.id) return;
      if (m.date === other.date) {
        const [oh, om] = other.time.split(':').map(Number);
        const oMinutes = oh * 60 + om;

        if (Math.abs(mMinutes - oMinutes) < 120) {
          if (!conflicts.has(m.id)) {
            conflicts.set(m.id, []);
          }
          conflicts.get(m.id).push(other);
        }
      }
    });
  });

  return conflicts;
}

export function getConflictClusters() {
  const conflictsMap = findConflictingMatches();
  const visited = new Set();
  const clusters = [];

  for (const matchId of conflictsMap.keys()) {
    if (visited.has(matchId)) continue;

    const cluster = [];
    const queue = [matchId];
    visited.add(matchId);

    while (queue.length > 0) {
      const curId = queue.shift();
      const matchObj = state.items.find(x => x.id === curId);
      if (matchObj) cluster.push(matchObj);

      const neighbors = conflictsMap.get(curId) || [];
      for (const n of neighbors) {
        if (!visited.has(n.id)) {
          visited.add(n.id);
          queue.push(n.id);
        }
      }
    }

    if (cluster.length > 1) {
      cluster.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      clusters.push(cluster);
    }
  }

  clusters.sort((a, b) => {
    const dComp = a[0].date.localeCompare(b[0].date);
    if (dComp !== 0) return dComp;
    return (a[0].time || '').localeCompare(b[0].time || '');
  });

  return clusters;
}

export function triggerHaptic() {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try { navigator.vibrate(10); } catch(e) {}
  }
}
