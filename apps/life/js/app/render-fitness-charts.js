import { applyRingTarget } from './chart-kit/apply-ring.js';
import { buildAreaLine } from './chart-kit/area-line.js';
import { buildColumns } from './chart-kit/columns.js';
import { buildDistributionPie } from './chart-kit/pie.js';
import { formatDisplayDate } from '../core/time.js';

const setText = (root, selector, value) => {
  const element = root.querySelector(selector);
  if (element) element.textContent = String(value);
};

function setHidden(element, hidden) {
  if (!element) return;
  if (hidden) element.setAttribute('hidden', '');
  else element.removeAttribute('hidden');
}

function formatKg(kg) {
  if (kg == null || !Number.isFinite(kg) || kg <= 0) return '—';
  const text = Number.isInteger(kg) ? kg.toLocaleString('en-AU') : kg.toFixed(1);
  return `${text} kg`;
}

function createSvg(root, name) {
  if (typeof root.createElementNS === 'function') {
    return root.createElementNS('http://www.w3.org/2000/svg', name);
  }
  return null;
}

function renderRing(root, key, { value, target }, label) {
  const svg = root.querySelector(`[data-fitness-ring="${key}"]`);
  applyRingTarget(svg, { value, target }, { size: 56, strokeWidth: 6 });
  setText(root, `[data-fitness="${key}-ring-value"]`, String(value));
  setText(root, `[data-fitness="${key}-ring-target"]`, label);
}

function renderPie(root, { card, svg, legend, empty, items, unit }) {
  const host = root.querySelector(svg);
  const sliceGroup = host?.querySelector?.('[data-role="slices"]');
  const legendEl = root.querySelector(legend);
  const emptyEl = root.querySelector(empty);
  const cardEl = root.querySelector(card);
  const pie = buildDistributionPie(items, { size: 72 });
  sliceGroup?.replaceChildren?.();
  legendEl?.replaceChildren?.();
  if (pie.empty) {
    setHidden(cardEl, true);
    return;
  }
  setHidden(cardEl, false);
  setHidden(host, false);
  setHidden(emptyEl, true);
  if (sliceGroup && typeof root.createElementNS === 'function') {
    for (const slice of pie.slices) {
      const path = createSvg(root, 'path');
      if (!path) break;
      path.setAttribute('d', slice.path);
      path.setAttribute('fill', slice.colour);
      sliceGroup.append(path);
    }
  }
  if (!legendEl || typeof root.createElement !== 'function') return;
  for (const slice of pie.slices) {
    const item = root.createElement('li');
    const swatch = root.createElement('span');
    swatch.className = 'meal-protein-legend__swatch';
    swatch.style = swatch.style ?? {};
    if (typeof swatch.style.setProperty === 'function') swatch.style.setProperty('background', slice.colour);
    else swatch.style.background = slice.colour;
    const label = root.createElement('span');
    const amount = unit === 'days'
      ? `${slice.value} day${slice.value === 1 ? '' : 's'}`
      : unit === 'sets'
        ? `${slice.value} set${slice.value === 1 ? '' : 's'}`
        : formatKg(slice.value);
    label.textContent = `${slice.label} · ${amount}`;
    item.append(swatch, label);
    legendEl.append(item);
  }
}

function renderAreaCard(root, cardSelector, svgSelector, series, { ariaLabel } = {}) {
  const card = root.querySelector(cardSelector);
  const svg = root.querySelector(svgSelector);
  if (!card || !svg) return;
  if (!series?.length) {
    setHidden(card, true);
    return;
  }
  setHidden(card, false);
  const chart = buildAreaLine(series, { width: 320, height: 72, padding: 10, paddingBottom: 16 });
  svg.setAttribute?.('viewBox', `0 0 ${chart.width} ${chart.height}`);
  svg.setAttribute?.('preserveAspectRatio', 'xMidYMid meet');
  if (ariaLabel) svg.setAttribute?.('aria-label', ariaLabel);
  const line = svg.querySelector?.('[data-role="line"]');
  const area = svg.querySelector?.('[data-role="area"]');
  if (line) {
    if (line.tagName?.toLowerCase?.() === 'path' || line.setAttribute) line.setAttribute('d', chart.linePath);
  }
  if (area) area.setAttribute?.('d', chart.areaPath);
  const labels = svg.querySelector?.('[data-role="day-labels"]');
  labels?.replaceChildren?.();
  if (labels && typeof root.createElementNS === 'function') {
    for (const point of chart.points) {
      const text = createSvg(root, 'text');
      if (!text) break;
      text.setAttribute('x', String(point.x));
      text.setAttribute('y', String(chart.height - 2));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('class', 'chart-day-label');
      text.textContent = formatDisplayDate(point.date).slice(0, 5);
      labels.append(text);
    }
  }
  const values = svg.querySelector?.('[data-role="value-labels"]');
  values?.replaceChildren?.();
  if (values && typeof root.createElementNS === 'function') {
    for (const point of chart.points) {
      const text = createSvg(root, 'text');
      if (!text) break;
      text.setAttribute('x', String(point.x));
      text.setAttribute('y', String(Math.max(9, point.y - 5)));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('class', 'chart-value-label');
      text.textContent = Number.isInteger(point.value) ? String(point.value) : point.value.toFixed(1);
      values.append(text);
    }
  }
}

function fillAreaSvg(root, svg, series) {
  const chart = buildAreaLine(series, { width: 320, height: 72, padding: 10, paddingBottom: 16 });
  svg.setAttribute('viewBox', `0 0 ${chart.width} ${chart.height}`);
  const line = svg.querySelector('[data-role="line"]');
  const area = svg.querySelector('[data-role="area"]');
  line?.setAttribute('d', chart.linePath);
  area?.setAttribute('d', chart.areaPath);
  const labels = svg.querySelector('[data-role="day-labels"]');
  labels?.replaceChildren?.();
  const values = svg.querySelector('[data-role="value-labels"]');
  values?.replaceChildren?.();
  if (typeof root.createElementNS !== 'function') return;
  for (const point of chart.points) {
    const day = createSvg(root, 'text');
    day.setAttribute('x', String(point.x));
    day.setAttribute('y', String(chart.height - 2));
    day.setAttribute('text-anchor', 'middle');
    day.setAttribute('class', 'chart-day-label');
    day.textContent = formatDisplayDate(point.date).slice(0, 5);
    labels?.append(day);
    const value = createSvg(root, 'text');
    value.setAttribute('x', String(point.x));
    value.setAttribute('y', String(Math.max(9, point.y - 5)));
    value.setAttribute('text-anchor', 'middle');
    value.setAttribute('class', 'chart-value-label');
    value.textContent = Number.isInteger(point.value) ? String(point.value) : point.value.toFixed(1);
    values?.append(value);
  }
}

function renderE1rm(root, trends) {
  const card = root.querySelector('#fitness-e1rm-card');
  const host = root.querySelector('#fitness-e1rm-list');
  if (!host) return;
  host.replaceChildren();
  if (!trends?.length) {
    setHidden(card, true);
    return;
  }
  setHidden(card, false);
  for (const lift of trends) {
    const block = root.createElement('div');
    block.className = 'fitness-e1rm';
    const title = root.createElement('p');
    title.className = 'metric-label';
    const last = lift.series.at(-1);
    title.textContent = `${lift.name} · ${last.value.toFixed(1)} kg e1RM`;
    block.append(title);
    if (typeof root.createElementNS === 'function') {
      const svg = createSvg(root, 'svg');
      svg.setAttribute('class', 'line-chart line-chart--dense');
      svg.setAttribute('viewBox', '0 0 320 72');
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', `${lift.name} estimated 1RM`);
      for (const role of ['area', 'line']) {
        const path = createSvg(root, 'path');
        path.setAttribute('data-role', role);
        svg.append(path);
      }
      const valueGroup = createSvg(root, 'g');
      valueGroup.setAttribute('data-role', 'value-labels');
      const dayGroup = createSvg(root, 'g');
      dayGroup.setAttribute('data-role', 'day-labels');
      svg.append(valueGroup, dayGroup);
      block.append(svg);
      fillAreaSvg(root, svg, lift.series);
    }
    host.append(block);
  }
}

function renderEfficiency(root, weeks) {
  const card = root.querySelector('#fitness-efficiency-card');
  const host = root.querySelector('#fitness-efficiency-bars');
  if (!host) return;
  host.replaceChildren();
  if (!weeks?.length) {
    setHidden(card, true);
    return;
  }
  setHidden(card, false);
  const chart = buildColumns(
    weeks.map(week => ({
      key: week.weekStart,
      label: `w/c ${formatDisplayDate(week.weekStart)}`,
      value: week.value
    }))
  );
  for (const bar of chart.bars) {
    const row = root.createElement('div');
    row.className = 'fitness-col-row';
    const label = root.createElement('strong');
    label.textContent = bar.label;
    const track = root.createElement('span');
    track.className = 'fitness-col-row__track';
    const fill = root.createElement('i');
    fill.style = fill.style ?? {};
    if (typeof fill.style.setProperty === 'function') fill.style.setProperty('--bar', `${Math.max(8, bar.heightPct)}%`);
    else fill.style['--bar'] = `${Math.max(8, bar.heightPct)}%`;
    track.append(fill);
    const value = root.createElement('span');
    value.textContent = `${bar.value.toFixed(1)} kg/set`;
    row.append(label, track, value);
    host.append(row);
  }
}

function renderPain(root, rows) {
  const card = root.querySelector('#fitness-pain-card');
  const host = root.querySelector('#fitness-pain-list');
  if (!host) return;
  host.replaceChildren();
  if (!rows?.length) {
    setHidden(card, true);
    return;
  }
  setHidden(card, false);
  for (const row of rows) {
    const item = root.createElement('div');
    item.className = 'fitness-kv-row';
    const name = root.createElement('strong');
    name.textContent = row.site;
    const count = root.createElement('span');
    count.textContent = `${row.count} session${row.count === 1 ? '' : 's'}`;
    item.append(name, count);
    host.append(item);
  }
}

export function renderFitnessCharts(root, charts = {}) {
  setText(root, '[data-fitness="longest-streak"]', String(charts.longestStreak ?? 0));

  renderRing(root, 'week', charts.weekRing ?? { value: 0, target: 4 }, `/ ${charts.weekRing?.target ?? 4}`);
  const skips = charts.skipRing ?? { value: 0, target: 1, missed: 0, scheduled: 0 };
  renderRing(root, 'skip', skips, `missed / ${skips.scheduled} scheduled`);
  const recovery = charts.recoveryRing ?? { value: 0, target: 1, flagged: 0, completed: 0 };
  renderRing(root, 'recovery', recovery, `flagged / ${recovery.completed}`);

  renderPie(root, {
    card: '#fitness-rep-card',
    svg: '#fitness-rep-pie',
    legend: '#fitness-rep-legend',
    empty: '[data-fitness-empty="reps"]',
    items: charts.repRanges ?? [],
    unit: 'sets'
  });
  renderPie(root, {
    card: '#fitness-region-vol-card',
    svg: '#fitness-region-vol-pie',
    legend: '#fitness-region-vol-legend',
    empty: '[data-fitness-empty="region-vol"]',
    items: charts.regionVolume ?? [],
    unit: 'kg'
  });
  renderPie(root, {
    card: '#fitness-push-pull-card',
    svg: '#fitness-push-pull-pie',
    legend: '#fitness-push-pull-legend',
    empty: '[data-fitness-empty="push-pull"]',
    items: charts.pushPull ?? [],
    unit: 'kg'
  });
  renderPie(root, {
    card: '#fitness-rest-card',
    svg: '#fitness-rest-pie',
    legend: '#fitness-rest-legend',
    empty: '[data-fitness-empty="rest"]',
    items: charts.restRatio ?? [],
    unit: 'days'
  });

  renderE1rm(root, charts.e1rmTrends);
  renderEfficiency(root, charts.volumePerSetWeeks);
  renderAreaCard(root, '#fitness-duration-card', '#fitness-duration-chart', charts.durationSeries, {
    ariaLabel: 'Session duration'
  });
  renderAreaCard(root, '#fitness-distance-card', '#fitness-distance-chart', charts.distanceSeries, {
    ariaLabel: 'Distance'
  });
  renderAreaCard(root, '#fitness-pace-card', '#fitness-pace-chart', charts.paceSeries, {
    ariaLabel: 'Pace minutes per kilometre'
  });
  renderAreaCard(root, '#fitness-hr-card', '#fitness-hr-chart', charts.hrSeries, {
    ariaLabel: 'Average heart rate'
  });
  renderPain(root, charts.painBySite);
}
