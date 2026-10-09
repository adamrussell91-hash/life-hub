import type { City, Currency, Trip } from '@/types';
import { patchTrip, searchPlaces } from '@/api/travel';
import { ApiClientError } from '@/api/client';
import { nextAccent } from '@/cities/palette';

export interface CityFormOptions {
  trip: Trip;
  tripId: string;
  version: string;
  onSaved: (trip: Trip, version: string, cityId: string) => void;
  onClose: () => void;
}

const CURRENCIES: Currency[] = [
  'AUD',
  'MYR',
  'TRY',
  'GBP',
  'EUR',
  'KRW',
  'CAD',
  'USD',
  'JPY',
  'NZD',
  'SGD'
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Add a city to a trip (TR-59): name, country, dates, tz, centre, currency, title. */
export function renderCityForm(host: HTMLElement, options: CityFormOptions): void {
  const { trip } = options;
  host.replaceChildren();

  const back = document.createElement('div');
  back.className = 'sheet-back';
  const sheet = document.createElement('div');
  sheet.className = 'sheet addform';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');

  const heading = document.createElement('h3');
  heading.textContent = 'Add a city';
  sheet.append(heading);

  const form = document.createElement('form');
  form.noValidate = true;
  form.className = 'addform__form';
  const scroll = document.createElement('div');
  scroll.className = 'addform__scroll';
  const grid = document.createElement('div');
  grid.className = 'fgrid';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.required = true;
  nameInput.autocomplete = 'off';
  grid.append(field('City name', nameInput, true));

  const countryInput = document.createElement('input');
  countryInput.type = 'text';
  countryInput.required = true;
  countryInput.autocomplete = 'country-name';
  grid.append(field('Country', countryInput, true));

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.placeholder = 'Defaults to the city name';
  grid.append(field('Title on the scene', titleInput, true));

  const startInput = dateInput(trip.start_date, trip);
  grid.append(field('First day here', startInput));
  const endInput = dateInput(trip.end_date, trip);
  grid.append(field('Last day here', endInput));

  const tzFilter = document.createElement('input');
  tzFilter.type = 'search';
  tzFilter.placeholder = 'Filter time zones';
  tzFilter.autocomplete = 'off';
  const tzSelect = document.createElement('select');
  tzSelect.required = true;
  const zones = listTimeZones();
  fillTzOptions(tzSelect, zones, 'Australia/Sydney');
  const tzWrap = document.createElement('div');
  tzWrap.className = 'full';
  tzWrap.append(field('Time zone', tzFilter, true), tzSelect);
  grid.append(tzWrap);
  tzFilter.addEventListener('input', () => {
    const q = tzFilter.value.trim().toLowerCase();
    const current = tzSelect.value;
    const filtered = q ? zones.filter((z) => z.toLowerCase().includes(q)) : zones;
    fillTzOptions(tzSelect, filtered.length ? filtered : zones, current);
  });

  const currencySelect = document.createElement('select');
  currencySelect.required = true;
  for (const code of CURRENCIES) {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = code;
    if (code === 'AUD') opt.selected = true;
    currencySelect.append(opt);
  }
  grid.append(field('Local currency', currencySelect));

  const placeSearch = document.createElement('input');
  placeSearch.type = 'search';
  placeSearch.placeholder = 'Search for the city centre';
  placeSearch.autocomplete = 'off';
  const placeField = field('Map centre', placeSearch, true);
  const suggestions = document.createElement('div');
  suggestions.className = 'place-suggestions full';
  const pinned = document.createElement('p');
  pinned.className = 'hint full';
  pinned.hidden = true;
  grid.append(placeField, suggestions, pinned);

  let centre: { lat: number; lon: number; name: string } | null = null;
  let searchTimer = 0;

  function showPinned(): void {
    if (!centre) {
      pinned.hidden = true;
      return;
    }
    pinned.hidden = false;
    pinned.textContent = `Pinned: ${centre.name} (${centre.lat.toFixed(4)}, ${centre.lon.toFixed(4)})`;
  }

  placeSearch.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    const q = placeSearch.value.trim();
    if (q.length < 2) {
      suggestions.replaceChildren();
      return;
    }
    searchTimer = window.setTimeout(async () => {
      try {
        const { places } = await searchPlaces(q);
        if (!suggestions.isConnected) return;
        suggestions.replaceChildren();
        for (const place of places.slice(0, 6)) {
          const chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'btn ghost';
          chip.textContent = place.address ? `${place.name} — ${place.address}` : place.name;
          chip.addEventListener('click', () => {
            centre = { lat: place.lat, lon: place.lon, name: place.name };
            showPinned();
            suggestions.replaceChildren();
            if (!nameInput.value.trim()) nameInput.value = place.name;
          });
          suggestions.append(chip);
        }
      } catch {
        suggestions.replaceChildren();
      }
    }, 280);
  });

  const errorNote = document.createElement('p');
  errorNote.className = 'hint';
  errorNote.hidden = true;
  scroll.append(grid, errorNote);
  form.append(scroll);

  function close(): void {
    host.replaceChildren();
    options.onClose();
  }

  function fail(message: string): void {
    errorNote.hidden = false;
    errorNote.textContent = message;
  }

  const actions = document.createElement('div');
  actions.className = 'addform__actions';
  actions.setAttribute('data-part', 'form-actions');
  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.className = 'btn';
  saveBtn.textContent = 'Add city';
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
    const name = nameInput.value.trim();
    const country = countryInput.value.trim();
    const start = startInput.value;
    const end = endInput.value;
    if (!name || !country) {
      fail('Name and country are required.');
      return;
    }
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
    if (!tzSelect.value) {
      fail('Pick a time zone.');
      return;
    }
    if (!centre) {
      fail('Search and pin a map centre for this city.');
      return;
    }

    const cityId = uniqueCityId(name, trip.cities.map((c) => c.id));
    const city: City = {
      id: cityId,
      name,
      country,
      tz: tzSelect.value,
      start_date: start,
      end_date: end,
      title: titleInput.value.trim() || name,
      scene: 'generic',
      accent: nextAccent(trip.cities.length),
      facts: [],
      center: { lat: centre.lat, lon: centre.lon },
      local_currency: currencySelect.value as Currency,
      directions_app: 'google'
    };

    saveBtn.disabled = true;
    try {
      const saved = await patchTrip(options.tripId, options.version, {
        cities: [...trip.cities, city]
      });
      options.onSaved(saved.trip, saved.version, cityId);
      host.replaceChildren();
    } catch (err) {
      saveBtn.disabled = false;
      fail(err instanceof ApiClientError || err instanceof Error ? err.message : 'Could not save. Try again.');
    }
  });

  sheet.append(form);
  back.append(sheet);
  back.addEventListener('click', (e) => {
    if (e.target === back) close();
  });
  host.append(back);
  nameInput.focus();
}

function listTimeZones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return ['Australia/Sydney', 'UTC', 'Europe/London', 'America/New_York', 'Asia/Tokyo'];
  }
}

function fillTzOptions(select: HTMLSelectElement, zones: string[], preferred: string): void {
  select.replaceChildren();
  for (const zone of zones) {
    const opt = document.createElement('option');
    opt.value = zone;
    opt.textContent = zone;
    select.append(opt);
  }
  if (zones.includes(preferred)) select.value = preferred;
  else if (zones[0]) select.value = zones[0];
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

export function uniqueCityId(name: string, existing: string[]): string {
  const taken = new Set(existing);
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 8);
  let id = (base.length >= 3 ? base : `${base}city`).slice(0, 12);
  if (!taken.has(id)) return id;
  let n = 2;
  while (taken.has(`${id}${n}`)) n += 1;
  return `${id}${n}`.slice(0, 24);
}
