/** Distinct 18px outline paths per rail destination (RAIL.md). */

export const RAIL_ICON_PATHS: Record<string, string[]> = {
  board: ['M4 6h7v5H4z', 'M13 6h7v5h-7z', 'M4 14h7v5H4z', 'M13 14h7v5h-7z'],
  goals: ['M4 18V6', 'M8 6v12', 'M12 10v8', 'M16 4v14', 'M20 8v10'],
  someday: ['M4 16c3-4 6-6 8-6s5 2 8 6', 'M4 16h16', 'M8 20h8'],
  clare: ['M4 6h16v9H8l-4 3V6z'],
  graph: [
    'M6 12a2.25 2.25 0 1 1 0-4.5A2.25 2.25 0 0 1 6 12z',
    'M18 7a2.25 2.25 0 1 1 0-4.5A2.25 2.25 0 0 1 18 7z',
    'M16 20a2.25 2.25 0 1 1 0-4.5A2.25 2.25 0 0 1 16 20z',
    'M8 11l8-3.2',
    'M8 13l6.4 3.6'
  ],
  maps: ['M4 6l5 2 6-3 5 2v13l-5-2-6 3-5-2z', 'M9 8v13', 'M15 5v13'],
  gantt: ['M5 7h9', 'M5 12h14', 'M5 17h7'],
  orbit: ['M12 12a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z', 'M12 4.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15z'],
  universe: [
    'M12 12a2.2 2.2 0 1 1 0-4.4A2.2 2.2 0 0 1 12 12z',
    'M8 16a8 3.2 0 1 1 8 0',
    'M18.4 8.2a1.35 1.35 0 1 1 0-2.7 1.35 1.35 0 0 1 0 2.7z'
  ],
  branch: ['M6 5v14', 'M6 8h8a3 3 0 0 1 3 3v0', 'M6 16h8a3 3 0 0 0 3-3'],
  constellation: ['M12 4l1.4 4.2H18l-3.6 2.6 1.4 4.2L12 12.4 8.2 15l1.4-4.2L6 8.2h4.6z'],
  day: ['M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8z', 'M12 3v2', 'M12 19v2', 'M4 12h2', 'M18 12h2'],
  week: ['M6 4v3', 'M18 4v3', 'M5 7h14v13H5z', 'M5 11h14'],
  month: ['M6 4v3', 'M18 4v3', 'M5 7h14v13H5z', 'M9 14h2', 'M13 14h2', 'M9 17h2'],
  list: ['M8 7h12', 'M8 12h12', 'M8 17h12', 'M5 7h.01', 'M5 12h.01', 'M5 17h.01'],
  projects: ['M4 8h6l2 2h8v10H4z'],
  excursions: ['M7 4v16', 'M7 5h10l-2.5 3L17 11H7'],
  programs: [
    'M8 20h8',
    'M12 16v4',
    'M7 5h10v6a5 5 0 0 1-10 0V5z',
    'M7 5H4.8A1.8 1.8 0 0 0 6.6 7',
    'M17 5h2.2A1.8 1.8 0 0 1 17.4 7'
  ],
  stress: ['M4 13h4l2-6 3 10 2-4h5'],
  corey: ['M16 8a3 3 0 1 1-2.8 4', 'M8 12H4m0 0 2.5-2.5M4 12l2.5 2.5'],
  templates: ['M9 4h10v16H9z', 'M5 8h4', 'M5 8v12h8'],
  search: ['M11 11a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z', 'M14.5 14.5 19 19'],
  properties: ['M5 7h14v3H5z', 'M7 11h10v8H7z', 'M9 14h2', 'M13 14h2']
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
  return createOutlineIcon(RAIL_ICON_PATHS[id] ?? RAIL_ICON_PATHS.board!);
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

export function plusIcon(): SVGSVGElement {
  return createOutlineIcon(['M12 5v14', 'M5 12h14']);
}

export function filterIcon(): SVGSVGElement {
  return createOutlineIcon(['M5 6h14l-5.2 6.4v4.2L10.2 19v-6.6L5 6z']);
}
