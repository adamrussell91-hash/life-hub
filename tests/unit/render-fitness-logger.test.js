import test from 'node:test';
import assert from 'node:assert/strict';
import { renderFitnessLogger } from '../../apps/life/js/app/render-fitness-logger.js';
import { buildLoggerSteps } from '../../apps/life/js/core/workout-plan-groups.js';

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
  setAttribute(name, value) { this.attributes = { ...(this.attributes ?? {}), [name]: value }; }
  addEventListener(type, fn) { (this.listeners ??= {})[type] = fn; }
  click() { this.listeners?.click?.(); }
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

function byMarker(node, marker) {
  return walk(node).filter(child => child.dataset?.fitnessLogger === marker);
}

function render(draft, extra = {}) {
  const root = new FakeRoot();
  const { blocks, steps } = buildLoggerSteps(draft.exercises);
  renderFitnessLogger(root, draft, { blocks, steps, ...extra });
  return root;
}

test('gym mode opens on the current set with big kg / reps steppers and a docked Done', () => {
  const root = render(draftWithCues(undefined, [
    { reps: 8, weight_kg: 36, cable_type: 'constant_force' },
    { reps: 8, weight_kg: 36, cable_type: 'constant_force' }
  ]));
  assert.equal(byMarker(root.logger, 'gym').length, 1);
  assert.equal(byMarker(root.logger, 'exercise-name')[0].textContent, 'Bench');
  assert.equal(byMarker(root.logger, 'set-meta')[0].textContent, 'Set 1 of 2');
  assert.equal(byMarker(root.logger, 'value-weight_kg')[0].value, '36');
  assert.equal(byMarker(root.logger, 'value-reps')[0].value, '8');
  const dock = byMarker(root.logger, 'dock')[0];
  assert.equal(dock.dataset.part, 'form-actions');
  assert.equal(byMarker(dock, 'done-step')[0].textContent, 'Set done ✓');
  assert.equal(byMarker(dock, 'prev')[0].disabled, true);
  assert.equal(byMarker(dock, 'next')[0].disabled, false);
});

test('stepper buttons nudge the value and report the change', () => {
  const changes = [];
  const root = render(draftWithCues(), {
    actions: { setField: (...args) => changes.push(args) }
  });
  byMarker(root.logger, 'more-weight_kg')[0].click();
  byMarker(root.logger, 'less-reps')[0].click();
  assert.deepEqual(changes, [[0, 0, 'weight_kg', 36.5], [0, 0, 'reps', 7]]);
  assert.equal(byMarker(root.logger, 'value-weight_kg')[0].value, '36.5');
});

test('the start cue shows on the first set and final_set on the last', () => {
  const cues = { start: "Let's get that chest pumped, big guy.", final_set: 'This is the one.' };
  const sets = [
    { reps: 8, weight_kg: 36, cable_type: 'constant_force' },
    { reps: 8, weight_kg: 36, cable_type: 'constant_force' }
  ];
  const first = render(draftWithCues(cues, sets), { stepIndex: 0 });
  assert.equal(byMarker(first.logger, 'cue-start')[0].textContent, cues.start);
  assert.equal(byMarker(first.logger, 'cue-final-set').length, 0);
  const last = render(draftWithCues(cues, sets), { stepIndex: 1 });
  assert.equal(byMarker(last.logger, 'cue-final-set')[0].textContent, cues.final_set);
  assert.equal(byMarker(last.logger, 'cue-start').length, 0);
});

test('a single-set exercise gets the final_set cue, never a rest cue', () => {
  const root = render(draftWithCues({ rest: 'Shake it out.', final_set: 'This is the one.' }));
  assert.equal(byMarker(root.logger, 'cue-rest').length, 0);
  assert.equal(byMarker(root.logger, 'cue-final-set').length, 1);
});

test('the rest cue rides the rest timer', () => {
  const root = render(draftWithCues({ rest: 'Shake it out.' }), {
    rest: { remainingMs: 75_000, cue: 'Shake it out.', label: 'Rest' }
  });
  assert.equal(byMarker(root.logger, 'rest-clock')[0].textContent, '01:15');
  assert.equal(byMarker(root.logger, 'cue-rest')[0].textContent, 'Shake it out.');
});

test('no cue elements at all when the exercise has no coach_cues', () => {
  const root = render(draftWithCues());
  for (const marker of ['cue-start', 'cue-rest', 'cue-final-set']) {
    assert.equal(byMarker(root.logger, marker).length, 0);
  }
});

test('hit failure and notes are one tap away on every set', () => {
  const draft = draftWithCues();
  draft.exercises[0].sets[0].failed = true;
  draft.exercises[0].sets[0].reps = 7;
  const root = render(draft, { noteOpen: 'set' });
  const failure = byMarker(root.logger, 'toggle-failure')[0];
  assert.equal(failure.attributes['aria-pressed'], 'true');
  assert.match(failure.textContent, /Hit failure/);
  const note = byMarker(root.logger, 'set-note')[0];
  assert.ok(note, 'set note editor opens');
  assert.ok(walk(note).some(child => child.textContent === 'Form broke'), 'quick chips offered');
});

test('a superset shows its block letter, round and B1 / B2 order', () => {
  const sets = [{ reps: 10, weight_kg: 30, cable_type: 'constant_force' }, { reps: 10, weight_kg: 30, cable_type: 'constant_force' }];
  const draft = draftWithCues(undefined, sets);
  draft.exercises = [
    { name: 'Bar Row', sets: [{ reps: 10, weight_kg: 36, cable_type: 'constant_force' }] },
    { name: 'Bar Press', superset_group: 1, superset_label: 'Press + Curl', sets },
    { name: 'Bar Curl', superset_group: 1, sets }
  ];
  const root = render(draft, { stepIndex: 2 });
  const block = byMarker(root.logger, 'block')[0];
  assert.equal(block.dataset.blockKind, 'superset');
  assert.equal(byMarker(block, 'round')[0].textContent, 'Round 1 of 2');
  const order = byMarker(block, 'block-order')[0];
  assert.deepEqual(order.children.map(item => item.children[0].textContent), ['B1', 'B2']);
  assert.match(order.children[1].className, /is-current/);
  assert.equal(byMarker(root.logger, 'exercise-name')[0].textContent, 'Bar Curl');
  assert.match(byMarker(root.logger, 'up-next')[0].textContent, /B1 Bar Press · set 2/);
});

test('a circuit round is one card with every move and a round clock', () => {
  const sets = n => Array.from({ length: n }, () => ({ reps: 5, weight_kg: 0, cable_type: 'none' }));
  const draft = draftWithCues();
  draft.exercises = [
    { name: 'Push-Up', tracking: 'bodyweight_reps', superset_group: 2, superset_label: 'Cindy', block: { kind: 'circuit', format: 'for_time' }, sets: sets(3) },
    { name: 'Bench Dip', tracking: 'bodyweight_reps', superset_group: 2, sets: sets(3) },
    { name: 'Reverse Crunch', tracking: 'bodyweight_reps', superset_group: 2, sets: sets(3) }
  ];
  const root = render(draft, { circuits: { 0: { elapsedMs: 32_000, running: true } } });
  const card = byMarker(root.logger, 'round-card')[0];
  assert.ok(card);
  assert.equal(byMarker(card, 'value-reps').length, 3);
  assert.equal(byMarker(root.logger, 'circuit-clock')[0].textContent, '00:32');
  assert.equal(byMarker(root.logger, 'done-step')[0].textContent, 'Round done ✓');
});

test('the plan sheet keeps add-exercise, reorder, session details and a docked Finish', () => {
  const root = render(draftWithCues(), { panel: 'plan' });
  const sheet = byMarker(root.logger, 'plan-sheet')[0];
  assert.ok(sheet);
  assert.equal(byMarker(sheet, 'add-exercise')[0].textContent, 'Add exercise');
  for (const marker of ['move-up', 'move-down', 'remove-exercise']) {
    assert.equal(byMarker(sheet, marker).length, 1, marker);
  }
  const details = walk(sheet).find(child => child.className === 'fitness-logger__details');
  assert.match(details.children[0].textContent, /Session details/);
  const dock = walk(sheet).find(child => child.className === 'gym-sheet__dock');
  assert.equal(dock.dataset.part, 'form-actions');
  assert.ok(byMarker(dock, 'finish-sheet')[0]);
});

test('all sets done swaps Done for the Finish button', () => {
  const draft = draftWithCues();
  draft.exercises[0].sets[0].done = true;
  const root = render(draft);
  assert.equal(byMarker(root.logger, 'finish')[0].textContent, 'Pump finished');
});

test('minimised gym mode leaves a Back to workout bar on the Fitness card', () => {
  const root = render(draftWithCues(), { view: 'docked' });
  assert.equal(byMarker(root.logger, 'gym').length, 0);
  assert.equal(byMarker(root.logger, 'open-gym')[0].textContent, 'Back to workout');
});

test('ghost mode shows last time\'s same set with a live verdict, plus the target', () => {
  const draft = draftWithCues(undefined, [{ reps: 8, weight_kg: 36, cable_type: 'constant_force' }]);
  const root = render(draft, {
    lastPerformance: { bench: { date: '2026-07-30', sets: [{ reps: 7, weight_kg: 36, failed: true }] } },
    targetFor: () => ({ action: 'hold', weight_kg: 36, reps: 8, reason: 'Failure at 36 kg last time — stay and own it' }),
    actions: { setField: (e, s, field, value) => { draft.exercises[e].sets[s][field] = value; } }
  });
  const ghost = byMarker(root.logger, 'ghost')[0];
  assert.match(ghost.children[0].textContent, /Ghost · set 1 last time \(30\/07\/26\): .*36.*(failure)/);
  const verdict = byMarker(ghost, 'ghost-verdict')[0];
  assert.equal(verdict.textContent, 'Beating it: +1 rep');
  byMarker(root.logger, 'less-reps')[0].click();
  byMarker(root.logger, 'less-reps')[0].click();
  assert.equal(verdict.textContent, 'Behind it: -1 reps', 'verdict follows the stepper live');
  const target = byMarker(root.logger, 'target')[0];
  assert.match(target.children[0].children[0].textContent, /Target 36 kg × 8/);
});

test('a celebration banner leads the stage', () => {
  const root = render(draftWithCues(), { celebration: { kind: 'pr', title: 'PERSONAL BEST', detail: 'Bench — Heaviest ever' } });
  const moment = byMarker(root.logger, 'celebration')[0];
  assert.equal(moment.dataset.kind, 'pr');
  assert.equal(moment.children.find(child => child.className === 'gym-moment__title').textContent, 'PERSONAL BEST');
});

test('readiness check-in leads the first set and shows advice once answered', () => {
  const draft = draftWithCues();
  draft.readiness = { sleep: 2, soreness: 2, energy: 2 };
  const root = render(draft, {
    readinessOpen: true,
    lastPainFlags: { date: '2026-10-04', flags: [{ site: 'Right shoulder' }] },
    treat: 'Huberman'
  });
  const card = byMarker(root.logger, 'readiness')[0];
  assert.ok(card);
  assert.match(byMarker(card, 'readiness-advice')[0].children[0].textContent, /go lighter/i);
  assert.equal(byMarker(card, 'readiness-apply')[0].textContent, 'Go lighter (−10%)');
  assert.ok(walk(card).some(node => /Right shoulder/.test(node.textContent ?? '')));
  assert.match(byMarker(card, 'treat')[0].textContent, /Huberman/);
});

test('every set shows a focus cue and the twinge picker offers body sites', () => {
  const root = render(draftWithCues({ focus: 'Drive the bar away.' }), { noteOpen: 'twinge' });
  assert.match(byMarker(root.logger, 'focus-cue')[0].children[1].textContent, /Drive the bar away/);
  const picker = byMarker(root.logger, 'twinge-picker')[0];
  assert.ok(walk(picker).some(node => node.textContent === 'Right shoulder'));
});

test('twinge offer and rest win render; all-done shows the AEKE wrap-up', () => {
  const draft = draftWithCues();
  draft.exercises[0].sets[0].done = true;
  const root = render(draft, {
    twingeOffer: { exerciseIndex: 0, site: 'Right shoulder' },
    rest: { remainingMs: 60_000, label: 'Rest', win: 'Bench: 30 kg → 36 kg since 01/03/26.' }
  });
  assert.ok(byMarker(root.logger, 'twinge-offer')[0]);
  assert.equal(byMarker(root.logger, 'rest-win')[0].textContent, 'Bench: 30 kg → 36 kg since 01/03/26.');
  const wrap = byMarker(root.logger, 'wrap-up')[0];
  assert.ok(byMarker(wrap, 'aeke-score')[0]);
});

test('anatomy art: a straight set gets the muscle hero with its weekly meter; a superset shows both muscles', () => {
  const draft = draftWithCues();
  draft.exercises[0].name = 'Bar Hip Thrust';
  const root = render(draft, {
    libraryByName: { 'Bar Hip Thrust': { name: 'Bar Hip Thrust', target_area: 'glutes' } },
    boardRows: [{ region: 'legs', label: 'Legs', done: 5, target: 8, today: 4, todayDone: 1 }]
  });
  const hero = byMarker(root.logger, 'hero')[0];
  assert.ok(hero, 'hero header');
  assert.match(walk(hero).find(node => node.tagName === 'img').src, /muscles\/glutes\.png/);
  assert.equal(byMarker(hero, 'hero-meter')[0].children[0].textContent, '6/8');

  const sets = [{ reps: 10, weight_kg: 30, cable_type: 'constant_force' }];
  draft.exercises = [
    { name: 'Bar Press', superset_group: 1, sets },
    { name: 'Cable Bar Wide Grip Curl', superset_group: 1, sets }
  ];
  const split = render(draft, { stepIndex: 0, libraryByName: null });
  assert.equal(byMarker(split.logger, 'hero').length, 0, 'no duplicate hero inside a superset');
  const order = byMarker(split.logger, 'block-order')[0];
  assert.match(order.className, /gym-split/);
  const images = walk(order).filter(node => node.tagName === 'img').map(node => node.src);
  assert.deepEqual(images, ['assets/fitness/muscles/chest-whole.png', 'assets/fitness/regions/arms.png'], 'curls use the flexing arm');
  assert.ok(walk(order).some(node => node.textContent === 'NOW'));
});
