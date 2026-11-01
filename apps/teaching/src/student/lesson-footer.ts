import { apiPost } from '@/api/client';
import { lessonQuiz, type LessonQuizHandle } from '@/quiz/student-quiz';
import { button, deviceToken, el, errorText, labelled, uid } from '@/quiz/dom';
import { studentAnchor } from '@/student/shell';
import type { WorkSyncHandle } from '@/student/work-sync';
import './lesson-footer.css';

/**
 * The rail at the foot of a lesson: previous lesson, a tick to finish, next
 * lesson. The tick shows what's still unanswered, hands in the quiz go and the
 * written work the Markbook marks, records the lesson done, then asks two quick
 * questions about the lesson and an optional "still unclear" box. The answers
 * are anonymous (end-questions.mjs). A student can untick: the done mark goes,
 * what was handed in stays.
 */

type ProfileReply = { need: 'initials' | null; initials?: string; ticked?: boolean };
type AskReply = { off?: true; given?: true; questions?: Array<{ id: string; prompt: string; options: string[] }>; unclear?: string | null };
export type FooterCalls = {
  profile: (action: 'status' | 'claim' | 'done' | 'undone', extra?: Record<string, unknown>) => Promise<ProfileReply>;
  questions: (action: 'ask' | 'send', extra?: Record<string, unknown>) => Promise<AskReply>;
};
export type FooterLink = { href: string; title: string };
export type LessonFooterOptions = {
  lessonId: string;
  classId: string;
  prev?: FooterLink | null;
  next?: FooterLink | null;
  /** False on a quiz: handing it in marks it done, so there's no tick, just previous and next. */
  finish?: boolean;
  /** The written-work sync on this page, if any. */
  work?: () => WorkSyncHandle | null;
  /** Test seams. */
  calls?: FooterCalls;
  quiz?: () => LessonQuizHandle | null;
};
export type LessonFooterHandle = { element: HTMLElement; dispose(): void };

const TICK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

function networkCalls(lessonId: string, classId: string): FooterCalls {
  const token = () => deviceToken(`class:${classId}`);
  return {
    profile: (action, extra = {}) => apiPost<ProfileReply>(`/api/published/profile/${encodeURIComponent(classId)}`, { action, class_token: token(), ...extra }),
    questions: (action, extra = {}) => apiPost<AskReply>(`/api/published/end-questions/${encodeURIComponent(lessonId)}`, { action, class_id: classId, class_token: token(), ...extra })
  };
}

const short = (text: string): string => (text.length > 70 ? `${text.slice(0, 67)}…` : text);

export function mountLessonFooter(options: LessonFooterOptions): LessonFooterHandle {
  const { lessonId } = options;
  const calls = options.calls ?? networkCalls(lessonId, options.classId);
  const quiz = options.quiz ?? (() => lessonQuiz(lessonId));
  let disposed = false;
  let done = false;
  let need: 'initials' | null = null;
  let busy = false;

  const root = el('nav', 'lf');
  root.setAttribute('aria-label', 'Lesson');
  const panel = el('section', 'lf__panel');
  panel.hidden = true;
  panel.id = uid('lf-panel');
  const row = el('div', 'lf__row');

  const link = (to: FooterLink | null | undefined, dir: 'prev' | 'next'): HTMLElement => {
    if (!to) return el('span', `lf__link lf__link--${dir} lf__link--none`);
    const a = studentAnchor(to.href, `lf__link lf__link--${dir}`);
    a.append(el('span', 'lf__dir', dir === 'prev' ? '← Previous' : 'Next →'), el('span', 'lf__title', to.title));
    return a;
  };
  const tick = el('button', 'lf__tick');
  tick.type = 'button';
  tick.innerHTML = TICK_SVG;
  tick.setAttribute('aria-controls', panel.id);
  const status = el('p', 'lf__status');
  status.setAttribute('role', 'status');
  const finish = options.finish !== false;
  row.append(link(options.prev, 'prev'), finish ? tick : el('span', 'lf__gap'), link(options.next, 'next'));
  root.append(panel, row, status);

  function paintTick(): void {
    tick.setAttribute('aria-pressed', String(done));
    tick.setAttribute('aria-label', done ? 'Lesson completed. Press to untick' : 'Finish this lesson');
    tick.title = done ? 'Lesson completed' : 'Finish this lesson';
    // Said once the questions are out of the way, not while they're open.
    status.textContent = done && panel.hidden ? 'Lesson completed ✓' : '';
  }

  function close(): void {
    panel.hidden = true;
    panel.replaceChildren();
    tick.setAttribute('aria-expanded', 'false');
  }

  function open(children: Node[], label: string): void {
    panel.replaceChildren(...children);
    panel.setAttribute('aria-label', label);
    panel.hidden = false;
    tick.setAttribute('aria-expanded', 'true');
    panel.querySelector<HTMLElement>('input, textarea, button.btn--primary')?.focus();
  }

  const errorLine = (): HTMLElement => {
    const p = el('p', 'lf__error');
    p.setAttribute('role', 'alert');
    p.hidden = true;
    return p;
  };
  const showError = (p: HTMLElement, error: unknown): void => {
    p.textContent = typeof error === 'string' ? error : errorText(error);
    p.hidden = false;
  };

  /** The finish check: what's handed in, and anything left blank. */
  function openFinish(): void {
    const list = el('ul', 'lf__list');
    const q = quiz()?.progress();
    if (q?.open) {
      list.append(el('li', 'lf__ok', `Quiz: ${q.answered} of ${q.total} answered`));
      for (const b of q.blank.slice(0, 3)) list.append(el('li', 'lf__warn', `Left blank: “${short(b.prompt)}” (${b.marks} ${b.marks === 1 ? 'mark' : 'marks'})`));
      if (q.blank.length > 3) list.append(el('li', 'lf__warn', `and ${q.blank.length - 3} more left blank`));
    }
    const w = options.work?.()?.progress();
    if (w && w.written) list.append(el('li', 'lf__ok', `Written work: ${w.written} ${w.written === 1 ? 'answer' : 'answers'}${w.toHandIn ? `, ${w.toHandIn} to hand in` : ''}`));
    if (!list.childElementCount) list.append(el('li', 'lf__ok', 'Nothing left to hand in.'));

    const err = errorLine();
    const children: Node[] = [el('h2', 'lf__heading', 'Finish this lesson?'), list];
    let initials: HTMLInputElement | null = null;
    if (need === 'initials') {
      initials = el('input', 'lf__initials');
      initials.type = 'text';
      initials.maxLength = 6;
      initials.autocomplete = 'off';
      initials.autocapitalize = 'characters';
      initials.placeholder = 'Your initials';
      children.push(labelled('Type your initials first', initials));
    }
    if (q?.open) children.push(el('p', 'lf__note', 'You can’t change your quiz answers after this.'));
    const keep = button('Keep working', 'secondary', () => {
      close();
      tick.focus();
    });
    const finish = button('Hand in and finish', 'primary', () => void handIn());
    const actions = el('div', 'lf__actions');
    actions.append(keep, finish);
    children.push(actions, err);
    open(children, 'Finish this lesson');

    async function handIn(): Promise<void> {
      if (busy) return;
      busy = true;
      finish.disabled = true;
      err.hidden = true;
      try {
        if (initials) {
          await calls.profile('claim', { initials: initials.value });
          need = null;
        }
        const qz = quiz();
        if (qz && !(await qz.handIn())) throw 'Your quiz didn’t hand in. Your answers are kept: try again.';
        const work = options.work?.();
        if (work && !(await work.handInAll())) throw 'Some written work didn’t hand in. It’s kept on this device: try again.';
        await calls.profile('done', { lesson_id: lessonId, quick: true });
        done = true;
        paintTick();
        await askQuestions();
      } catch (e) {
        showError(err, e);
      } finally {
        busy = false;
        finish.disabled = false;
      }
    }
  }

  /** Two questions, one at a time, then the optional box. Skip sends what's answered so far. */
  async function askQuestions(): Promise<void> {
    let reply: AskReply;
    try {
      reply = await calls.questions('ask');
    } catch {
      // Feedback never holds up finishing.
      complete();
      return;
    }
    if (disposed) return;
    const questions = reply.questions ?? [];
    if (!questions.length) {
      complete();
      return;
    }
    const answers: Record<string, number> = {};
    const steps = questions.length + (reply.unclear ? 1 : 0);
    let step = 0;
    let sent = false;
    const send = (unclear = ''): void => {
      if (sent) return;
      sent = true;
      // Fire and forget: a lost send costs one set of answers, never the student's finish.
      void calls.questions('send', { answers, ...(unclear.trim() ? { unclear: unclear.trim() } : {}) }).catch(() => {});
      complete();
    };
    const show = (): void => {
      const dots = el('div', 'lf__dots');
      dots.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < steps; i += 1) dots.append(el('i', i <= step ? 'is-on' : ''));
      const children: Node[] = [el('h2', 'lf__heading', 'Quick questions about this lesson'), dots];
      const skip = button('Skip', 'secondary', () => send());
      const actions = el('div', 'lf__actions');
      if (step < questions.length) {
        const q = questions[step]!;
        const set = el('fieldset', 'lf__question');
        set.append(el('legend', 'lf__prompt', q.prompt));
        const chips = el('div', 'lf__chips');
        const name = uid('lf-q');
        q.options.forEach((option, i) => {
          const id = `${name}-${i}`;
          const label = el('label', 'lf__chip');
          label.htmlFor = id;
          const input = el('input');
          input.type = 'radio';
          input.name = name;
          input.id = id;
          input.addEventListener('change', () => {
            answers[q.id] = i;
            step += 1;
            if (step >= steps) send();
            else show();
          });
          label.append(input, document.createTextNode(option));
          chips.append(label);
        });
        set.append(chips);
        children.push(set);
        actions.append(skip);
      } else {
        const box = el('textarea', 'lf__unclear');
        box.maxLength = 300;
        box.rows = 3;
        box.placeholder = 'Leave empty if nothing';
        children.push(labelled(`${reply.unclear ?? ''} (optional)`, box));
        actions.append(skip, button('Done', 'primary', () => send(box.value)));
      }
      children.push(actions, el('p', 'lf__note', 'Anonymous. Your teacher sees everyone’s answers together, not yours.'));
      open(children, 'Quick questions about this lesson');
    };
    show();
  }

  function complete(): void {
    close();
    done = true;
    paintTick();
    tick.focus();
  }

  function openUntick(): void {
    const err = errorLine();
    const actions = el('div', 'lf__actions');
    actions.append(
      button('Cancel', 'secondary', () => {
        close();
        tick.focus();
      }),
      button('Untick', 'primary', () => {
        void calls.profile('undone', { lesson_id: lessonId, quick: true }).then(
          () => {
            done = false;
            paintTick();
            close();
            tick.focus();
          },
          (e: unknown) => showError(err, e)
        );
      })
    );
    open([el('h2', 'lf__heading', 'Mark this lesson as not finished?'), el('p', 'lf__note', 'Your quiz and written work stay handed in.'), actions, err], 'Untick this lesson');
  }

  tick.addEventListener('click', () => {
    if (busy) return;
    if (!panel.hidden) {
      close();
      return;
    }
    if (done) openUntick();
    else openFinish();
  });
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || panel.hidden || busy) return;
    // Escaping the questions still finishes the lesson; it was already handed in.
    if (done && panel.getAttribute('aria-label') === 'Quick questions about this lesson') complete();
    else {
      close();
      tick.focus();
    }
  });

  paintTick();
  if (finish) void Promise.resolve()
    .then(() => calls.profile('status', { lesson_id: lessonId, quick: true }))
    .then(
    (reply) => {
      if (disposed) return;
      need = reply.need;
      done = reply.ticked === true;
      paintTick();
    },
    () => {}
  );

  return {
    element: root,
    dispose() {
      disposed = true;
      root.remove();
    }
  };
}
