import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Block } from '@/schemas/block';

vi.mock('@/blocks/walkthru-note/api', async (original) => ({
  ...(await original<typeof import('@/blocks/walkthru-note/api')>()),
  loadBoardClusters: () => Promise.resolve([])
}));

import { hasThinkAloud, renderThinkAloud, thinkAloudOf, withThinkAloud } from '@/blocks/think-aloud';
import { filterBlocksForStudent } from '@/blocks/visibility';
import { createLensEditor } from '@/blocks/lenses/lens-editor';
import { renderBlock } from '@/blocks/render';
import { createBlock } from '@/blocks/create-block';
import { filterBlocksForStudent as serverFilter } from '../../../../netlify/functions/_shared/teaching-student.mjs';

const block = (settings: Record<string, unknown> = {}): Block => ({ ...createBlock('rich_text', 'b1'), settings } as Block);
const clickText = (root: HTMLElement, text: string) => [...root.querySelectorAll('button')].find((b) => b.textContent === text)!.click();

beforeEach(() => document.body.replaceChildren());

describe('think-aloud script', () => {
  it('keeps only known moves with words, trimmed', () => {
    const b = withThinkAloud(block({ size: 2 }), { task: '  Name the task  ', plan: '', bogus: 'x' } as never);
    expect(thinkAloudOf(b)).toEqual({ task: 'Name the task' });
    expect(b.settings).toMatchObject({ size: 2 });
  });
  it('takes the setting off when emptied', () => {
    const b = withThinkAloud(withThinkAloud(block({ size: 2 }), { task: 'x' }), {});
    expect(hasThinkAloud(b)).toBe(false);
    expect(b.settings).toEqual({ size: 2 });
  });
  it('renders only filled moves, and nothing when empty', () => {
    expect(renderThinkAloud(block())).toBeNull();
    const out = renderThinkAloud(withThinkAloud(block(), { know: 'Last week’s example', check: 'Units' }))!;
    expect(out.querySelectorAll('.think-aloud__move')).toHaveLength(2);
    expect(out.textContent).toContain('2 moves · only you see this');
  });
});

describe('who sees it', () => {
  const scripted = withThinkAloud(block(), { plan: 'Say the steps' });
  it('is stripped for students, in the app and on the server', () => {
    expect((filterBlocksForStudent([scripted])[0]!.settings as Record<string, unknown>).think_aloud).toBeUndefined();
    expect((serverFilter([scripted])[0].settings as Record<string, unknown>).think_aloud).toBeUndefined();
  });
  it('shows in the teacher view but not on Display', () => {
    expect(renderBlock(scripted, 'teacher').querySelector('.think-aloud')).toBeTruthy();
    expect(renderBlock(scripted, 'teacher', { display: true }).querySelector('.think-aloud')).toBeNull();
    expect(renderBlock(scripted, 'student').querySelector('.think-aloud')).toBeNull();
  });
});

describe('writing it from block options', () => {
  it('adds, edits and takes off the script', () => {
    let current = block();
    const editor = createLensEditor({ getBlock: () => current, onChange: (next) => { current = next; } });
    document.body.append(editor);
    clickText(editor, 'Add think-aloud…');
    const boxes = editor.querySelectorAll<HTMLTextAreaElement>('.think-aloud-edit__box');
    expect(boxes).toHaveLength(5);
    boxes[0]!.value = 'What does the question want?';
    boxes[0]!.dispatchEvent(new Event('input'));
    clickText(editor, 'Save');
    expect(thinkAloudOf(current)).toEqual({ task: 'What does the question want?' });
    expect(editor.querySelector('.think-aloud-chip')).toBeTruthy();
    clickText(editor, 'Edit think-aloud…');
    clickText(editor, 'Take it off');
    expect(hasThinkAloud(current)).toBe(false);
  });
});
