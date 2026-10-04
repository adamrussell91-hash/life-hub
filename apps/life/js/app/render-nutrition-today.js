import { countUp } from './chart-kit/animate.js';
import { buildNestedRings } from './chart-kit/nested-rings.js';
import { buildProteinClimb, formatClock } from './chart-kit/protein-climb.js';
import { formatGrams } from '../core/aggregate.js';
import { formatDisplayDate, formatWeekday, getSydneyDateKey, getSydneyMinutesOfDay } from '../core/time.js';

const SVG = 'http://www.w3.org/2000/svg';
const climbState = new WeakMap();

const whole = value => Math.round(Number(value) || 0).toLocaleString('en-AU');
const amount = (value, unit) => (unit === 'g' ? formatGrams(value) : whole(value));
const capitalise = text => (text ? text[0].toUpperCase() + text.slice(1) : 'Meal');

function svgNode(doc, tag, attrs = {}, text) {
  const node = doc.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value != null) node.setAttribute(key, String(value));
  }
  if (text != null) node.textContent = text;
  return node;
}

function titled(doc, node, text) {
  node.append(svgNode(doc, 'title', {}, text));
  return node;
}

function shortWeekday(date) {
  return formatWeekday(date).slice(0, 3);
}

export function renderNutritionToday(root, model, options = {}) {
  const card = root.querySelector('#nutrition-today');
  if (!card) return;
  const now = options.now ?? new Date();
  const isToday = model.date === getSydneyDateKey(now);
  const kicker = root.querySelector('#nutrition-today-label');
  if (kicker) {
    const day = `${shortWeekday(model.date)} ${formatDisplayDate(model.date)}`;
    kicker.textContent = isToday ? `Today · ${day}` : day;
  }
  renderRings(root, model, options);
  renderClimb(root, model, { ...options, nowMinutes: isToday ? getSydneyMinutesOfDay(now) : null });
  renderAdvice(root, model);
}

function ringList(model) {
  const { nutrition, targets } = model;
  return [
    { key: 'protein', label: 'Protein', value: nutrition.protein_g, target: targets.protein_g, unit: 'g', kind: 'target' },
    { key: 'energy', label: 'Energy', value: nutrition.calories, target: targets.calories, unit: 'kcal', kind: 'target' },
    { key: 'fat', label: 'Fat', value: nutrition.fat_g, target: targets.fat_ceiling_g, unit: 'g', kind: 'ceiling' },
    { key: 'sodium', label: 'Sodium', value: nutrition.sodium_mg, target: targets.sodium_ceiling_mg, unit: 'mg', kind: 'ceiling' }
  ];
}

function ringText(ring) {
  if (!ring.hasTarget) return `${amount(ring.value, ring.unit)} ${ring.unit} · no target`;
  return `${amount(ring.value, ring.unit)} / ${amount(ring.target, ring.unit)} ${ring.unit}${ring.kind === 'ceiling' ? ' ceiling' : ''}`;
}

function renderRings(root, model, options) {
  const svg = root.querySelector('#nutrition-rings');
  if (!svg) return;
  const doc = svg.ownerDocument ?? root;
  const rings = buildNestedRings(ringList(model), { size: 200, strokeWidth: 11, gap: 2 });
  const nodes = [];
  const defs = svgNode(doc, 'defs');
  const filter = svgNode(doc, 'filter', { id: 'nutrition-ring-cap', x: '-50%', y: '-50%', width: '200%', height: '200%' });
  filter.append(svgNode(doc, 'feDropShadow', { dx: 0, dy: 0, stdDeviation: 1.6, 'flood-color': '#000', 'flood-opacity': 0.35 }));
  defs.append(filter);
  nodes.push(defs);

  rings.forEach((ring, index) => {
    const delay = index * 110;
    const group = svgNode(doc, 'g', { class: 'nutrition-ring', 'data-ring': ring.key });
    const common = { cx: ring.center, cy: ring.center, r: ring.radius, fill: 'none', 'stroke-width': ring.strokeWidth };
    group.append(svgNode(doc, 'circle', { ...common, class: 'nutrition-ring__track' }));
    if (ring.hasTarget && ring.fraction > 0) {
      const fill = svgNode(doc, 'circle', {
        ...common,
        class: 'nutrition-ring__fill',
        'stroke-linecap': 'round',
        'stroke-dasharray': ring.circumference,
        'stroke-dashoffset': ring.dashoffset,
        transform: `rotate(-90 ${ring.center} ${ring.center})`,
        style: `--len:${ring.circumference};--d:${delay}ms;--dur:${Math.round(900 + 300 * ring.fraction)}ms`
      });
      group.append(titled(doc, fill, `${ring.label}: ${ringText(ring)}`));
    }
    if (ring.overflow > 0) {
      const over = svgNode(doc, 'circle', {
        ...common,
        class: 'nutrition-ring__over',
        filter: 'url(#nutrition-ring-cap)',
        'stroke-linecap': 'round',
        'stroke-dasharray': ring.circumference,
        'stroke-dashoffset': ring.overflowDashoffset,
        transform: `rotate(-90 ${ring.center} ${ring.center})`,
        style: `--len:${ring.circumference};--d:${delay + 1200}ms;--dur:600ms`
      });
      group.append(titled(doc, over, `${ring.label}: ${Math.round((ring.ratio - 1) * 100)}% over the ceiling`));
    }
    nodes.push(group);
  });

  const protein = rings[0];
  const remaining = Math.max(0, protein.target - protein.value);
  const value = svgNode(doc, 'text', { x: 100, y: 100, 'text-anchor': 'middle', class: 'nutrition-rings__value' });
  const lineOne = svgNode(doc, 'text', { x: 100, y: 116, 'text-anchor': 'middle', class: 'nutrition-rings__caption' });
  const lineTwo = svgNode(doc, 'text', { x: 100, y: 128, 'text-anchor': 'middle', class: 'nutrition-rings__caption' });
  nodes.push(value, lineOne, lineTwo);
  svg.replaceChildren(...nodes);

  if (!protein.hasTarget) {
    value.textContent = formatGrams(protein.value);
    lineOne.textContent = 'g protein';
    lineTwo.textContent = 'logged';
  } else if (remaining <= 0) {
    value.textContent = '✓';
    lineOne.textContent = 'protein';
    lineTwo.textContent = 'hit';
  } else {
    lineOne.textContent = 'g protein';
    lineTwo.textContent = 'to go';
    countUp(value, Math.round(remaining), { quiet: options.quiet });
  }

  svg.setAttribute('aria-label', rings.map(ring => {
    const base = `${ring.label} ${ringText(ring)}`;
    return ring.kind === 'ceiling' && ring.ratio > 1 ? `${base}, ${Math.round((ring.ratio - 1) * 100)}% over` : base;
  }).join('; '));

  const legend = root.querySelector('#nutrition-ring-legend');
  if (legend) {
    legend.replaceChildren(...rings.map((ring, index) => {
      const item = doc.createElement('li');
      item.dataset.ring = ring.key;
      item.style.setProperty('--d', `${300 + index * 110}ms`);
      const swatch = doc.createElement('span');
      swatch.className = 'nutrition-rings__swatch';
      swatch.setAttribute('aria-hidden', 'true');
      const name = doc.createElement('strong');
      name.textContent = ring.label;
      const text = doc.createElement('span');
      text.className = 'nutrition-rings__amount';
      text.textContent = ringText(ring);
      item.append(swatch, name, text);
      if (ring.kind === 'ceiling' && ring.ratio > 1) {
        const flag = doc.createElement('em');
        flag.className = 'nutrition-rings__flag';
        flag.textContent = `over ${Math.round((ring.ratio - 1) * 100)}%`;
        item.append(flag);
      }
      return item;
    }));
  }

  const chips = root.querySelector('#nutrition-ring-chips');
  if (chips) {
    const chip = (label, value, rest) => {
      const node = doc.createElement('span');
      node.className = 'nutrition-rings__chip';
      const strong = doc.createElement('b');
      strong.textContent = value;
      node.append(`${label} `, strong, rest);
      return node;
    };
    const { nutrition, targets } = model;
    chips.replaceChildren(
      chip('Calcium', whole(nutrition.calcium_mg), targets.calcium_target_mg > 0 ? ` / ${whole(targets.calcium_target_mg)} mg` : ' mg'),
      chip('Polyphenols', String(nutrition.polyphenol_score ?? 0), model.polyphenolVsAim ? ` · ${model.polyphenolVsAim.label}` : '')
    );
  }
}

function renderClimb(root, model, options) {
  const svg = root.querySelector('#nutrition-climb');
  if (!svg) return;
  const plot = svg.parentElement;
  climbState.set(svg, { model, options });
  if (!climbState.has(plot) && typeof globalThis.ResizeObserver === 'function' && plot) {
    let lastWidth = plot.clientWidth;
    const observer = new globalThis.ResizeObserver(() => {
      if (plot.clientWidth === lastWidth) return;
      lastWidth = plot.clientWidth;
      const state = climbState.get(svg);
      if (state) paintClimb(root, svg, state.model, { ...state.options, quiet: true });
    });
    observer.observe(plot);
    climbState.set(plot, observer);
  }
  paintClimb(root, svg, model, options);
}

function paintClimb(root, svg, model, options) {
  const doc = svg.ownerDocument ?? root;
  const width = Math.max(280, Math.round(svg.parentElement?.clientWidth || 440));
  const height = width < 420 ? 196 : 210;
  const meals = (model.mealsToday ?? []).map(meal => ({
    minutes: meal.minutes,
    protein_g: meal.protein_g,
    timeKnown: meal.timeKnown,
    label: capitalise(meal.meal)
  }));
  const chart = buildProteinClimb({
    meals,
    goal: model.targets.protein_g,
    nowMinutes: options.nowMinutes,
    usual: model.usualClimb?.points ?? null,
    width,
    height
  });
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  const { left, right, top, base } = chart.plot;
  const nodes = [];

  if (chart.goalBand) {
    nodes.push(svgNode(doc, 'rect', { x: left, y: top, width: right - left, height: Math.max(0, chart.goalBand.y - top), class: 'climb-goal-band climb-fade', style: '--d:0ms' }));
    nodes.push(svgNode(doc, 'text', { x: left + 4, y: Math.max(top + 10, chart.goalBand.y - 4), class: 'climb-goal-label climb-fade', style: '--d:0ms' }, `${formatGrams(chart.goal)} g goal`));
  }
  for (const tick of chart.yTicks) {
    nodes.push(svgNode(doc, 'line', { x1: left, x2: right, y1: tick.y, y2: tick.y, class: 'climb-grid' }));
    nodes.push(svgNode(doc, 'text', { x: left - 5, y: tick.y + 3, 'text-anchor': 'end', class: 'climb-axis' }, String(tick.grams)));
  }
  for (const tick of chart.ticks) {
    nodes.push(svgNode(doc, 'text', { x: tick.x, y: height - 4, 'text-anchor': 'middle', class: 'climb-axis' }, tick.label));
  }
  if (chart.usualPath) {
    nodes.push(titled(doc, svgNode(doc, 'path', { d: chart.usualPath, class: 'climb-usual climb-fade', style: '--d:200ms' }),
      `Your usual: average running total over the last ${model.usualClimb.days} logged days`));
  }

  const empty = root.querySelector('[data-nutrition="climb-empty"]');
  const subtitle = root.querySelector('[data-nutrition="climb-subtitle"]');
  const isToday = options.nowMinutes != null;

  if (!chart.empty) {
    nodes.push(svgNode(doc, 'path', { d: chart.areaPath, class: 'climb-area climb-fade', style: '--d:1300ms' }));
    nodes.push(svgNode(doc, 'path', { d: chart.stepPath, class: 'climb-line', 'data-role': 'climb-line', style: `--len:${Math.ceil(chart.length)};--d:250ms;--dur:1300ms` }));
    for (const marker of chart.markers) {
      const delay = Math.round(250 + 1300 * marker.progress);
      nodes.push(svgNode(doc, 'line', { x1: marker.x, x2: marker.x, y1: base, y2: base + 8, class: 'climb-tick climb-fade', style: `--d:${delay}ms` }));
      const group = svgNode(doc, 'g', {
        class: 'climb-marker climb-pop',
        'data-time-known': String(marker.timeKnown),
        style: `--d:${delay}ms;transform-origin:${marker.x}px ${base + 18}px`
      });
      group.append(svgNode(doc, 'circle', { cx: marker.x, cy: base + 18, r: marker.r, class: 'climb-marker__dot' }));
      group.append(svgNode(doc, 'text', { x: marker.x, y: base + 18 + marker.r + 11, 'text-anchor': 'middle', class: 'climb-marker__label' }, marker.label));
      titled(doc, group, marker.meals.map(meal => (
        `${meal.label} · ${formatClock(meal.minutes)} · ${formatGrams(meal.protein_g)} g protein${meal.timeKnown === false ? ' · time not logged' : ''}`
      )).join('\n'));
      nodes.push(group);
    }
  }

  if (chart.now) {
    const nearRight = chart.now.x > right - 60;
    nodes.push(svgNode(doc, 'line', { x1: chart.now.x, x2: chart.now.x, y1: top, y2: base, class: 'climb-now climb-fade', style: '--d:1500ms' }));
    nodes.push(svgNode(doc, 'text', {
      x: nearRight ? right : chart.now.x, y: top - 7, 'text-anchor': nearRight ? 'end' : 'middle', class: 'climb-now-label climb-fade', style: '--d:1500ms'
    }, `now · ${formatClock(chart.now.minutes)}`));
    if (!chart.empty) {
      nodes.push(svgNode(doc, 'circle', {
        cx: chart.now.x, cy: chart.now.y, r: 4.5, class: 'climb-now-dot climb-pop climb-glow',
        style: `--d:1550ms;transform-origin:${chart.now.x}px ${chart.now.y}px`
      }));
    }
  }
  if (chart.projection) {
    const p = chart.projection;
    nodes.push(svgNode(doc, 'line', { x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2, class: 'climb-projection climb-fade', style: '--d:1750ms' }));
    nodes.push(svgNode(doc, 'text', {
      x: right - 2, y: Math.min(base - 6, (p.y1 + p.y2) / 2 + 14), 'text-anchor': 'end', class: 'climb-projection-label climb-fade', style: '--d:1850ms'
    }, `${formatGrams(p.remaining)} g to go before bed`));
  } else if (chart.goalHitMinutes != null && chart.goalBand) {
    nodes.push(svgNode(doc, 'text', {
      x: right - 2, y: chart.goalBand.y - 4, 'text-anchor': 'end', class: 'climb-hit-label climb-fade', style: '--d:1500ms'
    }, `goal hit at ${formatClock(chart.goalHitMinutes)}`));
  }

  svg.replaceChildren(...nodes);

  if (empty) {
    empty.hidden = !chart.empty;
    empty.textContent = isToday ? 'No meals logged yet today.' : 'No meals logged on this day.';
  }
  if (subtitle) {
    const total = formatGrams(chart.total);
    if (chart.empty) subtitle.textContent = isToday ? 'Nothing logged yet' : 'Nothing logged';
    else if (isToday) {
      subtitle.textContent = `${total} g by ${formatClock(chart.now.minutes)}${chart.usualAtNow != null ? ` · usually ~${Math.round(chart.usualAtNow)} g by now` : ''}`;
    } else {
      subtitle.textContent = `${total} g across ${meals.length} meal${meals.length === 1 ? '' : 's'}`;
    }
  }
  svg.setAttribute('aria-label', chart.empty
    ? 'No protein logged yet'
    : `Protein running total: ${formatGrams(chart.total)} of ${formatGrams(chart.goal)} grams across ${meals.length} meals`);
}

function renderAdvice(root, model) {
  const advice = root.querySelector('[data-nutrition="advice"]');
  if (!advice) return;
  const text = String(model.advice ?? '').trim();
  advice.textContent = text || 'Log a meal with Brisket and his notes show up here.';
  advice.classList?.toggle?.('is-empty', !text);
}
