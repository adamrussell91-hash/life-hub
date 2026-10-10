import type { JournalDocument } from '@/api/journal';
import type { JournalMoment } from '@/journal/types';
import { attachVisualViewportInset } from '../../design-kit/js/visual-viewport.js';
import { persistJournalPatch } from '@/journal/journal-sheet-save';
import { applyMoveToJournal, moveMoment, type TimezoneMoveMode } from '@/journal/moment-operations';

export interface OpenMoveSheetOptions {
  tripId: string;
  journal: JournalDocument;
  version: string;
  moment: JournalMoment;
  anchor: HTMLElement;
  onSaved?: (envelope: { journal: JournalDocument; version: string }) => void;
  onClose?: () => void;
}

export function openMoveSheet(options: OpenMoveSheetOptions): { destroy(): void } {
  attachVisualViewportInset();
  let destroyed = false;
  const liveLegs = options.journal.legs
    .filter((l) => l.lifecycle === 'live')
    .sort((a, b) => a.order - b.order);
  let legId = options.moment.leg_id;
  let localDate = options.moment.local_date;
  let timezoneMode: TimezoneMoveMode = 'keep_wall_clock';

  const back = document.createElement('div');
  back.className = 'sheet-back';
  const sheet = document.createElement('div');
  sheet.className = 'sheet addform journal-move-sheet hub-morph-dialog';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', 'Move moment');

  const heading = document.createElement('h3');
  heading.textContent = 'Move moment';

  const hint = document.createElement('p');
  hint.className = 'journal-sheet__hint';
  hint.textContent = 'Pick leg and day. Preview shows local time after the move.';

  const legField = document.createElement('label');
  legField.className = 'journal-sheet__field';
  const legLabel = document.createElement('span');
  legLabel.textContent = 'Leg';
  const legSelect = document.createElement('select');
  for (const leg of liveLegs) {
    const opt = document.createElement('option');
    opt.value = leg.id;
    opt.textContent = leg.destination;
    legSelect.append(opt);
  }
  legField.append(legLabel, legSelect);

  const dayField = document.createElement('label');
  dayField.className = 'journal-sheet__field';
  const dayLabel = document.createElement('span');
  dayLabel.textContent = 'Day';
  const daySelect = document.createElement('select');
  dayField.append(dayLabel, daySelect);

  const tzField = document.createElement('div');
  tzField.className = 'journal-sheet__field';
  const tzLabel = document.createElement('span');
  tzLabel.textContent = 'Timezone';
  const tzPick = document.createElement('div');
  tzPick.className = 'journal-move__tz';
  for (const mode of ['keep_wall_clock', 'preserve_instant'] as TimezoneMoveMode[]) {
    const wrap = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'move-tz';
    input.value = mode;
    input.checked = timezoneMode === mode;
    input.addEventListener('change', () => {
      if (input.checked) {
        timezoneMode = mode;
        refreshPreview();
      }
    });
    const text =
      mode === 'keep_wall_clock'
        ? 'Keep wall-clock time on the new day'
        : 'Preserve instant when timezones differ';
    wrap.append(input, document.createTextNode(text));
    tzPick.append(wrap);
  }
  tzField.append(tzLabel, tzPick);

  const preview = document.createElement('p');
  preview.className = 'journal-move__preview';

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
  saveBtn.textContent = 'Move';

  function daysForLeg(id: string): string[] {
    return options.journal.days
      .filter((d) => d.lifecycle === 'live' && d.leg_id === id)
      .map((d) => d.local_date)
      .sort();
  }

  function refreshDayOptions(): void {
    const days = daysForLeg(legId);
    daySelect.replaceChildren();
    for (const d of days) {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = d;
      daySelect.append(opt);
    }
    if (!days.includes(localDate)) localDate = days[0] ?? localDate;
    daySelect.value = localDate;
  }

  function refreshPreview(): void {
    const { moment: previewMoment, previewLocalTime } = moveMoment(
      options.moment,
      { legId, localDate, timezoneMode },
      options.journal.legs,
    );
    const leg = liveLegs.find((l) => l.id === legId);
    const bits = [`${leg?.destination ?? 'Leg'} · ${previewMoment.local_date}`];
    if (previewLocalTime) bits.push(`Local time: ${previewLocalTime}`);
    else if (options.moment.local_time) bits.push('No time on this moment');
    preview.textContent = bits.join(' — ');
  }

  legSelect.value = legId;
  legSelect.addEventListener('change', () => {
    legId = legSelect.value;
    refreshDayOptions();
    refreshPreview();
  });
  daySelect.addEventListener('change', () => {
    localDate = daySelect.value;
    refreshPreview();
  });

  refreshDayOptions();
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
      const nextJournal = applyMoveToJournal(options.journal, options.moment.id, {
        legId,
        localDate,
        timezoneMode,
      });
      const envelope = await persistJournalPatch(options.tripId, options.version, nextJournal);
      options.onSaved?.(envelope);
      finishClose();
    } catch {
      saveBtn.disabled = false;
      status.hidden = false;
      status.textContent = 'Could not move. Try again.';
    }
  }

  scroll.append(hint, legField, dayField, tzField, preview, status);
  form.append(scroll, actions);
  actions.append(cancelBtn, saveBtn);
  sheet.append(heading, form);
  back.append(sheet);
  options.anchor.append(back);
  heading.tabIndex = -1;
  heading.focus();

  return { destroy: () => finishClose() };
}
