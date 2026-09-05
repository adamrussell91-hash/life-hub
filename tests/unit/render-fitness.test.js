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

test('status, working weights, and labeled volume rows replace empty charts', () => {
  const root = fitnessRoot();
  renderFitness(root, baseModel({
    heroSession: null,
    weekCompletedCount: 1,
    weekTarget: 4,
    weekVolumeKg: 400,
    lastWeekVolumeKg: 0,
    monthVolumeKg: 400,
    avgSessionVolumeKg: 400,
    avgDurationMin: 26,
    weekRemaining: 3,
    nextPlanned: { date: '2026-08-29', title: 'Upper Body' },
    lastCompletedDate: '2026-07-30',
    monthHitCount: 1,
    weekDots: [
      { date: '2026-07-24', completed: false, isToday: false },
      { date: '2026-07-30', completed: true, isToday: true }
    ],
    workingWeights: [{
      name: 'Chest Press',
      weight_kg: 34,
      reps: 8,
      date: '2026-07-30'
    }],
    volumeWeeks: [{ weekStart: '2026-07-27', value: 400 }],
    weekVolumeDeltaPct: null,
    recentSessions: [{
      date: '2026-07-30',
      title: 'Chest and Curls',
      duration_min: 26,
      volume: 400,
      exerciseCount: 2
    }],
    focusHits: [{ key: 'chest', label: 'chest', count: 2 }],
    comparisons: [{
      name: 'Bar Press',
      firstLogged: false,
      isPr: true,
      weightDeltaKg: 4,
      currentBest: { weight_kg: 34, reps: 10 },
      previousBest: { weight_kg: 30, reps: 10 }
    }]
  }));

  assert.equal(root.ensure('[data-fitness="week-done"]').textContent, '1');
  assert.equal(root.ensure('[data-fitness="week-volume"]').textContent, '400 kg');
  assert.equal(root.ensure('[data-fitness="last-week-volume"]').textContent, '—');
  assert.match(root.ensure('[data-fitness="week-story"]').textContent, /Trained Thu 30\/07/);
  assert.match(root.ensure('[data-fitness="month-story"]').textContent, /1 session/);
  assert.match(root.ensure('[data-fitness="pace-story"]').textContent, /3 sessions short/);
  assert.match(root.ensure('[data-fitness="next-planned"]').textContent, /Upper Body/);
  assert.equal(root.ensure('#fitness-loads-card').attributes.hidden, undefined);
  assert.match(root.ensure('#fitness-loads').children[0].children[1].textContent, /34 kg × 8/);
  assert.equal(root.ensure('#fitness-volume-card').attributes.hidden, undefined);
  assert.equal(root.ensure('#fitness-volume-rows').children[0].children[0].textContent, 'Last 30 days');
  assert.equal(root.ensure('#fitness-volume-rows').children[0].children[1].textContent, '400 kg');
  assert.equal(root.ensure('#fitness-volume-rows').children[1].children[1].textContent, '400 kg');
  assert.equal(root.ensure('#fitness-volume-rows').children[2].children[1].textContent, '26 min');
  assert.equal(root.ensure('#fitness-volume-rows').children[3].children[0].textContent, 'Unique lifts');
  assert.equal(root.ensure('#fitness-volume-rows').children[4].children[0].textContent, 'kg / set');
  assert.equal(root.ensure('#fitness-recent-card').attributes.hidden, undefined);
  assert.equal(root.ensure('#fitness-comparisons-card').attributes.hidden, undefined);
  assert.equal(root.ensure('#fitness-comparisons').children[0].children[2].textContent, 'PR');
});

test('kit charts unhide when their own data is ready and stay hidden otherwise', () => {
  const root = fitnessRoot();
  renderFitness(root, baseModel({
    heroSession: null,
    charts: {
      longestStreak: 1,
      uniqueLifts: 2,
      volumePerSetKg: 200,
      weekTarget: 4,
      restCounts: { trained: 1, rest: 29, days: 30 },
      repRanges: [{ key: '9-12', label: '9–12 reps', value: 2, colour: 'var(--wave)' }],
      repRead: 'Mostly Hypertrophy',
      regionVolume: [{ key: 'chest', label: 'Chest', value: 400, colour: 'var(--wave)' }],
      regionVolumePrior: [],
      pushPull: [
        { key: 'push', label: 'Push', value: 400 },
        { key: 'pull', label: 'Pull', value: 200 }
      ],
      clockPoints: [],
      orbitDays: [],
      e1rmRadial: [],
      focusChord: [{ themeA: 'chest', themeB: 'arms', count: 1 }],
      bumpRanks: [],
      regionStream: null,
      painHeat: [],
      loadHorizon: [],
      e1rmBands: [],
      sessionGauge: null,
      yearDots: [],
      sankeyFlows: [],
      libraryMap: {
        nodes: [{ key: 'Chest Press', count: 2 }, { key: 'Curl', count: 1 }],
        edges: [{ themeA: 'Chest Press', themeB: 'Curl', count: 1 }]
      },
      volumePerSetWeeks: [],
      durationSeries: [],
      distanceSeries: [],
      paceSeries: [],
      hrSeries: [],
      sessionReadings: []
    }
  }));
  assert.equal(root.ensure('[data-fitness="longest-streak"]').textContent, '1');
  assert.equal(root.ensure('#fitness-rep-card').attributes.hidden, undefined);
  assert.equal(root.ensure('[data-fitness="rep-read"]').textContent, 'Mostly Hypertrophy');
  assert.equal(root.ensure('#fitness-region-vol-card').attributes.hidden, undefined);
  assert.equal(root.ensure('#fitness-push-pull-card').attributes.hidden, undefined);
  assert.match(root.ensure('[data-fitness="push-read"]').textContent, /push/);
  assert.equal(root.ensure('#fitness-rest-card').attributes.hidden, undefined);
  assert.equal(root.ensure('#fitness-chord-card').attributes.hidden, undefined);
  assert.equal(root.ensure('#fitness-library-card').attributes.hidden, undefined);
  assert.equal(root.ensure('#fitness-e1rm-card').attributes.hidden, '');
  assert.equal(root.ensure('#fitness-readings-card').attributes.hidden, '');
  assert.equal(root.ensure('#fitness-clock-card').attributes.hidden, '');
});

function widgetText(el) {
  return [el.textContent, ...(el.children ?? []).map(widgetText)].join(' ');
}

test('Fitness run widget stays empty instead of reviving the old Workouts / week KPI', () => {
  const root = fitnessRoot();
  renderFitness(root, {
    streak: 0,
    dayType: 'movement',
    weekDots: [],
    longTerm: { ...emptyLongTerm, workoutsPerWeek: 1.5 },
    regions: [],
    heroSession: null,
    focusHits: [],
    comparisons: [],
    month: []
  });

  const host = root.ensure('[data-fitness="run-widget"]');
  assert.equal(host.attributes.hidden, '');
  assert.equal(host.children.length, 0);
  assert.doesNotMatch(widgetText(host), /Workouts/);
  assert.doesNotMatch(widgetText(host), /\/ week/);
});

test('Fitness run widget shows last-session distance only when a walk or run was logged', () => {
  const root = fitnessRoot();
  renderFitness(root, baseModel({
    heroSession: heroSession({ distance_km: 4.2, title: 'Walk' })
  }));

  const host = root.ensure('[data-fitness="run-widget"]');
  assert.equal(host.attributes.hidden, undefined);
  assert.match(widgetText(host), /Last session/);
  assert.match(widgetText(host), /4\.2 km/);
  assert.doesNotMatch(widgetText(host), /Workouts/);
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
