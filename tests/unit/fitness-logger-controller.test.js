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

test('adding an exercise jumps the swipe to the new card', () => {
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

test('removeExercise drops a movement from the draft', () => {
  const { controller } = makeController();
  controller.mount(session());
  controller.addExercise('Push-Up');
  controller.removeExercise(0);
  assert.deepEqual(controller.getDraft().exercises.map(item => item.name), ['Push-Up']);
  controller.destroy();
});
