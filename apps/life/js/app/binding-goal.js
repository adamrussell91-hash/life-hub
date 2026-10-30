import { buildFitnessGoals } from './fitness-charts-model.js';
import { formatDisplayDate } from '../core/time.js';
import { bodyCompositionTargets, strengthTargets } from '../core/forecast-targets.js';

// The recomp box, shoulder:waist target and lift deadline come from
// config/targets.yml `forecast` (private data repo). No numbers live here.
// These are gaps to a band, not a time-to-goal. A date needs a slope this data does not have.
function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function goalTargets(targetsConfig) {
  const body = bodyCompositionTargets(targetsConfig) ?? {};
  const deadline = strengthTargets(targetsConfig).deadline;
  return {
    weight: { min: finite(body.weight_kg_min), max: finite(body.weight_kg_max) },
    fat: { min: finite(body.body_fat_pct_min), max: finite(body.body_fat_pct_max) },
    ratio: finite(body.shoulder_waist_ratio),
    deadline: deadline && /^\d{4}-\d{2}-\d{2}$/.test(deadline) ? deadline : null
  };
}

function deadlineLabel(iso) {
  if (!iso) return null;
  const [, month, day] = iso.split('-').map(Number);
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${day} ${names[month - 1]}`;
}

function hasBand(band) {
  return band.min != null && band.max != null;
}

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

function bandStatus(value, min, max) {
  if (value < min) return { status: 'outside', gap: roundTo(min - value, 1), edge: 'below', bound: min };
  if (value > max) return { status: 'outside', gap: roundTo(value - max, 1), edge: 'above', bound: max };
  return { status: 'inside', gap: 0, edge: 'inside', bound: null };
}

function weightRow(list, WEIGHT) {
  if (!hasBand(WEIGHT)) {
    return { id: 'weight', label: 'Weight', status: 'unread', detail: 'No weight target set.' };
  }
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
    ? `${record.weight_kg} kg on ${formatDisplayDate(record.date)}, inside ${WEIGHT.min}–${WEIGHT.max} kg.`
    : `${record.weight_kg} kg on ${formatDisplayDate(record.date)}, ${band.gap} kg ${band.edge} ${band.bound}.`;
  return { id: 'weight', label: 'Weight', status: band.status, detail };
}

function fatRow(list, FAT) {
  if (!hasBand(FAT)) {
    return { id: 'fat', label: 'Body fat', status: 'unread', detail: 'No body-fat target set.' };
  }
  const record = latest(
    list.filter(item => item.type === 'composition' && Number.isFinite(item.body_fat_pct)),
    () => true
  );
  if (!record) {
    return { id: 'fat', label: 'Body fat', status: 'unread', detail: 'No body-fat reading.' };
  }
  const band = bandStatus(record.body_fat_pct, FAT.min, FAT.max);
  const detail = band.status === 'inside'
    ? `${record.body_fat_pct}% on ${formatDisplayDate(record.date)}, inside ${FAT.min}–${FAT.max}%.`
    : `${record.body_fat_pct}% on ${formatDisplayDate(record.date)}, ${band.gap} points ${band.edge} ${band.bound}.`;
  return { id: 'fat', label: 'Body fat', status: band.status, detail };
}

function ratioRow(list, SHOULDER_WAIST) {
  if (SHOULDER_WAIST == null) {
    return { id: 'ratio', label: 'Shoulder:waist', status: 'unread', detail: 'No shoulder:waist target set.' };
  }
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
    detail: `${ratio} on ${formatDisplayDate(record.date)}, ${place}. Frozen until the next tape.`
  };
}

function liftRow(events, date, targetsConfig) {
  const goals = buildFitnessGoals({ events, date, targetsConfig }).filter(goal => goal.kind === 'e1rm');
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
      detail: `${furthest.current} kg on ${formatDisplayDate(furthest.date)}, ${furthest.remaining} kg short of ${furthest.target}.${missingNote}`
    };
  }
  return {
    id: 'lift',
    label: furthest.label,
    status: 'inside',
    detail: `${furthest.current} kg on ${formatDisplayDate(furthest.date)}, on the ${furthest.target} kg target.${missingNote}`
  };
}

function judge(rows, targets) {
  const fat = rows.find(row => row.id === 'fat');
  const weight = rows.find(row => row.id === 'weight');
  const ratio = rows.find(row => row.id === 'ratio');
  const lift = rows.find(row => row.id === 'lift');
  const liftsOpen = lift.status === 'outside' || lift.status === 'unread';
  const conflict = fat.status === 'outside' && liftsOpen
    ? (targets.deadline ? ` This reading serves the fat band, not the ${deadlineLabel(targets.deadline)} lifts.` : ' This reading serves the fat band, not the lifts.')
    : '';

  if (fat.status === 'outside') {
    return {
      bindingId: 'fat',
      verdict: `Body fat is binding. It is outside ${targets.fat.min}–${targets.fat.max}%, so the recomp box is not met.${conflict}`
    };
  }
  if (weight.status === 'outside') {
    return {
      bindingId: 'weight',
      verdict: `Weight is binding. Body fat is not the open gap, and weight is outside ${targets.weight.min}–${targets.weight.max} kg.`
    };
  }
  if (ratio.status === 'outside') {
    return {
      bindingId: 'ratio',
      verdict: `Shoulder:waist is binding. Weight and body fat are in band, and the ratio is still short of ${targets.ratio}.`
    };
  }
  if (lift.status === 'outside') {
    return {
      bindingId: 'lift',
      verdict: `${lift.label} is binding. The physique bands are met, and this is the furthest lift that has a completed load.`
    };
  }
  const missing = rows.filter(row => row.status === 'unread').map(row => row.label);
  if (missing.length) {
    return { bindingId: null, verdict: `No binding goal yet. Missing: ${missing.join(', ')}.` };
  }
  return { bindingId: null, verdict: 'All four goals are inside their targets.' };
}

export function buildBindingGoal({ events, date, targetsConfig = null } = {}) {
  if (!date) throw new RangeError('Binding goal date is unavailable');
  const list = records(events, date);
  const targets = goalTargets(targetsConfig);
  const rows = [
    weightRow(list, targets.weight),
    fatRow(list, targets.fat),
    ratioRow(list, targets.ratio),
    liftRow(events, date, targetsConfig)
  ];
  return { rows, ...judge(rows, targets) };
}
