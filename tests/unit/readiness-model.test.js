import test from 'node:test';
import assert from 'node:assert/strict';
import {
  READINESS,
  QUESTIONS,
  isDiscrepancy,
  morningContext,
  previewCheckin,
  readinessForDates,
  selectQuestions
} from '../../packages/design-kit/js/calendar/readiness-model.js';
import {
  WEATHER_STATES,
  driftAgainst,
  projectDay,
  weatherCards
} from '../../packages/design-kit/js/calendar/readiness-hourly.js';

const checkin = (date, answers) => ({ record: { type: 'readiness_checkin', date, answers } });
const one = (events, date) => readinessForDates(events, [date]).get(date);

test('all supportive evidence reaches 100; a normal day with no evidence is 80', () => {
  assert.equal(one([checkin('2026-10-05', { overall: 'full', sleep: 'restorative', energy: 'energised', focus: 'sharp' })], '2026-10-05').pct, 100);
  assert.equal(one([], '2026-10-05').pct, READINESS.normal);
});

test('unasked questions do not drag a great morning down (the hidden ceiling is gone)', () => {
  // Mood and health are not asked: they carry their normal values instead of an average day.
  const r = one([checkin('2026-10-05', { sleep: 'restorative', energy: 'energised', focus: 'sharp' })], '2026-10-05');
  assert.ok(r.pct >= 95, `got ${r.pct}`);
});

test('poor sleep + heavy yesterday + hard training is lower than restorative sleep + light day', () => {
  const day = '2026-10-06';
  const heavy = [
    { record: { type: 'work_session', date: '2026-10-05', actual_duration: 420 } },
    { record: { type: 'workout', date: '2026-10-05', day_type: 'workout_45_60' } },
    checkin(day, { sleep: 'still_poor', energy: 'normal', focus: 'distractible' })
  ];
  const light = [checkin(day, { sleep: 'restorative', energy: 'normal', focus: 'distractible' })];
  const a = one(heavy, day);
  const b = one(light, day);
  assert.ok(a.pct < b.pct - 10, `${a.pct} vs ${b.pct}`);
  assert.ok(a.factors.some(f => f.id === 'work'), 'recovery cost survives fresh answers');
  assert.ok(a.factors.some(f => f.id === 'training'));
});

test('missing sleep for two versus seven days: usable, not invented as poor, wider band', () => {
  const lastAnswer = checkin('2026-10-01', { sleep: 'still_poor' });
  const two = one([lastAnswer], '2026-10-03');
  const seven = one([lastAnswer], '2026-10-08');
  assert.ok(seven.pct >= two.pct, 'an old poor night fades instead of holding the score down');
  assert.ok(seven.high - seven.low > two.high - two.low, 'staleness widens uncertainty');
  assert.match(seven.explanation, /unconfirmed/);
});

test('a Monday sees Sunday even when the displayed week starts Monday', () => {
  const sunday = [{ record: { type: 'diary', date: '2026-10-04', energy: 'low' }, body: 'Sore throat' }];
  const monday = one(sunday, '2026-10-05');
  assert.ok(monday.pct < READINESS.normal);
  assert.equal(monday.forecast, true);
});

test('an active illness keeps energy down instead of drifting back to normal', () => {
  const sick = [
    { record: { type: 'diary', date: '2026-10-01' }, body: 'Sore throat and sniffles, wiped out' },
    { record: { type: 'diary', date: '2026-10-02' }, body: 'Sore throat still' }
  ];
  const next = one(sick, '2026-10-03');
  assert.ok(next.pct < 70, `got ${next.pct}`);
  assert.equal(next.note, 'sore throat lingering');
});

test('the check-in updates readiness immediately and keeps the prediction issued before it', () => {
  const ctx = morningContext([], '2026-10-05');
  const predicted = previewCheckin(ctx);
  const answered = previewCheckin(ctx, { overall: 'limited' });
  assert.equal(predicted.pct, 80);
  assert.ok(answered.pct < 60);
  assert.equal(answered.predicted.pct, 80, 'the snapshot is the pre-answer prediction');
  assert.equal(isDiscrepancy(answered.predicted, answered.pct), true);
  assert.equal(isDiscrepancy(answered.predicted, 78), false, 'inside the band is not a discrepancy');
});

test('morning questions: at most three, conditional, never re-asking what the hub knows', () => {
  const quiet = morningContext([checkin('2026-10-04', { sleep: 'restorative', overall: 'strong' })], '2026-10-05');
  const qs = selectQuestions(quiet.state, quiet.yesterday, { symptoms: quiet.symptoms });
  assert.deepEqual(qs.map(q => q.id), ['overall']);

  const rough = morningContext([
    { record: { type: 'diary', date: '2026-10-04', energy: 'low' }, body: 'Sore throat' },
    { record: { type: 'workout', date: '2026-10-04', day_type: 'workout_45_60' } }
  ], '2026-10-05');
  const picked = selectQuestions(rough.state, rough.yesterday, { symptoms: rough.symptoms });
  assert.ok(picked.length <= 3);
  assert.equal(picked[0].id, 'sleep');
  assert.equal(picked[1].prompt, 'How is the sore throat today?');
  for (const q of Object.values(QUESTIONS)) assert.ok(q.options.length >= 4);
});

test('a skipped check-in is not evidence', () => {
  const skipped = { record: { type: 'readiness_checkin', date: '2026-10-05', skipped: true } };
  assert.equal(one([skipped], '2026-10-05').forecast, true);
});

test('hourly: a low day never crashes to zero; gaps recover without passing the morning level', () => {
  const items = [
    { start: 8.67, end: 9.58, isClass: true }, { start: 10, end: 11, isClass: true },
    { start: 11.83, end: 12.75, isClass: true }, { start: 13.67, end: 14.58, isClass: true },
    { start: 15, end: 16, kind: 'meeting' }, { start: 19.5, end: 21.5, kind: 'corey' }
  ];
  const low = projectDay({ start: { pct: 36, low: 25, high: 47 }, items }).points;
  assert.ok(Math.min(...low.map(p => p.pct)) > 15);
  const good = projectDay({ start: { pct: 90, low: 84, high: 96 }, items }).points;
  assert.ok(Math.max(...good.slice(1).map(p => p.pct)) <= 90);
  assert.ok(good.at(-1).pct < 90 && good.at(-1).pct > 55);
  assert.ok(good.at(-1).high - good.at(-1).low > good[0].high - good[0].low, 'band grows with distance');
});

test('hourly: a check-in re-anchors the line and tightens the band; drift is measured against the snapshot', () => {
  const start = { pct: 70, low: 60, high: 80 };
  const before = projectDay({ start }).points;
  const after = projectDay({ start, observations: [{ h: 12, pct: 40 }] }).points;
  const noon = after.find(p => p.h === 12);
  assert.equal(noon.pct, 40);
  assert.ok(noon.high - noon.low < before.find(p => p.h === 12).high - before.find(p => p.h === 12).low);
  const [d] = driftAgainst(before, [{ h: 12, pct: 40 }]);
  assert.ok(d.drift < -15);
});

test('weather: thirty named states; cards only where conditions change, at most six', () => {
  assert.equal(Object.keys(WEATHER_STATES).length, 30);
  const items = [
    { start: 9, end: 9.5, kind: 'meeting' }, { start: 9.5, end: 10, kind: 'meeting' },
    { start: 10, end: 10.5, kind: 'meeting' }, { start: 10.5, end: 11, kind: 'meeting' },
    { start: 14, end: 17, kind: 'task', depth: 'deep' }
  ];
  const { points } = projectDay({ start: { pct: 75, low: 65, high: 85 }, items });
  const cards = weatherCards(points);
  assert.ok(cards.length >= 2 && cards.length <= 6);
  for (const c of cards) assert.equal(WEATHER_STATES[c.id], c.name);
  assert.ok(cards.some(c => c.id === 10), 'back-to-back short meetings read as gusty');
  for (let i = 1; i < cards.length; i++) assert.notEqual(cards[i].id, cards[i - 1].id);
});
