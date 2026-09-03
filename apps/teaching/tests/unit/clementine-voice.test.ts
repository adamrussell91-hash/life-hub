import { describe, expect, it } from 'vitest';
import { protocolForAgent } from '@/ai/protocols';
import { pullArchive } from '@/ai/archiveKernel';

describe('Clementine voice pack', () => {
  it('stacks shared identity with the school job and keeps Teaching Hub tool rules', () => {
    const protocol = protocolForAgent('clementine');
    expect(protocol).toContain('Professor Clementine Haig');
    expect(protocol).toContain('You buried it on page three');
    expect(protocol).toContain('This is the school workplace');
    expect(protocol).toContain('Propose schema-valid content via tools');
    expect(protocol).not.toContain('Work on the selected block');
    expect(protocol).toContain('any part of the lesson');
    expect(protocol).not.toContain('University Reading Protocol');
    expect(protocol).not.toContain('search the Knowledge Hub Notion database');
  });
});

describe('Ann protocol', () => {
  it('allows whole-lesson edits instead of gating on the selected block', () => {
    const protocol = protocolForAgent('ann');
    expect(protocol).not.toContain('Default to the selected block or section.');
    expect(protocol).toContain('any part of the lesson');
  });

  it('adds a selected user-facing move without exposing router narration', () => {
    const protocol = protocolForAgent('ann', 'lesson-diagnosis');
    expect(protocol).toContain('Run the Lesson diagnosis protocol');
    expect(protocol).not.toContain('protocol_id');
  });
});

describe('archive kernel client', () => {
  it('sends the secret header and never returns it to the caller payload', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const result = await pullArchive({
      query: 'Gagne DMGT',
      documentContext: 'Year 8 English',
      url: 'https://kernel.test',
      secret: 'super-secret-kernel',
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response(
          JSON.stringify({
            findings: [
              {
                pageId: 'p1',
                title: 'DMGT',
                excerpt: 'gifts vs talents',
                stance: 'supports'
              }
            ],
            gaps: []
          }),
          { status: 200 }
        );
      }
    });

    expect(calls[0]?.url).toBe('https://kernel.test/quick_research');
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers['x-research-kernel-secret']).toBe('super-secret-kernel');
    expect(JSON.stringify(result)).not.toMatch(/super-secret-kernel/);
    expect(result.findings[0]?.title).toBe('DMGT');
  });
});
