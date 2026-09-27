import { createTrip, listTrips } from '@/api/travel';
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
 * §2.1 redirects here to the single trip when there's exactly one. */
export async function renderTripsList(canvas: HTMLElement, options: TripsListOptions): Promise<void> {
  canvas.replaceChildren();
  const { trips } = await listTrips();
  if (!options.isCurrent()) return;

  const wrap = document.createElement('div');
  wrap.className = 'wrap';

  const top = document.createElement('div');
  top.className = 'top';
  const h1 = document.createElement('h1');
  h1.textContent = 'Trips';
  top.append(h1);
  wrap.append(top);

  if (trips.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No trips yet.';
    wrap.append(empty);
  }

  for (const trip of trips) {
    const card = document.createElement('a');
    card.className = 'card';
    card.href = tripRoute(trip.id);
    const h3 = document.createElement('h3');
    h3.textContent = trip.title;
    const p = document.createElement('p');
    p.textContent = `${formatDisplayDate(trip.start_date)} – ${formatDisplayDate(trip.end_date)} · ${statusLabel(trip.start_date, trip.end_date)}`;
    const chips = document.createElement('div');
    chips.className = 'chips';
    for (const cityName of trip.cities) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = cityName;
      chips.append(chip);
    }
    card.append(h3, p, chips);
    wrap.append(card);
  }

  const newTripForm = document.createElement('form');
  newTripForm.className = 'addform';
  const heading = document.createElement('h3');
  heading.textContent = trips.length === 0 ? 'Plan a trip' : 'New trip';
  const titleInput = document.createElement('input');
  titleInput.placeholder = 'Trip title';
  titleInput.required = true;
  const startInput = document.createElement('input');
  startInput.type = 'date';
  startInput.required = true;
  const endInput = document.createElement('input');
  endInput.type = 'date';
  endInput.required = true;
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'btn';
  submit.textContent = 'Create trip';

  const importLabel = document.createElement('label');
  importLabel.className = 'flabel';
  importLabel.textContent = 'or import a trip JSON';
  const importInput = document.createElement('input');
  importInput.type = 'file';
  importInput.accept = '.json,application/json';
  const importError = document.createElement('p');
  importError.className = 'hint';
  importError.hidden = true;

  newTripForm.append(heading, titleInput, startInput, endInput, submit, importLabel, importInput, importError);
  wrap.append(newTripForm);

  newTripForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { trip } = await createTrip({
      title: titleInput.value,
      start_date: startInput.value,
      end_date: endInput.value
    });
    location.hash = tripRoute(trip.id);
  });

  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const { trip } = await createTrip({ import: parsed });
      location.hash = tripRoute(trip.id);
    } catch (err) {
      importError.hidden = false;
      importError.textContent = err instanceof Error ? err.message : 'Could not import that file.';
    }
  });

  canvas.append(wrap);
}
