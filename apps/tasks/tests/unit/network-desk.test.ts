import { describe, expect, it } from 'vitest';
import { agentBySlug } from '@/chat/agents';
import { networkBriefing } from '@/domain/network-desk';
import type { StressFlag } from '@/schemas/stress';

const flag: StressFlag = {
  schema_version: 1,
  id: 'sf_1',
  source_project_or_task_id: null,
  pattern_description: 'Ethics and Da Vinci overlap in the same fortnight.',
  pattern_kind: 'overlapping_excursions',
  raised_by: 'Clare DeMind',
  routed_to: ['General Hammond', 'Penelope Rose Quillian', 'Dr Vera Lenz'],
  recurrence_note: 'October does this.',
  fingerprint: 'fp',
  created_at: '2026-08-26T00:00:00.000Z'
};

describe('networkBriefing', () => {
  it('gives Hammond a sitrep from routed flags', () => {
    const text = networkBriefing(agentBySlug('hammond'), [flag], { protocolId: 'whats-running' });
    expect(text).toMatch(/sitrep/i);
    expect(text).toContain('Ethics and Da Vinci overlap');
    expect(text).toContain('October does this.');
  });

  it('keeps an empty Hammond inbox honest', () => {
    const text = networkBriefing(agentBySlug('hammond'), []);
    expect(text).toMatch(/inbox is clear/i);
    expect(text).not.toContain('**On the board**');
  });

  it('lets Penelope talk about texture, not tasks', () => {
    const text = networkBriefing(agentBySlug('penelope'), [flag], { protocolId: 'check-in' });
    expect(text).toMatch(/texture/i);
    expect(text).not.toMatch(/sitrep/i);
    expect(text).toContain('Ethics and Da Vinci overlap');
  });
});
