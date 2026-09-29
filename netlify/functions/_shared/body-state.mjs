// Chadwick / Brisket / Sara eyes on Adam's body: a bounded read of the most
// recent composition/measurements records, formatted into a compact prompt block.
//
// Budget discipline: selectLatestBodyEntries only inspects the already-fetched repo tree
// (a single resolveTree() call, no extra cost) and returns at most `limit` paths per type.
// The caller reads only those blobs -- never a full history scan.
//
// Path shape must stay aligned with repo-policy EVENT_PATH name rules for body files:
// chat persist writes …-composition-0923.md; Body-page sync already accepts that. A
// stricter regex here silently drops those rows and makes Aug look "latest".

export const BODY_ENTRY_PATH =
  /^data\/body\/\d{4}\/\d{2}\/(?<date>\d{4}-\d{2}-\d{2})-(?<type>composition|measurements)(?:-(?<suffix>[a-z0-9]+))?\.md$/;

const COMPOSITION_FIELDS = [
  { key: 'weight_kg', label: 'weight', unit: 'kg' },
  { key: 'body_fat_pct', label: 'body fat', unit: '%' },
  { key: 'skeletal_muscle_kg', label: 'skeletal muscle', unit: 'kg' },
  { key: 'visceral_fat_level', label: 'visceral fat', unit: '' },
  { key: 'body_age', label: 'body age', unit: 'y' }
];

const MEASUREMENT_FIELDS = [
  { key: 'neck', label: 'neck' },
  { key: 'shoulders', label: 'shoulders' },
  { key: 'chest', label: 'chest' },
  { key: 'waist', label: 'waist' },
  { key: 'hips', label: 'hips' },
  { key: 'right_arm_flexed', label: 'right arm flexed' },
  { key: 'left_arm_flexed', label: 'left arm flexed' },
  { key: 'right_arm_relaxed', label: 'right arm relaxed' },
  { key: 'left_arm_relaxed', label: 'left arm relaxed' },
  { key: 'right_thigh', label: 'right thigh' },
  { key: 'left_thigh', label: 'left thigh' },
  { key: 'right_calf', label: 'right calf' },
  { key: 'left_calf', label: 'left calf' },
  { key: 'calves', label: 'calves' }
];

/** Newest-first sort key from a tree path (date + HHMM; bare same-day ranks below timed). */
export function bodyEntryRecencyKey(path) {
  const match = typeof path === 'string' ? BODY_ENTRY_PATH.exec(path) : null;
  if (!match?.groups?.date) return '';
  const suffix = match.groups.suffix || '';
  const hhmm = /^\d{4}$/.test(suffix) ? suffix : '0000';
  const letter = /^[a-z]+$/i.test(suffix) ? suffix.toLowerCase() : '';
  return `${match.groups.date}T${hhmm}${letter}`;
}

/** Newest-first sort key from a parsed record (date + time). */
export function bodyRecordRecencyKey(record) {
  const date = typeof record?.date === 'string' ? record.date : '';
  if (!date) return '';
  const raw = typeof record?.time === 'string' ? record.time : '00:00';
  const digits = raw.replace(/\D/g, '').slice(0, 4).padStart(4, '0');
  return `${date}T${digits}`;
}

export function sortBodyRecordsNewestFirst(records) {
  if (!Array.isArray(records)) return [];
  return records
    .slice()
    .sort((a, b) => bodyRecordRecencyKey(b).localeCompare(bodyRecordRecencyKey(a)));
}

export function selectLatestBodyEntries(tree, { limit = 2 } = {}) {
  const byType = { composition: [], measurements: [] };
  if (!Array.isArray(tree)) return byType;
  for (const entry of tree) {
    if (!entry || entry.type !== 'blob' || typeof entry.path !== 'string') continue;
    const match = BODY_ENTRY_PATH.exec(entry.path);
    if (!match?.groups?.type) continue;
    byType[match.groups.type].push(entry);
  }
  for (const type of Object.keys(byType)) {
    byType[type] = byType[type]
      .slice()
      .sort((a, b) => bodyEntryRecencyKey(b.path).localeCompare(bodyEntryRecencyKey(a.path)))
      .slice(0, limit);
  }
  return byType;
}

export function computeShoulderWaistRatio(record) {
  const shoulders = record?.shoulders;
  const waist = record?.waist;
  if (typeof shoulders !== 'number' || !Number.isFinite(shoulders)) return null;
  if (typeof waist !== 'number' || !Number.isFinite(waist) || waist <= 0) return null;
  return shoulders / waist;
}

function round(value, places = 2) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function formatDelta(current, previous, unit) {
  if (typeof previous !== 'number' || !Number.isFinite(previous)) return '';
  const delta = round(current - previous);
  if (Math.abs(delta) < 0.005) return ' (flat vs last reading)';
  const sign = delta > 0 ? '+' : '';
  return ` (${sign}${delta}${unit} vs last reading)`;
}


function formatExtraMetrics(metrics) {
  if (!Array.isArray(metrics)) return [];
  return metrics
    .filter(metric => metric && typeof metric.label === 'string' && typeof metric.value === 'number' && Number.isFinite(metric.value))
    .map(metric => `${metric.label} ${metric.value}${typeof metric.unit === 'string' ? metric.unit : ''}`);
}

export function formatBodyStateForPrompt({
  compositionRecords = [],
  measurementRecords = [],
  targetRatio
} = {}) {
  const lines = [];
  // Defense in depth: never trust caller order. Tools historically assumed newest-first.
  const compositions = sortBodyRecordsNewestFirst(compositionRecords);
  const measurements = sortBodyRecordsNewestFirst(measurementRecords);
  const [latestComposition, previousComposition] = compositions;
  if (latestComposition) {
    const bits = COMPOSITION_FIELDS
      .map(({ key, label, unit }) => {
        const value = latestComposition[key];
        if (typeof value !== 'number' || !Number.isFinite(value)) return null;
        return `${label} ${value}${unit}${formatDelta(value, previousComposition?.[key], unit)}`;
      })
      .filter(Boolean);
    bits.push(...formatExtraMetrics(latestComposition.extra_metrics));
    if (bits.length) lines.push(`Body composition (${latestComposition.date ?? 'latest'}): ${bits.join(', ')}.`);
  }

  const [latestMeasurements, previousMeasurements] = measurements;
  if (latestMeasurements) {
    const tapeBits = MEASUREMENT_FIELDS
      .map(({ key, label }) => {
        const value = latestMeasurements[key];
        if (typeof value !== 'number' || !Number.isFinite(value)) return null;
        return `${label} ${value}cm${formatDelta(value, previousMeasurements?.[key], 'cm')}`;
      })
      .filter(Boolean);
    tapeBits.push(...formatExtraMetrics(latestMeasurements.extra_metrics));
    if (tapeBits.length) lines.push(`Latest tape (${latestMeasurements.date ?? 'latest'}): ${tapeBits.join(', ')}.`);

    const ratio = computeShoulderWaistRatio(latestMeasurements);
    if (ratio != null) {
      const previousRatio = previousMeasurements ? computeShoulderWaistRatio(previousMeasurements) : null;
      const trend = previousRatio != null
        ? (ratio > previousRatio ? 'improving' : ratio < previousRatio ? 'declining' : 'flat')
        : null;
      const gap = typeof targetRatio === 'number' && Number.isFinite(targetRatio)
        ? ` — target ${targetRatio.toFixed(2)}, gap ${round(targetRatio - ratio).toFixed(2)}`
        : '';
      lines.push(`Shoulder:waist ratio: ${ratio.toFixed(2)}${trend ? ` (${trend})` : ''}${gap}.`);
    }
  }

  return lines.join('\n');
}
