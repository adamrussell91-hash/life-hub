import type { JournalDocument } from '@/api/journal';
import type { JournalMoment } from '@/journal/types';
import { attachVisualViewportInset } from '../../design-kit/js/visual-viewport.js';
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
  const impact = deleteImpactSummary(options.journal, options.target);
  const copy = impactConfirmCopy(options.target, impact);

  const back = document.createElement('div');
  back.className = 'sheet-back';
  const sheet = document.createElement('div');
  sheet.className = 'sheet addform journal-delete-sheet hub-morph-dialog';
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
    back.remove();
    sheet.remove();
    options.onClose?.();
  }

  cancelBtn.addEventListener('click', destroy);
  back.addEventListener('click', destroy);
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    void (async () => {
      const next = applySoftDelete(options.journal, options.target);
      const saved = await commitJournalDelete(options.tripId, options.version, next);
      options.onSaved(saved);
      destroy();
    })();
  });

  actions.append(cancelBtn, confirmBtn);
  scroll.append(heading, body);
  form.append(scroll, actions);
  sheet.append(form);
  options.anchor.append(back, sheet);

  return { destroy };
}
