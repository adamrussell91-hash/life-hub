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
 * The lesson's groups with each group's students as the server now has them,
 * after a move on the board. Everything else on a group (name, why, evidence)
 * stays as the editor has it.
 */
export function movedGroups(settings: TutorialSettings, summary: TutorialSummary): TutorialSettings {
  const fresh = new Map(summary.groups.map((g) => [g.id, g.students.map((s) => s.id)]));
  return {
    ...settings,
    groups: settings.groups.map((g) => {
      const students = fresh.get(g.id);
      return students ? { ...g, students } : g;
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
        pill.addEventListener('click', () => {
          if (tab === id) return;
          tab = id;
          paint();
          options.onTab(id);
        });
        return pill;
      })
    );
    requestAnimationFrame(() => applyHubPillsThumb(root));
  }
  paint();
  return { root, current: () => tab, repaint: paint };
}
