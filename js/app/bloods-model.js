import {
  BODY_RANGES,
  DEFAULT_BODY_RANGE,
  rangeWindow,
  seriesInRange
} from './body-model.js';
import { ratioTone } from './bloods-charts-layout.js';
import { formatDisplayDate } from '../core/time.js';

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

export const FAVOURABLE_HIGH_KEYS = new Set(['hdl', 'hdl_cholesterol']);
export const ZONED_MARKER_KEYS = new Set([
  'hba1c',
  'hba1c_ngsp',
  'hba1c_ifcc',
  'fasting_glucose',
  'glucose_fasting'
]);
export const FLARE_TAGS = new Set(['flare', 'ibd']);
export const TREND_GAP_DAYS = 90;

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
  const panels = [];
  for (const event of events ?? []) {
    const record = event?.record;
    if (record?.type !== 'bloods' || !Array.isArray(record.markers)) continue;
    const dateKey = record.date;
    panels.push({
      date: dateKey,
      lab: record.lab || record.laboratory || null,
      notes: record.notes || null
    });
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
        status: marker.status ?? null,
        notes: marker.notes || record.notes || null
      });
    }
  }

  const markers = [];
  for (const observations of grouped.values()) {
    observations.sort((a, b) => a.date.localeCompare(b.date) || compareNullable(a.value, b.value));
    markers.push(markerModel(observations, bounds, selectedRange));
  }

  const numericLatest = markers.filter(marker => !marker.qualitative && marker.latest);
  const inRangeCount = numericLatest.filter(marker => marker.latest.status === 'Normal').length;

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

  const categories = [...byCategory.values()]
    .map(category => decorateCategory(category))
    .sort((a, b) => Number(b.hasFlags) - Number(a.hasFlags)
      || categoryRank(a.id) - categoryRank(b.id)
      || a.title.localeCompare(b.title));

  panels.sort((a, b) => a.date.localeCompare(b.date));
  const lastPanel = panels.at(-1);
  const lastCollected = lastPanel
    ? {
      date: lastPanel.date,
      lab: lastPanel.lab,
      stale: daysBetween(lastPanel.date, date) > TREND_GAP_DAYS
    }
    : null;

  return {
    date,
    range: selectedRange,
    rangeLabel: RANGE_LABELS[selectedRange],
    flagged,
    categories,
    markerCount: numericLatest.length,
    inRangeCount,
    lastCollected,
    flareMarks: flareMarks(events, bounds),
    appointmentLines: appointmentLines(markers)
  };
}

function decorateCategory(category) {
  const high = category.markers.filter(m => m.latest?.status === 'High').length;
  const low = category.markers.filter(m => m.latest?.status === 'Low').length;
  const n = category.markers.length;
  let summary = `${n} marker${n === 1 ? '' : 's'}, all normal`;
  if (high || low) {
    const bits = [];
    if (high) bits.push(`${high} high`);
    if (low) bits.push(`${low} low`);
    summary = `${n} marker${n === 1 ? '' : 's'}, ${bits.join(', ')}`;
  }
  return {
    ...category,
    collapsed: !category.hasFlags,
    summary,
    combined: combinedChart(category),
    lipidRatio: lipidRatio(category)
  };
}

function combinedChart(category) {
  if (category.id === 'Iron Studies') {
    const series = category.markers
      .filter(m => !m.qualitative && m.latest)
      .map(normalisedSeries);
    return series.length ? { kind: 'iron', series } : null;
  }
  if (category.id === 'Liver Function') {
    const keys = new Set(category.markers.map(m => m.key));
    if (!['alt', 'ast', 'ggt'].every(key => keys.has(key))) return null;
    const series = category.markers
      .filter(m => ['alt', 'ast', 'ggt'].includes(m.key) && !m.qualitative)
      .map(normalisedSeries);
    return series.length === 3 ? { kind: 'liver', series } : null;
  }
  return null;
}

const TOTAL_KEYS = new Set(['cholesterol', 'total_cholesterol']);
const HDL_KEYS = new Set(['hdl', 'hdl_cholesterol']);

function lipidRatio(category) {
  if (category.id !== 'Lipid Studies') return null;
  const lab = category.markers.find(m => m.key === 'tc_hdl_ratio' && m.latest?.value != null);
  if (lab) {
    const value = Number(lab.latest.value);
    return { value, source: 'lab', date: lab.latest.date, tone: ratioTone(value) };
  }
  const total = category.markers.find(m => TOTAL_KEYS.has(m.key) && m.latest?.value != null);
  const hdl = category.markers.find(m => HDL_KEYS.has(m.key) && m.latest?.value);
  if (!total || !hdl || !Number(hdl.latest.value)) return null;
  const value = Number(total.latest.value) / Number(hdl.latest.value);
  if (!Number.isFinite(value)) return null;
  return { value, source: 'computed', date: total.latest.date, tone: ratioTone(value) };
}

function normalisedSeries(marker) {
  const low = Number(marker.latest?.ref_low);
  const high = Number(marker.latest?.ref_high);
  const span = Number.isFinite(low) && Number.isFinite(high) && high !== low ? high - low : null;
  return {
    key: marker.key,
    label: marker.label,
    points: (marker.series.length ? marker.series : []).map(point => ({
      date: point.date,
      value: span == null ? null : (point.value - low) / span
    }))
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
  const previousDate = numeric.length > 1 ? numeric.at(-2).date : null;
  const first = numeric[0]?.value ?? null;
  const lastDelta = current != null && previous != null ? current - previous : null;
  const overallDelta = current != null && first != null && numeric.length > 1
    ? current - first
    : null;

  const goodDirection = goodMove(latest.status, latest.key);
  let series = qualitative ? [] : seriesInRange(numeric, bounds, selectedRange);
  if (!qualitative && series.length === 0 && numeric.length) {
    series = [{ date: numeric.at(-1).date, value: numeric.at(-1).value }];
  }

  const firstReading = lastDelta == null;
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
      ref_high: latest.ref_high ?? null,
      notes: latest.notes ?? null
    },
    series,
    chartKind: chartKind(latest.key, qualitative, numeric.length),
    statusTone: statusTone(latest.status, latest.key),
    span: 'narrow',
    previousDate,
    lastDelta,
    overallDelta,
    lastColour: firstReading ? 'first' : bloodsColour(lastDelta, goodDirection),
    overallColour: firstReading ? 'first' : bloodsColour(overallDelta, goodDirection),
    lastDeltaLabel: deltaLabel(lastDelta, previousDate, latest.date)
  };
}

export function statusTone(status, key) {
  const invert = FAVOURABLE_HIGH_KEYS.has(key);
  if (status === 'High') return invert ? 'normal' : 'high';
  if (status === 'Low') return invert ? 'high' : 'low';
  if (status === 'Normal') return 'normal';
  return 'first';
}

function chartKind(key, qualitative, numericCount) {
  if (qualitative || numericCount < 1) return 'none';
  if (ZONED_MARKER_KEYS.has(key)) return 'zoned';
  if (numericCount >= 3) return 'line';
  return 'range-bar';
}

function goodMove(status, key) {
  const invert = FAVOURABLE_HIGH_KEYS.has(key);
  if (status === 'High') return invert ? 'up' : 'down';
  if (status === 'Low') return invert ? 'down' : 'up';
  return null;
}

function bloodsColour(delta, good) {
  if (delta == null || !Number.isFinite(delta) || delta === 0 || !good) return 'neutral';
  const direction = delta > 0 ? 'up' : 'down';
  return good === direction ? 'green' : 'red';
}

function deltaLabel(delta, previousDate, latestDate) {
  if (delta == null || !Number.isFinite(delta)) return null;
  const mag = Math.abs(delta);
  const text = Number.isInteger(mag) ? String(mag) : mag.toFixed(1);
  const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
  if (previousDate && daysBetween(previousDate, latestDate) > TREND_GAP_DAYS) {
    return `${arrow}${text} since ${formatShortDate(previousDate)}`;
  }
  return `${arrow}${text}`;
}

function flareMarks(events, bounds) {
  const marks = [];
  for (const event of events ?? []) {
    const record = event?.record;
    if (record?.type !== 'diary') continue;
    const tags = (record.tags ?? []).map(tag => String(tag).toLowerCase());
    if (!tags.some(tag => FLARE_TAGS.has(tag))) continue;
    if (record.date < bounds.from || record.date > bounds.to) continue;
    marks.push({
      date: record.date,
      label: tags.find(tag => FLARE_TAGS.has(tag))
    });
  }
  return marks;
}

function appointmentLines(markers) {
  const lines = [];
  for (const marker of markers) {
    const flagged = marker.latest?.status === 'High' || marker.latest?.status === 'Low';
    const unfavourable = marker.lastColour === 'red';
    if (!flagged && !unfavourable) continue;
    const value = formatValue(marker.latest?.value, marker.latest?.unit);
    const status = marker.latest?.status || '';
    const trend = marker.lastDeltaLabel ? `, ${marker.lastDeltaLabel}` : '';
    const note = marker.latest?.notes ? ` ${marker.latest.notes}` : '';
    lines.push(`${marker.label} ${value} — ${status}${trend}.${note}`.trim());
  }
  return lines;
}

function formatValue(value, unit) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const n = Number(value);
  const text = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return unit ? `${text} ${unit}` : text;
}

function formatShortDate(iso) {
  return formatDisplayDate(iso);
}

function daysBetween(from, to) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
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
