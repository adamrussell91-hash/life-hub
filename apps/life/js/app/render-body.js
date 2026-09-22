import { createMorphingValuesPopover } from '../../../../packages/design-kit/js/morphing-popover.js';
import { applyHubPillsThumb } from '../../../../packages/design-kit/js/hub-motion.js';
import { animateAreaReveal } from './chart-kit/animate.js';
import { buildAreaLine } from './chart-kit/area-line.js';
import { buildCarvedAway } from './chart-kit/carved-away.js';
import { buildHundredSquares, squareKinds } from './chart-kit/hundred-squares.js';
import { buildRecompScissors } from './chart-kit/recomp-scissors.js';
import { buildShedStack } from './chart-kit/shed-stack.js';
import { buildStairsDown } from './chart-kit/stairs-down.js';
import { mountSceneChart } from './render-scene-chart.js';
import { BODY_RANGES } from './body-model.js';
import { formatDisplayDate } from '../core/time.js';

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
  onLogComposition,
  onViewBloods,
  onViewMedical,
  forecast = null,
  charts = null,
  quiet = false
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
    const reuseImg = quiet ? host.querySelector('.body-figure__img') : null;
    const cards = [];
    if (forecast) cards.push(forecastCard(root, forecast));
    cards.push(
      sectionCard(root, model.scale, {
        onLogWeight,
        kind: 'scale',
        quiet,
        charts
      }),
      ...compositionSection(root, model.composition, {
        onLogComposition,
        quiet,
        charts
      }),
      sectionCard(root, model.tape, {
        kind: 'tape',
        quiet,
        reuseImg
      }),
      medicalLinks(root, onViewBloods, onViewMedical)
    );
    host.replaceChildren(...cards);
  }

  dashboard.removeAttribute('hidden');
}


function forecastCard(root, forecast) {
  const article = root.createElement('article');
  article.className = 'metric-card body-forecast';
  article.dataset.bodySection = 'forecast';

  const head = root.createElement('div');
  head.className = 'body-forecast__head';
  const copy = root.createElement('div');
  const label = root.createElement('p');
  label.className = 'metric-label';
  label.textContent = 'Forecast';
  const caption = root.createElement('p');
  caption.className = 'metric-caption';
  caption.textContent = 'Independent clocks. No blended progress score.';
  copy.append(label, caption);
  const binding = root.createElement('span');
  binding.className = 'body-forecast__binding';
  binding.textContent = bindingText(forecast);
  head.append(copy, binding);
  article.append(head);

  const current = root.createElement('div');
  current.className = 'body-forecast__current';
  current.append(
    forecastMetric(root, 'Weight', forecast.current?.weight_kg == null ? '—' : `${forecast.current.weight_kg} kg`, weightGapText(forecast)),
    forecastMetric(root, 'Body fat', forecast.current?.body_fat_pct == null ? '—' : `${forecast.current.body_fat_pct}%`, fatGapText(forecast)),
    forecastMetric(root, 'Shoulder:waist', forecast.tape?.current_ratio == null ? '—' : Number(forecast.tape.current_ratio).toFixed(2), ratioGapText(forecast))
  );
  article.append(current);

  const scenarios = root.createElement('div');
  scenarios.className = 'body-forecast__scenarios';
  scenarios.append(
    scenarioCard(root, 'As logged', forecast.body?.as_logged, forecast),
    scenarioCard(root, 'On plan', forecast.body?.on_plan, forecast)
  );
  article.append(scenarios);

  const clocks = root.createElement('div');
  clocks.className = 'body-forecast__clocks';
  clocks.append(clockCard(root, {
    label: 'Shoulder:waist',
    value: forecast.tape?.current_ratio == null
      ? 'No reading'
      : `${Number(forecast.tape.current_ratio).toFixed(2)} → ${forecast.tape.target_ratio ?? '—'}`,
    status: forecast.tape?.status,
    detail: clockDetail(forecast.tape)
  }));
  for (const lift of forecast.lifts ?? []) {
    clocks.append(clockCard(root, {
      label: lift.exercise ?? lift.id ?? 'Lift',
      value: lift.current_e1rm_kg == null
        ? `Target ${lift.target_e1rm_kg ?? '—'} kg`
        : `${lift.current_e1rm_kg} → ${lift.target_e1rm_kg} kg`,
      status: lift.status,
      detail: liftDetail(lift)
    }));
  }
  article.append(clocks);
  return article;
}

function forecastMetric(root, labelText, valueText, detailText) {
  const item = root.createElement('div');
  item.className = 'body-forecast__metric';
  const label = root.createElement('span');
  label.className = 'body-forecast__metric-label';
  label.textContent = labelText;
  const value = root.createElement('strong');
  value.className = 'body-forecast__metric-value';
  value.textContent = valueText;
  const detail = root.createElement('span');
  detail.className = 'body-forecast__metric-detail';
  detail.textContent = detailText;
  item.append(label, value, detail);
  return item;
}

function scenarioCard(root, labelText, scenario, forecast) {
  const card = root.createElement('section');
  card.className = 'body-forecast__scenario';
  const top = root.createElement('div');
  top.className = 'body-forecast__scenario-top';
  const label = root.createElement('span');
  label.className = 'body-forecast__scenario-label';
  label.textContent = labelText;
  const pill = statusPill(root, scenario?.status);
  top.append(label, pill);

  const main = root.createElement('strong');
  main.className = 'body-forecast__scenario-main';
  main.textContent = scenario?.status === 'dated'
    ? formatDisplayDate(scenario.date)
    : scenario?.status === 'will_not_arrive'
      ? 'Will not arrive'
      : scenario?.status === 'complete'
        ? 'In target'
        : 'Date locked';

  const detail = root.createElement('p');
  detail.className = 'metric-caption body-forecast__scenario-detail';
  detail.textContent = scenarioDetail(scenario, forecast);
  card.append(top, main, detail);
  return card;
}

function clockCard(root, { label, value, status, detail }) {
  const card = root.createElement('section');
  card.className = 'body-forecast__clock';
  const top = root.createElement('div');
  top.className = 'body-forecast__clock-top';
  const name = root.createElement('span');
  name.className = 'body-forecast__clock-label';
  name.textContent = label;
  top.append(name, statusPill(root, status));
  const valueEl = root.createElement('strong');
  valueEl.className = 'body-forecast__clock-value';
  valueEl.textContent = value;
  const detailEl = root.createElement('span');
  detailEl.className = 'body-forecast__clock-detail';
  detailEl.textContent = detail;
  card.append(top, valueEl, detailEl);
  return card;
}

function statusPill(root, status) {
  const pill = root.createElement('span');
  pill.className = 'body-forecast__status';
  pill.dataset.status = status ?? 'locked';
  pill.textContent = status === 'dated'
    ? 'Dated'
    : status === 'complete'
      ? 'Met'
      : status === 'will_not_arrive'
        ? 'Off course'
        : 'Locked';
  return pill;
}

function weightGapText(forecast) {
  const gap = forecast.current?.gaps?.weight_to_enter_band_kg;
  return gap == null ? 'Target 78–82 kg' : gap === 0 ? 'Inside 78–82 kg' : `${gap} kg to enter 78–82`;
}

function fatGapText(forecast) {
  const gap = forecast.current?.gaps?.body_fat_to_enter_band_pct_points;
  return gap == null ? 'Target 8–10%' : gap === 0 ? 'Inside 8–10%' : `${gap} points to 10%`;
}

function ratioGapText(forecast) {
  const gap = forecast.tape?.gap;
  return gap == null ? 'Target 1.60' : gap <= 0 ? 'Target met' : `${Number(gap).toFixed(2)} to 1.60`;
}

function scenarioDetail(scenario, forecast) {
  if (!scenario) return 'Forecast unavailable.';
  if (scenario.status === 'dated') {
    const binding = scenario.binding_condition === 'body_fat' ? 'body fat is binding' : 'weight is binding';
    return `${binding}. 8% clock: ${scenario.tight_body_fat_date ? formatDisplayDate(scenario.tight_body_fat_date) : 'not reached in band'}.`;
  }
  if (scenario.status === 'will_not_arrive') return scenario.reason ?? 'Current direction does not enter the target box.';
  if (scenario.status === 'complete') return 'Weight and body fat are simultaneously inside the target box.';
  return bodyLockText(forecast);
}

function bodyLockText(forecast) {
  const attempts = forecast.input_quality?.energy_calibration?.attempts ?? [];
  let bestCount = 0;
  let largestGap = null;
  for (const attempt of attempts) {
    bestCount = Math.max(bestCount, Number(attempt?.weight?.trend?.observation_count ?? 0));
    const gap = Number(attempt?.weight?.trend?.max_gap_days);
    if (Number.isFinite(gap)) largestGap = largestGap == null ? gap : Math.min(largestGap, gap);
  }
  if (bestCount < 5) {
    const missing = 5 - bestCount;
    const gapNote = largestGap != null && largestGap > 21 ? ' and close the >21-day gap' : '';
    return `${bestCount}/5 recent weight days. Need ${missing} more reading${missing === 1 ? '' : 's'}${gapNote}.`;
  }
  const missing = forecast.input_quality?.energy_calibration?.missing ?? [];
  return missing[0] ?? 'More overlapping weight and complete nutrition data is required.';
}

function clockDetail(clock) {
  if (!clock) return 'No clock available.';
  if (clock.status === 'dated') return `Current trend: ${formatDisplayDate(clock.date)}.`;
  if (clock.status === 'complete') return `Target met on ${formatDisplayDate(clock.date)}.`;
  if (clock.status === 'will_not_arrive') return clock.reason ?? 'Current trend is not moving toward target.';
  return (clock.missing ?? []).join(' · ') || 'More measurements required.';
}

function liftDetail(lift) {
  if (!lift) return 'No clock available.';
  if (lift.status === 'dated') {
    const deadline = lift.deadline ? formatDisplayDate(lift.deadline) : null;
    return deadline
      ? `Trend date ${formatDisplayDate(lift.date)} · deadline ${deadline}`
      : `Trend date ${formatDisplayDate(lift.date)}`;
  }
  if (lift.status === 'complete') return `Target met on ${formatDisplayDate(lift.date)}.`;
  if (lift.status === 'will_not_arrive') return 'Current comparable e1RM trend is not rising toward target.';
  return (lift.missing ?? []).join(' · ') || 'More comparable hard sessions required.';
}

function bindingText(forecast) {
  const binding = forecast.physique_binding?.as_logged;
  if (binding?.status === 'dated') return `Binding: ${formatDisplayDate(binding.date)}`;
  const blockers = binding?.blockers ?? [];
  if (blockers.includes('body_box') || blockers.includes('body_fat_8')) return 'Binding: body trend';
  if (blockers.includes('shoulder_waist')) return 'Binding: tape';
  return 'Live model';
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
    article.append(tapeFigure(root, section.metrics, hooks.reuseImg));
  } else {
    const blocks = section.metrics.filter(metric => !metric.empty).map(metric => metricBlock(root, metric, hooks.quiet, {
      chart: () => bodyChartFor(root, metric.key, hooks.charts, hooks.quiet)
    }));
    for (const block of blocks) article.append(block);
  }

  if (section.id === 'scale' || section.id === 'composition') {
    article.append(quickLog(root, section.id, hooks));
  }
  return article;
}

function compositionSection(root, section, hooks) {
  const metrics = (section.metrics ?? []).filter(metric => !metric.empty);
  if (!metrics.length) {
    return [sectionCard(root, { ...section, id: 'composition' }, { ...hooks, kind: 'composition' })];
  }

  const pair = root.createElement('div');
  pair.className = 'body-composition-pair';
  for (const metric of metrics) {
    pair.append(compositionCard(root, metric, hooks.quiet, hooks.charts));
  }

  const wrap = root.createElement('div');
  wrap.className = 'body-composition';
  wrap.append(pair, quickLog(root, 'composition', hooks));
  return [wrap];
}

function compositionCard(root, metric, quiet, charts = null) {
  const article = root.createElement('article');
  article.className = 'metric-card body-section';
  article.dataset.bodySection = metric.key;

  const heading = root.createElement('div');
  heading.className = 'body-section__head';
  const title = root.createElement('h3');
  title.className = 'metric-label';
  title.textContent = metric.label;
  heading.append(title);
  article.append(heading, metricBlock(root, metric, quiet, {
    hideLabel: true,
    chart: () => bodyChartFor(root, metric.key, charts, quiet)
  }));
  return article;
}

function medicalLinks(root, onViewBloods, onViewMedical) {
  const wrap = root.createElement('div');
  wrap.className = 'body-medical-links';
  wrap.append(bloodsTile(root, onViewBloods), medicalTile(root, onViewMedical));
  return wrap;
}

function bloodsTile(root, onViewBloods) {
  const button = root.createElement('button');
  button.type = 'button';
  button.className = 'metric-card body-section bloods-entry';
  button.textContent = 'View bloods →';
  button.addEventListener('click', () => onViewBloods?.());
  return button;
}

function medicalTile(root, onViewMedical) {
  const button = root.createElement('button');
  button.type = 'button';
  button.className = 'metric-card body-section bloods-entry';
  button.textContent = 'View medical →';
  button.addEventListener('click', () => onViewMedical?.());
  return button;
}

function emptyCopy(id) {
  if (id === 'scale') return 'No weight readings in this range yet.';
  if (id === 'composition') return 'No composition readings yet.';
  return 'No tape measurements yet.';
}

function tapeFigure(root, metrics, reuseImg) {
  const wrap = root.createElement('div');
  wrap.className = 'body-tape';
  wrap.dataset.bodySection = 'tape';

  const figure = root.createElement('div');
  figure.className = 'body-figure';
  figure.id = 'body-tape-figure';

  const img = reuseImg ?? root.createElement('img');
  if (!reuseImg) {
    img.src = 'assets/body/full-body-diagram.png';
    img.alt = 'Full body anatomy diagram';
    img.className = 'body-figure__img';
  }
  figure.append(img);

  const left = root.createElement('div');
  left.className = 'body-figure__rail body-figure__rail--left';
  const right = root.createElement('div');
  right.className = 'body-figure__rail body-figure__rail--right';
  wrap.append(left, figure, right);

  const placed = [];
  for (const metric of metrics) {
    if (metric.empty || metric.current == null) continue;
    const anchor = LABEL_ANCHORS[metric.site ?? metric.key];
    if (!anchor) continue;
    placed.push({ metric, anchor });
  }
  placed.sort((a, b) => parseFloat(a.anchor.top) - parseFloat(b.anchor.top));

  for (const { metric, anchor } of placed) {
    const rail = anchor.side === 'right' ? right : left;
    rail.append(tapeLabel(root, metric, anchor, wrap));
  }

  return wrap;
}

function tapeLabel(root, metric, anchor, labelsHost) {
  const site = metric.site ?? metric.key;
  const el = root.createElement('div');
  el.className = 'body-tape-label';
  el.dataset.site = site;
  el.dataset.side = anchor.side;

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
    date.textContent = formatDisplayDate(row.date);

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

function metricBlock(root, metric, quiet = false, { hideLabel = false, chart = null } = {}) {
  const wrap = root.createElement('div');
  wrap.className = 'body-metric';

  const head = root.createElement('div');
  head.className = 'body-metric__head';
  if (!hideLabel) {
    const name = root.createElement('strong');
    name.textContent = metric.label;
    head.append(name);
  }

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

  const sceneChart = chart?.();
  if (sceneChart) {
    wrap.append(sceneChart);
  } else if (metric.series.length) {
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
    queueMicrotask(() => animateAreaReveal(chart, { quiet }));
  } else if (metric.latest) {
    const caption = root.createElement('p');
    caption.className = 'metric-caption';
    caption.textContent = 'No readings in this range.';
    wrap.append(caption);
  }

  return wrap;
}

/* ── Scene charts (weight, body fat, skeletal muscle) ─────────────────── */

/** Which view each multi-view card shows. Kept across re-renders and range changes. */
const bodyChartViews = { weight: 'stack', muscle: 'scissors' };
const BODY_CHART_MAX_WIDTH = 640;

function bodyChartFor(root, key, charts, quiet) {
  if (!charts) return null;
  if (key === 'weight_kg' && charts.weight) {
    return chartBlock(root, 'weight', 'Weight view', [
      { id: 'stack', label: 'Shed stack', build: buildShedStack, data: charts.weight.stack },
      { id: 'stairs', label: 'Stairs', build: buildStairsDown, data: charts.weight.stairs }
    ], quiet);
  }
  if (key === 'body_fat_pct' && charts.fat) {
    return chartBlock(root, 'fat', 'Body fat view', [
      { id: 'carved', label: 'Carved away', build: buildCarvedAway, data: charts.fat.carved }
    ], quiet);
  }
  if (key === 'skeletal_muscle_kg' && charts.muscle) {
    return chartBlock(root, 'muscle', 'Muscle view', [
      { id: 'scissors', label: 'Scissors', build: buildRecompScissors, data: charts.muscle.scissors },
      { id: 'squares', label: '100 squares', build: buildHundredSquares, data: charts.muscle.squares }
    ], quiet);
  }
  return null;
}

function resetChartHost(host) {
  host._hc?.resize?.disconnect();
  clearTimeout(host._hc?.settleTimer);
  host._hc = null;
  host.replaceChildren();
}

const nextFrame = fn => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : fn());

function chartBlock(root, name, ariaLabel, views, quiet) {
  const block = root.createElement('div');
  block.className = 'body-chart-block';
  block.dataset.bodyChart = name;
  const host = root.createElement('div');
  host.id = `body-chart-${name}`;
  const extra = root.createElement('div');
  extra.className = 'body-chart-extra';
  const current = () => views.find(v => v.id === bodyChartViews[name]) ?? views[0];

  let pills = null;
  if (views.length > 1) {
    pills = root.createElement('div');
    pills.className = 'hub-pills';
    pills.setAttribute('role', 'tablist');
    pills.setAttribute('aria-label', ariaLabel);
    for (const view of views) {
      const button = root.createElement('button');
      button.type = 'button';
      button.className = 'hub-pills__btn';
      button.textContent = view.label;
      button.dataset.bodyView = view.id;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', host.id);
      button.addEventListener('click', () => {
        if (bodyChartViews[name] === view.id) return;
        bodyChartViews[name] = view.id;
        syncPills();
        resetChartHost(host);
        paint(false);
        nextFrame(() => applyHubPillsThumb(pills));
      });
      pills.append(button);
    }
    block.append(pills);
  }
  block.append(host, extra);

  function syncPills() {
    for (const button of pills?.querySelectorAll?.('[data-body-view]') ?? []) {
      const on = button.dataset.bodyView === current().id;
      button.setAttribute('aria-selected', on ? 'true' : 'false');
      button.setAttribute('tabindex', on ? '0' : '-1');
    }
  }

  function paint(quietPaint) {
    const view = current();
    mountSceneChart(host, view.build, view.data, { quiet: quietPaint, maxWidth: BODY_CHART_MAX_WIDTH });
    extra.replaceChildren();
    if (view.id === 'squares') squaresScrubber(root, host, extra, view.data);
  }

  syncPills();
  queueMicrotask(() => {
    paint(quiet);
    if (pills) nextFrame(() => applyHubPillsThumb(pills));
  });
  return block;
}

function squaresScrubber(root, host, extra, data) {
  if (data?.status !== 'ready' || data.readings.length < 2) return;
  const wrap = root.createElement('div');
  wrap.className = 'body-chart-scrub';
  const label = root.createElement('label');
  label.htmlFor = 'body-squares-scrub';
  label.textContent = 'Reading';
  const input = root.createElement('input');
  input.type = 'range';
  input.id = 'body-squares-scrub';
  input.min = '0';
  input.max = String(data.readings.length - 1);
  input.step = '1';
  input.value = String(data.index);
  const output = root.createElement('output');
  output.htmlFor = 'body-squares-scrub';
  const showDate = index => { output.textContent = formatDisplayDate(data.readings[index].date); };
  showDate(data.index);
  let shown = data.index;
  input.addEventListener('input', () => {
    const index = Number(input.value);
    if (index === shown) return;
    const before = squareKinds(data.readings[shown].squares);
    const after = squareKinds(data.readings[index].squares);
    shown = index;
    mountSceneChart(host, buildHundredSquares, { ...data, index }, { quiet: true, maxWidth: BODY_CHART_MAX_WIDTH });
    for (const cell of host.querySelectorAll('.bc-cell[data-cell]')) {
      const i = Number(cell.getAttribute('data-cell'));
      if (before[i] === after[i]) continue;
      cell.style.setProperty('--bc-flip-delay', `${(i % 10) * 12 + Math.floor(i / 10) * 8}ms`);
      cell.classList.add('bc-cell--flip');
    }
    showDate(index);
  });
  wrap.append(label, input, output);
  extra.append(wrap);
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
  if (sectionId === 'scale') {
    const popover = createMorphingValuesPopover({
      root,
      label: 'Log weight',
      title: 'Weight',
      supporting: 'Today’s scale reading.',
      layoutId: 'body-log-weight',
      triggerClass: 'body-quick-log__button',
      className: 'body-quick-log',
      submitLabel: 'Log weight',
      fields: [{
        id: 'body-weight-kg',
        name: 'weight_kg',
        label: 'Weight',
        type: 'number',
        inputMode: 'decimal',
        step: '0.1',
        min: '0',
        placeholder: 'kg',
        autoFocus: true
      }],
      onSubmit(values, api) {
        const value = Number(values.weight_kg);
        if (!Number.isFinite(value) || value <= 0) return;
        hooks.onLogWeight?.(value);
        api.close();
      }
    });
    return popover.el;
  }

  const popover = createMorphingValuesPopover({
    root,
    label: 'Log composition',
    title: 'Composition',
    supporting: 'Body fat and skeletal muscle.',
    layoutId: 'body-log-composition',
    triggerClass: 'body-quick-log__button',
    className: 'body-quick-log',
    submitLabel: 'Log composition',
    fields: [
      {
        id: 'body-fat-pct',
        name: 'body_fat_pct',
        label: 'Body fat',
        type: 'number',
        inputMode: 'decimal',
        step: '0.1',
        min: '0',
        placeholder: '%',
        autoFocus: true
      },
      {
        id: 'body-muscle-kg',
        name: 'skeletal_muscle_kg',
        label: 'Muscle',
        type: 'number',
        inputMode: 'decimal',
        step: '0.1',
        min: '0',
        placeholder: 'kg'
      }
    ],
    onSubmit(values, api) {
      const fields = {};
      const fatValue = Number(values.body_fat_pct);
      const muscleValue = Number(values.skeletal_muscle_kg);
      if (Number.isFinite(fatValue) && fatValue > 0) fields.body_fat_pct = fatValue;
      if (Number.isFinite(muscleValue) && muscleValue > 0) fields.skeletal_muscle_kg = muscleValue;
      if (!Object.keys(fields).length) return;
      hooks.onLogComposition?.(fields);
      api.close();
    }
  });
  return popover.el;
}

export { BODY_RANGES, RANGE_LABELS };
