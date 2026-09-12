/** Distinct 18px outline paths per rail destination (RAIL.md). */

export const RAIL_ICON_PATHS: Record<string, string[]> = {
  people: [
    'M9 12.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
    'M3.5 19c0-3 2.6-5 5.5-5s5.5 2 5.5 5',
    'M16 8.5a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Z',
    'M14.8 14.3c.5-.13 1-.2 1.5-.2 2.4 0 4.2 1.7 4.2 4.4'
  ],
  organisations: ['M5 20V6.5L12 4l7 2.5V20', 'M9 20v-5h6v5', 'M9 9h.01', 'M12 9h.01', 'M15 9h.01', 'M9 12.5h.01', 'M12 12.5h.01', 'M15 12.5h.01'],
  relationships: [
    'M8 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
    'M16 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
    'M10.4 10.4 13.6 15.6'
  ],
  communications: ['M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4 3.2V16H6.5A2.5 2.5 0 0 1 4 13.5v-7Z'],
  meetings: [
    'M7 4v2',
    'M17 4v2',
    'M5 9h14',
    'M6 7.5h12A1.5 1.5 0 0 1 19.5 9v10A1.5 1.5 0 0 1 18 20.5H6A1.5 1.5 0 0 1 4.5 19V9A1.5 1.5 0 0 1 6 7.5Z',
    'M9 13h2',
    'M13 13h2',
    'M9 16h6'
  ],
  events: [
    'M12 4v3',
    'M8 8.5 12 12l4-3.5',
    'M6.5 18.5h11',
    'M8 14.5h8'
  ]
};

export function createOutlineIcon(paths: string[]): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('hub-rail__icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.75');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

export function railIconFor(id: string): SVGSVGElement {
  return createOutlineIcon(RAIL_ICON_PATHS[id] ?? RAIL_ICON_PATHS.people!);
}

export function refreshIcon(): SVGSVGElement {
  return createOutlineIcon(['M21 12a9 9 0 1 1-2.6-6.3', 'M21 3v6h-6']);
}

export function signOutIcon(): SVGSVGElement {
  return createOutlineIcon([
    'M10 7V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-1',
    'M15 12H3',
    'm7 8-4 4 4 4'
  ]);
}
