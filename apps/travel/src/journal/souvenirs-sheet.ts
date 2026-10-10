import type { JournalDocument } from '@/api/journal';
import { persistJournalPatch } from '@/journal/journal-sheet-save';
import type { JournalMoment } from '@/journal/types';
import {
  SOUVENIR_MOMENT_DELETE_RULE,
  defaultJournalSouvenir,
  formatSouvenirListLabel,
  listLiveSouvenirs,
  softDeleteJournalSouvenir,
  upsertJournalSouvenir,
} from '@/journal/souvenirs';
import { attachVisualViewportInset } from '../../design-kit/js/visual-viewport.js';

export interface OpenSouvenirsCollectionOptions {
  tripId: string;
  journal: JournalDocument;
  version: string;
  anchor: HTMLElement;
  onSaved?: (envelope: { journal: JournalDocument; version: string }) => void;
  onClose?: () => void;
  onJumpToMoment?: (momentId: string) => void;
}

export interface OpenAddSouvenirSheetOptions {
  tripId: string;
  journal: JournalDocument;
  version: string;
  anchor: HTMLElement;
  moment?: JournalMoment;
  onSaved?: (envelope: { journal: JournalDocument; version: string }) => void;
  onClose?: () => void;
}

function isFixtureVersion(version: string): boolean {
  return version === 'fixture';
}

export function openAddSouvenirSheet(options: OpenAddSouvenirSheetOptions): { destroy(): void } {
  attachVisualViewportInset();
  let destroyed = false;
  let title = '';
  let note = '';

  const back = document.createElement('div');
  back.className = 'sheet-back';
  const sheet = document.createElement('div');
  sheet.className = 'sheet addform journal-souvenir-sheet hub-morph-dialog';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', 'Add souvenir');

  const heading = document.createElement('h3');
  heading.textContent = 'Add souvenir';

  const rule = document.createElement('p');
  rule.className = 'journal-sheet__hint';
  rule.textContent = SOUVENIR_MOMENT_DELETE_RULE;

  const form = document.createElement('form');
  form.className = 'addform__form compose';
  form.noValidate = true;
  const scroll = document.createElement('div');
  scroll.className = 'addform__scroll';

  if (options.moment) {
    const linkHint = document.createElement('p');
    linkHint.className = 'journal-sheet__hint';
    const place = options.moment.place?.name?.trim();
    linkHint.textContent = place
      ? `Linked to moment at ${place}.`
      : 'Linked to this journal moment.';
    scroll.append(linkHint);
  }

  const titleLabel = document.createElement('label');
  titleLabel.textContent = 'Name';
  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.required = true;
  titleInput.autocomplete = 'off';
  titleInput.placeholder = 'Ticket stub, magnet, …';
  titleLabel.append(titleInput);

  const noteLabel = document.createElement('label');
  noteLabel.textContent = 'Note (optional)';
  const noteArea = document.createElement('textarea');
  noteArea.rows = 3;
  noteArea.placeholder = 'Where you got it, who it is for, …';
  noteLabel.append(noteArea);

  scroll.append(titleLabel, noteLabel);

  const actions = document.createElement('div');
  actions.className = 'addform__actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn--secondary';
  cancelBtn.textContent = 'Cancel';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.className = 'btn btn--primary';
  saveBtn.textContent = 'Save';

  actions.append(cancelBtn, saveBtn);
  form.append(scroll, actions);
  sheet.append(heading, rule, form);
  back.append(sheet);
  options.anchor.append(back);

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    back.remove();
    options.onClose?.();
  }

  cancelBtn.addEventListener('click', destroy);
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    title = titleInput.value.trim();
    if (!title) {
      titleInput.focus();
      return;
    }
    note = noteArea.value.trim();
    const souvenir = defaultJournalSouvenir({
      title,
      note: note || undefined,
      moment_id: options.moment?.id,
      media_id: options.moment?.media_ids[0],
    });
    const next = upsertJournalSouvenir(options.journal, souvenir);
    if (isFixtureVersion(options.version)) {
      options.onSaved?.({ journal: next, version: options.version });
      destroy();
      return;
    }
    void persistJournalPatch(options.tripId, options.version, next).then((saved) => {
      options.onSaved?.(saved);
      destroy();
    });
  });

  titleInput.focus();
  return { destroy };
}

export function openSouvenirsCollection(
  options: OpenSouvenirsCollectionOptions,
): { destroy(): void } {
  let journal = options.journal;
  let version = options.version;
  let addOverlay: { destroy(): void } | null = null;

  const backdrop = document.createElement('div');
  backdrop.className = 'journal-chapter-backdrop journal-souvenirs-backdrop';
  backdrop.setAttribute('role', 'presentation');

  const panel = document.createElement('div');
  panel.className = 'journal-chapter journal-souvenirs';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Souvenir collection');

  const head = document.createElement('div');
  head.className = 'journal-chapter__head';
  const title = document.createElement('h2');
  title.className = 'journal-souvenirs__title';
  title.textContent = 'Souvenirs';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn btn--ghost journal-chapter__close';
  closeBtn.textContent = 'Close';
  head.append(title, closeBtn);

  const rule = document.createElement('p');
  rule.className = 'journal-sheet__hint journal-souvenirs__rule';
  rule.textContent = SOUVENIR_MOMENT_DELETE_RULE;

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn--secondary journal-souvenirs__add';
  addBtn.textContent = 'Add souvenir';

  const list = document.createElement('ul');
  list.className = 'hub-list journal-souvenirs__list';
  list.setAttribute('data-hub-list', '');

  function onSaved(envelope: { journal: JournalDocument; version: string }): void {
    journal = envelope.journal;
    version = envelope.version;
    options.onSaved?.(envelope);
    renderList();
  }

  function renderList(): void {
    list.replaceChildren();
    const rows = listLiveSouvenirs(journal);
    if (rows.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'journal-chapter__empty';
      empty.textContent = 'No souvenirs yet — add tickets, keepsakes, and small objects you picked up.';
      list.append(empty);
      return;
    }
    for (const row of rows) {
      const li = document.createElement('li');
      li.className = 'hub-list-item journal-souvenirs__item';
      const rowBtn = document.createElement('button');
      rowBtn.type = 'button';
      rowBtn.className = 'journal-souvenirs__row';
      const primary = document.createElement('span');
      primary.className = 'journal-souvenirs__row-title';
      primary.textContent = row.title;
      const meta = document.createElement('span');
      meta.className = 'journal-souvenirs__row-meta';
      meta.textContent = formatSouvenirListLabel(journal, row);
      rowBtn.append(primary, meta);
      if (row.moment_id && options.onJumpToMoment) {
        rowBtn.addEventListener('click', () => {
          options.onJumpToMoment?.(row.moment_id!);
          destroy();
        });
      }
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn btn--ghost journal-souvenirs__remove';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => {
        const next = softDeleteJournalSouvenir(journal, row.id);
        if (isFixtureVersion(version)) {
          onSaved({ journal: next, version });
          return;
        }
        void persistJournalPatch(options.tripId, version, next).then(onSaved);
      });
      li.append(rowBtn, removeBtn);
      list.append(li);
    }
  }

  addBtn.addEventListener('click', () => {
    addOverlay?.destroy();
    addOverlay = openAddSouvenirSheet({
      tripId: options.tripId,
      journal,
      version,
      anchor: options.anchor,
      onSaved,
      onClose: () => {
        addOverlay = null;
      },
    });
  });

  renderList();
  panel.append(head, rule, addBtn, list);
  backdrop.append(panel);
  options.anchor.append(backdrop);

  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') destroy();
  };
  document.addEventListener('keydown', onKey);
  closeBtn.addEventListener('click', () => destroy());
  backdrop.addEventListener('click', (ev) => {
    if (ev.target === backdrop) destroy();
  });

  function destroy(): void {
    document.removeEventListener('keydown', onKey);
    addOverlay?.destroy();
    backdrop.remove();
    options.onClose?.();
  }

  return { destroy };
}
