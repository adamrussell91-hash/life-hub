/** Small DOM helpers shared by the story pieces. */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function button(className: string, label?: string): HTMLButtonElement {
  const node = el('button', className, label);
  node.type = 'button';
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A 24px stroke icon from one or more path strings. Decorative: the button carries the label. */
export function icon(paths: string | string[], className = 'story-icon'): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', className);
  for (const d of Array.isArray(paths) ? paths : [paths]) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

export const ICONS = {
  back: 'M15 6l-6 6 6 6',
  next: 'M9 6l6 6-6 6',
  search: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M20 20l-3.5-3.5'],
  more: ['M5 11.1a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8z', 'M12 11.1a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8z', 'M19 11.1a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8z'],
  close: ['M6 6l12 12', 'M18 6 6 18'],
  pin: ['M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z', 'M12 12.4a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8z'],
  story: ['M7 3h10a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M5 15h14', 'M5 19h9'],
  grid: ['M4.5 3h5A1.5 1.5 0 0 1 11 4.5v5A1.5 1.5 0 0 1 9.500 11h-5A1.5 1.5 0 0 1 3 9.500v-5A1.5 1.5 0 0 1 4.500 3z', 'M14.5 3h5A1.5 1.5 0 0 1 21 4.5v5a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 13 9.500v-5A1.5 1.5 0 0 1 14.500 3z', 'M4.5 13h5a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 9.500 21h-5A1.5 1.5 0 0 1 3 19.500v-5A1.5 1.5 0 0 1 4.500 13z', 'M14.5 13h5a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5h-5a1.5 1.5 0 0 1-1.5-1.5v-5a1.5 1.5 0 0 1 1.5-1.5z'],
  keepsake: 'M3 9V6h18v3a3 3 0 0 0 0 6v3H3v-3a3 3 0 0 0 0-6zM14 6v12',
  photos: ['M5.5 5h13A2.5 2.5 0 0 1 21 7.500v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.500v-9A2.5 2.5 0 0 1 5.500 5z', 'M9 11.6a1.600 1.600 0 1 0 0-3.200 1.600 1.600 0 0 0 0 3.200z', 'M4 17l5-4 4 3 3-2 4 3'],
  pen: ['M4 20h4L19 9l-4-4L4 16v4z', 'M13.5 6.500l4 4'],
  play: 'M7 4.500v15l12-7.500z',
  pause: ['M8 5v14', 'M16 5v14'],
  map: ['M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z', 'M9 4v14', 'M15 6v14'],
  meal: ['M6 3v7a2 2 0 0 0 4 0V3', 'M8 10v11', 'M17 3c-2 2-3 4-3 7h3v11'],
  train: ['M9 3h6a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z', 'M6 11h12', 'M9 21l2-4', 'M15 21l-2-4', 'M9.5 14h.01', 'M14.5 14h.01'],
  plane: 'M12 3v7l8 4v2l-8-2v4l2 1.500V21l-2-.600-2 .600v-1.500l2-1.500v-4l-8 2v-2l8-4V3z',
  car: ['M5 16V11l2-5h10l2 5v5', 'M3 16h18v2H3z', 'M7.5 13h.01', 'M16.5 13h.01'],
  ferry: ['M4 15l2-6h12l2 6', 'M3 19c2 1.500 4 1.500 6 0 2 1.500 4 1.500 6 0 2 1.500 4 1.500 6 0', 'M12 9V4'],
  edit: 'M4 20h4L19 9l-4-4L4 16v4z',
  annotate: ['M5.5 5h13A2.5 2.5 0 0 1 21 7.500v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.500v-9A2.5 2.5 0 0 1 5.500 5z', 'M8 9h5v4H8z'],
  reorder: ['M8 6h12', 'M8 12h12', 'M8 18h12', 'M4 6h.01', 'M4 12h.01', 'M4 18h.01'],
  split: ['M12 3v18', 'M5 8l-2 4 2 4', 'M19 8l2 4-2 4'],
  merge: ['M12 3v18', 'M3 8l3 4-3 4', 'M21 8l-3 4 3 4'],
  move: ['M5 12h14', 'M13 6l6 6-6 6'],
  trash: ['M5 7h14', 'M10 7V4h4v3', 'M7 7l1 13h8l1-13'],
  share: ['M12 15V4', 'M8 8l4-4 4 4', 'M5 14v5h14v-5'],
  print: ['M7 9V4h10v5', 'M7 17H5v-6h14v6h-2', 'M8 14h8v6H8z'],
  export: ['M12 4v11', 'M8 11l4 4 4-4', 'M5 19h14'],
  refresh: ['M20 11a8 8 0 1 0-2.300 5.700', 'M20 5v6h-6'],
  people: ['M9 11a3.500 3.500 0 1 0 0-7 3.500 3.500 0 0 0 0 7z', 'M3 20a6 6 0 0 1 12 0', 'M17 11a3 3 0 1 0-1-5.800', 'M21 20a5 5 0 0 0-4-4.900'],
  plus: ['M12 5v14', 'M5 12h14'],
} satisfies Record<string, string | string[]>;
