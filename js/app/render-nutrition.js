import { buildProteinLineChart } from './nutrition-charts.js';

const setText = (root, selector, value) => {
  const element = root.querySelector(selector);
  if (element) element.textContent = String(value);
};

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
  setText(root, '[data-target="nutrition-polyphenol"]', `/ ${model.targets.polyphenol_daily_aim}`);

  for (const [meal, values] of Object.entries(model.nutrition.meals)) {
    setText(root, `[data-meal-protein="${meal}"]`, `${values.protein_g} g`);
  }

  renderProteinChart(root, model.week);
  renderHitStrip(root, model.week);
  renderHeatmap(root, model.month);
  renderProteinTrend(root, model.proteinTrend);

  root.querySelector('#nutrition-dashboard')?.removeAttribute('hidden');
}

function renderProteinChart(root, week) {
  const svg = root.querySelector('#nutrition-protein-chart');
  if (!svg) return;
  const chart = buildProteinLineChart(week);
  svg.setAttribute('viewBox', `0 0 ${chart.width} ${chart.height}`);

  const line = svg.querySelector('[data-role="line"]');
  if (line) line.setAttribute('points', chart.linePoints);

  const area = svg.querySelector('[data-role="area"]');
  if (area) area.setAttribute('points', chart.areaPoints);

  const dot = svg.querySelector('[data-role="last-point"]');
  if (dot) {
    if (chart.last) {
      dot.setAttribute('cx', chart.last.x);
      dot.setAttribute('cy', chart.last.y);
      dot.removeAttribute('hidden');
    } else {
      dot.setAttribute('hidden', '');
    }
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
