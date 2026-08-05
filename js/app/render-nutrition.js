import { animateAreaReveal, animateColumnGrow, animateRingFill } from './chart-kit/animate.js';
import { buildAreaLine } from './chart-kit/area-line.js';
import { applyRingTarget } from './chart-kit/apply-ring.js';
import { buildColumns } from './chart-kit/columns.js';
import { buildRingTarget } from './chart-kit/ring.js';

const setText = (root, selector, value) => {
  const element = root.querySelector(selector);
  if (element) element.textContent = String(value);
};

const weekdayLetter = date => new Intl.DateTimeFormat('en-AU', {
  weekday: 'narrow'
}).format(new Date(`${date}T12:00:00+10:00`));

export function renderNutrition(root, model) {
  setText(root, '[data-nutrition="calories"]', model.nutrition.calories.toLocaleString('en-AU'));
  setText(root, '[data-target="nutrition-calories"]', `of ${model.targets.calories.toLocaleString('en-AU')} kcal`);
  setText(root, '[data-nutrition="protein"]', `${model.nutrition.protein_g} g`);
  setText(root, '[data-target="nutrition-protein"]', `/ ${model.targets.protein_g} g`);
  setText(root, '[data-nutrition="fat"]', `${model.nutrition.fat_g} g`);
  setText(root, '[data-target="nutrition-fat"]', `/ ${model.targets.fat_ceiling_g} g`);
  setText(root, '[data-nutrition="sodium"]', `${model.nutrition.sodium_mg} mg`);
  setText(root, '[data-target="nutrition-sodium"]', `/ ${model.targets.sodium_ceiling_mg} mg`);
  setText(root, '[data-nutrition="calcium"]', `${model.nutrition.calcium_mg} mg`);
  setText(root, '[data-target="nutrition-calcium"]', `/ ${model.targets.calcium_target_mg} mg`);
  setText(root, '[data-nutrition="polyphenol"]', model.nutrition.polyphenol_score);
  const pill = root.querySelector('[data-nutrition="polyphenol-pill"]');
  if (pill && model.polyphenolVsAim) {
    pill.textContent = model.polyphenolVsAim.label;
    if (pill.dataset) pill.dataset.colour = model.polyphenolVsAim.colour;
  }

  for (const [meal, values] of Object.entries(model.nutrition.meals)) {
    setText(root, `[data-meal-protein="${meal}"]`, `${values.protein_g} g`);
  }

  renderMacroSplit(root, model);
  renderMealsToday(root, model.mealsToday);
  renderMacroRings(root, model);
  renderNamedAreaChart(root, '#nutrition-protein-chart', model.week, 'protein_g', { rollingAverage: 3 });
  renderNamedAreaChart(root, '#nutrition-calories-chart', model.week, 'calories');
  renderNamedAreaChart(root, '#nutrition-fat-chart', model.week, 'fat_g', {
    markOverage: true
  });
  renderHitStrip(root, model.week);
  renderHeatmap(root, model.month);
  renderProteinTrend(root, model.proteinTrend);
  renderWeekCompare(root, model.week, model.previousWeek);

  const fatOver = Boolean(model.overFatCeiling);
  root.querySelector('#nutrition-dashboard')
    ?.classList?.toggle?.('nutrition--fat-over', fatOver);

  root.querySelector('#nutrition-dashboard')?.removeAttribute('hidden');
}

function renderMacroRings(root, model) {
  const rings = {
    calories: { value: model.nutrition.calories, target: model.targets.calories },
    protein: { value: model.nutrition.protein_g, target: model.targets.protein_g },
    fat: { value: model.nutrition.fat_g, target: model.targets.fat_ceiling_g },
    sodium: { value: model.nutrition.sodium_mg, target: model.targets.sodium_ceiling_mg },
    calcium: { value: model.nutrition.calcium_mg, target: model.targets.calcium_target_mg }
  };
  for (const [name, config] of Object.entries(rings)) {
    applyRingTarget(root.querySelector(`[data-nutrition-ring="${name}"]`), config, { size: 72, strokeWidth: 7 });
  }
}

function renderNamedAreaChart(root, selector, series, valueKey, options = {}) {
  const { rollingAverage = 0, markOverage = false } = options;
  const svg = root.querySelector(selector);
  if (!svg) return;
  const normalized = series.map(day => ({ date: day.date, value: day[valueKey] }));
  const chart = buildAreaLine(normalized, {
    rollingAverage,
    width: 320,
    height: 140,
    padding: 12,
    paddingBottom: 24
  });
  svg.setAttribute('viewBox', `0 0 ${chart.width} ${chart.height}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  const line = svg.querySelector('[data-role="line"]');
  const area = svg.querySelector('[data-role="area"]');
  if (line) {
    if (line.tagName.toLowerCase() === 'path') line.setAttribute('d', chart.linePath);
    else line.setAttribute('points', chart.linePoints);
  }
  if (area) {
    if (area.tagName.toLowerCase() === 'path') area.setAttribute('d', chart.areaPath);
    else area.setAttribute('points', chart.areaPoints);
  }

  const rolling = svg.querySelector('[data-role="rolling"]');
  if (rolling) {
    const rollingPath = chart.rollingLinePath || chart.rollingLinePoints;
    if (rollingPath) {
      if (rolling.tagName.toLowerCase() === 'path') rolling.setAttribute('d', chart.rollingLinePath);
      else rolling.setAttribute('points', chart.rollingLinePoints);
      rolling.removeAttribute('hidden');
    } else {
      rolling.setAttribute('hidden', '');
    }
  }

  const labels = svg.querySelector('[data-role="day-labels"]');
  if (labels) {
    labels.replaceChildren();
    for (const day of chart.dayLabels) {
      const text = root.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', day.x);
      text.setAttribute('y', chart.height - 2);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('class', 'chart-day-label');
      text.textContent = weekdayLetter(day.date);
      labels.append(text);
    }
  }

  const markers = svg.querySelector('[data-role="overage-markers"]');
  if (markers) {
    markers.replaceChildren();
    if (markOverage) {
      for (let i = 0; i < series.length; i++) {
        if (!series[i].overFatCeiling) continue;
        const point = chart.points[i];
        if (!point) continue;
        const dot = root.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', String(point.x));
        dot.setAttribute('cy', String(point.y));
        dot.setAttribute('r', '4');
        dot.setAttribute('class', 'chart-overage-dot');
        markers.append(dot);
      }
    }
  }

  animateAreaReveal(svg);
}

function renderMealsToday(root, mealsToday) {
  const list = root.querySelector('#nutrition-meal-log');
  const empty = root.querySelector('[data-nutrition="meal-log-empty"]');
  if (!list) return;
  list.replaceChildren();
  if (!mealsToday?.length) {
    empty?.removeAttribute('hidden');
    return;
  }
  empty?.setAttribute('hidden', '');
  for (const meal of mealsToday) {
    const item = root.createElement('li');
    item.className = 'meal-log__item';
    const title = root.createElement('strong');
    const mealLabel = meal.meal ? meal.meal[0].toUpperCase() + meal.meal.slice(1) : 'Meal';
    title.textContent = meal.time ? `${mealLabel} · ${meal.time}` : mealLabel;
    const detail = root.createElement('p');
    detail.textContent = meal.summary;
    const macros = root.createElement('p');
    macros.className = 'meal-log__macros';
    macros.textContent = `${meal.calories} kcal · ${meal.protein_g} g protein · ${meal.fat_g} g fat`;
    item.append(title, detail, macros);
    list.append(item);
  }
}

function renderHitStrip(root, week) {
  const strip = root.querySelector('#nutrition-hit-strip');
  if (!strip) return;
  strip.replaceChildren();
  for (const day of week) {
    const bar = root.createElement('span');
    bar.className = 'hit-bar';
    bar.dataset.hit = String(day.hitProtein);
    bar.title = day.date;
    strip.append(bar);
  }
}

function renderHeatmap(root, month) {
  const grid = root.querySelector('#nutrition-heatmap');
  if (!grid) return;
  grid.replaceChildren();
  for (const day of month) {
    const tile = root.createElement('span');
    tile.className = 'heatmap-tile';
    tile.dataset.hit = String(day.hitProtein);
    tile.title = day.date;
    grid.append(tile);
  }
}

function renderProteinTrend(root, trend) {
  const badge = root.querySelector('[data-value="protein-trend"]');
  if (!badge) return;
  badge.textContent = trend.label;
  badge.dataset.colour = trend.colour;
}

function renderMacroSplit(root, model) {
  const svg = root.querySelector('#nutrition-macro-split');
  if (!svg) return;

  const split = model.macroSplit ?? {
    protein_g: model.nutrition.protein_g,
    proteinTarget: model.targets.protein_g,
    fat_g: model.nutrition.fat_g,
    fatCeiling: model.targets.fat_ceiling_g,
    calories: model.nutrition.calories,
    caloriesTarget: model.targets.calories,
    proteinPct: 0,
    fatPct: 0,
    energyPct: 0
  };

  setText(root, '[data-split="protein"]', `${split.protein_g} g / ${split.proteinTarget} g`);
  setText(root, '[data-split="protein-pct"]', `${split.proteinPct}% of protein target`);
  setText(root, '[data-split="fat"]', `${split.fat_g} g / ${split.fatCeiling} g`);
  setText(root, '[data-split="fat-pct"]', `${split.fatPct}% of fat ceiling`);
  setText(root, '[data-split="energy"]', `${split.calories.toLocaleString('en-AU')} / ${split.caloriesTarget.toLocaleString('en-AU')} kcal`);
  setText(root, '[data-split="energy-pct"]', `${split.energyPct}% of energy target`);

  const protein = buildRingTarget(
    { value: split.protein_g, target: split.proteinTarget },
    { size: 96, strokeWidth: 8 }
  );
  const fat = buildRingTarget(
    { value: split.fat_g, target: split.fatCeiling },
    { size: 96, strokeWidth: 8 }
  );
  const fatRadius = protein.radius * 0.72;

  const proteinTrack = svg.querySelector('[data-role="protein-track"]');
  const proteinFill = svg.querySelector('[data-role="protein-fill"]');
  const fatTrack = svg.querySelector('[data-role="fat-track"]');
  const fatFill = svg.querySelector('[data-role="fat-fill"]');

  for (const circle of [proteinTrack, proteinFill]) {
    if (!circle) continue;
    circle.setAttribute('cx', protein.center);
    circle.setAttribute('cy', protein.center);
    circle.setAttribute('r', protein.radius);
    circle.setAttribute('stroke-width', protein.strokeWidth);
  }
  for (const circle of [fatTrack, fatFill]) {
    if (!circle) continue;
    circle.setAttribute('cx', fat.center);
    circle.setAttribute('cy', fat.center);
    circle.setAttribute('r', fatRadius);
    circle.setAttribute('stroke-width', 7);
  }

  const fatCircumference = 2 * Math.PI * fatRadius;
  if (proteinFill) animateRingFill(proteinFill, protein);
  if (fatFill) {
    animateRingFill(fatFill, {
      circumference: fatCircumference,
      dashoffset: fatCircumference * (1 - fat.fraction)
    });
  }
}

function renderWeekCompare(root, week, previousWeek = []) {
  const host = root.querySelector('#nutrition-week-compare');
  if (!host) return;
  const chart = buildColumns(week.map(day => ({
    key: day.date,
    label: weekdayLetter(day.date),
    value: day.protein_g
  })));
  host.replaceChildren();
  for (const bar of chart.bars) {
    const col = root.createElement('div');
    col.className = 'column-bar';
    const fill = root.createElement('span');
    col.append(fill);
    const label = root.createElement('span');
    label.textContent = bar.label;
    col.append(label);
    host.append(col);
    animateColumnGrow(fill, bar.heightPct);
  }
  const priorAvg = previousWeek.length === 0
    ? 0
    : previousWeek.reduce((sum, day) => sum + day.protein_g, 0) / previousWeek.length;
  setText(root, '[data-value="week-compare-prior"]', `Prior week avg ${priorAvg.toFixed(0)} g`);
}
