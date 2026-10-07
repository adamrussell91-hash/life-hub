import type { Trip } from '@/types';
import { listTrips, getTrip } from '@/api/travel';
import { itemsForCityDay, orderDayItems } from '@/model/day';
import { renderScene } from '@/scenes';
import { renderDayList } from '@/views/day-list';
import { formatInZone } from '@/lib/time';

export interface TodayOptions {
  isCurrent: () => boolean;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Today view (TR-44): current city's scene, a Now card, today's day list,
 * and a large I'm safe button. Previews day 1 before the trip starts. */
export async function renderTodayView(canvas: HTMLElement, options: TodayOptions): Promise<void> {
  canvas.replaceChildren();
  const { trips } = await listTrips();
  if (!options.isCurrent()) return;
  if (trips.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No trip yet. Create one from Trips.';
    canvas.append(empty);
    return;
  }
  const summary = trips[0]!;
  const { trip } = await getTrip(summary.id);
  if (!options.isCurrent()) return;

  const today = todayIso();
  const started = today >= trip.start_date;
  const date = started ? today : trip.start_date;
  const city = trip.cities.find((c) => c.start_date <= date && date <= c.end_date) ?? trip.cities[0];
  if (!city) {
    canvas.append(emptyState());
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'wrap';
  wrap.style.setProperty('--city', city.accent.color);
  wrap.style.setProperty('--city-soft', city.accent.soft);
  wrap.style.setProperty('--city-ink', city.accent.ink);

  if (!started) {
    const preview = document.createElement('p');
    preview.className = 'eyebrow';
    preview.textContent = `Preview: this is what ${friendlyDate(trip.start_date)} will look like`;
    wrap.append(preview);
  }

  const scene = document.createElement('div');
  scene.className = 'scene';
  scene.innerHTML = renderScene(city.scene, city.accent);
  const titleDiv = document.createElement('div');
  titleDiv.className = 'title';
  const h2 = document.createElement('h2');
  h2.textContent = city.title;
  const facts = document.createElement('div');
  facts.className = 'facts';
  const now = document.createElement('span');
  now.textContent = `${formatInZone(new Date(), city.tz)} there now`;
  facts.append(now);
  titleDiv.append(h2, facts);
  scene.append(titleDiv);
  wrap.append(scene);

  const dayItems = orderDayItems(itemsForCityDay(trip, city.id, date), date);
  const nowTime = formatInZone(new Date(), city.tz);
  const next = dayItems.find((item) => item.kind !== 'stay' && (item.time ?? '00:00') >= nowTime);
  const nowCard = document.createElement('div');
  nowCard.className = 'card';
  if (next) {
    const h3 = document.createElement('h3');
    h3.textContent = `Next: ${next.title}`;
    const p = document.createElement('p');
    p.textContent = next.time ? `at ${next.time}` : 'Time to set';
    nowCard.append(h3, p);
    if ('place' in next && next.place) {
      const link = document.createElement('a');
      link.className = 'maps-link';
      link.href = `https://www.google.com/maps/search/?api=1&query=${next.place.lat},${next.place.lon}`;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'Directions ↗';
      nowCard.append(link);
    }
  } else {
    const p = document.createElement('p');
    p.textContent = 'Nothing else planned today.';
    nowCard.append(p);
  }
  wrap.append(nowCard);

  const safeBtn = document.createElement('button');
  safeBtn.type = 'button';
  safeBtn.className = 'btn';
  safeBtn.textContent = "I'm safe";
  const safeStatus = document.createElement('p');
  safeStatus.className = 'hint';
  safeBtn.addEventListener('click', async () => {
    try {
      const { addCheckin } = await import('@/api/travel');
      await addCheckin(trip.id, city.id, 'Safe check-in');
      const nowLocal = formatInZone(new Date(), city.tz);
      const nowHome = formatInZone(new Date(), trip.home_tz);
      safeStatus.textContent = `Checked in ${nowLocal} ${city.name} · ${nowHome} Sydney`;
    } catch {
      safeStatus.textContent = 'Check-in queued — will send when back online.';
    }
  });
  wrap.append(safeBtn, safeStatus);

  const dayHost = document.createElement('div');
  wrap.append(dayHost);
  canvas.append(wrap);
  renderDayList(dayHost, trip, city.id, date, {});
}

function friendlyDate(date: string): string {
  return new Date(date + 'T00:00:00Z').toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC'
  });
}

function emptyState(): HTMLElement {
  const p = document.createElement('p');
  p.className = 'empty-state';
  p.textContent = 'No cities in this trip yet.';
  return p;
}
