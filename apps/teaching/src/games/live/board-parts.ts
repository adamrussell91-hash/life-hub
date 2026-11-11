import { el } from '@/quiz/dom';
import type { GameKind } from '../core/schema';
import type { RoomStyle } from '../core/room-protocol';
import { roomStyle } from '../core/room-core';
import '../core/room-rules-index';
import { animate, calm, countUp, flip } from '../motion/motion';
import { sfx } from '../sound/sfx';
import { avatarTone } from './format';

/**
 * Pieces the live board shares across games (spec §5.1): the countdown
 * ring, initials avatars, the top-five leaderboard with FLIP reordering,
 * rolling counters and climb arrows, and the play style for each kind.
 */

/** How a kind runs live (race, paced, or 'custom' with its own rules, core/room-rules-index.ts); null: not live yet. Same answer as the room's `roomStyle`. */
export function liveStyle(kind: GameKind): RoomStyle | null {
  return roomStyle(kind);
}

/** How each Phase 3 game runs live (built into room-core). Use `liveStyle` for every kind. */
export const LIVE_STYLE: Partial<Record<GameKind, 'race' | 'paced'>> = {
  crossword: 'race',
  find_a_word: 'race',
  connections: 'race',
  who_said_it: 'paced'
};

/** A team's colour token (strong, or soft for surfaces). Teams are numbered from 0; six colours, then they repeat. */
export const teamColour = (team: number, soft = false): string => `var(--game-team-${(team % 6) + 1}${soft ? '-soft' : ''})`;

/** A team's round badge: its number on its colour (never colour alone, spec §5.4). */
export function teamBadge(team: number, cls = ''): HTMLElement {
  const a = el('span', `gl-av gl-av--team${cls ? ` ${cls}` : ''}`, String(team + 1));
  a.style.setProperty('--gl-team', teamColour(team));
  a.setAttribute('aria-hidden', 'true');
  return a;
}

/** A round initials avatar (pastel by initials, as the mockups). */
export function avatar(initials: string, cls = ''): HTMLElement {
  const a = el('span', `gl-av gl-av--${avatarTone(initials)}${cls ? ` ${cls}` : ''}`, initials);
  a.setAttribute('aria-hidden', 'true');
  return a;
}

/* ── Countdown ring ──────────────────────────────────────────────── */

export type Ring = {
  root: HTMLElement;
  /** Draws from `endsAt` (server ms) over `totalMs`, using the room clock. Warm at 10 s, pulse at 5 s, ticks the last five. */
  run(endsAt: number, totalMs: number, serverNow: () => number, onEnd?: () => void): void;
  /** Holds still showing these seconds (paused). */
  hold(secondsLeft: number, share: number): void;
  stop(): void;
};

const C = 2 * Math.PI * 56;

export function createRing(cls = ''): Ring {
  const root = el('div', `gl-ring${cls ? ` ${cls}` : ''}`);
  root.innerHTML = `<svg viewBox="0 0 132 132" aria-hidden="true"><circle class="gl-ring__track" cx="66" cy="66" r="56"/><circle class="gl-ring__fill" cx="66" cy="66" r="56" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="0"/></svg>`;
  const num = el('span', 'gl-ring__n', '');
  num.setAttribute('role', 'timer');
  root.append(num);
  const fill = root.querySelector<SVGCircleElement>('.gl-ring__fill')!;
  let raf = 0;
  let token = 0;
  const paint = (s: number, share: number) => {
    fill.style.strokeDashoffset = String((C * (1 - Math.max(0, Math.min(1, share)))).toFixed(2));
    num.textContent = String(s);
    root.classList.toggle('is-warm', s <= 10);
    root.classList.toggle('is-pulse', s <= 5 && s > 0 && !calm());
  };
  const stop = () => {
    token += 1;
    if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
    raf = 0;
  };
  return {
    root,
    run(endsAt, totalMs, serverNow, onEnd) {
      stop();
      const mine = token;
      let last = -1;
      const frame = () => {
        raf = 0;
        if (mine !== token) return;
        const left = Math.max(0, endsAt - serverNow());
        const s = Math.ceil(left / 1000);
        paint(s, left / Math.max(1, totalMs));
        if (s !== last) {
          if (last !== -1 && s <= 5 && s > 0) sfx.tick();
          last = s;
        }
        if (left <= 0) {
          onEnd?.();
          return;
        }
        if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(frame);
      };
      frame();
    },
    hold(secondsLeft, share) {
      stop();
      paint(secondsLeft, share);
    },
    stop
  };
}

/* ── Leaderboard ─────────────────────────────────────────────────── */

/** One leaderboard row. Team games: `team` is set and `initials` is the team's name ("Team 2"). */
export type LbRow = { initials: string; score: number; rank: number; team?: number };
export type Leaderboard = { root: HTMLElement; update(rows: LbRow[]): void; rows(): LbRow[] };

/**
 * The top five (never more on a board, spec §5.1). Rows are keyed by
 * initials: a reorder slides each row from its old place (FLIP), scores roll
 * from the old number, and anyone who climbed gets an arrow for a moment.
 */
export function createLeaderboard(options: { max?: number; title?: string } = {}): Leaderboard {
  const max = options.max ?? 5;
  const root = el('div', 'gl-lb');
  root.setAttribute('role', 'list');
  root.setAttribute('aria-label', options.title ?? 'Top five');
  const els = new Map<string, { row: HTMLElement; rank: HTMLElement; pts: HTMLElement; score: number }>();
  let current: LbRow[] = [];

  function make(r: LbRow) {
    const row = el('div', 'gl-lb__row');
    row.setAttribute('role', 'listitem');
    row.dataset.initials = r.initials;
    const rank = el('span', 'gl-lb__rank', String(r.rank));
    const name = el('span', 'gl-lb__name', r.initials);
    const pts = el('span', 'gl-lb__pts', String(r.score));
    if (r.team !== undefined) {
      row.classList.add('is-team');
      row.style.setProperty('--gl-team', teamColour(r.team));
    }
    row.append(rank, r.team !== undefined ? teamBadge(r.team) : avatar(r.initials), name, pts);
    return { row, rank, pts, score: r.score };
  }

  return {
    root,
    rows: () => current,
    update(next) {
      const rows = next
        .slice()
        .sort((a, b) => a.rank - b.rank || b.score - a.score || a.initials.localeCompare(b.initials))
        .slice(0, max);
      const before = new Map(current.map((r) => [r.initials, r]));
      const fresh = !current.length;
      const reordered = !fresh && rows.map((r) => r.initials).join() !== current.map((r) => r.initials).join();
      current = rows;
      void flip(root, () => {
        const keep = new Set(rows.map((r) => r.initials));
        for (const [k, v] of els) if (!keep.has(k)) {
          v.row.remove();
          els.delete(k);
        }
        rows.forEach((r, i) => {
          let item = els.get(r.initials);
          if (!item) {
            item = make(r);
            els.set(r.initials, item);
          }
          item.row.classList.toggle('is-first', i === 0);
          item.rank.textContent = String(r.rank);
          root.append(item.row);
        });
      });
      rows.forEach((r) => {
        const item = els.get(r.initials)!;
        const was = before.get(r.initials);
        if (item.score !== r.score) countUp(item.pts, item.score, r.score, 900);
        else item.pts.textContent = r.score.toLocaleString('en-AU');
        item.score = r.score;
        const climbed = !fresh && (!was || r.rank < was.rank);
        item.row.querySelector('.gl-lb__move')?.remove();
        if (climbed) {
          const up = el('span', 'gl-lb__move', '▲');
          up.setAttribute('aria-label', 'climbed');
          item.row.append(up);
          void animate(up, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 400 });
        }
      });
      if (reordered) sfx.whoosh();
    }
  };
}
