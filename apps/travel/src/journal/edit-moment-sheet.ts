import type { JournalDocument } from '@/api/journal';
import { persistJournalPatch } from '@/journal/journal-sheet-save';
import { searchPlaces } from '@/api/travel';
import type { JournalCoordinates, JournalMoment, JournalPlace } from '@/journal/types';
import { openPinEditor } from '@/journal/pin-editor';
import { attachVisualViewportInset } from '../../design-kit/js/visual-viewport.js';

export interface OpenEditMomentSheetOptions {
  tripId: string;
  journal: JournalDocument;
  version: string;
  moment: JournalMoment;
  anchor: HTMLElement;
  onSaved?: (envelope: { journal: JournalDocument; version: string }) => void;
  onClose?: () => void;
}

export function patchMomentInJournal(
  journal: JournalDocument,
  momentId: string,
  patch: Partial<JournalMoment>,
): JournalDocument {
  return {
    ...journal,
    revision: journal.revision + 1,
    moments: journal.moments.map((m) => (m.id === momentId ? { ...m, ...patch } : m)),
  };
}

function isFixtureVersion(version: string): boolean {
  return version === 'fixture';
}

export function openEditMomentSheet(options: OpenEditMomentSheetOptions): { destroy(): void } {
  attachVisualViewportInset();

  const moment = options.moment;
  let text = moment.text ?? '';
  let localDate = moment.local_date;
  let localTime = moment.local_time ?? '';
  let placeName = moment.place?.name ?? '';
  let coordinates: JournalCoordinates | undefined = moment.coordinates
    ? { ...moment.coordinates }
    : undefined;
  let pendingPin: JournalCoordinates | undefined;
  let dirty = false;
  let destroyed = false;
  let pinOverlay: { destroy(): void } | null = null;

  const back = document.createElement('div');
  back.className = 'sheet-back';
  const sheet = document.createElement('div');
  sheet.className = 'sheet addform journal-edit-moment-sheet hub-morph-dialog';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', 'Edit moment');

  const heading = document.createElement('h3');
  heading.textContent = 'Edit moment';

  const leg = options.journal.legs.find((l) => l.id === moment.leg_id);
  const legDayReadonly = document.createElement('span');
  legDayReadonly.className = 'journal-edit-moment__leg-day';
  legDayReadonly.textContent = `${leg?.destination ?? 'Trip'} · ${localDate}`;

  const form = document.createElement('form');
  form.className = 'addform__form compose';
  form.noValidate = true;

  const scroll = document.createElement('div');
  scroll.className = 'addform__scroll';

  const photosNote = document.createElement('p');
  photosNote.className = 'journal-edit-moment__section-hint';
  photosNote.textContent =
    moment.media_ids.length > 0
      ? `${moment.media_ids.length} photo${moment.media_ids.length === 1 ? '' : 's'} attached — reorder and crop in a later update.`
      : 'Text-only moment — no photos attached.';

  const textArea = document.createElement('textarea');
  textArea.className = 'journal-edit-moment__text';
  textArea.rows = 6;
  textArea.placeholder = 'Reflection';
  textArea.value = text;

  const audioNote = document.createElement('p');
  audioNote.className = 'journal-edit-moment__section-hint';
  audioNote.textContent = 'Voice notes — editing attachments comes in a later update.';

  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.value = localDate;
  const timeInput = document.createElement('input');
  timeInput.type = 'time';
  timeInput.value = localTime;

  const placeSearch = document.createElement('input');
  placeSearch.type = 'text';
  placeSearch.placeholder = 'Search a place…';
  placeSearch.value = placeName;
  const suggestions = document.createElement('div');
  suggestions.className = 'journal-edit-moment__suggestions';
  const placeActions = document.createElement('div');
  placeActions.className = 'journal-edit-moment__place-actions';
  const mapBtn = document.createElement('button');
  mapBtn.type = 'button';
  mapBtn.className = 'btn btn--secondary';
  mapBtn.textContent = 'Choose on map';
  const removePlaceBtn = document.createElement('button');
  removePlaceBtn.type = 'button';
  removePlaceBtn.className = 'btn btn--ghost';
  removePlaceBtn.textContent = 'Remove location';
  placeActions.append(mapBtn, removePlaceBtn);

  const placeSummary = document.createElement('p');
  placeSummary.className = 'journal-edit-moment__place-summary';
  placeSummary.hidden = true;

  const advanced = document.createElement('details');
  advanced.className = 'journal-edit-moment__advanced';
  const advancedSummary = document.createElement('summary');
  advancedSummary.textContent = 'Crop and metadata';
  const advancedBody = document.createElement('p');
  advancedBody.className = 'journal-edit-moment__section-hint';
  advancedBody.textContent = 'EXIF and crop controls stay in advanced editing — not shown here.';
  advanced.append(advancedSummary, advancedBody);

  const status = document.createElement('p');
  status.className = 'journal-edit-moment__status';
  status.hidden = true;

  scroll.append(
    photosNote,
    field('Writing', textArea),
    audioNote,
    field('Date', dateInput),
    field('Time (optional)', timeInput),
    field('Leg and day', legDayReadonly),
    field('Place', placeSearch),
    suggestions,
    placeActions,
    placeSummary,
    advanced,
    status,
  );

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

  function field(labelText: string, control: HTMLElement): HTMLElement {
    const wrap = document.createElement('label');
    wrap.className = 'journal-edit-moment__field';
    const label = document.createElement('span');
    label.textContent = labelText;
    wrap.append(label, control);
    return wrap;
  }

  function refreshPlaceSummary(): void {
    const hasPlace = placeName.trim() || coordinates;
    if (!hasPlace) {
      placeSummary.hidden = true;
      return;
    }
    placeSummary.hidden = false;
    const parts: string[] = [];
    if (placeName.trim()) parts.push(placeName.trim());
    if (coordinates) {
      parts.push(`${coordinates.lat.toFixed(4)}, ${coordinates.lon.toFixed(4)}`);
    }
    placeSummary.textContent = parts.join(' · ');
    removePlaceBtn.disabled = !coordinates && !placeName.trim();
  }

  function markDirty(): void {
    dirty = true;
  }

  refreshPlaceSummary();

  textArea.addEventListener('input', () => {
    text = textArea.value;
    markDirty();
  });
  dateInput.addEventListener('change', () => {
    localDate = dateInput.value;
    markDirty();
  });
  timeInput.addEventListener('change', () => {
    localTime = timeInput.value;
    markDirty();
  });
  placeSearch.addEventListener('input', () => {
    placeName = placeSearch.value;
    markDirty();
    refreshPlaceSummary();
  });

  let debounce: ReturnType<typeof setTimeout> | null = null;
  placeSearch.addEventListener('input', () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(async () => {
      const q = placeSearch.value.trim();
      suggestions.replaceChildren();
      if (!q) return;
      try {
        const bias = coordinates ?? moment.coordinates;
        const { places } = await searchPlaces(q, bias?.lat, bias?.lon);
        for (const place of places.slice(0, 6)) {
          const chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'journal-edit-moment__suggestion';
          chip.textContent = place.name;
          chip.addEventListener('click', () => {
            placeName = place.name;
            placeSearch.value = place.name;
            coordinates = { lat: place.lat, lon: place.lon };
            pendingPin = undefined;
            markDirty();
            refreshPlaceSummary();
            suggestions.replaceChildren();
          });
          suggestions.append(chip);
        }
      } catch {
        const note = document.createElement('p');
        note.className = 'journal-edit-moment__section-hint';
        note.textContent = 'Search is unavailable. Choose on map instead.';
        suggestions.append(note);
      }
    }, 400);
  });

  mapBtn.addEventListener('click', () => {
    pinOverlay?.destroy();
    pinOverlay = openPinEditor({
      initial: pendingPin ?? coordinates ?? moment.coordinates,
      anchor: options.anchor,
      onCommit: (result) => {
        pinOverlay = null;
        pendingPin = result.coordinates;
        coordinates = { ...result.coordinates };
        if (!placeName.trim() && result.label) placeName = result.label;
        placeSearch.value = placeName;
        markDirty();
        refreshPlaceSummary();
      },
      onCancel: () => {
        pinOverlay = null;
      },
    });
  });

  removePlaceBtn.addEventListener('click', () => {
    placeName = '';
    placeSearch.value = '';
    coordinates = undefined;
    pendingPin = undefined;
    markDirty();
    refreshPlaceSummary();
  });

  function finishClose(): void {
    if (destroyed) return;
    destroyed = true;
    pinOverlay?.destroy();
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

    const place: JournalPlace | undefined = placeName.trim()
      ? { name: placeName.trim() }
      : coordinates
        ? { name: 'Dropped pin' }
        : undefined;

    const patch: Partial<JournalMoment> = {
      text: text.trim() || undefined,
      local_date: localDate,
      local_time: localTime.trim() || undefined,
      place,
      coordinates,
      location_source: coordinates ? 'manual' : undefined,
    };

    const nextJournal = patchMomentInJournal(options.journal, moment.id, patch);

    if (isFixtureVersion(options.version)) {
      options.onSaved?.({ journal: nextJournal, version: options.version });
      finishClose();
      return;
    }

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

  form.append(scroll, actions);
  actions.append(cancelBtn, saveBtn);
  sheet.append(heading, form);
  back.append(sheet);
  options.anchor.append(back);

  heading.tabIndex = -1;
  heading.focus();

  return {
    destroy() {
      finishClose();
    },
  };
}
