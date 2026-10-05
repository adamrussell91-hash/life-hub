/**
 * Readiness insights: deterministic patterns, offered first, revealed only on a yes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { findInsights } from '../../packages/design-kit/js/calendar/readiness-insights.js';
import { addDays, checkinEvents } from '../../packages/design-kit/js/calendar/readiness-model.js';
import { insightTurn, OFFER_COOLDOWN_DAYS } from '../../netlify/functions/_shared/readiness-insight-turn.mjs';
import { createReadinessInsightsHandler, INSIGHTS_KEY } from '../../netlify/functions/readiness-insights.mjs';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';

const TODAY = '2026-10-20';
const days = n => Array.from({ length: n }, (_, i) => addDays(TODAY, -i)).reverse();

/** Six weeks: every 4th day a "running on empty" check-in, the rest "feeling strong". */
function sixWeeks({ burgerOnLow = true, deleteLow = false } = {}) {
  const obs = [];
  const meals = [];
  days(42).forEach((d, i) => {
    const low = i % 4 === 0;
    obs.push({ id: `o${i}`, local_date: d, observed_at: `${d}T07:00:00Z`, answers: { overall: low ? 'empty' : 'strong', sleep: 'okay' }, ...(low && deleteLow ? { deleted_at: 'x' } : {}) });
    const burger = low ? burgerOnLow : i % 13 === 0;
    meals.push({ path: `meal:${d}`, record: { type: 'meal', date: d, time: '19:00', meal: 'dinner', calories: 900, protein_g: 40, fat_g: 30 }, body: burger ? 'Double cheeseburger and fries' : 'Chicken and rice' });
  });
  return [...checkinEvents(obs), ...meals];
}

test('food on lower-energy days: found with enough evidence, framed as a pattern', () => {
  const insights = findInsights({ events: sixWeeks(), today: TODAY });
  const food = insights.find(i => i.id === 'food:takeaway');
  assert.ok(food, 'takeaway pattern found');
  assert.deepEqual(food.agents, ['brisket']);
  assert.equal(food.topic, 'what you eat on your lower-energy days');
  assert.match(food.finding, /pattern, not a verdict/);
  assert.doesNotMatch(food.topic, /burger|takeaway/i, 'the topic never gives the finding away');
  assert.ok(food.evidence.low_rate - food.evidence.other_rate >= 0.25);
});

test('no pattern without the evidence, and deleted check-ins never count', () => {
  assert.equal(findInsights({ events: sixWeeks({ burgerOnLow: false }), today: TODAY }).some(i => i.id.startsWith('food:')), false);
  assert.equal(findInsights({ events: sixWeeks({ deleteLow: true }), today: TODAY }).some(i => i.id.startsWith('food:')), false, 'without the low check-ins there are no low days to compare');
  assert.deepEqual(findInsights({ events: [], today: TODAY }), []);
});

test('sleep, mood and training patterns reach the right agents', () => {
  const recent = days(7);
  const events = [
    ...checkinEvents(recent.map((d, i) => ({ id: `s${i}`, local_date: d, observed_at: `${d}T07:00:00Z`, answers: { sleep: i < 4 ? 'still_poor' : 'okay', mood: i < 3 ? 'low' : 'okay', lingering: i < 3 ? 'soreness' : 'recovered' } })))
  ];
  const found = findInsights({ events, today: TODAY });
  assert.deepEqual(found.find(i => i.id === 'sleep:run')?.agents, ['sara']);
  assert.deepEqual(found.find(i => i.id === 'mood:run')?.agents, ['penelope', 'vera']);
  assert.deepEqual(found.find(i => i.id.startsWith('training:'))?.agents, ['chadwick']);
});

/* ------------------------------------------------------------------ offer first */

const FOOD = { id: 'food:takeaway', agents: ['brisket'], topic: 'what you eat on your lower-energy days', finding: 'SECRET FINDING TEXT' };
const at = (h) => new Date(Date.parse('2026-10-20T08:00:00Z') + h * 3_600_000);

test('an agent offers the topic only; the finding stays out of the prompt until Adam says yes', () => {
  const first = insightTurn({ slug: 'brisket', message: 'what should I have for lunch?', insights: [FOOD], now: at(0) });
  assert.equal(first.event.kind, 'offered');
  assert.match(first.promptBlock, /topic: what you eat on your lower-energy days/);
  assert.doesNotMatch(first.promptBlock, /SECRET/);
  const yes = insightTurn({ slug: 'brisket', message: 'yes, go on', insights: [FOOD], state: first.state, now: at(0.1) });
  assert.equal(yes.event.kind, 'revealed');
  assert.match(yes.promptBlock, /SECRET FINDING TEXT/);
  assert.match(yes.promptBlock, /not a cause or a judgement/);
});

test('no means no: declined insights go quiet for a month; offers cool down for a week', () => {
  const offered = insightTurn({ slug: 'brisket', message: 'hi', insights: [FOOD], now: at(0) });
  const no = insightTurn({ slug: 'brisket', message: 'not now thanks', insights: [FOOD], state: offered.state, now: at(0.1) });
  assert.equal(no.event.kind, 'declined');
  assert.doesNotMatch(no.promptBlock, /SECRET/);
  assert.equal(insightTurn({ slug: 'brisket', message: 'hi', insights: [FOOD], state: no.state, now: at(24 * 10) }).event, null, 'still quiet after 10 days');
  assert.equal(insightTurn({ slug: 'brisket', message: 'hi', insights: [FOOD], state: no.state, now: at(24 * 31) }).event.kind, 'offered', 'may offer again after a month');

  const ignored = insightTurn({ slug: 'brisket', message: 'hi', insights: [FOOD], state: offered.state, now: at(5) });
  assert.equal(ignored.event, null, 'an unanswered offer is not repeated');
  assert.equal(insightTurn({ slug: 'brisket', message: 'hi', insights: [FOOD], state: offered.state, now: at(24 * OFFER_COOLDOWN_DAYS + 1) }).event.kind, 'offered');
  assert.equal(insightTurn({ slug: 'brisket', message: 'yes', insights: [FOOD], state: offered.state, now: at(4) }).event, null, 'a yes hours later is not consent to an expired offer');
});

test('asking outright reveals; other agents and the off switch see nothing', () => {
  const asked = insightTurn({ slug: 'brisket', message: 'Have you noticed any patterns lately?', insights: [FOOD], now: at(0) });
  assert.equal(asked.event.kind, 'revealed');
  assert.equal(insightTurn({ slug: 'chadwick', message: 'any insights?', insights: [FOOD], now: at(0) }).promptBlock, '');
  assert.equal(insightTurn({ slug: 'brisket', message: 'any insights?', insights: [FOOD], now: at(0), enabled: false }).promptBlock, '');
});

/* ------------------------------------------------------------------ endpoint */

const SECRET = 's'.repeat(32);
const NOW = Date.parse('2026-10-20T07:05:00+11:00');
const SESSION = createSessionToken({ now: NOW, randomBytes: () => Buffer.alloc(16, 3) }, SECRET).token;
const ENV = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: SECRET };
const req = (method = 'GET', body) => new Request('https://api.example/api/readiness-insights', {
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

test('/api/readiness-insights: refresh from logs, topics only on GET, off switch', async () => {
  const store = memoryStore();
  // Six weeks of logs in the repo; low days via sleep + diary, burgers on most of them.
  const files = new Map();
  days(42).forEach((d, i) => {
    const low = i % 4 === 0;
    const [y, m] = d.split('-');
    files.set(`data/sleep/${y}/${m}/${d}-sleep.md`, `---\ntype: sleep\ndate: "${d}"\nduration_h: ${low ? 4.5 : 8}\n---\n`);
    files.set(`data/mind/${y}/${m}/${d}-diary.md`, `---\ntype: diary\ndate: "${d}"\ntime: "21:00"\nenergy: ${low ? 'low' : 'high'}\n---\n`);
    files.set(`data/nutrition/${y}/${m}/${d}-dinner-1900.md`, `---\ntype: meal\ndate: "${d}"\ntime: "19:00"\nmeal: dinner\ncalories: 900\nprotein_g: 40\nfat_g: 30\n---\n${low ? 'Double cheeseburger' : 'Salmon and greens'}\n`);
  });
  const openRepo = async () => ({ listPaths: () => [...files.keys()], readFile: async p => files.get(p) ?? null });
  const handler = createReadinessInsightsHandler({ env: ENV, now: () => new Date(NOW), getContentStore: async () => store, openRepo, loadLessons: async () => [], loadMeetings: async () => [] });
  const refreshed = await (await handler(req('POST', { action: 'refresh' }))).json();
  assert.ok(refreshed.data.count >= 1);
  assert.ok(store.data.get(INSIGHTS_KEY).insights.some(i => i.id === 'food:takeaway'));
  const got = await (await handler(req())).json();
  assert.equal(got.data.enabled, true);
  assert.ok(got.data.insights.length >= 1);
  assert.ok(got.data.insights.every(i => !('finding' in i)), 'findings never leave the server');
  await handler(req('POST', { action: 'settings', enabled: false }));
  assert.equal((await (await handler(req())).json()).data.enabled, false);
  assert.equal((await handler(req('POST', { action: 'settings', enabled: 'nope' }))).status, 400);
});
