import { describe, expect, it } from 'vitest';
import { AGENT_PROTOCOL_PACKS, pickAgentWaitLine } from '@/ai/agent-protocols';
import { protocolForAgent } from '@/ai/protocols';

describe('Teaching Hub protocol steering', () => {
  it('adds the selected Ann protocol to the live system prompt', () => {
    const prompt = protocolForAgent('ann', 'lesson-diagnosis');

    expect(prompt).toContain('Run the Lesson diagnosis protocol');
    expect(prompt).toContain('Diagnose the lesson before prescribing changes');
  });

  it('ignores a protocol that belongs to another personality', () => {
    const prompt = protocolForAgent('ann', 'untangle-this');

    expect(prompt).not.toContain('Untangle this');
    expect(prompt).not.toContain('selected protocol');
  });
});

describe('Teaching Hub wait lines', () => {
  it('keeps a distinct wait-line pool for each current agent', () => {
    for (const slug of ['ann', 'clementine', 'hammond', 'clare'] as const) {
      const lines = AGENT_PROTOCOL_PACKS[slug].waitLines;
      expect(lines.length).toBeGreaterThan(3);
      expect(pickAgentWaitLine(slug, { random: () => 0 })).toBe(lines[0]);
      expect(pickAgentWaitLine(slug, { exclude: lines[0], random: () => 0 })).toBe(lines[1]);
    }
    expect(AGENT_PROTOCOL_PACKS.ann.waitLines[0]).toMatch(/lesson/i);
    expect(AGENT_PROTOCOL_PACKS.clare.waitLines[0]).toMatch(/loose ends|brain dump|first tiny step/i);
  });
});
