import { describe, it, expect } from 'vitest';
import { BlockSchema } from '@/schemas/block';
import { createBlock, BLOCK_GROUPS, HOMEPAGE_BLOCK_GROUPS, UNIT_PLAN_BLOCK_GROUPS } from '@/blocks/create-block';
import { createBlockEditor } from '@/blocks/editors';
import { renderBlock } from '@/blocks/render';
import { blockRegistry } from '@/blocks/registry';
import { listPublishBlockIssues } from '@/schemas/publish-block-issues';

describe('Note cue block', () => {
  it('is a lesson-only Learning block that round-trips', () => {
    const block = createBlock('note_cue', 'n1');
    expect(BlockSchema.parse(block)).toMatchObject({ block_type: 'note_cue', content: { kind: 'own_words', prompt: '' } });
    expect(BLOCK_GROUPS.find((g) => g.label === 'Learning')?.types).toContain('note_cue');
    expect(HOMEPAGE_BLOCK_GROUPS.flatMap((g) => g.types)).not.toContain('note_cue');
    expect(UNIT_PLAN_BLOCK_GROUPS.flatMap((g) => g.types)).not.toContain('note_cue');
    expect(blockRegistry.note_cue).toBeDefined();
  });

  it('renders the prompt under an "In your book" label', () => {
    const block = { ...createBlock('note_cue', 'n1'), content: { kind: 'copy', prompt: 'Write: juxtaposition' } } as ReturnType<typeof createBlock>;
    const el = renderBlock(block, 'student');
    expect(el.querySelector('.block-note-cue__label')?.textContent).toBe('In your book');
    expect(el.querySelector('.block-note-cue__kind')?.textContent).toBe('Copy this');
    expect(el.querySelector('.block-note-cue__prompt')?.textContent).toBe('Write: juxtaposition');
  });

  it('edits kind and prompt', () => {
    let latest = createBlock('note_cue', 'n1') as Extract<ReturnType<typeof createBlock>, { block_type: 'note_cue' }>;
    const editor = createBlockEditor(latest, (next) => { latest = next as typeof latest; }, () => latest);
    const prompt = editor.querySelector<HTMLTextAreaElement>('.block-editor__note-cue-prompt')!;
    prompt.value = 'Sketch the cycle';
    prompt.dispatchEvent(new Event('input'));
    const draw = editor.querySelector<HTMLButtonElement>('[data-kind="draw"]')!;
    draw.click();
    expect(latest.content).toEqual({ kind: 'draw', prompt: 'Sketch the cycle' });
  });

  it('blocks publishing an empty prompt', () => {
    const issues = listPublishBlockIssues([createBlock('note_cue', 'n1')]);
    expect(issues.map((i) => i.message)).toContain('Write the prompt for this note cue');
  });
});
