import type { Block } from '@/schemas/block';
import { checkQuestion } from '@/quiz/core';

/**
 * A run of quiz questions on the lesson page shows as a deck: one card at a
 * time, arrows and a numbered strip to move through, and a swipe on a phone.
 * A forty-question quiz stays one card tall instead of forty. The teacher can
 * flip a deck back to the plain list (kept on this device).
 */

const LIST_KEY = 'teaching_quiz_deck_list_v1';
/**
 * Sent (bubbling) from a row that something outside the canvas wants on
 * screen, such as Ann's "next suggestion". The deck turns to that card.
 */
export const ROW_REVEAL_EVENT = 'lesson-row-reveal';
const SWIPE_PX = 48;

/** How many quiz questions run on from `index`. Decks start at two. */
export function quizRunLength(blocks: Block[], index: number): number {
  let end = index;
  while (end < blocks.length && blocks[end]?.block_type === 'quiz_question') end += 1;
  return end - index;
}

export function readDeckAsList(): boolean {
  try {
    return localStorage.getItem(LIST_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeDeckAsList(asList: boolean): void {
  try {
    if (asList) localStorage.setItem(LIST_KEY, '1');
    else localStorage.removeItem(LIST_KEY);
  } catch {
    // private mode / quota
  }
}

function navButton(label: string, text: string, className: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  btn.setAttribute('aria-label', label);
  btn.textContent = text;
  return btn;
}

/** The bar a deck shows while it is a list, to turn it back into cards. */
export function deckListBar(count: number, onCards: () => void): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'qz-deck__bar qz-deck__bar--list';
  const label = document.createElement('span');
  label.className = 'qz-deck__count';
  label.textContent = `${count} questions`;
  const cards = navButton('Show the questions as cards', 'Show as cards', 'btn btn--ghost qz-deck__mode');
  cards.addEventListener('click', onCards);
  bar.append(label, cards);
  return bar;
}

export type QuizDeckOptions = {
  blocks: Block[];
  /** One canvas row per block, in the same order. */
  rows: HTMLElement[];
  /** The card to open on. */
  showId: string;
  onShow: (blockId: string) => void;
  onList: () => void;
};

export function mountQuizDeck(options: QuizDeckOptions): HTMLElement {
  const { blocks, rows } = options;
  const total = blocks.length;
  let at = Math.max(0, blocks.findIndex((b) => b.id === options.showId));

  const deck = document.createElement('section');
  deck.className = 'qz-deck';
  deck.setAttribute('aria-roledescription', 'carousel');
  deck.setAttribute('aria-label', `Quiz questions, ${total}`);

  const bar = document.createElement('div');
  bar.className = 'qz-deck__bar';
  const prev = navButton('Previous question', '‹', 'qz-deck__arrow');
  const next = navButton('Next question', '›', 'qz-deck__arrow');
  const count = document.createElement('span');
  count.className = 'qz-deck__count';
  count.setAttribute('aria-live', 'polite');
  const list = navButton('Show the questions as a list', 'List', 'btn btn--ghost qz-deck__mode');
  list.addEventListener('click', options.onList);
  bar.append(prev, count, next, list);

  const strip = document.createElement('div');
  strip.className = 'qz-dots qz-deck__strip';
  strip.setAttribute('role', 'group');
  strip.setAttribute('aria-label', 'Jump to a question');
  const dots = blocks.map((block, i) => {
    const dot = navButton(`Question ${i + 1}`, String(i + 1), 'qz-dot');
    if (block.block_type === 'quiz_question' && !checkQuestion({ ...block.content.question, id: block.id }).ok) {
      dot.dataset.warn = 'true';
      dot.setAttribute('aria-label', `Question ${i + 1}, not ready`);
    }
    dot.addEventListener('click', () => go(i));
    strip.append(dot);
    return dot;
  });

  const track = document.createElement('div');
  track.className = 'qz-deck__track';
  rows.forEach((row) => {
    row.classList.add('qz-deck__card');
    track.append(row);
  });
  deck.append(bar, strip, track);

  function paint(direction: 0 | 1 | -1): void {
    rows.forEach((row, i) => {
      row.hidden = i !== at;
      row.classList.remove('qz-deck__card--in-next', 'qz-deck__card--in-prev');
    });
    if (direction) rows[at]?.classList.add(direction > 0 ? 'qz-deck__card--in-next' : 'qz-deck__card--in-prev');
    dots.forEach((dot, i) => {
      if (i === at) {
        dot.dataset.state = 'now';
        dot.setAttribute('aria-current', 'true');
      } else {
        delete dot.dataset.state;
        dot.removeAttribute('aria-current');
      }
    });
    count.textContent = `Question ${at + 1} of ${total}`;
    prev.disabled = at === 0;
    next.disabled = at === total - 1;
    // Keep the current number in view without moving the page.
    const dot = dots[at];
    if (dot && strip.scrollWidth > strip.clientWidth) {
      strip.scrollLeft = dot.offsetLeft - strip.clientWidth / 2 + dot.offsetWidth / 2;
    }
  }

  function go(index: number): void {
    const target = Math.min(total - 1, Math.max(0, index));
    if (target === at) return;
    const direction = target > at ? 1 : -1;
    at = target;
    paint(direction);
    const id = blocks[at]?.id;
    if (id) options.onShow(id);
  }

  track.addEventListener(ROW_REVEAL_EVENT, (event) => {
    const index = rows.findIndex((row) => row.contains(event.target as Node));
    if (index >= 0) go(index);
  });

  // Ann marks a row she has a suggestion for; the strip shows which cards.
  const markAnn = () => rows.forEach((row, i) => {
    if (row.classList.contains('ann-target')) dots[i]!.dataset.ann = 'true';
    else delete dots[i]!.dataset.ann;
  });
  new MutationObserver(markAnn).observe(track, { attributes: true, attributeFilter: ['class'], subtree: true });

  prev.addEventListener('click', () => go(at - 1));
  next.addEventListener('click', () => go(at + 1));
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'ArrowLeft') go(at - 1);
    else if (event.key === 'ArrowRight') go(at + 1);
    else return;
    event.preventDefault();
  };
  bar.addEventListener('keydown', onKey);
  strip.addEventListener('keydown', onKey);

  // A sideways swipe on a card that is not open for editing moves the deck.
  let start: { x: number; y: number } | null = null;
  track.addEventListener('pointerdown', (event) => {
    const target = event.target as HTMLElement | null;
    if (event.pointerType === 'mouse' || target?.closest('input, textarea, select, [contenteditable="true"], .lesson-page__block--selected')) {
      start = null;
      return;
    }
    start = { x: event.clientX, y: event.clientY };
  });
  track.addEventListener('pointerup', (event) => {
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    start = null;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    go(dx < 0 ? at + 1 : at - 1);
  });
  track.addEventListener('pointercancel', () => {
    start = null;
  });

  paint(0);
  markAnn();
  return deck;
}

/** The card each nested deck last showed, so a redraw of its section stays on it. */
const nestedShown = new Set<string>();

/**
 * Renders a container's children (a section, a column, a tab) with any run of
 * quiz questions as a deck. The List switch flips the run in place, since
 * these renderers have no page to redraw.
 */
export function appendWithQuizDecks(host: HTMLElement, blocks: Block[], render: (block: Block) => HTMLElement, decks: boolean): void {
  for (let index = 0; index < blocks.length; ) {
    const run = decks ? quizRunLength(blocks, index) : 0;
    if (run < 2) {
      host.append(render(blocks[index]!));
      index += 1;
      continue;
    }
    const runBlocks = blocks.slice(index, index + run);
    const rows = runBlocks.map(render);
    const group = document.createElement('div');
    group.className = 'qz-deck-group';
    const paint = () => {
      rows.forEach((row) => {
        row.hidden = false;
        row.classList.remove('qz-deck__card', 'qz-deck__card--in-next', 'qz-deck__card--in-prev');
      });
      if (readDeckAsList()) {
        group.replaceChildren(deckListBar(run, () => {
          writeDeckAsList(false);
          paint();
        }), ...rows);
        return;
      }
      const showId = runBlocks.find((b) => nestedShown.has(b.id))?.id ?? runBlocks[0]!.id;
      group.replaceChildren(mountQuizDeck({
        blocks: runBlocks,
        rows,
        showId,
        onShow: (id) => {
          for (const b of runBlocks) nestedShown.delete(b.id);
          nestedShown.add(id);
        },
        onList: () => {
          writeDeckAsList(true);
          paint();
        }
      }));
    };
    paint();
    host.append(group);
    index += run;
  }
}
