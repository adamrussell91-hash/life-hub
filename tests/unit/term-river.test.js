import test from 'node:test';
import assert from 'node:assert/strict';
import { LANES, byLane, laneFor, riverWeekLabel, weeklyLoad, weeksBetween } from '../../apps/life/js/app/term-river.js';

const TERMS = [
  { term: 3, starts_on: '2026-07-21', ends_on: '2026-09-25' },
  { term: 4, starts_on: '2026-10-13', ends_on: '2026-12-17' }
];

test('lanes are Adam’s identities in About Me order, with Body last', () => {
  assert.deepEqual(LANES.map(l => l.id), ['teacher', 'corey', 'scholar', 'friends', 'body']);
});

test('every kind of item lands in the right lane', () => {
  const cases = [
    [{ type: 'scheduled_lesson', title: 'Y12 English Adv' }, 'teacher'],
    [{ type: 'professional_event', title: 'Courageously Navigating Hard Conversations' }, 'teacher'],
    [{ type: 'project', title: 'Tournament of Minds' }, 'teacher'],
    [{ type: 'calendar_block', kind: 'corey', title: 'Good night: dinner out + a show' }, 'corey'],
    [{ kind: 'protect_block', with: 'corey', title: 'Blue Mountains' }, 'corey'],
    [{ type: 'medical', title: 'Gastroenterologist follow-up' }, 'body'],
    [{ type: 'calendar_block', kind: 'rest', title: 'Wind down' }, 'body'],
    [{ kind: 'event', tags: ['graduation'], title: 'UNSW conferral' }, 'scholar'],
    [{ kind: 'dream', title: 'Study at Harvard, Cambridge, Oxford or Yale' }, 'scholar'],
    [{ title: 'UOW literacy elective' }, 'scholar'],
    [{ title: 'Lunch with Bob' }, 'friends'],
    [{ title: 'Newcastle, 2 days · friends' }, 'friends'],
    [{ title: 'Anything', lane: 'friends' }, 'friends'],
    [{ title: 'Unknown thing' }, 'teacher']
  ];
  for (const [item, lane] of cases) assert.equal(laneFor(item), lane, item.title);
  const grouped = byLane(cases.map(([i]) => i));
  assert.equal(Object.values(grouped).flat().length, cases.length, 'nothing lost, nothing duplicated');
  assert.deepEqual(Object.keys(grouped), LANES.map(l => l.id));
});

test('week labels speak school: T3 W10, Hol W1, Hol W2, T4 W1', () => {
  assert.deepEqual(['2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-26'].map(w => riverWeekLabel(w, TERMS)),
    ['T3 W10', 'Hol W1', 'Hol W2', 'T4 W1', 'T4 W3']);
  assert.equal(riverWeekLabel('2026-09-21', []), '21/09');
});

test('weeks run Monday to Sunday', () => {
  assert.deepEqual(weeksBetween('2026-09-24', '2026-10-06'), ['2026-09-21', '2026-09-28', '2026-10-05']);
});

test('the load strip uses the capacity model’s rule: classes, Corey time and ghosts never count', () => {
  const pct = d => (d >= '2026-11-16' && d <= '2026-11-22' ? 40 : d < '2026-09-26' ? 60 : 80);
  const reports = Array.from({ length: 5 }, (_, i) => ({ date: `2026-11-${16 + i}`, start: 15.5, end: 20, title: 'Reports' }));
  const load = weeklyLoad({
    from: '2026-09-21', to: '2026-11-22', terms: TERMS,
    commitments: [
      { date: '2026-09-21', start: 10.85, end: 14.85, title: 'Resource day' },
      { date: '2026-09-24', start: 13.25, end: 14.25, title: 'Gastro' },
      { date: '2026-09-22', start: 8.67, end: 9.58, title: 'Y12', isClass: true },
      { date: '2026-09-24', start: 19.5, end: 21.5, title: 'Corey', protected: true },
      { date: '2026-09-26', start: 18, end: 22, title: 'Good night', ghost: true },
      ...reports
    ],
    capacityFor: pct
  });
  const w10 = load.find(w => w.week === '2026-09-21');
  assert.equal(w10.booked, 5, 'resource day 4 h + gastro 1 h');
  assert.equal(w10.capacity, 27.5, '5 days at 60% (18 h) + 2 days at 80% (9.6 h), rounded to the half hour');
  assert.equal(w10.over, false);
  const hol1 = load.find(w => w.week === '2026-09-28');
  assert.equal(hol1.holiday, true);
  assert.equal(hol1.booked, 0);
  const reportWeek = load.find(w => w.week === '2026-11-16');
  assert.equal(reportWeek.booked, 22.5);
  assert.equal(reportWeek.over, true, 'report-writing at 40% runs over');
});
