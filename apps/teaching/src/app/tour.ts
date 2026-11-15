import './tour.css';

export type TourStep = { target?: () => HTMLElement | null; title: string; body: string };
export type TourOptions = {
  /** The page under the tour: inert while the tour is open. */
  host: HTMLElement;
  steps: TourStep[];
  /** localStorage key; bump its version to show the tour again after a big change. */
  storageKey: string;
  /** Where the Help button goes. Defaults to document.body (fixed top right). */
  helpParent?: HTMLElement;
};
export type TourHandle = { start(): void; next(): void; back(): void; skip(): void; dispose(): void };

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const PAD = 8;
const PHONE = 600;

/** True or false from storage; null when storage can't be read. */
function seen(key: string): boolean | null {
  try {
    return localStorage.getItem(key) === 'seen';
  } catch {
    return null;
  }
}
function markSeen(key: string): void {
  try {
    localStorage.setItem(key, 'seen');
  } catch {
    // The Help button still works.
  }
}

/**
 * A guided tour: a dimmed page with a spotlight on each section and a card that explains it.
 * Shows once per browser. Ending it (Done, Skip, Esc) shrinks the card into a small Help button
 * at the top right, which replays it.
 */
export function mountTour(options: TourOptions): TourHandle {
  const { host, storageKey } = options;
  const helpParent = options.helpParent ?? document.body;
  let steps: TourStep[] = [];
  let at = 0;
  let layer: HTMLElement | null = null;
  let spot: HTMLElement | null = null;
  let card: HTMLElement | null = null;
  let disposed = false;
  /** The body's own bottom padding, put back when the tour closes. */
  let padWas: string | null = null;

  const help = document.createElement('button');
  help.type = 'button';
  help.className = 'tour-help';
  help.textContent = '?';
  help.setAttribute('aria-label', 'Show the tour again');
  help.title = 'Show the tour again';
  help.hidden = true;
  help.addEventListener('click', () => start());
  helpParent.append(help);

  const onKey = (event: KeyboardEvent) => {
    if (!card) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      skip();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      next();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      back();
    } else if (event.key === 'Tab') {
      const focusable = [...card.querySelectorAll<HTMLElement>('button')];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  };
  const onResize = () => place(false);

  function button(text: string, cls: string, fn: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.textContent = text;
    b.addEventListener('click', fn);
    return b;
  }

  function paint(): void {
    if (!card) return;
    const step = steps[at]!;
    const title = document.createElement('h2');
    title.className = 'tour-card__title';
    title.id = 'tour-card-title';
    title.textContent = step.title;
    const body = document.createElement('p');
    body.className = 'tour-card__body';
    body.textContent = step.body;
    const dots = document.createElement('p');
    dots.className = 'tour-card__dots';
    dots.textContent = `${at + 1} of ${steps.length}`;
    const actions = document.createElement('div');
    actions.className = 'tour-card__actions';
    const last = at === steps.length - 1;
    actions.append(button('Skip tour', 'btn btn--ghost tour-card__skip', skip));
    if (at > 0) actions.append(button('Back', 'btn btn--secondary tour-card__back', back));
    actions.append(button(last ? 'Done' : 'Next', 'btn btn--primary tour-card__next', next));
    card.replaceChildren(title, body, dots, actions);
    card.setAttribute('aria-labelledby', 'tour-card-title');
    place(true);
    card.querySelector<HTMLElement>('.tour-card__next')?.focus();
  }

  /** Spotlight the target and put the card beside it, or dock it at the bottom on a phone. */
  function place(scroll: boolean): void {
    if (!card || !spot) return;
    const target = steps[at]?.target?.() ?? null;
    const phone = window.innerWidth < PHONE;
    card.classList.toggle('is-docked', phone);
    if (!target) {
      spot.classList.add('is-off');
      card.classList.add('is-centred');
      card.style.removeProperty('top');
      card.style.removeProperty('left');
      return;
    }
    card.classList.remove('is-centred');
    spot.classList.remove('is-off');
    // On a phone the card docks over the bottom of the screen; room below the page lets the last
    // sections scroll up above it.
    if (phone && padWas === null) {
      padWas = document.body.style.paddingBottom;
      document.body.style.paddingBottom = '75vh';
    }
    if (scroll) target.scrollIntoView?.({ block: phone ? 'start' : 'center', behavior: 'auto' });
    const r = target.getBoundingClientRect();
    // On a phone the docked card covers the bottom of the screen: keep the spotlight above it.
    const room = phone ? window.innerHeight - card.getBoundingClientRect().height - PAD * 4 : window.innerHeight;
    const height = Math.min(r.height + PAD * 2, Math.max(room - Math.max(r.top - PAD, PAD), 48));
    Object.assign(spot.style, { top: `${Math.max(r.top - PAD, PAD / 2)}px`, left: `${r.left - PAD}px`, width: `${r.width + PAD * 2}px`, height: `${height}px` });
    if (phone) return;
    const c = card.getBoundingClientRect();
    const below = r.bottom + PAD * 2;
    const top = below + c.height < window.innerHeight ? below : Math.max(PAD, r.top - PAD * 2 - c.height);
    const left = Math.min(Math.max(PAD, r.left), window.innerWidth - c.width - PAD);
    card.style.top = `${top}px`;
    card.style.left = `${left}px`;
  }

  function start(): void {
    if (disposed) return;
    steps = options.steps.filter((s) => !s.target || s.target());
    if (!steps.length) return;
    close(false);
    at = 0;
    layer = document.createElement('div');
    layer.className = 'tour-layer';
    spot = document.createElement('div');
    spot.className = 'tour-spot is-off';
    card = document.createElement('div');
    card.className = 'tour-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-live', 'polite');
    layer.append(spot, card);
    document.body.append(layer);
    host.setAttribute('inert', '');
    help.hidden = true;
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    paint();
  }

  function next(): void {
    if (!card) return;
    if (at >= steps.length - 1) {
      finish();
      return;
    }
    at += 1;
    paint();
  }
  function back(): void {
    if (!card || at === 0) return;
    at -= 1;
    paint();
  }
  function skip(): void {
    if (card) finish();
  }

  function finish(): void {
    markSeen(storageKey);
    close(true);
  }

  /** Takes the tour down; with `shrink`, flies the card into the Help button first. */
  function close(shrink: boolean): void {
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    host.removeAttribute('inert');
    if (padWas !== null) {
      document.body.style.paddingBottom = padWas;
      padWas = null;
    }
    const leaving = layer;
    const ghost = card;
    const from = card?.getBoundingClientRect();
    layer = null;
    spot = null;
    card = null;
    if (!leaving) return;
    help.hidden = false;
    if (!shrink || !ghost || !from) {
      leaving.remove();
      return;
    }
    // No longer the live card: only its shape flies, pinned where the card was.
    ghost.className = 'tour-ghost';
    ghost.removeAttribute('role');
    ghost.removeAttribute('aria-modal');
    ghost.removeAttribute('aria-live');
    ghost.setAttribute('aria-hidden', 'true');
    // Its words fade in the first moment (CSS); only the card's shape travels.
    ghost.querySelectorAll('button').forEach((b) => (b.tabIndex = -1));
    Object.assign(ghost.style, { top: `${from.top}px`, left: `${from.left}px`, width: `${from.width}px`, height: `${from.height}px` });
    leaving.classList.add('is-leaving');
    help.focus();
    const to = help.getBoundingClientRect();
    if (reduced() || typeof ghost.animate !== 'function' || !to.width) {
      fade(leaving);
      return;
    }
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const sx = to.width / Math.max(from.width, 1);
    const sy = to.height / Math.max(from.height, 1);
    const fly = ghost.animate(
      [
        { transform: 'translate(0, 0) scale(1, 1)', borderRadius: '12px', opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, borderRadius: '50%', opacity: 0.85 }
      ],
      { duration: 550, easing: 'cubic-bezier(0.45, 0, 0.2, 1)', fill: 'forwards' }
    );
    const done = () => {
      leaving.remove();
      pulse();
    };
    fly.finished.then(done, done);
  }

  /** Reduced motion: the card cross-fades out while the button fades in. */
  function fade(leaving: HTMLElement): void {
    leaving.classList.add('is-fading');
    window.setTimeout(() => leaving.remove(), 200);
    pulse();
  }

  function pulse(): void {
    if (reduced()) return;
    help.classList.remove('is-pulse');
    void help.offsetWidth;
    help.classList.add('is-pulse');
    help.addEventListener('animationend', () => help.classList.remove('is-pulse'), { once: true });
  }

  // First visit only. A storage error counts as seen: better to miss it than repeat it every visit.
  if (seen(storageKey) === false) start();
  else help.hidden = false;

  return {
    start,
    next,
    back,
    skip,
    dispose() {
      disposed = true;
      close(false);
      document.querySelectorAll('.tour-layer').forEach((l) => l.remove());
      help.remove();
    }
  };
}
