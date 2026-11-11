import type { PublishedLesson } from '@/schemas/published-lesson';
import type { Block } from '@/schemas/block';
import { el } from '@/quiz/dom';
import { renderBlock } from '@/blocks/render';
import { studentUnitAnthology } from '@/blocks/anthology-load';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { GAME_KIND_INFO, type PublicGame, type PublicGameLesson } from './core/schema';
import type { Arcade, GameClient, PlayScore } from './api';
import { gameGlyph, modeChips } from './glyphs';
import './games.css';

export type ArcadeOptions = {
  lesson: PublishedLesson;
  classId?: string;
  /** Null when opened without a class: the student is asked to open it from their class page. */
  client: GameClient | null;
  renderHero: (host: HTMLElement) => void;
};

const NOUNS: Record<PublicGame['kind'], [string, string]> = {
  crossword: ['clue', 'clues'],
  find_a_word: ['clue', 'clues'],
  jeopardy: ['tile', 'tiles'],
  wheel: ['puzzle', 'puzzles'],
  team_match: ['card', 'cards'],
  points_rush: ['question', 'questions'],
  battles: ['prompt', 'prompts'],
  wager: ['question', 'questions'],
  connections: ['tile', 'tiles'],
  articulate: ['card', 'cards'],
  pictionary: ['prompt', 'prompts'],
  who_said_it: ['quote', 'quotes']
};
const countText = (g: PublicGame) => (g.count ? `${g.count} ${NOUNS[g.kind][g.count === 1 ? 0 : 1]}` : '');
const scoreText = (s: PlayScore) => `${s.right}/${s.answered}`;

/**
 * The student's arcade for a Game lesson: the optional "Before you play"
 * blocks, then one card per game. Solo games say Play (the players arrive in
 * the next phase, so for now Play says so); live-only games wait for the
 * teacher. Best and latest results come from the server after the initials claim.
 */
export function mountGameArcade(host: HTMLElement, options: ArcadeOptions): { dispose(): void } {
  const { lesson, client } = options;
  const pub = lesson.game as PublicGameLesson | undefined;
  const games: PublicGame[] = pub?.games ?? [];
  let arcade: Arcade | null = null;
  let disposed = false;
  let comingNext: string | null = null;

  const shell = el('div', 'gm gm-arcade');
  const hero = el('div', 'gm-hero-host');
  options.renderHero(hero);
  const before = el('div', 'gm-before-blocks');
  const pageBlocks = lesson.blocks as Block[];
  for (const b of pageBlocks) before.append(renderBlock(b, 'student', { lessonId: lesson.lesson_id, pageBlocks, loadAnthology: () => studentUnitAnthology(lesson.unit_id) }));
  const gate = el('div', 'gm-gate-host');
  const err = el('p', 'gm-err');
  err.setAttribute('role', 'alert');
  const head = el('div', 'gm-arcade__head');
  const grid = el('div', 'gm-arcade__grid');
  grid.setAttribute('role', 'list');
  shell.append(hero);
  if (pageBlocks.length) {
    const label = el('p', 'gm-eyebrow', 'Before you play');
    shell.append(label, before);
  }
  shell.append(gate, err, head, grid);
  host.replaceChildren(shell);

  function closesLine(): string {
    const closes = arcade?.homework_closes_at ?? pub?.homework_closes_at;
    if (arcade?.closed) return 'Homework has closed. Live games still run in class.';
    if (closes) return `Homework closes ${formatDisplayDate(closes)}.`;
    return '';
  }

  function card(g: PublicGame): HTMLElement {
    const info = GAME_KIND_INFO[g.kind];
    const c = el('article', 'gm-card');
    c.setAttribute('role', 'listitem');
    c.dataset.gameId = g.id;
    const top = el('div', 'gm-card__top');
    top.append(gameGlyph(g.kind, 'lg'), modeChips(g.kind));
    const title = el('h3', 'gm-card__title', g.title || info.label);
    const meta = el('p', 'gm-card__meta', [info.label, countText(g)].filter(Boolean).join(' · '));
    c.append(top, title, meta);
    const r = arcade?.results[g.id];
    if (r) {
      const res = el('p', 'gm-card__result');
      res.append(el('span', '', `Best ${scoreText(r.best)}`), el('span', '', `Latest ${scoreText(r.latest)}`));
      c.append(res);
    }
    const foot = el('div', 'gm-card__foot');
    if (comingNext === g.id) {
      const note = el('p', 'gm-card__soon', 'Coming next: this game opens here soon. Your teacher can run it live in class until then.');
      note.setAttribute('role', 'status');
      note.tabIndex = -1;
      foot.append(note);
    } else if (g.solo && !arcade?.closed) {
      const play = el('button', 'btn btn--primary gm-card__play', r ? 'Play again' : 'Play');
      play.type = 'button';
      play.addEventListener('click', () => {
        comingNext = g.id;
        paint();
        shell.querySelector<HTMLElement>(`[data-game-id="${g.id}"] .gm-card__soon`)?.focus();
      });
      foot.append(play);
    } else if (g.solo) {
      foot.append(el('span', 'gm-card__wait', 'Homework closed'));
    } else {
      foot.append(el('span', 'gm-card__wait', 'Waiting for your teacher'));
    }
    c.append(foot);
    return c;
  }

  function paint(): void {
    head.replaceChildren();
    const h = el('h2', 'gm-arcade__title', games.length === 1 ? 'Your game' : 'Your games');
    head.append(h);
    const line = closesLine();
    if (line) head.append(el('p', 'gm-note', line));
    if (!games.length) {
      grid.replaceChildren(el('p', 'gm-note', 'No games here yet.'));
      return;
    }
    grid.replaceChildren(...games.map(card));
  }

  function gateMessage(text: string, withInitials = false): void {
    const box = el('div', 'gm-gate');
    box.append(el('p', '', text));
    if (withInitials && client) {
      const form = el('form', 'gm-gate__form');
      form.noValidate = true;
      const input = el('input', 'gm-input');
      input.maxLength = 4;
      input.autocomplete = 'off';
      input.autocapitalize = 'characters';
      input.setAttribute('aria-label', 'Your initials');
      input.placeholder = 'Initials';
      const go = el('button', 'btn btn--primary', 'Start');
      go.type = 'submit';
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const initials = input.value.trim();
        if (!initials) return;
        go.disabled = true;
        err.textContent = '';
        client.claim(initials).then(
          (next) => apply(next),
          (e2) => {
            err.textContent = e2 instanceof Error ? e2.message : 'That didn’t work. Check your initials.';
            go.disabled = false;
          }
        );
      });
      form.append(input, go);
      box.append(form);
    }
    gate.replaceChildren(box);
  }

  function apply(next: Arcade): void {
    if (disposed) return;
    arcade = next;
    gate.replaceChildren();
    if (next.identity.need === 'class') gateMessage('Open these games from your class page.');
    else if (next.identity.need === 'initials') gateMessage('Type your initials to keep your scores.', true);
    paint();
  }

  paint();
  if (!client) gateMessage('Open these games from your class page to keep your scores.');
  else
    client.load().then(apply, (e) => {
      if (!disposed) err.textContent = e instanceof Error ? e.message : 'Your scores didn’t load. Refresh to try again.';
    });

  return {
    dispose() {
      disposed = true;
      host.replaceChildren();
    }
  };
}
