import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { buildNutritionModel } from '../../apps/life/js/app/nutrition-model.js';
import { renderNutrition } from '../../apps/life/js/app/render-nutrition.js';
import { loadLiveEvents } from '../../apps/life/js/app/load-live-events.js';

const meal = (date, id, time, extras = {}) => ({
  record: { type: 'meal', date, id, time, meal: 'lunch', calories: 320, protein_g: 24.2, fat_g: 7, carbs_g: 40, ...extras },
  body: 'Chicken and rice.\nA full second line of meal detail.'
});
const events = [
  meal('2026-07-23', 'later', '19:00', { meal: 'dinner', sodium_mg: 440, fibre_g: 6, notes: 'Written meal note.' }),
  meal('2026-07-23', 'earlier', '12:00'),
  meal('2026-07-30', 'today', '12:00'),
  meal('2026-07-31', 'future', '12:00')
];
const model = overrides => buildNutritionModel({ events, date: '2026-07-30', ...overrides });

test('historical meals retain complete details, sort by time and use the same records for totals', () => {
  const history = model().mealHistory;
  assert.deepEqual(history.days.map(day => day.date), ['2026-07-23', '2026-07-30']);
  const day = history.days[0];
  assert.deepEqual(day.meals.map(meal => meal.id), ['earlier', 'later']);
  assert.equal(day.meals[1].fibre_g, 6);
  assert.equal(day.meals[1].notes, 'Written meal note.');
  assert.match(day.meals[1].body, /full second line/);
  assert.equal(day.totals.calories, 640);
  assert.equal(day.totals.protein_g, 48.4);
  assert.equal(day.totals.carbs_g, 80);
  assert.equal(day.totals.logged_meal_count, 2);
});

test('unrecorded carbs remain unknown rather than being displayed as zero', () => {
  const window = new Window();
  const doc = window.document;
  doc.body.innerHTML = '<div id="nutrition-meal-history"></div>';
  const missing = model({ events: [meal('2026-07-30', 'missing', null, { carbs_g: undefined })] });
  renderNutrition(doc, missing);
  assert.match(doc.querySelector('.meal-log__macros').textContent, /— g carbs/);
  assert.match(doc.querySelector('.meal-history__totals').textContent, /Carbs— g/);
  window.happyDOM.abort();
});

test('nutrition entry point opens earlier logs, keeps selection and disclosures through repaint, and collapses the day', () => {
  const window = new Window();
  const doc = window.document;
  doc.body.innerHTML = '<div id="nutrition-meal-history"></div>';
  renderNutrition(doc, model());
  doc.querySelector('[aria-label="Previous week of meals"]').click();
  assert.equal(doc.querySelector('#meal-history-date').textContent, 'Thu 23/07/26');
  assert.equal(doc.querySelectorAll('.meal-log__item').length, 2);
  const detail = doc.querySelector('[data-meal-id="later"] button');
  detail.click();
  assert.equal(detail.getAttribute('aria-expanded'), 'true');
  assert.match(doc.querySelector('[data-meal-id="later"] .hub-disclosure__body').textContent, /440 mg/);
  renderNutrition(doc, model({ history: { from: '2020-01-01', loading: false } }));
  assert.equal(doc.querySelector('#meal-history-date').textContent, 'Thu 23/07/26');
  assert.equal(doc.querySelector('[data-meal-id="later"] button'), detail, 'unchanged meals stay mounted');
  assert.equal(detail.getAttribute('aria-expanded'), 'true');
  doc.querySelector('[data-date="2026-07-23"]').click();
  assert.equal(doc.querySelector('#meal-history-day').hidden, true);
  doc.querySelector('[data-date="2026-07-23"]').click();
  assert.equal(doc.querySelector('#meal-history-day').hidden, false);
  assert.equal(detail.getAttribute('aria-expanded'), 'true');
  doc.querySelector('[aria-label="Next week of meals"]').click();
  assert.match(doc.querySelector('#meal-history-date').textContent, /Today/);
  window.happyDOM.abort();
});

test('date jumping, future dates, empty days and history failures have distinct observable states', () => {
  const window = new Window();
  const doc = window.document;
  doc.body.innerHTML = '<div id="nutrition-meal-history"></div>';
  renderNutrition(doc, model({ history: { from: '2026-07-24', loading: true } }));
  const input = doc.querySelector('input[type="date"]');
  input.value = '2026-07-23';
  input.dispatchEvent(new window.Event('change'));
  assert.equal(doc.querySelectorAll('.meal-log__item').length, 2);
  input.value = '2026-07-22';
  input.dispatchEvent(new window.Event('change'));
  assert.match(doc.querySelector('.meal-log__empty').textContent, /Loading meals/);
  renderNutrition(doc, model({ history: { from: '2026-07-24', loading: false, error: true } }));
  assert.match(doc.querySelector('.meal-log__empty').textContent, /unavailable/);
  assert.match(doc.querySelector('[role="status"]').textContent, /could not be loaded/);
  assert.equal(doc.querySelector('[data-date="2026-07-22"] .meal-history__day-count').textContent, '—');
  assert.match(doc.querySelector('[data-date="2026-07-22"]').getAttribute('aria-label'), /history unavailable/);
  renderNutrition(doc, model({ freshness: 'fallback' }));
  assert.match(doc.querySelector('.meal-log__empty').textContent, /unavailable/);
  assert.match(doc.querySelector('[data-date="2026-07-22"]').getAttribute('aria-label'), /history unavailable/);
  renderNutrition(doc, model({ history: { from: '2020-01-01', loading: false } }));
  assert.match(doc.querySelector('.meal-log__empty').textContent, /No meals logged/);
  input.value = '2026-07-31';
  input.dispatchEvent(new window.Event('change'));
  assert.equal(input.value, '2026-07-22');
  doc.querySelector('.meal-history__header > button').click();
  assert.equal(doc.querySelectorAll('.meal-history__day:is(button)').length, 4);
  assert.equal(doc.querySelectorAll('.meal-history__day:is(span)').length, 3);
  window.happyDOM.abort();
});

test('live loading reports the fetched range, settling even when older windows contain no files', async () => {
  const partials = [];
  const result = await loadLiveEvents({ date: '2026-07-30', maxLookbackDays: 40, loadYaml: () => ({}),
    sync: async () => ({ files: [], warnings: [], commitSha: 'same', freshness: 'confirmed' }),
    onPartial: result => partials.push(result.history)
  });
  assert.deepEqual(partials, [{ from: '2026-07-24', loading: true }]);
  assert.deepEqual(result.history, { from: '2026-06-21', loading: false });
});
