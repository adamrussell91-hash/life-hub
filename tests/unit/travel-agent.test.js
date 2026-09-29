import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTravelCheckinProposal,
  buildTravelItemProposal,
  createTravelWriteExecutor,
  proposeTravelCheckinSchema,
  proposeTravelItemSchema
} from '../../netlify/functions/_shared/travel-agent.mjs';
import {
  classifyWriteTarget,
  executeProposeActionWrites,
  validateProposeActionInput
} from '../../netlify/functions/_shared/capabilities/propose-action.mjs';
import {
  buildAgentTools,
  isPathAllowedForAgent,
  resetCapabilityCaches
} from '../../netlify/functions/_shared/capabilities/registry.mjs';

const TRIP = {
  schema_version: 1,
  id: 'trip_korea2026',
  title: 'Korea',
  start_date: '2026-09-01',
  end_date: '2026-09-10',
  home_tz: 'Australia/Sydney',
  followers_label: 'Adam',
  cities: [{
    id: 'sel',
    name: 'Seoul',
    country: 'KR',
    tz: 'Asia/Seoul',
    start_date: '2026-09-01',
    end_date: '2026-09-10',
    title: 'Seoul',
    scene: 'sel',
    accent: { hue: 200 },
    local_currency: 'KRW',
    center: { lat: 37.5, lng: 127 },
    directions_app: 'naver'
  }],
  items: [],
  days: [],
  checkins: [],
  share: { public: false },
  updated_at: '2026-01-01T00:00:00.000Z'
};

test('travel propose tools are offered to Clare and Hammond', () => {
  resetCapabilityCaches();
  for (const slug of ['clare', 'hammond']) {
    const names = buildAgentTools({ slug }).map(t => t.name);
    assert.ok(names.includes('propose_travel_item'), slug);
    assert.ok(names.includes('propose_travel_checkin'), slug);
    assert.equal(isPathAllowedForAgent(slug, 'travel:trip:trip_korea2026', { mode: 'write' }), true, slug);
  }
  assert.ok(!buildAgentTools({ slug: 'chadwick' }).map(t => t.name).includes('propose_travel_item'));
  assert.equal(proposeTravelItemSchema().name, 'propose_travel_item');
  assert.equal(proposeTravelCheckinSchema().name, 'propose_travel_checkin');
  assert.deepEqual(classifyWriteTarget('travel:trip:trip_korea2026'), {
    store: 'travel', kind: 'trip', id: 'trip_korea2026', path: 'travel:trip:trip_korea2026'
  });
});

test('buildTravelItemProposal + executor appends item with if_version', async () => {
  let saved = null;
  const built = await buildTravelItemProposal({
    summary: 'Add cafe',
    trip_id: 'trip_korea2026',
    if_version: 'sha_abc',
    item: {
      kind: 'food', title: 'Cafe', date: '2026-09-02', city_id: 'sel',
      place: { name: 'Test Cafe', lat: 37.5, lon: 127 }
    }
  });
  assert.equal(built.ok, true);
  const validated = validateProposeActionInput(built.proposal, { agentSlug: 'clare' });
  assert.equal(validated.ok, true, validated.error);

  const travel = createTravelWriteExecutor({
    now: () => '2026-09-02T01:00:00.000Z',
    createRepo: () => ({
      async getTrip() { return { trip: structuredClone(TRIP), version: 'sha_abc' }; },
      async saveTrip(trip, version, message) {
        saved = { trip, version, message };
        return { trip, version: 'sha_next' };
      }
    })
  });
  const applied = await executeProposeActionWrites({}, validated.proposal, {
    blobStores: { travel }
  });
  assert.equal(applied.ok, true, applied.error);
  assert.equal(saved.trip.items.length, 1);
  assert.equal(saved.trip.items[0].title, 'Cafe');
  assert.equal(saved.version, 'sha_abc');
});

test('travel agents cannot propose an unlocated physical stop', async () => {
  const built = await buildTravelItemProposal({
    summary: 'Add cafe',
    trip_id: 'trip_korea2026',
    if_version: 'sha_abc',
    item: { kind: 'food', title: 'Cafe', date: '2026-09-02', city_id: 'sel' }
  });
  assert.deepEqual(built, {
    ok: false,
    error: 'invalid_item',
    detail: 'item.place required for physical stops'
  });
});

test('buildTravelCheckinProposal requires city + label', async () => {
  const bad = await buildTravelCheckinProposal({
    summary: 'Check in',
    trip_id: 'trip_korea2026',
    if_version: 'sha',
    city_id: '',
    label: 'Arrived'
  });
  assert.equal(bad.error, 'city_id_required');

  const built = await buildTravelCheckinProposal({
    summary: 'Check in Seoul',
    trip_id: 'trip_korea2026',
    if_version: 'sha',
    city_id: 'sel',
    label: 'Arrived'
  });
  assert.equal(built.ok, true);
  assert.match(built.proposal.writes[0].diff, /check-in/i);
});
