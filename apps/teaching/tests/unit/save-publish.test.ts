import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Lesson } from '@/schemas/lesson';

vi.mock('@/api/client', async () => {
  const actual = await vi.importActual<typeof import('@/api/client')>('@/api/client');
  return {
    ...actual,
    apiPut: vi.fn(),
    apiPost: vi.fn()
  };
});

import { apiPut, apiPost, ApiClientError } from '@/api/client';
import {
  SaveController,
  formatPublishIssues,
  mountSavePublishControls,
  SAVE_STATE_LABEL
} from '@/teacher/save-publish';

const apiPutMock = apiPut as unknown as ReturnType<typeof vi.fn>;
const apiPostMock = apiPost as unknown as ReturnType<typeof vi.fn>;

const ISO = '2026-01-01T00:00:00.000Z';

function makeLesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    id: 'lesson_001',
    type: 'lesson',
    title: 'Test lesson',
    slug: 'test_lesson',
    status: 'active',
    created_at: ISO,
    updated_at: ISO,
    schema_version: 1,
    unit_id: 'unit_001',
    sequence: 1,
    blocks: [],
    ...overrides
  };
}

describe('formatPublishIssues', () => {
  it('formats Zod-style issues with path prefixes', () => {
    const error = new ApiClientError({
      code: 'validation_error',
      message: 'Lesson is not publishable',
      details: [
        { path: ['title'], message: 'Title is required to publish' },
        { path: [], message: 'Something else' }
      ]
    });

    expect(formatPublishIssues(error)).toEqual([
      'title: Title is required to publish',
      'Something else'
    ]);
  });

  it('does not prefix block issues with a blocks. path', () => {
    const error = new ApiClientError({
      code: 'validation_error',
      message: 'Lesson is not publishable',
      details: [
        {
          path: ['blocks'],
          message:
            'Diagram “Spacing vs massed practice”: Diagram image needs a valid http(s) URL to publish'
        }
      ]
    });
    expect(formatPublishIssues(error)).toEqual([
      'Diagram “Spacing vs massed practice”: Diagram image needs a valid http(s) URL to publish'
    ]);
  });

  it('falls back to the error message when there are no structured details', () => {
    const error = new ApiClientError({ code: 'validation_error', message: 'Nope' });
    expect(formatPublishIssues(error)).toEqual(['Nope']);
  });
});

describe('SaveController', () => {
  let lesson: Lesson;

  beforeEach(() => {
    lesson = makeLesson();
    apiPutMock.mockReset();
    apiPostMock.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts in "saved" when there is no published version', () => {
    const controller = new SaveController({
      lessonId: lesson.id,
      getLesson: () => lesson,
      hasPublishedVersion: false
    });
    expect(controller.getState()).toBe('saved');
  });

  it('starts in "published" when a published version already exists', () => {
    const controller = new SaveController({
      lessonId: lesson.id,
      getLesson: () => lesson,
      hasPublishedVersion: true
    });
    expect(controller.getState()).toBe('published');
  });

  it('subscribe immediately invokes the listener with the current state', () => {
    const controller = new SaveController({
      lessonId: lesson.id,
      getLesson: () => lesson,
      hasPublishedVersion: false
    });
    const listener = vi.fn();
    controller.subscribe(listener);
    expect(listener).toHaveBeenCalledWith('saved');
  });

  it('debounces autosave: no request fires before the debounce window elapses', async () => {
    apiPutMock.mockResolvedValue(lesson);
    const controller = new SaveController({
      lessonId: lesson.id,
      getLesson: () => lesson,
      hasPublishedVersion: false,
      debounceMs: 600
    });

    controller.notifyChange();
    await vi.advanceTimersByTimeAsync(500);
    expect(apiPutMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(150);
    expect(apiPutMock).toHaveBeenCalledTimes(1);
    expect(apiPutMock).toHaveBeenCalledWith(`/api/lessons/${lesson.id}`, lesson);
  });

  it('includes checkpoint_reason on saveNow when requested (AI accept path)', async () => {
    apiPutMock.mockResolvedValue(lesson);
    const controller = new SaveController({
      lessonId: lesson.id,
      getLesson: () => lesson,
      hasPublishedVersion: false
    });

    await controller.saveNow({ checkpointReason: 'ai_accepted' });

    expect(apiPutMock).toHaveBeenCalledTimes(1);
    expect(apiPutMock).toHaveBeenCalledWith(`/api/lessons/${lesson.id}`, {
      ...lesson,
      checkpoint_reason: 'ai_accepted'
    });
  });

  it('does not re-send checkpoint_reason on a chained resave', async () => {
    let resolveFirst!: () => void;
    const first = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    apiPutMock.mockImplementationOnce(async () => {
      await first;
      return lesson;
    });
    apiPutMock.mockResolvedValue(lesson);

    const controller = new SaveController({
      lessonId: lesson.id,
      getLesson: () => lesson,
      hasPublishedVersion: false
    });

    const firstSave = controller.saveNow({ checkpointReason: 'ai_accepted' });
    const secondSave = controller.saveNow();
    resolveFirst();
    await Promise.all([firstSave, secondSave]);

    expect(apiPutMock).toHaveBeenCalledTimes(2);
    expect(apiPutMock.mock.calls[0]![1]).toMatchObject({ checkpoint_reason: 'ai_accepted' });
    expect(apiPutMock.mock.calls[1]![1]).toEqual(lesson);
  });

  it('transitions saved -> saving -> saved across a successful autosave', async () => {
    apiPutMock.mockResolvedValue(lesson);
    const states: string[] = [];
    const controller = new SaveController({
      lessonId: lesson.id,
      getLesson: () => lesson,
      hasPublishedVersion: false
    });
    controller.subscribe((state) => states.push(state));

    controller.notifyChange();
    await vi.advanceTimersByTimeAsync(600);

    expect(states).toEqual(['saved', 'saving', 'saved']);
  });

  it('transitions to "unpublished_changes" (not "saved") when a published version exists', async () => {
    apiPutMock.mockResolvedValue(lesson);
    const controller = new SaveController({
      lessonId: lesson.id,
      getLesson: () => lesson,
      hasPublishedVersion: true
    });

    controller.notifyChange();
    await vi.advanceTimersByTimeAsync(600);

    expect(controller.getState()).toBe('unpublished_changes');
  });

  it('resets the debounce timer on repeated edits so only one request fires', async () => {
    apiPutMock.mockResolvedValue(lesson);
    const controller = new SaveController({
      lessonId: lesson.id,
      getLesson: () => lesson,
      hasPublishedVersion: false,
      debounceMs: 600
    });

    controller.notifyChange();
    await vi.advanceTimersByTimeAsync(400);
    controller.notifyChange();
    await vi.advanceTimersByTimeAsync(400);
    expect(apiPutMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(200);
    expect(apiPutMock).toHaveBeenCalledTimes(1);
  });

  it('saveNow bypasses the debounce for a manual save', async () => {
    apiPutMock.mockResolvedValue(lesson);
    const controller = new SaveController({
      lessonId: lesson.id,
      getLesson: () => lesson,
      hasPublishedVersion: false
    });

    controller.notifyChange();
    await controller.saveNow();

    expect(apiPutMock).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toBe('saved');
  });

  it('sets "save_failed" when the PUT rejects, and keeps the draft dirty for retry', async () => {
    apiPutMock.mockRejectedValueOnce(new Error('network down'));
    const controller = new SaveController({
      lessonId: lesson.id,
      getLesson: () => lesson,
      hasPublishedVersion: false
    });

    await controller.saveNow();
    expect(controller.getState()).toBe('save_failed');

    apiPutMock.mockResolvedValueOnce(lesson);
    await controller.saveNow();
    expect(apiPutMock).toHaveBeenCalledTimes(2);
    expect(controller.getState()).toBe('saved');
  });

  it('flush cancels the pending timer and, awaited, saves immediately only if there are unsaved edits', async () => {
    apiPutMock.mockResolvedValue(lesson);
    const controller = new SaveController({
      lessonId: lesson.id,
      getLesson: () => lesson,
      hasPublishedVersion: false
    });

    await controller.flush();
    expect(apiPutMock).not.toHaveBeenCalled();

    controller.notifyChange();
    await controller.flush();
    expect(apiPutMock).toHaveBeenCalledTimes(1);

    // The debounce timer should have been cancelled by flush, so no second
    // request fires once the original debounce window would have elapsed.
    await vi.advanceTimersByTimeAsync(600);
    expect(apiPutMock).toHaveBeenCalledTimes(1);
  });

  it('queues a follow-up save if saveNow is called again while a save is in flight', async () => {
    let resolveFirst!: (value: Lesson) => void;
    apiPutMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
    );
    apiPutMock.mockResolvedValueOnce(lesson);

    const controller = new SaveController({
      lessonId: lesson.id,
      getLesson: () => lesson,
      hasPublishedVersion: false
    });

    const firstSave = controller.saveNow();
    const secondSave = controller.saveNow();
    expect(apiPutMock).toHaveBeenCalledTimes(1);

    resolveFirst(lesson);
    await firstSave;
    await secondSave;
    await vi.advanceTimersByTimeAsync(0);

    expect(apiPutMock).toHaveBeenCalledTimes(2);
  });

  it('flush resolves only once a resave queued behind an in-flight save has also completed', async () => {
    let resolveFirst!: (value: Lesson) => void;
    apiPutMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
    );
    apiPutMock.mockResolvedValueOnce(lesson);

    const controller = new SaveController({
      lessonId: lesson.id,
      getLesson: () => lesson,
      hasPublishedVersion: false
    });

    // Start a save that will stay in flight...
    const inFlight = controller.saveNow();
    expect(apiPutMock).toHaveBeenCalledTimes(1);

    // ...then an edit arrives, queuing a resave behind it.
    controller.notifyChange();

    // Simulate route teardown: flush (not the raw debounce) is what
    // `LessonEditorHandle.flush`/`teardownLessonEditor` calls before
    // disposing. It must not resolve until the queued resave has also run.
    const flushed = controller.flush();

    resolveFirst(lesson);
    await inFlight;
    await flushed;

    expect(apiPutMock).toHaveBeenCalledTimes(2);
    expect(controller.getState()).toBe('saved');
  });

  it('does not drop a resave queued behind an in-flight save even if dispose() follows flush() with no await in between', async () => {
    // This reproduces the historical bug in `teardownLessonEditor`, which
    // called `flush()` then `dispose()` back to back with no `await`
    // between them at all.
    let resolveFirst!: (value: Lesson) => void;
    apiPutMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
    );
    apiPutMock.mockResolvedValueOnce(lesson);

    const controller = new SaveController({
      lessonId: lesson.id,
      getLesson: () => lesson,
      hasPublishedVersion: false
    });

    // A save is in flight...
    void controller.saveNow();
    expect(apiPutMock).toHaveBeenCalledTimes(1);

    // ...a second edit arrives, queuing a resave behind it...
    controller.notifyChange();

    // ...and teardown fires flush + dispose synchronously, with no await.
    controller.flush();
    controller.dispose();

    // Only once the in-flight request resolves does the queued resave get
    // a chance to run.
    resolveFirst(lesson);
    await vi.advanceTimersByTimeAsync(0);

    expect(apiPutMock).toHaveBeenCalledTimes(2);
  });

  it('publish flushes the pending debounced edit before POSTing, so it never publishes a stale draft', async () => {
    apiPutMock.mockResolvedValue(lesson);
    apiPostMock.mockResolvedValue({ student_path: '/s/lessons/lesson_001' });

    const callOrder: string[] = [];
    apiPutMock.mockImplementation(async () => {
      callOrder.push('put');
      return lesson;
    });
    apiPostMock.mockImplementation(async () => {
      callOrder.push('post');
      return { student_path: '/s/lessons/lesson_001' };
    });

    const controller = new SaveController({
      lessonId: lesson.id,
      getLesson: () => lesson,
      hasPublishedVersion: false
    });

    // An edit lands and is still sitting in the 600ms debounce window when
    // Publish is clicked.
    controller.notifyChange();
    const outcome = await controller.publish();

    expect(apiPutMock).toHaveBeenCalledTimes(1);
    expect(apiPostMock).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(['put', 'post']);
    expect(outcome).toEqual({ ok: true, studentPath: '/s/lessons/lesson_001' });
  });

  it('publish does not call the publish endpoint at all if there is nothing to save', async () => {
    apiPostMock.mockResolvedValue({ student_path: '/s/lessons/lesson_001' });
    const controller = new SaveController({
      lessonId: lesson.id,
      getLesson: () => lesson,
      hasPublishedVersion: false
    });

    await controller.publish();

    expect(apiPutMock).not.toHaveBeenCalled();
    expect(apiPostMock).toHaveBeenCalledTimes(1);
  });

  it('publish skips the publish request and reports a failure if the pre-publish save fails', async () => {
    apiPutMock.mockRejectedValue(new Error('network down'));
    apiPostMock.mockResolvedValue({ student_path: '/s/lessons/lesson_001' });

    const controller = new SaveController({
      lessonId: lesson.id,
      getLesson: () => lesson,
      hasPublishedVersion: false
    });

    controller.notifyChange();
    const outcome = await controller.publish();

    expect(apiPutMock).toHaveBeenCalledTimes(1);
    expect(apiPostMock).not.toHaveBeenCalled();
    expect(outcome.ok).toBe(false);
    expect(controller.getState()).toBe('save_failed');
  });

  it('publish resolves with the student path and moves to "published" on success', async () => {
    apiPostMock.mockResolvedValue({ student_path: '/s/lessons/lesson_001' });
    const controller = new SaveController({
      lessonId: lesson.id,
      getLesson: () => lesson,
      hasPublishedVersion: false
    });

    const outcome = await controller.publish();

    expect(outcome).toEqual({ ok: true, studentPath: '/s/lessons/lesson_001' });
    expect(controller.getState()).toBe('published');
    expect(apiPostMock).toHaveBeenCalledWith('/api/lessons/lesson_001/publish');
  });

  it('publish resolves with a checklist (without throwing) on a 400 validation error', async () => {
    apiPostMock.mockRejectedValue(
      new ApiClientError({
        code: 'validation_error',
        message: 'Lesson is not publishable',
        details: [{ path: ['title'], message: 'Title is required to publish' }]
      })
    );
    const controller = new SaveController({
      lessonId: lesson.id,
      getLesson: () => lesson,
      hasPublishedVersion: false
    });

    const outcome = await controller.publish();

    expect(outcome).toEqual({
      ok: false,
      issues: ['title: Title is required to publish']
    });
    expect(controller.getState()).toBe('saved');
  });

  it('dispose clears the pending timer and stops emitting to listeners', async () => {
    apiPutMock.mockResolvedValue(lesson);
    const controller = new SaveController({
      lessonId: lesson.id,
      getLesson: () => lesson,
      hasPublishedVersion: false
    });
    const listener = vi.fn();
    controller.subscribe(listener);
    listener.mockClear();

    controller.notifyChange();
    controller.dispose();
    await vi.advanceTimersByTimeAsync(600);

    expect(apiPutMock).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('mountSavePublishControls', () => {
  let lesson: Lesson;
  let contextBar: HTMLElement;
  let controller: SaveController;

  beforeEach(() => {
    lesson = makeLesson();
    apiPutMock.mockReset();
    apiPostMock.mockReset();

    contextBar = document.createElement('div');
    const title = document.createElement('h1');
    title.textContent = lesson.title;
    const saveSlot = document.createElement('span');
    saveSlot.dataset.saveSlot = 'true';
    contextBar.append(title, saveSlot);

    controller = new SaveController({
      lessonId: lesson.id,
      getLesson: () => lesson,
      hasPublishedVersion: false
    });
  });

  it('renders Save and Publish buttons and reflects state in the save slot', () => {
    mountSavePublishControls({ contextBar, controller });

    const saveSlot = contextBar.querySelector('[data-save-slot]');
    expect(saveSlot?.textContent).toBe(SAVE_STATE_LABEL.saved);

    const saveButton = contextBar.querySelector('.context-bar__save');
    const publishButton = contextBar.querySelector('.context-bar__publish');
    expect(saveButton?.textContent).toBe('Save');
    expect(publishButton?.textContent).toBe('Publish');
  });

  it('clicking Save triggers an immediate save', async () => {
    apiPutMock.mockResolvedValue(lesson);
    mountSavePublishControls({ contextBar, controller });

    contextBar.querySelector<HTMLButtonElement>('.context-bar__save')!.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(apiPutMock).toHaveBeenCalledTimes(1);
    expect(contextBar.querySelector('[data-save-slot]')?.textContent).toBe(SAVE_STATE_LABEL.saved);
  });

  it('clicking Publish reports success via onPublishSuccess', async () => {
    apiPostMock.mockResolvedValue({ student_path: '/s/lessons/lesson_001' });
    const onPublishSuccess = vi.fn();
    mountSavePublishControls({ contextBar, controller, onPublishSuccess });

    contextBar.querySelector<HTMLButtonElement>('.context-bar__publish')!.click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(onPublishSuccess).toHaveBeenCalledWith('/s/lessons/lesson_001');
    expect(contextBar.querySelector('[data-save-slot]')?.textContent).toBe(SAVE_STATE_LABEL.published);
  });

  it('clicking Publish reports a checklist via onPublishFailure on a 400', async () => {
    apiPostMock.mockRejectedValue(
      new ApiClientError({
        code: 'validation_error',
        message: 'Lesson is not publishable',
        details: [{ path: ['title'], message: 'Title is required to publish' }]
      })
    );
    const onPublishFailure = vi.fn();
    mountSavePublishControls({ contextBar, controller, onPublishFailure });

    contextBar.querySelector<HTMLButtonElement>('.context-bar__publish')!.click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(onPublishFailure).toHaveBeenCalledWith(['title: Title is required to publish']);
  });

  it('throws if the context bar is missing the [data-save-slot] element', () => {
    const bareContextBar = document.createElement('div');
    expect(() => mountSavePublishControls({ contextBar: bareContextBar, controller })).toThrow();
  });
});
