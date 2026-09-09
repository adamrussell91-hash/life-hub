import { describe, expect, it } from 'vitest';
import type { ActiveEscalation } from '@/schemas/project';
import { ESCALATION_TIERS, currentEscalationTierIndex, isEscalationAtFinalTier } from '@/domain/excursion-muster';

function escalationStartedMinutesAgo(minutes: number): ActiveEscalation {
  return {
    stop_id: 'stop_1',
    started_at: new Date(Date.now() - minutes * 60_000).toISOString(),
    resolved: false
  };
}

describe('escalation ladder', () => {
  it('starts at tier 0 the instant it opens', () => {
    const escalation = escalationStartedMinutesAgo(0);
    expect(currentEscalationTierIndex(escalation)).toBe(0);
    expect(isEscalationAtFinalTier(escalation)).toBe(false);
  });

  it('advances tiers as real elapsed time passes — survives a reload, no timer needed', () => {
    expect(currentEscalationTierIndex(escalationStartedMinutesAgo(2))).toBe(0);
    expect(currentEscalationTierIndex(escalationStartedMinutesAgo(3))).toBe(1);
    expect(currentEscalationTierIndex(escalationStartedMinutesAgo(6.9))).toBe(1);
    expect(currentEscalationTierIndex(escalationStartedMinutesAgo(7))).toBe(2);
    expect(currentEscalationTierIndex(escalationStartedMinutesAgo(10))).toBe(3);
    expect(currentEscalationTierIndex(escalationStartedMinutesAgo(45))).toBe(ESCALATION_TIERS.length - 1);
  });

  it('reports the final tier once at or past the last threshold', () => {
    expect(isEscalationAtFinalTier(escalationStartedMinutesAgo(10))).toBe(true);
    expect(isEscalationAtFinalTier(escalationStartedMinutesAgo(9))).toBe(false);
  });
});
