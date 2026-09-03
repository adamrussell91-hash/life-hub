import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBlock } from '@/blocks/create-block';
import type { Block } from '@/schemas/block';
import type { Lesson } from '@/schemas/lesson';
import type { Media } from '@/schemas/media';
import { isCanvasLike, isInlineEditor, isTextLike } from '@/teacher/lesson-canvas/kinds';
import { mountBlockCanvas, mountLessonPage } from '@/teacher/lesson-canvas/mount-page';

const MIME = 'application/x-teaching-hub-block';
const ISO = '2026-01-01T00:00:00.000Z';

class Dt {
  store = new Map<string, string>();
  effectAllowed = 'uninitialized';
  dropEffect = 'none';
  setData(type: string, value: string): void {
    this.store.set(type, value);
  }
  getData(type: string): string {
    return this.store.get(type) ?? '';
  }
  get types(): string[] {
    return [...this.store.keys()];
  }
  setDragImage(): void {}
}

function dispatchWithDt(el: Element, type: string, dt: Dt): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: dt });
  el.dispatchEvent(event);
  return event;
}

function dispatchDrop(el: Element, payload: unknown): { dragoverAccepted: boolean } {
  const dt = new Dt();
  dt.setData(MIME, JSON.stringify(payload));
  const over = dispatchWithDt(el, 'dragover', dt);
  dispatchWithDt(el, 'drop', dt);
  return { dragoverAccepted: over.defaultPrevented };
}

function startGripDrag(grip: Element): Dt {
  const dt = new Dt();
  dispatchWithDt(grip, 'dragstart', dt);
  return dt;
}

const findButton = (root: ParentNode, label: string): HTMLButtonElement | null =>
  Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(
    (button) => button.textContent?.trim() === label
  ) ?? null;

/** Drains the picker persist → onSave → repaint promise chain. */
const flushMicrotasks = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

function makeLesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    id: 'lesson_001',
    type: 'lesson',
    title: 'Intro to Testing',
    slug: 'intro_to_testing',
    status: 'active',
    created_at: ISO,
    updated_at: ISO,
    schema_version: 1,
    unit_id: 'unit_001',
    sequence: 1,
    blocks: [createBlock('heading', 'h1'), createBlock('concept_map', 'cm1')],
    ...overrides
  };
}

describe('isTextLike', () => {
  it('treats rich_text heading callout quote definition and code as text-like', () => {
    expect(isTextLike('heading')).toBe(true);
    expect(isTextLike('rich_text')).toBe(true);
    expect(isTextLike('callout')).toBe(true);
    expect(isTextLike('quote')).toBe(true);
    expect(isTextLike('definition')).toBe(true);
    expect(isTextLike('code')).toBe(true);
    expect(isTextLike('concept_map')).toBe(false);
    expect(isTextLike('mind_map')).toBe(false);
    expect(isTextLike('image')).toBe(false);
  });
});

describe('isCanvasLike', () => {
  it('treats mind maps and concept maps as inline canvases', () => {
    expect(isCanvasLike('mind_map')).toBe(true);
    expect(isCanvasLike('concept_map')).toBe(true);
    expect(isCanvasLike('chart')).toBe(false);
    expect(isCanvasLike('heading')).toBe(false);
    expect(isInlineEditor('mind_map')).toBe(true);
    expect(isInlineEditor('concept_map')).toBe(true);
    expect(isInlineEditor('heading')).toBe(true);
    expect(isInlineEditor('chart')).toBe(false);
  });
});

describe('mountLessonPage', () => {
  let host: HTMLElement;
  let ids: string[];

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    ids = ['new_1', 'new_2'];
  });

  afterEach(() => {
    host.remove();
    document.body.replaceChildren();
  });

  function mount(lesson: Lesson = makeLesson(), extras: { onSaveTemplate?: () => void; onExport?: () => void; onTrash?: () => void } = {}) {
    const onChange = vi.fn();
    const onPrint = vi.fn();
    const onSelect = vi.fn();
    const handle = mountLessonPage(host, {
      lesson,
      media: [],
      onChange,
      onPrint,
      onSelect,
      idFactory: () => ids.shift() ?? 'new_x',
      ...extras
    });
    return { handle, onChange, onPrint, onSelect };
  }

  it('shows the lesson title and reports title edits via onChange', () => {
    const { onChange } = mount();
    const title = host.querySelector<HTMLInputElement | HTMLElement>('.lesson-page__title');
    expect(title).not.toBeNull();

    if (title instanceof HTMLInputElement || title instanceof HTMLTextAreaElement) {
      expect(title.value).toBe('Intro to Testing');
      title.value = 'Renamed lesson';
      title.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      expect(title!.textContent).toBe('Intro to Testing');
      title!.textContent = 'Renamed lesson';
      title!.dispatchEvent(new Event('input', { bubbles: true }));
    }

    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls.at(-1)?.[0] as Lesson;
    expect(next.title).toBe('Renamed lesson');
  });

  it('removes a cover through the shared dialog while an unsaved title edit survives', async () => {
    const { onChange } = mount(
      makeLesson({ cover: { url: 'https://cdn.example.com/lesson.jpg' } })
    );

    // The reading view is a banner: the full picker only lives in the dialog.
    expect(host.querySelector('.lesson-page__cover .cover-picker')).toBeNull();
    expect(host.querySelector('.lesson-page__cover .entity-banner')).not.toBeNull();
    expect(host.querySelector<HTMLImageElement>('.entity-banner__image')?.src).toContain(
      'cdn.example.com/lesson.jpg'
    );

    const title = host.querySelector<HTMLInputElement>('.lesson-page__title')!;
    title.value = 'Renamed lesson';
    title.dispatchEvent(new Event('input', { bubbles: true }));

    host.querySelector<HTMLElement>('[data-block-id="h1"]')!.click();
    const editor = host.querySelector<HTMLElement>('.block-editor[data-block-type="heading"]')!;

    host.querySelector<HTMLButtonElement>('.entity-banner__edit')!.click();
    const dialog = document.querySelector<HTMLDialogElement>('.entity-banner__dialog');
    expect(dialog).not.toBeNull();
    findButton(dialog!, 'Remove cover')!.click();
    await flushMicrotasks();

    const next = onChange.mock.calls.at(-1)?.[0] as Lesson;
    expect('cover' in next).toBe(false);
    expect(next.title).toBe('Renamed lesson');

    // No remount: the same title field and the same open editor are still live.
    expect(host.querySelector('.lesson-page__title')).toBe(title);
    expect(title.value).toBe('Renamed lesson');
    expect(editor.isConnected).toBe(true);
    expect(host.querySelector('.entity-banner__image')).toBeNull();
  });

  it('keeps the banner image alive while the title is typed', () => {
    mount(makeLesson({ cover: { url: 'https://cdn.example.com/lesson.jpg' } }));
    const image = host.querySelector<HTMLImageElement>('.entity-banner__image');
    const edit = host.querySelector('.entity-banner__edit');
    expect(image).not.toBeNull();

    const title = host.querySelector<HTMLInputElement>('.lesson-page__title')!;
    for (const value of ['Renamed', 'Renamed l', 'Renamed lesson']) {
      title.value = value;
      title.dispatchEvent(new Event('input', { bubbles: true }));
    }

    expect(host.querySelector('.entity-banner__image')).toBe(image);
    expect(host.querySelector('.entity-banner__edit')).toBe(edit);
    expect(host.querySelector('.entity-banner__title')?.textContent).toBe('Renamed lesson');
  });

  it('resolves a media_id cover when update delivers the media library', () => {
    const media: Media[] = [
      {
        id: 'media_img',
        type: 'media',
        title: 'Lesson banner',
        slug: 'lesson_banner',
        status: 'active',
        created_at: ISO,
        updated_at: ISO,
        schema_version: 1,
        provider: 'external',
        media_type: 'image',
        preview_url: 'https://cdn.example.com/library.jpg'
      }
    ];
    const lesson = makeLesson({ cover: { media_id: 'media_img' } });
    const { handle } = mount(lesson);
    expect(host.querySelector('.entity-banner__image')).toBeNull();

    handle.update(lesson, media);

    expect(host.querySelector<HTMLImageElement>('.entity-banner__image')?.src).toContain(
      'cdn.example.com/library.jpg'
    );

    host.querySelector<HTMLButtonElement>('.entity-banner__edit')!.click();
    const dialog = document.querySelector<HTMLDialogElement>('.entity-banner__dialog')!;
    findButton(dialog, 'Choose from library')!.click();
    expect(dialog.querySelector('.cover-picker__library-item')).not.toBeNull();
  });

  it('edits text-like blocks inline without move-up towers', () => {
    mount();
    const heading = host.querySelector<HTMLElement>('[data-block-id="h1"]');
    expect(heading).not.toBeNull();
    heading!.click();
    const headingEditor = host.querySelector('.block-editor[data-block-type="heading"]');
    expect(headingEditor).not.toBeNull();
    expect(host.querySelector('.block-editor__move-up')).toBeNull();
    expect(host.querySelector('.lesson-editor__reorder')).toBeNull();
  });

  it('survives typing: the field being edited keeps focus and its caret', () => {
    const { onChange } = mount();
    host.querySelector<HTMLElement>('[data-block-id="h1"]')!.click();

    const field = host.querySelector<HTMLInputElement>('.block-editor__heading-text')!;
    // Clicking into the field is how editing starts, and it must not rebuild the row.
    field.click();
    expect(field.isConnected).toBe(true);

    field.focus();
    field.value = 'Guilt';
    field.setSelectionRange(5, 5);
    field.dispatchEvent(new Event('input', { bubbles: true }));

    expect(onChange).toHaveBeenCalled();
    expect(field.isConnected).toBe(true);
    expect(document.activeElement).toBe(field);
    expect(field.selectionStart).toBe(5);

    field.value = 'Guilt and complicity';
    field.dispatchEvent(new Event('input', { bubbles: true }));

    const next = onChange.mock.calls.at(-1)?.[0] as Lesson;
    const heading = next.blocks.find((b) => b.id === 'h1');
    expect(heading?.block_type === 'heading' && heading.content.text).toBe(
      'Guilt and complicity'
    );
  });

  it('refreshes a heavy block preview while its editor stays put', () => {
    mount(makeLesson({ blocks: [createBlock('heading', 'h1'), createBlock('chart', 'ch1')] }));
    host.querySelector<HTMLElement>('[data-block-id="ch1"]')!.click();

    const editor = host.querySelector<HTMLElement>('.lesson-page__inspector .block-editor')!;
    const captionField = editor.querySelector<HTMLInputElement>('input, textarea');
    expect(captionField).not.toBeNull();

    captionField!.focus();
    captionField!.value = 'Enrolments';
    captionField!.dispatchEvent(new Event('input', { bubbles: true }));

    expect(editor.isConnected).toBe(true);
    expect(document.activeElement).toBe(captionField);
  });

  it('keeps a heavy block editor inside the block it belongs to', () => {
    mount(makeLesson({ blocks: [createBlock('heading', 'h1'), createBlock('chart', 'ch1')] }));
    host.querySelector<HTMLElement>('[data-block-id="ch1"]')!.click();

    const inspector = host.querySelector('.lesson-page__inspector');
    expect(inspector).not.toBeNull();
    expect(inspector!.closest('[data-block-id]')?.getAttribute('data-block-id')).toBe('ch1');
    expect(inspector!.querySelector('.block-editor')).not.toBeNull();
  });

  it('reorders blocks with the toolbar move controls', () => {
    const { onChange } = mount();
    host.querySelector<HTMLElement>('[data-block-id="cm1"]')!.click();

    const up = host.querySelector<HTMLButtonElement>('.lesson-page__move-up');
    expect(up).not.toBeNull();
    expect(up!.disabled).toBe(false);
    up!.click();

    const next = onChange.mock.calls.at(-1)?.[0] as Lesson;
    expect(next.blocks.map((b) => b.id)).toEqual(['cm1', 'h1']);
  });

  it('disables move up on the first block and move down on the last', () => {
    mount();
    host.querySelector<HTMLElement>('[data-block-id="cm1"]')!.click();
    expect(host.querySelector<HTMLButtonElement>('.lesson-page__move-down')!.disabled).toBe(true);
    expect(host.querySelector<HTMLButtonElement>('.lesson-page__move-up')!.disabled).toBe(false);
  });

  it('accepts a palette drop on a block body, not just the gap between blocks', () => {
    const { onChange } = mount();
    const row = host.querySelector('[data-block-id="cm1"]')!;

    const { dragoverAccepted } = dispatchDrop(row, { kind: 'block', type: 'heading' });

    expect(dragoverAccepted).toBe(true);
    const next = onChange.mock.calls.at(-1)?.[0] as Lesson;
    expect(next.blocks.map((b) => b.id)).toEqual(['h1', 'new_1', 'cm1']);
  });

  it('marks the target gap while a drop is hovering so the teacher sees where it lands', () => {
    mount();
    const gap = host.querySelector<HTMLElement>('.lesson-page__gap')!;
    const dt = new Dt();
    dt.setData(MIME, JSON.stringify({ kind: 'block', type: 'heading' }));

    dispatchWithDt(gap, 'dragover', dt);

    expect(gap.classList.contains('lesson-page__gap--active')).toBe(true);
  });

  it('moves a block when its grip is dragged onto another block', () => {
    const lesson = makeLesson({
      blocks: [createBlock('heading', 'h1'), createBlock('concept_map', 'cm1'), createBlock('heading', 'h2')]
    });
    const { onChange } = mount(lesson);
    const grip = host.querySelector('[data-block-id="h1"] .lesson-page__grip');
    expect(grip).not.toBeNull();

    const dt = startGripDrag(grip!);
    expect(JSON.parse(dt.getData(MIME))).toEqual({ kind: 'move', block_id: 'h1' });

    const target = host.querySelector('[data-block-id="h2"]')!;
    dispatchWithDt(target, 'dragover', dt);
    dispatchWithDt(target, 'drop', dt);

    const next = onChange.mock.calls.at(-1)?.[0] as Lesson;
    expect(next.blocks.map((b) => b.id)).toEqual(['cm1', 'h1', 'h2']);
  });

  it('renders heavy blocks and shows inspector plus toolbar on select', () => {
    const { onSelect } = mount(
      makeLesson({ blocks: [createBlock('heading', 'h1'), createBlock('chart', 'ch1')] })
    );
    const chart = host.querySelector<HTMLElement>('[data-block-id="ch1"]');
    expect(chart).not.toBeNull();
    expect(host.querySelector('.block-chart, .block[data-block-type="chart"]')).not.toBeNull();

    chart!.click();
    expect(onSelect).toHaveBeenCalledWith('ch1');
    expect(host.querySelector('.lesson-page__inspector')).not.toBeNull();
    expect(host.querySelector('.lesson-page__inspector .block-editor')).not.toBeNull();

    const toolbarText = host.textContent ?? '';
    expect(toolbarText).toContain('Duplicate');
    expect(toolbarText).toContain('Delete');
    expect(
      host.querySelector('.block-editor__visibility, [aria-label="Visibility"], select')
    ).not.toBeNull();
    expect(host.querySelector('.block-editor__move-up')).toBeNull();
  });

  it('edits mind maps on one canvas instead of stacking preview and inspector', () => {
    const { onSelect } = mount(
      makeLesson({ blocks: [createBlock('heading', 'h1'), createBlock('mind_map', 'mm1')] })
    );
    const row = host.querySelector<HTMLElement>('[data-block-id="mm1"]');
    expect(row).not.toBeNull();
    expect(host.querySelector('.block-mind-map')).not.toBeNull();
    expect(host.querySelector('.lesson-page__inspector')).toBeNull();

    row!.click();
    expect(onSelect).toHaveBeenCalledWith('mm1');
    expect(host.querySelector('.lesson-page__preview')).toBeNull();
    expect(host.querySelector('.lesson-page__inspector')).toBeNull();
    expect(host.querySelector('.block-graph-maker-host .block-graph-maker')).not.toBeNull();
    expect(host.querySelectorAll('.block-graph-maker')).toHaveLength(1);
    expect(host.querySelector('.lesson-page__toolbar')).not.toBeNull();
  });

  it('edits concept maps on one canvas instead of stacking preview and inspector', () => {
    mount();
    host.querySelector<HTMLElement>('[data-block-id="cm1"]')!.click();

    expect(host.querySelector('.lesson-page__preview')).toBeNull();
    expect(host.querySelector('.lesson-page__inspector')).toBeNull();
    expect(host.querySelector('.block-graph-maker-host .block-graph-maker')).not.toBeNull();
    expect(host.querySelectorAll('.block-graph-maker')).toHaveLength(1);
  });

  it('deletes a video block from the gutter without selecting it first', () => {
    const video = createBlock('video', 'v1');
    if (video.block_type !== 'video') throw new Error('expected video');
    video.content = { provider: 'youtube', external_id: 'dQw4w9WgXcQ' };
    const { onChange } = mount(makeLesson({ blocks: [createBlock('heading', 'h1'), video] }));

    const frame = host.querySelector<HTMLIFrameElement>('[data-block-id="v1"] iframe');
    expect(frame).not.toBeNull();
    expect(host.querySelector('.lesson-page__inspector')).toBeNull();

    host.querySelector<HTMLButtonElement>('[data-block-id="v1"] [aria-label="Delete block"]')!.click();

    const next = onChange.mock.calls.at(-1)?.[0] as Lesson;
    expect(next.blocks.map((block) => block.id)).toEqual(['h1']);
  });

  it('reveals a publish error on the named block', () => {
    const diagram = createBlock('diagram', 'd1');
    if (diagram.block_type !== 'diagram') throw new Error('expected diagram');
    diagram.content = {
      source: 'image',
      image_url: '',
      image_alt: '',
      caption: 'Spacing vs massed practice'
    };
    const { handle } = mount(makeLesson({ blocks: [createBlock('heading', 'h1'), diagram] }));
    handle.revealPublishBlock('d1', ['d1']);
    const row = host.querySelector('[data-block-id="d1"]');
    expect(row?.classList.contains('lesson-page__block--publish-error')).toBe(true);
    expect(row?.classList.contains('lesson-page__block--selected')).toBe(true);
  });

  it('offers Move to trash in the page menu', () => {
    const onTrash = vi.fn();
    mount(makeLesson(), { onTrash });
    host.querySelector<HTMLButtonElement>('.lesson-page__more-btn')!.click();
    host.querySelector<HTMLButtonElement>('.lesson-page__trash')!.click();
    expect(onTrash).toHaveBeenCalledTimes(1);
  });

  it('inserting flashcards reveals front and back fields on the canvas', () => {
    const { handle } = mount(makeLesson({ blocks: [] }));
    handle.insertType('flashcards');
    expect(host.querySelector('.block-editor__flashcards-front')).not.toBeNull();
    expect(host.querySelector('.block-editor__flashcards-back')).not.toBeNull();
  });

  it('inserts a heading when a palette payload is dropped on a gap', () => {
    const { onChange } = mount();
    const gaps = host.querySelectorAll('.lesson-page__gap');
    expect(gaps.length).toBeGreaterThanOrEqual(3);

    dispatchDrop(gaps[0]!, { kind: 'block', type: 'heading' });

    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls.at(-1)?.[0] as Lesson;
    expect(next.blocks[0]?.block_type).toBe('heading');
    expect(next.blocks[0]?.id).toBe('new_1');
    expect(next.blocks.map((b) => b.id)).toEqual(['new_1', 'h1', 'cm1']);
  });

  it('inserts an embed block when an embed:pdf palette payload is dropped at root', () => {
    const { onChange } = mount();
    const gap = host.querySelector('.lesson-page__gap')!;

    dispatchDrop(gap, { kind: 'block', type: 'embed:pdf' });

    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls.at(-1)?.[0] as Lesson;
    expect(next.blocks[0]?.block_type).toBe('embed');
    expect(next.blocks[0]?.id).toBe('new_1');
    if (next.blocks[0]?.block_type === 'embed') {
      expect(next.blocks[0].content.provider).toBe('pdf');
    }
  });

  it('shows a hint and does not insert an invalid collection drop at root', () => {
    const { onChange } = mount();
    const gap = host.querySelector('.lesson-page__gap')!;
    dispatchDrop(gap, { type: 'collection' });

    expect(onChange).not.toHaveBeenCalled();
    const hint = host.querySelector('.lesson-page__hint');
    expect(hint).not.toBeNull();
    expect((hint?.textContent ?? '').trim().length).toBeGreaterThan(0);
  });

  it('calls onPrint from the Print control', () => {
    const { onPrint } = mount();
    const print = host.querySelector<HTMLButtonElement>('[aria-label="Print"]');
    expect(print).not.toBeNull();
    print!.click();
    expect(onPrint).toHaveBeenCalledTimes(1);
  });

  it('calls onExport from the page menu', () => {
    const onExport = vi.fn();
    mount(makeLesson(), { onExport });
    const exportBtn = [...host.querySelectorAll('button')].find((btn) =>
      btn.textContent?.includes('Export JSON')
    );
    expect(exportBtn).toBeTruthy();
    host.querySelector<HTMLButtonElement>('[aria-label="Page menu"]')!.click();
    exportBtn!.click();
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it('hides Save as lesson template until the overflow menu is opened', () => {
    const onSaveTemplate = vi.fn();
    mount(makeLesson(), { onSaveTemplate });

    const save = [...host.querySelectorAll('button')].find((btn) =>
      btn.textContent?.includes('Save as lesson template')
    );
    expect(save).toBeTruthy();
    const menu = save!.closest<HTMLElement>('.page-options__menu');
    expect(menu?.hidden).toBe(true);

    host.querySelector<HTMLButtonElement>('[aria-label="Page menu"]')!.click();
    expect(menu?.hidden).toBe(false);

    save!.click();
    expect(onSaveTemplate).toHaveBeenCalledTimes(1);
  });

  it('keeps drop gaps pointer-events auto while a palette drag is active', () => {
    mount();
    const palette = document.createElement('div');
    palette.className = 'lesson-palette';
    palette.dataset.dragging = 'true';
    document.body.append(palette);

    document.dispatchEvent(new Event('dragover', { bubbles: true }));

    const gap = host.querySelector<HTMLElement>('.lesson-page__gap')!;
    expect(getComputedStyle(gap).pointerEvents).toBe('auto');
  });

  it('forwards a composition drop to onCompositionDrop without inserting a block', () => {
    const onChange = vi.fn();
    const onCompositionDrop = vi.fn();
    mountLessonPage(host, {
      lesson: makeLesson({ blocks: [] }),
      media: [],
      onChange,
      onPrint: vi.fn(),
      onSelect: vi.fn(),
      idFactory: () => ids.shift() ?? 'new_x',
      onCompositionDrop
    });
    const gap = host.querySelector('.lesson-page__gap')!;
    dispatchDrop(gap, { kind: 'composition', id: 'composition_1' });

    expect(onCompositionDrop).toHaveBeenCalledWith('composition_1');
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('mountBlockCanvas', () => {
  let host: HTMLElement;
  let ids: string[];

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    ids = ['new_1', 'new_2'];
  });

  afterEach(() => {
    host.remove();
    document.body.replaceChildren();
  });

  it('renders page blocks without lesson cover, title, or print chrome', () => {
    const heading = createBlock('heading', 'h1');
    mountBlockCanvas(host, {
      blocks: [heading],
      onChange: vi.fn(),
      idFactory: () => ids.shift() ?? 'new_x',
      heading: 'Announcements'
    });

    expect(host.querySelector('.lesson-page__heading')?.textContent).toBe('Announcements');
    expect(host.querySelector('.lesson-page__title')).toBeNull();
    expect(host.querySelector('.lesson-page__cover')).toBeNull();
    expect(host.querySelector('[aria-label="Print"]')).toBeNull();
    expect(host.querySelector('[aria-label="Page menu"]')).toBeNull();
    expect(host.querySelector('.lesson-page__gap')).not.toBeNull();
  });

  it('inserts a collection on drop and via insertType at page root', () => {
    const onChange = vi.fn();
    const handle = mountBlockCanvas(host, {
      blocks: [],
      onChange,
      idFactory: () => ids.shift() ?? 'new_x',
      allowCollectionAtRoot: true
    });

    dispatchDrop(host.querySelector('.lesson-page__gap')!, { kind: 'block', type: 'collection' });
    expect(onChange).toHaveBeenCalled();
    expect((onChange.mock.calls[0]![0] as Block[])[0]?.block_type).toBe('collection');

    onChange.mockClear();
    handle.update([]);
    handle.insertType('heading');
    expect((onChange.mock.calls.at(-1)?.[0] as Block[])[0]?.block_type).toBe('heading');
  });

  it('insertType drops into a selected section instead of the lesson root', () => {
    const onChange = vi.fn();
    const section = createBlock('section', 'sec1');
    if (section.block_type !== 'section') throw new Error('expected section');
    const handle = mountBlockCanvas(host, {
      blocks: [section],
      onChange,
      idFactory: () => ids.shift() ?? 'new_x'
    });

    host.querySelector<HTMLElement>('[data-block-id="sec1"]')!.click();
    handle.insertType('heading');

    const next = onChange.mock.calls.at(-1)?.[0] as Block[];
    expect(next).toHaveLength(1);
    expect(next[0]?.block_type).toBe('section');
    if (next[0]?.block_type !== 'section') return;
    expect(next[0].content.blocks.map((block) => block.block_type)).toEqual(['heading']);
  });
});
