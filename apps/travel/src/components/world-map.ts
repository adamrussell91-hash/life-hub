import { geoInterpolate, geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import worldAtlas from 'world-atlas/land-110m.json';
import type { City, Trip } from '@/types';
import { zoomable } from '@/lib/zoomable';
import { formatWeekdayDate } from '@/lib/date-label';

const VIEW_W = 1000;
const VIEW_H = 540;

interface Leg {
  fromCity: City;
  toCity: City;
  booked: boolean;
  rail: boolean;
  statusText: string;
}

function tripLegs(trip: Trip): Leg[] {
  const tickets = trip.items
    .filter((item) => item.kind === 'flight' || item.kind === 'train')
    .sort((a, b) => (a.date === b.date ? a.time!.localeCompare(b.time ?? '') : a.date < b.date ? -1 : 1));
  const legs: Leg[] = [];
  for (const t of tickets) {
    if (t.kind !== 'flight' && t.kind !== 'train') continue;
    const fromCity = trip.cities.find((c) => c.id === t.city_id);
    const toCity = trip.cities.find((c) => c.id === t.arrive_city_id);
    if (!fromCity || !toCity) continue;
    const label = `${formatWeekdayDate(t.date)} · ${t.from_code} → ${t.to_code}. ${t.carrier} ${t.number}.`;
    legs.push({
      fromCity,
      toCity,
      booked: t.status === 'booked',
      rail: t.kind === 'train',
      statusText: t.status === 'booked' ? `${label} Booked.` : `${label} Not booked yet.`
    });
  }
  // Gaps: consecutive cities (by start_date) with no ticket between them.
  const orderedCities = [...trip.cities].sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
  for (let i = 0; i < orderedCities.length - 1; i++) {
    const a = orderedCities[i]!;
    const b = orderedCities[i + 1]!;
    const hasLeg = legs.some(
      (l) => (l.fromCity.id === a.id && l.toCity.id === b.id) || (l.fromCity.id === b.id && l.toCity.id === a.id)
    );
    if (!hasLeg) {
      legs.push({ fromCity: a, toCity: b, booked: false, rail: false, statusText: 'Not booked yet.' });
    }
  }
  return legs;
}

export interface WorldMapHandle {
  svg: SVGSVGElement;
  selectCity: (cityId: string | null) => void;
  onSelect: (cb: (cityId: string) => void) => void;
  replay: () => void;
}

/** World route map (§2.4, §5.1): SVG with d3-geo Natural Earth, land, legs,
 * numbered/labelled city dots, an animated mover, and a status chip. */
export function renderWorldMap(host: HTMLElement, trip: Trip): WorldMapHandle {
  host.replaceChildren();
  const wrap = document.createElement('div');
  wrap.className = 'world';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement;
  svg.setAttribute('viewBox', `0 0 ${VIEW_W} ${VIEW_H}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Route map');

  const projection = geoNaturalEarth1().rotate([-70, 0]);
  const cities = trip.cities;
  if (cities.length > 0) {
    const box = {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: cities.map((c) => [c.center.lon, c.center.lat])
      },
      properties: {}
    };
    projection.fitExtent(
      [
        [40, 40],
        [VIEW_W - 40, VIEW_H - 40]
      ],
      box as never
    );
  } else {
    projection.fitSize([VIEW_W, VIEW_H], { type: 'Sphere' } as never);
  }
  const path = geoPath(projection);

  const topology = worldAtlas as unknown as { objects: Record<string, unknown> };
  const land = feature(topology as never, topology.objects.land as never);
  const landPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  landPath.setAttribute('class', 'land');
  landPath.setAttribute('d', path(land as never) ?? '');
  svg.append(landPath);

  const legsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const legs = tripLegs(trip);
  for (const leg of legs) {
    const from = projection([leg.fromCity.center.lon, leg.fromCity.center.lat]);
    const to = projection([leg.toCity.center.lon, leg.toCity.center.lat]);
    if (!from || !to) continue;
    const interpolate = geoInterpolate(
      [leg.fromCity.center.lon, leg.fromCity.center.lat],
      [leg.toCity.center.lon, leg.toCity.center.lat]
    );
    const steps = leg.rail ? 2 : 60;
    const points: [number, number][] = [];
    for (let i = 0; i <= steps; i++) {
      const p = projection(interpolate(i / steps));
      if (p) points.push(p);
    }
    const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ');
    const legPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    legPath.setAttribute('d', d);
    legPath.setAttribute(
      'class',
      `leg${leg.rail ? ' train' : ''}${leg.booked ? '' : ' todo'}`
    );
    legPath.dataset.legId = `${leg.fromCity.id}-${leg.toCity.id}`;
    legsGroup.append(legPath);
  }
  svg.append(legsGroup);

  const stopsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const placedLabels: { x: number; y: number; w: number; h: number }[] = [];
  for (const city of cities) {
    const p = projection([city.center.lon, city.center.lat]);
    if (!p) continue;
    const [x, y] = p;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'stop cs');
    g.dataset.cityId = city.id;
    g.dataset.x = String(x);
    g.dataset.y = String(y);
    g.setAttribute('transform', `translate(${x},${y})`);
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', city.name);

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('r', '7');
    g.append(circle);

    // Label offset: alternate above/below to reduce overlap (C1 basic pass).
    const above = placedLabels.length % 2 === 0;
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.textContent = city.name;
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('y', above ? '-14' : '22');
    g.append(text);
    placedLabels.push({ x, y, w: city.name.length * 8, h: 16 });

    stopsGroup.append(g);
  }
  svg.append(stopsGroup);

  const mover = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  mover.setAttribute('class', 'mover cs');
  const moverPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  moverPath.setAttribute('d', 'M-8 0h16l-4 4h-8z');
  mover.append(moverPath);
  mover.dataset.x = '0';
  mover.dataset.y = '0';
  svg.append(mover);

  wrap.append(svg);

  const footer = document.createElement('div');
  footer.className = 'world-foot';
  const statusChip = document.createElement('div');
  statusChip.className = 'status-chip';
  const firstLeg = legs[0];
  statusChip.textContent = firstLeg ? firstLeg.statusText : 'No legs yet.';
  const replayBtn = document.createElement('button');
  replayBtn.type = 'button';
  replayBtn.className = 'btn ghost';
  replayBtn.textContent = 'Replay';
  footer.append(statusChip, replayBtn);
  wrap.append(footer);
  host.append(wrap);

  let animationFrame: number | null = null;
  function animateMover(): void {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    if (legs.length === 0) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      placeMoverAt(legs[legs.length - 1]!, 1);
      return;
    }
    const start = performance.now();
    const perLegMs = 1400;
    function frame(now: number): void {
      const elapsed = now - start;
      const legIndex = Math.min(legs.length - 1, Math.floor(elapsed / perLegMs));
      const leg = legs[legIndex]!;
      const t = Math.min(1, (elapsed - legIndex * perLegMs) / perLegMs);
      placeMoverAt(leg, t);
      statusChip.textContent = leg.statusText;
      if (elapsed < legs.length * perLegMs) {
        animationFrame = requestAnimationFrame(frame);
      }
    }
    animationFrame = requestAnimationFrame(frame);
  }

  function placeMoverAt(leg: Leg, t: number): void {
    const interpolate = geoInterpolate(
      [leg.fromCity.center.lon, leg.fromCity.center.lat],
      [leg.toCity.center.lon, leg.toCity.center.lat]
    );
    const p = projection(interpolate(t));
    const pNext = projection(interpolate(Math.min(1, t + 0.01)));
    if (!p) return;
    mover.dataset.x = String(p[0]);
    mover.dataset.y = String(p[1]);
    let angleDeg = 0;
    if (pNext) angleDeg = (Math.atan2(pNext[1] - p[1], pNext[0] - p[0]) * 180) / Math.PI;
    mover.setAttribute('transform', `translate(${p[0]},${p[1]}) rotate(${angleDeg})`);
  }

  replayBtn.addEventListener('click', animateMover);
  animateMover();

  zoomable(svg, wrap, {});

  let onSelectCb: ((cityId: string) => void) | null = null;
  stopsGroup.querySelectorAll<SVGGElement>('.stop').forEach((g) => {
    const select = () => {
      const cityId = g.dataset.cityId;
      if (cityId) onSelectCb?.(cityId);
    };
    g.addEventListener('click', select);
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        select();
      }
    });
  });

  function selectCity(cityId: string | null): void {
    stopsGroup.querySelectorAll('.stop').forEach((g) => {
      g.classList.toggle('is-on', (g as HTMLElement).dataset.cityId === cityId);
    });
  }

  return {
    svg,
    selectCity,
    onSelect: (cb) => {
      onSelectCb = cb;
    },
    replay: animateMover
  };
}
