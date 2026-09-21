import { buildFitnessGoals } from './fitness-charts-model.js';

// Standing recomp box from Constraints. Shoulder:waist is physique-target.yml.
// These are gaps to a band, not a time-to-goal. A date needs a slope this data does not have.
const WEIGHT = { min: 78, max: 82 };
const FAT = { min: 8, max: 10 };
const SHOULDER_WAIST = 1.6;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function records(events, date) {
  return (events ?? [])
    .map(event => event?.record ?? event)
    .filter(record => record && record.date && record.date <= date);
}

function latest(list, pred) {
  let found = null;
  for (const record of list) {
    if (!pred(record)) continue;
    if (!found || record.date > found.date) found = record;
  }
  return found;
}

function roundTo(value, places) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function shortDate(iso) {
  const [year, month, day] = String(iso).split('-');
  const index = Number(month) - 1;
  if (!year || !MONTHS[index] || !day) return iso;
  return `${Number(day)} ${MONTHS[index]} ${year}`;
}

function bandStatus(value, min, max) {
  if (value < min) return { status: 'outside', gap: roundTo(min - value, 1), edge: 'below', bound: min };
  if (value > max) return { status: 'outside', gap: roundTo(value - max, 1), edge: 'above', bound: max };
  return { status: 'inside', gap: 0, edge: 'inside', bound: null };
}

function weightRow(list) {
  const record = latest(
    list.filter(item => (
      (item.type === 'weight' || item.type === 'composition') && Number.isFinite(item.weight_kg)
    )),
    () => true
  );
  if (!record) {
    return { id: 'weight', label: 'Weight', status: 'unread', detail: 'No weight reading.' };
  }
  const band = bandStatus(record.weight_kg, WEIGHT.min, WEIGHT.max);
  const detail = band.status === 'inside'
    ? `${record.weight_kg} kg on ${shortDate(record.date)}, inside ${WEIGHT.min}–${WEIGHT.max} kg.`
    : `${record.weight_kg} kg on ${shortDate(record.date)}, ${band.gap} kg ${band.edge} ${band.bound}.`;
  return { id: 'weight', label: 'Weight', status: band.status, detail };
}

function fatRow(list) {
  const record = latest(
    list.filter(item => item.type === 'composition' && Number.isFinite(item.body_fat_pct)),
    () => true
  );
  if (!record) {
    return { id: 'fat', label: 'Body fat', status: 'unread', detail: 'No body-fat reading.' };
  }
  const band = bandStatus(record.body_fat_pct, FAT.min, FAT.max);
  const detail = band.status === 'inside'
    ? `${record.body_fat_pct}% on ${shortDate(record.date)}, inside ${FAT.min}–${FAT.max}%.`
    : `${record.body_fat_pct}% on ${shortDate(record.date)}, ${band.gap} points ${band.edge} ${band.bound}.`;
  return { id: 'fat', label: 'Body fat', status: band.status, detail };
}

function ratioRow(list) {
  const record = latest(
    list.filter(item => (
      item.type === 'measurements'
      && Number.isFinite(item.shoulders)
      && Number.isFinite(item.waist)
      && item.waist > 0
    )),
    () => true
  );
  if (!record) {
    return { id: 'ratio', label: 'Shoulder:waist', status: 'unread', detail: 'No paired shoulder and waist tape.' };
  }
  const ratio = roundTo(record.shoulders / record.waist, 2);
  const gap = roundTo(SHOULDER_WAIST - ratio, 2);
  const status = gap > 0 ? 'outside' : 'inside';
  const place = status === 'outside'
    ? `${gap} short of ${SHOULDER_WAIST}`
    : `at or above ${SHOULDER_WAIST}`;
  return {
    id: 'ratio',
    label: 'Shoulder:waist',
    status,
    detail: `${ratio} on ${shortDate(record.date)}, ${place}. Frozen until the next tape.`
  };
}

function liftRow(events, date) {
  const goals = buildFitnessGoals({ events, date }).filter(goal => goal.kind === 'e1rm');
  const measured = goals.filter(goal => goal.current != null);
  if (!measured.length) {
    return {
      id: 'lift',
      label: 'Lifts',
      status: 'unread',
      detail: 'No completed load on Bar Press, curl, or row.'
    };
  }
  const furthest = measured.slice().sort((left, right) => (
    right.remaining - left.remaining || left.label.localeCompare(right.label)
  ))[0];
  const missing = goals.filter(goal => goal.current == null).map(goal => goal.label);
  const missingNote = missing.length ? ` No completed load for ${missing.join(', ')}.` : '';
  if (furthest.remaining > 0) {
    return {
      id: 'lift',
      label: furthest.label,
      status: 'outside',
      detail: `${furthest.current} kg on ${shortDate(furthest.date)}, ${furthest.remaining} kg short of ${furthest.target}.${missingNote}`
    };
  }
  return {
    id: 'lift',
    label: furthest.label,
    status: 'inside',
    detail: `${furthest.current} kg on ${shortDate(furthest.date)}, on the ${furthest.target} kg target.${missingNote}`
  };
}

function verdict(rows) {
  const fat = rows.find(row => row.id === 'fat');
  const weight = rows.find(row => row.id === 'weight');
  const ratio = rows.find(row => row.id === 'ratio');
  const lift = rows.find(row => row.id === 'lift');
  const liftsOpen = lift.status === 'outside' || lift.status === 'unread';
  const conflict = fat.status === 'outside' && liftsOpen
    ? ' This reading serves the fat band, not the 31 October lifts.'
    : '';

  if (fat.status === 'outside') {
    return `Body fat is binding. It is outside 8–10%, so the recomp box is not met.${conflict}`;
  }
  if (weight.status === 'outside') {
    return 'Weight is binding. Body fat is not the open gap, and weight is outside 78–82 kg.';
  }
  if (ratio.status === 'outside') {
    return 'Shoulder:waist is binding. Weight and body fat are in band, and the ratio is still short of 1.6.';
  }
  if (lift.status === 'outside') {
    return `${lift.label} is binding. The physique bands are met, and this is the furthest lift that has a completed load.`;
  }
  const missing = rows.filter(row => row.status === 'unread').map(row => row.label);
  if (missing.length) return `No binding goal yet. Missing: ${missing.join(', ')}.`;
  return 'All four goals are inside their targets.';
}

export function buildBindingGoal({ events, date } = {}) {
  if (!date) throw new RangeError('Binding goal date is unavailable');
  const list = records(events, date);
  const rows = [weightRow(list), fatRow(list), ratioRow(list), liftRow(events, date)];
  return { rows, verdict: verdict(rows) };
}
