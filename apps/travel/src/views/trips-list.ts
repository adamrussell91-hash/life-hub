import { createTrip, listTrips } from '@/api/travel';
import { ApiClientError } from '@/api/client';
import { tripRoute } from '@/app/router';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';

export interface TripsListOptions {
  isCurrent: () => boolean;
}

function daysUntil(date: string): number {
  const today = new Date().toISOString().slice(0, 10);
  const ms = new Date(date + 'T00:00:00Z').getTime() - new Date(today + 'T00:00:00Z').getTime();
  return Math.round(ms / 86_400_000);
}

function statusLabel(start: string, end: string): string {
  const today = new Date().toISOString().slice(0, 10);
  if (today > end) return 'Finished';
  if (today >= start) return 'On now';
  const n = daysUntil(start);
  return `Leaves in ${n} day${n === 1 ? '' : 's'}`;
}

/** Trips list (`#/`, TR-60): cards with title, dates, city chips and status.
 * New trip opens as a docked sheet so phone actions stay tappable (R4). */
export async function renderTripsList(canvas: HTMLElement, options: TripsListOptions): Promise<void> {
  canvas.replaceChildren();
  const { trips } = await listTrips();
  if (!options.isCurrent()) return;

  const wrap = document.createElement('div');
  wrap.className = 'wrap trips-list';

  const top = document.createElement('div');
  top.className = 'top';
  const titleBlock = document.createElement('div');
  const h1 = document.createElement('h1');
  h1.textContent = 'Trips';
  const sub = document.createElement('p');
  sub.className = 'sub';
  sub.textContent =
    trips.length === 0
      ? 'Plan the next holiday from here.'
      : `${trips.length} trip${trips.length === 1 ? '' : 's'} · open one, or plan another.`;
  titleBlock.append(h1, sub);
  const acts = document.createElement('div');
  acts.className = 'acts';
  const newBtn = document.createElement('button');
  newBtn.type = 'button';
  newBtn.className = 'btn';
  newBtn.textContent = trips.length === 0 ? 'Plan a trip' : 'New trip';
  newBtn.addEventListener('click', () => openNewTripSheet(document.body, trips.length === 0));
  acts.append(newBtn);
  top.append(titleBlock, acts);
  wrap.append(top);

  if (trips.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No trips yet.';
    wrap.append(empty);
  }

  const list = document.createElement('div');
  list.className = 'trips-list__cards';
  for (const trip of trips) {
    const card = document.createElement('a');
    card.className = 'card trips-list__card';
    card.href = tripRoute(trip.id);
    const h3 = document.createElement('h3');
    h3.textContent = trip.title;
    const p = document.createElement('p');
    p.textContent = `${formatDisplayDate(trip.start_date)} – ${formatDisplayDate(trip.end_date)} · ${statusLabel(trip.start_date, trip.end_date)}`;
    const chips = document.createElement('div');
    chips.className = 'chips';
    if (trip.cities.length === 0) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = 'No cities yet';
      chips.append(chip);
    } else {
      for (const cityName of trip.cities) {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = cityName;
        chips.append(chip);
      }
    }
    card.append(h3, p, chips);
    list.append(card);
  }
  if (trips.length) wrap.append(list);

  canvas.append(wrap);

  if (trips.length === 0) {
    openNewTripSheet(document.body, true);
  }
}

function openNewTripSheet(hostParent: HTMLElement, emptyList: boolean): void {
  const host = document.createElement('div');
  hostParent.append(host);

  const back = document.createElement('div');
  back.className = 'sheet-back';
  const sheet = document.createElement('div');
  sheet.className = 'sheet addform';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');

  const heading = document.createElement('h3');
  heading.textContent = emptyList ? 'Plan a trip' : 'New trip';
  sheet.append(heading);

  const form = document.createElement('form');
  form.className = 'addform__form';
  form.noValidate = true;

  const scroll = document.createElement('div');
  scroll.className = 'addform__scroll';
  const grid = document.createElement('div');
  grid.className = 'fgrid';

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.placeholder = 'Trip title';
  titleInput.required = true;
  titleInput.autocomplete = 'off';
  grid.append(labelled('Title', titleInput, true));

  const startInput = document.createElement('input');
  startInput.type = 'date';
  startInput.required = true;
  grid.append(labelled('Start', startInput));

  const endInput = document.createElement('input');
  endInput.type = 'date';
  endInput.required = true;
  grid.append(labelled('End', endInput));

  const importLabel = document.createElement('label');
  importLabel.className = 'full';
  const importSpan = document.createElement('span');
  importSpan.className = 'flabel';
  importSpan.textContent = 'Or import a trip JSON';
  const importInput = document.createElement('input');
  importInput.type = 'file';
  importInput.accept = '.json,application/json';
  importLabel.append(importSpan, importInput);
  grid.append(importLabel);

  const formError = document.createElement('p');
  formError.className = 'hint';
  formError.hidden = true;
  formError.setAttribute('role', 'alert');
  scroll.append(grid, formError);
  form.append(scroll);

  function close(): void {
    host.remove();
  }

  function showError(message: string): void {
    formError.hidden = false;
    formError.textContent = message;
  }

  const actions = document.createElement('div');
  actions.className = 'addform__actions';
  actions.setAttribute('data-part', 'form-actions');
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'btn';
  submit.textContent = 'Create trip';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn ghost';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', close);
  actions.append(submit, cancel);
  form.append(actions);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError.hidden = true;
    const title = titleInput.value.trim();
    if (!title || !startInput.value || !endInput.value) {
      showError('Title, start and end dates are required.');
      return;
    }
    if (startInput.value > endInput.value) {
      showError('Start must be on or before the end date.');
      return;
    }
    submit.disabled = true;
    try {
      const { trip } = await createTrip({
        title,
        start_date: startInput.value,
        end_date: endInput.value
      });
      host.remove();
      location.hash = tripRoute(trip.id);
    } catch (err) {
      submit.disabled = false;
      showError(err instanceof ApiClientError || err instanceof Error ? err.message : 'Could not create that trip.');
    }
  });

  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    formError.hidden = true;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const { trip } = await createTrip({ import: parsed });
      host.remove();
      location.hash = tripRoute(trip.id);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not import that file.');
      importInput.value = '';
    }
  });

  sheet.append(form);
  back.append(sheet);
  back.addEventListener('click', (e) => {
    if (e.target === back) close();
  });
  host.append(back);
  titleInput.focus();
}

function labelled(labelText: string, control: HTMLElement, full = false): HTMLElement {
  const wrap = document.createElement('label');
  if (full) wrap.classList.add('full');
  const label = document.createElement('span');
  label.className = 'flabel';
  label.textContent = labelText;
  wrap.append(label, control);
  return wrap;
}
