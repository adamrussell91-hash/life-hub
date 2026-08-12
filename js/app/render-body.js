import { animateAreaReveal } from './chart-kit/animate.js';
import { buildAreaLine } from './chart-kit/area-line.js';
import { BODY_RANGES } from './body-model.js';

const RANGE_LABELS = {
  monthly: 'Month',
  six_month: '6M',
  year: 'Year',
  five_year: '5Y'
};

const LABEL_ANCHORS = {
  neck: { top: '8%', side: 'left' },
  shoulders: { top: '14%', side: 'right' },
  chest: { top: '22%', side: 'left' },
  right_arm_flexed: { top: '26%', side: 'right' },
  left_arm_flexed: { top: '32%', side: 'left' },
  right_arm_relaxed: { top: '38%', side: 'right' },
  left_arm_relaxed: { top: '44%', side: 'left' },
  waist: { top: '48%', side: 'left' },
  hips: { top: '54%', side: 'right' },
  right_thigh: { top: '68%', side: 'right' },
  left_thigh: { top: '68%', side: 'left' },
  calves: { top: '84%', side: 'right' }
};

export function renderBody(root, model, {
  onRangeChange,
  onLogWeight,
  onLogComposition
} = {}) {
  const dashboard = root.querySelector('#body-dashboard');
  if (!dashboard || !model) return;

  const ranges = root.querySelector('#body-range-control');
  if (ranges && !ranges.dataset.bound) {
    ranges.dataset.bound = '1';
    ranges.addEventListener('click', event => {
      const button = event.target.closest?.('[data-body-range]');
      if (!button) return;
      onRangeChange?.(button.dataset.bodyRange);
    });
  }
  if (ranges) {
    for (const button of ranges.querySelectorAll?.('[data-body-range]') ?? []) {
      const active = button.dataset.bodyRange === model.range;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-pressed', 'true');
      else button.setAttribute('aria-pressed', 'false');
    }
  }

  const host = root.querySelector('#body-sections');
  if (host) {
    host.replaceChildren();
    host.dataset.motion = 'in';
    void host.offsetWidth;
    host.dataset.motion = 'in';
    host.append(sectionCard(root, model.scale, {
      onLogWeight,
      kind: 'scale'
    }));
    host.append(sectionCard(root, model.composition, {
      onLogComposition,
      kind: 'composition'
    }));
    host.append(sectionCard(root, model.tape, {
      kind: 'tape'
    }));
  }

  dashboard.removeAttribute('hidden');
}

function sectionCard(root, section, hooks) {
  const article = root.createElement('article');
  article.className = 'metric-card body-section';
  article.dataset.bodySection = section.id;

  const heading = root.createElement('div');
  heading.className = 'body-section__head';
  const title = root.createElement('h3');
  title.className = 'metric-label';
  title.textContent = section.title;
  heading.append(title);
  article.append(heading);

  if (!section.metrics.length || section.metrics.every(metric => metric.empty)) {
    const empty = root.createElement('p');
    empty.className = 'metric-caption';
    empty.textContent = emptyCopy(section.id);
    article.append(empty);
  } else if (section.id === 'tape') {
    article.append(tapeFigure(root, section.metrics));
  } else {
    for (const metric of section.metrics) {
      if (metric.empty) continue;
      article.append(metricBlock(root, metric));
    }
  }

  if (section.id === 'scale' || section.id === 'composition') {
    article.append(quickLog(root, section.id, hooks));
  }
  return article;
}

function emptyCopy(id) {
  if (id === 'scale') return 'No weight readings in this range yet.';
  if (id === 'composition') return 'No composition readings yet.';
  return 'No tape measurements yet.';
}

function tapeFigure(root, metrics) {
  const wrap = root.createElement('div');
  wrap.className = 'body-tape';
  wrap.dataset.bodySection = 'tape';

  const figure = root.createElement('div');
  figure.className = 'body-figure';
  figure.id = 'body-tape-figure';

  const img = root.createElement('img');
  img.src = 'assets/body/full-body-diagram.png';
  img.alt = 'Full body anatomy diagram';
  img.className = 'body-figure__img';

  const labels = root.createElement('div');
  labels.className = 'body-figure__labels';
  labels.id = 'body-tape-labels';

  for (const metric of metrics) {
    if (metric.empty || metric.current == null) continue;
    const anchor = LABEL_ANCHORS[metric.site ?? metric.key];
    if (!anchor) continue;
    labels.append(tapeLabel(root, metric, anchor, labels));
  }

  figure.append(img, labels);
  wrap.append(figure);
  return wrap;
}

function tapeLabel(root, metric, anchor, labelsHost) {
  const site = metric.site ?? metric.key;
  const el = root.createElement('div');
  el.className = 'body-tape-label';
  el.dataset.site = site;
  el.dataset.side = anchor.side;
  el.style.top = anchor.top;

  const toggle = root.createElement('button');
  toggle.type = 'button';
  toggle.className = 'body-tape-label__toggle';
  toggle.setAttribute('aria-expanded', 'false');

  const name = root.createElement('span');
  name.className = 'body-tape-label__name';
  name.textContent = metric.label;

  const value = root.createElement('span');
  value.className = 'body-tape-label__value';
  value.textContent = formatCm(metric.current);

  const trends = root.createElement('span');
  trends.className = 'body-tape-label__trends';
  trends.append(
    trendChip(root, metric.lastDelta, metric.lastColour, 'Last'),
    trendChip(root, metric.overallDelta, metric.overallColour, 'Overall')
  );

  toggle.append(name, value, trends);

  const history = root.createElement('div');
  history.className = 'body-tape-label__history';
  history.setAttribute('aria-hidden', 'true');
  history.append(historyList(root, metric.history ?? []));

  toggle.addEventListener('click', () => {
    const opening = !el.classList.contains('is-open');
    for (const other of labelsHost.querySelectorAll('.body-tape-label.is-open')) {
      if (other === el) continue;
      collapseLabel(other);
    }
    if (opening) expandLabel(el);
    else collapseLabel(el);
  });

  el.append(toggle, history);
  return el;
}

function expandLabel(el) {
  el.classList.add('is-open');
  const toggle = el.querySelector('.body-tape-label__toggle');
  const history = el.querySelector('.body-tape-label__history');
  toggle?.setAttribute('aria-expanded', 'true');
  history?.setAttribute('aria-hidden', 'false');
}

function collapseLabel(el) {
  el.classList.remove('is-open');
  const toggle = el.querySelector('.body-tape-label__toggle');
  const history = el.querySelector('.body-tape-label__history');
  toggle?.setAttribute('aria-expanded', 'false');
  history?.setAttribute('aria-hidden', 'true');
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

function historyList(root, history) {
  const list = root.createElement('ul');
  list.className = 'body-tape-history';
  for (const row of history) {
    const item = root.createElement('li');
    item.className = 'body-tape-history__row';

    const date = root.createElement('span');
    date.className = 'body-tape-history__date';
    date.textContent = String(row.date ?? '');

    const value = root.createElement('span');
    value.className = 'body-tape-history__value';
    value.textContent = formatCm(row.value);

    const pct = root.createElement('span');
    pct.className = 'body-tape-history__pct';
    pct.textContent = formatPct(row.pct);

    item.append(date, value, pct);
    list.append(item);
  }
  if (!history.length) {
    const empty = root.createElement('li');
    empty.className = 'body-tape-history__row body-tape-history__row--empty';
    empty.textContent = 'No history yet.';
    list.append(empty);
  }
  return list;
}

function formatCm(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const n = Number(value);
  const text = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return `${text} cm`;
}

function formatDeltaChip(delta) {
  if (delta == null || !Number.isFinite(delta)) return '→ —';
  if (delta === 0) return '→ 0';
  const arrow = delta > 0 ? '↑' : '↓';
  const mag = Math.abs(delta);
  const text = Number.isInteger(mag) ? String(mag) : mag.toFixed(1);
  return `${arrow} ${text}`;
}

function formatPct(pct) {
  if (pct == null || !Number.isFinite(pct)) return '—';
  if (pct === 0) return '0%';
  const sign = pct > 0 ? '+' : '−';
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

function metricBlock(root, metric) {
  const wrap = root.createElement('div');
  wrap.className = 'body-metric';

  const head = root.createElement('div');
  head.className = 'body-metric__head';
  const name = root.createElement('strong');
  name.textContent = metric.label;
  head.append(name);

  const growth = root.createElement('div');
  growth.className = 'body-metric__growth';
  const primary = root.createElement('span');
  primary.className = 'body-growth';
  primary.dataset.colour = metric.primaryGrowth.colour;
  primary.textContent = metric.primaryGrowth.label;
  const secondary = root.createElement('span');
  secondary.className = 'body-trend';
  secondary.dataset.colour = metric.secondaryTrend.colour;
  secondary.textContent = trendArrow(metric.secondaryTrend) + ' ' + metric.secondaryTrend.label;
  growth.append(primary, secondary);
  head.append(growth);
  wrap.append(head);

  if (metric.latest) {
    const value = root.createElement('p');
    value.className = 'body-metric__value';
    value.textContent = formatLatest(metric);
    wrap.append(value);
  }

  if (metric.series.length) {
    const chart = root.createElementNS('http://www.w3.org/2000/svg', 'svg');
    chart.setAttribute('class', 'line-chart body-chart');
    chart.setAttribute('viewBox', '0 0 320 168');
    chart.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    chart.setAttribute('role', 'img');
    chart.setAttribute('aria-label', `${metric.label} trend`);
    const area = root.createElementNS('http://www.w3.org/2000/svg', 'path');
    area.setAttribute('data-role', 'area');
    const line = root.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.setAttribute('data-role', 'line');
    const points = root.createElementNS('http://www.w3.org/2000/svg', 'g');
    points.setAttribute('data-role', 'points');
    const valueLabels = root.createElementNS('http://www.w3.org/2000/svg', 'g');
    valueLabels.setAttribute('data-role', 'value-labels');
    chart.append(area, line, points, valueLabels);
    const built = buildAreaLine(metric.series.map(point => ({
      date: point.date,
      value: point.value
    })), { height: 168, yDomain: 'padded' });
    area.setAttribute('d', built.areaPath || built.areaPoints || '');
    line.setAttribute('d', built.linePath || '');
    for (const point of built.points) {
      const circle = root.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', String(point.x));
      circle.setAttribute('cy', String(point.y));
      circle.setAttribute('r', '2.5');
      points.append(circle);

      const label = root.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', String(point.x));
      label.setAttribute('y', String(Math.max(9, point.y - 5)));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('class', 'chart-value-label');
      label.textContent = formatPointLabel(metric, point.value);
      valueLabels.append(label);
    }
    wrap.append(chart);
    queueMicrotask(() => animateAreaReveal(chart));
  } else if (metric.latest) {
    const caption = root.createElement('p');
    caption.className = 'metric-caption';
    caption.textContent = 'No readings in this range.';
    wrap.append(caption);
  }

  return wrap;
}

function formatLatest(metric) {
  const unit = metric.key === 'body_fat_pct' ? '%' : metric.key.includes('kg') || metric.key === 'weight_kg'
    ? ' kg'
    : ' cm';
  const n = metric.latest.value;
  const text = metric.key === 'body_fat_pct' ? n.toFixed(1) : Number.isInteger(n) ? String(n) : n.toFixed(1);
  return `${text}${unit}`;
}

function formatPointLabel(metric, value) {
  return metric.key === 'body_fat_pct'
    ? Number(value).toFixed(1)
    : Number.isInteger(value)
      ? String(value)
      : Number(value).toFixed(1);
}

function trendArrow(trend) {
  if (trend.direction === 'up') return '↑';
  if (trend.direction === 'down') return '↓';
  return '→';
}

function quickLog(root, sectionId, hooks) {
  const form = root.createElement('div');
  form.className = 'body-quick-log';

  if (sectionId === 'scale') {
    const input = numberInput(root, 'Weight (kg)', 'weight_kg');
    const button = logButton(root, 'Log weight');
    button.addEventListener('click', () => {
      const value = Number(input.value);
      if (!Number.isFinite(value) || value <= 0) return;
      hooks.onLogWeight?.(value);
      input.value = '';
    });
    form.append(input, button);
    return form;
  }

  const fat = numberInput(root, 'Body fat %', 'body_fat_pct');
  const muscle = numberInput(root, 'Muscle kg', 'skeletal_muscle_kg');
  const button = logButton(root, 'Log composition');
  button.addEventListener('click', () => {
    const fields = {};
    const fatValue = Number(fat.value);
    const muscleValue = Number(muscle.value);
    if (Number.isFinite(fatValue) && fatValue > 0) fields.body_fat_pct = fatValue;
    if (Number.isFinite(muscleValue) && muscleValue > 0) fields.skeletal_muscle_kg = muscleValue;
    if (!Object.keys(fields).length) return;
    hooks.onLogComposition?.(fields);
    fat.value = '';
    muscle.value = '';
  });
  form.append(fat, muscle, button);
  return form;
}

function numberInput(root, placeholder, name) {
  const input = root.createElement('input');
  input.type = 'number';
  input.inputMode = 'decimal';
  input.step = '0.1';
  input.min = '0';
  input.placeholder = placeholder;
  input.name = name;
  input.className = 'body-quick-log__input';
  input.setAttribute('aria-label', placeholder);
  return input;
}

function logButton(root, label) {
  const button = root.createElement('button');
  button.type = 'button';
  button.className = 'body-quick-log__button';
  button.textContent = label;
  return button;
}

export { BODY_RANGES, RANGE_LABELS };
