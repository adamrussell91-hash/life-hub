import type { Block } from '@/schemas/block';
import { el } from '@/quiz/dom';
import { applyHubPillsThumb } from '../../design-kit/js/hub-motion.js';
import type { CaseStation } from './schema';

export type CaseTab = 'kit' | CaseStation | 'all';

const ITEMS: Array<[CaseTab, string]> = [['kit', 'Kit'], ['brief', 'Brief'], ['case', 'The case'], ['decide', 'Decide'], ['outcome', 'Outcome'], ['rules', 'Rules'], ['all', 'All']];

/** Ordinary lesson blocks are Decide-stage content: they show on Decide and All only. */
export function inCaseTab(_block: Block, tab: CaseTab): boolean {
  return tab === 'all' || tab === 'decide';
}

/** Kit, one per station, All. `marks` puts a dot on tabs that still have something to add. */
export function createCaseTabs(options: { onTab: (tab: CaseTab) => void }) {
  let tab: CaseTab = 'kit';
  let marks = new Set<CaseTab>();
  const root = el('div', 'hub-pills case-edit-tabs');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Case study part');
  function paint(): void {
    root.replaceChildren(...ITEMS.map(([id, label]) => {
      const pill = el('button', 'hub-pills__btn', label);
      pill.type = 'button';
      pill.dataset.tab = id;
      pill.setAttribute('aria-pressed', String(id === tab));
      pill.classList.toggle('is-active', id === tab);
      if (marks.has(id)) pill.append(el('span', 'case-edit-dot'));
      pill.addEventListener('click', () => set(id));
      return pill;
    }));
    requestAnimationFrame(() => applyHubPillsThumb(root));
  }
  function set(id: CaseTab): void {
    if (tab === id) return;
    tab = id;
    paint();
    options.onTab(id);
  }
  paint();
  return { root, current: () => tab, set, mark(next: Iterable<CaseTab>) { marks = new Set(next); paint(); } };
}
