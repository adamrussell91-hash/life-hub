import test from 'node:test';
import assert from 'node:assert/strict';
import { renderFitness } from '../../apps/life/js/app/render-fitness.js';

class FakeEl {
  constructor() {
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.className = '';
    this.textContent = '';
    this.style = {};
  }

  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  removeAttribute(name) { delete this.attributes[name]; }
  querySelector() { return null; }
  addEventListener() {}
}

function fitnessRoot() {
  const nodes = new Map();
  const ensure = selector => {
    if (!nodes.has(selector)) nodes.set(selector, new FakeEl());
    return nodes.get(selector);
  };
  return {
    nodes,
    ensure,
    createElement: () => new FakeEl(),
    querySelector(selector) { return ensure(selector); }
  };
}

const emptyLongTerm = {
  weeklyVolume: [],
  volumeDeltaPct: null,
  workoutsPerWeek: 0,
  adherencePct: 0,
  strengthDeltaPct: null
};

test('region cards show current best and volume when the 30-day delta is missing', () => {
  const root = fitnessRoot();
  renderFitness(root, {
    streak: 0,
    dayType: 'movement',
    weekDots: [],
    longTerm: emptyLongTerm,
    regions: [{
      key: 'chest',
      label: 'Chest',
      image: 'assets/fitness/regions/chest.png',
      bestSetDeltaKg: null,
      volumeDeltaPct: null,
      currentBestKg: 50,
      currentVolume: 1200,
      colour: 'neutral'
    }],
    heroSession: null,
    focusHits: [],
    comparisons: [],
    month: []
  });

  const grid = root.ensure('#fitness-region-grid');
  const card = grid.children[0];
  const copy = card.children[1];
  assert.equal(copy.children[0].textContent, 'Chest');
  assert.equal(copy.children[1].textContent, '50 kg');
  assert.equal(copy.children[2].textContent, '1,200 kg volume');
});

function heroSession(overrides = {}) {
  return {
    date: '2026-07-30',
    title: 'Upper Body',
    duration_min: 35,
    status: 'planned',
    focus: ['chest'],
    muscleMapKeys: [],
    exercises: [
      { name: 'Bench Press', sets: [{}, {}, {}, {}] },
      { name: 'Push-Up', sets: [{}, {}, {}, {}] }
    ],
    ...overrides
  };
}

function baseModel(overrides = {}) {
  return {
    streak: 0,
    dayType: 'workout_30',
    weekDots: [],
    longTerm: emptyLongTerm,
    regions: [],
    heroSession: heroSession(),
    focusHits: [],
    comparisons: [],
    month: [],
    ...overrides
  };
}

test('planned Fitness hero shows exercise rows and Start workout until the logger starts', () => {
  const root = fitnessRoot();
  const logger = {
    mounted: false,
    everStarted: false,
    mount() { this.mounted = true; },
    unmount() { this.mounted = false; },
    startTimer() { this.everStarted = true; },
    getTimerState() { return { everStarted: this.everStarted }; }
  };

  renderFitness(root, baseModel(), { logger });

  assert.equal(root.ensure('[data-fitness="hero-day"]').textContent, 'Thursday');
  assert.equal(root.ensure('[data-fitness="hero-title"]').textContent, 'Upper Body');
  const list = root.ensure('#fitness-exercise-list');
  assert.equal(list.children.length, 2);
  assert.match(list.children[0].children[2].textContent, /4 sets/);
  assert.equal(root.ensure('#fitness-start-workout').attributes.hidden, undefined);
  assert.equal(root.ensure('#fitness-logger').attributes.hidden, '');
  assert.equal(logger.mounted, false);

  root.ensure('#fitness-start-workout').onclick();
  assert.equal(logger.mounted, true);
  assert.equal(logger.everStarted, true);
  assert.equal(root.ensure('[data-fitness="hero-preview"]').attributes.hidden, '');
  assert.equal(root.ensure('#fitness-logger').attributes.hidden, undefined);
});

test('completed Fitness hero keeps set details and hides Start workout', () => {
  const root = fitnessRoot();
  renderFitness(root, baseModel({
    heroSession: heroSession({
      status: 'completed',
      exercises: [{
        name: 'Chest Press',
        sets: [{ reps: 10, weight_kg: 32, cable_type: 'concentric' }]
      }]
    })
  }));

  const list = root.ensure('#fitness-exercise-list');
  assert.match(list.children[0].className, /fitness-exercise/);
  assert.match(list.children[0].children[1].children[1].textContent, /32 kg/);
  assert.equal(root.ensure('#fitness-start-workout').attributes.hidden, '');
});

test('empty focus and first-logged comparisons stay hidden', () => {
  const root = fitnessRoot();
  renderFitness(root, baseModel({
    heroSession: null,
    comparisons: [{
      name: 'Bar Press set 1',
      firstLogged: true,
      currentBest: { weight_kg: 30, reps: 10 },
      previousBest: null
    }]
  }));
  assert.equal(root.ensure('#fitness-focus-card').attributes.hidden, '');
  assert.equal(root.ensure('#fitness-comparisons-card').attributes.hidden, '');
  assert.equal(root.ensure('#fitness-comparisons').children.length, 0);
});

test('week board, volume bars, and compact heatmap render useful density', () => {
  const root = fitnessRoot();
  renderFitness(root, baseModel({
    heroSession: null,
    weekCompletedCount: 1,
    weekTarget: 4,
    weekDots: [
      { date: '2026-07-24', completed: false, isToday: false },
      { date: '2026-07-25', completed: false, isToday: false },
      { date: '2026-07-26', completed: false, isToday: false },
      { date: '2026-07-27', completed: false, isToday: false },
      { date: '2026-07-28', completed: false, isToday: false },
      { date: '2026-07-29', completed: false, isToday: false },
      { date: '2026-07-30', completed: true, isToday: true }
    ],
    weekVolume: [
      { date: '2026-07-24', volume: 0 },
      { date: '2026-07-30', volume: 400 }
    ],
    longTerm: {
      weeklyVolume: Array.from({ length: 12 }, (_, i) => ({
        weekStart: `2026-0${Math.min(9, 5 + Math.floor(i / 4))}-01`,
        value: i === 11 ? 800 : 0
      })),
      volumeDeltaPct: 40,
      workoutsPerWeek: 1.5,
      adherencePct: 38,
      strengthDeltaPct: 17.1
    },
    focusHits: [{ key: 'chest', label: 'chest', count: 2 }],
    comparisons: [{
      name: 'Bar Press',
      firstLogged: false,
      isPr: true,
      weightDeltaKg: 4,
      currentBest: { weight_kg: 34, reps: 10 },
      previousBest: { weight_kg: 30, reps: 10 }
    }],
    month: [
      { date: '2026-07-01', completed: false },
      { date: '2026-07-30', completed: true }
    ]
  }));

  assert.equal(root.ensure('[data-fitness="week-done"]').textContent, '1');
  assert.equal(root.ensure('#fitness-week-days').children.length, 7);
  assert.equal(root.ensure('#fitness-quota-track').children.length, 4);
  assert.equal(root.ensure('#fitness-volume-bars').children.length, 8);
  assert.equal(root.ensure('#fitness-focus-card').attributes.hidden, undefined);
  assert.equal(root.ensure('#fitness-comparisons-card').attributes.hidden, undefined);
  assert.equal(root.ensure('#fitness-comparisons').children.length, 1);
  assert.equal(root.ensure('#fitness-comparisons').children[0].children[2].textContent, 'PR');
  assert.equal(root.ensure('[data-fitness="month-hits"]').textContent, '1');
  assert.equal(root.ensure('#fitness-heatmap').children.length, 2);
});

test('region cards prefer the 30-day delta when both current and delta exist', () => {
  const root = fitnessRoot();
  renderFitness(root, {
    streak: 0,
    dayType: 'movement',
    weekDots: [],
    longTerm: emptyLongTerm,
    regions: [{
      key: 'chest',
      label: 'Chest',
      image: 'assets/fitness/regions/chest.png',
      bestSetDeltaKg: 10,
      volumeDeltaPct: 25,
      currentBestKg: 50,
      currentVolume: 1200,
      colour: 'green'
    }],
    heroSession: null,
    focusHits: [],
    comparisons: [],
    month: []
  });

  const copy = root.ensure('#fitness-region-grid').children[0].children[1];
  assert.equal(copy.children[1].textContent, '+10 kg');
  assert.equal(copy.children[2].textContent, '+25.0% volume');
});
