import { animateAreaReveal, animateRingFill } from './chart-kit/animate.js';
import { buildAreaLine } from './chart-kit/area-line.js';
import { applyRingTarget } from './chart-kit/apply-ring.js';
import { buildMealProteinPie } from './chart-kit/pie.js';
import { buildRingTarget } from './chart-kit/ring.js';
import { formatDisplayDate } from '../core/time.js';

const setText = (root, selector, value) => {
  const element = root.querySelector(selector);
  if (element) element.textContent = String(value);
};

const weekdayLetter = date => new Intl.DateTimeFormat('en-AU', {
  weekday: 'narrow'
}).format(new Date(`${date}T12:00:00+10:00`));

export function renderNutrition(root, model) {
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

  renderMealProteinPie(root, model.nutrition.meals);

  renderMacroSplit(root, model);
  renderMealsToday(root, model.mealsToday);
  renderMacroRings(root, model);
  const proteinGuide = model.week.find(day => day.proteinTarget > 0)?.proteinTarget ?? model.targets.protein_g;
  const fatGuide = model.week.find(day => day.fatCeiling > 0)?.fatCeiling ?? model.targets.fat_ceiling_g;
  renderNamedAreaChart(root, '#nutrition-protein-chart', model.week, 'protein_g', {
    rollingAverage: 3,
    guideValue: proteinGuide,
    valueLabels: true,
    guideLabel: 'goal',
    rollingLabel: 'avg'
  });
  renderNamedAreaChart(root, '#nutrition-calories-chart', model.week, 'calories', {
    valueLabels: true
  });
  renderNamedAreaChart(root, '#nutrition-fat-chart', model.week, 'fat_g', {
    markOverage: true,
    guideValue: fatGuide,
    valueLabels: true,
    guideLabel: 'ceiling'
  });
  renderNamedAreaChart(root, '#nutrition-carbs-chart', model.week, 'carbs_g', {
    valueLabels: true
  });
  renderHeatmap(root, model.month);
  renderProteinTrend(root, model.proteinTrend);

  const fatOver = Boolean(model.overFatCeiling);
  root.querySelector('#nutrition-dashboard')
    ?.classList?.toggle?.('nutrition--fat-over', fatOver);

  root.querySelector('#nutrition-dashboard')?.removeAttribute('hidden');
}

function renderMacroRings(root, model) {
  const rings = {
    sodium: { value: model.nutrition.sodium_mg, target: model.targets.sodium_ceiling_mg },
    calcium: { value: model.nutrition.calcium_mg, target: model.targets.calcium_target_mg }
  };
  for (const [name, config] of Object.entries(rings)) {
    applyRingTarget(root.querySelector(`[data-nutrition-ring="${name}"]`), config, { size: 56, strokeWidth: 6 });
  }
}

function renderNamedAreaChart(root, selector, series, valueKey, options = {}) {
  const {
    rollingAverage = 0,
    markOverage = false,
    guideValue = null,
    valueLabels = false,
    guideLabel = null,
    rollingLabel = null
  } = options;
  const svg = root.querySelector(selector);
  if (!svg) return;
  const normalized = series.map(day => ({ date: day.date, value: day[valueKey] }));
  const chart = buildAreaLine(normalized, {
    rollingAverage,
    width: 320,
    height: 72,
    padding: 10,
    paddingBottom: 16,
    guideValue
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

  const guide = svg.querySelector('[data-role="guide"]');
  if (guide) {
    if (chart.guideY != null) {
      guide.setAttribute('x1', String(chart.points[0]?.x ?? 10));
      guide.setAttribute('x2', String(chart.points.at(-1)?.x ?? 310));
      guide.setAttribute('y1', String(chart.guideY));
      guide.setAttribute('y2', String(chart.guideY));
      guide.removeAttribute('hidden');
    } else {
      guide.setAttribute('hidden', '');
    }
  }

  const guideLabels = svg.querySelector('[data-role="guide-labels"]');
  if (guideLabels) {
    guideLabels.replaceChildren();
    const lastPoint = chart.points.at(-1);
    if (chart.guideY != null && guideLabel && lastPoint) {
      const text = root.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', String(lastPoint.x));
      text.setAttribute('y', String(Math.max(9, chart.guideY - 4)));
      text.setAttribute('text-anchor', 'end');
      text.setAttribute('class', 'chart-guide-label');
      text.textContent = guideLabel;
      guideLabels.append(text);
    }
    if (rollingLabel && chart.rollingLinePath && lastPoint) {
      let rollingLabelY = Math.max(10, lastPoint.y - 12);
      if (chart.guideY != null && Math.abs(rollingLabelY - chart.guideY) < 6) {
        rollingLabelY = Math.max(10, chart.guideY - 8);
      }
      const text = root.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', String(lastPoint.x));
      text.setAttribute('y', String(rollingLabelY));
      text.setAttribute('text-anchor', 'end');
      text.setAttribute('class', 'chart-guide-label chart-guide-label--avg');
      text.textContent = rollingLabel;
      guideLabels.append(text);
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

  const valueLabelGroup = svg.querySelector('[data-role="value-labels"]');
  if (valueLabelGroup) {
    valueLabelGroup.replaceChildren();
    if (valueLabels) {
      for (const point of chart.points) {
        if (!point.value) continue;
        const text = root.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', point.x);
        text.setAttribute('y', Math.max(9, point.y - 5));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('class', 'chart-value-label');
        text.textContent = String(Math.round(point.value));
        valueLabelGroup.append(text);
      }
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
        dot.setAttribute('r', '3');
        dot.setAttribute('class', 'chart-overage-dot');
        markers.append(dot);
      }
    }
  }

  animateAreaReveal(svg);
}

export function renderMealProteinPie(root, meals) {
  const svg = root.querySelector('#nutrition-meal-protein-pie');
  const slices = svg?.querySelector('[data-role="slices"]');
  const empty = root.querySelector('[data-meal-protein-empty]');
  const legend = root.querySelector('[data-role="meal-protein-legend"]');
  const pie = buildMealProteinPie(meals);

  slices?.replaceChildren();
  legend?.replaceChildren();
  if (pie.empty) {
    svg?.setAttribute('hidden', '');
    empty?.removeAttribute('hidden');
    return;
  }

  svg?.removeAttribute('hidden');
  empty?.setAttribute('hidden', '');
  const sliceNodes = pie.slices.map(slice => {
    const path = root.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', slice.path);
    path.setAttribute('fill', slice.colour);
    path.setAttribute('data-meal', slice.meal);
    return path;
  });
  slices?.replaceChildren(...sliceNodes);

  const legendItems = pie.slices.map(slice => {
    const item = root.createElement('li');
    const swatch = root.createElement('span');
    swatch.className = 'meal-protein-legend__swatch';
    swatch.style.background = slice.colour;
    const label = root.createElement('span');
    label.textContent = `${slice.label} · ${slice.value} g`;
    item.append(swatch, label);
    return item;
  });
  legend?.replaceChildren(...legendItems);
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

function renderHeatmap(root, month) {
  const grid = root.querySelector('#nutrition-heatmap');
  if (!grid) return;
  grid.replaceChildren();
  for (const day of month) {
    const tile = root.createElement('span');
    tile.className = 'heatmap-tile heatmap-tile--protein';
    const pct = Math.max(0, Math.min(100, day.proteinPct ?? 0));
    tile.dataset.pct = String(pct);
    tile.dataset.hit = String(day.hitProtein);
    tile.style?.setProperty?.('--protein-pct', String(pct));
    tile.title = `${formatDisplayDate(day.date)}: ${day.protein_g}g / ${day.proteinTarget}g`;
    tile.textContent = day.protein_g > 0 ? String(Math.round(day.protein_g)) : '';
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

  const advice = root.querySelector('[data-nutrition="advice"]');
  if (advice) {
    const text = String(model.advice ?? '').trim();
    advice.textContent = text || 'Log a meal with Brisket and his notes show up here.';
    advice.classList?.toggle?.('is-empty', !text);
  }

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
