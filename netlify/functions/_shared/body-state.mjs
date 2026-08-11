// Chadwick's (and, from Phase 3, Brisket's) eyes on Adam's body: a bounded read of the
// most recent composition/measurements records, formatted into a compact prompt block.
//
// Budget discipline: selectLatestBodyEntries only inspects the already-fetched repo tree
// (a single resolveTree() call, no extra cost) and returns at most `limit` paths per type.
// The caller reads only those blobs -- never a full history scan.

export const BODY_ENTRY_PATH = /^data\/body\/\d{4}\/\d{2}\/\d{4}-\d{2}-\d{2}-(composition|measurements)\.md$/;

const COMPOSITION_FIELDS = [
  { key: 'weight_kg', label: 'weight', unit: 'kg' },
  { key: 'body_fat_pct', label: 'body fat', unit: '%' },
  { key: 'skeletal_muscle_kg', label: 'skeletal muscle', unit: 'kg' }
];

export function selectLatestBodyEntries(tree, { limit = 2 } = {}) {
  const byType = { composition: [], measurements: [] };
  if (!Array.isArray(tree)) return byType;
  for (const entry of tree) {
    if (!entry || entry.type !== 'blob' || typeof entry.path !== 'string') continue;
    const match = BODY_ENTRY_PATH.exec(entry.path);
    if (!match) continue;
    byType[match[1]].push(entry);
  }
  for (const type of Object.keys(byType)) {
    byType[type] = byType[type]
      .slice()
      .sort((a, b) => b.path.localeCompare(a.path))
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

export function formatBodyStateForPrompt({
  compositionRecords = [],
  measurementRecords = [],
  targetRatio
} = {}) {
  const lines = [];
  const [latestComposition, previousComposition] = compositionRecords;
  if (latestComposition) {
    const bits = COMPOSITION_FIELDS
      .map(({ key, label, unit }) => {
        const value = latestComposition[key];
        if (typeof value !== 'number' || !Number.isFinite(value)) return null;
        return `${label} ${value}${unit}${formatDelta(value, previousComposition?.[key], unit)}`;
      })
      .filter(Boolean);
    if (bits.length) lines.push(`Body composition (${latestComposition.date ?? 'latest'}): ${bits.join(', ')}.`);
  }

  const [latestMeasurements, previousMeasurements] = measurementRecords;
  if (latestMeasurements) {
    const tapeBits = [];
    if (typeof latestMeasurements.shoulders === 'number' && Number.isFinite(latestMeasurements.shoulders)) {
      tapeBits.push(`shoulders ${latestMeasurements.shoulders}cm${formatDelta(latestMeasurements.shoulders, previousMeasurements?.shoulders, 'cm')}`);
    }
    if (typeof latestMeasurements.waist === 'number' && Number.isFinite(latestMeasurements.waist)) {
      tapeBits.push(`waist ${latestMeasurements.waist}cm${formatDelta(latestMeasurements.waist, previousMeasurements?.waist, 'cm')}`);
    }
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
