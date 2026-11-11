// workers/game-rooms/test/worker.test.mjs
// The game-rooms Worker in Wrangler's local runtime (workerd): create a signed room, two phones and a teacher
// on WebSockets, a move, a reconnect on a second device, the HTTPS poll fallback, end and a signed fold.
// Run from workers/game-rooms: `npm install && npm test`. Invented content only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { unstable_dev } from 'wrangler';
import { signBody, signTicket, verifyBody } from '../../../netlify/functions/_shared/game-room-core.mjs';
import { prepareGamePublish } from '../../../netlify/functions/_shared/games.mjs';
import { GAME_ROSTER, crossword, gameLesson, wager } from '../../../tests/unit/helpers/game-fixture.mjs';

const SECRET = 'worker-test-secret-0123456789abcdef';
const ORIGIN = 'http://localhost:5173';

function messages(ws) {
  const got = [];
  const waiters = [];
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    got.push(msg);
    for (const w of [...waiters]) if (w.test(msg)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(msg); }
  });
  return {
    got,
    next: (test, ms = 8000) => {
      const hit = got.find(test);
      if (hit) return Promise.resolve(hit);
      return new Promise((resolve, reject) => {
        const w = { test, resolve };
        waiters.push(w);
        setTimeout(() => reject(new Error(`timed out waiting; had ${JSON.stringify(got.map((m) => m.t))}`)), ms);
      });
    }
  };
}

const open = (url) => new Promise((resolve, reject) => {
  const ws = new WebSocket(url);
  const box = messages(ws);
  ws.addEventListener('open', () => resolve({ ws, ...box }), { once: true });
  ws.addEventListener('error', (e) => reject(new Error(`socket error ${e.message ?? ''}`)), { once: true });
});

test('game-rooms Worker: sockets, reconnect, poll fallback and a signed fold', { timeout: 120_000 }, async (t) => {
  const folds = [];
  const receiver = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    folds.push({ body, sig: req.headers['x-game-room-signature'] });
    res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
  });
  await new Promise((r) => receiver.listen(0, '127.0.0.1', r));
  t.after(() => receiver.close());

  const worker = await unstable_dev('src/index.js', {
    config: 'wrangler.jsonc',
    vars: { GAME_ROOM_SECRET: SECRET, ALLOWED_ORIGINS: ORIGIN },
    persist: false,
    logLevel: 'error',
    experimental: { disableExperimentalWarning: true }
  });
  t.after(() => worker.stop());
  const base = `http://${worker.address}:${worker.port}`;
  const wsBase = `ws://${worker.address}:${worker.port}`;

  const pub = prepareGamePublish(gameLesson({}, [crossword()]));
  const room = 'room_worker_test1';
  const config = {
    room, code: '246810', lesson_id: 'gl1', class_id: 'class1', game: pub.snapshot.games[0], keys: pub.record.games.g_cross, style: 'race',
    roster: Object.fromEntries(GAME_ROSTER.map((s) => [s.id, s.initials])), fold_url: `http://127.0.0.1:${receiver.address().port}/fold`, opened_at: Date.now()
  };
  const body = JSON.stringify(config);

  // Create: unsigned refused, signed accepted, a second create with the same code is fine.
  assert.equal((await fetch(`${base}/g/rooms`, { method: 'POST', body })).status, 401);
  const created = await fetch(`${base}/g/rooms`, { method: 'POST', body, headers: { 'x-game-room-signature': await signBody(SECRET, body, Date.now()) } });
  assert.equal(created.status, 201, await created.clone().text());
  assert.equal((await fetch(`${base}/g/rooms`, { method: 'POST', body, headers: { 'x-game-room-signature': await signBody(SECRET, body, Date.now()) } })).status, 201);
  // Other origins are refused; Life Hub's get CORS.
  assert.equal((await fetch(`${base}/g/health`, { headers: { origin: 'https://evil.example' } })).status, 403);
  assert.equal((await fetch(`${base}/g/health`, { headers: { origin: ORIGIN } })).headers.get('access-control-allow-origin'), ORIGIN);

  const now = Date.now();
  const ticket = (role, owner, extra = {}) => signTicket(SECRET, { room, role, owner, ...extra }, now);
  const ann = await ticket('student', 'own_ann', { student_id: 'st_ann', initials: 'AB' });
  const cy = await ticket('student', 'own_cy', { student_id: 'st_cy', initials: 'CD' });
  const teacherTicket = await ticket('teacher', 'teacher');

  assert.equal((await fetch(`${base}/g/rooms/${room}/poll`, { headers: { authorization: 'Ticket nope' } })).status, 401);
  assert.equal((await fetch(`${base}/g/rooms/room_other_123/poll`, { headers: { authorization: `Ticket ${ann}` } })).status, 401, 'a ticket for another room');

  const teacher = await open(`${wsBase}/g/rooms/${room}/ws?ticket=${encodeURIComponent(teacherTicket)}`);
  const first = await teacher.next((m) => m.t === 'snapshot');
  assert.equal(first.view.phase, 'lobby');
  const phone = await open(`${wsBase}/g/rooms/${room}/ws?ticket=${encodeURIComponent(ann)}`);
  assert.equal((await phone.next((m) => m.t === 'snapshot')).view.you.seat.initials, 'AB');
  const seated = await teacher.next((m) => (m.t === 'delta' && m.patch.seats?.length === 1));
  assert.equal(seated.patch.seats[0].initials, 'AB', 'a delta, not a fresh snapshot');

  teacher.ws.send(JSON.stringify({ t: 'control', rid: 'c1', op: { op: 'start' } }));
  await teacher.next((m) => m.t === 'ack' && m.rid === 'c1');
  // The countdown alarm fires in the local runtime.
  await phone.next((m) => (m.t === 'delta' && m.patch.phase === 'playing') || (m.t === 'snapshot' && m.view.phase === 'playing'), 10_000);

  phone.ws.send(JSON.stringify({ t: 'move', rid: 'm1', event: { item: 't2', move: 'answer', response: { text: 'Pathetic fallacy' } } }));
  assert.deepEqual((await phone.next((m) => m.t === 'ack' && m.rid === 'm1')).result, { item: 't2', correct: true });
  const ticker = await teacher.next((m) => m.t === 'delta' && m.patch.ticker?.length);
  assert.match(ticker.patch.ticker[0].text, /^solved \d+ (across|down)$/);

  phone.ws.send(JSON.stringify({ t: 'ping', rid: 'p1', sent: 42 }));
  const pong = await phone.next((m) => m.t === 'pong');
  assert.equal(pong.sent, 42);
  assert.ok(Math.abs(pong.now - Date.now()) < 5000);

  // The same student on a second device: the first is told and closed; the seat (and its score) carries on.
  const closed = new Promise((r) => phone.ws.addEventListener('close', (e) => r(e.code), { once: true }));
  const phone2 = await open(`${wsBase}/g/rooms/${room}/ws?ticket=${encodeURIComponent(ann)}`);
  assert.equal((await phone2.next((m) => m.t === 'snapshot')).view.you.seat.score, 1);
  await phone.next((m) => m.t === 'replaced');
  assert.equal(await closed, 4001);

  // A phone on a network that blocks sockets: HTTPS poll and send.
  const poll = await (await fetch(`${base}/g/rooms/${room}/poll?since=-1`, { headers: { authorization: `Ticket ${cy}`, origin: ORIGIN } })).json();
  assert.equal(poll.data.msgs[0].t, 'snapshot');
  assert.equal(poll.data.msgs[0].view.you.seat.initials, 'CD');
  const seq = poll.data.seq;
  const idle = await (await fetch(`${base}/g/rooms/${room}/poll?since=${seq}`, { headers: { authorization: `Ticket ${cy}` } })).json();
  assert.deepEqual(idle.data.msgs, [], 'up to date: nothing to send');
  const sent = await (await fetch(`${base}/g/rooms/${room}/send`, { method: 'POST', headers: { authorization: `Ticket ${cy}`, 'content-type': 'application/json' }, body: JSON.stringify({ t: 'move', rid: 'h1', event: { item: 't1', move: 'answer', response: { text: 'Simile' } } }) })).json();
  assert.deepEqual(sent.data.msgs.find((m) => m.t === 'ack').result, { item: 't1', correct: true });
  const behind = await (await fetch(`${base}/g/rooms/${room}/poll?since=${seq}`, { headers: { authorization: `Ticket ${cy}` } })).json();
  assert.equal(behind.data.msgs[0].t, 'snapshot');
  assert.equal(behind.data.msgs[0].view.you.seat.score, 1);

  // End: the room folds to Netlify, signed, and tells everyone.
  teacher.ws.send(JSON.stringify({ t: 'control', rid: 'c2', op: { op: 'end' } }));
  await phone2.next((m) => (m.t === 'delta' && m.patch.phase === 'folded') || (m.t === 'snapshot' && m.view.phase === 'folded'), 15_000);
  assert.equal(folds.length, 1);
  assert.equal(await verifyBody(SECRET, folds[0].body, folds[0].sig, Date.now()), true);
  const fold = JSON.parse(folds[0].body);
  assert.equal(fold.room, room);
  assert.deepEqual(fold.events.map((e) => [e.owner, e.item, e.correct, e.strength]).sort(), [['own_ann', 't2', true, 'live_solo'], ['own_cy', 't1', true, 'live_solo']]);
  for (const text of [folds[0].body, ...teacher.got.map((m) => JSON.stringify(m))]) assert.ok(!text.includes('"answers"'));
  teacher.ws.close();
  phone2.ws.close();
});

test('game-rooms Worker: a game with its own room rules (Wager) opens, takes a bet and folds', { timeout: 120_000 }, async (t) => {
  const folds = [];
  const receiver = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    folds.push({ body, sig: req.headers['x-game-room-signature'] });
    res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
  });
  await new Promise((r) => receiver.listen(0, '127.0.0.1', r));
  t.after(() => receiver.close());

  const worker = await unstable_dev('src/index.js', {
    config: 'wrangler.jsonc',
    vars: { GAME_ROOM_SECRET: SECRET, ALLOWED_ORIGINS: ORIGIN },
    persist: false,
    logLevel: 'error',
    experimental: { disableExperimentalWarning: true }
  });
  t.after(() => worker.stop());
  const base = `http://${worker.address}:${worker.port}`;
  const wsBase = `ws://${worker.address}:${worker.port}`;

  const pub = prepareGamePublish(gameLesson({}, [wager()]));
  const room = 'room_worker_wager1';
  const config = {
    room, code: '135790', lesson_id: 'gl1', class_id: 'class1', game: pub.snapshot.games[0], keys: pub.record.games.g_wager, style: 'custom',
    roster: Object.fromEntries(GAME_ROSTER.map((s) => [s.id, s.initials])), fold_url: `http://127.0.0.1:${receiver.address().port}/fold`, opened_at: Date.now()
  };
  const create = async (c) => {
    const body = JSON.stringify(c);
    return fetch(`${base}/g/rooms`, { method: 'POST', body, headers: { 'x-game-room-signature': await signBody(SECRET, body, Date.now()) } });
  };
  // A style the kind doesn't run with is refused; the kind's own style is accepted.
  assert.equal((await create({ ...config, room: 'room_worker_wager0', style: 'race' })).status, 400);
  assert.equal((await create({ ...config, room: 'room_worker_wager9', style: 'banana' })).status, 400);
  const created = await create(config);
  assert.equal(created.status, 201, await created.clone().text());

  const now = Date.now();
  const ticket = (role, owner, extra = {}) => signTicket(SECRET, { room, role, owner, ...extra }, now);
  const teacher = await open(`${wsBase}/g/rooms/${room}/ws?ticket=${encodeURIComponent(await ticket('teacher', 'teacher'))}`);
  await teacher.next((m) => m.t === 'snapshot');
  const phone = await open(`${wsBase}/g/rooms/${room}/ws?ticket=${encodeURIComponent(await ticket('student', 'own_ann', { student_id: 'st_ann', initials: 'AB' }))}`);
  await phone.next((m) => m.t === 'snapshot');

  teacher.ws.send(JSON.stringify({ t: 'control', rid: 'c1', op: { op: 'start' } }));
  await teacher.next((m) => m.t === 'ack' && m.rid === 'c1');
  const open1 = await phone.next((m) => (m.t === 'delta' && m.patch.kind_view?.stage === 'open') || (m.t === 'snapshot' && m.view.kind_view?.stage === 'open'), 10_000);
  const item = (open1.patch ?? open1.view).kind_view.item;
  assert.equal(item.mode, 'choice');
  assert.ok(!JSON.stringify(item).includes('correct'), 'no answer key on the phone');

  phone.ws.send(JSON.stringify({ t: 'move', rid: 'm1', event: { item: item.id, move: 'answer', response: { selected: [item.options[0].id] }, extra: { bet: 20 } } }));
  assert.deepEqual((await phone.next((m) => m.t === 'ack' && m.rid === 'm1')).result, { item: item.id });

  teacher.ws.send(JSON.stringify({ t: 'control', rid: 'c2', op: { op: 'end' } }));
  await phone.next((m) => (m.t === 'delta' && m.patch.phase === 'folded') || (m.t === 'snapshot' && m.view.phase === 'folded'), 15_000);
  assert.equal(folds.length, 1);
  assert.equal(await verifyBody(SECRET, folds[0].body, folds[0].sig, Date.now()), true);
  const fold = JSON.parse(folds[0].body);
  assert.ok(fold.events.some((e) => e.owner === 'own_ann' && e.item === item.id), 'the bet folds as evidence');
  teacher.ws.close();
  phone.ws.close();
});
