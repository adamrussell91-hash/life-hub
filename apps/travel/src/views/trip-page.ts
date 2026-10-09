import type { City, Item, Trip } from '@/types';
import { addCheckin, getTrip, uploadTravelPhoto } from '@/api/travel';
import {
  buildTodo,
  daysForCity,
  homeBaseForNight,
  itemPlace,
  itemsForCityDay,
  orderDayItems,
  otherCitiesSharingDate,
  travelDayCue
} from '@/model/day';
import { renderScene } from '@/scenes';
import { renderWorldMap } from '@/components/world-map';
import type { DayMapHandle } from '@/components/day-map';
import { renderDayList } from '@/views/day-list';
import { renderAddForm } from '@/components/add-form';
import { renderCityDatesForm } from '@/components/city-dates-form';
import { renderCityForm } from '@/components/city-form';
import { renderSafePhotoSheet } from '@/components/safe-photo-sheet';
import { renderTakeMeHome } from '@/components/take-me-home';
import { renderShareSheet } from '@/components/share-sheet';
import { dateInZone, formatInZone, zonedToInstant } from '@/lib/time';
import { formatCountdown, formatLongRange, formatShortRange, formatWeekdayDate } from '@/lib/date-label';
import { I } from '@/lib/icons';
import type { Marker } from 'maplibre-gl';

export interface TripPageOptions {
  cityId?: string;
  date?: string;
  isCurrent: () => boolean;
}

const PENELOPE_KEY = 'lifehub.travel.penelope';

function writePenelopeHandoff(trip: Trip, cityId: string, date: string, prompt: string): void {
  const city = trip.cities.find((c) => c.id === cityId);
  const dayItems = itemsForCityDay(trip, cityId, date).filter((item) => !item.private);
  const checkinLines = trip.checkins
    .filter((c) => c.city_id === cityId)
    .map((c) => `Checked in: ${c.label}`);
  const context = [
    `City: ${city?.name ?? cityId}`,
    ...dayItems.map((item) => `${item.time ?? 'Time to set'} — ${item.title}`),
    ...checkinLines
  ].join('\n');
  const payload = {
    date,
    city: city?.name ?? cityId,
    prompt,
    context,
    expires: Date.now() + 10 * 60_000
  };
  try {
    localStorage.setItem(PENELOPE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota errors */
  }
  location.href = '/#/mind';
}

/** Trip page (§5.1): world map, city chips, still to book, city scene and
 * day view. */
export async function renderTripPage(canvas: HTMLElement, tripId: string, options: TripPageOptions): Promise<void> {
  canvas.replaceChildren();
  let trip: Trip;
  let version: string;
  try {
    const envelope = await getTrip(tripId);
    trip = envelope.trip;
    version = envelope.version;
  } catch {
    const err = document.createElement('p');
    err.className = 'empty-state';
    err.textContent = 'This trip changed somewhere else. Reload to see the latest.';
    canvas.append(err);
    return;
  }
  if (!options.isCurrent()) return;

  const wrap = document.createElement('div');
  wrap.className = 'wrap';

  const top = document.createElement('div');
  top.className = 'top';
  const crumb = document.createElement('p');
  crumb.className = 'crumb';
  crumb.innerHTML = 'Life › Future map › <b>Travel</b>';
  const titleBlock = document.createElement('div');
  const h1 = document.createElement('h1');
  h1.textContent = trip.title;
  const sub = document.createElement('p');
  sub.className = 'sub num';
  const today = dateInZone(new Date(), trip.home_tz);
  const trains = trip.items.filter((item) => item.kind === 'train').length;
  sub.textContent = [
    formatLongRange(trip.start_date, trip.end_date),
    formatCountdown(trip.start_date, trip.end_date, today),
    `${trip.cities.length} ${trip.cities.length === 1 ? 'city' : 'cities'}` +
      (trains ? `, ${trains} ${trains === 1 ? 'train' : 'trains'}` : '')
  ].join(' · ');
  titleBlock.append(crumb, h1, sub);
  const acts = document.createElement('div');
  acts.className = 'acts';
  const addCityBtn = document.createElement('button');
  addCityBtn.type = 'button';
  addCityBtn.className = 'btn ghost';
  addCityBtn.innerHTML = `${I.plus}Add city`;
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn';
  addBtn.innerHTML = `${I.plus}Add`;
  addBtn.disabled = trip.cities.length === 0;
  addBtn.title = trip.cities.length === 0 ? 'Add a city first' : 'Add to the trip';
  const publicBtn = document.createElement('button');
  publicBtn.type = 'button';
  publicBtn.className = 'btn ghost';
  publicBtn.innerHTML = `${I.link}Public link`;
  acts.append(addCityBtn, addBtn, publicBtn);
  top.append(titleBlock, acts);
  wrap.append(top);

  const worldHost = document.createElement('div');
  wrap.append(worldHost);
  const worldMap = renderWorldMap(worldHost, trip);

  const chips = document.createElement('div');
  chips.className = 'chips';
  wrap.append(chips);

  const todoRows = buildTodo(trip, new Date().toISOString().slice(0, 10));
  const tobook = document.createElement('details');
  tobook.className = 'tobook';
  const summary = document.createElement('summary');
  summary.innerHTML = `Still to book <span class="count">${todoRows.length}</span>`;
  const ul = document.createElement('ul');
  for (const row of todoRows) {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = `#/trip/${encodeURIComponent(tripId)}/${encodeURIComponent(row.city_id)}/${row.date}`;
    link.innerHTML = `<span class="w">${row.when_label}</span><b>${row.title}</b><span class="d">${row.detail}</span>`;
    li.append(link);
    ul.append(li);
  }
  tobook.append(summary, ul);
  wrap.append(tobook);

  const citySection = document.createElement('div');
  citySection.className = 'city';
  wrap.append(citySection);

  canvas.append(wrap);

  let dayMapHandle: DayMapHandle | null = null;
  // MapLibre is ~800 kB; load it after the trip paints so the world map and
  // day list are not held behind it (and it only loads when a day map shows).
  let dayMapRender = 0;
  let selectedCityId = options.cityId ?? trip.cities[0]?.id ?? '';
  let selectedDate = options.date ?? '';

  function updateChips(): void {
    chips.replaceChildren();
    for (const city of trip.cities) {
      const hasTodo = todoRows.some((r) => r.city_id === city.id);
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      if (city.id === selectedCityId) chip.classList.add('is-on');
      chip.innerHTML = `<b>${city.name}${hasTodo ? '<i class="todo-dot" title="Something to book"></i>' : ''}</b><span class="num">${formatShortRange(city.start_date, city.end_date)}</span>`;
      chip.addEventListener('click', () => selectCity(city.id));
      chips.append(chip);
    }
    const addChip = document.createElement('button');
    addChip.type = 'button';
    addChip.className = 'chip chip--add';
    addChip.innerHTML = `<b>Add city</b><span>Next stop</span>`;
    addChip.addEventListener('click', () => openAddCity());
    chips.append(addChip);
  }

  function renderCityScene(): void {
    citySection.replaceChildren();
    citySection.style.setProperty('--city', '');
    const cityOrNull = trip.cities.find((c) => c.id === selectedCityId);
    if (!cityOrNull) {
      const empty = document.createElement('div');
      empty.className = 'card trip-empty-cities';
      const h3 = document.createElement('h3');
      h3.textContent = 'No cities yet';
      const p = document.createElement('p');
      p.textContent = 'Add the first city to start the map, days, and itinerary.';
      const cta = document.createElement('button');
      cta.type = 'button';
      cta.className = 'btn';
      cta.textContent = 'Add a city';
      cta.addEventListener('click', () => openAddCity());
      empty.append(h3, p, cta);
      citySection.append(empty);
      return;
    }
    const city = cityOrNull;
    citySection.style.setProperty('--city', city.accent.color);
    citySection.style.setProperty('--city-soft', city.accent.soft);
    citySection.style.setProperty('--city-ink', city.accent.ink);

    const scene = document.createElement('div');
    scene.className = 'scene';
    scene.innerHTML = renderScene(city.scene, city.accent);
    const titleDiv = document.createElement('div');
    titleDiv.className = 'title';
    const eyebrow = document.createElement('p');
    eyebrow.className = 'eyebrow num';
    eyebrow.textContent = `${city.name} · ${formatShortRange(city.start_date, city.end_date)}`;
    const h2 = document.createElement('h2');
    h2.textContent = city.title;
    const factsRow = document.createElement('div');
    factsRow.className = 'facts';
    const nowSpan = document.createElement('span');
    nowSpan.textContent = `${formatInZone(new Date(), city.tz)} there now`;
    factsRow.append(nowSpan);
    for (const fact of city.facts) {
      const f = document.createElement('span');
      f.textContent = fact;
      factsRow.append(f);
    }
    titleDiv.append(eyebrow, h2, factsRow);
    const datesEdit = document.createElement('button');
    datesEdit.type = 'button';
    datesEdit.className = 'btn ghost city-dates-edit';
    datesEdit.textContent = 'Edit dates';
    datesEdit.addEventListener('click', () => openCityDates(city));
    titleDiv.append(datesEdit);
    scene.append(titleDiv);

    const dates = daysForCity(trip, city.id);
    if (!selectedDate || !dates.includes(selectedDate)) selectedDate = dates[0] ?? '';
    const dayBar = document.createElement('div');
    dayBar.className = 'daybar';
    for (const date of dates) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'daybtn';
      if (date === selectedDate) btn.classList.add('is-on');
      const cue = travelDayCue(trip, city.id, date);
      if (cue) btn.classList.add('is-travel');
      // "Tue 1 Dec" over the day's subtitle ("Leave Sydney"), as in the mockup.
      btn.textContent = formatWeekdayDate(date);
      const subtitle = trip.days.find((d) => d.city_id === city.id && d.date === date)?.subtitle;
      const smallText = [subtitle, cue].filter(Boolean).join(' · ');
      if (smallText) {
        const small = document.createElement('small');
        small.textContent = smallText;
        btn.append(small);
      }
      btn.addEventListener('click', () => {
        selectedDate = date;
        renderDay();
      });
      dayBar.append(btn);
    }
    // Day bar sits under the scene (its CSS rounds the bottom corners); inside
    // the fixed-height scene it overprinted the city title.
    citySection.append(scene, dayBar);

    const day = document.createElement('div');
    day.className = 'day';
    const listCol = document.createElement('div');
    listCol.className = 'listcol';
    const mapCol = document.createElement('div');
    mapCol.className = 'mapcol';
    const mapBox = document.createElement('div');
    mapBox.className = 'mapbox';
    mapBox.style.height = '480px';
    mapBox.style.position = 'relative';
    const mapInner = document.createElement('div');
    mapInner.style.position = 'absolute';
    mapInner.style.inset = '0';
    const mapTools = document.createElement('div');
    mapTools.className = 'map-tools';
    const homeBtn = document.createElement('button');
    homeBtn.type = 'button';
    homeBtn.className = 'btn';
    homeBtn.innerHTML = `${I.home}Take me home`;
    homeBtn.addEventListener('click', () => {
      const host = document.createElement('div');
      document.body.append(host);
      renderTakeMeHome(
        host,
        { home: homeBaseForNight(trip, selectedDate), date: selectedDate, onAddStay: () => { host.remove(); openForm(undefined, city.id, selectedDate); } },
        city.driver_phrase
      );
    });
    const whereBtn = document.createElement('button');
    whereBtn.type = 'button';
    whereBtn.className = 'btn ghost';
    whereBtn.innerHTML = `${I.locate}Where am I?`;
    whereBtn.addEventListener('click', () => {
      if (!dayMapHandle) return;
      void startWhereAmI(dayMapHandle.map, mapBox, city, selectedDate, trip);
    });
    const fullBtn = document.createElement('button');
    fullBtn.type = 'button';
    fullBtn.className = 'btn ghost';
    const fullLabel = document.createElement('span');
    fullLabel.textContent = 'Full screen';
    fullBtn.innerHTML = I.expand;
    fullBtn.append(fullLabel);
    fullBtn.addEventListener('click', () => {
      const on = mapBox.classList.toggle('is-fullscreen');
      fullLabel.textContent = on ? 'Exit full screen' : 'Full screen';
      dayMapHandle?.map.resize();
      if (on) {
        const onKey = (e: KeyboardEvent) => {
          if (e.key === 'Escape') {
            mapBox.classList.remove('is-fullscreen');
            fullLabel.textContent = 'Full screen';
            dayMapHandle?.map.resize();
            document.removeEventListener('keydown', onKey);
          }
        };
        document.addEventListener('keydown', onKey);
      }
    });
    mapTools.append(homeBtn, whereBtn, fullBtn);
    mapBox.append(mapInner, mapTools);
    mapCol.append(mapBox);
    day.append(listCol, mapCol);
    citySection.append(day);

    function renderDay(): void {
      updateChips();
      renderDayBarState();
      listCol.replaceChildren();
      const siblings = otherCitiesSharingDate(trip, city.id, selectedDate);
      if (siblings.length) listCol.append(travelDayNote(siblings));
      const listHost = document.createElement('div');
      listCol.append(listHost);
      renderDayList(listHost, trip, city.id, selectedDate, {
        selectedId: null,
        onSelect: (itemId) => dayMapHandle?.selectStop(itemId),
        onEdit: (item) => openForm(item),
        onAddAt: (cityId, date) => openForm(undefined, cityId, date),
        onTellPenelope: (prompt) => writePenelopeHandoff(trip, city.id, selectedDate, prompt),
        onMarkSafe: (item, mode) => openSafeMark(item, mode)
      });
      dayMapHandle?.destroy();
      dayMapHandle = null;
      const dayItems = orderDayItems(itemsForCityDay(trip, city.id, selectedDate), selectedDate);
      const render = ++dayMapRender;
      void import('@/components/day-map').then(({ renderDayMap }) => {
        if (render !== dayMapRender || !mapInner.isConnected) return;
        dayMapHandle = renderDayMap(mapInner, city, dayItems, {
          cooperativeGestures: window.innerWidth < 720,
          viewDate: selectedDate
        });
        dayMapHandle.onSelect((itemId) => {
          listCol.querySelectorAll('.stop').forEach((el) => el.classList.remove('is-on'));
          listCol.querySelector(`[data-item-id="${itemId}"]`)?.classList.add('is-on');
        });
      });
    }
    function renderDayBarState(): void {
      dayBar.querySelectorAll('.daybtn').forEach((btn, i) => btn.classList.toggle('is-on', dates[i] === selectedDate));
    }
    renderDay();
  }

  /** Switch city without clearing the selected date (used for travel-day jumps). */
  function showCity(cityId: string): void {
    selectedCityId = cityId;
    worldMap.selectCity(cityId);
    updateChips();
    renderCityScene();
  }

  function selectCity(cityId: string): void {
    selectedDate = '';
    showCity(cityId);
  }

  function travelDayNote(siblings: City[]): HTMLElement {
    const note = document.createElement('div');
    note.className = 'travel-day-note';
    const label = document.createElement('p');
    label.textContent = `Travel day — also in ${siblings.map((s) => s.name).join(', ')}. Items stay under the city you tagged them with.`;
    note.append(label);
    for (const sibling of siblings) {
      const jump = document.createElement('button');
      jump.type = 'button';
      jump.className = 'btn ghost';
      jump.textContent = `Open ${sibling.name}`;
      jump.addEventListener('click', () => showCity(sibling.id));
      note.append(jump);
    }
    return note;
  }

  worldMap.onSelect((cityId) => selectCity(cityId));

  function sheetHandlers(formHost: HTMLElement) {
    return {
      onSaved: (updated: Trip, nextVersion: string) => {
        trip = updated;
        version = nextVersion;
        formHost.remove();
        renderCityScene();
      },
      onClose: () => formHost.remove()
    };
  }

  function openForm(item?: (typeof trip.items)[number], cityId?: string, date?: string): void {
    const formHost = document.createElement('div');
    document.body.append(formHost);
    renderAddForm(formHost, {
      trip,
      tripId,
      version,
      editing: item,
      cityId: cityId ?? selectedCityId,
      date: date ?? selectedDate,
      ...sheetHandlers(formHost)
    });
  }

  function openCityDates(city: City): void {
    const formHost = document.createElement('div');
    document.body.append(formHost);
    renderCityDatesForm(formHost, {
      trip,
      tripId,
      version,
      city,
      ...sheetHandlers(formHost)
    });
  }

  function openAddCity(): void {
    const formHost = document.createElement('div');
    document.body.append(formHost);
    renderCityForm(formHost, {
      trip,
      tripId,
      version,
      onClose: () => formHost.remove(),
      onSaved: (_updated, _nextVersion, cityId) => {
        formHost.remove();
        const city = _updated.cities.find((c) => c.id === cityId);
        const date = city?.start_date ?? trip.start_date;
        location.hash = `#/trip/${encodeURIComponent(tripId)}/${encodeURIComponent(cityId)}/${date}`;
      }
    });
  }

  async function markItemSafe(item: Item, photoId?: string): Promise<void> {
    const saved = await addCheckin(tripId, {
      city_id: item.city_id,
      label: photoId ? `Photo · ${item.title}` : `Safe · ${item.title}`,
      item_id: item.id,
      photo_id: photoId,
      if_version: version
    });
    trip = saved.trip;
    version = saved.version;
    renderCityScene();
  }

  function openSafeMark(item: Item, mode: 'mark' | 'photo'): void {
    // One-tap mark safe; photo opens the sheet.
    if (mode === 'mark') {
      void markItemSafe(item).catch((err) => {
        window.alert(err instanceof Error ? err.message : 'Could not mark safe.');
      });
      return;
    }
    const formHost = document.createElement('div');
    document.body.append(formHost);
    renderSafePhotoSheet(formHost, {
      item,
      mode: 'photo',
      onClose: () => formHost.remove(),
      onConfirm: async (file) => {
        if (!file) throw new Error('Choose a photo to share.');
        const uploaded = await uploadTravelPhoto(tripId, file);
        await markItemSafe(item, uploaded.photo_id);
        formHost.remove();
      }
    });
  }

  addCityBtn.addEventListener('click', () => openAddCity());
  addBtn.addEventListener('click', () => {
    if (trip.cities.length === 0) {
      openAddCity();
      return;
    }
    openForm();
  });

  publicBtn.addEventListener('click', () => {
    const host = document.createElement('div');
    document.body.append(host);
    renderShareSheet(host, {
      tripId,
      existingUrl: trip.share.enabled ? undefined : null
    });
  });

  updateChips();
  selectCity(selectedCityId);
}

async function startWhereAmI(
  map: import('maplibre-gl').Map,
  mapBox: HTMLElement,
  city: City,
  date: string,
  trip: Trip
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  if (today < trip.start_date) {
    window.alert('The trip has not started yet — location is not needed.');
    return;
  }
  if (!navigator.geolocation) {
    window.alert('Location is off. Turn it on in Settings › Safari › Location.');
    return;
  }
  mapBox.querySelector('.where-note')?.remove();
  const note = document.createElement('p');
  note.className = 'where-note';
  note.textContent = 'Finding you…';
  mapBox.append(note);

  const dayItems = orderDayItems(itemsForCityDay(trip, city.id, date), date);
  const now = new Date();
  const next = dayItems.find((item) => {
    if (!item.time || !itemPlace(item)) return false;
    return zonedToInstant(item.date, item.time, city.tz) >= now;
  });

  // Already loaded: the day map this runs against imported maplibre-gl.
  const { Marker: MarkerCtor } = await import('maplibre-gl');
  let meMarker: Marker | null = null;
  const watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      if (!meMarker) {
        const el = document.createElement('div');
        el.className = 'where-dot';
        meMarker = new MarkerCtor({ element: el }).setLngLat([longitude, latitude]).addTo(map);
      } else {
        meMarker.setLngLat([longitude, latitude]);
      }
      if (next) {
        const place = itemPlace(next)!;
        const metres = haversineMetres(
          { lat: latitude, lon: longitude },
          { lat: place.lat, lon: place.lon }
        );
        const mins = Math.max(1, Math.round((metres * 1.3) / 80));
        note.textContent = `You're about ${Math.round(metres)} m from ${next.title}, ≈ ${mins} min walk`;
      } else {
        note.textContent = 'No more timed stops today.';
      }
    },
    () => {
      note.textContent = 'Location is off. Turn it on in Settings › Safari › Location.';
      navigator.geolocation.clearWatch(watchId);
    },
    { enableHighAccuracy: true }
  );
}

function haversineMetres(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.min(1, Math.sqrt(s)));
}
