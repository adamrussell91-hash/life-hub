import type { JournalDocument } from '@/api/journal';
import type { JournalMoment } from '@/journal/types';
import { attachVisualViewportInset } from '../../design-kit/js/visual-viewport.js';
import { persistJournalPatch } from '@/journal/journal-sheet-save';
import { applyMergeToJournal, liveDayMoments, mergeMoments } from '@/journal/moment-operations';

export interface OpenMergeSheetOptions {
  tripId: string;
  journal: JournalDocument;
  version: string;
  moment: JournalMoment;
  anchor: HTMLElement;
  onSaved?: (envelope: { journal: JournalDocument; version: string }) => void;
  onClose?: () => void;
}

export function openMergeSheet(options: OpenMergeSheetOptions): { destroy(): void } {
  attachVisualViewportInset();
  let destroyed = false;
  const peers = liveDayMoments(
    options.journal,
    options.moment.leg_id,
    options.moment.local_date,
  ).filter((m) => m.id !== options.moment.id);
  let partnerId = peers[0]?.id ?? '';
  let locationFrom = options.moment.id;

  const back = document.createElement('div');
  back.className = 'sheet-back';
  const sheet = document.createElement('div');
  sheet.className = 'sheet addform journal-merge-sheet hub-morph-dialog';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', 'Merge moments');

  const heading = document.createElement('h3');
  heading.textContent = 'Merge moments';

  const hint = document.createElement('p');
  hint.className = 'journal-sheet__hint';
  hint.textContent = 'Combine reflections and photos. Choose which location to keep.';

  const partnerField = document.createElement('label');
  partnerField.className = 'journal-sheet__field';
  const partnerLabel = document.createElement('span');
  partnerLabel.textContent = 'Merge with';
  const partnerSelect = document.createElement('select');
  for (const p of peers) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = [p.local_time, p.place?.name, p.text?.slice(0, 36)].filter(Boolean).join(' · ') || p.id;
    partnerSelect.append(opt);
  }
  partnerField.append(partnerLabel, partnerSelect);

  const locationField = document.createElement('div');
  locationField.className = 'journal-sheet__field';
  const locationLabel = document.createElement('span');
  locationLabel.textContent = 'Keep location from';
  const locationPick = document.createElement('div');
  locationPick.className = 'journal-merge__location';

  const preview = document.createElement('pre');
  preview.className = 'journal-merge__preview';

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
  saveBtn.textContent = 'Merge';

  function refreshLocationRadios(): void {
    locationPick.replaceChildren();
    const partner = options.journal.moments.find((m) => m.id === partnerId);
    if (!partner) return;
    for (const m of [options.moment, partner]) {
      const wrap = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'merge-location';
      input.value = m.id;
      input.checked = locationFrom === m.id;
      input.addEventListener('change', () => {
        if (input.checked) locationFrom = m.id;
        refreshPreview();
      });
      wrap.append(input, document.createTextNode(m.place?.name ?? 'No location'));
      locationPick.append(wrap);
    }
  }

  function refreshPreview(): void {
    const partner = options.journal.moments.find((m) => m.id === partnerId);
    if (!partner) {
      preview.textContent = '';
      return;
    }
    const merged = mergeMoments([options.moment, partner], {
      locationFromMomentId: locationFrom,
    });
    preview.textContent = [
      `Photos (${merged.media_ids.length}): ${merged.media_ids.join(', ')}`,
      merged.text ? `Reflection:\n${merged.text}` : 'No reflection text',
      merged.place ? `Location: ${merged.place.name}` : 'No location',
    ].join('\n\n');
  }

  partnerSelect.addEventListener('change', () => {
    partnerId = partnerSelect.value;
    locationFrom = options.moment.id;
    refreshLocationRadios();
    refreshPreview();
  });

  refreshLocationRadios();
  refreshPreview();

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
    try {
      const nextJournal = applyMergeToJournal(
        options.journal,
        [options.moment.id, partnerId],
        { locationFromMomentId: locationFrom },
      );
      const envelope = await persistJournalPatch(options.tripId, options.version, nextJournal);
      options.onSaved?.(envelope);
      finishClose();
    } catch {
      saveBtn.disabled = false;
      status.hidden = false;
      status.textContent = 'Could not merge. Try again.';
    }
  }

  locationField.append(locationLabel, locationPick);
  scroll.append(hint, partnerField, locationField, preview, status);
  form.append(scroll, actions);
  actions.append(cancelBtn, saveBtn);
  sheet.append(heading, form);
  back.append(sheet);
  options.anchor.append(back);
  heading.tabIndex = -1;
  heading.focus();

  return { destroy: () => finishClose() };
}
