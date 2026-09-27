/** Distinct 18px outline paths per rail destination (RAIL.md), Travel's own set. */

export const RAIL_ICON_PATHS: Record<string, string[]> = {
  life: ['M4 11.5 12 4l8 7.5', 'M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9'],
  trip: [
    'M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z'
  ],
  today: [
    'M4 5.5h16a2 2 0 0 1 2 2v10.5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7.5a2 2 0 0 1 2-2Z',
    'M8 3.5v4',
    'M16 3.5v4',
    'M4 10h16',
    'M12 13.5v3.2l2 1.3'
  ],
  trips: [
    'M4 5.5h16v13H4z',
    'M4 10h16',
    'M8 5.5v-2h8v2'
  ],
  add: ['M12 5v14', 'M5 12h14'],
  more: ['M6.5 12a1.15 1.15 0 1 0 0-2.3 1.15 1.15 0 0 0 0 2.3Z', 'M12 12a1.15 1.15 0 1 0 0-2.3 1.15 1.15 0 0 0 0 2.3Z', 'M17.5 12a1.15 1.15 0 1 0 0-2.3 1.15 1.15 0 0 0 0 2.3Z']
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
  return createOutlineIcon(RAIL_ICON_PATHS[id] ?? RAIL_ICON_PATHS.trip!);
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
