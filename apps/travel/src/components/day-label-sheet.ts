import type { Trip } from '@/types';
import { patchTrip } from '@/api/travel';
import { upsertDayMeta } from '@/lib/day-meta';
import { formatWeekdayDate } from '@/lib/date-label';
import { travelDayCue } from '@/model/day';

export interface DayLabelSheetOptions {
  trip: Trip;
  tripId: string;
  version: string;
  cityId: string;
  date: string;
  onSaved: (trip: Trip, version: string) => void;
  onClose: () => void;
}

/** Edit the short caption under a day chip (R4). Custom text replaces the auto travel cue. */
export function renderDayLabelSheet(host: HTMLElement, options: DayLabelSheetOptions): void {
  const { trip, cityId, date } = options;
  const city = trip.cities.find((c) => c.id === cityId);
  const existing = trip.days.find((d) => d.city_id === cityId && d.date === date);
  const autoCue = travelDayCue(trip, cityId, date);

  host.replaceChildren();
  const back = document.createElement('div');
  back.className = 'sheet-back';
  const sheet = document.createElement('div');
  sheet.className = 'sheet addform';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');

  const heading = document.createElement('h3');
  heading.textContent = `Day label · ${formatWeekdayDate(date)}`;
  const blurb = document.createElement('p');
  blurb.textContent = city
    ? `Short caption under this day in ${city.name}. Leave blank to use the automatic travel label.`
    : 'Short caption under this day. Leave blank to use the automatic travel label.';
  sheet.append(heading, blurb);

  const form = document.createElement('form');
  form.className = 'addform__form';
  form.noValidate = true;
  const scroll = document.createElement('div');
  scroll.className = 'addform__scroll';
  const grid = document.createElement('div');
  grid.className = 'fgrid';

  const input = document.createElement('input');
  input.type = 'text';
  input.value = existing?.subtitle ?? '';
  input.placeholder = autoCue || 'e.g. Leave Sydney';
  input.autocomplete = 'off';
  input.maxLength = 80;
  grid.append(field('Caption', input, true));

  if (autoCue) {
    const hint = document.createElement('p');
    hint.className = 'hint full';
    hint.textContent = `Automatic label when blank: ${autoCue}`;
    grid.append(hint);
  }
  scroll.append(grid);

  const errorNote = document.createElement('p');
  errorNote.className = 'hint';
  errorNote.hidden = true;
  errorNote.setAttribute('role', 'alert');
  scroll.append(errorNote);
  form.append(scroll);

  function close(): void {
    host.replaceChildren();
    options.onClose();
  }

  const actions = document.createElement('div');
  actions.className = 'addform__actions';
  actions.setAttribute('data-part', 'form-actions');
  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.className = 'btn';
  saveBtn.textContent = 'Save label';
  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'btn ghost';
  clearBtn.textContent = existing?.subtitle ? 'Clear' : 'Cancel';
  clearBtn.addEventListener('click', async () => {
    if (!existing?.subtitle) {
      close();
      return;
    }
    saveBtn.disabled = true;
    clearBtn.disabled = true;
    try {
      const days = upsertDayMeta(trip.days, cityId, date, { subtitle: null });
      const saved = await patchTrip(options.tripId, options.version, { days });
      options.onSaved(saved.trip, saved.version);
      host.replaceChildren();
    } catch (err) {
      saveBtn.disabled = false;
      clearBtn.disabled = false;
      errorNote.hidden = false;
      errorNote.textContent = err instanceof Error ? err.message : 'Could not clear. Try again.';
    }
  });
  actions.append(saveBtn, clearBtn);
  form.append(actions);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorNote.hidden = true;
    saveBtn.disabled = true;
    try {
      const days = upsertDayMeta(trip.days, cityId, date, { subtitle: input.value });
      const saved = await patchTrip(options.tripId, options.version, { days });
      options.onSaved(saved.trip, saved.version);
      host.replaceChildren();
    } catch (err) {
      saveBtn.disabled = false;
      errorNote.hidden = false;
      errorNote.textContent = err instanceof Error ? err.message : 'Could not save. Try again.';
    }
  });

  sheet.append(form);
  back.append(sheet);
  back.addEventListener('click', (e) => {
    if (e.target === back) close();
  });
  host.append(back);
  input.focus();
  input.select();
}

function field(labelText: string, control: HTMLElement, full = false): HTMLElement {
  const wrap = document.createElement('label');
  if (full) wrap.classList.add('full');
  const label = document.createElement('span');
  label.className = 'flabel';
  label.textContent = labelText;
  wrap.append(label, control);
  return wrap;
}
