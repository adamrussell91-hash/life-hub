import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { buildNutritionModel } from '../../apps/life/js/app/nutrition-model.js';
import { renderNutrition } from '../../apps/life/js/app/render-nutrition.js';

const targetsConfig = {
  target_sets: [{
    valid_from: '2020-01-01',
    calories: { movement: 2200, workout_30: 2200, workout_45_60: 2200, recovery_bonus: 0 },
    protein: { daily: 120, recovery_daily: 120, breakfast: 30, lunch: 30, dinner: 40, snack: 20, min_per_meal: 25 },
    fat_ceiling_g: 50,
    sodium_ceiling_mg: 2000,
    calcium_target_mg: 1000,
    polyphenol_daily_aim: 10
  }]
};
const meal = (date, meal, time, protein_g, extras = {}) => ({
  record: { type: 'meal', date, id: `${date}-${meal}`, meal, time, calories: 500, protein_g, fat_g: 15, carbs_g: 40, sodium_mg: 1400, calcium_mg: 45, polyphenol_score: 3, ...extras },
  body: `${meal} plate`
});
const events = [
  meal('2026-10-04', 'lunch', '12:30', 22, { notes: 'Cup noodle: sodium heavy, protein thin.' }),
  meal('2026-10-04', 'snack', undefined, 8.4),
  meal('2026-10-01', 'lunch', '12:00', 140),
  meal('2026-10-02', 'lunch', '12:00', 100)
];

function mount() {
  const window = new Window();
  const doc = window.document;
  doc.body.innerHTML = `
    <section id="nutrition-dashboard" hidden>
      <article id="nutrition-today"><p id="nutrition-today-label"></p>
        <svg id="nutrition-rings"></svg><ul id="nutrition-ring-legend"></ul><div id="nutrition-ring-chips"></div>
        <p data-nutrition="climb-subtitle"></p><div class="plot"><svg id="nutrition-climb"></svg><p data-nutrition="climb-empty" hidden></p></div>
        <span data-nutrition="advice"></span></article>
      <article class="week-grid-card"><div id="nutrition-meal-history"></div></article>
      <article><div id="nutrition-meal-day"></div></article>
      <article id="nutrition-consistency"><p data-nutrition="consistency-summary"></p><div id="nutrition-consistency-strip"></div></article>
    </section>`;
  return { window, doc };
}

const model = date => buildNutritionModel({ events, targetsConfig, date });
const now = new Date('2026-10-04T20:06:00+11:00');

test('rings legend reads every macro against its target and flags sodium over its ceiling', () => {
  const { window, doc } = mount();
  renderNutrition(doc, model('2026-10-04'), { quiet: true, now });
  const legend = [...doc.querySelectorAll('#nutrition-ring-legend li')];
  assert.deepEqual(legend.map(item => item.dataset.ring), ['protein', 'energy', 'fat', 'sodium']);
  assert.equal(legend[0].querySelector('.nutrition-rings__amount').textContent, '30.4 / 120 g');
  assert.equal(legend[2].querySelector('.nutrition-rings__amount').textContent, '30 / 50 g ceiling');
  assert.equal(legend[3].querySelector('.nutrition-rings__flag').textContent, 'over 40%');
  assert.equal(doc.querySelectorAll('#nutrition-rings .nutrition-ring__over').length, 1);
  assert.equal(doc.querySelector('.nutrition-rings__value').textContent, '90');
  assert.match(doc.querySelector('#nutrition-rings').getAttribute('aria-label'), /Sodium 2,800 \/ 2,000 mg ceiling, 40% over/);
  assert.equal(doc.querySelector('#nutrition-today-label').textContent, 'Today · Sun 04/10/26');
  assert.match(doc.querySelector('#nutrition-ring-chips').textContent, /Calcium 90 \/ 1,000 mg/);
  assert.equal(doc.querySelector('[data-nutrition="advice"]').textContent, 'Cup noodle: sodium heavy, protein thin.');
  window.happyDOM.abort();
});

test('today’s climb has a now marker, a projection to the goal and an estimated snack time', () => {
  const { window, doc } = mount();
  renderNutrition(doc, model('2026-10-04'), { quiet: true, now });
  const climb = doc.querySelector('#nutrition-climb');
  assert.ok(climb.querySelector('[data-role="climb-line"]').getAttribute('d').startsWith('M'));
  assert.equal(climb.querySelector('.climb-now-label').textContent, 'now · 8:06 pm');
  assert.equal(climb.querySelector('.climb-projection-label').textContent, '89.6 g to go before bed');
  const markers = [...climb.querySelectorAll('.climb-marker')];
  assert.equal(markers.length, 2);
  assert.equal(markers[1].dataset.timeKnown, 'false');
  assert.match(markers[1].querySelector('title').textContent, /time not logged/);
  assert.equal(doc.querySelector('[data-nutrition="climb-subtitle"]').textContent, '30.4 g by 8:06 pm');
  window.happyDOM.abort();
});

test('a past day shows the whole day with no now marker or projection', () => {
  const { window, doc } = mount();
  renderNutrition(doc, model('2026-10-01'), { quiet: true, now });
  const climb = doc.querySelector('#nutrition-climb');
  assert.equal(climb.querySelector('.climb-now'), null);
  assert.equal(climb.querySelector('.climb-projection'), null);
  assert.equal(climb.querySelector('.climb-hit-label').textContent, 'goal hit at 12 pm');
  assert.equal(doc.querySelector('[data-nutrition="climb-subtitle"]').textContent, '140 g across 1 meal');
  assert.equal(doc.querySelector('.nutrition-rings__value').textContent, '✓');
  assert.equal(doc.querySelector('#nutrition-today-label').textContent, 'Thu 01/10/26');
  window.happyDOM.abort();
});

test('an empty day says so in words instead of drawing a line', () => {
  const { window, doc } = mount();
  renderNutrition(doc, model('2026-09-20'), { quiet: true, now });
  assert.equal(doc.querySelector('[data-role="climb-line"]'), null);
  const empty = doc.querySelector('[data-nutrition="climb-empty"]');
  assert.equal(empty.hidden, false);
  assert.equal(empty.textContent, 'No meals logged on this day.');
  window.happyDOM.abort();
});

test('the 30-day strip marks hits, stubs and the summary count', () => {
  const { window, doc } = mount();
  renderNutrition(doc, model('2026-10-04'), { quiet: true, now });
  const bars = [...doc.querySelectorAll('.consistency-strip__bar')];
  assert.equal(bars.length, 30);
  assert.equal(bars.find(bar => bar.dataset.date === '2026-10-01').dataset.state, 'hit');
  assert.equal(bars.find(bar => bar.dataset.date === '2026-10-02').dataset.state, 'under');
  assert.equal(bars.find(bar => bar.dataset.date === '2026-09-30').dataset.state, 'none');
  assert.equal(bars.find(bar => bar.dataset.date === '2026-10-02').title, 'Fri 02/10/26: 100 g / 120 g');
  assert.equal(doc.querySelector('[data-nutrition="consistency-summary"]').textContent, '1 of 30 days hit · best run 1 day');
  window.happyDOM.abort();
});

test('quiet renders never start the entrance choreography', () => {
  const { window, doc } = mount();
  renderNutrition(doc, model('2026-10-04'), { quiet: true, now });
  assert.equal(doc.querySelector('#nutrition-today').classList.contains('is-playing'), false);
  window.happyDOM.abort();
});
