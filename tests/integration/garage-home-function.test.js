import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createGarageHomeHandler } from '../../netlify/functions/garage-home.mjs';
import { createGarageHomeMailScanHandler } from '../../netlify/functions/garage-home-mail-scan-scheduled.mjs';
import { GARAGE_HOME_DATA_PATH, MAILROOM_DATA_PATH } from '../../apps/life/js/app/garage-home-model.js';

const SECRET = 's'.repeat(32);
const COMMIT_SHA = 'c'.repeat(40);
const TREE_SHA = 'd'.repeat(40);
const HOME_SHA = 'a'.repeat(40);
const MAIL_SHA = 'e'.repeat(40);
const baseEnv = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  GITHUB_REPOSITORY: 'life-owner/life-repo',
  GITHUB_BRANCH: 'main',
  GITHUB_TOKEN: 'github-secret-token',
  GITHUB_TOKEN_EXPIRES: '2026-12-01'
};
const gmailEnv = { ...baseEnv, GMAIL_CLIENT_ID: 'id', GMAIL_CLIENT_SECRET: 'secret', GMAIL_REFRESH_TOKEN: 'refresh' };
const session = createSessionToken({ now: Date.parse('2026-10-08T00:00:00Z'), randomBytes: () => Buffer.alloc(16, 4) }, SECRET).token;

// Fictional data only: this repo is public.
const HOME = {
  version: 1,
  places: [{ id: 'wattle-rd', type: 'home', name: 'Wattle Rd', match: ['12 Wattle Rd'], details: {} }],
  visits: [],
  prep: { forDate: null, done: [] },
  settings: { autoFile: { rent: true, statement: true, bill: false } }
};

function request({ method = 'GET', body, cookie = `life_hub_session=${session}` } = {}) {
  return new Request('https://life.example/api/garage-home', {
    method,
    headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

function stub({ home = HOME, mailroom, gmail = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.startsWith('https://oauth2.googleapis.com/token')) return Response.json({ access_token: 'tok' });
    if (url.includes('gmail.googleapis.com') && url.includes('/messages?')) return Response.json({ messages: gmail ? [{ id: 'g1' }, { id: 'g2' }] : [] });
    if (url.includes('gmail.googleapis.com/gmail/v1/users/me/messages/g1')) {
      return Response.json({ id: 'g1', threadId: 't1', internalDate: String(Date.parse('2026-10-07T01:00:00Z')), snippet: 'We will be visiting the property on 20/10/2026', payload: { headers: [{ name: 'From', value: 'Agent <a@agent.example>' }, { name: 'Subject', value: 'Notice of routine inspection for 12 Wattle Rd' }] } });
    }
    if (url.includes('gmail.googleapis.com/gmail/v1/users/me/messages/g2')) {
      return Response.json({ id: 'g2', threadId: 't2', internalDate: String(Date.parse('2026-10-06T01:00:00Z')), snippet: 'Big sale on now', payload: { headers: [{ name: 'From', value: 'Shop <s@shop.example>' }, { name: 'Subject', value: 'Sale' }] } });
    }
    if (url.includes('/commits/')) return Response.json({ sha: COMMIT_SHA, commit: { tree: { sha: TREE_SHA } } });
    if (url.includes('/git/trees/')) {
      const tree = [];
      if (home) tree.push({ path: GARAGE_HOME_DATA_PATH, type: 'blob', sha: HOME_SHA });
      if (mailroom) tree.push({ path: MAILROOM_DATA_PATH, type: 'blob', sha: MAIL_SHA });
      return Response.json({ truncated: false, tree });
    }
    if (url.includes(`/git/blobs/${HOME_SHA}`)) return Response.json({ encoding: 'base64', content: Buffer.from(JSON.stringify(home)).toString('base64') });
    if (url.includes(`/git/blobs/${MAIL_SHA}`)) return Response.json({ encoding: 'base64', content: Buffer.from(JSON.stringify(mailroom)).toString('base64') });
    if (options.method === 'PUT') return Response.json({ content: { sha: 'f'.repeat(40) }, commit: { sha: COMMIT_SHA } });
    return Response.json({ message: 'unexpected' }, { status: 500 });
  };
  return { calls, fetchImpl };
}

const handler = (fetchImpl, env = baseEnv) => createGarageHomeHandler({ env, fetchImpl, now: () => Date.parse('2026-10-08T22:00:00Z'), newId: () => 'abc123' });
const puts = calls => calls.filter(c => c.options.method === 'PUT').map(c => ({ url: c.url, body: JSON.parse(c.options.body) }));
const written = put => JSON.parse(Buffer.from(put.body.content, 'base64').toString('utf8'));

test('GET returns both records and whether Gmail is connected, writing nothing', async () => {
  const { calls, fetchImpl } = stub({ home: null });
  const response = await handler(fetchImpl)(request());
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(payload.data.home.places, []);
  assert.deepEqual(payload.data.mailroom.items, []);
  assert.equal(payload.data.gmailConnected, false);
  assert.equal(puts(calls).length, 0);
});

test('unauthenticated requests are refused before touching storage', async () => {
  const { calls, fetchImpl } = stub();
  const response = await handler(fetchImpl)(request({ cookie: '' }));
  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
});

test('scan without Gmail secrets says to connect, and writes nothing', async () => {
  const { calls, fetchImpl } = stub();
  const response = await handler(fetchImpl)(request({ method: 'POST', body: { action: 'scan' } }));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, 'gmail_not_connected');
  assert.equal(puts(calls).length, 0);
});

test('scan reads metadata only, keeps mail about your places and writes the Mailroom', async () => {
  const { calls, fetchImpl } = stub({ gmail: true });
  const response = await handler(fetchImpl, gmailEnv)(request({ method: 'POST', body: { action: 'scan' } }));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(payload.data.scan, { status: 'ok', added: 1 });
  const search = calls.find(c => c.url.includes('/messages?'));
  assert.match(new URL(search.url).searchParams.get('q'), /"12 Wattle Rd"/);
  const [put] = puts(calls);
  assert.ok(put.url.endsWith(encodeURIComponent(MAILROOM_DATA_PATH).replace(/%2F/g, '/')) || put.url.includes('mailroom.json'));
  const mailroom = written(put);
  assert.equal(mailroom.items.length, 1, 'the shop sale is not about any place');
  assert.equal(mailroom.items[0].kind, 'inspection');
  assert.equal(mailroom.items[0].facts.eventDate, '2026-10-20');
});

test('mail actions write only the Mailroom; place edits write only Garage & Home', async () => {
  const mailroom = { version: 1, lastScanAt: null, senderRules: [], items: [{ id: 'g1', threadId: 't1', from: 'Agent', fromAddress: 'a@agent.example', subject: 'Maintenance request 12 Wattle Rd', snippet: '', date: '2026-10-07', placeId: 'wattle-rd', kind: 'repair', facts: {}, status: 'waiting', auto: false }] };
  const first = stub({ mailroom });
  const approve = await handler(first.fetchImpl)(request({ method: 'POST', body: { action: 'mail', mail: { action: 'approve', id: 'g1' } } }));
  assert.equal(approve.status, 200);
  const [mailPut] = puts(first.calls);
  assert.ok(mailPut.url.includes('mailroom.json'));
  assert.equal(written(mailPut).items[0].status, 'filed');

  const second = stub({ mailroom });
  const add = await handler(second.fetchImpl)(request({ method: 'POST', body: { action: 'place', place: { type: 'car', name: 'The Hatch', match: ['Corolla Hatch'] } } }));
  assert.equal(add.status, 200);
  const [homePut] = puts(second.calls);
  assert.ok(homePut.url.includes('garage-home.json'));
  assert.equal(written(homePut).places.length, 2);
});

test('bad input is a 400, not a write', async () => {
  const { calls, fetchImpl } = stub();
  const unknown = await handler(fetchImpl)(request({ method: 'POST', body: { action: 'launch' } }));
  assert.equal(unknown.status, 400);
  const badVisit = await handler(fetchImpl)(request({ method: 'POST', body: { action: 'visit', visit: { placeId: 'wattle-rd', date: '2026-10-01', title: 'Service' } } }));
  assert.equal(badVisit.status, 400, 'a visit must belong to a car');
  assert.equal(puts(calls).length, 0);
});

test('the cron does nothing without Gmail and scans with it', async () => {
  const quiet = stub({ gmail: true });
  const idle = await createGarageHomeMailScanHandler({ env: baseEnv, fetchImpl: quiet.fetchImpl })();
  assert.equal((await idle.json()).data.status, 'not_connected');
  assert.equal(quiet.calls.length, 0);
  const busy = stub({ gmail: true });
  const ran = await createGarageHomeMailScanHandler({ env: gmailEnv, fetchImpl: busy.fetchImpl, now: () => Date.parse('2026-10-08T22:00:00Z') })();
  assert.deepEqual((await ran.json()).data, { status: 'ok', added: 1 });
});
