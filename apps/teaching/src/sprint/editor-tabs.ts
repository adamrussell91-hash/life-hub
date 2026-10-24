import type { Block } from '@/schemas/block';
import { el } from '@/quiz/dom';
import { applyHubPillsThumb } from '../../design-kit/js/hub-motion.js';
import { PHASE_LABELS, SPRINT_PHASES, type SprintPhaseKey } from './schema';
import { phaseOfSection } from './model';

export type SprintTab = 'kit' | 'brief' | SprintPhaseKey | 'all';

/** A top-level block shows on the canvas when it belongs to the chosen tab. Kit shows no blocks. */
export function inSprintTab(block: Block, tab: SprintTab): boolean {
  if (tab === 'all') return true;
  if (tab === 'kit') return false;
  const key = phaseOfSection(block);
  return tab === 'brief' ? key === null : key === tab;
}

/** Kit, Brief, one per phase, All. They hide canvas rows and show the Kit; nothing moves. */
export function createSprintTabs(options: { onTab: (tab: SprintTab) => void }) {
  let tab: SprintTab = 'kit';
  const root = el('div', 'hub-pills sprint-edit-tabs');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Sprint part');
  const items: Array<[SprintTab, string]> = [['kit', 'Kit'], ['brief', 'Challenge'], ...SPRINT_PHASES.map((k): [SprintTab, string] => [k, PHASE_LABELS[k]]), ['all', 'All']];
  function paint(): void {
    root.replaceChildren(...items.map(([id, label]) => {
      const pill = el('button', 'hub-pills__btn', label);
      pill.type = 'button';
      pill.dataset.tab = id;
      pill.setAttribute('aria-pressed', String(id === tab));
      pill.classList.toggle('is-active', id === tab);
      pill.addEventListener('click', () => set(id));
      return pill;
    }));
    requestAnimationFrame(() => applyHubPillsThumb(root));
  }
  function set(id: SprintTab): void {
    if (tab === id) return;
    tab = id;
    paint();
    options.onTab(id);
  }
  paint();
  return { root, current: () => tab, repaint: paint, set };
}
