import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Block } from '@/schemas/block';
import type { Lesson } from '@/schemas/lesson';
import * as openPrint from '@/print/open-print';

vi.mock('@/api/client', async () => {
  const actual = await vi.importActual<typeof import('@/api/client')>('@/api/client');
  return {
    ...actual,
    apiGet: vi.fn(),
    apiPut: vi.fn(),
    apiPost: vi.fn(),
    apiPatch: vi.fn()
  };
});

vi.mock('@/ai/jobs-client', () => {
  class MockConflict extends Error {
    constructor(
      readonly jobId: string,
      readonly status: string
    ) {
      super('An unresolved job already exists for this lesson');
    }
  }
  return {
    startAiJob: vi.fn(),
    pollAiJob: vi.fn(),
    listAiJobs: vi.fn(),
    resolveAiJob: vi.fn(),
    AiJobConflictError: MockConflict
  };
});

const historyHarness: { onRestored?: (live: unknown) => void } = {};

vi.mock('@/teacher/history-panel', () => ({
  mountHistoryPanel: (options: { onRestored: (live: unknown) => void }) => {
    historyHarness.onRestored = options.onRestored;
    return { dispose: vi.fn(), refresh: vi.fn(), open: vi.fn(), close: vi.fn() };
  }
}));

import { listAiJobs, pollAiJob, resolveAiJob, startAiJob } from '@/ai/jobs-client';
import { apiGet, apiPut, apiPost, apiPatch, ApiClientError } from '@/api/client';
import { createBlock } from '@/blocks/create-block';
import { mountLessonEditor, type LessonEditorHandle } from '@/teacher/lesson-editor';
import { renderTeacherShell } from '@/teacher/shell';

const startAiJobMock = vi.mocked(startAiJob);
const pollAiJobMock = vi.mocked(pollAiJob);
const listAiJobsMock = vi.mocked(listAiJobs);
const resolveAiJobMock = vi.mocked(resolveAiJob);

const apiGetMock = apiGet as unknown as ReturnType<typeof vi.fn>;
const apiPutMock = apiPut as unknown as ReturnType<typeof vi.fn>;
const apiPostMock = apiPost as unknown as ReturnType<typeof vi.fn>;
const apiPatchMock = apiPatch as unknown as ReturnType<typeof vi.fn>;

const ISO = '2026-01-01T00:00:00.000Z';

class MemoryStorage implements Storage {
  private readonly store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const emptyCurriculum = {
  years: [],
  subjects: [],
  units: [],
  lessons: [],
  classes: [],
  scheduled_lessons: [],
  scope_sequences: [],
  media: [],
  schedule_anchor_date: '2026-01-01'
};

const richTextBlock: Block = {
  id: 'block_lesson_001_1',
  type: 'block',
  block_type: 'rich_text',
  variant: 'medium',
  visibility: 'student_teacher',
  content: { html: '<p>Hello</p>' },
  layout: {},
  print: {},
  settings: {},
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1
};

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
    blocks: [richTextBlock],
    ...overrides
  };
}

function sectionBlock(
  overrides: Partial<Extract<Block, { block_type: 'section' }>> = {}
): Extract<Block, { block_type: 'section' }> {
  return {
    id: 'block_lesson_001_1',
    type: 'block',
    block_type: 'section',
    variant: 'medium',
    visibility: 'student_teacher',
    content: { title: 'Do Now', blocks: [] },
    layout: {},
    print: {},
    settings: {},
    created_at: ISO,
    updated_at: ISO,
    schema_version: 1,
    ...overrides
  };
}

function linkedStub(compositionId = 'composition_1'): Block {
  return sectionBlock({
    content: {
      title: 'Reading pack',
      blocks: [],
      link: { mode: 'linked', source_composition_id: compositionId }
    }
  });
}

describe('mountLessonEditor', () => {
  let container: HTMLElement;
  let refs: ReturnType<typeof renderTeacherShell>;
  let editor: LessonEditorHandle | undefined;

  function mockLessonLoad(lesson: Lesson = makeLesson()): void {
    apiGetMock.mockImplementation(async (path: string) => {
      if (path === '/api/compositions') {
        return { compositions: [] };
      }
      if (path === '/api/curriculum') {
        return emptyCurriculum;
      }
      if (path === '/api/ai/jobs') {
        return { jobs: [] };
      }
      if (path.startsWith('/api/lessons/')) {
        return lesson;
      }
      if (path.startsWith('/api/compositions/')) {
        throw new ApiClientError({ code: 'not_found', message: 'Composition not found' });
      }
      if (path === '/api/ai/jobs') {
        return { jobs: [] };
      }
      throw new Error(`Unexpected apiGet path: ${path}`);
    });
  }

  function mount(options: { lessonId?: string; isStale?: () => boolean } = {}): LessonEditorHandle {
    editor = mountLessonEditor({
      refs,
      lessonId: options.lessonId ?? 'lesson_001',
      isStale: options.isStale ?? (() => false)
    });
    return editor;
  }

  function insertFromPalette(family: string, blockType: string): void {
    if (!refs.canvas.querySelector(`[data-block-type="${blockType}"]`)) {
      refs.canvas.querySelector<HTMLButtonElement>(`[data-family="${family}"]`)!.click();
    }
    refs.canvas.querySelector<HTMLButtonElement>(`[data-block-type="${blockType}"]`)!.click();
  }

  function insertComposition(mode: 'copy' | 'linked', compositionId = 'composition_1'): void {
    refs.canvas.querySelector<HTMLButtonElement>('[data-family="Compositions"]')!.click();
    refs.canvas
      .querySelector<HTMLButtonElement>(`[data-composition-id="${compositionId}"]`)!
      .click();
    const cls =
      mode === 'copy'
        ? '.lesson-editor__insert-composition-copy'
        : '.lesson-editor__insert-composition-linked';
    refs.canvas.querySelector<HTMLButtonElement>(cls)!.click();
  }

  beforeEach(() => {
    apiGetMock.mockReset();
    apiPutMock.mockReset();
    apiPostMock.mockReset();
    apiPatchMock.mockReset();
    startAiJobMock.mockReset();
    pollAiJobMock.mockReset();
    listAiJobsMock.mockReset();
    resolveAiJobMock.mockReset();
    startAiJobMock.mockResolvedValue({ id: 'job_1', status: 'working' });
    pollAiJobMock.mockResolvedValue({
      id: 'job_1',
      lesson_id: 'lesson_1',
      agent: 'ann',
      status: 'done',
      snapshot_at: ISO,
      message: 'Build lesson',
      created_at: ISO,
      proposal: { kind: 'replace_lesson', title: 'Built lesson', blocks: [] }
    });
    listAiJobsMock.mockResolvedValue({ jobs: [] });
    resolveAiJobMock.mockResolvedValue({
      id: 'job_1',
      lesson_id: 'lesson_1',
      agent: 'ann',
      status: 'done',
      snapshot_at: ISO,
      message: 'Build lesson',
      created_at: ISO,
      resolution: 'accepted'
    });
    historyHarness.onRestored = undefined;
    vi.stubGlobal('localStorage', new MemoryStorage());
    container = document.createElement('div');
    document.body.append(container);
    refs = renderTeacherShell(container);
  });

  afterEach(() => {
    editor?.dispose();
    editor = undefined;
    container?.remove();
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  it('loads the draft and renders an inline-editable title', async () => {
    mockLessonLoad();
    mount();
    await tick();

    expect(apiGetMock).toHaveBeenCalledWith('/api/lessons/lesson_001');

    const input = refs.canvas.querySelector<HTMLInputElement>('.lesson-page__title');
    expect(input?.value).toBe('Intro to Testing');
    expect(input?.getAttribute('aria-label')).toBe('Lesson title');
  });

  it('mounts palette, page, and a Life Hub chat bubble that opens the right column', async () => {
    mockLessonLoad();
    mount();
    await tick();

    const builder = refs.canvas.querySelector('.lesson-builder')!;
    expect(refs.canvas.querySelector('.lesson-palette')).not.toBeNull();
    expect(refs.canvas.querySelector('.lesson-page')).not.toBeNull();
    expect(refs.canvas.querySelector('.ai-panel')).not.toBeNull();
    expect(refs.canvas.querySelector('.ai-panel__hero')).toBeNull();
    expect(builder.classList.contains('lesson-builder--chat-shelved')).toBe(true);
    const fab = refs.canvas.querySelector<HTMLButtonElement>('.lesson-builder__chat-fab');
    expect(fab).not.toBeNull();
    expect(fab?.hidden).toBe(false);
    fab?.click();
    expect(builder.classList.contains('lesson-builder--chat-shelved')).toBe(false);
    expect(fab?.hidden).toBe(true);
    expect(refs.canvas.querySelector('[aria-label="Print"]')).not.toBeNull();
    expect(refs.canvas.querySelector('.lesson-editor__add-block-select')).toBeNull();
    const a4Tab = [...refs.canvas.querySelectorAll('.lesson-editor__mode-tab')].find(
      (el) => el.textContent === 'A4'
    );
    expect(a4Tab).toBeUndefined();
    expect(refs.contextBar.querySelector('.context-bar__alchemy-lab')?.textContent).toBe(
      'Alchemy Lab'
    );
    refs.contextBar.querySelector<HTMLButtonElement>('.context-bar__alchemy-lab')!.click();
    expect(builder.classList.contains('lesson-builder--chat-shelved')).toBe(false);
    expect(refs.canvas.querySelector('.alchemy-lab')).not.toBeNull();
  });

  it('renders one block editor per text-like block and includes a visibility control', async () => {
    mockLessonLoad();
    mount();
    await tick();

    refs.canvas.querySelector<HTMLElement>('.lesson-page__block')!.click();
    await tick();

    const editors = refs.canvas.querySelectorAll('.block-editor');
    expect(editors).toHaveLength(1);
    expect(
      refs.canvas.querySelector('.block-editor__visibility, .lesson-page__toolbar select')
    ).not.toBeNull();
  });

  it('shows an error state when the lesson fails to load', async () => {
    apiGetMock.mockRejectedValue(new ApiClientError({ code: 'not_found', message: 'Lesson not found' }));
    mount({ lessonId: 'missing' });
    await tick();

    expect(refs.canvas.textContent).toContain('Lesson not found.');
  });

  it('does not touch the DOM once superseded by a newer route', async () => {
    mockLessonLoad();
    mount({ isStale: () => true });
    await tick();

    expect(refs.canvas.querySelector('.lesson-page__title')).toBeNull();
  });

  it('adds a heading from the Basic palette family with a generated id', async () => {
    mockLessonLoad(makeLesson({ blocks: [] }));
    mount();
    await tick();

    expect(refs.canvas.textContent).not.toContain('No blocks yet. Use Add Block');

    insertFromPalette('Basic', 'heading');

    const heading =
      refs.canvas.querySelector<HTMLElement>('.block-editor[data-block-type="heading"]') ??
      refs.canvas.querySelector<HTMLElement>('.lesson-page__block[data-block-type="heading"]');
    expect(heading).not.toBeNull();
    expect(heading?.dataset.blockId).toBe('block_lesson_001_1');
  });

  it('adds an image from the Media palette family', async () => {
    mockLessonLoad(makeLesson({ blocks: [] }));
    mount();
    await tick();

    insertFromPalette('Media', 'image');
    await tick();

    const image =
      refs.canvas.querySelector('.block-editor[data-block-type="image"]') ??
      refs.canvas.querySelector('.lesson-page__block[data-block-type="image"]');
    expect(image).not.toBeNull();
    expect((image as HTMLElement).dataset.blockId).toBe('block_lesson_001_1');
  });

  it('appends palette inserts in click order', async () => {
    mockLessonLoad(makeLesson({ blocks: [] }));
    mount();
    await tick();

    insertFromPalette('Basic', 'heading');
    insertFromPalette('Basic', 'heading');

    const ids = [...refs.canvas.querySelectorAll<HTMLElement>('.lesson-page__block')].map(
      (el) => el.dataset.blockId
    );
    expect(ids).toEqual(['block_lesson_001_1', 'block_lesson_001_2']);
  });

  it('openA4Preview prints the lesson', async () => {
    const spy = vi.spyOn(openPrint, 'openPrintLesson').mockImplementation(() => {});
    mockLessonLoad();
    const handle = mount();
    await tick();

    handle.openA4Preview();

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('hides chat via the panel Hide control', async () => {
    mockLessonLoad();
    mount();
    await tick();

    const builder = refs.canvas.querySelector('.lesson-builder')!;
    refs.canvas.querySelector<HTMLButtonElement>('.lesson-builder__chat-fab')!.click();
    expect(builder.classList.contains('lesson-builder--chat-shelved')).toBe(false);

    refs.canvas.querySelector<HTMLButtonElement>('.ai-panel__hide')!.click();
    expect(builder.classList.contains('lesson-builder--chat-shelved')).toBe(true);
    expect(refs.canvas.querySelector<HTMLButtonElement>('.lesson-builder__chat-fab')?.hidden).toBe(
      false
    );
  });

  it('toggles rail and chat with [ and ] when not typing', async () => {
    mockLessonLoad();
    mount();
    await tick();

    const builder = refs.canvas.querySelector('.lesson-builder')!;
    expect(builder.classList.contains('lesson-builder--rail-shelved')).toBe(false);
    expect(builder.classList.contains('lesson-builder--chat-shelved')).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '[', bubbles: true }));
    expect(builder.classList.contains('lesson-builder--rail-shelved')).toBe(true);
    expect(refs.canvas.querySelector('.lesson-builder__chat-fab')).toBeTruthy();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: ']', bubbles: true }));
    expect(builder.classList.contains('lesson-builder--chat-shelved')).toBe(false);
    const fab = refs.canvas.querySelector<HTMLElement>('.lesson-builder__chat-fab');
    expect(fab).not.toBeNull();
    expect(fab?.hidden).toBe(true);

    const title = refs.canvas.querySelector<HTMLInputElement>('.lesson-page__title')!;
    title.dispatchEvent(new KeyboardEvent('keydown', { key: '[', bubbles: true }));
    expect(builder.classList.contains('lesson-builder--rail-shelved')).toBe(true);
  });

  it('enters and exits full page mode from the context bar and Escape', async () => {
    mockLessonLoad();
    mount();
    await tick();

    const builder = refs.canvas.querySelector('.lesson-builder')!;
    const layout = refs.root.querySelector('.teacher-layout')!;
    expect(builder.classList.contains('lesson-builder--rail-shelved')).toBe(false);

    refs.contextBar.querySelector<HTMLButtonElement>('[data-builder-fullscreen]')!.click();
    expect(builder.classList.contains('lesson-builder--full-page')).toBe(true);
    expect(layout.classList.contains('teacher-layout--lesson-full-page')).toBe(true);
    expect(document.body.classList.contains('is-lesson-builder-full-page')).toBe(true);
    expect(builder.classList.contains('lesson-builder--rail-shelved')).toBe(true);
    expect(builder.classList.contains('lesson-builder--chat-shelved')).toBe(true);
    const fab = refs.canvas.querySelector<HTMLButtonElement>('.lesson-builder__chat-fab');
    expect(fab?.hidden).toBe(false);

    fab?.click();
    expect(builder.classList.contains('lesson-builder--chat-shelved')).toBe(false);
    expect(refs.canvas.querySelector('.ai-panel')).not.toBeNull();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(builder.classList.contains('lesson-builder--full-page')).toBe(true);
    expect(builder.classList.contains('lesson-builder--chat-shelved')).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(builder.classList.contains('lesson-builder--full-page')).toBe(false);
    expect(builder.classList.contains('lesson-builder--rail-shelved')).toBe(false);
    expect(builder.classList.contains('lesson-builder--chat-shelved')).toBe(true);
  });

  it('enables the student link after Publish without a canvas banner', async () => {
    mockLessonLoad();
    apiPostMock.mockResolvedValue({ student_path: '/s/lessons/lesson_001' });
    mount();
    await tick();

    refs.contextBar.querySelector<HTMLButtonElement>('.context-bar__publish')!.click();
    await tick();

    expect(refs.canvas.querySelector<HTMLElement>('.lesson-editor__publish-panel')?.hidden).toBe(
      true
    );
    expect(refs.canvas.querySelector('.lesson-editor__publish-link')).toBeNull();
    expect(
      refs.contextBar.querySelector<HTMLButtonElement>('.public-link__trigger')?.disabled
    ).toBe(false);
    expect(refs.contextBar.querySelector('[data-save-slot]')?.textContent).toBe('Published');
  });

  it('wires Publish failure into a checklist of issues', async () => {
    mockLessonLoad();
    apiPostMock.mockRejectedValue(
      new ApiClientError({
        code: 'validation_error',
        message: 'Lesson is not publishable',
        details: [{ path: ['title'], message: 'Title is required to publish' }]
      })
    );
    mount();
    await tick();

    refs.contextBar.querySelector<HTMLButtonElement>('.context-bar__publish')!.click();
    await tick();

    const issues = [...refs.canvas.querySelectorAll('.lesson-editor__publish-issues li')].map(
      (el) => el.textContent
    );
    expect(issues).toEqual(['title: Title is required to publish']);
  });

  it('names the failing block and jumps to it from the publish checklist', async () => {
    const diagram = createBlock('diagram', 'd1');
    if (diagram.block_type !== 'diagram') throw new Error('expected diagram');
    diagram.content = {
      source: 'image',
      image_url: '',
      image_alt: '',
      caption: 'Spacing vs massed practice'
    };
    mockLessonLoad(makeLesson({ blocks: [diagram] }));
    apiPostMock.mockRejectedValue(
      new ApiClientError({
        code: 'validation_error',
        message: 'Lesson is not publishable',
        details: [{ path: ['blocks'], message: 'Diagram image needs a valid http(s) URL to publish' }]
      })
    );
    mount();
    await tick();

    refs.contextBar.querySelector<HTMLButtonElement>('.context-bar__publish')!.click();
    await tick();

    const jump = refs.canvas.querySelector<HTMLButtonElement>('.lesson-editor__publish-jump');
    expect(jump?.textContent).toContain('Diagram “Spacing vs massed practice”');
    expect(jump?.textContent).toContain('valid http(s) URL');
    jump!.click();

    const row = refs.canvas.querySelector('[data-block-id="d1"]');
    expect(row?.classList.contains('lesson-page__block--publish-error')).toBe(true);
    expect(row?.classList.contains('lesson-page__block--selected')).toBe(true);
  });

  it('flush() saves immediately, and awaiting it confirms the save completed, without waiting for the autosave debounce', async () => {
    mockLessonLoad();
    apiPutMock.mockResolvedValue(makeLesson());
    const handle = mount();
    await tick();

    const titleInput = refs.canvas.querySelector<HTMLInputElement>('.lesson-page__title')!;
    titleInput.value = 'Updated title';
    titleInput.dispatchEvent(new Event('input', { bubbles: true }));

    await handle.flush();

    expect(apiPutMock).toHaveBeenCalledTimes(1);
    expect(apiPutMock).toHaveBeenCalledWith(
      '/api/lessons/lesson_001',
      expect.objectContaining({ title: 'Updated title' })
    );
  });

  it('awaiting flush() before dispose() preserves an edit queued behind an in-flight autosave (route teardown)', async () => {
    mockLessonLoad();

    let resolveFirstPut!: (value: Lesson) => void;
    apiPutMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirstPut = resolve;
        })
    );
    apiPutMock.mockResolvedValueOnce(makeLesson());

    const handle = mount();
    await tick();

    const titleInput = refs.canvas.querySelector<HTMLInputElement>('.lesson-page__title')!;

    titleInput.value = 'First edit';
    titleInput.dispatchEvent(new Event('input', { bubbles: true }));

    const firstFlush = handle.flush();
    await tick();
    expect(apiPutMock).toHaveBeenCalledTimes(1);

    titleInput.value = 'Second edit';
    titleInput.dispatchEvent(new Event('input', { bubbles: true }));

    const teardownFlush = handle.flush();

    resolveFirstPut(makeLesson());
    await firstFlush;
    await teardownFlush;
    handle.dispose();

    expect(apiPutMock).toHaveBeenCalledTimes(2);
    expect(apiPutMock).toHaveBeenLastCalledWith(
      '/api/lessons/lesson_001',
      expect.objectContaining({ title: 'Second edit' })
    );
  });

  it('shows Save as composition on a selected section and posts to /api/compositions', async () => {
    const section = sectionBlock();
    mockLessonLoad(makeLesson({ blocks: [section] }));
    apiPostMock.mockResolvedValue({
      id: 'composition_1',
      type: 'composition_template',
      title: 'Do Now',
      slug: 'do-now',
      status: 'active',
      root: section,
      created_at: ISO,
      updated_at: ISO,
      schema_version: 1
    });
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Do Now pack');

    mount();
    await tick();

    refs.canvas.querySelector<HTMLElement>('.lesson-page__block[data-block-type="section"]')!.click();
    expect(refs.canvas.querySelector('.lesson-editor__save-composition')).not.toBeNull();

    refs.canvas.querySelector<HTMLButtonElement>('.lesson-editor__save-composition')!.click();
    await tick();

    expect(promptSpy).toHaveBeenCalled();
    expect(apiPostMock).toHaveBeenCalledWith(
      '/api/compositions',
      expect.objectContaining({ title: 'Do Now pack', root: expect.objectContaining({ id: section.id }) })
    );
    promptSpy.mockRestore();
  });

  it('inserts a composition as an independent section copy', async () => {
    const templateRoot: Block = {
      id: 'block_template_root',
      type: 'block',
      block_type: 'section',
      variant: 'medium',
      visibility: 'student_teacher',
      content: { title: 'Exit ticket', blocks: [] },
      layout: {},
      print: {},
      settings: {},
      created_at: ISO,
      updated_at: ISO,
      schema_version: 1
    };

    apiGetMock.mockImplementation(async (path: string) => {
      if (path === '/api/compositions') {
        return { compositions: [{ id: 'composition_1', title: 'Exit ticket', updated_at: ISO }] };
      }
      if (path === '/api/curriculum') {
        return emptyCurriculum;
      }
      if (path === '/api/compositions/composition_1') {
        return {
          id: 'composition_1',
          type: 'composition_template',
          title: 'Exit ticket',
          slug: 'exit-ticket',
          status: 'active',
          root: templateRoot,
          created_at: ISO,
          updated_at: ISO,
          schema_version: 1
        };
      }
      if (path.startsWith('/api/lessons/')) {
        return makeLesson({ blocks: [] });
      }
      if (path === '/api/ai/jobs') {
        return { jobs: [] };
      }
      throw new Error(`Unexpected apiGet path: ${path}`);
    });

    mount();
    await tick();

    insertComposition('copy');
    await tick();

    const row = refs.canvas.querySelector<HTMLElement>(
      '.lesson-page__block[data-block-type="section"], .block-editor[data-block-type="section"]'
    );
    expect(row).not.toBeNull();
    expect(row?.dataset.blockId).toBe('block_lesson_001_1');
    expect(row?.dataset.blockId).not.toBe('block_template_root');
  });

  it('Insert linked appends a linked section stub', async () => {
    const templateRoot: Block = {
      id: 'block_template_root',
      type: 'block',
      block_type: 'section',
      variant: 'medium',
      visibility: 'student_teacher',
      content: {
        title: 'Reading pack',
        blocks: [
          {
            id: 'block_child_1',
            type: 'block',
            block_type: 'rich_text',
            variant: 'medium',
            visibility: 'student_teacher',
            content: { html: '<p>Read</p>' },
            layout: {},
            print: {},
            settings: {},
            created_at: ISO,
            updated_at: ISO,
            schema_version: 1
          }
        ]
      },
      layout: {},
      print: {},
      settings: {},
      created_at: ISO,
      updated_at: ISO,
      schema_version: 1
    };
    const composition = {
      id: 'composition_1',
      type: 'composition_template' as const,
      title: 'Reading pack',
      slug: 'reading-pack',
      status: 'active' as const,
      root: templateRoot,
      created_at: ISO,
      updated_at: ISO,
      schema_version: 1 as const
    };

    apiGetMock.mockImplementation(async (path: string) => {
      if (path === '/api/compositions') {
        return { compositions: [{ id: 'composition_1', title: 'Reading pack', updated_at: ISO }] };
      }
      if (path === '/api/curriculum') {
        return emptyCurriculum;
      }
      if (path === '/api/compositions/composition_1') {
        return composition;
      }
      if (path.startsWith('/api/lessons/')) {
        return makeLesson({ blocks: [] });
      }
      if (path === '/api/ai/jobs') {
        return { jobs: [] };
      }
      throw new Error(`Unexpected apiGet path: ${path}`);
    });
    apiPutMock.mockResolvedValue(makeLesson());

    const handle = mount();
    await tick();

    insertComposition('linked');
    await tick();

    expect(refs.canvas.querySelector('.lesson-editor__linked-badge')?.textContent).toBe('Linked');
    expect(refs.canvas.querySelector('.block-editor')).toBeNull();

    await handle.flush();
    expect(apiPutMock).toHaveBeenCalledWith(
      '/api/lessons/lesson_001',
      expect.objectContaining({
        blocks: [
          expect.objectContaining({
            block_type: 'section',
            content: expect.objectContaining({
              link: {
                mode: 'linked',
                source_composition_id: 'composition_1'
              }
            })
          })
        ]
      })
    );
  });

  it('Detach expands linked stub into independent section', async () => {
    const child: Block = {
      id: 'block_child_1',
      type: 'block',
      block_type: 'rich_text',
      variant: 'medium',
      visibility: 'student_teacher',
      content: { html: '<p>Read</p>' },
      layout: {},
      print: {},
      settings: {},
      created_at: ISO,
      updated_at: ISO,
      schema_version: 1
    };
    const templateRoot: Block = {
      id: 'block_template_root',
      type: 'block',
      block_type: 'section',
      variant: 'medium',
      visibility: 'student_teacher',
      content: { title: 'Reading pack', blocks: [child] },
      layout: {},
      print: {},
      settings: {},
      created_at: ISO,
      updated_at: ISO,
      schema_version: 1
    };

    apiGetMock.mockImplementation(async (path: string) => {
      if (path === '/api/compositions') {
        return { compositions: [{ id: 'composition_1', title: 'Reading pack', updated_at: ISO }] };
      }
      if (path === '/api/curriculum') {
        return emptyCurriculum;
      }
      if (path === '/api/compositions/composition_1') {
        return {
          id: 'composition_1',
          type: 'composition_template',
          title: 'Reading pack',
          slug: 'reading-pack',
          status: 'active',
          root: templateRoot,
          created_at: ISO,
          updated_at: ISO,
          schema_version: 1
        };
      }
      if (path.startsWith('/api/lessons/')) {
        return makeLesson({ blocks: [linkedStub()] });
      }
      if (path === '/api/ai/jobs') {
        return { jobs: [] };
      }
      throw new Error(`Unexpected apiGet path: ${path}`);
    });
    apiPutMock.mockResolvedValue(makeLesson());

    const handle = mount();
    await tick();
    await tick();

    refs.canvas.querySelector<HTMLButtonElement>('.lesson-editor__detach-composition')!.click();
    await tick();

    expect(refs.canvas.querySelector('.lesson-editor__linked-badge')).toBeNull();
    expect(
      refs.canvas.querySelector(
        '.lesson-page__block[data-block-type="section"], .block-editor[data-block-type="section"]'
      )
    ).not.toBeNull();

    await handle.flush();
    const saved = apiPutMock.mock.calls.at(-1)?.[1] as Lesson;
    const section = saved.blocks[0];
    expect(section?.block_type).toBe('section');
    if (section?.block_type === 'section') {
      expect(section.content.link).toBeUndefined();
      expect(section.content.title).toBe('Reading pack');
      expect(section.content.blocks.length).toBeGreaterThan(0);
    }
  });

  it('linked row has no Save as composition control', async () => {
    apiGetMock.mockImplementation(async (path: string) => {
      if (path === '/api/compositions') {
        return { compositions: [] };
      }
      if (path === '/api/curriculum') {
        return emptyCurriculum;
      }
      if (path === '/api/compositions/composition_1') {
        throw new ApiClientError({ code: 'not_found', message: 'Composition not found' });
      }
      if (path.startsWith('/api/lessons/')) {
        return makeLesson({ blocks: [linkedStub()] });
      }
      if (path === '/api/ai/jobs') {
        return { jobs: [] };
      }
      throw new Error(`Unexpected apiGet path: ${path}`);
    });

    mount();
    await tick();
    await tick();

    refs.canvas.querySelector<HTMLElement>('.lesson-page__block[data-block-id="block_lesson_001_1"]')!.click();
    expect(refs.canvas.querySelector('.lesson-editor__save-composition')).toBeNull();
    expect(refs.canvas.querySelector('.lesson-editor__linked-badge')?.textContent).toBe('Linked');
    expect(refs.canvas.querySelector('.lesson-editor__edit-source')).not.toBeNull();
    expect(refs.canvas.querySelector('.lesson-editor__detach-composition')).not.toBeNull();
  });

  it('Edit Source saves composition via PATCH and refreshes preview', async () => {
    const child: Block = {
      id: 'block_child_1',
      type: 'block',
      block_type: 'rich_text',
      variant: 'medium',
      visibility: 'student_teacher',
      content: { html: '<p>Read</p>' },
      layout: {},
      print: {},
      settings: {},
      created_at: ISO,
      updated_at: ISO,
      schema_version: 1
    };
    const templateRoot: Block = {
      id: 'block_template_root',
      type: 'block',
      block_type: 'section',
      variant: 'medium',
      visibility: 'student_teacher',
      content: { title: 'Reading pack', blocks: [child] },
      layout: {},
      print: {},
      settings: {},
      created_at: ISO,
      updated_at: ISO,
      schema_version: 1
    };
    const composition = {
      id: 'composition_1',
      type: 'composition_template' as const,
      title: 'Reading pack',
      slug: 'reading-pack',
      status: 'active' as const,
      root: templateRoot,
      created_at: ISO,
      updated_at: ISO,
      schema_version: 1 as const
    };

    apiGetMock.mockImplementation(async (path: string) => {
      if (path === '/api/compositions') {
        return { compositions: [{ id: 'composition_1', title: 'Reading pack', updated_at: ISO }] };
      }
      if (path === '/api/curriculum') {
        return emptyCurriculum;
      }
      if (path === '/api/compositions/composition_1') {
        return composition;
      }
      if (path.startsWith('/api/lessons/')) {
        return makeLesson({ blocks: [linkedStub()] });
      }
      if (path === '/api/ai/jobs') {
        return { jobs: [] };
      }
      throw new Error(`Unexpected apiGet path: ${path}`);
    });
    apiPatchMock.mockResolvedValue({
      ...composition,
      title: 'Updated reading pack'
    });

    mount();
    await tick();
    await tick();

    refs.canvas.querySelector<HTMLButtonElement>('.lesson-editor__edit-source')!.click();
    await tick();

    const dialog = document.querySelector<HTMLDialogElement>('.lesson-editor__composition-modal');
    expect(dialog).not.toBeNull();
    expect(dialog?.open).toBe(true);

    const titleInput = dialog!.querySelector<HTMLInputElement>(
      '.lesson-editor__composition-modal-title'
    )!;
    titleInput.value = 'Updated reading pack';
    titleInput.dispatchEvent(new Event('input', { bubbles: true }));

    dialog!.querySelector<HTMLButtonElement>('.lesson-editor__composition-modal-save')!.click();
    await tick();

    expect(apiPatchMock).toHaveBeenCalledWith(
      '/api/compositions/composition_1',
      expect.objectContaining({ title: 'Updated reading pack' })
    );
    expect(document.querySelector('.lesson-editor__composition-modal')).toBeNull();
    expect(refs.canvas.querySelector('.lesson-editor__linked-title')?.textContent).toBe(
      'Updated reading pack'
    );
  });

  it('confirms stale Accept after a local edit and applies when confirmed', async () => {
    mockLessonLoad();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    mount();
    await tick();

    const form = refs.canvas.querySelector<HTMLFormElement>('.ai-panel__composer')!;
    const input = refs.canvas.querySelector<HTMLTextAreaElement>('.ai-panel__input')!;
    input.value = 'Build a lesson';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => {
      const accept = [...refs.canvas.querySelectorAll('button')].find(
        (btn) => btn.textContent === 'Accept'
      );
      expect(accept).toBeTruthy();
    });

    const titleInput = refs.canvas.querySelector<HTMLInputElement>('.lesson-page__title')!;
    titleInput.value = 'Edited while planning';
    titleInput.dispatchEvent(new Event('input', { bubbles: true }));

    const accept = [...refs.canvas.querySelectorAll('button')].find(
      (btn) => btn.textContent === 'Accept'
    )!;
    accept.click();

    expect(confirmSpy).toHaveBeenCalledWith(
      'You edited while the plan was built. Accept replaces the lesson with this plan.'
    );
    expect(refs.canvas.querySelector<HTMLInputElement>('.lesson-page__title')?.value).toBe(
      'Built lesson'
    );
    confirmSpy.mockRestore();
  });

  it('confirms stale Accept after history restore', async () => {
    mockLessonLoad();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    mount();
    await tick();

    const form = refs.canvas.querySelector<HTMLFormElement>('.ai-panel__composer')!;
    const input = refs.canvas.querySelector<HTMLTextAreaElement>('.ai-panel__input')!;
    input.value = 'Build a lesson';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => {
      const accept = [...refs.canvas.querySelectorAll('button')].find(
        (btn) => btn.textContent === 'Accept'
      );
      expect(accept).toBeTruthy();
    });

    historyHarness.onRestored?.(makeLesson({ title: 'Older revision' }));

    const accept = [...refs.canvas.querySelectorAll('button')].find(
      (btn) => btn.textContent === 'Accept'
    )!;
    accept.click();

    expect(confirmSpy).toHaveBeenCalledWith(
      'You edited while the plan was built. Accept replaces the lesson with this plan.'
    );
    confirmSpy.mockRestore();
  });

  it('recedes the flyout during drag so a page gap can receive the drop', async () => {
    mockLessonLoad(makeLesson({ blocks: [] }));
    mount();
    await tick();

    refs.canvas.querySelector<HTMLButtonElement>('[data-family="Basic"]')!.click();
    const card = refs.canvas.querySelector<HTMLElement>('[data-block-type="heading"]')!;
    const flyout = refs.canvas.querySelector('.lesson-palette__flyout');
    const dt = new Map<string, string>();
    const start = new Event('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(start, 'dataTransfer', {
      value: {
        effectAllowed: 'uninitialized',
        dropEffect: 'none',
        setData(type: string, value: string) {
          dt.set(type, value);
        },
        getData(type: string) {
          return dt.get(type) ?? '';
        }
      }
    });
    card.dispatchEvent(start);

    expect(flyout?.classList.contains('lesson-palette__flyout--receded')).toBe(true);

    const gap = refs.canvas.querySelector('.lesson-page__gap')!;
    const over = new Event('dragover', { bubbles: true, cancelable: true });
    Object.defineProperty(over, 'dataTransfer', {
      value: {
        dropEffect: 'none',
        getData(type: string) {
          return dt.get(type) ?? '';
        }
      }
    });
    gap.dispatchEvent(over);
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', {
      value: {
        getData(type: string) {
          return dt.get(type) ?? '';
        }
      }
    });
    gap.dispatchEvent(drop);
    await tick();

    expect(refs.canvas.querySelector('.block-editor[data-block-type="heading"]')).not.toBeNull();
  });

  it('asks Copy vs Linked in the palette flyout footer', async () => {
    apiGetMock.mockImplementation(async (path: string) => {
      if (path === '/api/compositions') {
        return { compositions: [{ id: 'composition_1', title: 'Exit ticket', updated_at: ISO }] };
      }
      if (path === '/api/curriculum') {
        return emptyCurriculum;
      }
      if (path === '/api/compositions/composition_1') {
        return {
          id: 'composition_1',
          type: 'composition_template',
          title: 'Exit ticket',
          slug: 'exit-ticket',
          status: 'active',
          root: sectionBlock({ id: 'block_template_root', content: { title: 'Exit ticket', blocks: [] } }),
          created_at: ISO,
          updated_at: ISO,
          schema_version: 1
        };
      }
      if (path.startsWith('/api/lessons/')) {
        return makeLesson({ blocks: [] });
      }
      if (path === '/api/ai/jobs') {
        return { jobs: [] };
      }
      throw new Error(`Unexpected apiGet path: ${path}`);
    });

    mount();
    await tick();

    refs.canvas.querySelector<HTMLButtonElement>('[data-family="Compositions"]')!.click();
    refs.canvas.querySelector<HTMLButtonElement>('[data-composition-id="composition_1"]')!.click();

    const copy = refs.canvas.querySelector('.lesson-editor__insert-composition-copy');
    const linked = refs.canvas.querySelector('.lesson-editor__insert-composition-linked');
    expect(copy?.closest('.lesson-palette__flyout')).not.toBeNull();
    expect(linked?.closest('.lesson-palette__flyout')).not.toBeNull();
    expect(copy?.closest('.lesson-builder__page')).toBeNull();
  });

  it('dispose while Edit Source modal open removes dialog', async () => {
    const templateRoot: Block = {
      id: 'block_template_root',
      type: 'block',
      block_type: 'section',
      variant: 'medium',
      visibility: 'student_teacher',
      content: { title: 'Reading pack', blocks: [] },
      layout: {},
      print: {},
      settings: {},
      created_at: ISO,
      updated_at: ISO,
      schema_version: 1
    };

    apiGetMock.mockImplementation(async (path: string) => {
      if (path === '/api/compositions') {
        return { compositions: [{ id: 'composition_1', title: 'Reading pack', updated_at: ISO }] };
      }
      if (path === '/api/curriculum') {
        return emptyCurriculum;
      }
      if (path === '/api/compositions/composition_1') {
        return {
          id: 'composition_1',
          type: 'composition_template',
          title: 'Reading pack',
          slug: 'reading-pack',
          status: 'active',
          root: templateRoot,
          created_at: ISO,
          updated_at: ISO,
          schema_version: 1
        };
      }
      if (path.startsWith('/api/lessons/')) {
        return makeLesson({ blocks: [linkedStub()] });
      }
      if (path === '/api/ai/jobs') {
        return { jobs: [] };
      }
      throw new Error(`Unexpected apiGet path: ${path}`);
    });

    const handle = mount();
    await tick();
    await tick();

    refs.canvas.querySelector<HTMLButtonElement>('.lesson-editor__edit-source')!.click();
    await tick();

    expect(document.querySelector('.lesson-editor__composition-modal')).not.toBeNull();

    handle.dispose();

    expect(document.querySelector('.lesson-editor__composition-modal')).toBeNull();
  });
});
