// apps/teaching/src/tutorial/editor-tabs.ts
import type { Block } from '@/schemas/block';
import { el } from '@/quiz/dom';
import { applyHubPillsThumb } from '../../design-kit/js/hub-motion.js';
import type { TutorialSettings } from './schema';
import type { TutorialSummary } from './api';
import './tutorial.css';

export type TutorialTab = 'common' | 'all' | string;

/** A top-level block shows on the canvas when it belongs to the chosen tab. */
export function inTab(block: Block, tab: TutorialTab): boolean {
  if (tab === 'all') return true;
  const group = block.block_type === 'section' ? block.content.tutorial_group : undefined;
  return tab === 'common' ? typeof group !== 'string' : group === tab;
}

/**
 * The lesson's groups after a move on the board: the moved student leaves
 * every group and joins the one the server's summary has them in (the group
 * they were moved to, if the summary doesn't list them). Every other student,
 * and everything else on a group, stays as the editor has it.
 */
export function movedGroups(settings: TutorialSettings, summary: TutorialSummary, move: { studentId: string; groupId: string }): TutorialSettings {
  const { studentId } = move;
  const target = summary.groups.find((g) => g.students.some((s) => s.id === studentId))?.id ?? move.groupId;
  return {
    ...settings,
    groups: settings.groups.map((g) => {
      const others = g.students.filter((id) => id !== studentId);
      return { ...g, students: g.id === target ? [...others, studentId] : others };
    })
  };
}

/**
 * Tabs above a tutorial's canvas: Common, each group (its tab and exit check
 * together), and All. They only hide rows on the canvas; nothing is moved.
 */
export function createTutorialTabs(options: { getLesson: () => { tutorial?: TutorialSettings }; onTab: (tab: TutorialTab) => void }) {
  let tab: TutorialTab = 'common';
  const root = el('div', 'hub-pills tut-tabs');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Tutorial part');
  function paint(): void {
    const groups = options.getLesson().tutorial?.groups ?? [];
    // The open group was deleted or renamed away: go back to Common.
    if (tab !== 'common' && tab !== 'all' && !groups.some((g) => g.id === tab)) {
      tab = 'common';
      options.onTab(tab);
    }
    const items: Array<[TutorialTab, string]> = [['common', 'Common'], ...groups.map((g): [TutorialTab, string] => [g.id, g.name]), ['all', 'All']];
    root.replaceChildren(
      ...items.map(([id, label]) => {
        const pill = el('button', 'hub-pills__btn', label);
        pill.type = 'button';
        pill.dataset.tab = id;
        const on = id === tab;
        pill.setAttribute('aria-pressed', String(on));
        pill.classList.toggle('is-active', on);
        pill.addEventListener('click', () => set(id));
        return pill;
      })
    );
    requestAnimationFrame(() => applyHubPillsThumb(root));
  }
  /** Opens a tab, as a click on it would. */
  function set(id: TutorialTab): void {
    if (tab === id) return;
    tab = id;
    paint();
    options.onTab(id);
  }
  paint();
  return { root, current: () => tab, repaint: paint, set };
}
