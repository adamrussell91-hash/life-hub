import { bandDomain } from './bloods-charts-layout.js';
import { trendChartSvg } from './bloods-charts.js';
import { groupBiochemistryMarkers } from './bloods-biochem-groups.js';

const SVG = 'http://www.w3.org/2000/svg';
export const INSTRUMENT_METER_WIDTH = 320;
export const INSTRUMENT_METER_HEIGHT = 24;
export const TUBE_WIDTH = 64;
export const TUBE_HEIGHT = 176;
export const PROTEIN_WIDTH = 640;
export const PROTEIN_HEIGHT = 64;

const PROTEIN_LABELS = {
  alpha_1_globulin: 'α1',
  alpha_2_globulin: 'α2',
  beta_1_globulin: 'β1',
  beta_2_globulin: 'β2',
  gamma_globulin: 'γ'
};

export function tubeLayout(marker, { height = 160, padding = 8 } = {}) {
  const values = (marker.series ?? [])
    .map(point => Number(point.value))
    .filter(Number.isFinite);
  const latest = Number(marker.latest?.value);
  const domain = bandDomain({
    values: [...values, latest].filter(Number.isFinite),
    refLow: marker.latest?.ref_low,
    refHigh: marker.latest?.ref_high
  });
  const inner = Math.max(0, height - padding * 2);
  const y = value => padding + (1 - domain.fraction(value)) * inner;
  const bandTop = y(domain.bandHigh ?? domain.max);
  const bandBottom = y(domain.bandLow ?? domain.min);
  const history = (marker.series ?? []).slice(0, -1)
    .filter(point => point.value != null && Number.isFinite(Number(point.value)))
    .map(point => ({ ...point, y: y(Number(point.value)) }));

  return {
    fillY: y(latest),
    bandY: Math.min(bandTop, bandBottom),
    bandHeight: Math.abs(bandBottom - bandTop),
    history
  };
}

export function proteinBandLayout(markers = []) {
  const numeric = markers
    .map(marker => ({ marker, value: Number(marker.latest?.value) }))
    .filter(item => item.marker.latest?.value != null && Number.isFinite(item.value) && item.value >= 0);
  const total = numeric.reduce((sum, item) => sum + item.value, 0);
  if (!(total > 0)) return [];

  return numeric.map(({ marker, value }) => ({
    key: marker.key,
    marker,
    value,
    fraction: value / total,
    shortLabel: PROTEIN_LABELS[marker.key] || marker.label
  }));
}

export function renderBiochemistryGroups(root, markers, options = {}) {
  const wrap = root.createElement('div');
  wrap.className = 'bloods-instrument-groups';
  let expanded = null;

  const collapseExpanded = () => {
    if (!expanded) return;
    expanded.control.setAttribute('aria-expanded', 'false');
    expanded.control.removeAttribute('aria-controls');
    expanded.slot.replaceChildren();
    expanded = null;
  };

  const bindTrend = (host, marker, slot) => {
    if (!(marker.series?.length > 1)) return;
    const control = root.createElement('button');
    control.type = 'button';
    control.className = 'btn btn--ghost bloods-instrument-marker';
    control.textContent = 'View trend';
    control.setAttribute('aria-label', `Show ${marker.label} trend`);
    control.setAttribute('aria-expanded', 'false');
    control.addEventListener('click', () => {
      if (expanded?.control === control) {
        collapseExpanded();
        return;
      }
      collapseExpanded();
      const trend = root.createElement('div');
      trend.className = 'bloods-instrument-trend';
      trend.id = `bloods-trend-${marker.key}`;
      const title = root.createElement('h5');
      title.className = 'metric-label';
      title.textContent = `${marker.label} trend`;
      const chart = trendChartSvg(root, marker, options);
      trend.append(title);
      if (chart) trend.append(chart);
      slot.replaceChildren(trend);
      control.setAttribute('aria-expanded', 'true');
      control.setAttribute('aria-controls', trend.id);
      expanded = { control, slot };
    });
    host.append(control);
  };

  for (const group of groupBiochemistryMarkers(markers)) {
    const section = root.createElement('section');
    section.className = 'bloods-instrument-group';
    section.dataset.instrumentGroup = group.id;

    const head = root.createElement('div');
    head.className = 'bloods-instrument-group__head';
    const title = root.createElement('h4');
    title.className = 'metric-label';
    title.textContent = group.title;
    const description = root.createElement('p');
    description.className = 'metric-caption';
    description.textContent = group.description;
    head.append(title, description);
    section.append(head);

    const slot = root.createElement('div');
    slot.className = 'bloods-instrument-trend-slot';

    if (group.instrument === 'tube') {
      section.append(renderTubeRack(root, group.markers, bindTrend, slot, options.onExplain));
    } else if (group.instrument === 'protein') {
      section.append(renderProteinProfile(root, group.markers, bindTrend, slot, options.onExplain));
    } else {
      section.append(renderMeterList(root, group.markers, bindTrend, slot, options.onExplain));
    }
    section.append(slot);
    wrap.append(section);
  }
  return wrap;
}

function renderMeterList(root, markers, bindTrend, slot, onExplain) {
  const list = root.createElement('div');
  list.className = 'bloods-instrument-meter-list';
  for (const marker of markers) {
    const row = instrumentShell(root, 'bloods-instrument-meter-row');
    row.id = `bloods-marker-${marker.key}`;
    row.dataset.bloodsMarker = marker.key;
    row.append(markerIdentity(root, marker, onExplain));
    row.append(meterSvg(root, marker));
    row.append(markerMeta(root, marker));
    bindTrend(row, marker, slot);
    list.append(row);
  }
  return list;
}

function renderTubeRack(root, markers, bindTrend, slot, onExplain) {
  const rack = root.createElement('div');
  rack.className = 'bloods-tube-rack';
  for (const marker of markers) {
    const unit = instrumentShell(root, 'bloods-tube-unit');
    unit.id = `bloods-marker-${marker.key}`;
    unit.dataset.bloodsMarker = marker.key;
    unit.append(markerIdentity(root, marker, onExplain), tubeSvg(root, marker), markerMeta(root, marker));
    bindTrend(unit, marker, slot);
    rack.append(unit);
  }
  return rack;
}

function renderProteinProfile(root, markers, bindTrend, slot, onExplain) {
  const profile = root.createElement('div');
  profile.className = 'bloods-protein-profile';
  const caeruloplasmin = markers.filter(marker => marker.key === 'caeruloplasmin');
  const bands = [
    {
      title: 'Globulin fractions',
      keys: new Set([
        'alpha_1_globulin',
        'alpha_2_globulin',
        'beta_1_globulin',
        'beta_2_globulin',
        'gamma_globulin'
      ])
    },
    {
      title: 'IgG subclasses',
      keys: new Set(['igg1', 'igg2', 'igg3', 'igg4'])
    }
  ];

  for (const band of bands) {
    const present = markers.filter(marker => band.keys.has(marker.key));
    if (!present.length) continue;
    const block = root.createElement('div');
    block.className = 'bloods-protein-block';
    const title = root.createElement('h5');
    title.className = 'metric-caption';
    title.textContent = band.title;
    block.append(title, proteinBand(root, present));
    const key = root.createElement('div');
    key.className = 'bloods-protein-key';
    for (const marker of present) {
      const item = instrumentShell(root, 'bloods-protein-key__item');
      item.id = `bloods-marker-${marker.key}`;
      item.dataset.bloodsMarker = marker.key;
      item.append(markerIdentity(root, marker, onExplain), markerMeta(root, marker));
      bindTrend(item, marker, slot);
      key.append(item);
    }
    block.append(key);
    profile.append(block);
  }

  if (caeruloplasmin.length) {
    profile.append(renderMeterList(root, caeruloplasmin, bindTrend, slot, onExplain));
  }
  const assigned = new Set([...bands.flatMap(band => [...band.keys]), 'caeruloplasmin']);
  const unassigned = markers.filter(marker => !assigned.has(marker.key));
  if (unassigned.length) profile.append(renderMeterList(root, unassigned, bindTrend, slot, onExplain));
  return profile;
}

function instrumentShell(root, className) {
  const node = root.createElement('div');
  node.className = className;
  return node;
}

function markerIdentity(root, marker, onExplain) {
  const identity = root.createElement('span');
  identity.className = 'bloods-instrument-identity';
  const nameRow = root.createElement('span');
  nameRow.className = 'bloods-instrument-name';
  const name = root.createElement('strong');
  name.textContent = marker.label;
  nameRow.append(name);
  if (onExplain) {
    const info = root.createElement('button');
    info.type = 'button';
    info.className = 'bloods-info';
    info.setAttribute('aria-label', `About ${marker.label}`);
    info.textContent = 'i';
    info.addEventListener('click', () => onExplain(marker));
    nameRow.append(info);
  }
  const value = root.createElement('span');
  value.textContent = formatValue(marker.latest?.value, marker.latest?.unit);
  identity.append(nameRow, value);
  return identity;
}

function markerMeta(root, marker) {
  const meta = root.createElement('span');
  meta.className = 'bloods-instrument-meta';
  const range = root.createElement('span');
  range.textContent = rangeLabel(marker.latest?.ref_low, marker.latest?.ref_high);
  const status = root.createElement('span');
  status.className = 'bloods-status';
  status.dataset.status = marker.statusTone || 'first';
  status.textContent = statusLabel(marker.latest?.status);
  meta.append(range, status);
  return meta;
}

function meterSvg(root, marker) {
  const svg = svgRoot(
    root,
    `${marker.label}: ${formatValue(marker.latest?.value, marker.latest?.unit)}, ${statusLabel(marker.latest?.status)}`,
    'bloods-instrument-meter',
    INSTRUMENT_METER_WIDTH,
    INSTRUMENT_METER_HEIGHT
  );
  const values = marker.series?.map(point => point.value) ?? [];
  const domain = bandDomain({
    values,
    refLow: marker.latest?.ref_low,
    refHigh: marker.latest?.ref_high
  });
  const x = value => 8 + domain.fraction(value) * (INSTRUMENT_METER_WIDTH - 16);
  const y = INSTRUMENT_METER_HEIGHT / 2;
  const track = svgEl(root, 'line', 'meter-track');
  setLine(track, 8, y, INSTRUMENT_METER_WIDTH - 8, y);
  const band = svgEl(root, 'line', 'meter-band');
  setLine(
    band,
    x(domain.bandLow ?? domain.min),
    y,
    x(domain.bandHigh ?? domain.max),
    y
  );
  svg.append(track, band);
  for (const point of (marker.series ?? []).slice(0, -1)) {
    if (point.value == null || !Number.isFinite(Number(point.value))) continue;
    const ghost = svgEl(root, 'circle', 'history-point');
    ghost.setAttribute('cx', String(x(point.value)));
    ghost.setAttribute('cy', String(y));
    ghost.setAttribute('r', '3');
    svg.append(ghost);
  }
  const latest = Number(marker.latest?.value);
  if (Number.isFinite(latest)) {
    const dot = svgEl(root, 'circle', 'latest-point');
    dot.dataset.status = marker.statusTone || 'first';
    dot.setAttribute('cx', String(x(latest)));
    dot.setAttribute('cy', String(y));
    dot.setAttribute('r', '5');
    svg.append(dot);
  }
  return svg;
}

function tubeSvg(root, marker) {
  const svg = svgRoot(
    root,
    `${marker.label}: ${formatValue(marker.latest?.value, marker.latest?.unit)}, ${statusLabel(marker.latest?.status)}`,
    'bloods-tube',
    TUBE_WIDTH,
    TUBE_HEIGHT
  );
  const plot = tubeLayout(marker, { height: TUBE_HEIGHT, padding: 8 });
  const shell = svgEl(root, 'rect', 'tube-shell');
  shell.setAttribute('x', '14');
  shell.setAttribute('y', '8');
  shell.setAttribute('width', '36');
  shell.setAttribute('height', String(TUBE_HEIGHT - 16));
  shell.setAttribute('rx', '18');
  const band = svgEl(root, 'rect', 'tube-band');
  band.setAttribute('x', '14');
  band.setAttribute('y', String(plot.bandY));
  band.setAttribute('width', '36');
  band.setAttribute('height', String(plot.bandHeight));
  const fill = svgEl(root, 'rect', 'tube-fill');
  fill.dataset.status = marker.statusTone || 'first';
  fill.setAttribute('x', '16');
  fill.setAttribute('y', String(plot.fillY));
  fill.setAttribute('width', '32');
  fill.setAttribute('height', String(Math.max(0, TUBE_HEIGHT - 8 - plot.fillY)));
  fill.setAttribute('rx', '16');
  svg.append(shell, band, fill);
  for (const point of plot.history) {
    const tick = svgEl(root, 'line', 'history-point');
    setLine(tick, 18, point.y, 46, point.y);
    svg.append(tick);
  }
  return svg;
}

function proteinBand(root, markers) {
  const svg = svgRoot(
    root,
    markers.map(marker => `${marker.label} ${formatValue(marker.latest?.value, marker.latest?.unit)}`).join(', '),
    'bloods-protein-band',
    PROTEIN_WIDTH,
    PROTEIN_HEIGHT
  );
  let x = 0;
  for (const segment of proteinBandLayout(markers)) {
    const width = segment.fraction * PROTEIN_WIDTH;
    const rect = svgEl(root, 'rect', 'protein-segment');
    rect.dataset.status = segment.marker.statusTone || 'first';
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', '4');
    rect.setAttribute('width', String(width));
    rect.setAttribute('height', String(PROTEIN_HEIGHT - 8));
    rect.setAttribute('rx', '4');
    svg.append(rect);
    if (width >= 34) {
      const text = root.createElementNS(SVG, 'text');
      text.setAttribute('x', String(x + width / 2));
      text.setAttribute('y', String(PROTEIN_HEIGHT / 2 + 4));
      text.setAttribute('text-anchor', 'middle');
      text.textContent = segment.shortLabel;
      svg.append(text);
    }
    x += width;
  }
  return svg;
}

function svgRoot(root, label, className, width, height) {
  const svg = root.createElementNS(SVG, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  return svg;
}

function svgEl(root, tag, role) {
  const node = root.createElementNS(SVG, tag);
  node.setAttribute('data-role', role);
  return node;
}

function setLine(node, x1, y1, x2, y2) {
  node.setAttribute('x1', String(x1));
  node.setAttribute('y1', String(y1));
  node.setAttribute('x2', String(x2));
  node.setAttribute('y2', String(y2));
}

function formatValue(value, unit) {
  const n = Number(value);
  if (value == null || !Number.isFinite(n)) return '—';
  const text = Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
  return unit ? `${text} ${unit}` : text;
}

function rangeLabel(low, high) {
  const lo = low != null && Number.isFinite(Number(low)) ? Number(low) : null;
  const hi = high != null && Number.isFinite(Number(high)) ? Number(high) : null;
  if (lo != null && hi != null) return `Band ${lo}–${hi}`;
  if (hi != null) return `In range <${hi}`;
  if (lo != null) return `In range >${lo}`;
  return 'Reference unavailable';
}

function statusLabel(status) {
  return status === 'Normal' ? 'In range' : status || 'First reading';
}
