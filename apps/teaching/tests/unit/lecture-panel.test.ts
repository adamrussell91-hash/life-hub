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

describe('review follow-ups', () => {
  const H = (over: Record<string, unknown> = {}) => ({ id: 'o~1', scene_id: 'h1', scene_label: 'Tone', text: 't', status: 'open', reply: '', at: 'x', clip_s: 0, who: null, ...over });
  const lesson = { id: 'l1', title: 'Tone', blocks: [b('h1', 'heading', { text: 'Tone' })] } as unknown as Lesson;
  const mk = (fetchSummary: () => Promise<unknown>, answerHandup = vi.fn()) =>
    mountLecturePanel({ getLesson: () => lesson, fetchSummary: fetchSummary as never, answerHandup, onAddCallout: vi.fn() });

  it('places a scene callout before an opening block so a gate keeps its side path', async () => {
    const { addToScene } = await import('@/lecture/tree');
    const gate = b('g', 'hinge_question');
    const side = b('sp', 'section', { title: 's', blocks: [] });
    const c = b('c', 'callout');
    expect(addToScene([gate, side], 'g', c).map((x) => x.id)).toEqual(['c', 'g', 'sp']);
    const h = b('h', 'heading', { text: 'x' });
    expect(addToScene([h, gate, side], 'h', c).map((x) => x.id)).toEqual(['h', 'c', 'g', 'sp']);
    const sec = b('s', 'section', { title: 'A', blocks: [gate, side] });
    expect(((addToScene([sec], 's', c)[0]!.content) as { blocks: Block[] }).blocks.map((x) => x.id)).toEqual(['c', 'g', 'sp']);
  });

  it('groups hand-ups for missing scenes and counts only open ones', async () => {
    const p = mk(vi.fn().mockResolvedValue({ students: 2, scenes: {}, misses: {}, handups: [H(), H({ id: 'o~2', status: 'answered' }), H({ id: 'o~3', scene_id: 'gone', scene_label: 'Old' })] }));
    await p.refresh();
    const titles = [...p.root.querySelectorAll('.lecture-handups__group-title')].map((x) => x.textContent);
    expect(titles).toEqual(['Tone · 1', 'Removed or moved parts · 1']);
    expect(p.root.querySelector('.lecture-replay__scene')!.getAttribute('aria-label')).toBe('Tone: 0 of 2 reached, 1 hand-up');
  });

  it('shows a retry on load failure and an error line on a failed answer', async () => {
    const fetchSummary = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue({ students: 1, scenes: {}, misses: {}, handups: [H()] });
    const answer = vi.fn().mockRejectedValue(new Error('x'));
    const p = mk(fetchSummary, answer);
    await p.refresh();
    expect(p.root.querySelector('.lecture-panel__status')!.textContent).toContain('Couldn’t load lecture activity');
    p.root.querySelector<HTMLButtonElement>('.lecture-panel__status button')!.click();
    await vi.waitFor(() => expect(p.root.querySelector('.lecture-handups__item')).not.toBeNull());
    p.root.querySelector<HTMLButtonElement>('.lecture-handups__item button')!.click();
    await vi.waitFor(() => expect(p.root.querySelector('.lecture-handups__error')!.textContent).toBe('That didn’t save. Try again.'));
  });

  it('insulates the page while previewing and keeps Escape for an open dialog', () => {
    const other = document.createElement('main');
    document.body.append(other);
    const p = mk(vi.fn().mockResolvedValue({ students: 0, scenes: {}, misses: {}, handups: [] }));
    document.body.append(p.root);
    p.root.querySelector<HTMLButtonElement>('.lecture-panel__head button')!.click();
    expect(other.hasAttribute('inert')).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
    const dlg = document.createElement('dialog');
    dlg.setAttribute('open', '');
    document.querySelector('.lecture-preview')!.append(dlg);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('.lecture-preview')).not.toBeNull();
    dlg.remove();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('.lecture-preview')).toBeNull();
    expect(other.hasAttribute('inert')).toBe(false);
    expect(document.body.style.overflow).toBe('');
    p.dispose();
  });
});
