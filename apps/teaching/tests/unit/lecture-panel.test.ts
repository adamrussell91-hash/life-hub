// apps/teaching/tests/unit/lecture-panel.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { Block } from '@/schemas/block';
import type { Lesson } from '@/schemas/lesson';
import { previewBlocks } from '@/lecture/preview';
import { mountLecturePanel } from '@/lecture/teacher-panel';

const b = (id: string, block_type: string, content: Record<string, unknown> = {}, visibility = 'student_teacher') =>
  ({ id, type: 'block', block_type, variant: 'medium', visibility, content }) as unknown as Block;

describe('preview blocks', () => {
  it('drops teacher-only blocks and teacher notes but keeps hinge answers', () => {
    const hinge = b('q', 'hinge_question', { prompt: 'p', options: [], correct_id: 'a' });
    const out = previewBlocks([b('t', 'rich_text', {}, 'teacher_only'), b('n', 'teacher_note', {}), b('s', 'section', { title: 'A', blocks: [hinge, b('x', 'rich_text', {}, 'teacher_only')] })]);
    expect(out.map((x) => x.id)).toEqual(['s']);
    expect((out[0]!.content as { blocks: Block[] }).blocks).toEqual([hinge]);
  });
});

describe('lecture panel', () => {
  it('shades each scene by how many students reached it and lists hand-ups by scene', async () => {
    const lesson = { id: 'l1', title: 'Tone', blocks: [b('h1', 'heading', { text: 'Tone' }), b('k1', 'cloze', { text: 'x' }), b('h2', 'heading', { text: 'Mood' })] } as unknown as Lesson;
    const fetchSummary = vi.fn().mockResolvedValue({
      students: 4,
      scenes: { h1: { reached: 4, replays: 2 }, h2: { reached: 1, replays: 0 } },
      misses: { k1: 3 },
      handups: [{ id: 'o~1', scene_id: 'h1', scene_label: 'Tone', text: 'lost', status: 'open', reply: '', at: '2026-10-23T01:00:00Z', clip_s: 12, who: { initials: 'AB', name: null } }]
    });
    const panel = mountLecturePanel({ getLesson: () => lesson, fetchSummary, answerHandup: vi.fn(), onAddCallout: vi.fn() });
    document.body.append(panel.root);
    await panel.refresh();
    const cells = panel.root.querySelectorAll<HTMLElement>('.lecture-replay__scene');
    expect(cells).toHaveLength(2);
    expect(cells[0]!.style.getPropertyValue('--reach')).toBe('1');
    expect(cells[0]!.textContent).toContain('↻ 2');
    expect(cells[0]!.textContent).toContain('✗ 3');
    expect(cells[0]!.textContent).toContain('✋ 1');
    expect(cells[1]!.style.getPropertyValue('--reach')).toBe('0.25');
    expect(panel.root.querySelector('.lecture-handups__group-title')?.textContent).toBe('Tone · 1');
    expect(panel.root.querySelector('.lecture-handups__item')?.textContent).toContain('AB');
  });
});

describe('lecture panel: preview overlay, replies, callout', () => {
  const lesson = { id: 'l1', title: 'Tone', blocks: [b('h1', 'heading', { text: 'Tone' })] } as unknown as Lesson;
  const summary = (over: Record<string, unknown> = {}) => ({
    students: 1, scenes: {}, misses: {},
    handups: [{ id: 'o~1', scene_id: 'h1', scene_label: 'Tone', text: '<b>lost</b>', status: 'open', reply: '', at: 'x', clip_s: 65, who: { initials: 'AB', name: null } }],
    ...over
  });

  it('opens the preview full-screen, closes on Escape and returns focus', async () => {
    const panel = mountLecturePanel({ getLesson: () => lesson, fetchSummary: vi.fn().mockResolvedValue(summary()), answerHandup: vi.fn(), onAddCallout: vi.fn() });
    document.body.append(panel.root);
    const play = panel.root.querySelector<HTMLButtonElement>('.lecture-panel__head button')!;
    play.click();
    expect(document.querySelector('.lecture-preview')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('.lecture-preview')).toBeNull();
    expect(document.activeElement).toBe(play);
    play.click();
    document.querySelector<HTMLButtonElement>('.lecture-preview__close')!.click();
    expect(document.querySelector('.lecture-preview')).toBeNull();
    panel.dispose();
  });

  it('renders hand-up text as text, sends a reply, and offers Add as callout once answered', async () => {
    const answered = summary({ handups: [{ id: 'o~1', scene_id: 'h1', scene_label: 'Tone', text: '<b>lost</b>', status: 'answered', reply: 'see slide', at: 'x', clip_s: 0, who: null }] });
    const answerHandup = vi.fn().mockResolvedValue(answered);
    const onAddCallout = vi.fn();
    const panel = mountLecturePanel({ getLesson: () => lesson, fetchSummary: vi.fn().mockResolvedValue(summary()), answerHandup, onAddCallout });
    document.body.append(panel.root);
    await panel.refresh();
    expect(panel.root.querySelector('.lecture-handups__text')?.textContent).toBe('<b>lost</b>');
    expect(panel.root.querySelector('.lecture-handups__text b')).toBeNull();
    expect(panel.root.querySelector('.lecture-handups__who')?.textContent).toBe('AB · 1:05 in');
    panel.root.querySelector<HTMLInputElement>('.lecture-handups__reply-input')!.value = ' see slide ';
    const buttons = panel.root.querySelectorAll<HTMLButtonElement>('.lecture-handups__item button');
    buttons[0]!.click();
    await vi.waitFor(() => expect(panel.root.querySelector('.lecture-handups__item--done')).not.toBeNull());
    expect(answerHandup).toHaveBeenCalledWith('l1', 'o~1', 'see slide');
    panel.root.querySelector<HTMLButtonElement>('.lecture-handups__item button')!.click();
    expect(onAddCallout).toHaveBeenCalledWith('h1', 'see slide');
  });
});

describe('prependToSection', () => {
  it('puts a block first inside the section and leaves other ids alone', async () => {
    const { prependToSection } = await import('@/lecture/tree');
    const sec = b('s', 'section', { title: 'A', blocks: [b('x', 'rich_text')] });
    const added = b('c', 'callout');
    const out = prependToSection([sec], 's', added);
    expect((out[0]!.content as { blocks: Block[] }).blocks.map((k) => k.id)).toEqual(['c', 'x']);
    const same = [sec];
    expect(prependToSection(same, 'x', added)).toBe(same);
  });
});
