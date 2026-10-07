import { geoInterpolate, geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import worldAtlas from 'world-atlas/land-110m.json';
import type { Trip, TicketItem } from '@/types';
import { I } from '@/lib/icons';
import { zoomable } from '@/lib/zoomable';
import { formatWeekdayDate } from '@/lib/date-label';

const VIEW_W = 1000;
const VIEW_H = 540;

/** A dot on the route: a trip city, or home (where the trip starts). */
interface RoutePoint {
  id: string;
  name: string;
  center: { lat: number; lon: number };
  isHome?: boolean;
}

interface Leg {
  fromCity: RoutePoint;
  toCity: RoutePoint;
  booked: boolean;
  rail: boolean;
  statusHtml: string;
}

/** Trips store only `home_tz`; this places home on the map so the first leg
 * (e.g. SYD → KUL) is drawn, as in the mockup. */
const HOME_POINTS: Record<string, Omit<RoutePoint, 'id' | 'isHome'>> = {
  'Australia/Sydney': { name: 'Sydney', center: { lat: -33.8688, lon: 151.2093 } }
};

function routeStops(trip: Trip): RoutePoint[] {
  const ordered = [...trip.cities].sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
  const home = HOME_POINTS[trip.home_tz];
  return home ? [{ id: 'home', ...home, isHome: true }, ...ordered] : ordered;
}

const escapeHtml = (text: string): string =>
  text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** One leg per consecutive pair of route stops, in trip order. Tickets are
 * filed under their arrival city (`city_id === arrive_city_id`), so the
 * from-city is the previous stop; a ticket is the leg into a city only when it
 * departs or lands on that city's first day (a Glasgow → Fort William train
 * inside Scotland is not the Istanbul → Scotland leg). */
export function tripLegs(trip: Trip): Leg[] {
  const stops = routeStops(trip);
  const tickets = trip.items.filter(
    (item): item is TicketItem => item.kind === 'flight' || item.kind === 'train'
  );
  const legs: Leg[] = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i]!;
    const b = stops[i + 1]!;
    const city = trip.cities.find((c) => c.id === b.id);
    const t = city
      ? tickets.find(
          (x) =>
            (x.arrive_city_id ?? x.city_id) === b.id &&
            (x.date === city.start_date || x.arrive_date === city.start_date)
        )
      : undefined;
    if (t) {
      const overnight = t.arrive_date !== t.date;
      const head = overnight
        ? `${formatWeekdayDate(t.date)} – ${formatWeekdayDate(t.arrive_date)} · ${t.from_code} → ${t.to_code}.`
        : `${formatWeekdayDate(t.date)} · ${t.from_code} → ${t.to_code}.`;
      legs.push({
        fromCity: a,
        toCity: b,
        booked: t.status === 'booked',
        rail: t.kind === 'train',
        statusHtml: `<b>${escapeHtml(head)}</b> ${escapeHtml(`${t.carrier} ${t.number}`)}.${
          overnight ? ' Overnight.' : ''
        } ${t.status === 'booked' ? 'Booked.' : 'Not booked yet.'}`
      });
    } else {
      legs.push({
        fromCity: a,
        toCity: b,
        booked: false,
        rail: false,
        statusHtml: `<b>${escapeHtml(`${a.name} → ${b.name}.`)}</b> Not booked yet.`
      });
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
  const stops = routeStops(trip);
  if (stops.length > 0) {
    const box = {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: stops.map((c) => [c.center.lon, c.center.lat])
      },
      properties: {}
    };
    projection.fitExtent(
      [
        // Bottom and right leave room for the status chip / Replay footer and
        // the zoom control, which overlay the map (Sydney sat under Replay).
        [40, 50],
        [VIEW_W - 90, VIEW_H - 90]
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
  type Box = { x: number; y: number; w: number; h: number };
  const hit = (p: Box, q: Box) => p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
  const projected = stops
    .map((stop) => ({ stop, p: projection([stop.center.lon, stop.center.lat]) }))
    .filter((e): e is { stop: RoutePoint; p: [number, number] } => Boolean(e.p));
  // Dots are obstacles for every label; labels are placed in route order.
  const taken: Box[] = projected.map(({ p }) => ({ x: p[0] - 9, y: p[1] - 9, w: 18, h: 18 }));
  // Label to the right of the dot (mockup), then below/above, then the left side.
  const candidates: { anchor: 'start' | 'end' | 'middle'; dx: number; dy: number }[] = [
    { anchor: 'start', dx: 12, dy: 6 },
    { anchor: 'start', dx: 12, dy: 22 },
    { anchor: 'start', dx: 12, dy: -8 },
    { anchor: 'end', dx: -12, dy: 6 },
    { anchor: 'end', dx: -12, dy: 22 },
    { anchor: 'end', dx: -12, dy: -8 },
    { anchor: 'middle', dx: 0, dy: -14 },
    { anchor: 'middle', dx: 0, dy: 28 }
  ];
  for (const { stop, p } of projected) {
    const [x, y] = p;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'stop cs');
    g.dataset.x = String(x);
    g.dataset.y = String(y);
    g.setAttribute('transform', `translate(${x},${y})`);
    if (!stop.isHome) {
      g.dataset.cityId = stop.id;
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label', stop.name);
    } else {
      g.classList.add('is-home');
    }

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('r', '7');
    g.append(circle);

    const w = stop.name.length * 9.4;
    const boxFor = (c: (typeof candidates)[number]): Box => ({
      x: x + c.dx - (c.anchor === 'end' ? w : c.anchor === 'middle' ? w / 2 : 0),
      y: y + c.dy - 14,
      w,
      h: 18
    });
    const pick = candidates.find((c) => !taken.some((t) => hit(boxFor(c), t))) ?? candidates[0]!;
    taken.push(boxFor(pick));
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.textContent = stop.name;
    text.setAttribute('text-anchor', pick.anchor);
    text.setAttribute('x', String(pick.dx));
    text.setAttribute('y', String(pick.dy));
    g.append(text);

    stopsGroup.append(g);
  }
  svg.append(stopsGroup);

  const mover = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  mover.setAttribute('class', 'mover cs');
  const planePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  planePath.setAttribute(
    'd',
    'M16 21h-2l-5-8H3.5a1.5 1.5 0 0 1 0-3H9l5-8h2l-2.5 8H19l1.5-2H22l-1 3.5 1 3.5h-1.5L19 13h-5.5z'
  );
  const trainG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const trainPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  trainPath.setAttribute('d', 'M2 8h11v9H2zM13 11h6l4 3v3H13zM6 3h3v5H6z');
  trainPath.setAttribute('transform', 'translate(-14,-14) scale(1.2)');
  const puff = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  puff.setAttribute('class', 'puff');
  puff.setAttribute('x', '14');
  puff.setAttribute('y', '-16');
  puff.textContent = 'choo choo!';
  trainG.append(trainPath, puff);
  trainG.setAttribute('visibility', 'hidden');
  mover.append(planePath, trainG);
  mover.dataset.x = '0';
  mover.dataset.y = '0';
  svg.append(mover);

  wrap.append(svg);

  const footer = document.createElement('div');
  footer.className = 'world-foot';
  const statusChip = document.createElement('div');
  statusChip.className = 'status-chip';
  const firstLeg = legs[0];
  statusChip.setAttribute('aria-live', 'polite');
  statusChip.innerHTML = firstLeg ? firstLeg.statusHtml : 'No legs yet.';
  const replayBtn = document.createElement('button');
  replayBtn.type = 'button';
  replayBtn.className = 'btn';
  replayBtn.innerHTML = `${I.play}Replay the trip`;
  footer.append(statusChip, replayBtn);
  wrap.append(footer);
  host.append(wrap);

  let zoomK = 1;
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
      // rAF timestamps are the frame start and can precede `start`; a negative
      // elapsed made legIndex -1 → legs[-1].fromCity threw and froze the map.
      const elapsed = Math.max(0, now - start);
      const legIndex = Math.min(legs.length - 1, Math.floor(elapsed / perLegMs));
      const leg = legs[legIndex]!;
      const t = Math.min(1, (elapsed - legIndex * perLegMs) / perLegMs);
      placeMoverAt(leg, t);
      if (statusChip.dataset.leg !== String(legIndex)) {
        statusChip.dataset.leg = String(legIndex);
        statusChip.innerHTML = leg.statusHtml;
      }
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
    mover.setAttribute('transform', `translate(${p[0]},${p[1]}) scale(${zoomK})`);
    // The plane path's nose points left: flip it, then turn it along the leg.
    planePath.setAttribute('transform', `rotate(${angleDeg}) scale(-1.4,1.4) translate(-12,-12)`);
    planePath.setAttribute('visibility', leg.rail ? 'hidden' : 'visible');
    trainG.setAttribute('visibility', leg.rail ? 'visible' : 'hidden');
  }

  replayBtn.addEventListener('click', animateMover);
  animateMover();

  zoomable(svg, wrap, {
    onChange: (k) => {
      zoomK = k;
    }
  });

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
