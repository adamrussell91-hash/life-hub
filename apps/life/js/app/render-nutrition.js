import { countUp, playCardMotion } from './chart-kit/animate.js';
import { buildConsistencyStrip } from './chart-kit/consistency-strip.js';
import { renderMealHistory } from './render-meal-history.js';
import { renderNutritionToday } from './render-nutrition-today.js';
import { formatGrams } from '../core/aggregate.js';
import { formatDisplayDate, formatWeekday } from '../core/time.js';

const weekdayLetter = date => new Intl.DateTimeFormat('en-AU', {
  weekday: 'narrow'
}).format(new Date(`${date}T12:00:00+10:00`));

export function renderNutrition(root, model, options = {}) {
  const quiet = options.quiet === true;
  renderNutritionToday(root, model, { quiet, now: options.now });
  renderMealHistory(root, model);
  renderChallengeTrackers(root, model.challenges);
  renderConsistencyStrip(root, model.month, { quiet });

  const dashboard = root.querySelector('#nutrition-dashboard');
  dashboard?.removeAttribute('hidden');
  for (const selector of ['#nutrition-today', '.week-grid-card', '#nutrition-consistency']) {
    playCardMotion(root.querySelector(selector), { quiet });
  }
}

export function renderConsistencyStrip(root, month, options = {}) {
  const host = root.querySelector('#nutrition-consistency-strip');
  if (!host) return;
  const doc = host.ownerDocument ?? root;
  const strip = buildConsistencyStrip(month);
  const plot = doc.createElement('div');
  plot.className = 'consistency-strip__plot';
  const week = doc.createElement('span');
  week.className = 'consistency-strip__week';
  week.setAttribute('aria-hidden', 'true');
  week.textContent = 'this week';
  plot.append(week);
  const labels = doc.createElement('div');
  labels.className = 'consistency-strip__labels';
  labels.setAttribute('aria-hidden', 'true');
  strip.bars.forEach((bar, index) => {
    const node = doc.createElement('span');
    node.className = 'consistency-strip__bar';
    node.dataset.state = bar.state;
    node.dataset.date = bar.date;
    node.style.setProperty('--pct', `${bar.state === 'none' ? 0 : bar.pct}%`);
    node.style.setProperty('--d', `${index * 22}ms`);
    node.style.gridColumn = String(index + 1);
    node.title = `${formatWeekday(bar.date).slice(0, 3)} ${formatDisplayDate(bar.date)}: ${bar.state === 'none'
      ? 'no meals logged'
      : `${formatGrams(bar.protein_g)} g / ${formatGrams(bar.target)} g`}`;
    plot.append(node);
    if (bar.label) {
      const label = doc.createElement('span');
      label.style.gridColumn = String(index + 1);
      label.textContent = formatDisplayDate(bar.date).slice(0, 5);
      labels.append(label);
    }
  });
  if (strip.goalPct != null) {
    const goal = doc.createElement('span');
    goal.className = 'consistency-strip__goal';
    goal.style.setProperty('--pct', `${strip.goalPct}%`);
    goal.setAttribute('aria-hidden', 'true');
    plot.append(goal);
  }
  host.replaceChildren(plot, labels);
  host.setAttribute('aria-label', `Protein target hit on ${strip.hits} of ${strip.days} days; best run ${strip.bestRun} days`);

  const summary = root.querySelector('[data-nutrition="consistency-summary"]');
  if (summary) {
    const count = doc.createElement('strong');
    summary.replaceChildren(count, ` of ${strip.days} days hit · best run ${strip.bestRun} day${strip.bestRun === 1 ? '' : 's'}`);
    countUp(count, strip.hits, { quiet: options.quiet });
  }
}

function renderChallengeTrackers(root, challenges) {
  const section = root.querySelector('#nutrition-challenges');
  const list = root.querySelector('#nutrition-challenge-list');
  if (!section || !list) return;
  list.replaceChildren();
  if (!challenges?.length) {
    section.setAttribute('hidden', '');
    return;
  }
  section.removeAttribute('hidden');
  for (const challenge of challenges) {
    const card = root.createElement('article');
    card.className = 'nutrition-challenge';
    card.dataset.challengeId = challenge.id;

    const heading = root.createElement('div');
    heading.className = 'nutrition-challenge__heading';
    const title = root.createElement('strong');
    title.textContent = challenge.title;
    const tally = root.createElement('span');
    tally.className = 'nutrition-challenge__tally';
    tally.textContent = `${challenge.tally.clean} clean · ${challenge.tally.miss} miss · ${challenge.tally.pending} left`;
    heading.append(title, tally);

    const rule = root.createElement('p');
    rule.className = 'nutrition-challenge__rule';
    rule.textContent = challenge.rule;

    const days = root.createElement('ol');
    days.className = 'nutrition-challenge__days';
    for (const day of challenge.days) {
      const item = root.createElement('li');
      item.className = 'nutrition-challenge__day';
      item.dataset.result = day.result;
      if (day.isToday) item.dataset.today = 'true';
      const mark = root.createElement('span');
      mark.className = 'nutrition-challenge__mark';
      mark.textContent = day.result === 'clean' ? '✓' : day.result === 'miss' ? '✗' : '·';
      const label = root.createElement('span');
      label.className = 'nutrition-challenge__day-label';
      label.textContent = weekdayLetter(day.date);
      item.title = day.note
        ? `${formatDisplayDate(day.date)}: ${day.result} — ${day.note}`
        : `${formatDisplayDate(day.date)}: ${day.result}`;
      item.append(mark, label);
      days.append(item);
    }

    card.append(heading, rule, days);
    list.append(card);
  }
}
