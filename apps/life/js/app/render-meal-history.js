import { createDisclosureCard } from '../../../../packages/design-kit/js/hub-surfaces.js';
import { runMorphTransform } from '../../../../packages/design-kit/js/morphing-dialog.js';
import { buildWeekGrid, WEEK_GRID_ROWS } from './chart-kit/week-grid.js';
import { addCalendarDays, enumerateDateKeys, formatDisplayDate, isCalendarDate } from '../core/time.js';
import { formatGrams } from '../core/aggregate.js';
import { MAX_LOOKBACK_DAYS } from './load-live-events.js';

const views = new WeakMap();
const weekday = date => new Intl.DateTimeFormat('en-AU', {
  weekday: 'short', timeZone: 'UTC'
}).format(new Date(`${date}T12:00:00Z`));
const monday = date => addCalendarDays(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7));
const category = meal => meal ? meal[0].toUpperCase() + meal.slice(1) : 'Meal';
const number = value => Number.isFinite(value) ? formatGrams(value) : '—';
const cellValue = (value, unit) => (unit === 'kcal' ? String(Math.round(value)) : formatGrams(value));
const TREND_ARROW = { up: '↑', down: '↓', flat: '→' };

export function renderMealHistory(root, model) {
  const host = root.querySelector('#nutrition-meal-history');
  if (!host) return;
  let view = views.get(host);
  if (!view) {
    view = mountHistory(host, root.querySelector('#nutrition-meal-day') ?? host, model.date);
    views.set(host, view);
  }
  view.model = model;
  // Follow the Sydney day rollover only while the person is viewing today.
  if (view.selected === view.today) view.selected = model.date;
  view.today = model.date;
  view.paint();
}

function mountHistory(host, dayHost, today) {
  const doc = host.ownerDocument;
  const node = (tag, className, text) => {
    const el = doc.createElement(tag);
    el.className = className;
    if (text != null) el.textContent = text;
    return el;
  };
  const view = { today, selected: today, openMeals: new Set(), model: null };
  const header = node('div', 'meal-history__header');
  const title = node('h2', 'meal-history__title', 'Macros by day');
  title.id = 'meal-log-label';
  const titleGroup = node('div', 'meal-history__title-group');
  titleGroup.append(title);
  const todayButton = node('button', 'btn btn--ghost', 'Today');
  todayButton.type = 'button';
  const picker = node('label', 'meal-history__picker');
  picker.title = 'Choose a date';
  const input = node('input', 'meal-history__date');
  input.type = 'date';
  input.setAttribute('aria-label', 'Jump to meal date');
  picker.append(input);
  const navigation = node('div', 'meal-history__navigation');
  const range = node('span', 'meal-history__range');
  const navButton = (label, glyph) => {
    const button = node('button', 'hub-icon-btn meal-history__arrow', glyph);
    button.type = 'button';
    button.setAttribute('aria-label', label);
    return button;
  };
  const previous = navButton('Previous week of meals', '‹');
  const next = navButton('Next week of meals', '›');
  picker.prepend(range);
  navigation.append(previous, picker, next);
  header.append(titleGroup, navigation, todayButton);

  // Week grid: a label column plus seven day columns. Each column is one button
  // (the whole column is the hit area) and its nodes persist across paints so bar
  // heights morph between weeks instead of being rebuilt.
  const grid = node('div', 'week-grid');
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', 'Meal history days');
  const labels = node('div', 'week-grid__labels');
  labels.setAttribute('aria-hidden', 'true');
  labels.append(node('span', 'week-grid__corner'));
  const rowLabels = WEEK_GRID_ROWS.map(row => {
    const cell = node('div', 'week-grid__row-label');
    cell.dataset.row = row.key;
    const summary = node('span', 'week-grid__summary');
    cell.append(node('strong', '', row.label), summary);
    let trend = null;
    if (row.key === 'protein') {
      trend = node('span', 'week-grid__trend');
      cell.append(trend);
    }
    labels.append(cell);
    return { summary, trend };
  });
  grid.append(labels);
  const columns = Array.from({ length: 7 }, (_, col) => {
    const button = node('button', 'week-grid__day');
    button.type = 'button';
    const head = node('span', 'week-grid__head');
    const name = node('span', 'week-grid__weekday');
    const date = node('span', 'week-grid__date');
    const num = node('span', 'week-grid__num');
    const count = node('span', 'week-grid__count');
    date.append(num, count);
    head.append(name, date);
    button.append(head);
    const cells = WEEK_GRID_ROWS.map((row, rowIndex) => {
      const cell = node('span', 'week-grid__cell');
      cell.dataset.row = row.key;
      const plot = node('span', 'week-grid__plot');
      const target = node('span', 'week-grid__target');
      const bar = node('span', 'week-grid__bar');
      const value = node('span', 'week-grid__value');
      const delay = `${col * 45 + rowIndex * 70}ms`;
      for (const el of [target, bar, value]) el.style.setProperty('--d', delay);
      plot.append(target, bar, value);
      cell.append(plot);
      button.append(cell);
      return { target, bar, value };
    });
    button.addEventListener('click', () => {
      if (!button.disabled) select(button.dataset.date);
    });
    grid.append(button);
    return { button, name, num, count, cells };
  });
  const key = node('p', 'week-grid__key');
  key.setAttribute('aria-hidden', 'true');
  for (const [colour, text] of [
    ['var(--success)', 'hit goal / under ceiling / within 10% of energy'],
    ['var(--wave)', 'under goal'],
    ['var(--danger)', 'over fat ceiling'],
    [null, 'dashed line = target · choose a day to see its meals']
  ]) {
    const item = node('span', '');
    if (colour) {
      const swatch = node('i', '');
      swatch.style.background = colour;
      item.append(swatch);
    }
    item.append(text);
    key.append(item);
  }
  const status = node('p', 'meal-history__status');
  status.setAttribute('role', 'status');

  const panel = node('section', 'meal-history__panel');
  panel.id = 'meal-history-day';
  const heading = node('div', 'meal-history__day-heading');
  const dayTitle = node('h3', 'meal-history__day-title');
  dayTitle.id = 'meal-history-date';
  const mealCount = node('span', 'meal-history__count');
  heading.append(dayTitle, mealCount);
  panel.setAttribute('aria-labelledby', dayTitle.id);
  const totals = node('dl', 'meal-history__totals');
  totals.setAttribute('aria-label', 'Logged daily totals');
  const empty = node('p', 'meal-log__empty');
  empty.dataset.nutrition = 'meal-log-empty';
  const list = node('ul', 'meal-log');
  list.id = 'nutrition-meal-log';
  panel.append(totals, empty, list);
  host.append(header, grid, key, status);
  if (dayHost === host) host.append(heading, panel);
  else dayHost.append(heading, panel);

  const select = date => {
    if (!isCalendarDate(date) || date > view.today || date < input.min) return;
    if (date === view.selected) return;
    runMorphTransform({ from: dayHost, update: () => {
      view.selected = date;
      view.paint();
    } });
  };
  todayButton.addEventListener('click', () => select(view.today));
  input.addEventListener('change', () => {
    if (input.validity.valid) select(input.value);
    input.value = view.selected;
  });
  previous.addEventListener('click', () => select(addCalendarDays(view.selected, -7)));
  next.addEventListener('click', () => select(addCalendarDays(view.selected, 7) > view.today
    ? view.today : addCalendarDays(view.selected, 7)));

  function paintMeals(meals) {
    const signature = JSON.stringify(meals);
    if (view.mealSignature === signature) return;
    view.mealSignature = signature;
    const focused = doc.activeElement?.closest('[data-meal-id]')?.dataset.mealId;
    const open = new Set(view.openMeals);
    for (const meal of list.querySelectorAll('[data-meal-id]')) {
      if (meal.querySelector('button')?.getAttribute('aria-expanded') === 'true') open.add(meal.dataset.mealId);
      else open.delete(meal.dataset.mealId);
    }
    view.openMeals = open;
    list.replaceChildren();
    for (const meal of meals) {
      const item = node('li', 'meal-log__item');
      item.dataset.mealId = meal.id;
      item.dataset.meal = meal.meal;
      const disclosure = createDisclosureCard({ root: doc, className: 'meal-history__meal' });
      const top = node('span', 'meal-history__meal-heading');
      top.append(node('span', 'meal-history__category', category(meal.meal)));
      if (meal.time) top.append(node('span', 'meal-history__time', meal.time));
      const cue = node('span', 'meal-history__cue');
      cue.setAttribute('aria-hidden', 'true');
      cue.append(node('span', 'meal-history__chevron', '⌄'));
      const food = node('span', 'meal-history__food', meal.summary);
      const macros = node('span', 'meal-log__macros',
        `${number(meal.calories)} kcal · ${number(meal.protein_g)} g protein · ${number(meal.carbs_g)} g carbs · ${number(meal.fat_g)} g fat`);
      const energy = node('span', 'meal-history__energy', `${number(meal.calories)} kcal`);
      disclosure.trigger.replaceChildren(top, food, energy, cue);
      disclosure.trigger.title = meal.summary;
      disclosure.body.id = `meal-history-detail-${encodeURIComponent(meal.id)}`;
      disclosure.trigger.setAttribute('aria-controls', disclosure.body.id);
      disclosure.body.replaceChildren();
      disclosure.body.append(node('p', 'meal-history__full-food', meal.body || meal.summary), macros);
      if (meal.notes && meal.notes !== meal.body && meal.notes !== meal.summary) {
        disclosure.body.append(node('p', 'meal-history__notes', meal.notes));
      }
      const nutrients = node('dl', 'meal-history__nutrients');
      for (const [field, label, unit] of [
        ['fibre_g', 'Fibre', 'g'], ['sugar_g', 'Sugar', 'g'],
        ['saturated_fat_g', 'Saturated fat', 'g'], ['unsaturated_fat_g', 'Unsaturated fat', 'g'],
        ['sodium_mg', 'Sodium', 'mg'], ['calcium_mg', 'Calcium', 'mg'],
        ['polyphenol_score', 'Polyphenols', ''], ['omega3', 'Omega-3', '']
      ]) {
        if (meal[field] == null) continue;
        const cell = node('div', 'meal-history__nutrient');
        cell.append(node('dt', '', label), node('dd', '', `${typeof meal[field] === 'number' ? number(meal[field]) : meal[field]}${unit ? ` ${unit}` : ''}`));
        nutrients.append(cell);
      }
      disclosure.body.append(nutrients);
      if (!nutrients.children.length && !disclosure.body.querySelector('p')) {
        disclosure.body.append(node('p', 'meal-history__notes', 'No additional details recorded.'));
      }
      disclosure.trigger.addEventListener('click', () => {
        if (disclosure.body.hidden) view.openMeals.delete(meal.id);
        else view.openMeals.add(meal.id);
      });
      if (view.openMeals.has(meal.id)) disclosure.open();
      item.append(disclosure.el);
      list.append(item);
      if (focused === meal.id) disclosure.trigger.focus({ preventScroll: true });
    }
  }

  view.paint = () => {
    const history = view.model.mealHistory;
    const days = new Map(history.days.map(day => [day.date, day]));
    const outsideRange = date => history.from ? date < history.from : view.model.freshness === 'fallback';
    const start = monday(view.selected);
    const end = addCalendarDays(start, 6);
    input.min = addCalendarDays(view.today, -(MAX_LOOKBACK_DAYS - 1));
    input.max = view.today;
    input.value = view.selected;
    previous.hidden = addCalendarDays(view.selected, -7) < input.min;
    next.hidden = end >= view.today;
    range.textContent = `${formatDisplayDate(start)} – ${formatDisplayDate(end)}`;

    const dates = enumerateDateKeys(start, end);
    const entries = dates.map(date => {
      const day = days.get(date);
      return {
        date,
        logged: Boolean(day?.meals.length),
        // Unknown carbs stay unknown in the grid rather than drawing a partial sum.
        totals: day ? { ...day.totals, carbs_g: day.carbsKnown ? day.totals.carbs_g : NaN } : {},
        targets: day?.targets ?? {}
      };
    });
    const rows = buildWeekGrid(entries);
    rows.forEach((row, rowIndex) => {
      const label = rowLabels[rowIndex];
      label.summary.textContent = row.summary.text;
      label.summary.dataset.tone = row.summary.tone;
    });
    const trend = view.model.proteinTrend;
    const trendLabel = rowLabels[0].trend;
    if (trendLabel) {
      const showTrend = trend && trend.delta != null && start <= view.today && view.today <= end;
      trendLabel.hidden = !showTrend;
      trendLabel.textContent = showTrend ? `${TREND_ARROW[trend.direction] ?? ''} ${trend.label} vs last wk`.trim() : '';
      trendLabel.dataset.colour = trend?.colour ?? 'neutral';
    }

    dates.forEach((date, col) => {
      const day = days.get(date);
      const count = day?.meals.length ?? 0;
      const future = date > view.today;
      const loading = !day && history.loading && outsideRange(date);
      const unavailable = !day && !loading && outsideRange(date);
      const column = columns[col];
      const { button } = column;
      button.dataset.date = date;
      button.dataset.logged = String(count > 0);
      button.dataset.today = String(date === view.today);
      button.dataset.selected = String(date === view.selected);
      button.dataset.future = String(future);
      button.disabled = future;
      column.name.textContent = weekday(date);
      column.num.textContent = String(Number(date.slice(-2)));
      column.count.textContent = future || unavailable ? '' : loading ? ' · …' : ` · ${count}`;
      const label = `${weekday(date)} ${formatDisplayDate(date)}${date === view.today ? ', today' : ''}, ${future ? 'future date' : loading ? 'loading meals' : unavailable ? 'history unavailable' : `${count} meal${count === 1 ? '' : 's'}`}`;
      const facts = rows
        .filter(row => row.cells[col].logged)
        .map(row => `${row.label} ${cellValue(row.cells[col].value, row.unit)}${row.unit === 'kcal' ? ' kcal' : ` ${row.unit}`}`);
      button.setAttribute('aria-label', facts.length ? `${label}: ${facts.join(', ')}` : label);
      button.title = button.getAttribute('aria-label');
      button.setAttribute('aria-pressed', String(date === view.selected));
      button.setAttribute('aria-controls', panel.id);
      rows.forEach((row, rowIndex) => {
        const cell = row.cells[col];
        const { target, bar, value } = column.cells[rowIndex];
        bar.dataset.state = cell.state;
        bar.style.setProperty('--pct', `${cell.pct}%`);
        value.style.setProperty('--pct', `${cell.pct}%`);
        value.textContent = cell.logged ? cellValue(cell.value, row.unit)
          : loading ? '…' : future ? '' : '—';
        const targetPct = cell.target > 0 ? (cell.target / row.max) * 100 : null;
        target.hidden = targetPct == null;
        if (targetPct != null) target.style.setProperty('--target', `${targetPct}%`);
      });
    });

    const day = days.get(view.selected);
    const meals = day?.meals ?? [];
    const outside = !day && outsideRange(view.selected);
    const loading = outside && history.loading;
    status.textContent = history.error ? 'Earlier history could not be loaded. Use Refresh to try again.'
      : view.model.freshness === 'fallback' ? 'Showing saved meal records. Refresh to check for updates.'
      : history.loading ? 'Loading earlier meal history…' : '';
    status.hidden = !status.textContent;
    dayTitle.textContent = `${view.selected === view.today ? 'Today · ' : ''}${weekday(view.selected)} ${formatDisplayDate(view.selected)}`;
    mealCount.textContent = `${meals.length} meal${meals.length === 1 ? '' : 's'} logged`;
    mealCount.hidden = !meals.length;
    totals.hidden = !meals.length;
    totals.replaceChildren();
    if (day) {
      for (const [label, value, unit] of [
        ['Energy', day.totals.calories, 'kcal'], ['Protein', day.totals.protein_g, 'g'],
        ['Carbs', day.carbsKnown ? day.totals.carbs_g : null, 'g'], ['Fat', day.totals.fat_g, 'g']
      ]) {
        const cell = node('div', 'meal-history__total');
        cell.append(node('dt', '', label), node('dd', '', `${number(value)} ${unit}`));
        totals.append(cell);
      }
    }
    empty.hidden = meals.length > 0;
    empty.textContent = loading ? 'Loading meals for this day…'
      : outside ? 'Meal history for this day is unavailable. Refresh to try again.'
      : `No meals logged for ${view.selected === view.today ? 'today' : 'this day'}. Choose another day to browse your logs.`;
    paintMeals(meals);
  };
  return view;
}
