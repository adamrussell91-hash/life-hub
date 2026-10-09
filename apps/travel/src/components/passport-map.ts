import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import countriesAtlas from 'world-atlas/countries-110m.json';
import { zoomable } from '@/lib/zoomable';

const VIEW_W = 1000;
const VIEW_H = 540;

export type PassportMapOptions = {
  visited: Set<string>;
  selected?: string | null;
  onSelect: (atlasCountry: string | null) => void;
};

export type PassportMapHandle = {
  setVisited: (visited: Set<string>) => void;
  setSelected: (selected: string | null) => void;
  destroy: () => void;
};

type CountryFeature = {
  type: string;
  properties: { name?: string };
  geometry: unknown;
};

/** Passport countries map: Natural Earth fills for finished trips, tap to select. */
export function renderPassportMap(
  host: HTMLElement,
  options: PassportMapOptions
): PassportMapHandle {
  host.replaceChildren();

  let visited = new Set(options.visited);
  let selected: string | null = options.selected ?? null;
  const { onSelect } = options;

  const wrap = document.createElement('div');
  wrap.className = 'passport';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement;
  svg.setAttribute('viewBox', `0 0 ${VIEW_W} ${VIEW_H}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Visited countries map');

  const projection = geoNaturalEarth1();
  projection.fitExtent(
    [
      [20, 20],
      [VIEW_W - 20, VIEW_H - 20]
    ],
    { type: 'Sphere' } as never
  );
  const path = geoPath(projection);

  const topology = countriesAtlas as unknown as { objects: Record<string, unknown> };
  const collection = feature(topology as never, topology.objects.countries as never) as unknown as {
    type: string;
    features: CountryFeature[];
  };

  const ocean = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  ocean.setAttribute('class', 'passport-ocean');
  ocean.setAttribute('x', '0');
  ocean.setAttribute('y', '0');
  ocean.setAttribute('width', String(VIEW_W));
  ocean.setAttribute('height', String(VIEW_H));
  svg.append(ocean);

  const countriesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  countriesGroup.setAttribute('class', 'passport-countries');

  for (const country of collection.features) {
    const name = country.properties?.name;
    if (!name) continue;
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    el.setAttribute('class', 'passport-country');
    el.setAttribute('data-country', name);
    el.setAttribute('d', path(country as never) ?? '');
    countriesGroup.append(el);
  }
  svg.append(countriesGroup);
  wrap.append(svg);
  host.append(wrap);

  function applyClasses(): void {
    countriesGroup.querySelectorAll<SVGPathElement>('path.passport-country').forEach((el) => {
      const name = el.getAttribute('data-country') ?? '';
      el.classList.toggle('is-visited', visited.has(name));
      el.classList.toggle('is-on', selected === name);
    });
  }
  applyClasses();

  function onSvgClick(e: MouseEvent): void {
    const target = (e.target as Element | null)?.closest?.('path.passport-country') as
      | SVGPathElement
      | null;
    if (!target || !countriesGroup.contains(target)) {
      if (selected !== null) onSelect(null);
      return;
    }
    const name = target.getAttribute('data-country');
    if (!name || !visited.has(name)) {
      if (selected !== null) onSelect(null);
      return;
    }
    onSelect(selected === name ? null : name);
  }
  svg.addEventListener('click', onSvgClick);

  zoomable(svg, wrap);

  return {
    setVisited(next) {
      visited = new Set(next);
      applyClasses();
    },
    setSelected(next) {
      selected = next;
      applyClasses();
    },
    destroy() {
      svg.removeEventListener('click', onSvgClick);
      host.replaceChildren();
    }
  };
}
