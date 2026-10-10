import type { JournalDocument } from '@/api/journal';
import type { JournalMoment } from '@/journal/types';
import { attachVisualViewportInset } from '../../design-kit/js/visual-viewport.js';
import { persistJournalPatch } from '@/journal/journal-sheet-save';
import {
  applyReorderToJournal,
  chronologicMomentOrder,
  liveDayMoments,
} from '@/journal/moment-operations';

export interface OpenReorderSheetOptions {
  tripId: string;
  journal: JournalDocument;
  version: string;
  moment: JournalMoment;
  anchor: HTMLElement;
  onSaved?: (envelope: { journal: JournalDocument; version: string }) => void;
  onClose?: () => void;
}

export function openReorderSheet(options: OpenReorderSheetOptions): { destroy(): void } {
  attachVisualViewportInset();
  let destroyed = false;
  let orderIds = liveDayMoments(options.journal, options.moment.leg_id, options.moment.local_date).map(
    (m) => m.id,
  );

  const back = document.createElement('div');
  back.className = 'sheet-back';
  const sheet = document.createElement('div');
  sheet.className = 'sheet addform journal-reorder-sheet hub-morph-dialog';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', 'Reorder moments');

  const heading = document.createElement('h3');
  heading.textContent = 'Reorder this day';

  const hint = document.createElement('p');
  hint.className = 'journal-sheet__hint';
  hint.textContent = 'Drag or use arrows. Save writes display order for this day only.';

  const list = document.createElement('ul');
  list.className = 'journal-reorder__list';

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
  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'btn btn--ghost journal-reorder__reset';
  resetBtn.textContent = 'Reset to time order';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn--secondary';
  cancelBtn.textContent = 'Cancel';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.className = 'btn btn--primary';
  saveBtn.textContent = 'Save';

  function labelFor(id: string): string {
    const m = options.journal.moments.find((x) => x.id === id);
    if (!m) return id;
    const bits = [m.local_time, m.place?.name, m.text?.slice(0, 40)].filter(Boolean);
    return bits.join(' · ') || m.id;
  }

  function moveId(id: string, delta: number): void {
    const idx = orderIds.indexOf(id);
    const next = idx + delta;
    if (idx < 0 || next < 0 || next >= orderIds.length) return;
    const copy = [...orderIds];
    const [row] = copy.splice(idx, 1);
    copy.splice(next, 0, row!);
    orderIds = copy;
    renderList();
  }

  function renderList(): void {
    list.replaceChildren();
    for (const id of orderIds) {
      const li = document.createElement('li');
      li.className = 'journal-reorder__item';
      li.draggable = true;
      li.dataset.momentId = id;
      const label = document.createElement('span');
      label.className = 'journal-reorder__label';
      label.textContent = labelFor(id);
      const controls = document.createElement('div');
      controls.className = 'journal-reorder__controls';
      const up = document.createElement('button');
      up.type = 'button';
      up.className = 'btn btn--ghost';
      up.textContent = 'Up';
      up.disabled = orderIds[0] === id;
      up.addEventListener('click', () => moveId(id, -1));
      const down = document.createElement('button');
      down.type = 'button';
      down.className = 'btn btn--ghost';
      down.textContent = 'Down';
      down.disabled = orderIds[orderIds.length - 1] === id;
      down.addEventListener('click', () => moveId(id, 1));
      controls.append(up, down);
      li.append(label, controls);
      li.addEventListener('dragstart', (ev) => {
        ev.dataTransfer?.setData('text/plain', id);
        li.classList.add('journal-reorder__item--dragging');
      });
      li.addEventListener('dragend', () => li.classList.remove('journal-reorder__item--dragging'));
      li.addEventListener('dragover', (ev) => {
        ev.preventDefault();
      });
      li.addEventListener('drop', (ev) => {
        ev.preventDefault();
        const from = ev.dataTransfer?.getData('text/plain');
        if (!from || from === id) return;
        const fromIdx = orderIds.indexOf(from);
        const toIdx = orderIds.indexOf(id);
        if (fromIdx < 0 || toIdx < 0) return;
        const copy = [...orderIds];
        copy.splice(fromIdx, 1);
        copy.splice(toIdx, 0, from);
        orderIds = copy;
        renderList();
      });
      list.append(li);
    }
  }

  resetBtn.addEventListener('click', () => {
    const day = liveDayMoments(
      options.journal,
      options.moment.leg_id,
      options.moment.local_date,
    );
    orderIds = chronologicMomentOrder(day).map((m) => m.id);
    renderList();
  });

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
    void submit();
  });

  async function submit(): Promise<void> {
    saveBtn.disabled = true;
    status.hidden = true;
    const nextJournal = applyReorderToJournal(
      options.journal,
      options.moment.leg_id,
      options.moment.local_date,
      orderIds,
    );
    try {
      const envelope = await persistJournalPatch(options.tripId, options.version, nextJournal);
      options.onSaved?.(envelope);
      finishClose();
    } catch {
      saveBtn.disabled = false;
      status.hidden = false;
      status.textContent = 'Could not save. Try again.';
    }
  }

  renderList();
  scroll.append(hint, list, status);
  form.append(scroll, actions);
  actions.append(resetBtn, cancelBtn, saveBtn);
  sheet.append(heading, form);
  back.append(sheet);
  options.anchor.append(back);
  heading.tabIndex = -1;
  heading.focus();

  return { destroy: () => finishClose() };
}
