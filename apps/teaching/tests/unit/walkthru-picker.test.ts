import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Block } from '@/schemas/block';
import { techniqueById } from '../../../../packages/walkthrus/catalogue.mjs';

const api = vi.hoisted(() => ({
  clusters: [] as Array<{ id: string; name: string; tiles: Array<{ id: string }> }>,
  fail: false
}));
vi.mock('@/blocks/walkthru-note/api', async (original) => ({
  ...(await original<typeof import('@/blocks/walkthru-note/api')>()),
  loadBoardClusters: () => (api.fail ? Promise.reject(new Error('offline')) : Promise.resolve(api.clusters))
}));

import { boardGroups, recommendedIdsByExemplar, recommendedIdsByType, recommendedTechniques } from '@/blocks/walkthru-note/picker-groups';
import { createLensEditor } from '@/blocks/lenses/lens-editor';
import { attachedTechniques } from '@/blocks/walkthru-note/attach';

const block = (block_type: string, content: Record<string, unknown> = {}): Block => ({ id: 'b1', type: 'block', block_type, content } as unknown as Block);
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const headings = (root: HTMLElement) => [...root.querySelectorAll('.kaplan-lens-group')].map((h) => h.textContent);
const clickText = (root: HTMLElement, text: string) => [...root.querySelectorAll('button')].find((b) => b.textContent === text)!.click();

beforeEach(() => {
  document.body.replaceChildren();
  api.clusters = [];
  api.fail = false;
});

describe('recommended techniques', () => {
  it('names only real book techniques', () => {
    const ids = [...Object.values(recommendedIdsByType()), ...Object.values(recommendedIdsByExemplar())].flat();
    for (const id of ids) expect(techniqueById(id)?.kind, id).toBe('technique');
  });
  it('offers the fitting techniques for a block type, best fit first', () => {
    expect(recommendedTechniques(block('faded_example'))[0]).toBe('w1-worked-examples-and-backward-fading');
    expect(recommendedTechniques(block('hinge_question'))).toContain('w2-multiple-choice-questions');
    expect(recommendedTechniques(block('rich_text'))).toEqual([]);
  });
  it('keeps the Voice oracy technique first', () => {
    expect(recommendedTechniques(block('audio', { oracy: 'debate' }))).toEqual(['w1-oracy-debating']);
  });
  it('leads an exemplar annotation with Exemplars, without repeats', () => {
    const ids = recommendedTechniques(block('annotation', { exemplar: { kind: 'compare' } }));
    expect(ids[0]).toBe('w2-exemplars');
    expect(ids).toContain('w2-compare-contrast-and-categorise');
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('board groups', () => {
  it('reads a board with only the default cluster as On your board', () => {
    expect(boardGroups([{ id: 'cl_board', name: 'My board', tiles: [{ id: 'w1-cold-calling' }] }])).toEqual([{ name: 'On your board', items: ['w1-cold-calling'] }]);
  });
  it('names each cluster, skips fusions and empty clusters', () => {
    const groups = boardGroups([
      { id: 'cl_a', name: 'Feedback loop', tiles: [{ id: 'w1-whole-class-feedback' }, { id: 'fu_abcdef12' }] },
      { id: 'cl_b', name: 'Only fusions', tiles: [{ id: 'fu_abcdef12' }] }
    ]);
    expect(groups).toEqual([{ name: 'On your board · Feedback loop', items: ['w1-whole-class-feedback'] }]);
  });
});

describe('the WalkThru picker', () => {
  it('lists recommended, then board clusters, then every series', async () => {
    api.clusters = [{ id: 'cl_a', name: 'Questioning', tiles: [{ id: 'w1-cold-calling' }] }];
    let current = block('faded_example');
    const editor = createLensEditor({ getBlock: () => current, onChange: (next) => { current = next; } });
    document.body.append(editor);
    clickText(editor, 'Add WalkThru…');
    expect(headings(editor)[0]).toBe('Recommended for this block');
    await flush();
    expect(headings(editor).slice(0, 3)).toEqual(['Recommended for this block', 'On your board · Questioning', 'Questioning and feedback']);
    editor.querySelector<HTMLButtonElement>('.wts-pick__board .kaplan-lens-choice')!.click();
    expect(attachedTechniques(current)).toEqual(['w1-cold-calling']);
  });
  it('still works when the board cannot load', async () => {
    api.fail = true;
    const editor = createLensEditor({ getBlock: () => block('hinge_question'), onChange: () => undefined });
    document.body.append(editor);
    clickText(editor, 'Add WalkThru…');
    await flush();
    expect(headings(editor)[0]).toBe('Recommended for this block');
    expect(headings(editor)).not.toContain('On your board');
  });
});
