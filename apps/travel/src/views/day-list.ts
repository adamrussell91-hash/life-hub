import type { Hop, Item, Trip } from '@/types';
import { formatAud } from '@/lib/money';
import { dateInZone, formatInZone, zonedToInstant } from '@/lib/time';
import { hopFallback, itemPlace, numberStops, orderDayItems, showArrivalGuide } from '@/model/day';
import { I } from '@/lib/icons';

export interface DayListOptions {
  isPublic?: boolean;
  selectedId?: string | null;
  directionsApp?: 'google' | 'naver';
  onSelect?: (itemId: string) => void;
  onEdit?: (item: Item) => void;
  onAddAt?: (cityId: string, date: string) => void;
  onTellPenelope?: (prompt: string) => void;
}

function guideIconHtml(icon: string): string {
  const map: Record<string, string> = { phone: I.phone, transport: I.train, money: I.money, weather: I.temp, paperwork: I.doc };
  return map[icon] ?? I.doc;
}

function tagFor(item: Item): { cls: string; label: string } | null {
  if (item.status === 'todo') return { cls: 'todo', label: 'Need to book' };
  if (item.status === 'booked') return { cls: 'booked', label: 'Booked' };
  if (item.status === 'idea') return { cls: 'idea', label: 'Idea' };
  if (item.kind === 'med') return { cls: 'med', label: 'Private' };
  return null;
}

function renderCard(item: Item, number: number | undefined, options: DayListOptions): HTMLElement {
  const stop = document.createElement('div');
  stop.className = 'stop';
  if (options.selectedId === item.id) stop.classList.add('is-on');
  stop.dataset.itemId = item.id;

  const rail = document.createElement('div');
  rail.className = 'rail';
  const dot = document.createElement('div');
  dot.className = 'dot';
  if (item.kind === 'stay') dot.classList.add('stay');
  if (!itemPlace(item) && item.kind !== 'flight' && item.kind !== 'train' && item.kind !== 'stay') dot.classList.add('off');
  if (item.kind === 'flight') dot.innerHTML = I.plane;
  else if (item.kind === 'train') dot.innerHTML = I.trainR;
  else if (item.kind === 'stay') dot.innerHTML = I.bed;
  else dot.textContent = number ? String(number) : '';
  const line = document.createElement('div');
  line.className = 'line';
  rail.append(dot, line);

  const card = document.createElement('div');
  const isTicket = item.kind === 'flight' || item.kind === 'train';
  card.className = isTicket ? `card ticket${item.kind === 'train' ? ' is-train' : ''}` : 'card';
  if (item.kind === 'med') card.classList.add('med-card');
  if (item.status === 'todo') card.classList.add('gap-card');

  if (isTicket) {
    const band = document.createElement('div');
    band.className = 'band';
    band.textContent = `${item.carrier} · ${item.number}`;
    const body = document.createElement('div');
    body.className = 'body';
    const from = document.createElement('div');
    from.className = 'iata';
    from.textContent = item.from_code;
    const flight = document.createElement('div');
    flight.className = 'flight';
    const mover = document.createElement('div');
    mover.className = 'v';
    mover.innerHTML = item.kind === 'flight' ? I.plane : I.trainR;
    flight.append(mover);
    const to = document.createElement('div');
    to.className = 'iata';
    to.textContent = item.to_code;
    body.append(from, flight, to);
    const perf = document.createElement('div');
    perf.className = 'perf';
    const meta = document.createElement('div');
    meta.className = 'meta';
    const departLabel = document.createElement('span');
    departLabel.className = 'hm';
    departLabel.innerHTML = `${item.depart_time || 'Time to set'}<b>${item.title}</b>`;
    const arriveWeekday = item.arrive_date !== item.date ? ' (next day)' : '';
    const arriveLabel = document.createElement('span');
    arriveLabel.className = 'hm r';
    arriveLabel.innerHTML = `Arrives${arriveWeekday}<b>${item.arrive_time}</b>`;
    const tagsWrap = document.createElement('div');
    tagsWrap.className = 'meta';
    const tag = tagFor(item);
    if (tag) {
      const tagEl = document.createElement('span');
      tagEl.className = `tag ${tag.cls}`;
      tagEl.textContent = tag.label;
      tagsWrap.append(tagEl);
    }
    if (item.cost && !options.isPublic) {
      const price = document.createElement('span');
      price.className = 'price';
      price.textContent = formatAud(item.cost);
      tagsWrap.append(price);
    }
    if (item.link && !options.isPublic) {
      const openLink = document.createElement('a');
      openLink.href = item.link;
      openLink.target = '_blank';
      openLink.rel = 'noopener';
      openLink.className = 'maps-link';
      openLink.textContent = 'Open ticket';
      tagsWrap.append(openLink);
    }
    card.append(band, body, departLabel, arriveLabel, perf, tagsWrap);
  } else {
    const row1 = document.createElement('div');
    row1.className = 'row1';
    const timeSpan = document.createElement('span');
    timeSpan.className = 't';
    timeSpan.textContent = item.time ?? 'Time to set';
    row1.append(timeSpan);
    if (item.kind !== 'checkin_slot' && (item as { off_map_label?: string }).off_map_label && !itemPlace(item)) {
      const offMap = document.createElement('span');
      offMap.className = 't';
      offMap.textContent = (item as { off_map_label?: string }).off_map_label!;
      row1.append(offMap);
    }
    const h3 = document.createElement('h3');
    h3.textContent = item.title;
    const p = document.createElement('p');
    p.textContent = item.note;

    const meta = document.createElement('div');
    meta.className = 'meta';
    const tag = tagFor(item);
    if (tag) {
      const tagEl = document.createElement('span');
      tagEl.className = `tag ${tag.cls}`;
      tagEl.textContent = tag.label;
      meta.append(tagEl);
    }
    if (item.cost && !options.isPublic) {
      const price = document.createElement('span');
      price.className = 'price';
      price.textContent = formatAud(item.cost);
      meta.append(price);
    }

    card.append(row1, h3, p, meta);

    const place = itemPlace(item);
    if (place) {
      const useNaver = options.directionsApp === 'naver';
      const mapsLink = document.createElement('a');
      mapsLink.className = 'maps-link';
      mapsLink.href = useNaver
        ? `https://map.naver.com/p/search/${encodeURIComponent(place.name)}`
        : `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lon}`;
      mapsLink.target = '_blank';
      mapsLink.rel = 'noopener';
      mapsLink.textContent = useNaver ? 'Naver Map ↗' : 'Directions in Google Maps ↗';
      card.append(mapsLink);
    }
  }

  if (!options.isPublic && options.onEdit) {
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'mini';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      options.onEdit?.(item);
    });
    card.append(editBtn);
  }

  stop.addEventListener('click', () => options.onSelect?.(item.id));
  stop.append(rail, card);
  return stop;
}

function renderHopRow(hop: Hop): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'go';
  const icon = document.createElement('span');
  icon.innerHTML = (I as Record<string, string>)[hop.mode] ?? I.walk;
  const text = document.createElement('span');
  const bits = [`<b>${hop.minutes} min</b>`, hop.note, hop.cost ? formatAud(hop.cost) : null].filter(Boolean);
  text.innerHTML = bits.join(' · ');
  wrap.append(icon, text);
  return wrap;
}

/** Renders one day's rows (§5.3) into `container`, in the mockup's order. */
export function renderDayList(
  container: HTMLElement,
  trip: Trip,
  cityId: string,
  date: string,
  options: DayListOptions = {}
): void {
  container.replaceChildren();
  const city = trip.cities.find((c) => c.id === cityId);
  const listOptions: DayListOptions = { ...options, directionsApp: options.directionsApp ?? city?.directions_app };
  const dayItems = trip.items.filter((item) => item.city_id === cityId && item.date === date);
  const ordered = orderDayItems(dayItems);
  const numbers = numberStops(ordered);
  const pinnedOrder = ordered.filter((item) => numbers.has(item.id));

  const list = document.createElement('div');
  list.className = 'list';

  if (showArrivalGuide(trip, cityId, date) && city?.arrival_guide) {
    const guide = document.createElement('details');
    guide.className = 'landing';
    guide.open = true;
    const summary = document.createElement('summary');
    const k = document.createElement('span');
    k.className = 'k';
    k.textContent = 'Arrival guide';
    summary.append(k, document.createTextNode(city.arrival_guide.title));
    const dl = document.createElement('dl');
    for (const row of city.arrival_guide.rows) {
      const dt = document.createElement('dt');
      dt.innerHTML = guideIconHtml(row.icon);
      const dd = document.createElement('dd');
      dd.innerHTML = row.text;
      dl.append(dt, dd);
    }
    guide.append(summary, dl);
    list.append(guide);
  }

  if (ordered.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'Nothing planned yet. Add something and it shows up here.';
    list.append(empty);
  }

  for (const item of ordered) {
    if (item.kind === 'checkin_slot') {
      const row = document.createElement('div');
      row.className = 'checkin';
      const time = item.time ?? '00:00';
      const localLabel = item.time ?? 'Time to set';
      let homeLabel = '';
      let nextDay = '';
      if (item.time && city) {
        const instant = zonedToInstant(item.date, time, city.tz);
        homeLabel = formatInZone(instant, trip.home_tz);
        if (dateInZone(instant, trip.home_tz) !== item.date) nextDay = ' (next day)';
      }
      const homeName = trip.home_tz.includes('Sydney') ? 'Sydney' : trip.home_tz;
      const left = document.createElement('span');
      left.innerHTML = `<b>${item.title}</b> · ${localLabel} ${city?.name ?? ''}${homeLabel ? ` · ${homeLabel} ${homeName}${nextDay}` : ''}`;
      const follower = document.createElement('span');
      follower.style.marginLeft = 'auto';
      follower.textContent = trip.followers_label;
      row.append(left, follower);
      list.append(row);
      continue;
    }

    if (listOptions.isPublic && (item.private || item.kind === 'med')) continue;

    const card = renderCard(item, numbers.get(item.id), listOptions);
    list.append(card);

    const explicitHop = item.hop;
    if (explicitHop) {
      list.append(renderHopRow(explicitHop));
    } else if (numbers.has(item.id) && item.kind !== 'stay') {
      const idx = pinnedOrder.findIndex((p) => p.id === item.id);
      const next = pinnedOrder[idx + 1];
      const fallback = hopFallback(item, next);
      if (fallback) list.append(renderHopRow({ mode: 'walk', minutes: fallback.minutes }));
    }
  }

  if (!options.isPublic) {
    const dayMeta = trip.days.find((d) => d.city_id === cityId && d.date === date);
    const pen = document.createElement('div');
    pen.className = 'pen';
    const av = document.createElement('div');
    av.className = 'av';
    av.textContent = 'P';
    const body = document.createElement('div');
    const em = document.createElement('em');
    em.textContent = 'Penelope · Tonight';
    const prompt = dayMeta?.penelope_prompt ?? 'What stuck with you today?';
    const promptEl = document.createElement('p');
    promptEl.textContent = prompt;
    const tellBtn = document.createElement('button');
    tellBtn.type = 'button';
    tellBtn.className = 'btn';
    tellBtn.textContent = 'Tell Penelope';
    tellBtn.addEventListener('click', () => options.onTellPenelope?.(prompt));
    body.append(em, promptEl, tellBtn);
    pen.append(av, body);
    list.append(pen);

    if (options.onAddAt) {
      const addRow = document.createElement('button');
      addRow.type = 'button';
      addRow.className = 'add-row';
      const label = new Date(date + 'T00:00:00Z').toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC'
      });
      addRow.textContent = `+ Add to ${label}`;
      addRow.addEventListener('click', () => options.onAddAt?.(cityId, date));
      list.append(addRow);
    }
  }

  container.append(list);
}
