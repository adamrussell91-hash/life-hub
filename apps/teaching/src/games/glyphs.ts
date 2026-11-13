import { el } from '@/quiz/dom';
import { GAME_KIND_INFO, type GameKind } from './core/schema';

/**
 * The twelve game glyphs from the approved mockups (docs/mockups/games/index.html),
 * drawn in `currentColor` on a coloured tile. Tile colours are the named
 * `--gm-k1…4` tokens in games.css.
 */
const SVG: Record<GameKind, { tone: 1 | 2 | 3 | 4; paths: string }> = {
  crossword: { tone: 1, paths: '<g fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="5" width="22" height="22" rx="2"/><path d="M12 5v22M20 5v22M5 12h22M5 20h22"/></g>' },
  find_a_word: { tone: 2, paths: '<g fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="14" cy="14" r="7"/><path d="M19 19l7 7"/></g>' },
  jeopardy: {
    tone: 1,
    paths:
      '<g fill="currentColor"><rect x="4" y="6" width="7" height="5" rx="1"/><rect x="12.5" y="6" width="7" height="5" rx="1"/><rect x="21" y="6" width="7" height="5" rx="1"/><rect x="4" y="13.5" width="7" height="5" rx="1"/><rect x="12.5" y="13.5" width="7" height="5" rx="1" opacity=".5"/><rect x="21" y="13.5" width="7" height="5" rx="1"/><rect x="4" y="21" width="7" height="5" rx="1"/><rect x="12.5" y="21" width="7" height="5" rx="1"/><rect x="21" y="21" width="7" height="5" rx="1" opacity=".5"/></g>'
  },
  wheel: { tone: 3, paths: '<g fill="none" stroke="currentColor" stroke-width="2"><circle cx="16" cy="16" r="11"/><path d="M16 5v22M5 16h22M8.2 8.2l15.6 15.6M23.8 8.2L8.2 23.8"/></g>' },
  team_match: { tone: 2, paths: '<g fill="currentColor"><circle cx="10" cy="11" r="4"/><circle cx="22" cy="11" r="4"/><path d="M3 26c1-5 4-8 7-8s6 3 7 8zM15 26c1-5 4-8 7-8s6 3 7 8z"/></g>' },
  points_rush: { tone: 4, paths: '<path d="M18 3L7 18h8l-2 11 12-16h-8z" fill="currentColor"/>' },
  battles: { tone: 1, paths: '<g fill="currentColor"><rect x="4" y="7" width="10" height="16" rx="2"/><rect x="18" y="7" width="10" height="16" rx="2" opacity=".55"/></g>' },
  wager: { tone: 3, paths: '<g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 23a11 11 0 0 1 22 0"/><path d="M16 23l6-7"/></g><circle cx="16" cy="23" r="2.4" fill="currentColor"/>' },
  connections: {
    tone: 4,
    paths: '<g fill="currentColor"><rect x="5" y="5" width="9" height="9" rx="2"/><rect x="18" y="5" width="9" height="9" rx="2"/><rect x="5" y="18" width="9" height="9" rx="2"/><rect x="18" y="18" width="9" height="9" rx="2" opacity=".5"/></g>'
  },
  articulate: { tone: 3, paths: '<path d="M5 7h22v13H13l-6 5v-5H5z" fill="currentColor"/>' },
  pictionary: { tone: 2, paths: '<path d="M6 26l3-8L22 5l5 5L14 23z" fill="currentColor"/>' },
  who_said_it: { tone: 4, paths: '<path d="M7 9h8v8c0 4-3 6-6 6M17 9h8v8c0 4-3 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4"/>' }
};

/** One line on what each game is, for the kind picker (from the mockups). */
export const GAME_KIND_BLURB: Record<GameKind, string> = {
  crossword: 'Definition and example clues, with a hint ladder.',
  find_a_word: 'Find the term each clue points to. Watch for decoys.',
  jeopardy: 'Teams pick a tile; everyone answers on their own phone.',
  wheel: 'Spin, earn letters by answering, solve the quote.',
  team_match: 'The answers are split across a team’s phones. Talk.',
  points_rush: 'Fast questions; misses come back.',
  battles: 'Write, then judge pairs of anonymous answers.',
  wager: 'Answer, then commit points to show how sure you are.',
  connections: 'Sixteen tiles, four hidden groups.',
  articulate: 'Describe the term without the banned words.',
  pictionary: 'Draw a term or a moment; the class guesses.',
  who_said_it: 'Pick the character, or call out a fake quote.'
};

/** The glyph tile for a kind. `size` 'lg' is the arcade card's 56px tile. */
export function gameGlyph(kind: GameKind, size: 'sm' | 'md' | 'lg' = 'md'): HTMLElement {
  const g = SVG[kind];
  const tile = el('span', `gm-glyph gm-glyph--${size} gm-glyph--k${g.tone}`);
  tile.setAttribute('aria-hidden', 'true');
  tile.innerHTML = `<svg viewBox="0 0 32 32" focusable="false">${g.paths}</svg>`;
  return tile;
}

/** Solo and Live chips: what a kind can do, in words. */
export function modeChips(kind: GameKind): HTMLElement {
  const info = GAME_KIND_INFO[kind];
  const row = el('span', 'gm-chips');
  if (info.solo) row.append(el('span', 'gm-chip', 'Solo'));
  if (info.live) row.append(el('span', 'gm-chip gm-chip--live', info.team ? 'Live · teams' : 'Live'));
  return row;
}
