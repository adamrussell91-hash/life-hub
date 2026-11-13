/**
 * "What's next" on a student's lesson page: a card under the finish tick that names the one thing
 * on their To do list (the lesson they're on passed over), with "Take me there" and "My to do list".
 * Quiet (dashed) while the lesson is open; once the lesson is ticked done it turns navy, since
 * that's the moment they ask "what now?". It reads the progress page's own payload, and only when
 * it comes near the screen or the lesson is ticked, so a lesson page costs nothing extra up top.
 *
 * Also the small "Not sure what to do? My to do list →" line under the lesson title.
 */
import { apiPost } from '@/api/client';
import { deviceToken, el } from '@/quiz/dom';
import { oneThing, type NowThing } from '@/student/now-strip';
import { studentAnchor } from '@/student/shell';
import type { TodoPayload } from '@/student/todo-panel';
import './whats-next.css';

export type WhatsNextOptions = {
  classId: string;
  lessonId: string;
  /** This lesson's own path, so the progress page can offer "Back to lesson". */
  from: string;
  /** Test seam: the progress page's payload. */
  load?: () => Promise<{ need?: string | null; todo?: TodoPayload }>;
};
/** `fresh`: the student ticked it just now (not a revisit of a ticked lesson). */
export type WhatsNextHandle = { element: HTMLElement; setDone(done: boolean, fresh?: boolean): void; dispose(): void };

const profilePath = (classId: string, params: Record<string, string>): string =>
  `/s/classes/${encodeURIComponent(classId)}/profile?${new URLSearchParams(params).toString()}`;

/** The progress page, framed on the To do list. */
export const todoListHref = (classId: string, from: string): string => profilePath(classId, { show: 'todo', from });

function thereHref(classId: string, thing: NowThing, from: string): string {
  if ('lesson' in thing.go) return `/s/classes/${encodeURIComponent(classId)}/lessons/${encodeURIComponent(thing.go.lesson)}`;
  return profilePath(classId, { tab: thing.go.tab, from });
}

/** The line under the lesson title. */
export function renderTodoHint(classId: string, from: string): HTMLElement {
  const p = el('p', 'wn-hint', 'Not sure what to do? ');
  p.append(studentAnchor(todoListHref(classId, from), 'wn-hint__link', 'My to do list →'));
  return p;
}

export function mountWhatsNext(options: WhatsNextOptions): WhatsNextHandle {
  const { classId, lessonId, from } = options;
  const load =
    options.load ??
    (() => apiPost<{ need?: string | null; todo?: TodoPayload }>(`/api/published/profile/${encodeURIComponent(classId)}`, { action: 'progress', class_token: deviceToken(`class:${classId}`) }));
  let disposed = false;
  let asked: Promise<void> | null = null;

  const card = el('section', 'wn-card');
  card.setAttribute('aria-label', 'What’s next');
  card.setAttribute('aria-live', 'polite');
  const kicker = el('p', 'wn-card__kicker', 'What’s next');
  const what = el('p', 'wn-card__what', 'Your to do list has what to do after this lesson.');
  const acts = el('div', 'wn-card__acts');
  const all = studentAnchor(todoListHref(classId, from), 'wn-card__all', 'My to do list');
  acts.append(all);
  card.append(kicker, what, acts);

  const paint = (thing: NowThing | null): void => {
    if (thing) {
      what.textContent = thing.what;
      acts.replaceChildren(studentAnchor(thereHref(classId, thing, from), 'wn-card__go', 'Take me there →'), all);
    } else {
      what.textContent = 'Nothing else on your list right now. Nice work.';
      acts.replaceChildren(all);
    }
  };
  const ask = (): Promise<void> =>
    (asked ??= Promise.resolve()
      .then(load)
      .then(
        (reply) => {
          // Not signed in to the class yet: the card keeps its plain words and the list link.
          if (!disposed && !reply.need) paint(oneThing(reply.todo, lessonId));
        },
        () => undefined
      ));

  // Read the list once the card is close to the screen.
  let seen: IntersectionObserver | null = null;
  if (typeof IntersectionObserver === 'function') {
    seen = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      seen?.disconnect();
      seen = null;
      void ask();
    }, { rootMargin: '400px 0px' });
    seen.observe(card);
  } else void ask();

  return {
    element: card,
    setDone(done, fresh = false) {
      card.classList.toggle('is-ready', done);
      if (!done) return;
      void ask();
      // Just ticked: bring the card into view so they see where to go.
      if (fresh) card.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    },
    dispose() {
      disposed = true;
      seen?.disconnect();
      card.remove();
    }
  };
}
