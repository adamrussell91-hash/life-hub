import assert from 'node:assert/strict';
import test from 'node:test';
import { loadAllPeopleWithRelationships } from '../../netlify/functions/_shared/people-collection.mjs';
import {
  ACTIVE_WINDOW_DAYS,
  COOLING_WINDOW_DAYS
} from '../../netlify/functions/_shared/relationship-state.mjs';
import {
  RECONNECT_SUGGESTION_CAP,
  RECENT_CHANGES_DISPLAY_CAP,
  DORMANT_REVIEW_DISPLAY_CAP,
  RECENT_CHANGE_WINDOW_DAYS,
  NEW_CONNECTION_WINDOW_DAYS,
  computeSignals,
  computeReconnectSuggestions,
  computeRecentRelationshipChanges,
  computeNewConnections,
  computeDormantForReview
} from '../../netlify/functions/_shared/people-home-signals.mjs';
import { makeLink, makePerson, makeResolveEntity, memoryStore } from '../support/people-fixtures.mjs';
import { createUniversalLinkRepository } from '../../netlify/functions/_shared/universal-link-repository.mjs';
import { createAccessContext } from '../../netlify/functions/_shared/entity-access.mjs';

const NOW = '2026-09-17T00:00:00.000Z';
const DAY_MS = 86_400_000;

function daysAgo(days) {
  return new Date(Date.parse(NOW) - days * DAY_MS).toISOString();
}

async function load(store) {
  return loadAllPeopleWithRelationships({ store, resolveEntity: makeResolveEntity(store) });
}

// --- computeSignals ---------------------------------------------------

test('computeSignals: active_relationships counts current links classified active or reactivated, deduped', async () => {
  const store = memoryStore();
  const alice = await makePerson(store, { display_name: 'Alice', created_at: daysAgo(400) });
  const bob = await makePerson(store, { display_name: 'Bob', created_at: daysAgo(400) });
  const carol = await makePerson(store, { display_name: 'Carol', created_at: daysAgo(400) });

  // Active: recent valid_from (10 days ago).
  await makeLink(store, { sourceRef: alice.ref, targetRef: bob.ref, relationshipType: 'professional_relationship', validFrom: daysAgo(10) });
  // Cooling: valid_from beyond ACTIVE_WINDOW_DAYS but within COOLING_WINDOW_DAYS -> not counted as active.
  await makeLink(store, { sourceRef: alice.ref, targetRef: carol.ref, relationshipType: 'professional_relationship', validFrom: daysAgo(ACTIVE_WINDOW_DAYS + 30) });

  const people = await load(store);
  const signals = computeSignals(people, {}, new Date(NOW));
  assert.equal(signals.active_relationships, 1, 'only the recent link counts as active; must not double count the same link from both sides');
});

test('computeSignals: upcoming_interactions counts meetings + events within the window', async () => {
  const store = memoryStore();
  const people = await load(store);
  const meetings = [
    { id: 'meeting_a', scheduled_start: daysAgo(-5) }, // 5 days in the future
    { id: 'meeting_b', scheduled_start: daysAgo(30) } // in the past, excluded
  ];
  const events = [
    { id: 'event_a', start: daysAgo(-13) } // 13 days in the future, within 14-day window
  ];
  const signals = computeSignals(people, { meetings, events }, new Date(NOW));
  assert.equal(signals.upcoming_interactions, 2);
});

test('computeSignals: recent_relationship_changes counts links whose valid_from or valid_to falls in the window, deduped', async () => {
  const store = memoryStore();
  const alice = await makePerson(store);
  const bob = await makePerson(store);
  const carol = await makePerson(store);

  await makeLink(store, { sourceRef: alice.ref, targetRef: bob.ref, relationshipType: 'professional_relationship', validFrom: daysAgo(5) });
  await makeLink(store, { sourceRef: alice.ref, targetRef: carol.ref, relationshipType: 'professional_relationship', validFrom: daysAgo(200) });

  const people = await load(store);
  const signals = computeSignals(people, {}, new Date(NOW));
  assert.equal(signals.recent_relationship_changes, 1);
});

test('computeSignals: current_opportunity_windows counts only reactivated links', async () => {
  const store = memoryStore();
  const alice = await makePerson(store, { created_at: daysAgo(1000) });
  const bob = await makePerson(store, { created_at: daysAgo(1000) });

  // Ended link far in the past, then a new current link recently -> reactivated.
  const ended = await makeLink(store, {
    sourceRef: alice.ref,
    targetRef: bob.ref,
    relationshipType: 'professional_relationship',
    role: 'colleague',
    validFrom: daysAgo(1000)
  });
  const repo = createUniversalLinkRepository({ store, resolveEntity: makeResolveEntity(store) });
  const ctx = createAccessContext({ workflow: 'life' });
  await repo.endLink(ended.id, daysAgo(400), ctx);
  await repo.createLink(
    { source_ref: alice.ref, target_ref: bob.ref, relationship_type: 'professional_relationship', role: 'colleague', valid_from: daysAgo(5) },
    ctx
  );

  const people = await load(store);
  const signals = computeSignals(people, {}, new Date(NOW));
  assert.equal(signals.current_opportunity_windows, 1);
});

// --- computeReconnectSuggestions ---------------------------------------

test('computeReconnectSuggestions: never exceeds RECONNECT_SUGGESTION_CAP even with many eligible candidates', async () => {
  const store = memoryStore();
  const self = await makePerson(store, { display_name: 'Adam', is_self: true, created_at: daysAgo(1000) });
  const coolingDays = ACTIVE_WINDOW_DAYS + 20;
  for (let i = 0; i < RECONNECT_SUGGESTION_CAP + 5; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const contact = await makePerson(store, { display_name: `Contact ${i}`, created_at: daysAgo(1000) });
    // eslint-disable-next-line no-await-in-loop
    await makeLink(store, {
      sourceRef: self.ref,
      targetRef: contact.ref,
      relationshipType: 'professional_relationship',
      validFrom: daysAgo(coolingDays + i)
    });
  }

  const people = await load(store);
  const suggestions = computeReconnectSuggestions(people, new Date(NOW));
  assert.ok(suggestions.length <= RECONNECT_SUGGESTION_CAP, 'reconnect suggestions must never become a backlog');
  assert.equal(suggestions.length, RECONNECT_SUGGESTION_CAP);
});

test('computeReconnectSuggestions: scoped to cooling only, not dormant', async () => {
  const store = memoryStore();
  const alice = await makePerson(store, { created_at: daysAgo(1000) });
  const bob = await makePerson(store, { created_at: daysAgo(1000) });
  const carol = await makePerson(store, { created_at: daysAgo(1000) });

  await makeLink(store, { sourceRef: alice.ref, targetRef: bob.ref, relationshipType: 'professional_relationship', validFrom: daysAgo(ACTIVE_WINDOW_DAYS + 10) }); // cooling
  await makeLink(store, { sourceRef: alice.ref, targetRef: carol.ref, relationshipType: 'professional_relationship', validFrom: daysAgo(COOLING_WINDOW_DAYS + 10) }); // dormant

  const people = await load(store);
  const suggestions = computeReconnectSuggestions(people, new Date(NOW));
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].person_ref, bob.ref);
});

test('computeReconnectSuggestions: sorted most-overdue-first', async () => {
  const store = memoryStore();
  const alice = await makePerson(store, { created_at: daysAgo(1000) });
  const soon = await makePerson(store, { display_name: 'Soon', created_at: daysAgo(1000) });
  const overdue = await makePerson(store, { display_name: 'Overdue', created_at: daysAgo(1000) });

  await makeLink(store, { sourceRef: alice.ref, targetRef: soon.ref, relationshipType: 'professional_relationship', validFrom: daysAgo(ACTIVE_WINDOW_DAYS + 5) });
  await makeLink(store, { sourceRef: alice.ref, targetRef: overdue.ref, relationshipType: 'professional_relationship', validFrom: daysAgo(ACTIVE_WINDOW_DAYS + 60) });

  const people = await load(store);
  const suggestions = computeReconnectSuggestions(people, new Date(NOW));
  assert.equal(suggestions[0].display_name, 'Overdue');
  assert.equal(suggestions[1].display_name, 'Soon');
});

test('computeReconnectSuggestions: empty when no cooling relationships exist', async () => {
  const store = memoryStore();
  const alice = await makePerson(store, { created_at: daysAgo(1000) });
  const bob = await makePerson(store, { created_at: daysAgo(1000) });
  await makeLink(store, { sourceRef: alice.ref, targetRef: bob.ref, relationshipType: 'professional_relationship', validFrom: daysAgo(5) }); // active
  const people = await load(store);
  assert.deepEqual(computeReconnectSuggestions(people, new Date(NOW)), []);
});

// --- computeRecentRelationshipChanges -----------------------------------

test('computeRecentRelationshipChanges: caps, orders most-recent-first, and labels opened vs closed', async () => {
  const store = memoryStore();
  const alice = await makePerson(store);
  const bob = await makePerson(store);
  const carol = await makePerson(store);

  await makeLink(store, { sourceRef: alice.ref, targetRef: bob.ref, relationshipType: 'professional_relationship', validFrom: daysAgo(20) }); // opened
  await makeLink(store, {
    sourceRef: alice.ref,
    targetRef: carol.ref,
    relationshipType: 'professional_relationship',
    validFrom: daysAgo(300),
    validTo: daysAgo(5)
  }); // closed

  const people = await load(store);
  const changes = computeRecentRelationshipChanges(people, new Date(NOW));
  assert.equal(changes.length, 2);
  assert.equal(changes[0].change_type, 'closed');
  assert.equal(changes[1].change_type, 'opened');
});

test('computeRecentRelationshipChanges: caps at RECENT_CHANGES_DISPLAY_CAP', async () => {
  const store = memoryStore();
  const alice = await makePerson(store);
  for (let i = 0; i < RECENT_CHANGES_DISPLAY_CAP + 5; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const contact = await makePerson(store, { display_name: `Contact ${i}` });
    // eslint-disable-next-line no-await-in-loop
    await makeLink(store, { sourceRef: alice.ref, targetRef: contact.ref, relationshipType: 'professional_relationship', validFrom: daysAgo(i) });
  }
  const people = await load(store);
  const changes = computeRecentRelationshipChanges(people, new Date(NOW));
  assert.equal(changes.length, RECENT_CHANGES_DISPLAY_CAP);
});

test('computeRecentRelationshipChanges: empty state when nothing changed recently', async () => {
  const store = memoryStore();
  const alice = await makePerson(store);
  const bob = await makePerson(store);
  await makeLink(store, { sourceRef: alice.ref, targetRef: bob.ref, relationshipType: 'professional_relationship', validFrom: daysAgo(RECENT_CHANGE_WINDOW_DAYS + 5) });
  const people = await load(store);
  assert.deepEqual(computeRecentRelationshipChanges(people, new Date(NOW)), []);
});

// --- computeNewConnections ----------------------------------------------

test('computeNewConnections: only people created within the window, most-recent-first, capped', async () => {
  const store = memoryStore();
  await makePerson(store, { display_name: 'Old', created_at: daysAgo(NEW_CONNECTION_WINDOW_DAYS + 5) });
  await makePerson(store, { display_name: 'Newer', created_at: daysAgo(2) });
  await makePerson(store, { display_name: 'Newest', created_at: daysAgo(1) });

  const people = await load(store);
  const result = computeNewConnections(people, new Date(NOW));
  assert.equal(result.length, 2);
  assert.equal(result[0].display_name, 'Newest');
  assert.equal(result[1].display_name, 'Newer');
});

test('computeNewConnections: empty state when nobody was recently added', async () => {
  const store = memoryStore();
  await makePerson(store, { created_at: daysAgo(1000) });
  const people = await load(store);
  assert.deepEqual(computeNewConnections(people, new Date(NOW)), []);
});

// --- computeDormantForReview ---------------------------------------------

test('computeDormantForReview: dormant only, most-stale-first, capped at DORMANT_REVIEW_DISPLAY_CAP', async () => {
  const store = memoryStore();
  const alice = await makePerson(store, { created_at: daysAgo(1000) });
  for (let i = 0; i < DORMANT_REVIEW_DISPLAY_CAP + 5; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const contact = await makePerson(store, { display_name: `Contact ${i}`, created_at: daysAgo(1000) });
    // eslint-disable-next-line no-await-in-loop
    await makeLink(store, {
      sourceRef: alice.ref,
      targetRef: contact.ref,
      relationshipType: 'professional_relationship',
      validFrom: daysAgo(COOLING_WINDOW_DAYS + 10 + i)
    });
  }
  const people = await load(store);
  const result = computeDormantForReview(people, new Date(NOW));
  assert.equal(result.length, DORMANT_REVIEW_DISPLAY_CAP);
  for (let i = 1; i < result.length; i += 1) {
    assert.ok(result[i - 1].days_since_last_interaction >= result[i].days_since_last_interaction);
  }
});

test('computeDormantForReview: excludes cooling (Reconnect territory)', async () => {
  const store = memoryStore();
  const alice = await makePerson(store, { created_at: daysAgo(1000) });
  const bob = await makePerson(store, { created_at: daysAgo(1000) });
  await makeLink(store, { sourceRef: alice.ref, targetRef: bob.ref, relationshipType: 'professional_relationship', validFrom: daysAgo(ACTIVE_WINDOW_DAYS + 10) }); // cooling
  const people = await load(store);
  assert.deepEqual(computeDormantForReview(people, new Date(NOW)), []);
});

test('computeDormantForReview: empty state when nothing is dormant', async () => {
  const store = memoryStore();
  const alice = await makePerson(store, { created_at: daysAgo(1000) });
  const bob = await makePerson(store, { created_at: daysAgo(1000) });
  await makeLink(store, { sourceRef: alice.ref, targetRef: bob.ref, relationshipType: 'professional_relationship', validFrom: daysAgo(5) });
  const people = await load(store);
  assert.deepEqual(computeDormantForReview(people, new Date(NOW)), []);
});
