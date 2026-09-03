import { describe, expect, it } from 'vitest';
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
