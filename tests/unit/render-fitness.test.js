import test from 'node:test';
import assert from 'node:assert/strict';
import { renderFitness } from '../../js/app/render-fitness.js';

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
