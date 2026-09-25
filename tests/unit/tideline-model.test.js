import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildTidelineModel, movedCaption } from '../../apps/life/js/app/tideline-model.js';

const fixture = JSON.parse(readFileSync(new URL('../../docs/proposals/calendar-reference/fixture.json', import.meta.url), 'utf8'));
const WEEK = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27'];
const TERMS = [
  { term: 3, starts_on: '2026-07-21', ends_on: '2026-09-25' },
  { term: 4, starts_on: '2026-10-13', ends_on: '2026-12-17' }
];

function model() {
  return buildTidelineModel({
    events: fixture.LOGS,
    visual: { ...fixture, school_terms: TERMS, NOTES: Array.from({ length: 12 }, (_, i) => ({ id: i })) },
    week: WEEK,
    today: '2026-09-24',
    nowHour: 18 + 5 / 60,
    terms: TERMS
  });
}

test('tideline capacity, period and grid come from the fixture logs', () => {
  const built = model();
  assert.equal(built.period.title, 'T3 W10 · last week of term');
  assert.equal(built.period.range, '21/09/26 – 27/09/26');
  assert.deepEqual(built.days.map(day => day.cap.pct), [79, 51, 42, 34, 52, 68, 75]);
  assert.deepEqual(built.days.map(day => day.over), [false, false, false, true, false, false, false]);
  assert.equal(built.days[3].cap.note, 'sore throat, poor sleep');
  assert.equal(built.days[4].cap.forecast, true);
  assert.equal(built.days[3].chips.some(chip => /breakfast|Diary/i.test(chip.title)), false);
  assert.equal(built.days[3].chips.filter(chip => chip.id === 'gastro').length, 1);
  assert.match(built.days[3].chips.find(chip => chip.id === 'gastro').meta, /2 records merged/);
  assert.equal(built.days[6].walls.length, 1);
  assert.match(built.days[4].free[0].title, /4½ h free/);
  assert.match(built.ambient, /12 notes touched/);
  assert.equal(built.total, 552);
});

test('holiday weeks label Hol Wn · holidays; term weeks stay T4 Wn', () => {
  const holWeek = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];
  const hol = buildTidelineModel({
    events: fixture.LOGS,
    week: holWeek,
    today: '2026-09-28',
    nowHour: 12,
    terms: TERMS
  });
  assert.equal(hol.period.title, 'Hol W1 · holidays');

  const hol2Week = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'];
  const hol2 = buildTidelineModel({
    events: [],
    week: hol2Week,
    today: '2026-10-05',
    nowHour: 12,
    terms: TERMS
  });
  assert.equal(hol2.period.title, 'Hol W2 · holidays');

  const t4 = buildTidelineModel({
    events: [],
    week: ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'],
    today: '2026-10-26',
    nowHour: 12,
    terms: TERMS
  });
  assert.equal(t4.period.title, 'T4 W3');
});

test('an explicit ghost list replaces the visual queue', () => {
  const built = buildTidelineModel({
    events: fixture.LOGS,
    visual: { ...fixture, school_terms: TERMS, NOTES: [] },
    ghosts: [],
    week: WEEK,
    today: '2026-09-24',
    nowHour: 18,
    terms: TERMS
  });
  assert.equal(built.days[3].chips.some(chip => chip.id === 'g-bed'), false);
  assert.equal(built.days[3].chips.some(chip => chip.id === 'thu-workout'), true);
  assert.equal(built.ghosts.length, 0);
});

test('a moved task is captioned with the destination week', () => {
  assert.equal(movedCaption('2026-10-13', TERMS), 'Moved to T4 W1 Tue');
});

function workoutModel(status, extra = {}) {
  return buildTidelineModel({
    events: [{
      path: 'records/2026/09/24/workout-1815.md',
      record: {
        type: 'workout',
        id: 'workout-1815',
        date: '2026-09-24',
        time: '18:15',
        title: 'Gym',
        status,
        ...extra
      }
    }],
    week: WEEK,
    today: '2026-09-24',
    nowHour: 18
  });
}

test('a skipped workout stays on the grid', () => {
  const plain = workoutModel('skipped').days[3].chips.find(chip => chip.id === 'workout-1815');
  assert.equal(plain.skipped, true);
  assert.equal(plain.meta, 'Skipped');
  const bySource = workoutModel('skipped', { source: 'sara' }).days[3].chips.find(chip => chip.id === 'workout-1815');
  assert.equal(bySource.meta, 'Skipped · Sara');
  const byUpdater = workoutModel('skipped', { updated_by: 'Sara' }).days[3].chips.find(chip => chip.id === 'workout-1815');
  assert.equal(byUpdater.meta, 'Skipped · Sara');
});

test('a completed workout is not a chip', () => {
  const chips = workoutModel('completed').days[3].chips;
  assert.equal(chips.some(chip => chip.id === 'workout-1815'), false);
});

test('a planned workout stays a timed chip', () => {
  const planned = workoutModel('planned').days[3].chips.find(chip => chip.id === 'workout-1815');
  assert.ok(planned);
  assert.equal(planned.skipped, undefined);
  assert.match(planned.meta, /pm/);
  const missing = workoutModel(undefined).days[3].chips.find(chip => chip.id === 'workout-1815');
  assert.ok(missing);
  assert.equal(missing.skipped, undefined);
});

test('a linked visual workout follows the record after it is skipped', () => {
  const built = buildTidelineModel({
    events: [{
      path: 'records/2026/09/24/workout-1815.md',
      record: {
        type: 'workout',
        id: 'workout-1815',
        date: '2026-09-24',
        time: '18:15',
        status: 'skipped',
        updated_by: 'Sara'
      }
    }],
    visual: {
      ...fixture,
      ITEMS: fixture.ITEMS.map(item => item.id === 'thu-workout'
        ? { ...item, recordPath: 'records/2026/09/24/workout-1815.md' }
        : item)
    },
    week: WEEK,
    today: '2026-09-24',
    nowHour: 18,
    terms: TERMS
  });
  const chip = built.days[3].chips.find(item => item.id === 'thu-workout');
  assert.equal(chip.title, 'Workout · upper body');
  assert.equal(chip.skipped, true);
  assert.equal(chip.meta, 'Skipped · Sara');
});
