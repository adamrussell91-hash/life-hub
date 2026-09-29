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

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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
  grid.append(field('City title', titleInput, true));

  const startInput = dateInput(city.start_date, trip);
  grid.append(field('First day here', startInput));
  const endInput = dateInput(city.end_date, trip);
  grid.append(field('Last day here', endInput));

  const hint = document.createElement('p');
  hint.className = 'hint full';
  hint.textContent = `Trip runs ${trip.start_date} → ${trip.end_date}. Inclusive dates.`;
  grid.append(hint);
  form.append(grid);

  const errorNote = document.createElement('p');
  errorNote.className = 'hint';
  errorNote.hidden = true;
  form.append(errorNote);

  function close(): void {
    host.replaceChildren();
    options.onClose();
  }

  function fail(message: string): void {
    errorNote.hidden = false;
    errorNote.textContent = message;
  }

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
  cancelBtn.addEventListener('click', close);
  actions.append(saveBtn, cancelBtn);
  form.append(actions);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorNote.hidden = true;
    const start = startInput.value;
    const end = endInput.value;
    if (!ISO_DATE.test(start) || !ISO_DATE.test(end)) {
      fail('Pick a start and end date.');
      return;
    }
    if (start > end) {
      fail('First day must be on or before the last day.');
      return;
    }
    if (start < trip.start_date || end > trip.end_date) {
      fail('City dates must sit inside the trip dates.');
      return;
    }
    const nextTitle = titleInput.value.trim() || city.title;
    const cities = trip.cities.map((c) =>
      c.id === city.id ? { ...c, title: nextTitle, start_date: start, end_date: end } : c
    );
    try {
      const saved = await patchTrip(options.tripId, options.version, { cities });
      options.onSaved(saved.trip, saved.version);
      host.replaceChildren();
    } catch {
      fail('Could not save. Try again.');
    }
  });

  sheet.append(form);
  back.append(sheet);
  back.addEventListener('click', (e) => {
    if (e.target === back) close();
  });
  host.append(back);
  startInput.focus();
}

function dateInput(value: string, trip: Trip): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'date';
  input.value = value;
  input.required = true;
  input.min = trip.start_date;
  input.max = trip.end_date;
  return input;
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
