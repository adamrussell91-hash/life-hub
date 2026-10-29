import { describe, it, expect, vi } from 'vitest';
import { BlockSchema } from '@/schemas/block';
import { createBlock, BLOCK_GROUPS, HOMEPAGE_BLOCK_GROUPS, UNIT_PLAN_BLOCK_GROUPS } from '@/blocks/create-block';
import { createBlockEditor } from '@/blocks/editors';
import { renderBlock } from '@/blocks/render';
import { blockRegistry } from '@/blocks/registry';
import { publishBlockIssues } from '@/schemas/publish-block-issues';
import { nearestStop, snapPoints, scaleValueText } from '@/blocks/continuum-line/shared';
import { mountStage } from '@/blocks/continuum-line/stage';

describe('Continuum line block', () => {
  it('is an insertable Thinking Toolkit block with defaults that round-trip through the schema', () => {
    const block = createBlock('continuum_line', 'cl1');
    const parsed = BlockSchema.parse(block);
    if (parsed.block_type !== 'continuum_line') throw new Error('Expected continuum_line');
    expect(parsed.content.scale).toEqual({ left: 'Implied', right: 'Not implied', stops: [] });
    expect(parsed.content.pace).toBe('teacher');
    expect(parsed.content.replace).toBe(true);
    expect(parsed.content.statements).toHaveLength(1);
    expect(BLOCK_GROUPS.find((g) => g.label === 'Thinking Toolkit')?.types).toContain('continuum_line');
    expect(HOMEPAGE_BLOCK_GROUPS.flatMap((g) => g.types)).not.toContain('continuum_line');
    expect(UNIT_PLAN_BLOCK_GROUPS.flatMap((g) => g.types)).not.toContain('continuum_line');
    expect(blockRegistry.continuum_line).toBeDefined();
    const eleven = Array.from({ length: 11 }, (_, i) => ({ id: `s${i}`, text: 'x', snap: false }));
    expect(() => BlockSchema.parse({ ...block, content: { ...parsed.content, statements: eleven } })).toThrow();
  });

  it('snap points match the server: ends plus evenly spaced stops', () => {
    expect(snapPoints([])).toEqual([0, 1]);
    expect(snapPoints(['Some'])).toEqual([0, 0.5, 1]);
    expect(nearestStop(0.62, ['Some'])).toBe(0.5);
    expect(nearestStop(0.9, [])).toBe(1);
  });

  it('the editor saves the stimulus, a preset line, statements and snapping', () => {
    const block = createBlock('continuum_line', 'cl1');
    const changed = vi.fn();
    const editor = createBlockEditor(block, changed);
    const stimulus = editor.querySelector('textarea')!;
    stimulus.value = 'Ben stood at the bus stop, sweating.';
    stimulus.dispatchEvent(new Event('input'));
    const preset = [...editor.querySelectorAll<HTMLButtonElement>('.cl-chip')].find((b) => b.textContent === 'All · Some · None')!;
    preset.click();
    const statement = editor.querySelector<HTMLInputElement>('.cl-editor__statement input[type="text"]')!;
    statement.value = 'It was a hot day.';
    statement.dispatchEvent(new Event('input'));
    const snap = editor.querySelector<HTMLInputElement>('.cl-editor__statement input[type="checkbox"]')!;
    snap.checked = true;
    snap.dispatchEvent(new Event('change'));
    const updated = changed.mock.calls.at(-1)![0];
    expect(updated.content.stimulus.text).toBe('Ben stood at the bus stop, sweating.');
    expect(updated.content.scale).toEqual({ left: 'All', right: 'None', stops: ['Some'] });
    expect(updated.content.statements[0]).toMatchObject({ text: 'It was a hot day.', snap: true });
    expect(BlockSchema.safeParse(updated).success).toBe(true);
  });

  it('publish needs a statement and a stimulus', () => {
    const block = createBlock('continuum_line', 'cl1');
    expect(publishBlockIssues([block])).toMatch(/statement/);
    const withStatement = { ...block, content: { ...block.content, statements: [{ id: 's1', text: 'It was a hot day.', snap: false }] } } as typeof block;
    expect(publishBlockIssues([withStatement])).toMatch(/stimulus/);
    const ready = { ...withStatement, content: { ...withStatement.content, stimulus: { kind: 'text', text: 'Ben was sweating.', url: '', alt_text: '' } } } as typeof block;
    expect(publishBlockIssues([ready])).toBeNull();
  });

  it('print shows the stimulus and a line per statement with room for a reason', () => {
    const block = createBlock('continuum_line', 'cl1');
    const filled = { ...block, content: { ...block.content, stimulus: { kind: 'text', text: 'Ben was sweating.', url: '', alt_text: '' }, statements: [{ id: 's1', text: 'It was a hot day.', snap: false }, { id: 's2', text: 'Ben owns a phone.', snap: true }] } } as typeof block;
    const printed = renderBlock(filled, 'print');
    expect(printed.textContent).toContain('Ben was sweating.');
    expect(printed.querySelectorAll('.cl-print__item')).toHaveLength(2);
    expect(printed.querySelectorAll('.cl-tick--stop').length).toBeGreaterThan(0);
    expect(printed.querySelector('button')).toBeNull();
  });

  it('the stage shows only symbols while collecting and makes them clickable after the reveal', () => {
    const picks: Array<string | null> = [];
    const stage = mountStage((s) => picks.push(s));
    document.body.append(stage.root);
    const scale = { left: 'Implied', right: 'Not implied', stops: [] };
    stage.update({ key: 'a', scale, snap: false, phase: 'collect', movesShown: false, entries: [{ symbol: '0-1' }, { symbol: '2-3' }], picked: null });
    expect(stage.root.querySelectorAll('.cl-sym')).toHaveLength(2);
    expect(stage.root.classList.contains('is-collecting')).toBe(true);
    stage.root.querySelector<HTMLElement>('.cl-sym')!.click();
    expect(picks).toEqual([]);
    stage.update({ key: 'a', scale, snap: false, phase: 'revealed', movesShown: false, entries: [{ symbol: '0-1', pos: 0.2 }, { symbol: '2-3', pos: 0.8 }], picked: null });
    stage.root.querySelector<HTMLElement>('.cl-sym')!.click();
    expect(picks).toHaveLength(1);
    stage.update({ key: 'a', scale, snap: false, phase: 'replace', movesShown: true, entries: [{ symbol: '0-1', pos: 0.2, new_pos: 0.6 }, { symbol: '2-3', pos: 0.8 }], picked: null });
    expect(stage.root.querySelectorAll('.cl-ghost')).toHaveLength(1);
    stage.update({ key: 'b', scale, snap: false, phase: 'collect', movesShown: false, entries: [], picked: null });
    expect(stage.root.querySelectorAll('.cl-sym, .cl-ghost')).toHaveLength(0);
    stage.root.remove();
  });

  it('slider value text names the nearest pole or stop', () => {
    const scale = { left: 'Implied', right: 'Not implied', stops: ['Somewhat'] };
    expect(scaleValueText(scale, 0)).toBe('Implied, 0 out of 100');
    expect(scaleValueText(scale, 1)).toBe('Not implied, 100 out of 100');
    expect(scaleValueText(scale, 0.5)).toBe('Somewhat, 50 out of 100');
    expect(scaleValueText(scale, 0.3)).toBe('Nearest to Somewhat, 30 out of 100');
    expect(scaleValueText({ left: 'A', right: 'B', stops: [] }, 0.9)).toBe('Nearest to B, 90 out of 100');
  });
});
