import type { JournalDocument } from '@/api/journal';
import type { JournalMoment } from '@/journal/types';
import { attachVisualViewportInset } from '../../design-kit/js/visual-viewport.js';
import { persistJournalPatch } from '@/journal/journal-sheet-save';
import { applySplitToJournal } from '@/journal/moment-operations';

export interface OpenSplitSheetOptions {
  tripId: string;
  journal: JournalDocument;
  version: string;
  moment: JournalMoment;
  anchor: HTMLElement;
  onSaved?: (envelope: { journal: JournalDocument; version: string }) => void;
  onClose?: () => void;
}

export function openSplitSheet(options: OpenSplitSheetOptions): { destroy(): void } {
  attachVisualViewportInset();
  let destroyed = false;
  const selected = new Set<string>();

  const back = document.createElement('div');
  back.className = 'sheet-back';
  const sheet = document.createElement('div');
  sheet.className = 'sheet addform journal-split-sheet hub-morph-dialog';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', 'Split moment');

  const heading = document.createElement('h3');
  heading.textContent = 'Split moment';

  const hint = document.createElement('p');
  hint.className = 'journal-sheet__hint';
  hint.textContent = 'Choose photos for the new moment. The rest stay in this moment.';

  const grid = document.createElement('div');
  grid.className = 'journal-split__grid';

  const status = document.createElement('p');
  status.className = 'journal-sheet__status';
  status.hidden = true;

  const form = document.createElement('form');
  form.className = 'addform__form compose';
  form.noValidate = true;
  const scroll = document.createElement('div');
  scroll.className = 'addform__scroll';
  const actions = document.createElement('div');
  actions.className = 'addform__actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn--secondary';
  cancelBtn.textContent = 'Cancel';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.className = 'btn btn--primary';
  saveBtn.textContent = 'Split';

  const mediaMap = new Map(options.journal.media.map((m) => [m.id, m]));

  function refreshSave(): void {
    const n = selected.size;
    const total = options.moment.media_ids.length;
    saveBtn.disabled = n === 0 || n >= total;
  }

  for (const id of options.moment.media_ids) {
    const media = mediaMap.get(id);
    const tile = document.createElement('label');
    tile.className = 'journal-split__tile';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.addEventListener('change', () => {
      if (input.checked) selected.add(id);
      else selected.delete(id);
      refreshSave();
    });
    const img = document.createElement('img');
    if (media) {
      img.src = media.url;
      img.alt = '';
      img.loading = 'lazy';
    }
    tile.append(input, img);
    grid.append(tile);
  }
  refreshSave();

  function finishClose(): void {
    if (destroyed) return;
    destroyed = true;
    document.removeEventListener('keydown', onKey);
    back.remove();
    options.onClose?.();
  }

  cancelBtn.addEventListener('click', () => finishClose());
  back.addEventListener('click', (ev) => {
    if (ev.target === back) finishClose();
  });
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      finishClose();
    }
  };
  document.addEventListener('keydown', onKey);

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (saveBtn.disabled) return;
    void submit();
  });

  async function submit(): Promise<void> {
    saveBtn.disabled = true;
    status.hidden = true;
    try {
      const nextJournal = applySplitToJournal(
        options.journal,
        options.moment.id,
        [...selected],
      );
      const envelope = await persistJournalPatch(options.tripId, options.version, nextJournal);
      options.onSaved?.(envelope);
      finishClose();
    } catch {
      saveBtn.disabled = false;
      status.hidden = false;
      status.textContent = 'Could not split. Check your selection.';
    }
  }

  scroll.append(hint, grid, status);
  form.append(scroll, actions);
  actions.append(cancelBtn, saveBtn);
  sheet.append(heading, form);
  back.append(sheet);
  options.anchor.append(back);
  heading.tabIndex = -1;
  heading.focus();

  return { destroy: () => finishClose() };
}
