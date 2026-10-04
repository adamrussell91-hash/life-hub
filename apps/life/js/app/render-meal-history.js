import { createDisclosureCard } from '../../../../packages/design-kit/js/hub-surfaces.js';
import { runMorphTransform } from '../../../../packages/design-kit/js/morphing-dialog.js';
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

export function renderMealHistory(root, model) {
  const host = root.querySelector('#nutrition-meal-history');
  if (!host) return;
  let view = views.get(host);
  if (!view) {
    view = mountHistory(host, model.date);
    views.set(host, view);
  }
  view.model = model;
  // Follow the Sydney day rollover only while the person is viewing today.
  if (view.selected === view.today) view.selected = model.date;
  view.today = model.date;
  view.paint();
}

function mountHistory(host, today) {
  const doc = host.ownerDocument;
  const node = (tag, className, text) => {
    const el = doc.createElement(tag);
    el.className = className;
    if (text != null) el.textContent = text;
    return el;
  };
  const view = { today, selected: today, expanded: false, openMeals: new Set(), model: null };
  const header = node('div', 'meal-history__header');
  const title = node('h2', 'meal-history__title', 'Meal history');
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
  const strip = node('div', 'meal-history__strip');
  strip.setAttribute('role', 'group');
  strip.setAttribute('aria-label', 'Meal history days');
  strip.title = 'Meal counts are shown beside each date.';
  const status = node('p', 'meal-history__status');
  status.setAttribute('role', 'status');
  const panel = node('section', 'meal-history__panel');
  panel.id = 'meal-history-day';
  const heading = node('div', 'meal-history__day-heading');
  const dayTitle = node('h3', 'meal-history__day-title');
  dayTitle.id = 'meal-history-date';
  const mealCount = node('span', 'meal-history__count');
  const expand = node('button', 'btn btn--ghost meal-history__expand', 'View meals');
  expand.type = 'button';
  expand.setAttribute('aria-controls', panel.id);
  heading.append(dayTitle, mealCount, expand);
  panel.setAttribute('aria-labelledby', dayTitle.id);
  const totals = node('dl', 'meal-history__totals');
  totals.setAttribute('aria-label', 'Logged daily totals');
  const empty = node('p', 'meal-log__empty');
  empty.dataset.nutrition = 'meal-log-empty';
  const list = node('ul', 'meal-log');
  list.id = 'nutrition-meal-log';
  panel.append(totals, empty, list);
  host.append(header, strip, status, heading, panel);

  const select = (date, toggle = false) => {
    if (!isCalendarDate(date) || date > view.today || date < input.min) return;
    const expanded = toggle && date === view.selected ? !view.expanded : true;
    runMorphTransform({ from: host, update: () => {
      view.selected = date;
      view.expanded = expanded;
      view.paint();
    } });
  };
  todayButton.addEventListener('click', () => select(view.today));
  expand.addEventListener('click', () => select(view.selected, true));
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
    const active = doc.activeElement?.dataset?.date;
    strip.replaceChildren();
    for (const date of enumerateDateKeys(start, end)) {
      const day = days.get(date);
      const count = day?.meals.length ?? 0;
      const future = date > view.today;
      const loading = !day && history.loading && outsideRange(date);
      const unavailable = !day && !loading && outsideRange(date);
      const button = node(future ? 'span' : 'button', 'meal-history__day');
      button.dataset.date = date;
      button.dataset.logged = String(count > 0);
      button.dataset.today = String(date === view.today);
      button.dataset.selected = String(date === view.selected);
      button.append(node('span', 'meal-history__weekday', weekday(date)),
        node('span', 'meal-history__day-number', String(Number(date.slice(-2)))),
        node('span', 'meal-history__day-count', future || unavailable ? '—' : loading ? '…' : String(count)));
      button.setAttribute('aria-label', `${weekday(date)} ${formatDisplayDate(date)}${date === view.today ? ', today' : ''}, ${future ? 'future date' : loading ? 'loading meals' : unavailable ? 'history unavailable' : `${count} meal${count === 1 ? '' : 's'}`}`);
      button.title = button.getAttribute('aria-label');
      if (!future) {
        button.type = 'button';
        button.setAttribute('aria-pressed', String(date === view.selected));
        button.setAttribute('aria-expanded', String(date === view.selected && view.expanded));
        button.setAttribute('aria-controls', panel.id);
        button.addEventListener('click', () => select(date, true));
      }
      strip.append(button);
      if (active === date && !future) button.focus({ preventScroll: true });
    }
    const day = days.get(view.selected);
    const meals = day?.meals ?? [];
    const outside = !day && outsideRange(view.selected);
    const loading = outside && history.loading;
    status.textContent = history.error ? 'Earlier history could not be loaded. Use Refresh to try again.'
      : view.model.freshness === 'fallback' ? 'Showing saved meal records. Refresh to check for updates.'
      : history.loading ? 'Loading earlier meal history…' : '';
    status.hidden = !status.textContent;
    panel.hidden = !view.expanded;
    heading.hidden = !view.expanded;
    expand.textContent = view.expanded ? 'Hide meals' : 'View meals';
    expand.setAttribute('aria-expanded', String(view.expanded));
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
