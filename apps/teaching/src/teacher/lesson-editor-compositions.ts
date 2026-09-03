import { apiGet, apiPatch } from '@/api/client';
import { isCompositionUsable } from '@/blocks/composition-link';
import { createBlockEditor } from '@/blocks/registry';
import type { CompositionTemplate } from '@/schemas/composition';
import type { Media } from '@/schemas/media';

export type CompositionCacheValue = CompositionTemplate | 'missing';
export type CompositionCache = Map<string, CompositionCacheValue>;

export interface EditSourceModalHandle {
  close: () => void;
}

const noopModalHandle: EditSourceModalHandle = {
  close() {
    /* no dialog to close */
  }
};

export function ensureCompositionCached(options: {
  compositionId: string;
  cache: CompositionCache;
  inFlight: Set<string>;
  onSettled: () => void;
}): void {
  const { compositionId, cache, inFlight, onSettled } = options;
  if (cache.has(compositionId) || inFlight.has(compositionId)) {
    return;
  }
  inFlight.add(compositionId);
  void apiGet<CompositionTemplate>(`/api/compositions/${compositionId}`)
    .then((full) => {
      cache.set(compositionId, isCompositionUsable(full) ? full : 'missing');
    })
    .catch(() => {
      cache.set(compositionId, 'missing');
    })
    .finally(() => {
      inFlight.delete(compositionId);
      onSettled();
    });
}

/** Builds the linked-row preview body (loading / broken / title+summary). */
export function buildLinkedPreview(
  compositionId: string,
  cache: CompositionCache,
  ensureCached: (compositionId: string) => void
): HTMLElement {
  const preview = document.createElement('div');
  preview.className = 'lesson-editor__linked-preview';

  const cached = cache.get(compositionId);
  if (cached === undefined) {
    ensureCached(compositionId);
    const loading = document.createElement('p');
    loading.className = 'lesson-editor__linked-loading';
    loading.textContent = 'Loading composition…';
    preview.append(loading);
    return preview;
  }

  if (cached === 'missing') {
    const broken = document.createElement('p');
    broken.className = 'lesson-editor__linked-broken';
    broken.textContent = 'Linked composition is missing or unavailable.';
    preview.append(broken);
    return preview;
  }

  const title = document.createElement('p');
  title.className = 'lesson-editor__linked-title';
  title.textContent = cached.title;

  const summary = document.createElement('p');
  summary.className = 'lesson-editor__linked-summary';
  const childCount =
    cached.root.block_type === 'section' ? cached.root.content.blocks.length : 0;
  summary.textContent = `${childCount} blocks from composition`;

  preview.append(title, summary);
  return preview;
}

export async function openEditSourceModal(options: {
  compositionId: string;
  media: ReadonlyArray<Media>;
  setStatus: (text: string | null) => void;
  onSaved: (updated: CompositionTemplate) => void;
}): Promise<EditSourceModalHandle> {
  const { compositionId, media, setStatus, onSaved } = options;

  let full: CompositionTemplate;
  try {
    full = await apiGet<CompositionTemplate>(`/api/compositions/${compositionId}`);
  } catch {
    setStatus('Unable to load composition.');
    return noopModalHandle;
  }

  if (!isCompositionUsable(full)) {
    setStatus('Composition is missing or unavailable.');
    return noopModalHandle;
  }

  const working = structuredClone(full);

  const dialog = document.createElement('dialog');
  dialog.className = 'lesson-editor__composition-modal';

  const heading = document.createElement('h2');
  heading.className = 'lesson-editor__composition-modal-heading';
  heading.textContent = 'Edit composition source';

  const errorEl = document.createElement('p');
  errorEl.className = 'lesson-editor__composition-modal-error';
  errorEl.setAttribute('role', 'alert');
  errorEl.hidden = true;

  const showError = (message: string): void => {
    errorEl.hidden = false;
    errorEl.textContent = message;
  };

  const clearError = (): void => {
    errorEl.hidden = true;
    errorEl.textContent = '';
  };

  const titleField = document.createElement('div');
  titleField.className = 'lesson-editor__composition-modal-field';

  const titleInputId = `composition-edit-title-${compositionId}`;
  const titleLabel = document.createElement('label');
  titleLabel.className = 'lesson-editor__composition-modal-label';
  titleLabel.htmlFor = titleInputId;
  titleLabel.textContent = 'Title';

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.id = titleInputId;
  titleInput.className = 'lesson-editor__composition-modal-title';
  titleInput.value = working.title;
  titleInput.autocomplete = 'off';
  titleInput.addEventListener('input', () => {
    working.title = titleInput.value;
    clearError();
  });

  titleField.append(titleLabel, titleInput);

  const editorHost = document.createElement('div');
  editorHost.className = 'lesson-editor__composition-modal-editor';

  const editor = createBlockEditor(
    working.root,
    (updated) => {
      if (updated.block_type === 'section') {
        working.root = updated;
      }
    },
    () => working.root,
    { media: [...media] }
  );
  editorHost.append(editor);

  const footer = document.createElement('div');
  footer.className = 'lesson-editor__composition-modal-footer';

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'btn btn--ghost lesson-editor__composition-modal-cancel';
  cancelButton.textContent = 'Cancel';

  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.className = 'btn btn--secondary lesson-editor__composition-modal-save';
  saveButton.textContent = 'Save';

  footer.append(cancelButton, saveButton);
  dialog.append(heading, errorEl, titleField, editorHost, footer);
  document.body.append(dialog);

  let closed = false;
  const closeDialog = (): void => {
    if (closed) return;
    closed = true;
    if (dialog.open) {
      dialog.close();
    }
    dialog.remove();
  };

  cancelButton.addEventListener('click', () => {
    closeDialog();
  });

  // Escape / backdrop dismiss: let the dialog close, then remove from DOM.
  dialog.addEventListener('close', () => {
    closeDialog();
  });

  saveButton.addEventListener('click', () => {
    void (async () => {
      const title = working.title.trim();
      if (!title) {
        showError('Composition title is required.');
        return;
      }
      saveButton.disabled = true;
      cancelButton.disabled = true;
      try {
        const updated = await apiPatch<CompositionTemplate>(`/api/compositions/${compositionId}`, {
          title,
          root: working.root
        });
        closeDialog();
        onSaved(updated);
      } catch {
        showError('Unable to save composition.');
        saveButton.disabled = false;
        cancelButton.disabled = false;
      }
    })();
  });

  dialog.showModal();
  return { close: closeDialog };
}
