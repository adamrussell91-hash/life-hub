import { describe, expect, it } from 'vitest';
import {
  classifyRelationshipState,
  ACTIVE_WINDOW_DAYS,
  COOLING_WINDOW_DAYS,
  NEW_PERSON_WINDOW_DAYS,
  REACTIVATION_GAP_DAYS,
  type RelationshipStateInput
} from '@/domain/relationship-state';

const NOW = '2026-09-16T00:00:00.000Z';
const DAY_MS = 86_400_000;

/** Returns an ISO timestamp `days` whole days before NOW. */
function daysAgo(days: number): string {
  return new Date(Date.parse(NOW) - days * DAY_MS).toISOString();
}

function baseInput(overrides: Partial<RelationshipStateInput> = {}): RelationshipStateInput {
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

describe('classifyRelationshipState', () => {
  it('classifies a brand-new person with no interactions yet as "new"', () => {
    const result = classifyRelationshipState(
      baseInput({ personCreatedAt: daysAgo(5), lastMeaningfulInteraction: null })
    );
    expect(result.state).toBe('new');
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.reasons.join(' ')).toMatch(/5/);
  });

  it('classifies a recent interaction as "active"', () => {
    const result = classifyRelationshipState(
      baseInput({ lastMeaningfulInteraction: daysAgo(10), personCreatedAt: daysAgo(400) })
    );
    expect(result.state).toBe('active');
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.reasons.join(' ')).toMatch(/10/);
  });

  it('classifies an interaction between ACTIVE_WINDOW_DAYS and COOLING_WINDOW_DAYS as "cooling"', () => {
    const days = ACTIVE_WINDOW_DAYS + 30;
    const result = classifyRelationshipState(
      baseInput({ lastMeaningfulInteraction: daysAgo(days), personCreatedAt: daysAgo(400) })
    );
    expect(result.state).toBe('cooling');
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.reasons.join(' ')).toMatch(new RegExp(String(days)));
    expect(result.reasons.join(' ')).toMatch(new RegExp(String(ACTIVE_WINDOW_DAYS)));
    expect(result.reasons.join(' ')).toMatch(new RegExp(String(COOLING_WINDOW_DAYS)));
  });

  it('classifies an interaction beyond COOLING_WINDOW_DAYS as "dormant"', () => {
    const days = COOLING_WINDOW_DAYS + 30;
    const result = classifyRelationshipState(
      baseInput({ lastMeaningfulInteraction: daysAgo(days), personCreatedAt: daysAgo(400) })
    );
    expect(result.state).toBe('dormant');
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.reasons.join(' ')).toMatch(new RegExp(String(days)));
  });

  it('classifies a recent interaction after a long gap as "reactivated"', () => {
    const lastDays = 5;
    const gapDays = REACTIVATION_GAP_DAYS + 50;
    const result = classifyRelationshipState(
      baseInput({
        lastMeaningfulInteraction: daysAgo(lastDays),
        previousMeaningfulInteraction: daysAgo(lastDays + gapDays),
        personCreatedAt: daysAgo(1000)
      })
    );
    expect(result.state).toBe('reactivated');
    expect(result.reasons.length).toBeGreaterThan(0);
    const joined = result.reasons.join(' ');
    expect(joined).toMatch(new RegExp(String(lastDays)));
    expect(joined).toMatch(new RegExp(String(gapDays)));
  });

  // --- Boundary cases -------------------------------------------------

  it('boundary: interaction exactly ACTIVE_WINDOW_DAYS ago is still "active" (uses <=)', () => {
    const result = classifyRelationshipState(
      baseInput({ lastMeaningfulInteraction: daysAgo(ACTIVE_WINDOW_DAYS), personCreatedAt: daysAgo(400) })
    );
    expect(result.state).toBe('active');
  });

  it('boundary: interaction one day past ACTIVE_WINDOW_DAYS is "cooling"', () => {
    const result = classifyRelationshipState(
      baseInput({ lastMeaningfulInteraction: daysAgo(ACTIVE_WINDOW_DAYS + 1), personCreatedAt: daysAgo(400) })
    );
    expect(result.state).toBe('cooling');
  });

  it('boundary: interaction exactly COOLING_WINDOW_DAYS ago is still "cooling" (uses <=)', () => {
    const result = classifyRelationshipState(
      baseInput({ lastMeaningfulInteraction: daysAgo(COOLING_WINDOW_DAYS), personCreatedAt: daysAgo(400) })
    );
    expect(result.state).toBe('cooling');
  });

  it('boundary: interaction one day past COOLING_WINDOW_DAYS is "dormant"', () => {
    const result = classifyRelationshipState(
      baseInput({ lastMeaningfulInteraction: daysAgo(COOLING_WINDOW_DAYS + 1), personCreatedAt: daysAgo(400) })
    );
    expect(result.state).toBe('dormant');
  });

  it('boundary: person created exactly NEW_PERSON_WINDOW_DAYS ago with no interaction is still "new" (uses <=)', () => {
    const result = classifyRelationshipState(
      baseInput({ lastMeaningfulInteraction: null, personCreatedAt: daysAgo(NEW_PERSON_WINDOW_DAYS) })
    );
    expect(result.state).toBe('new');
  });

  it('boundary: person created one day past NEW_PERSON_WINDOW_DAYS with no interaction is "dormant"', () => {
    const result = classifyRelationshipState(
      baseInput({ lastMeaningfulInteraction: null, personCreatedAt: daysAgo(NEW_PERSON_WINDOW_DAYS + 1) })
    );
    expect(result.state).toBe('dormant');
  });

  it('boundary: prior gap of exactly REACTIVATION_GAP_DAYS is NOT "reactivated" (uses >)', () => {
    const lastDays = 5;
    const result = classifyRelationshipState(
      baseInput({
        lastMeaningfulInteraction: daysAgo(lastDays),
        previousMeaningfulInteraction: daysAgo(lastDays + REACTIVATION_GAP_DAYS),
        personCreatedAt: daysAgo(1000)
      })
    );
    expect(result.state).toBe('active');
  });

  it('boundary: prior gap of REACTIVATION_GAP_DAYS + 1 is "reactivated"', () => {
    const lastDays = 5;
    const result = classifyRelationshipState(
      baseInput({
        lastMeaningfulInteraction: daysAgo(lastDays),
        previousMeaningfulInteraction: daysAgo(lastDays + REACTIVATION_GAP_DAYS + 1),
        personCreatedAt: daysAgo(1000)
      })
    );
    expect(result.state).toBe('reactivated');
  });

  // --- Reactivated requires both conditions ---------------------------

  it('recent interaction with no previousMeaningfulInteraction is "active", not "reactivated"', () => {
    const result = classifyRelationshipState(
      baseInput({
        lastMeaningfulInteraction: daysAgo(5),
        previousMeaningfulInteraction: null,
        personCreatedAt: daysAgo(400)
      })
    );
    expect(result.state).toBe('active');
  });

  it('long prior gap but last interaction itself not recent is not "reactivated" (falls to cooling/dormant per its own recency)', () => {
    const lastDays = ACTIVE_WINDOW_DAYS + 10; // not recent -> cooling territory
    const result = classifyRelationshipState(
      baseInput({
        lastMeaningfulInteraction: daysAgo(lastDays),
        previousMeaningfulInteraction: daysAgo(lastDays + REACTIVATION_GAP_DAYS + 50),
        personCreatedAt: daysAgo(1000)
      })
    );
    expect(result.state).toBe('cooling');
    expect(result.state).not.toBe('reactivated');
  });

  // --- Other requirements ---------------------------------------------

  it('person created long ago with zero interactions ever is "dormant", not "new"', () => {
    const result = classifyRelationshipState(
      baseInput({ lastMeaningfulInteraction: null, personCreatedAt: daysAgo(1000) })
    );
    expect(result.state).toBe('dormant');
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.reasons.join(' ')).toMatch(/1000/);
  });

  it('activeSharedContexts > 0 alone (no recent interaction, no upcoming) yields "active"', () => {
    const result = classifyRelationshipState(
      baseInput({
        lastMeaningfulInteraction: null,
        personCreatedAt: daysAgo(1000),
        activeSharedContexts: 3
      })
    );
    expect(result.state).toBe('active');
    expect(result.reasons.join(' ')).toMatch(/3/);
  });

  it('upcomingInteraction alone (no recent interaction) yields "active"', () => {
    const upcoming = new Date(Date.parse(NOW) + 10 * DAY_MS).toISOString();
    const result = classifyRelationshipState(
      baseInput({
        lastMeaningfulInteraction: null,
        personCreatedAt: daysAgo(1000),
        upcomingInteraction: upcoming
      })
    );
    expect(result.state).toBe('active');
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.reasons.join(' ')).toMatch(/10/);
  });

  it('never returns an empty reasons array for any branch', () => {
    const cases: RelationshipStateInput[] = [
      baseInput({ lastMeaningfulInteraction: null, personCreatedAt: daysAgo(5) }), // new
      baseInput({ lastMeaningfulInteraction: daysAgo(10), personCreatedAt: daysAgo(400) }), // active
      baseInput({ lastMeaningfulInteraction: daysAgo(ACTIVE_WINDOW_DAYS + 30), personCreatedAt: daysAgo(400) }), // cooling
      baseInput({ lastMeaningfulInteraction: daysAgo(COOLING_WINDOW_DAYS + 30), personCreatedAt: daysAgo(400) }), // dormant
      baseInput({
        lastMeaningfulInteraction: daysAgo(5),
        previousMeaningfulInteraction: daysAgo(5 + REACTIVATION_GAP_DAYS + 50),
        personCreatedAt: daysAgo(1000)
      }) // reactivated
    ];
    for (const input of cases) {
      const result = classifyRelationshipState(input);
      expect(result.reasons.length).toBeGreaterThan(0);
      for (const reason of result.reasons) {
        expect(reason.length).toBeGreaterThan(0);
      }
    }
  });

  it('defaults `now` to the current time when omitted', () => {
    const input = baseInput({ lastMeaningfulInteraction: null, personCreatedAt: new Date().toISOString() });
    delete (input as { now?: string }).now;
    const result = classifyRelationshipState(input);
    expect(result.state).toBe('new');
  });
});
