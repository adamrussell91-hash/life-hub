import { el } from '@/quiz/dom';
import type { GameTeacherApi, LiveOpen } from '../api';
import { GAME_KIND_INFO, type Game, type PublicGame } from '../core/schema';
import { splitGame } from '../core/model';
import { gameGlyph } from '../glyphs';
import { LIVE_STYLE } from './board-parts';
import { openLiveBoard } from './board';
import { spacedCode } from './code-field';

/**
 * "Play live" in the Game lesson's Results tab: one row per game that runs
 * live now, with Open live game (opens a room for the chosen class and the
 * full-screen board). Rooms still open for this lesson can be reopened, so a
 * refreshed laptop gets its board back. One call from the editor:
 * `liveLauncher({...})`.
 */

export type LiveLauncherOptions = {
  games: Game[];
  classId: string | null;
  className?: string;
  api: Pick<GameTeacherApi, 'open' | 'rooms'> | null;
};

const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

function boardGame(open: LiveOpen, games: Game[], gameId?: string): PublicGame | null {
  if (open.game) return open.game;
  const full = games.find((g) => g.id === (open.game_id ?? gameId));
  if (!full) return null;
  try {
    return splitGame(full).public;
  } catch {
    return null;
  }
}

export function liveLauncher(o: LiveLauncherOptions): HTMLElement {
  const panel = el('section', 'gm-panel gl-launch');
  const head = el('div', 'gm-panel__head');
  head.append(el('h3', 'gm-h3', 'Play live'));
  const note = el('p', 'gm-note', o.classId ? `Opens a room for ${o.className ?? 'this class'} and the board, full screen. Students join with the code on their phones.` : 'Pick a class above to play live.');
  const status = el('p', 'gm-note');
  status.setAttribute('role', 'status');
  const list = el('div', 'gl-launch__list');
  const live = o.games.filter((g) => LIVE_STYLE[g.kind]);
  const open = o.api?.open;
  const launch = (reply: LiveOpen, gameId?: string) => {
    openLiveBoard({ open: reply, game: boardGame(reply, o.games, gameId) });
  };
  for (const g of live) {
    const row = el('div', 'gl-launch__row');
    const text = el('div', 'gl-launch__text');
    text.append(el('b', '', g.title || GAME_KIND_INFO[g.kind].label), el('span', 'gm-note', `${GAME_KIND_INFO[g.kind].label} · ${LIVE_STYLE[g.kind] === 'paced' ? 'together, quote by quote' : 'a race, everyone on their own copy'}`));
    const go = el('button', 'btn btn--primary', 'Open live game');
    go.type = 'button';
    go.disabled = !o.classId || !open;
    if (!o.classId) go.title = 'Pick a class first.';
    go.addEventListener('click', async () => {
      if (!o.classId || !open) return;
      go.disabled = true;
      status.textContent = 'Opening a room…';
      try {
        const reply = await o.api!.open!(g.id, o.classId);
        status.textContent = `Room open: code ${spacedCode(reply.code)}.`;
        launch(reply, g.id);
      } catch (e) {
        status.textContent = errText(e, 'The room didn’t open. Publish the lesson, then try again.');
      } finally {
        go.disabled = false;
      }
    });
    row.append(gameGlyph(g.kind, 'sm'), text, go);
    list.append(row);
  }
  if (!live.length) list.append(el('p', 'gm-note', 'Crossword, find-a-word, Connections and Who said it? play live so far.'));
  const reopen = el('div', 'gl-launch__rooms');
  panel.append(head, note, list, reopen, status);
  if (o.api?.rooms) {
    o.api.rooms().then(
      ({ rooms }) => {
        const running = rooms.filter((r) => r.phase !== 'folded' && r.phase !== 'ended');
        if (!running.length) return;
        reopen.append(el('p', 'gm-h5', 'Still running'));
        for (const r of running) {
          const b = el('button', 'btn btn--secondary', `Reopen board · ${o.games.find((g) => g.id === r.game_id)?.title || 'game'} · ${spacedCode(r.code)}`);
          b.type = 'button';
          b.addEventListener('click', () => launch(r));
          reopen.append(b);
        }
      },
      () => undefined
    );
  }
  return panel;
}
