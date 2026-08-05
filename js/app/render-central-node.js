import { animateAreaReveal, animateRingFill } from './chart-kit/animate.js';
import { buildCompletionRing } from './central-node-charts.js';
import { buildProteinLineChart } from './nutrition-charts.js';
import { renderInlineMarkdown } from './render-chat.js';

const SECTION_SELECTORS = {
  todaysStatus: '[data-central-node="todays-status"]',
  thisWeek: '[data-central-node="this-week"]',
  thisMonth: '[data-central-node="this-month"]',
  longTermTrends: '[data-central-node="long-term-trends"]',
  crossAgentCoordination: '[data-central-node="cross-agent"]',
  recentAgentActions: '[data-central-node="recent-actions"]',
  constraints: '[data-central-node="constraints"]'
};

const setText = (root, selector, value) => {
  const element = root.querySelector(selector);
  if (element) element.textContent = String(value);
};

export function renderCentralNode(root, model) {
  for (const [key, selector] of Object.entries(SECTION_SELECTORS)) {
    const container = root.querySelector(selector);
    if (!container) continue;
    if (key === 'todaysStatus') {
      const prose = model.sections.todaysStatus?.trim();
      if (prose) renderInlineMarkdown(root, container, prose, { multiline: true });
      else container.textContent = 'No agent notes yet.';
      continue;
    }
    if (key === 'thisWeek') {
      const prose = model.sections.thisWeek?.trim();
      if (prose) {
        renderInlineMarkdown(root, container, prose, { multiline: true });
        container.removeAttribute('hidden');
      } else {
        container.textContent = '';
        container.setAttribute('hidden', '');
      }
      continue;
    }
    renderInlineMarkdown(root, container, model.sections[key], { multiline: true });
  }

  renderLiveStatus(root, model.liveStatus);
  renderCompletionRing(root, model.completeness);
  renderWeekChart(root, model.week);
  renderHeatmap(root, '#central-node-logging-heatmap', model.loggingMonth, day => day.complete);
  renderHeatmap(root, '#central-node-exercise-heatmap', model.exerciseMonth, day => day.completed);
  renderHeatmap(root, '#central-node-eating-heatmap', model.eatingMonth, day => day.hitEatingTargets);

  root.querySelector('#central-node-dashboard')?.removeAttribute('hidden');
}

function renderLiveStatus(root, liveStatus) {
  if (!liveStatus) return;
  const { completeness, snapshot } = liveStatus;
  for (const key of ['nutrition', 'fitness', 'diary', 'body', 'skincare']) {
    const item = root.querySelector(`[data-live-complete="${key}"]`);
    if (item) item.dataset.checked = String(Boolean(completeness[key]));
  }
  setText(
    root,
    '[data-live-snapshot]',
    `Protein ${snapshot.protein_g} g · Energy ${snapshot.calories.toLocaleString('en-AU')} kcal · Fat ${snapshot.fat_g} g`
  );
}

function renderCompletionRing(root, completeness) {
  const svg = root.querySelector('#central-node-completion-ring');
  if (!svg) return;
  const ring = buildCompletionRing(completeness, { size: 72, strokeWidth: 8 });

  let fill = null;
  for (const role of ['track', 'fill']) {
    const circle = svg.querySelector(`[data-role="${role}"]`);
    if (!circle) continue;
    circle.setAttribute('cx', ring.center);
    circle.setAttribute('cy', ring.center);
    circle.setAttribute('r', ring.radius);
    circle.setAttribute('stroke-width', ring.strokeWidth);
    if (role === 'fill') fill = circle;
  }

  if (fill) animateRingFill(fill, ring);

  setText(root, '[data-value="completion-ring-label"]', `${completeness.complete} of ${completeness.total}`);
}

function renderWeekChart(root, week) {
  const svg = root.querySelector('#central-node-week-chart');
  if (!svg) return;
  const chart = buildProteinLineChart(week, { rollingAverage: 3 });
  svg.setAttribute('viewBox', `0 0 ${chart.width} ${chart.height}`);

  const line = svg.querySelector('[data-role="line"]');
  if (line) {
    if (line.tagName.toLowerCase() === 'path') line.setAttribute('d', chart.linePath);
    else line.setAttribute('points', chart.linePoints);
  }

  const area = svg.querySelector('[data-role="area"]');
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
      text.setAttribute('y', chart.height - 8);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('class', 'chart-day-label');
      text.textContent = new Intl.DateTimeFormat('en-AU', { weekday: 'narrow' })
        .format(new Date(`${day.date}T12:00:00+10:00`));
      labels.append(text);
    }
  }

  animateAreaReveal(svg);
}

function renderHeatmap(root, selector, series, hit) {
  const grid = root.querySelector(selector);
  if (!grid) return;
  grid.replaceChildren();
  for (const day of series) {
    const tile = root.createElement('span');
    tile.className = 'heatmap-tile';
    tile.dataset.hit = String(hit(day));
    tile.title = day.date;
    grid.append(tile);
  }
}
