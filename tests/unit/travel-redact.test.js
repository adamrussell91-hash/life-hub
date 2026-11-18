import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { redactTrip } from '../../netlify/functions/_shared/travel-redact.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, '../../apps/travel/fixtures/test-trip.json'), 'utf8')
);

test('redactTrip drops private fields and their values never appear in JSON', () => {
  const trip = structuredClone(fixture);
  trip.checkins = [
    { id: 'chk_a', at: '2027-03-06T10:00:00.000Z', city_id: 'opo', label: 'Morning' },
    { id: 'chk_b', at: '2027-03-06T20:00:00.000Z', city_id: 'opo', label: 'Evening' }
  ];
  trip.days = [{ city_id: 'lis', date: '2027-03-04', subtitle: 'Hills', penelope_prompt: 'SECRET PROMPT' }];

  const secrets = [
    'TEST-123',
    'TEST-HOTEL-9',
    'TEST-TRAIN-4',
    'Private test medication stop',
    'Owner-only private med item',
    'SECRET PROMPT',
    'A$1200',
    '1200',
    'https://example.com/ticket/test-flight'
  ];

  // Ensure secrets exist in the owner trip first
  const ownerJson = JSON.stringify(trip);
  assert.match(ownerJson, /TEST-123/);
  assert.match(ownerJson, /Private test medication stop/);
  assert.match(ownerJson, /SECRET PROMPT/);

  const publicTrip = redactTrip(trip);
  const json = JSON.stringify(publicTrip);
  for (const secret of secrets) {
    assert.equal(json.includes(secret), false, `leaked: ${secret}`);
  }
  assert.equal(publicTrip.items.some((i) => i.kind === 'med'), false);
  assert.equal(publicTrip.items.some((i) => i.private), false);
  assert.equal(publicTrip.items.every((i) => i.cost === undefined && i.booking_ref === undefined && i.note === undefined), true);
  assert.equal(publicTrip.last_checkin?.label, 'Evening');
  assert.equal(publicTrip.share, undefined);
  assert.equal(publicTrip.days[0].penelope_prompt, undefined);
});

test('redactTrip attaches safe_at and photo id onto the matching public stop', () => {
  const trip = structuredClone(fixture);
  const stopId = trip.items.find((i) => i.kind === 'do' && !i.private)?.id;
  assert.ok(stopId);
  trip.checkins = [
    {
      id: 'chk_stop1',
      at: '2027-03-04T15:30:00.000Z',
      city_id: 'lis',
      label: 'Safe · Belém',
      item_id: stopId,
      photo_id: 'tph_testphoto01'
    }
  ];
  const publicTrip = redactTrip(trip);
  const stop = publicTrip.items.find((i) => i.id === stopId);
  assert.equal(stop?.safe_at, '2027-03-04T15:30:00.000Z');
  assert.equal(stop?.safe_photo_id, 'tph_testphoto01');
  assert.equal(publicTrip.last_checkin?.photo_id, 'tph_testphoto01');
  assert.equal(publicTrip.last_checkin?.item_id, stopId);
});

const postcardCheckin = (extra = {}) => ({
  id: 'chk_card1',
  at: '2027-03-04T11:00:00.000Z',
  city_id: 'lis',
  label: 'Safe',
  item_id: 'itm_testtodo01',
  photo_id: 'tph_p1',
  postcard: {
    photo_id: 'tph_p1',
    orientation: 'portrait',
    address: ['Rua do Exemplo', 'Lisboa', 'Portugal'],
    posted_at: '2027-03-04T11:30:00.000Z',
    audio_id: 'tau_a1',
    audio_s: 21,
    text: 'All good here.',
    coordinates: { lat: 12.345678, lon: 98.765432 }
  },
  ...extra
});

test('redactTrip gives followers a stop\'s postcard, and never where exactly it was taken', () => {
  const trip = structuredClone(fixture);
  trip.checkins = [
    postcardCheckin(),
    { id: 'chk_later', at: '2027-03-04T13:00:00.000Z', city_id: 'lis', label: 'Safe', item_id: 'itm_testtodo01' }
  ];
  const publicTrip = redactTrip(trip);
  const stop = publicTrip.items.find((i) => i.id === 'itm_testtodo01');

  assert.equal(stop.safe_at, '2027-03-04T13:00:00.000Z', 'the safe time is still the latest tick');
  assert.deepEqual(stop.postcard, {
    id: 'chk_card1',
    at: '2027-03-04T11:30:00.000Z',
    photo_id: 'tph_p1',
    orientation: 'portrait',
    address: ['Rua do Exemplo', 'Lisboa', 'Portugal'],
    audio_id: 'tau_a1',
    audio_s: 21,
    text: 'All good here.'
  });
  const json = JSON.stringify(publicTrip);
  assert.equal(json.includes('12.345678'), false);
  assert.equal(json.includes('"coordinates"'), false);
  assert.equal(publicTrip.items.find((i) => i.id === 'itm_testfood01').postcard, undefined);
});

test('redactTrip reads a photo from before postcards as a photo-only postcard', () => {
  const trip = structuredClone(fixture);
  trip.checkins = [
    { id: 'chk_old', at: '2027-03-04T10:00:00.000Z', city_id: 'lis', label: 'Photo', item_id: 'itm_testtodo01', photo_id: 'tph_old1' }
  ];
  const stop = redactTrip(trip).items.find((i) => i.id === 'itm_testtodo01');
  assert.deepEqual(stop.postcard, { id: 'chk_old', at: '2027-03-04T10:00:00.000Z', photo_id: 'tph_old1' });
  assert.equal(stop.safe_photo_id, 'tph_old1');
});

test('redactTrip drops a private stop with its postcard, and the last check-in does not name it', () => {
  const trip = structuredClone(fixture);
  trip.checkins = [
    postcardCheckin({ item_id: 'itm_testmed01', city_id: 'opo', label: 'Safe · Private test medication stop' })
  ];
  const publicTrip = redactTrip(trip);
  const json = JSON.stringify(publicTrip);
  for (const secret of ['itm_testmed01', 'Private test medication stop', 'Rua do Exemplo', 'All good here.', 'tau_a1', 'tph_p1']) {
    assert.equal(json.includes(secret), false, `leaked: ${secret}`);
  }
  assert.deepEqual(publicTrip.last_checkin, { at: '2027-03-04T11:00:00.000Z', city_name: 'Porto', label: 'Safe' });
});

test('redactTrip still names a public stop in the last check-in', () => {
  const trip = structuredClone(fixture);
  trip.checkins = [postcardCheckin({ label: 'Safe · Book Belém tram tickets' })];
  assert.deepEqual(redactTrip(trip).last_checkin, {
    at: '2027-03-04T11:00:00.000Z',
    city_name: 'Lisbon',
    label: 'Safe · Book Belém tram tickets',
    item_id: 'itm_testtodo01',
    photo_id: 'tph_p1'
  });
});
