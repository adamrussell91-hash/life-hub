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
