import { animateAreaReveal } from './chart-kit/animate.js';
import { buildAreaLine } from './chart-kit/area-line.js';

export function renderBloods(root, model, { onRangeChange } = {}) {
  const dashboard = root.querySelector('#body-bloods-dashboard');
  if (!dashboard || !model) return;

  const ranges = root.querySelector('#bloods-range-control');
  if (ranges && !ranges.dataset.bound) {
    ranges.dataset.bound = '1';
    ranges.addEventListener('click', event => {
      const button = event.target.closest?.('[data-bloods-range]');
      if (!button) return;
      onRangeChange?.(button.dataset.bloodsRange);
    });
  }
  if (ranges) {
    for (const button of ranges.querySelectorAll?.('[data-bloods-range]') ?? []) {
      const active = button.dataset.bloodsRange === model.range;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-pressed', 'true');
      else button.setAttribute('aria-pressed', 'false');
    }
  }

  const flags = root.querySelector('#bloods-flags');
  if (flags) {
    flags.replaceChildren();
    if (!model.categories.length) {
      const empty = root.createElement('p');
      empty.className = 'metric-caption';
      empty.textContent = 'No blood results in your synced history yet.';
      flags.append(empty);
    } else if (!model.flagged.length) {
      const empty = root.createElement('p');
      empty.className = 'metric-caption';
      empty.textContent = 'Everything in range.';
      flags.append(empty);
    } else {
      for (const flag of model.flagged) {
        flags.append(flagChip(root, flag));
      }
    }
  }

  const host = root.querySelector('#bloods-sections');
  if (host) {
    host.replaceChildren();
    for (const category of model.categories) {
      host.append(categoryCard(root, category));
    }
  }

  dashboard.removeAttribute('hidden');
}

function flagChip(root, flag) {
  const chip = root.createElement('span');
  chip.className = 'body-tape-chip bloods-flag';
  chip.dataset.colour = flag.status === 'Low' ? 'low' : flag.status === 'High' ? 'red' : 'neutral';
  const label = root.createElement('span');
  label.className = 'body-tape-chip__label';
  label.textContent = flag.label;
  const value = root.createElement('span');
  value.className = 'body-tape-chip__delta';
  value.textContent = [formatLatestValue(flag.value, flag.unit), flag.status].filter(Boolean).join(' ');
  chip.append(label, value);
  return chip;
}

function categoryCard(root, category) {
  const article = root.createElement('article');
  article.className = 'metric-card body-section bloods-category';
  article.dataset.bodySection = category.id;

  const heading = root.createElement('div');
  heading.className = 'body-section__head';
  const toggle = root.createElement('button');
  toggle.type = 'button';
  toggle.className = 'bloods-category__toggle';
  toggle.setAttribute('aria-expanded', 'true');
  const title = root.createElement('h3');
  title.className = 'metric-label';
  title.textContent = category.title;
  toggle.append(title);
  toggle.addEventListener('click', () => {
    const collapsed = article.classList.toggle('is-collapsed');
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  });
  heading.append(toggle);
  article.append(heading);

  const body = root.createElement('div');
  body.className = 'bloods-category__body';
  if (!category.markers.length) {
    const empty = root.createElement('p');
    empty.className = 'metric-caption';
    empty.textContent = 'No markers in this category.';
    body.append(empty);
  } else {
    const blocks = category.markers.map(marker => markerBlock(root, marker));
    if (blocks.length > 1) {
      const row = root.createElement('div');
      row.className = 'body-metrics body-metrics--pair';
      row.append(...blocks);
      body.append(row);
    } else {
      body.append(blocks[0]);
    }
  }
  article.append(body);
  return article;
}

function markerBlock(root, marker) {
  const wrap = root.createElement('div');
  wrap.className = 'body-metric';

  const head = root.createElement('div');
  head.className = 'body-metric__head';
  const name = root.createElement('strong');
  name.textContent = marker.label;
  head.append(name);

  const trends = root.createElement('div');
  trends.className = 'body-metric__growth';
  trends.append(
    trendChip(root, marker.lastDelta, marker.lastColour, 'Last'),
    trendChip(root, marker.overallDelta, marker.overallColour, 'Overall')
  );
  head.append(trends);
  wrap.append(head);

  const value = root.createElement('p');
  value.className = 'body-metric__value';
  if (marker.qualitative) {
    value.textContent = marker.latest?.status || marker.latest?.unit || 'Qualitative';
    wrap.append(value);
    return wrap;
  }
  value.textContent = formatLatestValue(marker.latest?.value, marker.latest?.unit);
  wrap.append(value);

  if (marker.series?.length) {
    wrap.append(markerChart(root, marker));
  } else if (marker.latest) {
    const caption = root.createElement('p');
    caption.className = 'metric-caption';
    caption.textContent = 'No readings in this range.';
    wrap.append(caption);
  }
  return wrap;
}

function markerChart(root, marker) {
  const chart = root.createElementNS('http://www.w3.org/2000/svg', 'svg');
  chart.setAttribute('class', 'line-chart body-chart');
  chart.setAttribute('viewBox', '0 0 320 168');
  chart.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  chart.setAttribute('role', 'img');
  chart.setAttribute('aria-label', `${marker.label} trend`);

  const band = root.createElementNS('http://www.w3.org/2000/svg', 'rect');
  band.setAttribute('data-role', 'ref-band');
  const area = root.createElementNS('http://www.w3.org/2000/svg', 'path');
  area.setAttribute('data-role', 'area');
  const line = root.createElementNS('http://www.w3.org/2000/svg', 'path');
  line.setAttribute('data-role', 'line');
  const points = root.createElementNS('http://www.w3.org/2000/svg', 'g');
  points.setAttribute('data-role', 'points');
  chart.append(band, area, line, points);

  const refLow = marker.latest?.ref_low;
  const refHigh = marker.latest?.ref_high;
  const includeValues = [refLow, refHigh].filter(value => value != null && Number.isFinite(Number(value)));
  const built = buildAreaLine(marker.series.map(point => ({
    date: point.date,
    value: point.value
  })), { height: 168, yDomain: 'padded', includeValues });

  if (Number.isFinite(Number(refLow)) && Number.isFinite(Number(refHigh))) {
    const yHigh = built.scaleY(Number(refHigh));
    const yLow = built.scaleY(Number(refLow));
    const y = Math.min(yHigh, yLow);
    const height = Math.abs(yLow - yHigh);
    band.setAttribute('x', String(built.points[0]?.x ?? 12));
    band.setAttribute('width', String(Math.max(0, 320 - 24)));
    band.setAttribute('y', String(y));
    band.setAttribute('height', String(height));
  } else {
    band.setAttribute('height', '0');
  }

  area.setAttribute('d', built.areaPath || built.areaPoints || '');
  line.setAttribute('d', built.linePath || '');
  for (const point of built.points) {
    const circle = root.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(point.x));
    circle.setAttribute('cy', String(point.y));
    circle.setAttribute('r', '2.5');
    points.append(circle);
  }
  queueMicrotask(() => animateAreaReveal(chart));
  return chart;
}

function trendChip(root, delta, colour, label) {
  const chip = root.createElement('span');
  chip.className = 'body-tape-chip';
  chip.dataset.colour = colour || 'neutral';
  const kind = root.createElement('span');
  kind.className = 'body-tape-chip__label';
  kind.textContent = label;
  const deltaEl = root.createElement('span');
  deltaEl.className = 'body-tape-chip__delta';
  deltaEl.textContent = formatDeltaChip(delta);
  chip.append(kind, deltaEl);
  return chip;
}

function formatLatestValue(value, unit) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const n = Number(value);
  const text = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return unit ? `${text} ${unit}` : text;
}

function formatDeltaChip(delta) {
  if (delta == null || !Number.isFinite(delta)) return '→ —';
  if (delta === 0) return '→ 0';
  const arrow = delta > 0 ? '↑' : '↓';
  const mag = Math.abs(delta);
  const text = Number.isInteger(mag) ? String(mag) : mag.toFixed(1);
  return `${arrow} ${text}`;
}
