import type { JournalDocument } from '@/api/journal';
import { attachVisualViewportInset } from '../../design-kit/js/visual-viewport.js';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { presentJournalOverlay, type JournalOverlayHandle } from '@/journal/overlay-host';
import {
  applyPermanentDelete,
  applyRestore,
  commitJournalDelete,
  PERMANENT_DELETE_EXPLAINER,
  type DeleteTarget,
} from '@/journal/delete-flow';

export interface TrashRow {
  target: DeleteTarget;
  label: string;
  detail: string;
}

export function listTrashRows(journal: JournalDocument): TrashRow[] {
  const rows: TrashRow[] = [];
  for (const moment of journal.moments.filter((m) => m.lifecycle === 'deleted')) {
    const snippet = moment.text?.trim().replace(/\s+/g, ' ');
    const photos = moment.media_ids.length;
    rows.push({
      target: { kind: 'moment', id: moment.id },
      label:
        moment.place?.name ??
        (snippet ? (snippet.length > 60 ? `${snippet.slice(0, 59)}…` : snippet) : null) ??
        (photos ? `${photos} photo${photos === 1 ? '' : 's'}` : 'Moment'),
      detail: formatDisplayDate(moment.local_date),
    });
  }
  for (const day of journal.days.filter((d) => d.lifecycle === 'deleted')) {
    rows.push({
      target: { kind: 'day', id: day.id },
      label: `Day ${formatDisplayDate(day.local_date)}`,
      detail: 'Day section',
    });
  }
  for (const leg of journal.legs.filter((l) => l.lifecycle === 'deleted')) {
    rows.push({
      target: { kind: 'leg', id: leg.id },
      label: leg.destination,
      detail: 'Leg',
    });
  }
  if (journal.lifecycle === 'deleted') {
    rows.push({
      target: { kind: 'trip', id: journal.trip_id },
      label: journal.title.trim() || 'Trip journal',
      detail: 'Entire journal',
    });
  }
  return rows;
}

export interface OpenTrashViewOptions {
  tripId: string;
  journal: JournalDocument;
  version: string;
  anchor: HTMLElement;
  onSaved: (envelope: { journal: JournalDocument; version: string }) => void;
  onClose?: () => void;
}

export function openTrashView(options: OpenTrashViewOptions): { destroy(): void } {
  attachVisualViewportInset();
  let destroyed = false;
  let overlay: JournalOverlayHandle | null = null;
  let journal = options.journal;
  let version = options.version;

  const back = document.createElement('div');
  back.className = 'sheet-back';
  const sheet = document.createElement('div');
  sheet.className = 'sheet addform journal-trash-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', 'Journal trash');

  const heading = document.createElement('h3');
  heading.textContent = 'Trash';

  const hint = document.createElement('p');
  hint.className = 'journal-sheet__hint';
  hint.textContent =
    'Restore brings items back to your story. Permanent delete removes them and may erase stored originals.';

  const list = document.createElement('div');
  list.className = 'journal-trash__list';

  const status = document.createElement('p');
  status.className = 'journal-sheet__status';
  status.hidden = true;

  const form = document.createElement('form');
  form.className = 'addform__form compose';
  const scroll = document.createElement('div');
  scroll.className = 'addform__scroll';
  const actions = document.createElement('div');
  actions.className = 'addform__actions';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn btn--secondary';
  closeBtn.textContent = 'Close';

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    overlay?.release();
    options.onClose?.();
  }

  let busy = false;
  async function runRowAction(next: () => JournalDocument, failure: string): Promise<void> {
    if (busy) return;
    busy = true;
    status.hidden = true;
    list.setAttribute('aria-busy', 'true');
    try {
      const saved = await commitJournalDelete(options.tripId, version, next());
      journal = saved.journal;
      version = saved.version;
      options.onSaved(saved);
      paint();
    } catch {
      status.hidden = false;
      status.textContent = failure;
    } finally {
      busy = false;
      list.removeAttribute('aria-busy');
    }
  }

  function paint(): void {
    list.replaceChildren();
    const rows = listTrashRows(journal);
    if (rows.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'journal-trash__empty';
      empty.textContent = 'Trash is empty.';
      list.append(empty);
      return;
    }
    for (const row of rows) {
      const card = document.createElement('div');
      card.className = 'journal-trash__card';
      const title = document.createElement('p');
      title.className = 'journal-trash__title';
      title.textContent = row.label;
      const meta = document.createElement('p');
      meta.className = 'journal-trash__meta';
      meta.textContent = row.detail;
      const rowActions = document.createElement('div');
      rowActions.className = 'journal-trash__actions';
      const restoreBtn = document.createElement('button');
      restoreBtn.type = 'button';
      restoreBtn.className = 'btn btn--secondary';
      restoreBtn.textContent = 'Restore';
      restoreBtn.addEventListener('click', () => {
        void runRowAction(() => applyRestore(journal, row.target), 'Could not restore. Try again.');
      });
      const purgeBtn = document.createElement('button');
      purgeBtn.type = 'button';
      purgeBtn.className = 'btn btn--danger';
      purgeBtn.textContent = 'Delete permanently';
      purgeBtn.title = PERMANENT_DELETE_EXPLAINER;
      // Confirm inside the card: a browser confirm() looks foreign on a phone
      // and some Home Screen apps block it.
      const confirmRow = document.createElement('div');
      confirmRow.className = 'journal-trash__confirm confirm-card';
      confirmRow.hidden = true;
      const confirmText = document.createElement('p');
      confirmText.textContent = `${PERMANENT_DELETE_EXPLAINER} Delete “${row.label}” permanently?`;
      const confirmActions = document.createElement('div');
      confirmActions.className = 'confirm-card__actions';
      const keepBtn = document.createElement('button');
      keepBtn.type = 'button';
      keepBtn.className = 'btn btn--secondary';
      keepBtn.textContent = 'Keep';
      const forgetBtn = document.createElement('button');
      forgetBtn.type = 'button';
      forgetBtn.className = 'btn btn--danger';
      forgetBtn.textContent = 'Delete forever';
      confirmActions.append(keepBtn, forgetBtn);
      confirmRow.append(confirmText, confirmActions);
      purgeBtn.addEventListener('click', () => {
        rowActions.hidden = true;
        confirmRow.hidden = false;
      });
      keepBtn.addEventListener('click', () => {
        confirmRow.hidden = true;
        rowActions.hidden = false;
      });
      forgetBtn.addEventListener('click', () => {
        void runRowAction(
          () => applyPermanentDelete(journal, row.target).journal,
          'Could not delete permanently. Try again.',
        );
      });
      rowActions.append(restoreBtn, purgeBtn);
      card.append(title, meta, rowActions, confirmRow);
      list.append(card);
    }
  }

  closeBtn.addEventListener('click', destroy);
  actions.append(closeBtn);
  scroll.append(heading, hint, list, status);
  form.append(scroll, actions);
  sheet.append(form);
  back.append(sheet);
  overlay = presentJournalOverlay(back, {
    anchor: options.anchor,
    dismiss: destroy,
    initialFocus: closeBtn,
  });
  paint();

  return { destroy };
}
