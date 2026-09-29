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

function renderCard(item: Item, number: number | undefined, options: DayListOptions, hop?: Hop): HTMLElement {
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
  if (item.kind === 'flight') dot.innerHTML = I.planeR;
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

  // Edit joins the card's meta row, right-aligned (.mini has margin-left:auto).
  let editHost: HTMLElement = card;
  if (isTicket) {
    const band = document.createElement('div');
    band.className = 'band';
    const carrier = document.createElement('span');
    carrier.textContent = item.carrier;
    const flightNo = document.createElement('span');
    flightNo.className = 'num';
    flightNo.textContent = item.number;
    band.append(carrier, flightNo);
    const body = document.createElement('div');
    body.className = 'body';
    const from = document.createElement('div');
    from.className = 'iata';
    from.textContent = item.from_code;
    const flight = document.createElement('div');
    flight.className = 'flight';
    const mover = document.createElement('div');
    mover.className = 'v';
    mover.innerHTML = item.kind === 'flight' ? I.planeR : I.trainR;
    flight.append(mover);
    const to = document.createElement('div');
    to.className = 'iata';
    to.textContent = item.to_code;
    body.append(from, flight, to);
    const perf = document.createElement('div');
    perf.className = 'perf';
    const departLabel = document.createElement('span');
    departLabel.className = 'hm';
    const weekday = (d: string) =>
      new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
    const departB = document.createElement('b');
    departB.textContent = item.depart_time ? `${weekday(item.date)} ${item.depart_time}` : 'Time to set';
    departLabel.append('Departs', departB);
    const arriveLabel = document.createElement('span');
    arriveLabel.className = 'hm r';
    const arriveB = document.createElement('b');
    arriveB.textContent = `${weekday(item.arrive_date || item.date)} ${item.arrive_time}`;
    arriveLabel.append('Arrives', arriveB);
    const tagsWrap = document.createElement('div');
    tagsWrap.className = 'meta';
    const tag = tagFor(item);
    if (tag) {
      const tagEl = document.createElement('span');
      tagEl.className = `tag ${tag.cls}`;
      tagEl.textContent = tag.label;
      tagsWrap.append(tagEl);
    }
    if (item.note && !options.isPublic) {
      const note = document.createElement('span');
      note.style.color = 'var(--muted)';
      note.textContent = item.note;
      tagsWrap.append(note);
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
    // Row 2 of the .body grid (mockup): Departs | spacer | Arrives. Appended to
    // the unpadded card instead, they ran flush to its edges.
    body.append(departLabel, document.createElement('span'), arriveLabel);
    editHost = tagsWrap;
    card.append(band, body, perf, tagsWrap);
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
      offMap.style.color = 'var(--muted)';
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
    editHost = meta;

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
      meta.append(mapsLink);
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
    editHost.append(editBtn);
  }

  stop.setAttribute('role', 'button');
  stop.tabIndex = 0;
  stop.setAttribute('aria-label', item.title);
  const select = () => options.onSelect?.(item.id);
  stop.addEventListener('click', select);
  stop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      select();
    }
  });
  // Card column (mockup): the card, then the hop to the next stop under it, so
  // the hop lines up with the cards rather than the timeline rail.
  const col = document.createElement('div');
  col.append(card);
  if (hop) col.append(renderHopRow(hop));
  stop.append(rail, col);
  return stop;
}

function renderHopRow(hop: Hop): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'go';
  const icon = document.createElement('span');
  icon.innerHTML = (I as Record<string, string>)[hop.mode] ?? I.walk;
  const text = document.createElement('span');
  const bits = [
    `<b>${hop.minutes} min</b>`,
    hop.note,
    hop.cost ? `<span class="price">${formatAud(hop.cost)}</span>` : null
  ].filter(Boolean);
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
    guide.className = 'card landing';
    guide.open = true;
    const summary = document.createElement('summary');
    // One span holds eyebrow + title so the summary's space-between leaves
    // just two items: the heading and the +/− marker (mockup).
    const heading = document.createElement('span');
    const k = document.createElement('span');
    k.className = 'k';
    k.textContent = 'Soft landing';
    heading.append(k, city.arrival_guide.title);
    summary.append(heading);
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
      const homeName = trip.home_tz.includes('Sydney') ? 'Sydney' : trip.home_tz;
      // A check-in timed before this day's outbound ticket departs happens at the
      // origin (previous city, or home before the first leg) — e.g. "Boarded" at
      // 22:00 in Sydney, not 22:00 in Kuala Lumpur.
      let whereName = city?.name ?? '';
      let whereTz = city?.tz ?? trip.home_tz;
      const departsLater = item.time
        ? dayItems.some(
            (t) => (t.kind === 'flight' || t.kind === 'train') && t.date === item.date && t.depart_time > item.time!
          )
        : false;
      if (departsLater && city) {
        const byStart = [...trip.cities].sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
        const prev = byStart[byStart.findIndex((c) => c.id === city.id) - 1];
        whereName = prev?.name ?? homeName;
        whereTz = prev?.tz ?? trip.home_tz;
      }
      let homeLabel = '';
      let nextDay = '';
      if (item.time && whereTz !== trip.home_tz) {
        const instant = zonedToInstant(item.date, time, whereTz);
        homeLabel = formatInZone(instant, trip.home_tz);
        if (dateInZone(instant, trip.home_tz) !== item.date) nextDay = ' (next day)';
      }
      const left = document.createElement('span');
      left.innerHTML = `${item.title} · <b>${localLabel} ${whereName}</b>${homeLabel ? ` · ${homeLabel} ${homeName}${nextDay}` : ''}`;
      const follower = document.createElement('span');
      follower.style.marginLeft = 'auto';
      follower.textContent = trip.followers_label;
      row.append(left, follower);
      list.append(row);
      continue;
    }

    if (listOptions.isPublic && (item.private || item.kind === 'med')) continue;

    let hop: Hop | undefined = item.hop;
    if (!hop && numbers.has(item.id) && item.kind !== 'stay') {
      const idx = pinnedOrder.findIndex((p) => p.id === item.id);
      const next = pinnedOrder[idx + 1];
      const fallback = hopFallback(item, next);
      if (fallback) hop = { mode: 'walk', minutes: fallback.minutes };
    }
    list.append(renderCard(item, numbers.get(item.id), listOptions, hop));
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
