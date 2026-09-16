import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyRelationshipState,
  ACTIVE_WINDOW_DAYS,
  COOLING_WINDOW_DAYS,
  NEW_PERSON_WINDOW_DAYS,
  REACTIVATION_GAP_DAYS
} from '../../netlify/functions/_shared/relationship-state.mjs';

// Mirrors apps/professional/tests/unit/relationship-state.test.ts — lighter
// (not byte-for-byte), but covers the same 5 states, the same boundary
// cases, and the "never an empty reasons array" requirement, against the
// ported .mjs implementation. See relationship-state.mjs's header comment
// for the keep-in-sync obligation this test partially guards.

const NOW = '2026-09-16T00:00:00.000Z';
const DAY_MS = 86_400_000;

function daysAgo(days) {
  return new Date(Date.parse(NOW) - days * DAY_MS).toISOString();
}

function baseInput(overrides = {}) {
  return {
    lastMeaningfulInteraction: null,
    previousMeaningfulInteraction: null,
    upcomingInteraction: null,
    activeSharedContexts: 0,
    personCreatedAt: daysAgo(5),
    now: NOW,
    ...overrides
  };
}

test('classifies a brand-new person with no interactions yet as "new"', () => {
  const result = classifyRelationshipState(baseInput({ personCreatedAt: daysAgo(5), lastMeaningfulInteraction: null }));
  assert.equal(result.state, 'new');
  assert.ok(result.reasons.length > 0);
  assert.match(result.reasons.join(' '), /5/);
});

test('classifies a recent interaction as "active"', () => {
  const result = classifyRelationshipState(
    baseInput({ lastMeaningfulInteraction: daysAgo(10), personCreatedAt: daysAgo(400) })
  );
  assert.equal(result.state, 'active');
  assert.ok(result.reasons.length > 0);
  assert.match(result.reasons.join(' '), /10/);
});

test('classifies an interaction between ACTIVE_WINDOW_DAYS and COOLING_WINDOW_DAYS as "cooling"', () => {
  const days = ACTIVE_WINDOW_DAYS + 30;
  const result = classifyRelationshipState(
    baseInput({ lastMeaningfulInteraction: daysAgo(days), personCreatedAt: daysAgo(400) })
  );
  assert.equal(result.state, 'cooling');
  const joined = result.reasons.join(' ');
  assert.match(joined, new RegExp(String(days)));
  assert.match(joined, new RegExp(String(ACTIVE_WINDOW_DAYS)));
  assert.match(joined, new RegExp(String(COOLING_WINDOW_DAYS)));
});

test('classifies an interaction beyond COOLING_WINDOW_DAYS as "dormant"', () => {
  const days = COOLING_WINDOW_DAYS + 30;
  const result = classifyRelationshipState(
    baseInput({ lastMeaningfulInteraction: daysAgo(days), personCreatedAt: daysAgo(400) })
  );
  assert.equal(result.state, 'dormant');
  assert.match(result.reasons.join(' '), new RegExp(String(days)));
});

test('classifies a recent interaction after a long gap as "reactivated"', () => {
  const lastDays = 5;
  const gapDays = REACTIVATION_GAP_DAYS + 50;
  const result = classifyRelationshipState(
    baseInput({
      lastMeaningfulInteraction: daysAgo(lastDays),
      previousMeaningfulInteraction: daysAgo(lastDays + gapDays),
      personCreatedAt: daysAgo(1000)
    })
  );
  assert.equal(result.state, 'reactivated');
  const joined = result.reasons.join(' ');
  assert.match(joined, new RegExp(String(lastDays)));
  assert.match(joined, new RegExp(String(gapDays)));
});

test('boundary: interaction exactly ACTIVE_WINDOW_DAYS ago is still "active" (uses <=)', () => {
  const result = classifyRelationshipState(
    baseInput({ lastMeaningfulInteraction: daysAgo(ACTIVE_WINDOW_DAYS), personCreatedAt: daysAgo(400) })
  );
  assert.equal(result.state, 'active');
});

test('boundary: interaction one day past ACTIVE_WINDOW_DAYS is "cooling"', () => {
  const result = classifyRelationshipState(
    baseInput({ lastMeaningfulInteraction: daysAgo(ACTIVE_WINDOW_DAYS + 1), personCreatedAt: daysAgo(400) })
  );
  assert.equal(result.state, 'cooling');
});

test('boundary: interaction exactly COOLING_WINDOW_DAYS ago is still "cooling" (uses <=)', () => {
  const result = classifyRelationshipState(
    baseInput({ lastMeaningfulInteraction: daysAgo(COOLING_WINDOW_DAYS), personCreatedAt: daysAgo(400) })
  );
  assert.equal(result.state, 'cooling');
});

test('boundary: interaction one day past COOLING_WINDOW_DAYS is "dormant"', () => {
  const result = classifyRelationshipState(
    baseInput({ lastMeaningfulInteraction: daysAgo(COOLING_WINDOW_DAYS + 1), personCreatedAt: daysAgo(400) })
  );
  assert.equal(result.state, 'dormant');
});

test('boundary: person created exactly NEW_PERSON_WINDOW_DAYS ago with no interaction is still "new" (uses <=)', () => {
  const result = classifyRelationshipState(
    baseInput({ lastMeaningfulInteraction: null, personCreatedAt: daysAgo(NEW_PERSON_WINDOW_DAYS) })
  );
  assert.equal(result.state, 'new');
});

test('boundary: person created one day past NEW_PERSON_WINDOW_DAYS with no interaction is "dormant"', () => {
  const result = classifyRelationshipState(
    baseInput({ lastMeaningfulInteraction: null, personCreatedAt: daysAgo(NEW_PERSON_WINDOW_DAYS + 1) })
  );
  assert.equal(result.state, 'dormant');
});

test('boundary: prior gap of exactly REACTIVATION_GAP_DAYS is NOT "reactivated" (uses >)', () => {
  const lastDays = 5;
  const result = classifyRelationshipState(
    baseInput({
      lastMeaningfulInteraction: daysAgo(lastDays),
      previousMeaningfulInteraction: daysAgo(lastDays + REACTIVATION_GAP_DAYS),
      personCreatedAt: daysAgo(1000)
    })
  );
  assert.equal(result.state, 'active');
});

test('boundary: prior gap of REACTIVATION_GAP_DAYS + 1 is "reactivated"', () => {
  const lastDays = 5;
  const result = classifyRelationshipState(
    baseInput({
      lastMeaningfulInteraction: daysAgo(lastDays),
      previousMeaningfulInteraction: daysAgo(lastDays + REACTIVATION_GAP_DAYS + 1),
      personCreatedAt: daysAgo(1000)
    })
  );
  assert.equal(result.state, 'reactivated');
});

test('recent interaction with no previousMeaningfulInteraction is "active", not "reactivated"', () => {
  const result = classifyRelationshipState(
    baseInput({ lastMeaningfulInteraction: daysAgo(5), previousMeaningfulInteraction: null, personCreatedAt: daysAgo(400) })
  );
  assert.equal(result.state, 'active');
});

test('long prior gap but last interaction itself not recent falls to cooling, not "reactivated"', () => {
  const lastDays = ACTIVE_WINDOW_DAYS + 10;
  const result = classifyRelationshipState(
    baseInput({
      lastMeaningfulInteraction: daysAgo(lastDays),
      previousMeaningfulInteraction: daysAgo(lastDays + REACTIVATION_GAP_DAYS + 50),
      personCreatedAt: daysAgo(1000)
    })
  );
  assert.equal(result.state, 'cooling');
  assert.notEqual(result.state, 'reactivated');
});

test('person created long ago with zero interactions ever is "dormant", not "new"', () => {
  const result = classifyRelationshipState(baseInput({ lastMeaningfulInteraction: null, personCreatedAt: daysAgo(1000) }));
  assert.equal(result.state, 'dormant');
  assert.match(result.reasons.join(' '), /1000/);
});

test('activeSharedContexts > 0 alone yields "active"', () => {
  const result = classifyRelationshipState(
    baseInput({ lastMeaningfulInteraction: null, personCreatedAt: daysAgo(1000), activeSharedContexts: 3 })
  );
  assert.equal(result.state, 'active');
  assert.match(result.reasons.join(' '), /3/);
});

test('upcomingInteraction alone yields "active"', () => {
  const upcoming = new Date(Date.parse(NOW) + 10 * DAY_MS).toISOString();
  const result = classifyRelationshipState(
    baseInput({ lastMeaningfulInteraction: null, personCreatedAt: daysAgo(1000), upcomingInteraction: upcoming })
  );
  assert.equal(result.state, 'active');
  assert.match(result.reasons.join(' '), /10/);
});

test('never returns an empty reasons array for any branch', () => {
  const cases = [
    baseInput({ lastMeaningfulInteraction: null, personCreatedAt: daysAgo(5) }),
    baseInput({ lastMeaningfulInteraction: daysAgo(10), personCreatedAt: daysAgo(400) }),
    baseInput({ lastMeaningfulInteraction: daysAgo(ACTIVE_WINDOW_DAYS + 30), personCreatedAt: daysAgo(400) }),
    baseInput({ lastMeaningfulInteraction: daysAgo(COOLING_WINDOW_DAYS + 30), personCreatedAt: daysAgo(400) }),
    baseInput({
      lastMeaningfulInteraction: daysAgo(5),
      previousMeaningfulInteraction: daysAgo(5 + REACTIVATION_GAP_DAYS + 50),
      personCreatedAt: daysAgo(1000)
    })
  ];
  for (const input of cases) {
    const result = classifyRelationshipState(input);
    assert.ok(result.reasons.length > 0);
    for (const reason of result.reasons) assert.ok(reason.length > 0);
  }
});

test('defaults `now` to the current time when omitted', () => {
  const input = baseInput({ lastMeaningfulInteraction: null, personCreatedAt: new Date().toISOString() });
  delete input.now;
  const result = classifyRelationshipState(input);
  assert.equal(result.state, 'new');
});
