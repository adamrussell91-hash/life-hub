import { describe, it, expect, vi } from 'vitest';
import { BlockSchema } from '@/schemas/block';
import { createBlock, BLOCK_GROUPS, HOMEPAGE_BLOCK_GROUPS, UNIT_PLAN_BLOCK_GROUPS } from '@/blocks/create-block';
import { createBlockEditor } from '@/blocks/editors';
import { renderBlock } from '@/blocks/render';
import { blockRegistry } from '@/blocks/registry';

describe('Peer feedback block integration', () => {
  it('is an insertable lesson block and round-trips through published and nested schemas', () => {
    const block = createBlock('peer_feedback', 'peer1');
    expect(BlockSchema.parse(block).block_type).toBe('peer_feedback');
    expect(BLOCK_GROUPS.find(g => g.label === 'Learning')?.types).toContain('peer_feedback');
    expect(HOMEPAGE_BLOCK_GROUPS.flatMap(g => g.types)).not.toContain('peer_feedback');
    expect(UNIT_PLAN_BLOCK_GROUPS.flatMap(g => g.types)).not.toContain('peer_feedback');
    expect(blockRegistry.peer_feedback).toBeDefined();
    const section = createBlock('section', 'section1');
    if (section.block_type !== 'section') throw new Error('Expected section');
    section.content.blocks = [block];
    expect(BlockSchema.parse(section).content).toMatchObject({ blocks: [block] });
  });
  it('the real editor saves prompt edits and the real renderer provides a print alternative', () => {
    const block = createBlock('peer_feedback', 'peer1');
    const changed = vi.fn();
    const editor = createBlockEditor(block, changed);
    const prompt = editor.querySelector('textarea')!;
    prompt.value = 'What is your strongest argument?';
    prompt.dispatchEvent(new Event('input'));
    const updated = changed.mock.calls[0]![0];
    expect(updated.content.prompt).toBe(prompt.value);
    const printed = renderBlock(updated, 'print');
    expect(printed.textContent).toContain(prompt.value);
    expect(printed.textContent).toContain('One suggestion or question');
    expect(printed.querySelector('button')).toBeNull();
  });
  it('shows a calm not-live panel, not Loading and a red error, before the lesson is published', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: false, error: { code: 'not_published', message: 'Publish this lesson and block before starting an activity.' } }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    try {
      const block = createBlock('peer_feedback', 'peer-unpublished');
      const view = renderBlock(block, 'teacher', { lessonId: 'lesson-unpublished' });
      document.body.append(view);
      await vi.waitFor(() => expect(view.textContent).toContain('Not live yet'));
      expect(view.textContent).not.toContain('Loading…');
      const alert = view.querySelector<HTMLElement>('.pf-alert');
      expect(alert?.hidden).toBe(true);
      view.remove();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
