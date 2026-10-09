import { getPublicTrip, type PublicTrip } from '@/api/travel';
import { daysForCity } from '@/model/day';
import { renderScene } from '@/scenes';
import { renderWorldMap } from '@/components/world-map';
import { renderDayList } from '@/views/day-list';
import { formatInZone } from '@/lib/time';

/** Public read-only trip page (TR-50), served without a session. No Add,
 * Edit, prices, refs or private items. */
export async function renderPublicTrip(root: HTMLElement, token: string): Promise<void> {
  root.replaceChildren();
  let data: PublicTrip;
  try {
    data = await getPublicTrip(token);
  } catch {
    const wrap = document.createElement('div');
    wrap.className = 'wrap';
    wrap.textContent = 'This link has been turned off.';
    root.append(wrap);
    return;
  }
  const trip = data.trip;

  const wrap = document.createElement('div');
  wrap.className = 'wrap';

  const header = document.createElement('div');
  header.className = 'top';
  const checkin = trip.last_checkin;
  const strip = document.createElement('p');
  strip.className = 'crumb';
  strip.textContent = checkin
    ? `Adam's trip · Last check-in ${formatInZone(new Date(checkin.at), 'UTC')} ${checkin.city_name}`
    : `Adam's trip · ${trip.title}`;
  header.append(strip);
  wrap.append(header);

  const worldHost = document.createElement('div');
  wrap.append(worldHost);
  const worldMap = renderWorldMap(worldHost, trip as never);

  const chips = document.createElement('div');
  chips.className = 'chips';
  for (const city of trip.cities) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.innerHTML = `<b>${city.name}</b>`;
    chip.addEventListener('click', () => showCity(city.id));
    chips.append(chip);
  }
  wrap.append(chips);

  const citySection = document.createElement('div');
  citySection.className = 'city';
  wrap.append(citySection);
  root.append(wrap);

  function showCity(cityId: string): void {
    worldMap.selectCity(cityId);
    citySection.replaceChildren();
    const city = trip.cities.find((c) => c.id === cityId);
    if (!city) return;
    citySection.style.setProperty('--city', city.accent.color);
    citySection.style.setProperty('--city-soft', city.accent.soft);
    citySection.style.setProperty('--city-ink', city.accent.ink);

    const scene = document.createElement('div');
    scene.className = 'scene';
    scene.innerHTML = renderScene(city.scene, city.accent);
    citySection.append(scene);

    const dates = daysForCity(trip as never, city.id);
    const dayBar = document.createElement('div');
    dayBar.className = 'daybar';
    const dayHost = document.createElement('div');
    for (const date of dates) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'daybtn';
      btn.textContent = date.slice(8, 10);
      btn.addEventListener('click', () =>
        renderDayList(dayHost, trip as never, city.id, date, { isPublic: true, shareToken: token })
      );
      dayBar.append(btn);
    }
    citySection.append(dayBar, dayHost);
    if (dates[0]) {
      renderDayList(dayHost, trip as never, city.id, dates[0], { isPublic: true, shareToken: token });
    }
  }

  worldMap.onSelect(showCity);
  if (trip.cities[0]) showCity(trip.cities[0].id);
}
