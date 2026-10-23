// apps/teaching/tests/unit/lecture-editor-tools.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Block } from '@/schemas/block';
import { containerOf, insertAfter, nextSibling } from '@/lecture/tree';
import { createLectureEditorTools } from '@/lecture/editor-tools';
import { measureDuration } from '@/lecture/narration-field';
import { renderBlock } from '@/blocks/render';

const b = (id: string, block_type: string, content: Record<string, unknown> = {}) =>
  ({ id, type: 'block', block_type, variant: 'medium', visibility: 'student_teacher', content }) as unknown as Block;

describe('lecture tree helpers', () => {
  it('inserts after a block inside a section and finds its next sibling', () => {
    const blocks = [b('s1', 'section', { title: 'A', blocks: [b('q1', 'cloze', { text: 'x' }), b('t1', 'rich_text', { html: '' })] })];
    const next = insertAfter(blocks, 'q1', b('p1', 'section', { title: 'again', blocks: [], side_path: true }));
    const inner = (next[0]!.content as { blocks: Block[] }).blocks.map((x) => x.id);
    expect(inner).toEqual(['q1', 'p1', 't1']);
    expect(nextSibling(next, 'q1')?.id).toBe('p1');
  });

  it('keeps untouched branches as they were', () => {
    const other = b('s2', 'section', { title: 'B', blocks: [b('t2', 'rich_text', { html: '' })] });
    const blocks = [b('s1', 'section', { title: 'A', blocks: [b('q1', 'cloze', { text: 'x' })] }), other];
    const next = insertAfter(blocks, 'q1', b('p1', 'rich_text', { html: '' }));
    expect(next[1]).toBe(other);
    expect(insertAfter(blocks, 'missing', b('p2', 'rich_text', { html: '' }))).toBe(blocks);
  });

  it('names the block that holds a block, or null at the top', () => {
    const blocks = [b('s1', 'section', { title: 'A', blocks: [b('q1', 'cloze', { text: 'x' })] }), b('q2', 'cloze', { text: 'y' })];
    expect(containerOf(blocks, 'q1')?.id).toBe('s1');
    expect(containerOf(blocks, 'q2')).toBeNull();
    expect(containerOf(blocks, 'nope')).toBeUndefined();
  });
});

describe('lecture editor tools', () => {
  function setup(blocks: Block[], lecture = true) {
    let current = blocks;
    const tools = createLectureEditorTools({ isLecture: () => lecture, getBlocks: () => current, onBlocks: (next) => { current = next; }, idFactory: () => 'new1' });
    const row = document.createElement('div');
    row.append(renderBlock(blocks[0]!, 'teacher'));
    tools.decorate(row, blocks[0]!);
    return { row, current: () => current };
  }

  it('does nothing outside a lecture', () => {
    const { row } = setup([b('h1', 'heading', { text: 'A' })], false);
    expect(row.querySelector('.lecture-tools')).toBeNull();
  });

  it('gives a heading a record pill and a reveal toggle', () => {
    const { row, current } = setup([b('h1', 'heading', { text: 'A' })]);
    expect(row.querySelector('.lecture-tools .narration-field')).not.toBeNull();
    row.querySelector<HTMLButtonElement>('[data-reveal="all"]')!.click();
    expect((current()[0]!.content as { reveal?: string }).reveal).toBe('all');
  });

  it('lets a gate switch off and add an If wrong path', () => {
    const { row, current } = setup([b('q1', 'cloze', { text: 'x' })]);
    row.querySelector<HTMLButtonElement>('.lecture-tools__side-path')!.click();
    expect(current().map((x) => x.id)).toEqual(['q1', 'new1']);
    expect(current()[1]).toMatchObject({ block_type: 'section', content: { title: 'Let’s look again', side_path: true, blocks: [] } });
    row.querySelector<HTMLInputElement>('.lecture-tools__gate input')!.click();
    expect((current()[0]!.content as { gate?: boolean }).gate).toBe(false);
  });

  it('says a gate already has its If wrong path', () => {
    const { row } = setup([b('q1', 'cloze', { text: 'x' }), b('p1', 'section', { title: 'Again', blocks: [], side_path: true })]);
    expect(row.querySelector('.lecture-tools__side-path')).toBeNull();
    expect(row.querySelector('.lecture-tools__note')?.textContent).toContain('If wrong path');
  });

  it('offers no If wrong path for a self-check', () => {
    const { row } = setup([b('k1', 'self_check', { mode: 'reveal', prompt: 'Why?', answer: 'Because' })]);
    expect(row.querySelector('.lecture-tools__gate')).not.toBeNull();
    expect(row.querySelector('.lecture-tools__side-path')).toBeNull();
  });

  function decorateWith(blocks: Block[], rowBlock: Block) {
    let current = blocks;
    const tools = createLectureEditorTools({ isLecture: () => true, getBlocks: () => current, onBlocks: (next) => { current = next; }, idFactory: () => 'new1' });
    const row = document.createElement('div');
    row.append(renderBlock(rowBlock, 'teacher'));
    tools.decorate(row, rowBlock);
    const own = (id: string) => {
      const el = id === rowBlock.id ? row : row.querySelector<HTMLElement>(`.block[data-block-id="${id}"]`)!;
      return Array.from(el.children).find((child) => child.classList.contains('lecture-tools')) ?? null;
    };
    return { row, own, current: () => current };
  }

  it('gives blocks inside an If wrong path no lecture tools of their own', () => {
    const path = b('p1', 'section', { title: 'Again', side_path: true, blocks: [b('q2', 'cloze', { text: 'y' }), b('h2', 'heading', { text: 'B' })] });
    const { row, own } = decorateWith([b('q1', 'cloze', { text: 'x' }), path], path);
    expect(own('q2')).toBeNull();
    expect(own('h2')).toBeNull();
    expect(row.querySelector('.lecture-tools__side-path')).toBeNull();
    expect(Array.from(row.children).some((el) => el.classList.contains('lecture-tools'))).toBe(true);
  });

  it('gives headings and gates inside columns or tabs no lecture tools', () => {
    const cols = b('c1', 'columns', { columns: [{ blocks: [b('h3', 'heading', { text: 'C' }), b('q3', 'cloze', { text: 'z' })] }] });
    const { row, own } = decorateWith([cols], cols);
    expect(own('h3')).toBeNull();
    expect(own('q3')).toBeNull();
    expect(row.querySelector('.lecture-tools')).toBeNull();
  });

  it('gives a heading and a gate inside a chapter their tools', () => {
    const chapter = b('s1', 'section', { title: 'Imagery', blocks: [b('h4', 'heading', { text: 'D' }), b('q4', 'cloze', { text: 'w' })] });
    const { own } = decorateWith([chapter], chapter);
    expect(own('h4')?.querySelector('.lecture-tools__reveal')).not.toBeNull();
    expect(own('q4')?.querySelector('.lecture-tools__side-path')).not.toBeNull();
  });

  it('hides the If wrong path controls while the gate is off', () => {
    const { row } = setup([b('q1', 'cloze', { text: 'x', gate: false })]);
    expect(row.querySelector('.lecture-tools__gate')).not.toBeNull();
    expect(row.querySelector('.lecture-tools__side-path')).toBeNull();
    const off = setup([b('q1', 'cloze', { text: 'x', gate: false }), b('p1', 'section', { title: 'Again', blocks: [], side_path: true })]);
    expect(off.row.querySelector('.lecture-tools__note')).toBeNull();
  });

  it('tells the teacher when an If wrong path will be skipped', () => {
    const path = () => b('p1', 'section', { title: 'Again', side_path: true, blocks: [] });
    const lonely = decorateWith([b('t1', 'rich_text', { html: '' }), path()], path());
    expect(lonely.own('p1')?.textContent).toContain('Not under a hinge question or cloze yet, so students skip it.');
    const top = decorateWith([path()], path());
    expect(top.own('p1')?.textContent).toContain('Not under a hinge question or cloze yet');
    const gateOff = decorateWith([b('q1', 'cloze', { text: 'x', gate: false }), path()], path());
    expect(gateOff.own('p1')?.textContent).toContain('The question above isn’t a gate, so students skip this.');
    const ok = decorateWith([b('q1', 'cloze', { text: 'x' }), path()], path());
    expect(ok.own('p1')?.textContent).toContain('plays only after a wrong answer');
  });

  it('gives a nested If wrong path narration but no switch to undo it', () => {
    const path = b('p1', 'section', { title: 'Again', side_path: true, blocks: [] });
    const chapter = b('s1', 'section', { title: 'Imagery', blocks: [b('q1', 'cloze', { text: 'x' }), path] });
    let current = [chapter];
    const tools = createLectureEditorTools({ isLecture: () => true, getBlocks: () => current, onBlocks: (next) => { current = next; }, idFactory: () => 'new1' });
    const row = document.createElement('div');
    row.append(renderBlock(chapter, 'teacher'));
    tools.decorate(row, chapter);
    const pathEl = row.querySelector<HTMLElement>('.block[data-block-id="p1"]')!;
    const pathTools = Array.from(pathEl.children).find((el) => el.classList.contains('lecture-tools'))!;
    expect(pathTools.querySelector('.narration-field')).not.toBeNull();
    expect(pathTools.querySelector('input[type="checkbox"]')).toBeNull();
    expect(pathTools.querySelector('.lecture-tools__takeaway-prompt')).toBeNull();
  });

  it('gives a chapter a takeaway switch and wording', () => {
    const { row, current } = setup([b('s1', 'section', { title: 'Imagery', blocks: [] })]);
    const words = row.querySelector<HTMLInputElement>('.lecture-tools__takeaway-prompt')!;
    words.value = 'Your best line';
    words.dispatchEvent(new Event('change'));
    expect((current()[0]!.content as { takeaway?: unknown }).takeaway).toEqual({ enabled: true, prompt: 'Your best line' });
  });

  it('keeps clicks inside the tools from reaching the row', () => {
    const { row } = setup([b('h1', 'heading', { text: 'A' })]);
    const rowClick = vi.fn();
    row.addEventListener('click', rowClick);
    row.addEventListener('pointerdown', rowClick);
    const pill = row.querySelector<HTMLButtonElement>('[data-reveal="one"]')!;
    pill.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    pill.click();
    expect(rowClick).not.toHaveBeenCalled();
  });
});

describe('measureDuration', () => {
  const RealAudio = globalThis.Audio;
  afterEach(() => {
    globalThis.Audio = RealAudio;
    vi.useRealTimers();
  });

  it('gives up with 0 when the clip never loads', async () => {
    vi.useFakeTimers();
    const found = measureDuration('blob:none', 4000);
    vi.advanceTimersByTime(4000);
    await expect(found).resolves.toBe(0);
  });

  it('works out the length of a recording that first says Infinity', async () => {
    class FakeAudio extends EventTarget {
      duration = Infinity;
      preload = '';
      private time = 0;
      set src(_url: string) { queueMicrotask(() => this.dispatchEvent(new Event('loadedmetadata'))); }
      get currentTime() { return this.time; }
      set currentTime(value: number) {
        this.time = value;
        this.duration = 42.4;
        queueMicrotask(() => this.dispatchEvent(new Event('durationchange')));
      }
      removeAttribute() {}
    }
    globalThis.Audio = FakeAudio as unknown as typeof Audio;
    await expect(measureDuration('blob:rec')).resolves.toBe(42);
  });
});

describe('narration field', () => {
  const saved = { url: '/old.webm', duration_s: 30, transcript: 'Old words' };

  it('re-record can be cancelled back to the saved clip', async () => {
    const { createNarrationField } = await import('@/lecture/narration-field');
    const onChange = vi.fn();
    const field = createNarrationField({ label: 'Scene', value: saved, onChange });
    const button = (text: string) => Array.from(field.querySelectorAll('button')).find((el) => el.textContent === text);
    button('Re-record')!.click();
    expect(field.querySelector('audio')).toBeNull();
    button('Cancel')!.click();
    expect(field.querySelector('audio')?.getAttribute('src')).toBe('/old.webm');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('saves a new clip without the old transcript and locks the buttons until it is measured', async () => {
    vi.resetModules();
    let onUploaded: ((url: string) => void) | null = null;
    vi.doMock('@/blocks/upload-button', async (orig) => ({
      ...(await orig<typeof import('@/blocks/upload-button')>()),
      createUploadButton: (opts: { onUploaded: (url: string) => void }) => {
        onUploaded = opts.onUploaded;
        const el = document.createElement('div');
        const button = document.createElement('button');
        button.textContent = 'Upload';
        el.append(button);
        return { el, button, input: document.createElement('input'), uploadFiles: async () => {} };
      }
    }));
    let finish: (n: number) => void = () => {};
    const RealAudio = globalThis.Audio;
    class PendingAudio extends EventTarget {
      duration = NaN;
      preload = '';
      currentTime = 0;
      set src(_url: string) { finish = (n) => { this.duration = n; this.dispatchEvent(new Event('loadedmetadata')); }; }
      removeAttribute() {}
    }
    globalThis.Audio = PendingAudio as unknown as typeof Audio;
    try {
      const { createNarrationField } = await import('@/lecture/narration-field');
      const onChange = vi.fn();
      const field = createNarrationField({ label: 'Scene', value: saved, onChange });
      Array.from(field.querySelectorAll('button')).find((el) => el.textContent === 'Re-record')!.click();
      onUploaded!('/new.webm');
      expect(field.textContent).toContain('Saving…');
      expect(field.querySelector<HTMLFieldSetElement>('fieldset.narration-field__controls')?.disabled).toBe(true);
      finish(12);
      await Promise.resolve();
      expect(onChange).toHaveBeenCalledWith({ url: '/new.webm', duration_s: 12 });
      expect(field.querySelector('audio')?.getAttribute('src')).toBe('/new.webm');
    } finally {
      globalThis.Audio = RealAudio;
      vi.doUnmock('@/blocks/upload-button');
      vi.resetModules();
    }
  });
});
