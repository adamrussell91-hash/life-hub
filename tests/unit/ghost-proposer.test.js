import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { capacityForDates } from '../../apps/life/js/app/capacity-model.js';
import { findOpenings } from '../../packages/design-kit/js/openings.js';
import { ALMANAC_WANTS } from '../../apps/life/js/app/almanac-rules.js';
import { validateGhost } from '../../apps/life/js/app/ghost-writes.js';
import {
  bedtimeFromSleep,
  ghostId,
  isThrottled,
  proposeGhosts
} from '../../apps/life/js/app/ghost-proposer.js';

const fixture = JSON.parse(readFileSync(new URL('../../docs/proposals/calendar-reference/fixture.json', import.meta.url), 'utf8'));
const WEEK = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27'];
const TERMS = [
  { term: 3, starts_on: '2026-07-21', ends_on: '2026-09-25' },
  { term: 4, starts_on: '2026-10-13', ends_on: '2026-12-17' }
];
const TODAY = '2026-09-24';

function addDays(key, days) {
  const ms = Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));
  return new Date(ms + days * 86_400_000).toISOString().slice(0, 10);
}

function fixtureEvents() {
  const logs = (fixture.LOGS ?? []).map(log => ({ ...log }));
  const thu = (fixture.ITEMS ?? []).find(item => item.id === 'thu-workout');
  logs.push({
    path: 'records/2026/09/24/workout-1815.md',
    record: {
      type: 'workout',
      id: 'thu-workout',
      chipId: 'thu-workout',
      date: '2026-09-24',
      time: thu?.start ?? '18:15',
      title: 'Gym',
      status: 'planned'
    }
  });
  const sunWall = (fixture.WALLS ?? []).find(wall => wall.date === '2026-09-27');
  if (sunWall) {
    logs.push({
      path: 'data/calendar/2026/09/2026-09-27-wall.md',
      record: { type: 'calendar_block', kind: 'wall', date: '2026-09-27', title: sunWall.label }
    });
  }
  return logs;
}

function openingDays(capacity, from, to) {
  const days = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const cap = capacity.get(d);
    const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
    const inTerm = TERMS.some(term => d >= term.starts_on && d <= term.ends_on);
    const school = inTerm && wd >= 1 && wd <= 5;
    days.push({
      date: d,
      pct: cap?.pct ?? 0,
      weekday: wd,
      holiday: !inTerm,
      walled: wd === 0 || d === '2026-09-27',
      freeDay: school ? 0 : 12,
      freeEvening: school && wd !== 5 ? 3 : 4.5,
      tags: d === '2026-10-04' ? ['dst-start'] : []
    });
  }
  return days;
}

function baseInput(overrides = {}) {
  const events = fixtureEvents();
  const horizon = Array.from({ length: 14 }, (_, i) => addDays(TODAY, i));
  const capacity = capacityForDates(events, [...new Set([...WEEK, ...horizon])], {
    isHoliday: date => !TERMS.some(term => date >= term.starts_on && date <= term.ends_on)
  });
  const openings = findOpenings(openingDays(capacity, TODAY, addDays(TODAY, 13)), ALMANAC_WANTS);
  return {
    today: TODAY,
    days: WEEK,
    capacity,
    events,
    openings,
    pending: [],
    decisions: [],
    profile: { day_profile: { sleep: '22:30' } },
    ...overrides
  };
}

test('bedtimeFromSleep subtracts 30 minutes and caps at 22:00', () => {
  assert.equal(bedtimeFromSleep('22:30'), '22:00');
  assert.equal(bedtimeFromSleep('23:00'), '22:00');
  assert.equal(bedtimeFromSleep('22:00'), '21:30');
});

test('Thursday 34% yields Sara skip_workout and bedtime; Monday yields nothing', () => {
  const ghosts = proposeGhosts(baseInput());
  for (const ghost of ghosts) validateGhost(ghost);

  const skip = ghosts.find(g => g.kind === 'skip_workout');
  const bed = ghosts.find(g => g.kind === 'bedtime');
  assert.ok(skip);
  assert.equal(skip.id, ghostId('sara', 'skip_workout', '2026-09-24'));
  assert.equal(skip.agent, 'sara');
  assert.equal(skip.date, '2026-09-24');
  assert.equal(skip.reason, 'capacity 34%, sore throat');
  assert.equal(skip.workoutPath, 'records/2026/09/24/workout-1815.md');
  assert.equal(skip.overItem, 'thu-workout');

  assert.ok(bed);
  assert.equal(bed.id, ghostId('sara', 'bedtime', '2026-09-24'));
  assert.equal(bed.time, '22:00');
  assert.equal(bed.reason, '5.4 h last night');

  const mondayOnly = proposeGhosts(baseInput({
    today: '2026-09-21',
    days: ['2026-09-21'],
    openings: []
  }));
  assert.equal(mondayOnly.length, 0);
});

test('good night lands on the first qualifying evening from findOpenings', () => {
  const input = baseInput();
  const goodNight = input.openings.find(o => o.wantId === 'good-night');
  assert.ok(goodNight?.dates?.[0]);
  const ghosts = proposeGhosts(input);
  const protect = ghosts.find(g => g.kind === 'protect_block' && g.with === 'corey');
  assert.ok(protect);
  assert.equal(protect.date, goodNight.dates[0]);
  assert.equal(protect.start, '18:00');
  assert.equal(protect.end, '22:00');
  assert.equal(protect.title, 'Good night: dinner out + a show');
  assert.equal(protect.id, ghostId('hammond', 'protect_block', goodNight.dates[0]));
});

test('rerunning is idempotent — known ids are skipped', () => {
  const first = proposeGhosts(baseInput());
  assert.ok(first.length >= 2);
  const again = proposeGhosts(baseInput({
    pending: first.map(ghost => ({ ...ghost, status: 'pending', created_at: `${TODAY}T05:30:00+10:00` }))
  }));
  assert.deepEqual(again, []);

  const dismissed = proposeGhosts(baseInput({
    pending: first.map(ghost => ({ ...ghost, status: 'dismissed' }))
  }));
  assert.deepEqual(dismissed, []);
});

test('three recent dismissals throttle that agent+kind to once a week', () => {
  assert.equal(isThrottled([
    { agent: 'sara', kind: 'skip_workout', outcome: 'dismissed', at: '2026-09-20T10:00:00+10:00' },
    { agent: 'sara', kind: 'skip_workout', outcome: 'dismissed', at: '2026-09-15T10:00:00+10:00' },
    { agent: 'sara', kind: 'skip_workout', outcome: 'dismissed', at: '2026-09-10T10:00:00+10:00' }
  ], 'sara', 'skip_workout', TODAY), true);

  assert.equal(isThrottled([
    { agent: 'sara', kind: 'skip_workout', outcome: 'dismissed', at: '2026-09-01T10:00:00+10:00' },
    { agent: 'sara', kind: 'skip_workout', outcome: 'dismissed', at: '2026-08-28T10:00:00+10:00' },
    { agent: 'sara', kind: 'skip_workout', outcome: 'dismissed', at: '2026-08-25T10:00:00+10:00' }
  ], 'sara', 'skip_workout', TODAY), false);

  const ghosts = proposeGhosts(baseInput({
    decisions: [
      { agent: 'sara', kind: 'skip_workout', outcome: 'dismissed', at: '2026-09-20T10:00:00+10:00' },
      { agent: 'sara', kind: 'skip_workout', outcome: 'dismissed', at: '2026-09-15T10:00:00+10:00' },
      { agent: 'sara', kind: 'skip_workout', outcome: 'dismissed', at: '2026-09-10T10:00:00+10:00' }
    ]
  }));
  assert.equal(ghosts.some(g => g.kind === 'skip_workout'), false);
  assert.ok(ghosts.some(g => g.kind === 'bedtime'));
});

test('never proposes into a wall or past 22:00', () => {
  const ghosts = proposeGhosts(baseInput({
    today: '2026-09-27',
    days: ['2026-09-27'],
    openings: [{ wantId: 'good-night', dates: ['2026-09-27'], title: 'Good night', span: 'evening', with: 'corey', pct: 70 }]
  }));
  assert.equal(ghosts.some(g => g.date === '2026-09-27'), false);
  assert.equal(bedtimeFromSleep('23:45'), '22:00');
});
