import type { FocusStepView } from './focus-view';

/**
 * The lesson map: the current step zooms out into a map of every step, done
 * steps ticked, and the step the teacher picks zooms back up to fill the
 * board. The zoom is the browser's own view transition; without one (or with
 * reduced motion) the map simply opens and closes.
 */

export interface LessonMapOptions {
  surface: HTMLElement;
  steps: FocusStepView[];
  index: number;
  /** Called with the picked step and a `finish` that runs the zoom back in around the swap. */
  onPick: (index: number, finish: (swap: () => HTMLElement) => void) => void;
  onClose: () => void;
}

const NAME = 'fv-stage';
/** The width a step is laid out at on the board, before it is scaled. */
const STEP_WIDTH = 820;

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> };
};

function transition(update: () => void): Promise<void> {
  const doc = document as ViewTransitionDocument;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!doc.startViewTransition || reduce) {
    update();
    return Promise.resolve();
  }
  return doc.startViewTransition(update).finished.catch(() => undefined);
}

function name(node: HTMLElement, on: boolean): void {
  node.style.setProperty('view-transition-name', on ? NAME : '');
}

export function openLessonMap(options: LessonMapOptions): () => void {
  const { surface, steps, index, onPick, onClose } = options;
  const overlay = document.createElement('div');
  overlay.className = 'fv-map';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Lesson map');
  const title = document.createElement('p');
  title.className = 'fv-map__title';
  title.textContent = 'Lesson map · choose a step · Esc to go back';
  const grid = document.createElement('div');
  grid.className = 'fv-map__grid';
  overlay.append(title, grid);

  let done = false;
  const cards = steps.map((step, k) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'fv-map__card';
    if (k === index) card.setAttribute('aria-current', 'step');
    if (k < index) card.classList.add('is-done');
    card.setAttribute('aria-label', `Step ${k + 1}: ${step.label}`);
    // A still copy of the step: no listeners, nothing focusable, no duplicate ids.
    const thumb = step.el.cloneNode(true) as HTMLElement;
    thumb.hidden = false;
    thumb.removeAttribute('aria-hidden');
    thumb.style.removeProperty('zoom');
    thumb.style.removeProperty('view-transition-name');
    thumb.classList.add('fv-map__thumb');
    thumb.inert = true;
    thumb.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
    const label = document.createElement('span');
    label.className = 'fv-map__label';
    label.textContent = `${k + 1}. ${step.label}`;
    card.append(thumb, label);
    card.addEventListener('click', () => pick(k));
    grid.append(card);
    return { card, thumb };
  });

  function scaleThumbs(): void {
    for (const { card, thumb } of cards) {
      const width = card.clientWidth;
      if (width) thumb.style.zoom = (width / STEP_WIDTH).toFixed(4);
    }
  }

  function pick(k: number): void {
    if (done) return;
    done = true;
    const card = cards[k]!.card;
    onPick(k, (swap) => {
      name(card, true);
      let landed: HTMLElement | null = null;
      void transition(() => {
        name(card, false);
        overlay.remove();
        landed = swap();
        name(landed, true);
      }).then(() => {
        if (landed) name(landed, false);
      });
      onClose();
    });
  }

  const current = steps[index]!.el;
  name(current, true);
  void transition(() => {
    name(current, false);
    surface.append(overlay);
    scaleThumbs();
    name(cards[index]!.card, true);
  }).then(() => {
    name(cards[index]!.card, false);
    cards[index]!.card.focus({ preventScroll: true });
    cards[index]!.card.scrollIntoView({ block: 'nearest' });
  });

  return () => pick(index);
}
