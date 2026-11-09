import type { Block } from '@/schemas/block';
import { el } from '@/quiz/dom';
import { applyHubPillsThumb } from '../../design-kit/js/hub-motion.js';
import { isRotationFinale, rotationStationOf } from './model';

/** Build and Pretest are settings only; a station tab shows that station's section; Finale its section; All every block. */
export type RotationTab = 'build' | 'pretest' | 'finale' | 'all' | `station:${string}`;

export const stationTab = (id: string): RotationTab => `station:${id}`;
export const tabStation = (tab: RotationTab): string | null => (tab.startsWith('station:') ? tab.slice(8) : null);

/** Whether a top-level block shows on the canvas under this tab. Blocks outside any station show on Build, above the map for students. */
export function inRotationTab(block: Block, tab: RotationTab): boolean {
  if (tab === 'all') return true;
  const station = tabStation(tab);
  if (station) return rotationStationOf(block) === station;
  if (tab === 'finale') return isRotationFinale(block);
  if (tab === 'build') return rotationStationOf(block) === undefined && !isRotationFinale(block);
  return false;
}

/** The tab a top-level block lives on. */
export function tabOfBlock(block: Block): RotationTab {
  const station = rotationStationOf(block);
  if (station) return stationTab(station);
  return isRotationFinale(block) ? 'finale' : 'build';
}

/** Build, Pretest, a pill per station, Finale, All. `marks` puts a dot on tabs that still need something. */
export function createRotationTabs(options: { onTab: (tab: RotationTab) => void; stations: () => Array<{ id: string; title: string }> }) {
  let tab: RotationTab = 'build';
  let marks = new Set<RotationTab>();
  const root = el('div', 'hub-pills rot-tabs');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Station rotation part');
  function items(): Array<[RotationTab, string]> {
    return [['build', 'Build'], ['pretest', 'Pretest'], ...options.stations().map((s, i): [RotationTab, string] => [stationTab(s.id), s.title.trim() || `Station ${i + 1}`]), ['finale', 'Finale'], ['all', 'All']];
  }
  function paint(): void {
    const list = items();
    if (!list.some(([id]) => id === tab)) tab = 'build';
    root.replaceChildren(...list.map(([id, label]) => {
      const pill = el('button', 'hub-pills__btn', label);
      pill.type = 'button';
      pill.dataset.tab = id;
      pill.setAttribute('aria-pressed', String(id === tab));
      pill.classList.toggle('is-active', id === tab);
      if (marks.has(id)) pill.append(el('span', 'rot-tab-dot'));
      pill.addEventListener('click', () => set(id));
      return pill;
    }));
    requestAnimationFrame(() => applyHubPillsThumb(root));
  }
  function set(id: RotationTab): void {
    if (tab === id) return;
    tab = id;
    paint();
    options.onTab(id);
  }
  paint();
  return { root, current: () => tab, set, repaint: paint, mark(next: Iterable<RotationTab>) { marks = new Set(next); paint(); } };
}
