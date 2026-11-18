import { apiPost } from '@/api/client';
import { lessonQuiz, type LessonQuizHandle } from '@/quiz/student-quiz';
import { button, deviceToken, el, errorText, labelled, uid } from '@/quiz/dom';
import { studentAnchor } from '@/student/shell';
import type { WorkSyncHandle } from '@/student/work-sync';
import './lesson-footer.css';

/**
 * The end of a lesson, as one card that reads in order: what you did, finish,
 * where next. The head says "Before you finish" with the count of parts, the
 * lesson map puts its list of parts in the slot (lesson-map.ts), then one
 * Finish lesson button, then the quiet "Next on your list" line it is handed
 * (whats-next.ts). Previous and next lesson sit under the card.
 *
 * Finish lesson shows what's still unanswered, hands in the quiz go and the
 * written work the Markbook marks, records the lesson done, then asks two quick
 * questions about the lesson and an optional "still unclear" box, all in the
 * place the button was. The answers are anonymous (end-questions.mjs). Then the
 * card turns into "Lesson completed" with what's next as its body. A student
 * can untick from the foot of the card: the done mark goes, what was handed in
 * stays. One main button is on screen at a time.
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
  /** False on a quiz: handing it in marks it done, so there's no Finish lesson button, just what's next and the lesson links. */
  finish?: boolean;
  /** The written-work sync on this page, if any. */
  work?: () => WorkSyncHandle | null;
  /** Told when the student gives their initials here, so the top bar can show them. */
  onClaimed?: () => void;
  /** Told each time the done state changes; `fresh` when the student finished it just now. */
  onDone?: (done: boolean, fresh: boolean) => void;
  /** Shown in the card after the Finish lesson row: the "Next on your list" block. */
  beside?: HTMLElement;
  /** Test seams. */
  calls?: FooterCalls;
  quiz?: () => LessonQuizHandle | null;
};
export type LessonFooterHandle = {
  /** The card, then the lesson links. */
  element: HTMLElement;
  card: HTMLElement;
  /** Where the lesson map puts its list of parts. */
  partsSlot: HTMLElement;
  /** How many parts are ticked, for the head, the bar and the line beside the button. */
  setParts(done: number, total: number): void;
  dispose(): void;
};

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
  const finish = options.finish !== false;
  let disposed = false;
  let done = false;
  /** Handed in, with the quick questions still open: not "completed" on screen until they close. */
  let asking = false;
  let need: 'initials' | null = null;
  let busy = false;
  let parts = { done: 0, total: 0 };
  let showParts = false;

  const root = el('div', 'lf');
  const card = el('section', 'lf__card');

  /* ── Head ── */
  const head = el('header', 'lf__head');
  const mark = el('span', 'lf__mark');
  mark.innerHTML = TICK_SVG;
  const kicker = el('p', 'lf__kicker', 'End of lesson');
  const name = el('h2', 'lf__name');
  name.id = uid('lf-name');
  name.tabIndex = -1;
  card.setAttribute('aria-labelledby', name.id);
  const partsSlot = el('div', 'lf__parts');
  partsSlot.id = uid('lf-parts');
  const sub = el('p', 'lf__sub');
  const subText = el('span');
  const show = el('button', 'lf__show');
  show.type = 'button';
  show.setAttribute('aria-controls', partsSlot.id);
  sub.append(subText, show);
  const words = el('div', 'lf__words');
  words.append(kicker, name, sub);
  const count = el('span', 'lf__count');
  count.setAttribute('aria-live', 'polite');
  const bar = el('div', 'lf__bar');
  bar.setAttribute('aria-hidden', 'true');
  const fill = el('i');
  bar.append(fill);
  head.append(mark, words, count, bar);

  /* ── Foot: the Finish lesson row, the check and questions in its place, what's next, undo ── */
  const foot = el('div', 'lf__foot');
  const panel = el('section', 'lf__panel');
  panel.hidden = true;
  panel.id = uid('lf-panel');
  const go = el('div', 'lf__go');
  const finishBtn = button('', 'primary', () => {
    if (!busy) openFinish();
  });
  finishBtn.classList.add('lf__finish');
  finishBtn.innerHTML = TICK_SVG;
  finishBtn.append(el('span', undefined, 'Finish lesson'));
  finishBtn.setAttribute('aria-controls', panel.id);
  finishBtn.setAttribute('aria-expanded', 'false');
  const left = el('span', 'lf__left');
  if (finish) go.append(finishBtn, left);
  const undo = el('p', 'lf__undo', 'Finished by mistake? ');
  const untickBtn = el('button', 'lf__untick', 'Untick this lesson');
  untickBtn.type = 'button';
  untickBtn.setAttribute('aria-controls', panel.id);
  undo.append(untickBtn);
  const status = el('p', 'lf__status');
  status.setAttribute('role', 'status');
  foot.append(go, panel);
  if (options.beside) foot.append(options.beside);
  foot.append(undo);
  card.append(head, partsSlot, foot, status);

  /* ── Previous and next lesson, under the card ── */
  const row = el('nav', 'lf__row');
  row.setAttribute('aria-label', 'Lessons');
  const link = (to: FooterLink | null | undefined, dir: 'prev' | 'next'): HTMLElement => {
    if (!to) return el('span', `lf__link lf__link--${dir} lf__link--none`);
    const a = studentAnchor(to.href, `lf__link lf__link--${dir}`);
    a.append(el('span', 'lf__dir', dir === 'prev' ? '← Previous lesson' : 'Next lesson →'), el('span', 'lf__title', to.title));
    return a;
  };
  row.append(link(options.prev, 'prev'), link(options.next, 'next'));
  row.hidden = !options.prev && !options.next;

  // A quiz with nothing to show beside it has no card at all.
  if (finish || options.beside) root.append(card);
  root.append(row);
  if (!finish) {
    card.classList.add('is-bare');
    head.hidden = true;
    partsSlot.hidden = true;
    go.hidden = true;
    undo.hidden = true;
  }

  /** What the last press opened the panel from, to hand focus back to. */
  let opener: HTMLElement = finishBtn;

  const leftLine = (): string => {
    if (!parts.total) return '';
    const n = parts.total - parts.done;
    if (n <= 0) return 'All parts ticked.';
    return `${n} ${n === 1 ? 'part isn’t' : 'parts aren’t'} ticked. You can still finish.`;
  };

  const tell = (fresh = false): void => options.onDone?.(done, fresh);

  function draw(): void {
    if (!finish) return;
    const open = !panel.hidden;
    // Said once the questions are out of the way, not while they're open.
    const settled = done && !asking;
    const hasParts = parts.total > 0;
    card.classList.toggle('is-done', settled);
    card.classList.toggle('has-panel', open);
    card.classList.toggle('has-parts', hasParts);
    mark.hidden = !settled;
    kicker.hidden = settled || !hasParts;
    name.textContent = settled ? 'Lesson completed' : hasParts ? 'Before you finish' : 'End of lesson';
    count.hidden = settled || !hasParts;
    bar.hidden = settled || !hasParts;
    count.textContent = `${parts.done} of ${parts.total} parts done`;
    fill.style.width = `${hasParts ? Math.round((parts.done / parts.total) * 100) : 0}%`;
    sub.hidden = !settled || !hasParts;
    subText.textContent = `${parts.done} of ${parts.total} parts ticked · `;
    show.textContent = showParts ? 'Hide parts' : 'Show parts';
    show.setAttribute('aria-expanded', String(showParts));
    // Finished: the parts step back behind Show parts, so what's next leads.
    partsSlot.hidden = !hasParts || (settled && !showParts);
    go.hidden = done || open;
    left.textContent = leftLine();
    undo.hidden = !settled || open;
    status.textContent = settled ? 'Lesson completed' : '';
  }

  function close(): void {
    panel.hidden = true;
    panel.replaceChildren();
    opener.setAttribute('aria-expanded', 'false');
    draw();
  }

  function open(children: Node[], label: string): void {
    panel.replaceChildren(...children);
    panel.setAttribute('aria-label', label);
    panel.hidden = false;
    opener.setAttribute('aria-expanded', 'true');
    draw();
    panel.querySelector<HTMLElement>('input, textarea, button.btn--primary')?.focus();
  }

  /** Close the panel and put focus back on what opened it. */
  function backOut(): void {
    close();
    opener.focus();
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

    opener = finishBtn;
    const err = errorLine();
    const children: Node[] = [el('h3', 'lf__heading', 'Hand in and finish?'), list];
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
    const keep = button('Keep working', 'secondary', backOut);
    const handInBtn = button('Hand in and finish', 'primary', () => void handIn());
    const actions = el('div', 'lf__actions');
    actions.append(handInBtn, keep);
    children.push(actions, err);
    open(children, 'Hand in and finish');

    async function handIn(): Promise<void> {
      if (busy) return;
      busy = true;
      handInBtn.disabled = true;
      err.hidden = true;
      try {
        if (initials) {
          await calls.profile('claim', { initials: initials.value });
          need = null;
          options.onClaimed?.();
        }
        const qz = quiz();
        if (qz && !(await qz.handIn())) throw 'Your quiz didn’t hand in. Your answers are kept: try again.';
        const work = options.work?.();
        if (work && !(await work.handInAll())) throw 'Some written work didn’t hand in. It’s kept on this device: try again.';
        await calls.profile('done', { lesson_id: lessonId, quick: true });
        done = true;
        asking = true;
        tell();
        draw();
        await askQuestions();
      } catch (e) {
        showError(err, e);
      } finally {
        busy = false;
        handInBtn.disabled = false;
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
      const children: Node[] = [el('h3', 'lf__heading', 'Quick questions about this lesson'), dots];
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
        actions.append(button('Done', 'primary', () => send(box.value)), skip);
      }
      children.push(actions, el('p', 'lf__note', 'Anonymous. Your teacher sees everyone’s answers together, not yours.'));
      open(children, 'Quick questions about this lesson');
    };
    show();
  }

  function complete(): void {
    done = true;
    asking = false;
    close();
    tell(true);
    // The Finish lesson button is gone: land on the words that say so.
    name.focus({ preventScroll: true });
  }

  function openUntick(): void {
    opener = untickBtn;
    const err = errorLine();
    const actions = el('div', 'lf__actions');
    actions.append(
      button('Untick', 'primary', () => {
        void calls.profile('undone', { lesson_id: lessonId, quick: true }).then(
          () => {
            done = false;
            showParts = false;
            tell();
            close();
            finishBtn.focus();
          },
          (e: unknown) => showError(err, e)
        );
      }),
      button('Cancel', 'secondary', backOut)
    );
    open([el('h3', 'lf__heading', 'Mark this lesson as not finished?'), el('p', 'lf__note', 'Your quiz and written work stay handed in.'), actions, err], 'Untick this lesson');
  }

  untickBtn.addEventListener('click', () => {
    if (!busy) openUntick();
  });
  show.addEventListener('click', () => {
    showParts = !showParts;
    draw();
  });
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || panel.hidden || busy) return;
    // Escaping the questions still finishes the lesson; it was already handed in.
    if (asking) complete();
    else backOut();
  });

  tell();
  draw();
  if (finish) void Promise.resolve()
    .then(() => calls.profile('status', { lesson_id: lessonId, quick: true }))
    .then(
    (reply) => {
      if (disposed) return;
      need = reply.need;
      done = reply.ticked === true;
      tell();
      draw();
    },
    () => {}
  );

  return {
    element: root,
    card,
    partsSlot,
    setParts(ticked, total) {
      parts = { done: ticked, total };
      draw();
    },
    dispose() {
      disposed = true;
      root.remove();
    }
  };
}
