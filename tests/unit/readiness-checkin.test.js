import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createReadinessCheckinHandler, readCheckinBody, CHECKIN_PREFIX } from '../../netlify/functions/readiness-checkin.mjs';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { planCheckin, renderMorningCheckin } from '../../apps/life/js/app/morning-checkin.js';
import { loadLifeCalendarEvents } from '../../packages/design-kit/js/calendar/load-life-events.js';
import { capacityForDates } from '../../packages/design-kit/js/calendar/capacity-model.js';

const TODAY = '2026-10-14';
const SECRET = 's'.repeat(32);
const NOW = Date.parse('2026-10-14T07:05:00+11:00');
const SESSION = createSessionToken({ now: NOW, randomBytes: () => Buffer.alloc(16, 3) }, SECRET).token;
const ENV = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: SECRET };
const req = (url, method = 'GET', body) => new Request(`https://api.example${url}`, {
  method,
  headers: { cookie: `life_hub_session=${SESSION}`, 'content-type': 'application/json' },
  ...(body ? { body: JSON.stringify(body) } : {})
});

function memoryStore(seed = []) {
  const data = new Map(seed);
  return {
    data,
    async get(key) { return data.has(key) ? structuredClone(data.get(key)) : null; },
    async setJSON(key, value) { data.set(key, structuredClone(value)); }
  };
}

const PREDICTION = { pct: 80, low: 68, high: 92, issued_at: '2026-10-13T20:05:00.000Z' };

test('body validation: only known questions and answers, at most three, a prediction always', () => {
  assert.equal(readCheckinBody({ date: TODAY, answers: { overall: 'limited' }, prediction: PREDICTION, final: 46 }).action, 'answer');
  assert.equal(readCheckinBody({ date: TODAY, answers: { overall: 'great' }, prediction: PREDICTION, final: 46 }).error, 'invalid_request');
  assert.equal(readCheckinBody({ date: TODAY, answers: { mood: 'good' }, prediction: PREDICTION, final: 46 }).error, 'invalid_request');
  assert.equal(readCheckinBody({ date: TODAY, answers: { overall: 'limited' }, final: 46 }).error, 'invalid_request');
  assert.equal(readCheckinBody({ date: TODAY, skipped: true, prediction: PREDICTION }).action, 'skip');
  assert.equal(readCheckinBody({ date: TODAY, action: 'reason', reason_codes: ['made_up'] }).error, 'invalid_request');
});

test('/api/readiness-checkin: save with the issued prediction, add a reason later, refuse a second answer', async () => {
  const store = memoryStore();
  const handler = createReadinessCheckinHandler({ env: ENV, now: () => NOW, getContentStore: async () => store });
  assert.equal((await (await handler(req(`/api/readiness-checkin?date=${TODAY}`))).json()).data.done, false);

  const saved = await handler(req('/api/readiness-checkin', 'POST', {
    date: TODAY, answers: { overall: 'limited' }, questions: ['overall'], prediction: PREDICTION, final: 46
  }));
  assert.equal(saved.status, 200);
  const record = store.data.get(`${CHECKIN_PREFIX}${TODAY}`);
  assert.equal(record.predicted_estimate, 80, 'the pre-answer prediction, not the revised number');
  assert.deepEqual(record.predicted_range, [68, 92]);
  assert.equal(record.final_estimate, 46);
  assert.equal(record.residual, -34);
  assert.equal(record.reason_status, 'pending');

  const reason = await handler(req('/api/readiness-checkin', 'POST', { date: TODAY, action: 'reason', reason_codes: ['work_fatigue'] }));
  assert.equal(reason.status, 200);
  assert.deepEqual(store.data.get(`${CHECKIN_PREFIX}${TODAY}`).reason_codes, ['work_fatigue']);
  assert.equal(store.data.get(`${CHECKIN_PREFIX}${TODAY}`).residual, -34, 'a reason never rewrites the residual');

  const again = await handler(req('/api/readiness-checkin', 'POST', { date: TODAY, answers: { overall: 'full' }, prediction: PREDICTION, final: 100 }));
  assert.equal(again.status, 409);

  const range = await (await handler(req(`/api/readiness-checkin?from=2026-10-01&to=${TODAY}`))).json();
  assert.equal(range.data.checkins.length, 1);
  assert.equal((await handler(req('/api/readiness-checkin?from=2026-01-01&to=2026-10-14'))).status, 400, 'range is bounded');
});

test('a skip hides the card and is not evidence; answering later supersedes it', async () => {
  const store = memoryStore();
  const handler = createReadinessCheckinHandler({ env: ENV, now: () => NOW, getContentStore: async () => store });
  await handler(req('/api/readiness-checkin', 'POST', { date: TODAY, skipped: true, prediction: PREDICTION }));
  const skip = store.data.get(`${CHECKIN_PREFIX}${TODAY}`);
  assert.equal(skip.skipped, true);
  const cap = capacityForDates([{ record: skip }], [TODAY]).get(TODAY);
  assert.equal(cap.forecast, true);
  const after = await handler(req('/api/readiness-checkin', 'POST', { date: TODAY, answers: { overall: 'strong' }, prediction: PREDICTION, final: 84 }));
  assert.equal(after.status, 200);
  assert.equal(store.data.get(`${CHECKIN_PREFIX}${TODAY}`).supersedes_observation_id, skip.id);
});

function dom() {
  const window = new Window({ url: 'https://life-hub.adam-russell.com/' });
  const doc = window.document;
  doc.body.innerHTML = '<section id="morning-checkin" hidden></section>';
  return { window, doc };
}

function fakeApi({ done = false } = {}) {
  const posts = [];
  const apiFetch = async (path, init) => {
    if (!init || init.method !== 'POST') {
      return new Response(JSON.stringify({ ok: true, data: { done, checkin: null } }), { status: 200 });
    }
    const body = JSON.parse(init.body);
    posts.push(body);
    const checkin = { predicted_estimate: body.prediction?.pct, final_estimate: body.final };
    return new Response(JSON.stringify({ ok: true, data: { saved: true, checkin } }), { status: 200 });
  };
  return { apiFetch, posts };
}

const morning = () => new Date(NOW);

test('card: nothing preselected, Done posts answers with the prediction, then the card disappears', async () => {
  const { doc } = dom();
  const { apiFetch, posts } = fakeApi();
  await renderMorningCheckin(doc, { apiFetch, events: [], date: TODAY, now: morning });
  const host = doc.querySelector('#morning-checkin');
  assert.equal(host.hidden, false);
  assert.equal(host.querySelector('.checkin__title').textContent, 'How are you starting today?');
  assert.equal(host.querySelectorAll('[aria-pressed="true"]').length, 0, 'never pre-answered');
  const done = [...host.querySelectorAll('button')].find(b => b.textContent === 'Done');
  assert.equal(done.disabled, true);
  host.querySelector('[data-question="overall"] [data-answer="strong"]').click();
  assert.equal(done.disabled, false);
  done.click();
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
  assert.equal(posts.length, 1);
  assert.deepEqual(posts[0].answers, { overall: 'strong' });
  assert.equal(posts[0].prediction.pct, 80);
  assert.equal(host.hasAttribute('hidden'), true);
  assert.equal(host.childElementCount, 0);
});

test('card: a big miss asks what we missed, once, after saving', async () => {
  const { doc } = dom();
  const { apiFetch, posts } = fakeApi();
  await renderMorningCheckin(doc, { apiFetch, events: [], date: TODAY, now: morning });
  const host = doc.querySelector('#morning-checkin');
  host.querySelector('[data-answer="empty"]').click();
  [...host.querySelectorAll('button')].find(b => b.textContent === 'Done').click();
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
  assert.match(host.textContent, /What did we miss\?/);
  host.querySelector('[data-reason="not_sure"]').click();
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(posts.at(-1), { date: TODAY, action: 'reason', reason_codes: ['not_sure'] });
  assert.equal(host.hasAttribute('hidden'), true);
});

test('card: stays away once done, and after 2 pm', async () => {
  const { doc } = dom();
  await renderMorningCheckin(doc, { apiFetch: fakeApi({ done: true }).apiFetch, events: [], date: TODAY, now: morning });
  assert.equal(doc.querySelector('#morning-checkin').hasAttribute('hidden'), true);
  const late = () => new Date(Date.parse('2026-10-14T15:00:00+11:00'));
  await renderMorningCheckin(doc, { apiFetch: fakeApi().apiFetch, events: [], date: TODAY, now: late });
  assert.equal(doc.querySelector('#morning-checkin').hasAttribute('hidden'), true);
});

test('plan: a rough yesterday asks about sleep and the named symptom', () => {
  const plan = planCheckin([
    { record: { type: 'diary', date: '2026-10-13', energy: 'low' }, body: 'Headache all afternoon' }
  ], TODAY, new Date(NOW));
  assert.deepEqual(plan.questions.map(q => q.id).slice(0, 2), ['sleep', 'health']);
  assert.equal(plan.questions[1].prompt, 'How is the headache today?');
  assert.ok(plan.prediction.pct < 80);
});

test('loader: saved check-ins join the Life events; a failed read never blocks the calendar', async () => {
  const checkin = { type: 'readiness_checkin', date: TODAY, answers: { overall: 'limited' } };
  const ok = async (path) => {
    if (path.startsWith('/api/repo/manifest')) return new Response(JSON.stringify({ ok: true, data: { files: [] } }), { status: 200 });
    if (path.startsWith('/api/readiness-checkin')) return new Response(JSON.stringify({ ok: true, data: { checkins: [checkin] } }), { status: 200 });
    return new Response('{}', { status: 404 });
  };
  const { events } = await loadLifeCalendarEvents(ok, { today: TODAY });
  assert.deepEqual(events.map(e => e.record.type), ['readiness_checkin']);
  assert.ok(capacityForDates(events, [TODAY]).get(TODAY).pct < 60);

  const failing = async (path) => (path.startsWith('/api/repo/manifest')
    ? new Response(JSON.stringify({ ok: true, data: { files: [] } }), { status: 200 })
    : new Response('{}', { status: 500 }));
  assert.deepEqual((await loadLifeCalendarEvents(failing, { today: TODAY })).events, []);
});
