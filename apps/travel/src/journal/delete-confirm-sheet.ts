import type { JournalDocument } from '@/api/journal';
import type { JournalMoment } from '@/journal/types';
import { attachVisualViewportInset } from '../../design-kit/js/visual-viewport.js';
import { presentJournalOverlay, type JournalOverlayHandle } from '@/journal/overlay-host';
import {
  applySoftDelete,
  commitJournalDelete,
  deleteImpactSummary,
  impactConfirmCopy,
  runMomentDeleteWithUndo,
  type DeleteTarget,
} from '@/journal/delete-flow';

export interface OpenDeleteConfirmOptions {
  tripId: string;
  journal: JournalDocument;
  version: string;
  target: DeleteTarget;
  anchor: HTMLElement;
  moment?: JournalMoment;
  onSaved: (envelope: { journal: JournalDocument; version: string }) => void;
  onClose?: () => void;
}

export function openDeleteConfirmSheet(options: OpenDeleteConfirmOptions): { destroy(): void } {
  if (options.target.kind === 'moment' && options.moment) {
    const label = options.moment.place?.name?.trim() || 'Moment';
    runMomentDeleteWithUndo({
      tripId: options.tripId,
      version: options.version,
      journal: options.journal,
      momentId: options.moment.id,
      momentLabel: label,
      onSaved: (envelope) => {
        options.onSaved(envelope);
        options.onClose?.();
      },
    });
    return { destroy: () => options.onClose?.() };
  }

  attachVisualViewportInset();
  let destroyed = false;
  let overlay: JournalOverlayHandle | null = null;
  const impact = deleteImpactSummary(options.journal, options.target);
  const copy = impactConfirmCopy(options.target, impact);

  const back = document.createElement('div');
  back.className = 'sheet-back';
  const sheet = document.createElement('div');
  sheet.className = 'sheet addform journal-delete-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', 'Confirm delete');

  const heading = document.createElement('h3');
  heading.textContent = 'Delete from journal?';

  const body = document.createElement('p');
  body.className = 'journal-sheet__hint';
  body.textContent = copy;

  const form = document.createElement('form');
  form.className = 'addform__form compose';
  const scroll = document.createElement('div');
  scroll.className = 'addform__scroll';
  const actions = document.createElement('div');
  actions.className = 'addform__actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn--secondary';
  cancelBtn.textContent = 'Cancel';
  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'submit';
  confirmBtn.className = 'btn btn--danger';
  confirmBtn.textContent = 'Delete';

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    overlay?.release();
    options.onClose?.();
  }

  cancelBtn.addEventListener('click', destroy);
  const status = document.createElement('p');
  status.className = 'journal-sheet__status';
  status.setAttribute('role', 'alert');
  status.hidden = true;
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (confirmBtn.disabled) return;
    confirmBtn.disabled = true;
    status.hidden = true;
    void (async () => {
      try {
        const next = applySoftDelete(options.journal, options.target);
        const saved = await commitJournalDelete(options.tripId, options.version, next);
        options.onSaved(saved);
        destroy();
      } catch {
        confirmBtn.disabled = false;
        status.hidden = false;
        status.textContent = 'Could not delete. Check your connection and try again.';
      }
    })();
  });

  actions.append(cancelBtn, confirmBtn);
  scroll.append(heading, body, status);
  form.append(scroll, actions);
  sheet.append(form);
  back.append(sheet);
  overlay = presentJournalOverlay(back, {
    anchor: options.anchor,
    dismiss: destroy,
    initialFocus: cancelBtn,
  });

  return { destroy };
}
