import type { Block } from '@/schemas/block';
import { createBlock } from '@/blocks/create-block';
import { el } from '@/quiz/dom';
import { applyHubPillsThumb } from '../../design-kit/js/hub-motion.js';
import type { CaseStation } from './schema';
import { casePartOf, isCaseBriefSection, isCaseOutcomeSection } from './model';

export type CaseTab = 'kit' | CaseStation | 'all';

const ITEMS: Array<[CaseTab, string]> = [['kit', 'Kit'], ['brief', 'Brief'], ['case', 'The case'], ['decide', 'Decide'], ['outcome', 'Outcome'], ['rules', 'Rules'], ['all', 'All']];

/** The Brief section's blocks show on Brief, part sections on The case, the Outcome section on Outcome; every other block is Decide-stage content. All shows everything. */
export function inCaseTab(block: Block, tab: CaseTab): boolean {
  if (tab === 'all') return true;
  if (tab === 'brief') return isCaseBriefSection(block);
  if (tab === 'case') return casePartOf(block) !== undefined;
  if (tab === 'outcome') return isCaseOutcomeSection(block);
  return tab === 'decide' && !isCaseBriefSection(block) && casePartOf(block) === undefined && !isCaseOutcomeSection(block);
}

/** The Outcome section, added at the end if the lesson has none. Unchanged blocks come back as the same array. */
export function withCaseOutcomeSection(blocks: Block[], newId: () => string): Block[] {
  if (blocks.some(isCaseOutcomeSection)) return blocks;
  const base = createBlock('section', newId());
  return [...blocks, { ...base, content: { title: 'Outcome', blocks: [], case_outcome: true } } as Block];
}

/** The Brief section, added if the lesson has none. Unchanged blocks come back as the same array. */
export function withCaseBriefSection(blocks: Block[], newId: () => string): Block[] {
  if (blocks.some(isCaseBriefSection)) return blocks;
  const base = createBlock('section', newId());
  return [{ ...base, content: { title: 'Brief', blocks: [], case_brief: true } } as Block, ...blocks];
}

/** A section for one part's blocks, added at the end if the lesson has none. Unchanged blocks come back as the same array. */
export function withCasePartSection(blocks: Block[], partId: string, title: string, newId: () => string): Block[] {
  if (blocks.some((b) => casePartOf(b) === partId)) return blocks;
  const base = createBlock('section', newId());
  return [...blocks, { ...base, content: { title, blocks: [], case_part: partId } } as Block];
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
