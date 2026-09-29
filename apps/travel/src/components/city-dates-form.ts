import type { City, Trip } from '@/types';
import { patchTrip } from '@/api/travel';

export interface CityDatesFormOptions {
  trip: Trip;
  tripId: string;
  version: string;
  city: City;
  onSaved: (trip: Trip, version: string) => void;
  onClose: () => void;
}

/** Edit a city's inclusive date range (and title). Uses existing PATCH /api/travel-trip. */
export function renderCityDatesForm(host: HTMLElement, options: CityDatesFormOptions): void {
  const { trip, city } = options;
  host.replaceChildren();

  const back = document.createElement('div');
  back.className = 'sheet-back';
  const sheet = document.createElement('div');
  sheet.className = 'sheet addform';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');

  const title = document.createElement('h3');
  title.textContent = `Dates in ${city.name}`;
  const blurb = document.createElement('p');
  blurb.textContent =
    'Travel days (leave one city, land in the next) should sit in both cities — set the leaving city’s end date to that day, and the arriving city’s start date to the same day.';
  sheet.append(title, blurb);

  const form = document.createElement('form');
  form.noValidate = true;
  const grid = document.createElement('div');
  grid.className = 'fgrid';

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.value = city.title;
  titleInput.required = true;
  grid.append(labeled('City title', titleInput, true));

  const startInput = document.createElement('input');
  startInput.type = 'date';
  startInput.value = city.start_date;
  startInput.required = true;
  startInput.min = trip.start_date;
  startInput.max = trip.end_date;
  grid.append(labeled('First day here', startInput));

  const endInput = document.createElement('input');
  endInput.type = 'date';
  endInput.value = city.end_date;
  endInput.required = true;
  endInput.min = trip.start_date;
  endInput.max = trip.end_date;
  grid.append(labeled('Last day here', endInput));

  const hint = document.createElement('p');
  hint.className = 'hint full';
  hint.textContent = `Trip runs ${trip.start_date} → ${trip.end_date}. Inclusive dates.`;
  grid.append(hint);

  form.append(grid);

  const errorNote = document.createElement('p');
  errorNote.className = 'hint';
  errorNote.hidden = true;
  form.append(errorNote);

  const actions = document.createElement('div');
  actions.className = 'row';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.className = 'btn';
  saveBtn.textContent = 'Save dates';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn ghost';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => {
    host.replaceChildren();
    options.onClose();
  });
  actions.append(saveBtn, cancelBtn);
  form.append(actions);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorNote.hidden = true;
    const start = startInput.value;
    const end = endInput.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      errorNote.hidden = false;
      errorNote.textContent = 'Pick a start and end date.';
      return;
    }
    if (start > end) {
      errorNote.hidden = false;
      errorNote.textContent = 'First day must be on or before the last day.';
      return;
    }
    if (start < trip.start_date || end > trip.end_date) {
      errorNote.hidden = false;
      errorNote.textContent = 'City dates must sit inside the trip dates.';
      return;
    }
    const nextTitle = titleInput.value.trim() || city.title;
    const cities = trip.cities.map((c) =>
      c.id === city.id
        ? { ...c, title: nextTitle, start_date: start, end_date: end }
        : c
    );
    try {
      const saved = await patchTrip(options.tripId, options.version, { cities });
      options.onSaved(saved.trip, saved.version);
      host.replaceChildren();
    } catch {
      errorNote.hidden = false;
      errorNote.textContent = 'Could not save. Try again.';
    }
  });

  sheet.append(form);
  back.append(sheet);
  back.addEventListener('click', (e) => {
    if (e.target === back) {
      host.replaceChildren();
      options.onClose();
    }
  });
  host.append(back);
  startInput.focus();
}

function labeled(labelText: string, control: HTMLElement, full = false): HTMLElement {
  const wrap = document.createElement('label');
  if (full) wrap.classList.add('full');
  const label = document.createElement('span');
  label.className = 'flabel';
  label.textContent = labelText;
  wrap.append(label, control);
  return wrap;
}
