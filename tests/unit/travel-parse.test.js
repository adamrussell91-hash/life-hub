import test from 'node:test';
import assert from 'node:assert/strict';
import { buildParsePrompt, createTravelParseHandler } from '../../netlify/functions/travel-parse.mjs';

// Invented hotel booking in the plain-text layout a hotel site's confirmation
// pastes as: labels on one line each, then their values.
const EMAIL = [
  'Thank you, Sam! Your booking is confirmed.',
  'Itinerary # 11122233344455',
  'Test Piazza Hotel',
  'Via di Prova 9, Testville, TV, 00000 Italy',
  'Check-in',
  'Check-out',
  'Sun, 20 Dec',
  'Tue, 22 Dec',
  'Check-in time starts at 2:00 pm',
  '11:00 am',
  'Single Room',
  '2 nights x 1 room',
  'Total AU$300.00',
  'Cancellation: this booking is non-refundable.'
].join('\n');

const MODEL_REPLY = JSON.stringify({
  draft: {
    kind: 'stay',
    title: 'Test Piazza Hotel',
    date: '2026-12-20',
    time: '14:00',
    check_in_time: '14:00',
    nights: 2,
    check_out_date: '2026-12-22',
    booking_ref: '11122233344455',
    note: 'Check-out 11:00. Single Room.',
    status: 'booked',
    home_base: true,
    cost: { amount: 300, currency: 'AUD' },
    place: { name: 'Test Piazza Hotel', lat: 0, lon: 0, address: 'Via di Prova 9, Testville, TV, 00000 Italy' }
  },
  missing: []
});

function handlerWith(anthropic, seen = {}) {
  return createTravelParseHandler({
    env: {
      SITE_ORIGIN: 'https://hub.test',
      SESSION_SECRET: 'x'.repeat(32),
      LIFE_HUB_PASSPHRASE_HASH: 'y'
    },
    verifySessionToken: () => ({ valid: true, id: 'sess_test' }),
    createTravelRepository: () => ({}),
    now: () => Date.parse('2026-10-25T04:00:00Z'),
    anthropic: {
      async *streamMessage(args) {
        seen.args = args;
        yield* anthropic(args);
      }
    }
  });
}

function post(body) {
  return new Request('https://hub.test/api/travel-parse', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://hub.test' },
    body: JSON.stringify(body)
  });
}

test('travel-parse reads the stream client\'s { type: text, delta } events', async () => {
  const seen = {};
  const handler = handlerWith(async function* () {
    // Split mid-JSON, as a real stream does.
    yield { type: 'text', delta: MODEL_REPLY.slice(0, 40) };
    yield { type: 'text', delta: MODEL_REPLY.slice(40) };
    yield { type: 'done' };
  }, seen);
  const res = await handler(post({ text: EMAIL, cities: [{ id: 'tst', name: 'Testville', start_date: '2026-12-20', end_date: '2026-12-22' }] }));
  assert.equal(res.status, 200);
  const { data } = await res.json();
  assert.equal(data.draft.kind, 'stay');
  assert.equal(data.draft.date, '2026-12-20');
  assert.equal(data.draft.check_out_date, '2026-12-22');
  assert.equal(data.draft.nights, 2);
  assert.equal(data.draft.booking_ref, '11122233344455');
  assert.equal(data.draft.cost.currency, 'AUD');

  const userTurn = seen.args.messages[0].content;
  assert.match(userTurn, /^Today is 2026-10-25\./);
  assert.match(userTurn, /tst: Testville \(2026-12-20 to 2026-12-22\)/);
  assert.ok(userTurn.endsWith(EMAIL));
  assert.match(seen.args.system, /without a year/);
});

test('travel-parse still 503s when the model sends no JSON', async () => {
  const handler = handlerWith(async function* () {
    yield { type: 'text', delta: 'Sorry, I cannot help.' };
  });
  const res = await handler(post({ text: EMAIL }));
  assert.equal(res.status, 503);
});

test('buildParsePrompt works without trip cities', () => {
  const prompt = buildParsePrompt('Booking text', { today: '2026-10-25' });
  assert.equal(prompt, 'Today is 2026-10-25.\n\nEmail:\nBooking text');
});
