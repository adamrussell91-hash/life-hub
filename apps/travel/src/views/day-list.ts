import type { Checkin, Hop, Item, Trip } from '@/types';
import { travelPhotoUrl } from '@/api/travel';
import { formatAud } from '@/lib/money';
import { formatShortRange, formatTicketMoment } from '@/lib/date-label';
import { dateInZone, formatInZone, zonedToInstant } from '@/lib/time';
import {
  hopFallback,
  isOvernightTicket,
  itemPlace,
  itemsForCityDay,
  numberStops,
  orderDayItems,
  showArrivalGuide
} from '@/model/day';
import { canMarkSafe, formatSafeTime, safeByItemId } from '@/lib/safe-mark';
import { I } from '@/lib/icons';

export interface DayListOptions {
  isPublic?: boolean;
  /** Share-link token so public photo URLs authenticate. */
  shareToken?: string | null;
  selectedId?: string | null;
  directionsApp?: 'google' | 'naver';
  cityTz?: string;
  onSelect?: (itemId: string) => void;
  onEdit?: (item: Item) => void;
  onAddAt?: (cityId: string, date: string) => void;
  onTellPenelope?: (prompt: string) => void;
  /** Owner: edit Soft Landing tips for this city. */
  onEditArrivalGuide?: () => void;
  /** Owner: open mark-safe / add-photo sheet for this stop. */
  onMarkSafe?: (item: Item, mode: 'mark' | 'photo') => void;
}

type PublicSafeFields = { safe_at?: string; safe_photo_id?: string };

function guideIconHtml(icon: string): string {
  const map: Record<string, string> = { phone: I.phone, transport: I.train, money: I.money, weather: I.temp, paperwork: I.doc };
  return map[icon] ?? I.doc;
}

function tagFor(item: Item): { cls: string; label: string } | null {
  if (item.status === 'todo') return { cls: 'todo', label: 'Need to book' };
  if (item.status === 'booked') return { cls: 'booked', label: 'Booked' };
  if (item.status === 'idea') return { cls: 'idea', label: 'Idea' };
  if (item.kind === 'med') return { cls: 'med', label: 'Private' };
  if (item.kind === 'post') return { cls: 'post', label: 'Post home' };
  return null;
}

function resolveSafe(
  item: Item,
  byItem: Map<string, Checkin>
): { at: string; photoId?: string } | null {
  const publicItem = item as Item & PublicSafeFields;
  if (publicItem.safe_at) {
    return { at: publicItem.safe_at, photoId: publicItem.safe_photo_id };
  }
  const live = byItem.get(item.id);
  return live ? { at: live.at, photoId: live.photo_id } : null;
}

function appendSafeMark(
  meta: HTMLElement,
  item: Item,
  options: DayListOptions,
  byItem: Map<string, Checkin>
): void {
  if (!canMarkSafe(item)) return;
  const safe = resolveSafe(item, byItem);
  const tz = options.cityTz || 'UTC';

  if (safe) {
    const badge = document.createElement('span');
    badge.className = 'safe-mark is-safe';
    badge.innerHTML = `${I.check}<span>Safe · ${formatSafeTime(safe.at, tz)}</span>`;
    badge.title = `Marked safe at ${safe.at}`;
    meta.append(badge);

    if (safe.photoId) {
      const img = document.createElement('img');
      img.className = 'safe-mark__photo';
      img.alt = `Photo from ${item.title}`;
      img.src = travelPhotoUrl(safe.photoId, options.shareToken);
      img.loading = 'lazy';
      meta.append(img);
    } else if (!options.isPublic && options.onMarkSafe) {
      const addPhoto = document.createElement('button');
      addPhoto.type = 'button';
      addPhoto.className = 'mini safe-mark__photo-btn';
      addPhoto.innerHTML = `${I.camera}Photo`;
      addPhoto.addEventListener('click', (e) => {
        e.stopPropagation();
        options.onMarkSafe?.(item, 'photo');
      });
      meta.append(addPhoto);
    }
    return;
  }

  if (options.isPublic || !options.onMarkSafe) return;

  const tick = document.createElement('button');
  tick.type = 'button';
  tick.className = 'safe-mark safe-mark__btn';
  tick.innerHTML = `${I.check}<span>Mark safe</span>`;
  tick.title = 'Mark safe for people following along';
  tick.addEventListener('click', (e) => {
    e.stopPropagation();
    options.onMarkSafe?.(item, 'mark');
  });
  meta.append(tick);
}

function renderCard(
  item: Item,
  number: number | undefined,
  options: DayListOptions,
  hop: Hop | undefined,
  byItem: Map<string, Checkin>
): HTMLElement {
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
  else if (item.kind === 'post' && !number) dot.innerHTML = I.post;
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
    const overnight = isOvernightTicket(item);
    const departLabel = document.createElement('span');
    departLabel.className = 'hm';
    const departB = document.createElement('b');
    departB.textContent = formatTicketMoment(item.date, item.depart_time, overnight);
    departLabel.append('Departs', departB);
    const arriveLabel = document.createElement('span');
    arriveLabel.className = 'hm r';
    const arriveB = document.createElement('b');
    arriveB.textContent = formatTicketMoment(item.arrive_date || item.date, item.arrive_time, overnight);
    arriveLabel.append('Arrives', arriveB);
    const tagsWrap = document.createElement('div');
    tagsWrap.className = 'meta';
    if (overnight) {
      const span = document.createElement('span');
      span.className = 'ticket-span';
      span.textContent = `${formatShortRange(item.date, item.arrive_date)} · overnight`;
      tagsWrap.append(span);
    }
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
    // Tickets are not location stops — no mark-safe control.
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
    appendSafeMark(meta, item, options, byItem);
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
  const listOptions: DayListOptions = {
    ...options,
    directionsApp: options.directionsApp ?? city?.directions_app,
    cityTz: options.cityTz ?? city?.tz
  };
  const dayItems = itemsForCityDay(trip, cityId, date);
  const ordered = orderDayItems(dayItems, date);
  const numbers = numberStops(ordered);
  const pinnedOrder = ordered.filter((item) => numbers.has(item.id));

  const list = document.createElement('div');
  list.className = 'list';

  if (showArrivalGuide(trip, cityId, date) && (city?.arrival_guide || options.onEditArrivalGuide)) {
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
    heading.append(k, city?.arrival_guide?.title || `Landing in ${city?.name ?? 'city'}`);
    summary.append(heading);
    const dl = document.createElement('dl');
    for (const row of city?.arrival_guide?.rows || []) {
      const dt = document.createElement('dt');
      dt.innerHTML = guideIconHtml(row.icon);
      const dd = document.createElement('dd');
      dd.innerHTML = row.text;
      dl.append(dt, dd);
    }
    guide.append(summary, dl);
    if (!options.isPublic && options.onEditArrivalGuide) {
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'mini landing-edit';
      edit.textContent = 'Edit tips';
      edit.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        options.onEditArrivalGuide?.();
      });
      guide.append(edit);
    }
    list.append(guide);
  }

  if (ordered.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'Nothing planned yet. Add something and it shows up here.';
    list.append(empty);
  }

  const safeByItem = safeByItemId(trip.checkins);
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
    list.append(renderCard(item, numbers.get(item.id), listOptions, hop, safeByItem));
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
