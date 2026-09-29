/**
 * Step 6: the train-home pass and scarce phone notifications.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { decideNotifications, isSchoolDay, leaveHour, runDaySenseNotify, DAY_REVIEW_PREFIX } from '../../netlify/functions/_shared/day-sense-notify.mjs';
import { cleanSubscription, PUSH_SUBSCRIPTIONS_KEY, sendToAll } from '../../netlify/functions/_shared/push.mjs';
import { createPushHandler } from '../../netlify/functions/push-subscriptions.mjs';
import { createDayReviewHandler, readReviewBody } from '../../netlify/functions/day-review.mjs';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { reviewContent, openDayReview, closeDayReview } from '../../packages/design-kit/js/calendar/day-review-sheet.js';
import { buildTidelineModel } from '../../packages/design-kit/js/calendar/tideline-model.js';
import { tasksEventsFromTasks, tasksEventsFromWorkBlocks, tasksEventsFromWorkSessions } from '../../packages/design-kit/js/calendar/tasks-calendar.js';

const TODAY = '2026-10-14'; // Wed, Term 4
const TERMS = [{ term: 4, starts_on: '2026-10-13', ends_on: '2026-12-17' }];

function memoryStore(seed = []) {
  const data = new Map(seed);
  return {
    data,
    async get(key) { return data.has(key) ? structuredClone(data.get(key)) : null; },
    async setJSON(key, value) { data.set(key, structuredClone(value)); }
  };
}

const SUB = { endpoint: 'https://web.push.apple.com/abc', keys: { p256dh: 'BPk', auth: 'au' } };

test('rules: dexy nudge in its window only; review at leave time on school days; cap and once-a-day', () => {
  const med = { prompt: { slot: 'pm', usual: 16 } };
  const base = { today: TODAY, med, schoolDay: true, leave: 16.75, reviewDone: false, log: { sent: {} } };
  assert.deepEqual(decideNotifications({ ...base, nowHour: 16.6 }).map((m) => m.key), ['dex-pm']);
  assert.deepEqual(decideNotifications({ ...base, nowHour: 17.1 }).map((m) => m.key), ['review'], 'dose nudge window has passed');
  assert.deepEqual(decideNotifications({ ...base, nowHour: 17.1, reviewDone: true }), []);
  assert.deepEqual(decideNotifications({ ...base, nowHour: 17.1, schoolDay: false }), []);
  assert.deepEqual(decideNotifications({ ...base, nowHour: 16.6, log: { sent: { 'dex-pm': 'x' } } }), [], 'never twice');
  assert.deepEqual(decideNotifications({ ...base, nowHour: 16.6, log: { sent: { a: 1, b: 1, c: 1, d: 1 } } }), [], 'daily cap');
  const [dex] = decideNotifications({ ...base, nowHour: 16.6 });
  assert.equal(dex.url, '/#/calendar/day?sheet=dexy');
  assert.match(dex.body, /usually take it around 4 pm/);
});

test('leave time and school days', () => {
  assert.equal(leaveHour({ day_profile: { home: '17:30' } }), 16.75);
  assert.equal(leaveHour({ day_profile: { home: '17:30', leave_school: '16:20' } }), 16 + 20 / 60);
  assert.equal(leaveHour(null), 16.75);
  assert.equal(isSchoolDay(TODAY, TERMS), true);
  assert.equal(isSchoolDay('2026-10-03', TERMS), false, 'holidays');
  assert.equal(isSchoolDay('2026-10-17', TERMS), false, 'Saturday');
});

test('runner: no devices → exits before any GitHub read; with a device, sends the review once', async () => {
  let repoOpens = 0;
  const openRepo = async () => {
    repoOpens += 1;
    return { client: { async resolveTree() { return { tree: [] }; } }, decodeBlob: () => '' };
  };
  const quiet = memoryStore();
  const result = await runDaySenseNotify({ store: quiet, now: new Date('2026-10-14T06:00:00Z'), loadProfile: async () => null, loadTerms: async () => TERMS, openRepo });
  assert.deepEqual(result, { sent: [], skipped: 'no_devices' });
  assert.equal(repoOpens, 0);

  const store = memoryStore([[PUSH_SUBSCRIPTIONS_KEY, [SUB]]]);
  const sent = [];
  const send = async (_store, message) => { sent.push(message.key); return { delivered: 1, pruned: 0 }; };
  const at = new Date('2026-10-14T06:00:00Z'); // 5:00 pm Sydney (AEDT)
  const first = await runDaySenseNotify({ store, now: at, loadProfile: async () => ({ day_profile: { home: '17:30' } }), loadTerms: async () => TERMS, openRepo, send });
  assert.deepEqual(first.sent, ['review']);
  const again = await runDaySenseNotify({ store, now: new Date('2026-10-14T06:10:00Z'), loadProfile: async () => ({ day_profile: { home: '17:30' } }), loadTerms: async () => TERMS, openRepo, send });
  assert.deepEqual(again.sent, [], 'once a day');
  store.data.set(`${DAY_REVIEW_PREFIX}2026-10-15`, { at: 'x' });
  assert.equal(repoOpens, 1, 'dose history read once a day, not every run');
});

test('push: subscriptions are cleaned; dead endpoints are pruned on send', async () => {
  assert.equal(cleanSubscription({ endpoint: 'http://x', keys: { p256dh: 'a', auth: 'b' } }), null);
  assert.deepEqual(cleanSubscription({ ...SUB, extra: 1 }), SUB);
  const store = memoryStore([[PUSH_SUBSCRIPTIONS_KEY, [SUB, { ...SUB, endpoint: 'https://fcm.googleapis.com/gone' }]]]);
  const result = await sendToAll(store, { title: 't', body: 'b', url: '/' }, {
    env: {},
    send: async (sub) => {
      if (sub.endpoint.includes('gone')) throw Object.assign(new Error('gone'), { statusCode: 410 });
    }
  });
  assert.deepEqual(result, { delivered: 1, pruned: 1 });
  assert.equal(store.data.get(PUSH_SUBSCRIPTIONS_KEY).length, 1);
});

const SECRET = 's'.repeat(32);
const NOW = Date.parse('2026-10-14T17:05:00+11:00');
const SESSION = createSessionToken({ now: NOW, randomBytes: () => Buffer.alloc(16, 3) }, SECRET).token;
const ENV = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: SECRET };
const req = (url, method = 'GET', body) => new Request(`https://api.example${url}`, {
  method,
  headers: { cookie: `life_hub_session=${SESSION}`, 'content-type': 'application/json' },
  ...(body ? { body: JSON.stringify(body) } : {})
});

test('/api/push: public key (private key never returned), register, unregister', async () => {
  const store = memoryStore();
  const handler = createPushHandler({ env: ENV, now: () => NOW, getContentStore: async () => store });
  const key = await (await handler(req('/api/push'))).json();
  assert.match(key.data.publicKey, /^[A-Za-z0-9_-]{80,}$/);
  assert.equal(JSON.stringify(key).includes('privateKey'), false);
  assert.equal((await handler(req('/api/push', 'POST', { subscription: SUB, label: 'iPhone' }))).status, 200);
  assert.equal(store.data.get(PUSH_SUBSCRIPTIONS_KEY).length, 1);
  assert.equal((await handler(req('/api/push', 'DELETE', { endpoint: SUB.endpoint }))).status, 200);
  assert.equal(store.data.get(PUSH_SUBSCRIPTIONS_KEY).length, 0);
});

test('/api/day-review: outcomes on blocks, notes on tasks, empty note keeps the old bookmark', async () => {
  assert.equal(readReviewBody({ date: TODAY, outcomes: [{ blockId: 'wb', outcome: 'finished' }] }).error, 'invalid_request');
  const store = memoryStore([
    ['work_blocks/wb-1', { id: 'wb-1', title: 'Reports', date: TODAY }],
    ['tasks/reports', { id: 'reports', title: 'Reports', bookmark: { note: 'old', at: 'x' } }],
    ['tasks/unyouth', { id: 'unyouth', title: 'UNYouth' }]
  ]);
  const handler = createDayReviewHandler({ env: ENV, now: () => NOW, getContentStore: async () => store });
  assert.equal((await (await handler(req(`/api/day-review?date=${TODAY}`))).json()).data.done, false);
  const response = await handler(req('/api/day-review', 'POST', {
    date: TODAY,
    outcomes: [{ blockId: 'wb-1', outcome: 'blocked' }],
    bookmarks: [{ taskId: 'unyouth', note: 'Stopped at the sponsor list' }, { taskId: 'reports', note: '  ' }]
  }));
  assert.equal(response.status, 200);
  assert.equal(store.data.get('work_blocks/wb-1').outcome, 'blocked');
  assert.equal(store.data.get('tasks/unyouth').bookmark.note, 'Stopped at the sponsor list');
  assert.equal(store.data.get('tasks/reports').bookmark.note, 'old');
  assert.equal((await (await handler(req(`/api/day-review?date=${TODAY}`))).json()).data.done, true);
});

test('pass content and sheet: ended blocks, tasks worked today, tomorrow; Save posts outcomes + notes', async () => {
  const week = ['2026-10-12', '2026-10-13', TODAY, '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'];
  const tasks = [{ id: 'unyouth', title: 'UNYouth planning', due_date: '2026-10-20', status: 'open', bookmark: { note: 'sponsor list' } }];
  const events = [
    ...tasksEventsFromTasks(tasks),
    ...tasksEventsFromWorkBlocks([
      { id: 'wb-1', title: 'Reports', date: TODAY, start_time: '09:00', duration_minutes: 60, status: 'confirmed' },
      { id: 'wb-2', title: 'Planning', date: TODAY, start_time: '19:00', duration_minutes: 60, status: 'confirmed' },
      { id: 'wb-tmrw', title: 'Marking', date: '2026-10-15', start_time: '08:00', duration_minutes: 60, status: 'confirmed' }
    ]),
    ...tasksEventsFromWorkSessions([{ id: 's1', task_id: 'unyouth', started_at: '2026-10-14T13:00:00+11:00', finished_at: '2026-10-14T13:40:00+11:00' }],
      new Map([['unyouth', 'UNYouth planning']]), { now: NOW })
  ];
  const model = buildTidelineModel({ events, week, today: TODAY, nowHour: 17 });
  const content = reviewContent(model, TODAY, 17);
  assert.deepEqual(content.blocks.map((b) => b.id), ['wb-1'], 'only blocks that have ended');
  assert.deepEqual(content.tasks.map((t) => [t.id, t.previous]), [['unyouth', '']]);
  assert.match(content.tomorrow.text, /Thursday: Marking at 8 am/);

  const window = new Window({ url: 'https://life-hub.adam-russell.com/' });
  const doc = window.document;
  const posted = [];
  let saved = false;
  openDayReview({
    doc, model, today: TODAY, nowHour: 17,
    apiFetch: async (path, init) => { posted.push([path, JSON.parse(init.body)]); return new window.Response('{"ok":true,"data":{"saved":true}}'); },
    onSaved: () => { saved = true; }
  });
  const sheet = doc.querySelector('[data-part="day-review"]');
  sheet.querySelector('[data-block="wb-1"] [data-outcome="mixed"]').click();
  sheet.querySelector('[data-task="unyouth"] input').value = 'Up to budget line 3';
  sheet.querySelector('[data-review="save"]').click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(posted, [['/api/day-review', { date: TODAY, outcomes: [{ blockId: 'wb-1', outcome: 'mixed' }], bookmarks: [{ taskId: 'unyouth', note: 'Up to budget line 3' }] }]]);
  assert.equal(saved, true);
  assert.match(sheet.textContent, /Saved\./);
  closeDayReview();
});
