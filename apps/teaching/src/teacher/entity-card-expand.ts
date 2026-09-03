import { apiPatch, apiPut } from '@/api/client';
import { navigate } from '@/app/router';
import type { Cover, Media } from '@/schemas';
import { renderEntityBanner } from '@/teacher/entity-banner';
import { getLesson } from '@/teacher/lessons-library/api';
import { patchClass } from '@/teacher/schedule-api';
import { patchUnit } from '@/teacher/unit-api';

export type EntityCardKind = 'lesson' | 'unit' | 'class';

export interface EntityCardExpandModel {
  kind: EntityCardKind;
  id: string;
  title: string;
  eyebrow?: string;
  cover?: Cover | null;
  media: ReadonlyArray<Media>;
  fullPagePath: string;
  metaText?: string;
  previewText?: string;
  editableTitle?: boolean;
}

export interface EntityCardExpandCallbacks {
  onCoverSave?: (cover: Cover | null) => void | Promise<void>;
  onTitleSave?: (title: string) => void | Promise<void>;
  onMutated?: () => void | Promise<void>;
  onClose?: () => void;
}

const DEFAULT_IGNORE =
  'button, a, input, textarea, select, .public-link, .list-row-actions, .classes-index__actions';

let activeClose: (() => void) | null = null;

async function defaultCoverSave(model: EntityCardExpandModel, cover: Cover | null): Promise<void> {
  switch (model.kind) {
    case 'lesson': {
      const lesson = await getLesson(model.id);
      const next = { ...lesson, updated_at: new Date().toISOString() };
      if (cover) next.cover = cover;
      else delete next.cover;
      await apiPut(`/api/lessons/${model.id}`, next);
      return;
    }
    case 'unit':
      await patchUnit(model.id, { cover });
      return;
    case 'class':
      await patchClass(model.id, { cover });
      return;
  }
}

async function defaultTitleSave(model: EntityCardExpandModel, title: string): Promise<void> {
  switch (model.kind) {
    case 'lesson': {
      const lesson = await getLesson(model.id);
      await apiPut(`/api/lessons/${model.id}`, {
        ...lesson,
        title,
        updated_at: new Date().toISOString()
      });
      return;
    }
    case 'unit':
      await apiPatch(`/api/units/${model.id}`, { title });
      return;
    case 'class':
      return;
  }
}

async function hydrateLessonCover(model: EntityCardExpandModel): Promise<Cover | null | undefined> {
  if (model.kind !== 'lesson' || model.cover !== undefined) return model.cover ?? null;
  const lesson = await getLesson(model.id);
  return lesson.cover ?? null;
}

/**
 * Opens a glass expanded card for quick looks and light edits, with a full-page
 * escape hatch. Only one expand panel is open at a time.
 */
export function openEntityCardExpand(
  model: EntityCardExpandModel,
  callbacks: EntityCardExpandCallbacks = {}
): { close: () => void } {
  if (activeClose) activeClose();

  let disposed = false;
  let titleDirty = false;
  let savingTitle = false;
  let currentTitle = model.title;
  let currentCover = model.cover ?? null;
  let currentEyebrow = model.eyebrow;
  const editableTitle = model.editableTitle ?? model.kind !== 'class';

  const backdrop = document.createElement('div');
  backdrop.className = 'create-modal-backdrop entity-card-expand-backdrop';
  backdrop.dataset.entityCardExpand = 'backdrop';

  const dialog = document.createElement('div');
  dialog.className = 'entity-card-expand glass-panel glass-tile';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'entity-card-expand-title');

  const header = document.createElement('div');
  header.className = 'entity-card-expand__header';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn btn--ghost entity-card-expand__close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = 'Close';

  header.append(closeBtn);

  const bannerHost = document.createElement('div');
  bannerHost.className = 'entity-card-expand__banner';

  const body = document.createElement('div');
  body.className = 'entity-card-expand__body';

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.id = 'entity-card-expand-title';
  titleInput.className = 'entity-card-expand__title-input';
  titleInput.value = model.title;
  titleInput.setAttribute('aria-label', 'Title');

  const titleHeading = document.createElement('h2');
  titleHeading.id = 'entity-card-expand-title';
  titleHeading.className = 'entity-card-expand__title';
  titleHeading.textContent = model.title;

  const meta = document.createElement('p');
  meta.className = 'entity-card-expand__meta';
  if (model.metaText) meta.textContent = model.metaText;

  const preview = document.createElement('p');
  preview.className = 'entity-card-expand__preview';
  if (model.previewText) preview.textContent = model.previewText;

  const errorBanner = document.createElement('p');
  errorBanner.className = 'entity-card-expand__error';
  errorBanner.hidden = true;
  errorBanner.setAttribute('role', 'alert');

  const footer = document.createElement('div');
  footer.className = 'entity-card-expand__footer';

  const fullPageBtn = document.createElement('button');
  fullPageBtn.type = 'button';
  fullPageBtn.className = 'btn btn--decisive entity-card-expand__full-page';
  fullPageBtn.textContent = 'Open full page';

  footer.append(fullPageBtn);

  if (editableTitle) body.append(titleInput);
  else body.append(titleHeading);
  if (model.metaText) body.append(meta);
  if (model.previewText) body.append(preview);
  body.append(errorBanner, footer);

  dialog.append(header, bannerHost, body);
  backdrop.append(dialog);
  document.body.append(backdrop);

  const banner = renderEntityBanner(bannerHost, {
    cover: currentCover,
    media: model.media,
    title: currentTitle,
    eyebrow: currentEyebrow,
    entityId: model.id,
    editable: true,
    size: 'banner',
    onSave: async (cover) => {
      errorBanner.hidden = true;
      try {
        const save = callbacks.onCoverSave ?? ((next) => defaultCoverSave(model, next));
        await save(cover);
        currentCover = cover;
        banner.update({ cover, title: currentTitle, eyebrow: currentEyebrow });
        await callbacks.onMutated?.();
      } catch (error) {
        errorBanner.hidden = false;
        errorBanner.textContent =
          error instanceof Error ? error.message : 'Unable to save cover.';
      }
    }
  });

  const saveTitle = async (): Promise<void> => {
    if (!editableTitle || savingTitle) return;
    const trimmed = titleInput.value.trim();
    if (!trimmed) {
      titleInput.value = currentTitle;
      return;
    }
    if (trimmed === currentTitle && !titleDirty) return;
    savingTitle = true;
    errorBanner.hidden = true;
    try {
      const save = callbacks.onTitleSave ?? ((title) => defaultTitleSave(model, title));
      await save(trimmed);
      currentTitle = trimmed;
      titleDirty = false;
      banner.update({ title: currentTitle, eyebrow: currentEyebrow, cover: currentCover });
      await callbacks.onMutated?.();
    } catch (error) {
      errorBanner.hidden = false;
      errorBanner.textContent =
        error instanceof Error ? error.message : 'Unable to save title.';
    } finally {
      savingTitle = false;
    }
  };

  const close = (): void => {
    if (disposed) return;
    disposed = true;
    document.removeEventListener('keydown', onKeyDown);
    void saveTitle().finally(() => {
      banner.dispose();
      backdrop.remove();
      if (activeClose === closeSelf) activeClose = null;
      callbacks.onClose?.();
    });
  };

  const closeSelf = close;

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  activeClose = closeSelf;

  document.addEventListener('keydown', onKeyDown);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) close();
  });
  closeBtn.addEventListener('click', () => close());
  fullPageBtn.addEventListener('click', () => {
    void saveTitle().finally(() => {
      close();
      navigate(model.fullPagePath);
    });
  });

  if (editableTitle) {
    titleInput.addEventListener('input', () => {
      titleDirty = titleInput.value.trim() !== currentTitle;
      banner.update({ title: titleInput.value, eyebrow: currentEyebrow, cover: currentCover });
    });
    titleInput.addEventListener('blur', () => {
      void saveTitle();
    });
    titleInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void saveTitle();
      }
    });
  }

  void hydrateLessonCover(model)
    .then((cover) => {
      if (disposed || cover === undefined) return;
      currentCover = cover;
      banner.update({ cover, title: currentTitle, eyebrow: currentEyebrow });
    })
    .catch(() => {
      // Cover is optional; keep the gradient fallback.
    });

  if (editableTitle) titleInput.focus();
  else fullPageBtn.focus();

  return { close };
}

export interface WireEntityCardExpandOptions {
  ignoreSelector?: string;
}

/**
 * Card click opens the expanded view. Interactive children (buttons, links,
 * checkboxes) keep their own behaviour.
 */
export function wireEntityCardExpand(
  host: HTMLElement,
  model: EntityCardExpandModel,
  callbacks: EntityCardExpandCallbacks = {},
  options: WireEntityCardExpandOptions = {}
): { dispose: () => void } {
  const ignore = options.ignoreSelector ?? DEFAULT_IGNORE;
  host.classList.add('entity-card-expandable');

  const open = (event?: Event): void => {
    if (event) {
      const target = event.target as HTMLElement | null;
      const ignored = target?.closest(ignore);
      if (ignored && ignored !== host) return;
      if (event.type === 'click') {
        const click = event as MouseEvent;
        if (click.defaultPrevented) return;
        click.preventDefault();
      }
    }
    openEntityCardExpand(model, callbacks);
  };

  const onClick = (event: MouseEvent): void => open(event);
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (event.target !== host) return;
    event.preventDefault();
    open();
  };

  host.addEventListener('click', onClick);
  host.addEventListener('keydown', onKeyDown);

  return {
    dispose: () => {
      host.classList.remove('entity-card-expandable');
      host.removeEventListener('click', onClick);
      host.removeEventListener('keydown', onKeyDown);
    }
  };
}
