import test from 'node:test';
import assert from 'node:assert/strict';
import { renderFitnessLogger } from '../../apps/life/js/app/render-fitness-logger.js';

class FakeEl {
  constructor(tag = 'div') {
    this.tagName = tag;
    this.children = [];
    this.dataset = {};
    this.textContent = '';
    this.value = '';
    this.disabled = false;
    this.className = '';
  }
  append(...nodes) { for (const n of nodes) this.children.push(n); }
  replaceChildren(...nodes) { this.children = nodes; }
  removeAttribute() {}
  setAttribute() {}
  addEventListener() {}
  querySelector() { return null; }
}

class FakeRoot {
  constructor() {
    this.logger = new FakeEl('div');
    this.elements = new Map([['#fitness-logger', this.logger]]);
  }
  querySelector(sel) { return this.elements.get(sel) ?? null; }
  createElement(tag) { return new FakeEl(tag); }
}

function draftWithCues(coach_cues, sets) {
  return {
    type: 'workout',
    date: '2026-08-05',
    title: 'Chest and Curls',
    session_kind: 'strength',
    day_type: 'workout_30',
    status: 'planned',
    focus: ['chest'],
    recovery_flag_next_day: false,
    pain_flags: [],
    path: 'data/fitness/2026/08/2026-08-05-chest-and-curls.md',
    notes: '',
    exercises: [{
      name: 'Bench',
      ...(coach_cues ? { coach_cues } : {}),
      sets: sets ?? [{ reps: 8, weight_kg: 36, cable_type: 'constant_force' }]
    }]
  };
}

function walk(node) {
  const list = [];
  const visit = current => {
    if (!current) return;
    list.push(current);
    for (const child of current.children ?? []) visit(child);
  };
  visit(node);
  return list;
}

function findExerciseCard(logger) {
  return walk(logger).find(child => child.className === 'fitness-logger__exercise');
}

function cuesIn(node, marker) {
  return node.children.filter(child => child.dataset?.fitnessLogger === marker);
}

test('renders the start cue at the top of the exercise card when starting the exercise', () => {
  const root = new FakeRoot();
  const draft = draftWithCues({ start: "Let's get that chest pumped, big guy." });
  renderFitnessLogger(root, draft, { expandedExerciseIndex: 0 });

  const card = findExerciseCard(root.logger);
  const startCues = cuesIn(card, 'cue-start');
  assert.equal(startCues.length, 1);
  assert.equal(startCues[0].textContent, "Let's get that chest pumped, big guy.");
});

test('renders the rest cue between sets, not after the final set', () => {
  const root = new FakeRoot();
  const draft = draftWithCues(
    { rest: 'Shake it out, next set is coming.' },
    [
      { reps: 8, weight_kg: 36, cable_type: 'constant_force' },
      { reps: 8, weight_kg: 36, cable_type: 'constant_force' },
      { reps: 8, weight_kg: 36, cable_type: 'constant_force' }
    ]
  );
  renderFitnessLogger(root, draft, { expandedExerciseIndex: 0 });

  const card = findExerciseCard(root.logger);
  const table = card.children.find(child => child.className === 'fitness-logger__sets');
  const restCues = cuesIn(table, 'cue-rest');
  // Rest happens after set 1 and set 2 (before the next set), never after the last set.
  assert.equal(restCues.length, 2);
  assert.ok(restCues.every(cue => cue.textContent === 'Shake it out, next set is coming.'));
});

test('renders the final_set cue attached to the final set, not as a rest cue', () => {
  const root = new FakeRoot();
  const draft = draftWithCues(
    { rest: 'Shake it out.', final_set: '1-2 reps in the tank, this is the one that counts.' },
    [
      { reps: 8, weight_kg: 36, cable_type: 'constant_force' },
      { reps: 8, weight_kg: 36, cable_type: 'constant_force' }
    ]
  );
  renderFitnessLogger(root, draft, { expandedExerciseIndex: 0 });

  const card = findExerciseCard(root.logger);
  const table = card.children.find(child => child.className === 'fitness-logger__sets');
  const finalCues = cuesIn(table, 'cue-final-set');
  const restCues = cuesIn(table, 'cue-rest');
  assert.equal(finalCues.length, 1);
  assert.equal(finalCues[0].textContent, '1-2 reps in the tank, this is the one that counts.');
  assert.equal(restCues.length, 1, 'only one rest cue -- between set 1 and set 2, not after the final set');
});

test('renders no cue elements at all when the exercise has no coach_cues', () => {
  const root = new FakeRoot();
  const draft = draftWithCues(undefined, [
    { reps: 8, weight_kg: 36, cable_type: 'constant_force' },
    { reps: 8, weight_kg: 36, cable_type: 'constant_force' }
  ]);
  renderFitnessLogger(root, draft, { expandedExerciseIndex: 0 });

  const card = findExerciseCard(root.logger);
  assert.equal(cuesIn(card, 'cue-start').length, 0);
  const table = card.children.find(child => child.className === 'fitness-logger__sets');
  assert.equal(cuesIn(table, 'cue-rest').length, 0);
  assert.equal(cuesIn(table, 'cue-final-set').length, 0);
});

test('logger shows add-exercise, reorder controls, and session detail fields', () => {
  const root = new FakeRoot();
  renderFitnessLogger(root, draftWithCues(undefined, [{ reps: 8, weight_kg: 36, cable_type: 'constant_force' }]), {
    expandedExerciseIndex: 0
  });

  const add = root.logger.children.find(child => child.className === 'fitness-logger__add-exercise');
  assert.ok(add);
  assert.equal(add.children[1].textContent, 'Add exercise');

  const card = findExerciseCard(root.logger);
  const tools = card.children[0].children[1];
  assert.equal(tools.children[0].dataset.fitnessLogger, 'move-up');
  assert.equal(tools.children[1].dataset.fitnessLogger, 'move-down');
  assert.equal(tools.children[2].dataset.fitnessLogger, 'remove-exercise');

  const details = root.logger.children.find(child => child.className === 'fitness-logger__details');
  assert.ok(details);
  assert.match(details.children[0].textContent, /Session details/);
});

test('multiple exercises sit in a compact swipe deck until a card is expanded', () => {
  const root = new FakeRoot();
  const draft = draftWithCues(undefined, [{ reps: 8, weight_kg: 36, cable_type: 'constant_force' }]);
  draft.exercises.push({
    name: 'Cable fly',
    sets: [{ reps: 12, weight_kg: 12, cable_type: 'constant_force' }]
  });
  renderFitnessLogger(root, draft, { exerciseIndex: 1 });

  const swipe = root.logger.children.find(child => String(child.className || '').includes('fitness-logger__swipe'));
  assert.ok(swipe, 'logger mounts the kit swipe deck');
  assert.equal(swipe.dataset.cardSwipeIndex, '1');
  const peeks = walk(swipe).filter(child => String(child.className || '').split(/\s+/).includes('fitness-logger__peek'));
  assert.equal(peeks.length, 2);
  assert.equal(peeks[0].children[0].textContent, 'Bench');
  assert.equal(peeks[1].children[0].textContent, 'Cable fly');
  assert.equal(walk(root.logger).filter(child => child.className === 'fitness-logger__exercise').length, 0);
});

test('selecting a swipe card expands the set editor for that exercise', () => {
  const root = new FakeRoot();
  const draft = draftWithCues(undefined, [{ reps: 8, weight_kg: 36, cable_type: 'constant_force' }]);
  draft.exercises.push({
    name: 'Cable fly',
    sets: [{ reps: 12, weight_kg: 12, cable_type: 'constant_force' }]
  });
  renderFitnessLogger(root, draft, { exerciseIndex: 1, expandedExerciseIndex: 1 });

  const card = findExerciseCard(root.logger);
  assert.equal(card.children[0].children[0].textContent, 'Cable fly');
  const table = card.children.find(child => child.className === 'fitness-logger__sets');
  assert.ok(table);
  const weight = walk(table).find(node => node.tagName === 'input' && node.step === '0.5');
  assert.equal(weight?.value, 12);
});

test('a single-set exercise gets the final_set cue on that only set, never a rest cue', () => {
  const root = new FakeRoot();
  const draft = draftWithCues({ rest: 'Shake it out.', final_set: 'This is the one.' });
  renderFitnessLogger(root, draft, { expandedExerciseIndex: 0 });

  const card = findExerciseCard(root.logger);
  const table = card.children.find(child => child.className === 'fitness-logger__sets');
  assert.equal(cuesIn(table, 'cue-rest').length, 0);
  assert.equal(cuesIn(table, 'cue-final-set').length, 1);
});
