import { keepsakeLabel } from '@/journal/keepsakes/draw';
import { countKept, type Keepsake, type StampKeepsake } from '@/journal/keepsakes/model';
import { button, el } from '@/journal/story/dom';

export interface KeepsakeBoardCity {
  id: string;
  name: string;
  /** "Arrived 3 Mar 2027", or empty when the city has no dates. */
  arrived: string;
}

export interface KeepsakeBoardOptions {
  keepsakes: Keepsake[];
  cities: KeepsakeBoardCity[];
  draw: (keepsake: Keepsake) => HTMLElement;
  onOpen: (keepsake: Keepsake, from: HTMLElement) => void;
  /** Omitted when the journal cannot be saved to. */
  onKeep?: (from: HTMLElement) => void;
}

/** Small, fixed angles so the board looks laid out by hand and never jumps between paints. */
export const BOARD_TILTS = [-4, 3, -2, 5, -3, 2];

export function boardCountLine(keepsakes: Keepsake[]): string {
  const kept = countKept(keepsakes);
  if (kept === 0) return 'Nothing kept yet';
  const booked = keepsakes.filter((k) => k.type === 'booking').length;
  if (booked === 0) return `${kept} kept`;
  if (booked === kept) return `${kept} kept, all from your bookings`;
  return `${kept} kept, ${booked} of them from your bookings`;
}

function itemButton(keepsake: Keepsake, index: number, options: KeepsakeBoardOptions): HTMLButtonElement {
  const btn = button(`keep-board__item keep-board__item--${keepsake.type}`);
  btn.setAttribute('data-keepsake-id', keepsake.id);
  btn.setAttribute('aria-label', `Open keepsake: ${keepsakeLabel(keepsake)}`);
  btn.style.setProperty('--keep-tilt', `${BOARD_TILTS[index % BOARD_TILTS.length]}deg`);
  btn.append(options.draw(keepsake));
  btn.addEventListener('click', () => options.onOpen(keepsake, btn));
  return btn;
}

function section(
  heading: HTMLElement,
  items: Keepsake[],
  options: KeepsakeBoardOptions,
  emptyText: string,
): HTMLElement {
  const wrap = el('section', 'keep-board__section');
  wrap.append(heading);
  if (items.length === 0) {
    wrap.append(el('p', 'keep-board__none', emptyText));
    return wrap;
  }
  const list = el('div', 'keep-board__items');
  items.forEach((k, index) => list.append(itemButton(k, index, options)));
  wrap.append(list);
  return wrap;
}

/** The Keepsakes view: every city's stamp, then what was kept there. */
export function renderKeepsakeBoard(options: KeepsakeBoardOptions): HTMLElement {
  const root = el('div', 'keep-board');
  root.setAttribute('data-keepsake-board', '');

  const head = el('div', 'keep-board__head');
  const text = el('div');
  text.append(el('h2', 'keep-board__title', 'Keepsakes'), el('p', 'keep-board__count num', boardCountLine(options.keepsakes)));
  head.append(text);
  if (options.onKeep) {
    const add = button('keep-board__add', 'Keep something');
    add.addEventListener('click', () => options.onKeep?.(add));
    head.append(add);
  }
  root.append(head);

  if (options.cities.length === 0 && countKept(options.keepsakes) === 0) {
    root.append(
      el('p', 'keep-board__empty', 'Tickets, posters and coasters you keep will sit here, city by city.'),
    );
    return root;
  }

  const surface = el('div', 'keep-board__surface');
  for (const city of options.cities) {
    const stamp = options.keepsakes.find((k): k is StampKeepsake => k.type === 'stamp' && k.legId === city.id);
    const heading = el('div', 'keep-board__city');
    if (stamp) {
      const drawn = el('span', 'keep-board__stamp');
      drawn.append(options.draw(stamp));
      heading.append(drawn);
    }
    const label = el('p', 'keep-board__city-text num');
    label.append(el('b', undefined, city.name));
    if (city.arrived) label.append(city.arrived);
    heading.append(label);
    const items = options.keepsakes.filter((k) => k.type !== 'stamp' && k.legId === city.id);
    surface.append(section(heading, items, options, 'Nothing kept here yet.'));
  }

  const unfiled = options.keepsakes.filter((k) => k.type !== 'stamp' && !options.cities.some((c) => c.id === k.legId));
  if (unfiled.length) {
    const heading = el('div', 'keep-board__city');
    const label = el('p', 'keep-board__city-text');
    label.append(el('b', undefined, 'Not filed under a city'));
    heading.append(label);
    surface.append(section(heading, unfiled, options, ''));
  }

  root.append(surface);
  return root;
}
