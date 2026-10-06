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

test('nutrition entry point opens earlier logs, keeps selection and disclosures through repaint, and keeps the chosen day open', () => {
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
  assert.equal(doc.querySelector('#meal-history-day').hidden, false, 'choosing the open day again never collapses it');
  assert.equal(doc.querySelector('[data-date="2026-07-23"]').getAttribute('aria-pressed'), 'true');
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
  assert.equal(doc.querySelector('[data-date="2026-07-22"] .week-grid__count').textContent, '');
  assert.ok([...doc.querySelectorAll('[data-date="2026-07-22"] .week-grid__value')].every(value => value.textContent === '—'));
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
  assert.equal(doc.querySelectorAll('.week-grid__day:not([disabled])').length, 4);
  assert.equal(doc.querySelectorAll('.week-grid__day[data-future="true"][disabled]').length, 3);
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

test('the week grid draws each logged day against its own targets and stubs empty days', () => {
  const window = new Window();
  const doc = window.document;
  doc.body.innerHTML = '<div id="nutrition-meal-history"></div><div id="nutrition-meal-day"></div>';
  const targetsConfig = {
    target_sets: [{
      valid_from: '2020-01-01',
      calories: { movement: 1660, workout_30: 1900, workout_45_60: 2200, recovery_bonus: 200 },
      protein: { daily: 20, recovery_daily: 20, breakfast: 30, lunch: 30, dinner: 40, snack: 20, min_per_meal: 25 },
      fat_ceiling_g: 5,
      sodium_ceiling_mg: 2000,
      calcium_target_mg: 1000,
      polyphenol_daily_aim: 10
    }]
  };
  renderNutrition(doc, model({ targetsConfig, history: { from: '2020-01-01', loading: false } }));
  const today = doc.querySelector('[data-date="2026-07-30"]');
  const bar = row => today.querySelector(`.week-grid__cell[data-row="${row}"] .week-grid__bar`);
  assert.equal(bar('protein').dataset.state, 'hit');
  assert.equal(bar('fat').dataset.state, 'over');
  assert.equal(bar('carbs').dataset.state, 'neutral');
  assert.match(today.getAttribute('aria-label'), /Protein 24\.2 g, Fat 7 g, Energy 320 kcal, Carbs 40 g/);
  const empty = doc.querySelector('[data-date="2026-07-28"]');
  assert.equal(empty.querySelector('.week-grid__bar').dataset.state, 'none');
  assert.equal(empty.querySelector('.week-grid__value').textContent, '—');
  assert.equal(doc.querySelector('.week-grid__row-label[data-row="protein"] .week-grid__summary').textContent, 'hit 1/7');
  assert.equal(doc.querySelector('.week-grid__row-label[data-row="fat"] .week-grid__summary').textContent, 'over 1/7');
  assert.ok(doc.querySelector('#nutrition-meal-day #meal-history-day'), 'the day panel lives in its own card');
  assert.ok(!doc.querySelector('#nutrition-meal-history #meal-history-day'));
  window.happyDOM.abort();
});
