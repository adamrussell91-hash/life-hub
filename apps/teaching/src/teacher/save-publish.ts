import { apiPost, apiPut, ApiClientError } from '@/api/client';
import type { Lesson } from '@/schemas/lesson';
import type { Media } from '@/schemas/media';
import type { VersionReason } from '@/schemas/version';
import {
  collectRestrictedDriveMediaWarnings,
  formatPublishMediaWarnings
} from '@/teacher/publish-media-warnings';

/** Checkpoint reasons the lesson PUT endpoint accepts alongside a draft body. */
export type LessonPutCheckpointReason = Extract<
  VersionReason,
  'ai_accepted' | 'manual_checkpoint'
>;

export interface SaveNowOptions {
  /**
   * When set, the next PUT includes `checkpoint_reason` so the server creates
   * a version. Autosave / plain `saveNow()` omit this (no version spam).
   */
  checkpointReason?: LessonPutCheckpointReason;
}

export type SaveState = 'saved' | 'saving' | 'unpublished_changes' | 'published' | 'save_failed';

export const SAVE_STATE_LABEL: Record<SaveState, string> = {
  saved: 'Saved',
  saving: 'Saving…',
  unpublished_changes: 'Saved · Unpublished changes',
  published: 'Published',
  save_failed: 'Save failed'
};

export interface PublishSuccess {
  ok: true;
  studentPath: string;
}

export interface PublishFailure {
  ok: false;
  issues: string[];
}

export type PublishOutcome = PublishSuccess | PublishFailure;

interface PublishResponse {
  student_path: string;
}

interface ZodLikeIssue {
  path?: Array<string | number>;
  message?: string;
}

/** Turns Zod validation issues (or any error details) into teacher-facing checklist lines. */
export function formatPublishIssues(error: ApiClientError): string[] {
  const details = error.details;
  if (Array.isArray(details) && details.length > 0) {
    return details.map((issue: unknown) => {
      const candidate = issue as ZodLikeIssue;
      const path = Array.isArray(candidate.path) ? candidate.path.join('.') : '';
      const message = typeof candidate.message === 'string' ? candidate.message : error.message;
      if (path === 'blocks' || path.startsWith('blocks.')) return message;
      return path.length > 0 ? `${path}: ${message}` : message;
    });
  }
  return [error.message];
}

export interface SaveControllerOptions {
  lessonId: string;
  /** Returns the current in-memory draft snapshot to send on save. */
  getLesson: () => Lesson;
  /** Whether a published snapshot already exists for this lesson. */
  hasPublishedVersion: boolean;
  /** Autosave debounce window in ms. Defaults to 600. */
  debounceMs?: number;
}

/**
 * Framework-agnostic save/publish state machine for a single lesson draft.
 * Autosaves are debounced; `saveNow` / `flush` bypass the debounce for the
 * manual Save button and for flushing before navigating away.
 */
export class SaveController {
  private readonly lessonId: string;
  private readonly getLesson: () => Lesson;
  private readonly debounceMs: number;
  private readonly listeners = new Set<(state: SaveState) => void>();

  private hasPublishedVersion: boolean;
  private state: SaveState;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  /**
   * The in-flight save chain, if any. A single promise that only resolves
   * once every queued round (including resaves requested while a request
   * was already in flight) has settled — see `saveNow`/`performSave`.
   */
  private savePromise: Promise<void> | null = null;
  private resaveRequested = false;
  /** One-shot reason applied to the next PUT only (not chained resaves). */
  private pendingCheckpointReason: LessonPutCheckpointReason | null = null;
  private disposed = false;

  constructor(options: SaveControllerOptions) {
    this.lessonId = options.lessonId;
    this.getLesson = options.getLesson;
    this.hasPublishedVersion = options.hasPublishedVersion;
    this.debounceMs = options.debounceMs ?? 600;
    this.state = this.hasPublishedVersion ? 'published' : 'saved';
  }

  getState(): SaveState {
    return this.state;
  }

  /** Subscribes to state changes; immediately invoked with the current state. */
  subscribe(listener: (state: SaveState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Call whenever the in-memory draft changes; (re)starts the autosave debounce timer. */
  notifyChange(): void {
    if (this.disposed) return;
    this.dirty = true;
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.saveNow();
    }, this.debounceMs);
  }

  /**
   * Cancels any pending debounce timer. If there are unsaved edits, or a
   * save is already in flight, returns a promise that resolves only once
   * the draft has been fully persisted — including any additional edits
   * that arrive while the request is in flight. Callers (e.g. route
   * teardown before navigating away) must await this rather than treating
   * it as fire-and-forget, otherwise a queued resave can be dropped if the
   * controller is disposed before it runs.
   */
  flush(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.clearTimer();
    if (!this.dirty && !this.savePromise) {
      return Promise.resolve();
    }
    return this.saveNow();
  }

  /**
   * Saves immediately, bypassing the debounce. Safe to call while a save is
   * already in flight: the call coalesces into the current save chain and
   * the returned promise resolves once that entire chain (including any
   * resulting resave) has settled.
   *
   * Pass `checkpointReason: 'ai_accepted'` from the AI Accept path so the
   * server checkpoints the pre-accept draft on that PUT.
   */
  saveNow(options?: SaveNowOptions): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.clearTimer();

    if (options?.checkpointReason) {
      this.pendingCheckpointReason = options.checkpointReason;
    }

    if (this.savePromise) {
      this.resaveRequested = true;
      return this.savePromise;
    }

    const promise = this.performSave();
    this.savePromise = promise;
    return promise.finally(() => {
      if (this.savePromise === promise) {
        this.savePromise = null;
      }
    });
  }

  private async performSave(): Promise<void> {
    this.dirty = false;
    this.setState('saving');

    const checkpointReason = this.pendingCheckpointReason;
    this.pendingCheckpointReason = null;

    try {
      const lesson = this.getLesson();
      const body =
        checkpointReason === null
          ? lesson
          : { ...lesson, checkpoint_reason: checkpointReason };
      await apiPut(`/api/lessons/${this.lessonId}`, body);
      this.setState(this.hasPublishedVersion ? 'unpublished_changes' : 'saved');
    } catch {
      this.dirty = true;
      this.setState('save_failed');
    }

    if (this.resaveRequested) {
      this.resaveRequested = false;
      // Chained inside the same save cycle, so the outer promise (and
      // therefore `saveNow`/`flush` callers) don't resolve until this
      // follow-up round has also settled. Chained resaves never re-send
      // checkpoint_reason (cleared above).
      await this.performSave();
    }
  }

  /**
   * Publishes the current draft. Always flushes any unsaved/in-flight edits
   * first, so publish never snapshots a stale server-side draft. Resolves
   * with a checklist of issues (rather than throwing) on a pre-publish save
   * failure or a 400 validation error from the publish endpoint.
   */
  async publish(): Promise<PublishOutcome> {
    await this.flush();

    if (this.state === 'save_failed') {
      return {
        ok: false,
        issues: ['Unable to save your latest changes. Please retry before publishing.']
      };
    }

    try {
      const result = await apiPost<PublishResponse>(`/api/lessons/${this.lessonId}/publish`);
      this.hasPublishedVersion = true;
      this.dirty = false;
      this.setState('published');
      return { ok: true, studentPath: result.student_path };
    } catch (error) {
      if (error instanceof ApiClientError) {
        return { ok: false, issues: formatPublishIssues(error) };
      }
      throw error;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimer();
    this.listeners.clear();
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private setState(next: SaveState): void {
    this.state = next;
    for (const listener of this.listeners) {
      listener(next);
    }
  }
}

export interface SavePublishMountOptions {
  contextBar: HTMLElement;
  controller: SaveController;
  onPublishSuccess?: (studentPath: string) => void;
  onPublishFailure?: (issues: string[]) => void;
  /**
   * Optional context for restricted Drive media warnings shown before publish.
   * When omitted, publish proceeds without a media accessibility check.
   */
  getPublishMediaContext?: () =>
    | { blocks: unknown; media: ReadonlyArray<Media> }
    | Promise<{ blocks: unknown; media: ReadonlyArray<Media> }>;
}

export interface SavePublishHandle {
  dispose(): void;
}

/**
 * Renders Save + Publish controls into the context bar and wires the
 * existing `[data-save-slot]` element to the controller's state.
 */
export function mountSavePublishControls(options: SavePublishMountOptions): SavePublishHandle {
  const { contextBar, controller } = options;
  const saveSlot = contextBar.querySelector<HTMLElement>('[data-save-slot]');
  if (!saveSlot) {
    throw new Error('Context bar is missing [data-save-slot]');
  }

  const actions = document.createElement('div');
  actions.className = 'context-bar__actions';

  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.className = 'btn btn--secondary context-bar__save';
  saveButton.textContent = 'Save';
  saveButton.addEventListener('click', () => {
    void controller.saveNow();
  });

  const publishButton = document.createElement('button');
  publishButton.type = 'button';
  publishButton.className = 'btn btn--high-sea context-bar__publish';
  publishButton.textContent = 'Publish';
  publishButton.addEventListener('click', () => {
    publishButton.disabled = true;
    void (async () => {
      try {
        if (options.getPublishMediaContext) {
          const ctx = await options.getPublishMediaContext();
          const warnings = collectRestrictedDriveMediaWarnings(ctx);
          if (warnings.length > 0) {
            const proceed = window.confirm(
              `${formatPublishMediaWarnings(warnings)}\n\nPublish anyway?`
            );
            if (!proceed) return;
          }
        }

        const outcome = await controller.publish();
        if (outcome.ok) {
          options.onPublishSuccess?.(outcome.studentPath);
        } else {
          options.onPublishFailure?.(outcome.issues);
        }
      } finally {
        publishButton.disabled = false;
      }
    })();
  });

  actions.append(saveButton, publishButton);
  contextBar.append(actions);

  const unsubscribe = controller.subscribe((state) => {
    saveSlot.dataset.saveState = state;
    saveSlot.replaceChildren();
    const dot = document.createElement('span');
    dot.className = 'teacher-layout__save-dot';
    dot.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.className = 'teacher-layout__save-text';
    if (state === 'unpublished_changes') {
      text.append('Saved · ');
      const unpublished = document.createElement('b');
      unpublished.textContent = 'Unpublished changes';
      text.append(unpublished);
    } else {
      text.textContent = SAVE_STATE_LABEL[state];
    }
    saveSlot.append(dot, text);
    saveButton.disabled = state === 'saving';
  });

  return {
    dispose() {
      unsubscribe();
      actions.remove();
    }
  };
}
