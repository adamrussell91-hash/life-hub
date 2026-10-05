/**
 * Capacity forecast redesign: readiness model, morning bubbles, check-in persistence,
 * weather icons and the Day view panel.
 * Acceptance examples: docs/capacity-forecast-handoff/implementation-brief.md.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import {
  ANSWERS,
  MODEL_VERSION,
  WEATHER_STATES,
  availableAt,
  collectEvidence,
  computeReadiness,
  dayState,
  discrepancy,
  explainReadiness,
  historyPrior,
  projectDay,
  weatherState
} from '../../packages/design-kit/js/calendar/readiness-model.js';
import { QUESTIONS, answersFrom, selectQuestions } from '../../packages/design-kit/js/calendar/morning-bubbles.js';
import { WEATHER_ICONS, WEATHER_ICON_FAMILY } from '../../packages/design-kit/js/calendar/weather-icons.js';
import { FAMILIES, ICON_FAMILY, recolour } from '../../scripts/build-weather-icons.mjs';
import {
  centralNodeLine,
  createCapacityCheckinsHandler,
  liveObservations,
  readAnswers,
  upsertCentralNodeLine
} from '../../netlify/functions/capacity-checkins.mjs';
import { decideNotifications } from '../../netlify/functions/_shared/day-sense-notify.mjs';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { buildTidelineModel } from '../../packages/design-kit/js/calendar/tideline-model.js';
import { mountCheckinCard, mountReadinessPanel, resetReadinessPanel, todayForecast } from '../../packages/design-kit/js/calendar/readiness-panel.js';
import { resetCheckins, withCheckins, recordObservation, checkinState, loadCheckins } from '../../packages/design-kit/js/calendar/readiness-checkins.js';
import { checkinEvents, priorWorkload } from '../../packages/design-kit/js/calendar/readiness-model.js';
import { capacityForDates } from '../../apps/life/js/app/capacity-model.js';
import { buildAlmanac } from '../../netlify/functions/almanac.mjs';

const DATE = '2026-10-05'; // Monday
const ev = (extra = {}) => ({ date: DATE, symptoms: [], exercise: null, ...extra });
const TOP = { energy: 'energised', focus: 'sharp', mood: 'good' };
const score = (answers, hours = 2, exercise = null) =>
  computeReadiness({ evidence: ev({ exercise }), answers: { ...TOP, ...answers }, priorWorkHours: hours }).score;

/* ------------------------------------------------------------------ model */

test('100 is reachable: everything supportive and no limiting context', () => {
  assert.equal(score({ sleep: 'restorative' }, 2), 100);
});

test('sleep, workload and exercise all bite, even with good energy/focus/mood answers', () => {
  const poorHeavy = score({ sleep: 'poor' }, 7);
  const poorHeavyHard = score({ sleep: 'poor' }, 7, 'strenuous');
  const restHeavy = score({ sleep: 'restorative' }, 7);
  assert.equal(poorHeavy, 72);
  assert.equal(poorHeavyHard, 67);
  assert.equal(restHeavy, 97);
  assert.ok(poorHeavyHard < score({ sleep: 'restorative' }, 1), 'restorative + light demand beats poor + heavy + hard');
});

test('missing sleep keeps a usable forecast: same estimate, wider band for staler evidence', () => {
  const two = computeReadiness({ evidence: ev(), sleepStaleDays: 2 });
  const seven = computeReadiness({ evidence: ev(), sleepStaleDays: 7 });
  assert.equal(two.score, seven.score, 'non-response does not move the estimate');
  assert.ok(seven.spread > two.spread, 'staler sleep widens the band');
  assert.ok(two.score > 0 && two.sleepKnown === false);
  assert.ok(!two.contributors.some(c => c.id === 'sleep' && c.effect < 0 && c.source !== 'unconfirmed'), 'missing sleep is not read as poor sleep');
  assert.match(explainReadiness(two), /sleep is unconfirmed/);
});

test('history crosses week boundaries: Monday uses Sunday', () => {
  const h = historyPrior([{ date: '2026-10-04', score: 40 }, { date: '2026-10-01', score: 60 }], DATE);
  assert.equal(h.yesterday, 40);
  assert.ok(h.value < 60);
});

test('a 10 pm diary never enters a 7 am forecast for the same day', () => {
  const events = [
    { record: { type: 'diary', date: DATE, time: '22:00', energy: 'low', mood_score: 2 } },
    { record: { type: 'diary', date: '2026-10-04', time: '21:00', energy: 'high' } }
  ];
  const morning = collectEvidence(events, { date: DATE, issuedLocal: `${DATE}T07:00` });
  assert.equal(morning.priorEnergy, 100, 'only yesterday evening’s diary is known at 7 am');
  assert.equal(morning.priorMood, null);
  const night = collectEvidence(events, { date: DATE, issuedLocal: `${DATE}T23:00` });
  assert.equal(night.priorEnergy, 30);
  assert.equal(availableAt({ date: DATE, created_at: '2026-10-04T20:00:00Z' }), `${DATE}T07:00`, 'entry time wins (Sydney)');
});

test('one episode counts once across diaries and days', () => {
  const events = [
    { record: { type: 'diary', date: '2026-10-03', symptoms: ['sore throat'] } },
    { record: { type: 'diary', date: '2026-10-04', symptoms: ['sore throat'] } },
    { record: { type: 'diary', date: '2026-10-04', notes: 'still a sore throat' } }
  ];
  const e = collectEvidence(events, { date: DATE, issuedLocal: `${DATE}T07:00` });
  assert.deepEqual(e.symptoms, ['sore throat']);
  assert.equal(computeReadiness({ evidence: e }).inputs.health, 65);
});

test('reported readiness corrects the score at once; a lingering answer keeps recovery costs', () => {
  const before = computeReadiness({ evidence: ev({ exercise: 'strenuous' }), priorWorkHours: 7 });
  const after = computeReadiness({ evidence: ev({ exercise: 'strenuous' }), priorWorkHours: 7, answers: { overall: 'limited' } });
  assert.ok(after.score < before.score);
  assert.ok(after.spread < before.spread, 'an answer narrows the band');
  const recovered = computeReadiness({ evidence: ev({ exercise: 'strenuous' }), priorWorkHours: 7, answers: { ...TOP, sleep: 'okay', lingering: 'recovered' } });
  const sore = computeReadiness({ evidence: ev({ exercise: 'strenuous' }), priorWorkHours: 7, answers: { ...TOP, sleep: 'okay', lingering: 'soreness' } });
  assert.ok(sore.score < recovered.score);
  assert.ok(recovered.contributors.some(c => c.id === 'work'), 'fresh answers do not erase prior workload');
});

test('scheduled lunch and free time are opportunity, never a spike', () => {
  const r = computeReadiness({ evidence: ev(), answers: { ...TOP, sleep: 'restorative' } });
  const day = projectDay(r, { items: [{ start: 9, end: 12, kind: 'professional' }, { start: 12, end: 13, kind: 'health', title: 'Lunch' }], nowHour: 7 });
  const at = h => day.points.find(p => p.h === h).score;
  assert.ok(at(13) <= at(9), 'lunch does not lift readiness above the morning');
  assert.ok(day.points.every(p => p.low <= p.score && p.score <= p.high));
  assert.ok(day.points.at(-1).high - day.points.at(-1).low > day.points[0].high - day.points[0].low, 'band widens with horizon');
  assert.ok(day.segments.filter(s => s.changed).length <= day.segments.length);
});

test('weather follows the domain pattern, not score brackets, and unknowns never make weather', () => {
  assert.equal(weatherState({ score: 95, domains: { physical: 95, cognitive: 95, emotional: 95 } }), 1);
  assert.equal(weatherState({ score: 60, domains: { physical: 80, cognitive: 35, emotional: 80 } }), 20);
  assert.equal(weatherState({ score: 60, domains: { physical: 80, cognitive: 80, emotional: 30 } }), 24);
  assert.notEqual(weatherState({ score: 60, domains: { physical: 80, cognitive: 80, emotional: 30 }, known: { physical: true, cognitive: true, emotional: false } }), 24);
  assert.equal(weatherState({ score: 30, domains: { physical: 30, cognitive: 60, emotional: 60 } }), 16, 'low without demand or strain is not a thunderstorm');
  assert.equal(weatherState({ score: 30, domains: { physical: 30, cognitive: 60, emotional: 60 }, demandAhead: 15 }), 27);
  assert.equal(weatherState({ score: 70, domains: {}, evening: true }), 30);
  for (let n = 1; n <= 30; n += 1) assert.ok(WEATHER_STATES[n]?.name && WEATHER_STATES[n].meaning, `state ${n}`);
});

test('the headline explains why, not just a label', () => {
  const r = computeReadiness({ evidence: ev(), answers: { sleep: 'poor' }, priorWorkHours: 7 });
  const text = explainReadiness(r);
  assert.match(text, /heavy workload/);
  assert.match(text, /sleep was poor/);
  assert.equal(r.modelVersion, MODEL_VERSION);
  assert.ok(Number.isInteger(dayState(r, projectDay(r, { nowHour: 7 }))));
});

test('discrepancy uses the issued prediction and respects coarse anchors', () => {
  assert.deepEqual(discrepancy({ predicted: 72, predictedRange: [60, 84], reported: 40 }), { residual: -32, ask: true, direction: 'worse' });
  assert.equal(discrepancy({ predicted: 72, predictedRange: [60, 84], reported: 80 }).ask, false, 'inside the band and within one anchor step');
  assert.equal(discrepancy({ predicted: 50, predictedRange: [40, 60], reported: null }).ask, false);
});

/* ------------------------------------------------------------------ bubbles */

test('bubbles: 1–3 questions, predicted from yesterday, overall last, nothing preselected', () => {
  const plain = selectQuestions({ date: DATE, evidence: ev() });
  assert.equal(plain.opening, 'How are you starting today?');
  assert.deepEqual(plain.questions.map(q => q.id), ['sleep_neutral', 'overall']);
  const followUp = selectQuestions({
    date: DATE,
    observations: [{ local_date: '2026-10-04', observed_at: '2026-10-04T07:00:00Z', answers: { sleep: 'poor', energy: 'drained' } }],
    evidence: ev({ symptoms: ['sore throat'] }),
    priorWork: 'heavy'
  });
  assert.deepEqual(followUp.questions.map(q => q.id), ['sleep_followup', 'symptoms', 'overall']);
  assert.equal(followUp.questions[1].prompt, 'How is the sore throat today?');
  const stale = selectQuestions({ date: DATE, observations: [{ local_date: '2026-09-20', answers: { sleep: 'poor' } }], evidence: ev() });
  assert.equal(stale.questions[0].id, 'sleep_neutral', 'stale context gets a neutral question');
  assert.ok(selectQuestions({ date: DATE, evidence: ev(), priorWork: 'heavy' }).questions.some(q => q.id === 'lingering'));
  assert.deepEqual(answersFrom(followUp.questions, { sleep_followup: 'better_still_tired', overall: 'manageable', symptoms: 'bogus' }), { sleep: 'better_still_tired', overall: 'manageable' });
  for (const q of Object.values(QUESTIONS)) for (const o of q.options) assert.ok(ANSWERS[q.domain][o.code]);
});

/* ------------------------------------------------------------------ icons */

test('icons: all 30 supplied shapes, recoloured by condition family, numbering intact', () => {
  for (let n = 1; n <= 30; n += 1) {
    const original = readFileSync(new URL(`../../packages/design-kit/icons/capacity-weather/src/${n}.svg`, import.meta.url), 'utf8');
    const strip = svg => svg.replace(/#[0-9A-Fa-f]{6}/g, '#').replace(/"(?:wx-title-\d+|title)"/g, '"T"');
    assert.equal(strip(WEATHER_ICONS[n]), strip(original.trim()), `icon ${n} keeps Adam's geometry`);
    assert.equal(WEATHER_ICON_FAMILY[n], WEATHER_STATES[n].family, `icon ${n} family matches its state`);
    assert.equal(ICON_FAMILY[n], WEATHER_STATES[n].family);
    assert.ok(WEATHER_ICONS[n].includes(`<title id="wx-title-${n}">${WEATHER_STATES[n].name}</title>`), `icon ${n} title is its state`);
  }
  assert.throws(() => recolour('<svg fill="#123456"/>', 'clear'), /no role/);
  assert.ok(Object.keys(FAMILIES).length >= 7);
});

/* ------------------------------------------------------------------ server */

const SECRET = 's'.repeat(32);
const NOW = Date.parse('2026-10-05T07:05:00+11:00');
const SESSION = createSessionToken({ now: NOW, randomBytes: () => Buffer.alloc(16, 3) }, SECRET).token;
const ENV = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: SECRET };
const req = (url, method = 'GET', body) => new Request(`https://api.example${url}`, {
  method,
  headers: { cookie: `life_hub_session=${SESSION}`, 'content-type': 'application/json' },
  ...(body ? { body: JSON.stringify(body) } : {})
});
function memoryStore() {
  const data = new Map();
  return {
    data,
    async get(key) { return data.has(key) ? structuredClone(data.get(key)) : null; },
    async setJSON(key, value) { data.set(key, structuredClone(value)); },
    async list({ prefix } = {}) { return { blobs: [...data.keys()].filter(k => k.startsWith(prefix ?? '')).map(key => ({ key })) }; }
  };
}
const SNAP = { predicted_estimate: 72, predicted_range: [60, 84], model_version: MODEL_VERSION, domains: { physical: 70 }, state: 13, sneaky: 'x' };

test('/api/capacity-checkins: immutable snapshot, append-only observation, server-side residual, reason, delete', async () => {
  const store = memoryStore();
  const writes = [];
  const cn = '# Central Node\n\n## 📝 Recent Agent Actions\n**4 Oct:** Sara: Logged a walk.\n';
  const openRepo = async () => ({ client: {
    resolveTree: async () => ({ tree: [{ path: 'central-node.md', type: 'blob', sha: 'a' }] }),
    readBlob: async () => ({ encoding: 'base64', content: Buffer.from(cn).toString('base64') }),
    writeFile: async args => { writes.push(args); return { sha: 'b' }; }
  } });
  let clock = NOW;
  const handler = createCapacityCheckinsHandler({ env: ENV, now: () => clock, getContentStore: async () => store, openRepo });
  const call = async (...args) => { const r = await handler(req(...args)); return { status: r.status, body: await r.json() }; };

  const first = await call('/api/capacity-checkins', 'POST', { action: 'snapshot', date: DATE, snapshot: SNAP });
  assert.equal(first.status, 201);
  assert.equal(first.body.data.snapshot.sneaky, undefined, 'only the archived shape is stored');
  const again = await call('/api/capacity-checkins', 'POST', { action: 'snapshot', date: DATE, snapshot: { ...SNAP, predicted_estimate: 10 } });
  assert.equal(again.status, 200);
  assert.equal(again.body.data.snapshot.predicted_estimate, 72, 'the first issued forecast is kept');

  clock += 60_000;
  const bad = await call('/api/capacity-checkins', 'POST', { action: 'observe', date: DATE, answers: { sleep: 'great' } });
  assert.equal(bad.status, 400);
  const obs = await call('/api/capacity-checkins', 'POST', { action: 'observe', date: DATE, answers: { sleep: 'better_still_tired', overall: 'limited' }, predicted_estimate: 40 });
  assert.equal(obs.status, 201);
  const o = obs.body.data.observation;
  assert.equal(o.predicted_estimate, 72, 'residual compares with the stored pre-answer forecast');
  assert.equal(o.reported_estimate, 40);
  assert.equal(o.residual, -32);
  assert.equal(o.reason_status, 'pending');
  assert.equal(o.sleep_trend, 'better');
  assert.equal(o.residual_fatigue, true);
  assert.equal(obs.body.data.askReason, true);
  assert.equal(writes.length, 1);
  assert.match(writes[0].content, /\*\*5 Oct:\*\* Capacity: 07:06 morning check-in: readiness lower than forecast; sleep better, still tired\. \(check-in obs_/);
  assert.ok(o.central_node_receipt_id || store.data.get(`capacity/observations/${DATE}/${o.id}`).central_node_receipt_id);

  const late = await call('/api/capacity-checkins', 'POST', { action: 'snapshot', date: '2026-10-06', snapshot: SNAP });
  assert.equal(late.status, 201, 'other days are independent');

  const reason = await call('/api/capacity-checkins', 'POST', { action: 'reason', date: DATE, observation_id: o.id, reason_codes: ['not_sure'] });
  assert.equal(reason.body.data.discrepancy.reason_status, 'unexplained', '"Not sure" is an honest record, not an invented cause');
  assert.equal(store.data.get(`capacity/observations/${DATE}/${o.id}`).residual, -32, 'the reason never rewrites the observation');

  clock += 60_000;
  const fix = await call('/api/capacity-checkins', 'POST', { action: 'observe', date: DATE, answers: { overall: 'manageable' }, supersedes_observation_id: o.id });
  const got = await call(`/api/capacity-checkins?date=${DATE}`);
  assert.deepEqual(got.body.data.observations.map(x => x.id), [fix.body.data.observation.id], 'a correction supersedes; nothing edited in place');
  assert.equal(writes.at(-1).content.match(/Capacity:/g).length, 1, 'one Central Node line per day');

  await call('/api/capacity-checkins', 'POST', { action: 'delete', date: DATE, observation_id: fix.body.data.observation.id });
  const after = await call(`/api/capacity-checkins?date=${DATE}`);
  assert.deepEqual(after.body.data.observations.map(x => x.id), [o.id], 'deleting the correction revives the original, never the deleted one');
  const lateSnap = await call('/api/capacity-checkins', 'POST', { action: 'snapshot', date: '2026-10-07', snapshot: SNAP });
  assert.equal(lateSnap.status, 201);
});

test('a forecast cannot be back-filled after the answer', async () => {
  const store = memoryStore();
  const handler = createCapacityCheckinsHandler({ env: ENV, now: () => NOW, getContentStore: async () => store, openRepo: async () => { throw new Error('offline'); } });
  const obs = await handler(req('/api/capacity-checkins', 'POST', { action: 'observe', date: DATE, answers: { overall: 'strong' } }));
  assert.equal(obs.status, 201, 'GitHub being down never blocks the observation');
  const late = await handler(req('/api/capacity-checkins', 'POST', { action: 'snapshot', date: DATE, snapshot: SNAP }));
  assert.equal(late.status, 409);
  const unauth = await createCapacityCheckinsHandler({ env: ENV, getContentStore: async () => store })(new Request(`https://api.example/api/capacity-checkins?date=${DATE}`));
  assert.equal(unauth.status, 401);
});

test('helpers: answers validation, liveness and the Central Node line', () => {
  assert.equal(readAnswers({ mood: 'good', nonsense: 'x' }), null);
  assert.deepEqual(readAnswers({ focus: 'premise_wrong' }), { focus: 'premise_wrong' });
  const rows = [{ id: 'a', observed_at: '1' }, { id: 'b', observed_at: '2', supersedes_observation_id: 'a' }, { id: 'c', observed_at: '3', deleted_at: 'x' }];
  assert.deepEqual(liveObservations(rows).map(r => r.id), ['b']);
  const line = centralNodeLine({ id: 'obs_1', local_date: DATE, observed_local: `${DATE}T07:05`, reported_estimate: 80, answers: { overall: 'strong' } }, { predicted_estimate: 78 });
  assert.equal(line, '**5 Oct:** Capacity: 07:05 morning check-in: readiness close to forecast. (check-in obs_1)');
  const doc = '## 📝 Recent Agent Actions\n**5 Oct:** Capacity: old line\n';
  assert.equal(upsertCentralNodeLine(doc, line, DATE).match(/Capacity:/g).length, 1);
});

test('7 am nudge: only without a check-in, in its window, once', () => {
  const base = { today: DATE, med: null, schoolDay: true, leave: 16.75, reviewDone: false, log: { sent: {} } };
  assert.deepEqual(decideNotifications({ ...base, nowHour: 7.1, checkinDone: false }).map(m => m.key), ['checkin']);
  assert.equal(decideNotifications({ ...base, nowHour: 7.1, checkinDone: false })[0].url, '/#/home?checkin=1');
  assert.deepEqual(decideNotifications({ ...base, nowHour: 7.1, checkinDone: true }), []);
  assert.deepEqual(decideNotifications({ ...base, nowHour: 10, checkinDone: false }), []);
  assert.deepEqual(decideNotifications({ ...base, nowHour: 7.1, checkinDone: false, log: { sent: { checkin: 'x' } } }), []);
  assert.deepEqual(decideNotifications({ ...base, nowHour: 7.1 }), [], 'callers that do not know stay quiet');
});

/* ------------------------------------------------------------------ views */

test('one number everywhere: Day panel, Week model, Term river input and Almanac agree for the same day', () => {
  const today = '2026-10-08';
  const events = [
    { record: { type: 'sleep', date: '2026-10-06', duration_h: 7.5 } },
    { record: { type: 'diary', date: '2026-10-07', energy: 'low', mood_score: 4 }, body: 'Sore throat starting' },
    { record: { type: 'workout', date: '2026-10-07', status: 'completed', session_kind: 'strength', duration_min: 60, title: 'Upper', exercises: [{ name: 'Press' }] } },
    { path: 'teaching:l1', record: { type: 'scheduled_lesson', date: '2026-10-07', time: '09:00', duration_min: 60 } },
    { path: 'ws:1', record: { type: 'work_session', date: '2026-10-07', time: '13:00', end_time: '17:30' } },
    { path: 'professional:m1', record: { type: 'professional_meeting', date: '2026-10-07', time: '10:00', duration_min: 90, status: 'scheduled' } },
    ...checkinEvents([{ id: 'o1', local_date: today, observed_at: '2026-10-07T20:05:00Z', answers: { sleep: 'better_still_tired', overall: 'manageable' }, reported_estimate: 60 }])
  ];
  const week = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'];
  const tideline = buildTidelineModel({ events, week, today, nowHour: 9 });
  const fromWeek = new Map(tideline.days.map(d => [d.date, d.cap.pct]));
  const yearDays = [];
  for (let d = '2026-09-01'; d <= '2026-12-31'; d = new Date(Date.parse(d) + 86_400_000).toISOString().slice(0, 10)) yearDays.push(d);
  const river = capacityForDates(events, yearDays, { today, isHoliday: () => false });
  const almanac = buildAlmanac({ today, from: today, to: '2026-10-11', anchors: [], logs: events.filter(e => ['sleep', 'diary', 'workout'].includes(e.record.type)), readinessEvents: events.filter(e => !['sleep', 'diary', 'workout'].includes(e.record.type)) });
  const fromAlmanac = new Map(almanac.series.map(p => [p.date, p.pct]));
  const panel = todayForecast({ events, date: today, nowHour: 9, items: [] });
  assert.equal(panel.view.readiness.score, fromWeek.get(today), 'Day panel = Week');
  for (const d of week) assert.equal(river.get(d).pct, fromWeek.get(d), `Term/Year = Week on ${d}`);
  for (const d of ['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']) assert.equal(fromAlmanac.get(d), fromWeek.get(d), `Almanac = Week on ${d}`);
  assert.equal(tideline.days.find(d => d.date === today).cap.checkedIn, true);
});

test('views merge the shared check-ins themselves, so no hub can miss them', async () => {
  resetCheckins();
  const obs = { id: 'o9', local_date: DATE, observed_at: '2026-10-04T20:00:00Z', answers: { overall: 'empty' }, reported_estimate: 20 };
  const apiFetch = async () => new Response(JSON.stringify({ ok: true, data: { snapshot: null, observations: [obs], recent: [] } }), { status: 200 });
  assert.deepEqual(withCheckins([], { apiFetch, today: DATE }), [], 'nothing until loaded');
  await new Promise(r => setTimeout(r, 0));
  const merged = withCheckins([], { apiFetch, today: DATE });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].record.type, 'readiness_checkin');
  assert.equal(buildTidelineModel({ events: [], week: [DATE], today: DATE, nowHour: 8 }).days[0].cap.chips, undefined);
  recordObservation({ ...obs, id: 'o10', supersedes_observation_id: 'o9', answers: { overall: 'full' } });
  assert.deepEqual(checkinState().observations.map(o => o.id), ['o10'], 'a correction replaces what it supersedes');
  resetCheckins();
});

test('yesterday’s workload: tracked sessions are actual, classes and meetings scheduled, task blocks alone are not', () => {
  const y = '2026-10-04';
  assert.deepEqual(priorWorkload([{ record: { type: 'work_block', date: y, time: '09:00', end_time: '17:00' } }], y), { hours: null, source: null });
  assert.deepEqual(priorWorkload([{ record: { type: 'scheduled_lesson', date: y, time: '09:00', end_time: '15:00' } }], y), { hours: 6, source: 'scheduled' });
  const both = priorWorkload([
    { record: { type: 'scheduled_lesson', date: y, time: '09:00', end_time: '12:00' } },
    { record: { type: 'work_session', date: y, time: '13:00', end_time: '15:00' } }
  ], y);
  assert.deepEqual(both, { hours: 5, source: 'actual' });
  const meeting = priorWorkload([
    { record: { type: 'professional_meeting', date: y, time: '15:00', duration_min: 120, status: 'scheduled' } },
    { record: { type: 'professional_meeting', date: y, time: '17:00', duration_min: 60, status: 'cancelled' } }
  ], y);
  assert.deepEqual(meeting, { hours: 1.3, source: 'scheduled' }, 'meetings count at 0.65 of a class hour; cancelled ones not at all');
});

test('panel: forecast, chart and windows render in Day; the bubbles render on Home, start unpicked, and saving posts the snapshot first', async () => {
  resetReadinessPanel();
  resetCheckins();
  const window = new Window({ url: 'https://life.example/' });
  const doc = window.document;
  const side = doc.createElement('div');
  doc.body.append(side);
  const calls = [];
  const apiFetch = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body) : null });
    if (!init.method) return new Response(JSON.stringify({ ok: true, data: { snapshot: null, observations: [], recent: [], discrepancies: [] } }), { status: 200 });
    const body = JSON.parse(init.body);
    if (body.action === 'snapshot') return new Response(JSON.stringify({ ok: true, data: { snapshot: { id: 'fcs_1', ...body.snapshot } } }), { status: 201 });
    return new Response(JSON.stringify({ ok: true, data: { observation: { id: 'obs_1', local_date: DATE, observed_local: `${DATE}T07:20`, answers: body.answers, reported_estimate: 40 }, askReason: true, snapshot: { id: 'fcs_1' } } }), { status: 201 });
  };
  let repaints = 0;
  const ctx = { doc, date: DATE, nowHour: 7.3, now: new Date('2026-10-05T07:20:00+11:00'), events: [], items: [{ start: 9, end: 15, kind: 'teaching', isClass: true }], fallbackHistory: [], apiFetch, onRepaint: () => { repaints += 1; } };
  const paint = () => { side.replaceChildren(); return mountReadinessPanel({ ...ctx, side }); };
  paint();
  await new Promise(r => setTimeout(r, 0));
  assert.ok(repaints >= 1, 'the fetch repaints when it lands');
  paint();
  await new Promise(r => setTimeout(r, 0));
  assert.equal(calls.filter(c => c.body?.action === 'snapshot').length, 1, 'the pre-answer forecast is issued once');
  assert.match(side.querySelector('[data-part="readiness-score"]').textContent, /^\d+\/100$/);
  assert.ok(side.querySelector('[data-part="readiness-why"]').textContent.length > 20);
  assert.ok(side.querySelector('svg.rf-chart path.rf-band'));
  assert.ok(side.querySelector('.rf-icon svg title'));
  assert.equal(side.querySelector('[data-part="checkin"]'), null, 'no bubbles in the Day view');
  assert.match(side.querySelector('[data-part="checkin-status"]').textContent, /Check in on Home/);
  assert.equal(side.querySelector('[data-part="checkin-status"] a').getAttribute('href'), '#/home');
  const home = doc.createElement('div');
  doc.body.append(home);
  const paintHome = () => { home.replaceChildren(); return mountCheckinCard(ctx, home); };
  paintHome();
  assert.match(home.querySelector('[data-part="home-forecast"]').textContent, /^Forecast \d+\/100 · /);
  const form = home.querySelector('[data-part="checkin"]');
  assert.ok(form, 'bubbles show on Home in the morning window');
  assert.equal(form.querySelectorAll('.rf-bubble[aria-pressed="true"]').length, 0, 'nothing preselected');
  assert.equal(form.querySelector('[data-checkin-save]').disabled, true);
  form.querySelector('[data-q="overall"] .rf-bubble[data-code="limited"]').click();
  assert.equal(form.querySelector('[data-checkin-save]').disabled, false);
  form.querySelector('[data-q="overall"] .rf-bubble[data-code="premise_wrong"]').click();
  assert.equal(form.querySelector('[data-q="overall"] .rf-other').hasAttribute('hidden'), false, '"Something else" opens a note');
  form.querySelector('[data-q="overall"] .rf-bubble[data-code="limited"]').click();
  form.dispatchEvent(new window.Event('submit', { cancelable: true }));
  await new Promise(r => setTimeout(r, 0));
  const observe = calls.find(c => c.body?.action === 'observe');
  assert.deepEqual(observe.body.answers, { overall: 'limited' });
  paintHome();
  assert.ok(home.querySelector('[data-part="checkin-reason"]'), 'a big gap asks what we missed');
  assert.match(home.querySelector('[data-part="checkin-reason"]').textContent, /already saved/);
  assert.equal(calls.filter(c => c.body?.action === 'snapshot').length, 1, 'Home and Day share one issued forecast');
  await window.happyDOM.close();
  resetReadinessPanel();
  resetCheckins();
});

test('todayForecast: the pre-answer forecast leaves out today’s check-in', () => {
  const events = checkinEvents([{ id: 'o1', local_date: DATE, observed_at: '2026-10-04T20:00:00Z', answers: { overall: 'empty' }, reported_estimate: 20 }]);
  const f = todayForecast({ events, date: DATE, nowHour: 7, items: [] });
  assert.ok(f.view.readiness.score < f.pre.readiness.score);
  assert.equal(f.pre.readiness.reported, null);
  assert.equal(f.answered, true);
});
