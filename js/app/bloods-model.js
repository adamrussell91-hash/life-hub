import {
  BODY_RANGES,
  DEFAULT_BODY_RANGE,
  rangeWindow,
  seriesInRange
} from './body-model.js';

export const BLOODS_CATEGORY_ORDER = [
  'Inflammation Markers',
  'Iron Studies',
  'Liver Function',
  'Full Blood Count',
  'Lipid Studies',
  'Vitamins & Nutrients',
  'Biochemistry/Electrolytes',
  'Thyroid',
  'Glucose/Diabetes'
];

const RANGE_LABELS = {
  monthly: 'Month',
  six_month: '6M',
  year: 'Year',
  five_year: '5Y'
};

export function buildBloodsModel({ events, date, range = DEFAULT_BODY_RANGE } = {}) {
  if (!date) throw new RangeError('Bloods display date is unavailable');
  const selectedRange = BODY_RANGES.includes(range) ? range : DEFAULT_BODY_RANGE;
  const bounds = rangeWindow(date, selectedRange);

  const grouped = new Map();
  for (const event of events ?? []) {
    const record = event?.record;
    if (record?.type !== 'bloods' || !Array.isArray(record.markers)) continue;
    const dateKey = record.date;
    for (const marker of record.markers) {
      if (!marker?.key) continue;
      if (!grouped.has(marker.key)) grouped.set(marker.key, []);
      grouped.get(marker.key).push({
        date: dateKey,
        key: marker.key,
        label: marker.label,
        category: marker.category || 'Other',
        value: marker.value,
        unit: marker.unit,
        ref_low: marker.ref_low ?? null,
        ref_high: marker.ref_high ?? null,
        status: marker.status ?? null
      });
    }
  }

  const markers = [];
  for (const observations of grouped.values()) {
    observations.sort((a, b) => a.date.localeCompare(b.date) || compareNullable(a.value, b.value));
    markers.push(markerModel(observations, bounds, selectedRange));
  }

  const flaggedKeys = new Set();
  const flagged = markers
    .filter(marker => marker.latest && (marker.latest.status === 'High' || marker.latest.status === 'Low'))
    .sort((a, b) => {
      const dateCmp = (b.latest.date ?? '').localeCompare(a.latest.date ?? '');
      if (dateCmp) return dateCmp;
      if (a.latest.status !== b.latest.status) return a.latest.status === 'High' ? -1 : 1;
      return a.label.localeCompare(b.label);
    })
    .map(marker => {
      flaggedKeys.add(marker.key);
      return {
        key: marker.key,
        label: marker.label,
        value: marker.latest.value,
        unit: marker.latest.unit,
        status: marker.latest.status,
        date: marker.latest.date,
        category: marker.category
      };
    });

  const byCategory = new Map();
  for (const marker of markers) {
    const id = marker.category;
    if (!byCategory.has(id)) {
      byCategory.set(id, {
        id,
        title: id,
        markers: [],
        hasFlags: false
      });
    }
    const category = byCategory.get(id);
    category.markers.push(marker);
    if (flaggedKeys.has(marker.key)) category.hasFlags = true;
  }

  const categories = [...byCategory.values()].sort((a, b) => categoryRank(a.id) - categoryRank(b.id)
    || a.title.localeCompare(b.title));

  return {
    date,
    range: selectedRange,
    rangeLabel: RANGE_LABELS[selectedRange],
    flagged,
    categories
  };
}

function markerModel(observations, bounds, selectedRange) {
  const latest = observations.at(-1);
  const qualitative = latest.value == null || latest.unit === 'Qualitative';
  const numeric = observations
    .filter(point => point.value != null && Number.isFinite(Number(point.value)))
    .map(point => ({ date: point.date, value: Number(point.value) }));

  const current = numeric.at(-1)?.value ?? null;
  const previous = numeric.length > 1 ? numeric.at(-2).value : null;
  const first = numeric[0]?.value ?? null;
  const lastDelta = current != null && previous != null ? current - previous : null;
  const overallDelta = current != null && first != null && numeric.length > 1
    ? current - first
    : null;

  const good = latest.status === 'High' ? 'down' : latest.status === 'Low' ? 'up' : null;
  const series = qualitative ? [] : seriesInRange(numeric, bounds, selectedRange);

  return {
    key: latest.key,
    label: latest.label || latest.key,
    category: latest.category,
    qualitative,
    latest: {
      date: latest.date,
      value: latest.value ?? null,
      unit: latest.unit ?? null,
      status: latest.status ?? null,
      ref_low: latest.ref_low ?? null,
      ref_high: latest.ref_high ?? null
    },
    series,
    lastDelta,
    overallDelta,
    lastColour: bloodsColour(lastDelta, good),
    overallColour: bloodsColour(overallDelta, good)
  };
}

function bloodsColour(delta, good) {
  if (delta == null || !Number.isFinite(delta) || delta === 0 || !good) return 'neutral';
  const direction = delta > 0 ? 'up' : 'down';
  return good === direction ? 'green' : 'red';
}

function categoryRank(id) {
  const index = BLOODS_CATEGORY_ORDER.indexOf(id);
  return index === -1 ? BLOODS_CATEGORY_ORDER.length : index;
}

function compareNullable(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}
