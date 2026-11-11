import { el } from '@/quiz/dom';
import { applyHubPillsThumb } from '../../design-kit/js/hub-motion.js';

/**
 * A Game lesson's build tabs. Games, Settings and Results are the game
 * editor's own panels (the block canvas hides); "Before you play" is the
 * lesson's ordinary blocks, the optional page students see above the games.
 */
export type GameTab = 'games' | 'before' | 'settings' | 'results';

export const GAME_TABS: Array<[GameTab, string]> = [
  ['games', 'Games'],
  ['before', 'Before you play'],
  ['settings', 'Settings'],
  ['results', 'Results']
];

/** Whether the block canvas shows under this tab. */
export const canvasShowsOn = (tab: GameTab): boolean => tab === 'before';

export function createGameTabs(options: { onTab: (tab: GameTab) => void }) {
  let tab: GameTab = 'games';
  let marks = new Set<GameTab>();
  const root = el('div', 'hub-pills gm-tabs');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Game lesson part');
  function paint(): void {
    root.replaceChildren(
      ...GAME_TABS.map(([id, label]) => {
        const pill = el('button', 'hub-pills__btn', label);
        pill.type = 'button';
        pill.dataset.tab = id;
        pill.setAttribute('aria-pressed', String(id === tab));
        pill.classList.toggle('is-active', id === tab);
        if (marks.has(id)) {
          const dot = el('span', 'gm-tab-dot');
          dot.title = 'Something here needs finishing';
          pill.append(dot);
        }
        pill.addEventListener('click', () => set(id));
        return pill;
      })
    );
    requestAnimationFrame(() => applyHubPillsThumb(root));
  }
  function set(id: GameTab): void {
    if (tab === id) return;
    tab = id;
    paint();
    options.onTab(id);
  }
  paint();
  return {
    root,
    current: () => tab,
    set,
    mark(next: Iterable<GameTab>) {
      const n = new Set(next);
      if (n.size === marks.size && [...n].every((t) => marks.has(t))) return;
      marks = n;
      paint();
    }
  };
}
