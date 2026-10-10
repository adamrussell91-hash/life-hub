import test from 'node:test';
import assert from 'node:assert/strict';
import { createFitnessLoggerController } from '../../apps/life/js/app/fitness-logger-controller.js';

class FakeEl {
  constructor(tag = 'div') {
    this.tagName = tag;
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.textContent = '';
    this.value = '';
    this.disabled = false;
    this.hidden = false;
    this.className = '';
    this.listeners = new Map();
  }
  append(...nodes) { for (const n of nodes) this.children.push(n); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(name, value) { this.attributes.set(name, value); this.hidden = name === 'hidden'; }
  removeAttribute(name) { this.attributes.delete(name); if (name === 'hidden') this.hidden = false; }
  querySelector() { return null; }
  addEventListener(type, fn) {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }
}

class FakeRoot {
  constructor() {
    this.logger = new FakeEl('div');
    this.logger.id = 'fitness-logger';
    this.elements = new Map([['#fitness-logger', this.logger]]);
  }
  querySelector(sel) { return this.elements.get(sel) ?? null; }
  createElement(tag) { return new FakeEl(tag); }
}

const session = () => ({
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
  exercises: [{ name: 'Bench', sets: [{ reps: 8, weight_kg: 36, cable_type: 'constant_force' }] }]
});

function makeController(overrides = {}) {
  const intervals = [];
  let clock = 1_000_000;
  const confirms = [];
  const root = new FakeRoot();
  const controller = createFitnessLoggerController({
    root,
    storage: {
      getItem: () => null,
      setItem() {},
      removeItem() {}
    },
    documentTarget: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
    now: () => clock,
    setIntervalImpl: (fn, ms) => {
      const id = intervals.length + 1;
      intervals.push({ id, fn, ms, cleared: false });
      return id;
    },
    clearIntervalImpl(id) {
      const row = intervals.find(item => item.id === id);
      if (row) row.cleared = true;
    },
    setTimeoutImpl: () => 1,
    clearTimeoutImpl() {},
    chatApi: {
      async confirm(payload) {
        confirms.push(payload);
        return { path: session().path };
      }
    },
    isOnline: () => true,
    idleMs: 60_000,
    ...overrides
  });
  return {
    controller,
    root,
    confirms,
    intervals,
    advance(ms) { clock += ms; },
    tickTimers() {
      for (const row of intervals.filter(item => !item.cleared)) row.fn();
    }
  };
}

test('planned workouts prepare Candidate 6 and unmounting hides the voice player', () => {
  const calls = [];
  const voice = {
    prepare(value) { calls.push(['prepare', value.path]); },
    hide() { calls.push(['hide']); }
  };
  const { controller } = makeController({ voice });
  controller.prepareVoice(session());
  controller.mount(session());
  assert.deepEqual(calls.filter(([name]) => name === 'prepare'), [
    ['prepare', session().path],
    ['prepare', session().path]
  ]);
  controller.unmount();
  assert.deepEqual(calls.at(-1), ['hide']);
});

test('finish confirms completed overwrite and clears the draft', async () => {
  const store = new Map();
  const storage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, value),
    removeItem: key => store.delete(key)
  };
  const written = [];
  const { controller, confirms } = makeController({
    storage,
    onSessionWritten: result => written.push(result)
  });

  controller.mount(session());
  assert.ok(controller.getDraft());
  await controller.finish();

  assert.equal(confirms.length, 1);
  assert.equal(confirms[0].overwrite, true);
  assert.equal(confirms[0].candidate.fields.status, 'completed');
  assert.equal(written.length, 1);
  assert.equal(controller.getDraft(), null);
  controller.destroy();
});

test('autosave sends planned overwrite when the draft changed', async () => {
  const { controller, confirms } = makeController();

  controller.mount(session());
  const draft = controller.getDraft();
  draft.exercises[0].sets[0].weight_kg = 40;
  await controller.flushAutosave();

  assert.equal(confirms.length, 1);
  assert.equal(confirms[0].candidate.fields.status, 'planned');
  assert.equal(confirms[0].candidate.fields.exercises[0].sets[0].weight_kg, 40);
  controller.destroy();
});

test('mount leaves the timer idle without starting an interval', () => {
  const { controller, intervals } = makeController();
  controller.mount(session());

  const timer = controller.getTimerState();
  assert.equal(timer.state, 'idle');
  assert.equal(timer.elapsedMs, 0);
  assert.equal(timer.everStarted, false);
  assert.equal(timer.completeVisible, false);
  assert.equal(intervals.filter(item => !item.cleared).length, 0);
  controller.destroy();
});

test('start pause resume accumulate only running time', () => {
  const { controller, intervals, advance } = makeController();
  controller.mount(session());

  controller.startTimer();
  assert.equal(controller.getTimerState().state, 'running');
  assert.equal(controller.getTimerState().completeVisible, true);
  assert.equal(intervals.filter(item => !item.cleared).length, 1);

  advance(10_000);
  assert.equal(controller.getTimerState().elapsedMs, 10_000);

  controller.pauseTimer();
  assert.equal(controller.getTimerState().state, 'paused');
  assert.equal(controller.getTimerState().elapsedMs, 10_000);
  assert.equal(intervals.every(item => item.cleared), true);

  advance(60_000);
  assert.equal(controller.getTimerState().elapsedMs, 10_000);

  controller.startTimer();
  advance(5_000);
  assert.equal(controller.getTimerState().state, 'running');
  assert.equal(controller.getTimerState().elapsedMs, 15_000);
  controller.destroy();
});

test('complete locks the clock and undo returns to paused', () => {
  const { controller, advance } = makeController();
  controller.mount(session());
  controller.startTimer();
  advance(12_000);
  controller.completeTimer();

  assert.equal(controller.getTimerState().state, 'completed');
  assert.equal(controller.getTimerState().elapsedMs, 12_000);
  advance(30_000);
  assert.equal(controller.getTimerState().elapsedMs, 12_000);

  controller.undoCompleteTimer();
  assert.equal(controller.getTimerState().state, 'paused');
  assert.equal(controller.getTimerState().elapsedMs, 12_000);
  controller.destroy();
});

test('complete is a no-op before the first start', () => {
  const { controller } = makeController();
  controller.mount(session());
  controller.completeTimer();
  assert.equal(controller.getTimerState().state, 'idle');
  assert.equal(controller.getTimerState().completeVisible, false);
  controller.destroy();
});

test('finish includes duration_min from accumulated elapsed', async () => {
  const { controller, confirms, advance } = makeController();
  controller.mount(session());
  controller.startTimer();
  advance(125_000);
  controller.pauseTimer();
  await controller.finish();

  assert.equal(confirms[0].candidate.fields.duration_min, 2);
  controller.destroy();
});

test('finish keeps a duration the athlete typed instead of overwriting it', async () => {
  const { controller, confirms, advance } = makeController();
  controller.mount(session());
  controller.getDraft().duration_min = 40;
  controller.startTimer();
  advance(125_000);
  await controller.finish();
  assert.equal(confirms[0].candidate.fields.duration_min, 40);
  controller.destroy();
});

test('add, reorder, and session extras land on the completed confirm payload', async () => {
  const { controller, confirms } = makeController();
  controller.mount(session());
  controller.addExercise('Face Pull');
  controller.reorderExercise(1, 0);
  const draft = controller.getDraft();
  draft.avg_hr = 128;
  draft.calories_kcal = 220;
  draft.distance_km = 0;
  draft.recovery_flag_next_day = true;
  draft.pain_flags = [{ site: 'right shoulder', note: 'twinge' }];
  draft.exercises[0].sets[0].weight_kg = 12;
  draft.exercises[0].sets[0].reps = 15;
  await controller.finish();

  const fields = confirms[0].candidate.fields;
  assert.equal(fields.status, 'completed');
  assert.equal(fields.exercises[0].name, 'Face Pull');
  assert.equal(fields.exercises[1].name, 'Bench');
  assert.equal(fields.exercises[0].sets[0].weight_kg, 12);
  assert.equal(fields.exercises[0].sets[0].reps, 15);
  assert.equal(fields.avg_hr, 128);
  assert.equal(fields.calories_kcal, 220);
  assert.equal(fields.distance_km, 0);
  assert.equal(fields.recovery_flag_next_day, true);
  assert.deepEqual(fields.pain_flags, [{ site: 'right shoulder', note: 'twinge' }]);
  controller.destroy();
});

test('adding an exercise jumps gym mode to its first set', () => {
  const { controller } = makeController();
  controller.mount(session());
  assert.equal(controller.getExerciseIndex(), 0);
  controller.addExercise('Cable fly');
  assert.equal(controller.getExerciseIndex(), 1);
  controller.addExercise('Curl');
  assert.equal(controller.getExerciseIndex(), 2);
  controller.removeExercise(2);
  assert.equal(controller.getExerciseIndex(), 1);
  controller.destroy();
});

const supersetSession = () => ({
  ...session(),
  exercises: [
    {
      name: 'Bar Press',
      superset_group: 1,
      superset_label: 'Press + Curl',
      coach_cues: { rest: 'Breathe.' },
      sets: [
        { reps: 10, weight_kg: 30, cable_type: 'constant_force' },
        { reps: 10, weight_kg: 30, cable_type: 'constant_force' },
        { reps: 8, weight_kg: 34, cable_type: 'constant_force' }
      ]
    },
    {
      name: 'Bar Curl',
      superset_group: 1,
      sets: [
        { reps: 12, weight_kg: 10, cable_type: 'constant_force' },
        { reps: 12, weight_kg: 10, cable_type: 'constant_force' },
        { reps: 12, weight_kg: 10, cable_type: 'constant_force' }
      ]
    }
  ]
});

test('supersets run set-for-set: B1 B2, B1 B2 — not AAA BBB', () => {
  const { controller } = makeController();
  controller.mount(supersetSession());
  const order = controller.getSteps().map(step => {
    const { exerciseIndex, setIndex } = step.members[0];
    return `${controller.getDraft().exercises[exerciseIndex].name}#${setIndex + 1}`;
  });
  assert.deepEqual(order, [
    'Bar Press#1', 'Bar Curl#1',
    'Bar Press#2', 'Bar Curl#2',
    'Bar Press#3', 'Bar Curl#3'
  ]);
  controller.destroy();
});

test('Done advances to the partner with no rest, then rests after the round', () => {
  const { controller } = makeController();
  controller.mount(supersetSession());
  controller.doneStep();
  assert.equal(controller.getStepIndex(), 1);
  assert.equal(controller.getRest(), null, 'no rest between superset partners');
  assert.equal(controller.getTimerState().state, 'running', 'first Done starts the session clock');
  controller.doneStep();
  assert.equal(controller.getStepIndex(), 2);
  const rest = controller.getRest();
  assert.ok(rest && rest.remainingMs === 90_000, 'default rest after the round');
  assert.equal(rest.cue, 'Breathe.');
  controller.destroy();
});

test('failure, set notes and exercise notes reach the completed record; done ticks do not', async () => {
  const { controller, confirms } = makeController();
  controller.mount(supersetSession());
  controller.setField(0, 1, 'reps', 7);
  controller.toggleFailure(0, 1);
  controller.setNote(0, 1, 'failure on rep 8');
  controller.setExerciseNote(1, 'Grip slipped on round 3');
  controller.doneStep();
  await controller.finish();
  const [press, curl] = confirms[0].candidate.fields.exercises;
  assert.equal(press.superset_group, 1, 'superset survives the logger');
  assert.equal(press.superset_label, 'Press + Curl');
  assert.equal(curl.superset_group, 1);
  assert.equal(press.sets[1].reps, 7);
  assert.equal(press.sets[1].failed, true);
  assert.equal(press.sets[1].note, 'failure on rep 8');
  assert.equal(curl.notes, 'Grip slipped on round 3');
  assert.equal(press.sets.some(set => 'done' in set), false, 'done is logger-only state');
  controller.destroy();
});

test('changing kg carries forward to later matching sets but keeps a planned jump', () => {
  const { controller } = makeController();
  controller.mount(supersetSession());
  controller.setField(0, 0, 'weight_kg', 32);
  const sets = controller.getDraft().exercises[0].sets;
  assert.deepEqual(sets.map(set => set.weight_kg), [32, 32, 34]);
  controller.destroy();
});

test('a circuit logs one round per tap and scores rounds + time', async () => {
  const sets = n => Array.from({ length: n }, () => ({ reps: 5, weight_kg: 0, cable_type: 'none' }));
  const { controller, confirms, advance } = makeController();
  controller.mount({
    ...session(),
    exercises: [
      { name: 'Push-Up', tracking: 'bodyweight_reps', superset_group: 2, superset_label: 'Cindy', block: { kind: 'circuit', format: 'for_time' }, sets: sets(3) },
      { name: 'Bench Dip', tracking: 'bodyweight_reps', superset_group: 2, sets: sets(3) },
      { name: 'Reverse Crunch', tracking: 'bodyweight_reps', superset_group: 2, sets: sets(3) }
    ]
  });
  const steps = controller.getSteps();
  assert.equal(steps.length, 3, 'three rounds, one step each');
  assert.equal(steps[0].members.length, 3);
  controller.handleKeydown({ key: 'Enter', target: { tagName: 'BODY' } });
  advance(32_000);
  controller.doneStep();
  advance(32_000);
  controller.doneStep();
  assert.equal(controller.getRest(), null, 'no rest mid-circuit when racing the clock');
  await controller.finish();
  const owner = confirms[0].candidate.fields.exercises[0];
  assert.equal(owner.block.kind, 'circuit');
  assert.equal(owner.block.result.rounds, 3);
  controller.destroy();
});

test('Escape while typing leaves the field instead of closing gym mode (I8)', () => {
  const { controller } = makeController();
  controller.mount(session());
  let blurred = false;
  controller.handleKeydown({ key: 'Escape', target: { tagName: 'TEXTAREA', blur: () => { blurred = true; } } });
  assert.equal(blurred, true);
  assert.equal(controller.getView(), 'gym');
  controller.handleKeydown({ key: 'Escape', target: { tagName: 'BODY' } });
  assert.equal(controller.getView(), 'docked');
  controller.openGym();
  assert.equal(controller.getView(), 'gym');
  controller.destroy();
});

test('arrow keys move between sets on desktop', () => {
  const { controller } = makeController();
  controller.mount(supersetSession());
  controller.handleKeydown({ key: 'ArrowRight', target: { tagName: 'BODY' } });
  assert.equal(controller.getStepIndex(), 1);
  controller.handleKeydown({ key: 'ArrowLeft', target: { tagName: 'BODY' } });
  assert.equal(controller.getStepIndex(), 0);
  controller.handleKeydown({ key: 'ArrowRight', target: { tagName: 'TEXTAREA' } });
  assert.equal(controller.getStepIndex(), 0, 'typing a note never flips the set');
  controller.destroy();
});

test('removeExercise drops a movement from the draft', () => {
  const { controller } = makeController();
  controller.mount(session());
  controller.addExercise('Push-Up');
  controller.removeExercise(0);
  assert.deepEqual(controller.getDraft().exercises.map(item => item.name), ['Push-Up']);
  controller.destroy();
});

test('Done on a set that beats its ghost celebrates; a heavier-than-ever set is a PR', () => {
  const buzz = [];
  const { controller } = makeController({ vibrate: pattern => buzz.push(pattern) });
  const plan = session();
  plan.exercises = [{ name: 'Bench', sets: [
    { reps: 9, weight_kg: 36, cable_type: 'constant_force' },
    { reps: 8, weight_kg: 40, cable_type: 'constant_force' }
  ] }];
  controller.mount(plan, {
    lastPerformance: { bench: { date: '2026-08-01', sets: [{ reps: 8, weight_kg: 36 }, { reps: 8, weight_kg: 38 }] } },
    exerciseBests: { bench: { maxKg: 38, maxE1rm: 38 * (1 + 8 / 30), maxReps: 8, maxSec: 0 } },
    buildBoard: { weekStart: '2026-08-03', regions: [] }
  });
  controller.doneStep();
  assert.equal(controller.getCelebration().kind, 'beat');
  assert.match(controller.getCelebration().detail, /\+1 rep/);
  controller.doneStep();
  assert.equal(controller.getCelebration().kind, 'pr');
  assert.match(controller.getCelebration().detail, /Heaviest ever: 40 kg × 8/);
  assert.equal(buzz.length, 2);
  controller.destroy();
});

test('Use target puts the auto-progression on the set and later sets follow', () => {
  const { controller } = makeController();
  const plan = session();
  plan.exercises = [{ name: 'Bench', sets: [
    { reps: 10, weight_kg: 36, cable_type: 'constant_force' },
    { reps: 10, weight_kg: 36, cable_type: 'constant_force' }
  ] }];
  controller.mount(plan, {
    lastPerformance: { bench: { sets: [{ reps: 10, weight_kg: 36 }, { reps: 10, weight_kg: 36 }] } }
  });
  assert.equal(controller.getTarget(0).action, 'up');
  controller.applyTarget(0, 0);
  assert.deepEqual(controller.getDraft().exercises[0].sets.map(set => set.weight_kg), [37, 37]);
  controller.destroy();
});

test('a pyramid keeps its opener: the target only lands on top-weight sets', () => {
  const { controller } = makeController();
  const plan = session();
  plan.exercises = [{ name: 'Bench', sets: [
    { reps: 10, weight_kg: 30, cable_type: 'constant_force' },
    { reps: 8, weight_kg: 38, cable_type: 'constant_force' }
  ] }];
  controller.mount(plan, { lastPerformance: { bench: { sets: [{ reps: 10, weight_kg: 30 }, { reps: 8, weight_kg: 38 }] } } });
  assert.equal(controller.getTarget(0, 0), null);
  assert.equal(controller.getTarget(0, 1).weight_kg, 39);
  controller.destroy();
});

test('finishing builds a Pump Report from what happened', async () => {
  const { controller } = makeController();
  controller.mount(session(), {
    lastPerformance: { bench: { sets: [{ reps: 7, weight_kg: 36 }] } },
    exerciseBests: { bench: { maxKg: 40, maxE1rm: 50, maxReps: 10, maxSec: 0 } },
    buildBoard: { weekStart: '2026-08-03', regions: [{ region: 'chest', label: 'Chest', done: 4, target: 12 }] },
    lastSessionVolume: 200
  });
  controller.doneStep();
  await controller.finish();
  const report = controller.getLastReport();
  assert.equal(report.ghostsBeaten, 1);
  assert.equal(report.volume, 288);
  assert.equal(report.volumeDeltaPct, 44);
  assert.equal(report.buildBoard[0].today, 1);
  assert.match(report.chadwick, /last week's you|New ground|showed up|more work/);
  controller.destroy();
});

test('readiness: a flat day lightens not-done K1 loads and is saved on the record', async () => {
  const { controller, confirms } = makeController();
  controller.mount(session());
  controller.setReadiness('sleep', 2);
  controller.setReadiness('soreness', 2);
  controller.setReadiness('energy', 2);
  controller.applyReadiness();
  assert.equal(controller.getDraft().exercises[0].sets[0].weight_kg, 32.5);
  await controller.finish();
  assert.deepEqual(confirms[0].candidate.fields.readiness, { sleep: 2, soreness: 2, energy: 2, adjusted: 'lighter' });
  controller.destroy();
});

test('twinge flags pain for Sara, tags the set, and can lighten the rest of the move', async () => {
  const { controller, confirms } = makeController();
  const plan = session();
  plan.exercises = [{ name: 'Bar Row', sets: [
    { reps: 10, weight_kg: 36, cable_type: 'constant_force' },
    { reps: 10, weight_kg: 36, cable_type: 'constant_force' }
  ] }];
  controller.mount(plan);
  controller.doneStep();
  controller.twinge(0, 0, 'Right shoulder');
  controller.lightenRemaining(0);
  const draft = controller.getDraft();
  assert.deepEqual(draft.pain_flags, [{ site: 'Right shoulder', note: 'twinge on Bar Row, set 1' }]);
  assert.equal(draft.exercises[0].sets[0].note, 'twinge: right shoulder');
  assert.deepEqual(draft.exercises[0].sets.map(set => set.weight_kg), [36, 29]);
  assert.match(draft.exercises[0].notes, /lightened after a twinge/);
  await controller.finish();
  assert.equal(confirms[0].candidate.fields.pain_flags[0].site, 'Right shoulder');
  controller.destroy();
});

test('AEKE stats land on the record; an AMRAP drops the rounds you never played', async () => {
  const sets = n => Array.from({ length: n }, () => ({ reps: 5, weight_kg: 0, cable_type: 'none' }));
  const { controller, confirms } = makeController();
  controller.mount({
    ...session(),
    exercises: [
      { name: 'Push Up', tracking: 'bodyweight_reps', superset_group: 1, block: { kind: 'circuit', format: 'amrap', time_cap_sec: 180 }, sets: sets(5) },
      { name: 'Bench Dip', tracking: 'bodyweight_reps', superset_group: 1, sets: sets(5) }
    ]
  });
  controller.doneStep();
  controller.doneStep();
  controller.setAeke('volume_kg', '4842');
  controller.setAeke('score', '99');
  controller.setAeke('strength_region', 'arms');
  await controller.finish();
  const fields = confirms[0].candidate.fields;
  assert.deepEqual(fields.aeke, { volume_kg: 4842, score: 99, strength_region: 'arms' });
  assert.equal(fields.exercises[0].sets.length, 2);
  assert.equal(fields.exercises[1].sets.length, 2);
  assert.equal(fields.exercises[0].block.result.rounds, 2);
  // Confirm persistence must not re-pad the trimmed AMRAP (the bug that undid finish).
  const { validateLogEntry } = await import('../../netlify/functions/_shared/chat-schema.mjs');
  const persisted = validateLogEntry(confirms[0].candidate, {
    id: 'amrap-finish',
    now: '2026-10-10T20:00:00+11:00'
  });
  assert.equal(persisted.valid, true, JSON.stringify(persisted.errors));
  assert.equal(persisted.record.exercises[0].sets.length, 2);
  assert.equal(persisted.record.exercises[1].sets.length, 2);
  assert.equal(persisted.record.exercises[0].block.result.rounds, 2);
  controller.destroy();
});
