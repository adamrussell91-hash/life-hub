/**
 * The "What next?" edge tab on a student's lesson page: a thin white tab peeking out of the right
 * edge. Tap it and a small card slides out naming the one next thing on their To do list, with
 * "Take me there", "My whole list" and "Hide on my lessons".
 *
 * Kept out of the way for students who don't need it: it fades while they scroll down (they're
 * working) and comes back once they stop or scroll up; it's gone while the What's next card at the
 * foot of the lesson is on screen, so there are never two; and "Hide on my lessons" turns it off on
 * that device. The line under the title and the end card stay either way.
 */
import { el, uid } from '@/quiz/dom';
import { studentAnchor } from '@/student/shell';
import { thereHref, todoListHref, type WhatsNextHandle } from '@/student/whats-next';
import './edge-tab.css';

export type EdgeTabOptions = {
  classId: string;
  from: string;
  /** The What's next card on this page: the tab reads the next thing through it and hides while it's on screen. */
  card: WhatsNextHandle;
};
export type EdgeTabHandle = { element: HTMLElement; dispose(): void };

const OFF_KEY = 'lesson-edge-tab-off';
/** How long after scrolling stops before the tab comes back. */
export const EDGE_IDLE_MS = 900;

const isOff = (): boolean => {
  try {
    return window.localStorage.getItem(OFF_KEY) === '1';
  } catch {
    return false;
  }
};
const turnOff = (): void => {
  try {
    window.localStorage.setItem(OFF_KEY, '1');
  } catch {
    // Private mode: hidden for this page only.
  }
};
/** Tests only. */
export function resetEdgeTab(): void {
  try {
    window.localStorage.removeItem(OFF_KEY);
  } catch {
    /* nothing to reset */
  }
}

export function mountEdgeTab(options: EdgeTabOptions): EdgeTabHandle | null {
  if (isOff()) return null;
  const { classId, from, card } = options;

  const root = el('div', 'et');
  const tab = el('button', 'et__tab', 'What next?');
  tab.type = 'button';
  tab.setAttribute('aria-expanded', 'false');
  const panel = el('section', 'et__panel');
  panel.setAttribute('aria-label', 'What to do next');
  panel.hidden = true;
  panel.id = uid('et-panel');
  tab.setAttribute('aria-controls', panel.id);
  root.append(tab, panel);

  let scrolling = false;
  let cardInView = false;
  let idle = 0;
  let lastY = window.scrollY;
  const paintAway = (): void => {
    root.classList.toggle('is-away', panel.hidden && (scrolling || cardInView));
  };

  const fill = (): void => {
    panel.replaceChildren(el('p', 'et__kicker', 'Do this now'), el('p', 'et__what', 'Looking at your list…'));
    void card.next().then((thing) => {
      if (!root.isConnected) return;
      const what = panel.querySelector('.et__what');
      if (what) what.textContent = thing ? thing.what : thing === null ? 'Nothing else on your list right now.' : 'Your to do list has what to do next.';
      const hide = el('button', 'et__hide', 'Hide on my lessons');
      hide.type = 'button';
      hide.addEventListener('click', () => {
        turnOff();
        root.remove();
      });
      const row = el('div', 'et__row');
      row.append(studentAnchor(todoListHref(classId, from), 'et__all', 'My whole list'), hide);
      if (thing) panel.append(studentAnchor(thereHref(classId, thing, from), 'et__go', 'Take me there →'));
      panel.append(row);
    });
  };
  const close = (): void => {
    if (panel.hidden) return;
    panel.hidden = true;
    tab.setAttribute('aria-expanded', 'false');
    paintAway();
  };
  tab.addEventListener('click', () => {
    if (!panel.hidden) return close();
    fill();
    panel.hidden = false;
    tab.setAttribute('aria-expanded', 'true');
    paintAway();
  });
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || panel.hidden) return;
    close();
    tab.focus();
  };
  const onDown = (e: PointerEvent): void => {
    if (!root.contains(e.target as Node)) close();
  };
  const onScroll = (): void => {
    const y = window.scrollY;
    const down = y > lastY;
    lastY = y;
    window.clearTimeout(idle);
    close();
    // Scrolling down: they're working. Up: they may be looking for it.
    scrolling = down;
    paintAway();
    idle = window.setTimeout(() => {
      scrolling = false;
      paintAway();
    }, EDGE_IDLE_MS);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('keydown', onKey);
  document.addEventListener('pointerdown', onDown);

  let seen: IntersectionObserver | null = null;
  if (typeof IntersectionObserver === 'function') {
    seen = new IntersectionObserver((entries) => {
      cardInView = entries.some((e) => e.isIntersecting);
      if (cardInView) close();
      paintAway();
    });
    seen.observe(card.element);
  }

  return {
    element: root,
    dispose() {
      window.clearTimeout(idle);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
      seen?.disconnect();
      root.remove();
    }
  };
}
