import { createTrip, listTrips } from '@/api/travel';
import { ApiClientError } from '@/api/client';
import { tripRoute } from '@/app/router';
import { renderPassportMap, type PassportMapHandle } from '@/components/passport-map';
import {
  matchAtlasCountry,
  tripsForAtlasCountry,
  visitedAtlasCountries
} from '@/lib/visited-countries';
import type { TripSummary } from '@/types';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { feature } from 'topojson-client';
import countriesAtlas from 'world-atlas/countries-110m.json';

export interface TripsListOptions {
  isCurrent: () => boolean;
}

const atlasNames: string[] = (() => {
  const topology = countriesAtlas as unknown as { objects: Record<string, unknown> };
  const collection = feature(topology as never, topology.objects.countries as never) as unknown as {
    features: { properties?: { name?: string } }[];
  };
  const names: string[] = [];
  for (const f of collection.features) {
    const name = f.properties?.name;
    if (name) names.push(name);
  }
  return names;
})();

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

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function sortByStartDateDesc(trips: TripSummary[]): TripSummary[] {
  return [...trips].sort((a, b) => (a.start_date < b.start_date ? 1 : a.start_date > b.start_date ? -1 : 0));
}

function applyMapHighlight(
  list: HTMLElement,
  trips: TripSummary[],
  atlasCountry: string | null,
  map: PassportMapHandle
): void {
  const cards = list.querySelectorAll<HTMLElement>('.trips-list__card');
  if (!atlasCountry) {
    for (const card of cards) {
      card.classList.remove('is-map-hit', 'is-dimmed');
      card.removeAttribute('data-active-country');
    }
    map.setSelected(null);
    return;
  }

  const selected = matchAtlasCountry(atlasCountry, atlasNames) ?? atlasCountry;
  const matchingIds = new Set(
    tripsForAtlasCountry(trips, selected, atlasNames).map((t) => t.id)
  );
  let firstHit: HTMLElement | null = null;
  for (const card of cards) {
    const id = card.getAttribute('data-trip-id') ?? '';
    const hit = matchingIds.has(id);
    card.classList.toggle('is-map-hit', hit);
    card.classList.toggle('is-dimmed', !hit);
    if (hit) {
      card.setAttribute('data-active-country', selected);
      if (!firstHit) firstHit = card;
    } else {
      card.removeAttribute('data-active-country');
    }
  }
  firstHit?.scrollIntoView({ block: 'nearest' });
  map.setSelected(selected);
}

/** Passport homepage (`#/`): visited-countries map, trip timeline, New trip sheet (R4). */
export async function renderTripsList(canvas: HTMLElement, options: TripsListOptions): Promise<void> {
  canvas.replaceChildren();
  const { trips: rawTrips } = await listTrips();
  if (!options.isCurrent()) return;

  const trips = sortByStartDateDesc(rawTrips);
  const visited = visitedAtlasCountries(trips, atlasNames, todayIso());

  const wrap = document.createElement('div');
  wrap.className = 'wrap trips-list';

  const top = document.createElement('div');
  top.className = 'top';
  const titleBlock = document.createElement('div');
  const h1 = document.createElement('h1');
  h1.textContent = 'Trips';
  const sub = document.createElement('p');
  sub.className = 'sub';
  if (trips.length === 0) {
    sub.textContent = 'Your passport starts empty — plan the next holiday from here.';
  } else {
    const n = trips.length;
    const k = visited.size;
    sub.textContent = `${n} trip${n === 1 ? '' : 's'} · ${k} ${k === 1 ? 'country' : 'countries'} visited`;
  }
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

  const mapHost = document.createElement('div');
  mapHost.className = 'trips-list__map';
  wrap.append(mapHost);

  const list = document.createElement('div');
  list.className = 'trips-list__cards';

  const map = renderPassportMap(mapHost, {
    visited,
    onSelect: (atlasCountry) => applyMapHighlight(list, trips, atlasCountry, map)
  });

  if (trips.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No trips yet.';
    wrap.append(empty);
  } else {
    for (const trip of trips) {
      const card = document.createElement('a');
      card.className = 'card trips-list__card';
      card.href = tripRoute(trip.id);
      card.setAttribute('data-trip-id', trip.id);

      const finished = todayIso() > trip.end_date;
      if (finished) card.classList.add('is-finished');

      const h3 = document.createElement('h3');
      h3.textContent = trip.title;
      const meta = document.createElement('p');
      meta.className = 'trips-list__meta';
      const status = statusLabel(trip.start_date, trip.end_date);
      meta.textContent = `${formatDisplayDate(trip.start_date)} – ${formatDisplayDate(trip.end_date)} · ${status}`;
      if (finished) meta.classList.add('is-quiet');

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
      card.append(h3, meta, chips);
      list.append(card);
    }
    wrap.append(list);
  }

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
