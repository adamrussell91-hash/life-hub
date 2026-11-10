import { ApiClientError } from '@/api/client';
import { button, el, errorText } from '@/quiz/dom';
import { classForPlainLesson } from '@/student/initials-token';
import { studentAnchor } from '@/student/shell';
import { studentApi, type CalibrateReply, type NextReply, type Side, type StudentApi, type StudentStatus, type Third } from './api';
import {
  REFLECTION_MAX,
  SIDE_LETTER,
  THIRD_LABEL,
  alertBox,
  answerCard,
  criterionOf,
  pairForm,
  pairRow,
  poll,
  waitPanel,
  type CjBlock
} from './shared';

/**
 * The student's run through a round (D11–D19): practise on the teacher's
 * pairs, predict where their own answer sits, judge pairs, then say one thing
 * they'd now change. Nothing here shows a rank number or anyone's name.
 */
export type StudentMountOptions = {
  lessonId: string;
  classId?: string;
  /** Test seam. */
  api?: StudentApi;
};

export function mountStudent(block: CjBlock, opts: StudentMountOptions): HTMLElement {
  const root = el('div', 'cj-run cj-student');
  const body = el('div', 'cj-student__body');
  const alert = alertBox();
  root.append(body, alert);
  body.append(el('p', 'pf-note block-secondary', 'Loading…'));

  let api: StudentApi | null = opts.api ?? null;
  let classId = opts.classId ?? '';
  let status: StudentStatus | null = null;
  /** A screen the student is part-way through; polling leaves it alone. */
  let holding: 'feedback' | 'pair' | 'extra' | null = null;
  let painted = '';
  let busy = false;
  const criterion = criterionOf(block.content);
  const chips = block.content.chips.filter((c) => c.trim());

  const showError = (error: unknown) => {
    alert.textContent = errorText(error);
    alert.hidden = false;
  };

  async function refresh(force = false): Promise<void> {
    if (!api || busy) return;
    if (holding && !force) return;
    try {
      const next = await api.status();
      status = next;
      alert.hidden = true;
      paint(force);
    } catch (error) {
      if (error instanceof ApiClientError && error.code === 'no_list') {
        status = { need: null, anonymous: true };
        paint(force);
        return;
      }
      if (!status || force) showError(error);
    }
  }

  /** A reply that carries the full state: paint it straight away. */
  function adopt(next: StudentStatus): void {
    status = next;
    holding = null;
    paint(true);
  }

  let lastCode = '';
  async function run<T>(work: () => Promise<T>): Promise<T | null> {
    busy = true;
    lastCode = '';
    try {
      const out = await work();
      alert.hidden = true;
      return out;
    } catch (error) {
      lastCode = error instanceof ApiClientError ? error.code : '';
      showError(error);
      return null;
    } finally {
      busy = false;
    }
  }

  function paint(force = false): void {
    if (!status) return;
    const s = status;
    const sig = JSON.stringify([s.need, s.anonymous, s.phase, s.done_count, s.target, s.calibration?.index, s.third, s.has_answer]);
    if (sig === painted && !force) return;
    painted = sig;
    holding = null;
    if (s.anonymous) return void body.replaceChildren(waitPanel('Judging opens once your teacher adds your class list.'));
    if (s.need === 'initials') return void body.replaceChildren(claimForm());
    switch (s.phase ?? 'closed') {
      case 'closed':
        body.replaceChildren(waitPanel('Your teacher opens judging soon.', 'This page updates by itself.'));
        return;
      case 'calibrate':
        body.replaceChildren(calibrateView(s));
        return;
      case 'predict':
        body.replaceChildren(predictView());
        return;
      case 'judge':
        void loadPair();
        return;
      case 'reflect':
        body.replaceChildren(reflectView(s));
        return;
      case 'done':
        body.replaceChildren(doneView(s));
        return;
    }
  }

  function claimForm(): HTMLElement {
    const form = el('form', 'cj-claim');
    const id = `cj-claim-${block.id}`;
    const label = el('label', 'pf-field__label', 'Type your initials to start judging.');
    label.htmlFor = id;
    const input = el('input', 'cj-input cj-claim__input');
    input.id = id;
    input.maxLength = 5;
    input.autocomplete = 'off';
    const go = el('button', 'btn btn--secondary', 'That’s me');
    go.type = 'submit';
    const err = el('p', 'pf-alert');
    err.setAttribute('role', 'alert');
    err.hidden = true;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!api || !input.value.trim()) return;
      const next = await run(() => api!.claim(input.value.trim()));
      if (!next) return;
      if (next.need === 'initials') {
        err.textContent = 'Check your initials match the ones on your class list, then try again.';
        err.hidden = false;
        return;
      }
      adopt(next);
    });
    form.append(label, input, go, err);
    return form;
  }

  function calibrateView(s: StudentStatus): HTMLElement {
    const cal = s.calibration;
    const box = el('div', 'cj-step');
    if (!cal) {
      box.append(waitPanel('Getting your practice pair…'));
      return box;
    }
    box.append(
      el('p', 'cj-step__eyebrow block-eyebrow', `Practice pair ${cal.index + 1} of ${cal.total}`),
      el('p', 'cj-step__lead block-body', 'Your teacher wrote these two answers. Pick the stronger one, then see what your teacher chose.'),
      el('p', 'cj-criterion block-subtitle', criterion),
      pairRow(answerCard('left', cal.left), answerCard('right', cal.right))
    );
    const actions = el('div', 'cj-choose');
    for (const side of ['left', 'right'] as const) {
      actions.append(
        button(`${SIDE_LETTER[side]} is stronger`, 'primary', async function () {
          for (const b of actions.querySelectorAll('button')) b.disabled = true;
          const reply = await run(() => api!.calibrate(cal.index, side));
          if (!reply) {
            for (const b of actions.querySelectorAll('button')) b.disabled = false;
            return;
          }
          actions.replaceWith(calibrateFeedback(side, reply));
        })
      );
    }
    box.append(actions);
    return box;
  }

  function calibrateFeedback(mine: Side, reply: CalibrateReply): HTMLElement {
    holding = 'feedback';
    const box = el('div', 'cj-feedback');
    box.setAttribute('role', 'status');
    const same = mine === reply.teacher;
    const reason = reply.reason.trim();
    const teacherLine = same
      ? `Your teacher chose ${SIDE_LETTER[reply.teacher]} too${reason ? ` because ${lowerFirst(reason)}` : '.'}`
      : `Your teacher chose ${SIDE_LETTER[reply.teacher]}${reason ? ` because ${lowerFirst(reason)}` : '.'}`;
    box.dataset.match = String(same);
    box.append(
      el('p', 'cj-feedback__mine block-subtitle', `You chose ${SIDE_LETTER[mine]}.`),
      el('p', 'cj-feedback__teacher block-body', endWithStop(teacherLine)),
      button('Next', 'primary', () => {
        holding = null;
        const { teacher: _t, reason: _r, ...next } = reply;
        if (next.phase) adopt(next);
        else void refresh(true);
      })
    );
    return box;
  }

  function predictView(): HTMLElement {
    const box = el('div', 'cj-step');
    box.append(
      el('p', 'cj-step__eyebrow block-eyebrow', 'Before you judge'),
      el('p', 'cj-step__lead block-subtitle', 'Where do you think your own answer sits among the class’s answers?')
    );
    const row = el('div', 'cj-thirds');
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', 'Your prediction');
    for (const third of ['top', 'middle', 'bottom'] as Third[]) {
      row.append(
        button(THIRD_LABEL[third], 'secondary', async function () {
          for (const b of row.querySelectorAll('button')) b.disabled = true;
          const next = await run(() => api!.predict(third));
          if (next === null) {
            for (const b of row.querySelectorAll('button')) b.disabled = false;
            return;
          }
          adopt(next);
        })
      );
    }
    box.append(row, el('p', 'pf-field__hint block-secondary', 'Only your teacher sees your prediction.'));
    return box;
  }

  async function loadPair(extra = false): Promise<void> {
    if (!api) return;
    body.replaceChildren(waitPanel('Finding a pair…'));
    const reply = await run(() => api!.next());
    if (!reply) return;
    if (!reply.pair) {
      // Nothing left to judge right now: the status says what comes next.
      holding = null;
      if (extra || status?.phase === 'judge') {
        body.replaceChildren(waitPanel('That’s every pair for now.', 'Your teacher may add more answers soon.'));
        window.setTimeout(() => void refresh(true), 1500);
      } else void refresh(true);
      return;
    }
    holding = extra ? 'extra' : 'pair';
    body.replaceChildren(judgeView(reply, extra));
  }

  function judgeView(reply: NextReply, extra: boolean): HTMLElement {
    const box = el('div', 'cj-step');
    const progress = extra ? 'An extra pair' : `Pair ${Math.min(reply.done_count + 1, reply.target)} of ${reply.target}`;
    box.append(
      pairForm({
        pair: reply.pair!,
        criterion,
        chips,
        progress,
        onPick: async (judgement) => {
          const next = await run(() => api!.judge(judgement));
          if (next === null) {
            // Already judged, or enough judged: the status says where things stand.
            if (['seen', 'enough', 'closed'].includes(lastCode)) {
              holding = null;
              await refresh(true);
            }
            return;
          }
          holding = null;
          adopt(next);
        }
      })
    );
    return box;
  }

  function reflectView(s: StudentStatus): HTMLElement {
    const box = el('div', 'cj-step');
    const id = `cj-reflect-${block.id}`;
    const label = el('label', 'cj-step__lead block-subtitle', 'You’ve judged your pairs. What is one thing you’d now add or change in your own answer?');
    label.htmlFor = id;
    const input = el('textarea', 'pf-field__input cj-reflect');
    input.id = id;
    input.rows = 3;
    input.maxLength = REFLECTION_MAX;
    const actions = el('div', 'pf-actions');
    actions.append(
      button('Save', 'primary', async function () {
        if (!input.value.trim()) {
          input.focus();
          return;
        }
        this.disabled = true;
        const next = await run(() => api!.reflect(input.value.trim()));
        this.disabled = false;
        if (next !== null) adopt(next);
      })
    );
    const go = goToAnswer(s);
    if (go) actions.append(go);
    box.append(label, input, actions);
    return box;
  }

  function doneView(s: StudentStatus): HTMLElement {
    const box = el('div', 'cj-step');
    const panel = el('div', 'pf-panel pf-panel--wait cj-done');
    panel.append(el('p', 'pf-panel__title block-subtitle', 'Thanks for judging.'), el('p', 'pf-panel__text block-body', 'Your choices help the class see what makes an answer strong.'));
    if (s.third) {
      panel.append(el('p', 'cj-third block-body', s.third === 'bottom' ? 'Your answer is in the bottom third this time. Your next step is the change you wrote down.' : `Your answer is in the ${s.third} third of the class’s answers.`));
    }
    const actions = el('div', 'pf-actions');
    const more = (s.done_count ?? 0) < (s.target ?? 0) * 2;
    if (more) actions.append(button('Judge another pair', 'secondary', () => void loadPair(true)));
    const go = goToAnswer(s);
    if (go) actions.append(go);
    if (actions.childElementCount) panel.append(actions);
    box.append(panel);
    return box;
  }

  /** Same lesson: scroll to the source block. Another lesson: open it. */
  function goToAnswer(s: StudentStatus): HTMLElement | null {
    if (!s.has_answer) return null;
    const src = block.content.source;
    if (!src.block_id) return null;
    if (!src.lesson_id || src.lesson_id === opts.lessonId) {
      return button('Go to my answer', 'secondary', () => {
        const target = document.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(src.block_id)}"]`);
        if (!target) return;
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const box = target.querySelector<HTMLElement>('textarea, [contenteditable="true"]');
        box?.focus({ preventScroll: true });
      });
    }
    const href = classId
      ? `/s/classes/${encodeURIComponent(classId)}/lessons/${encodeURIComponent(src.lesson_id)}`
      : `/s/lessons/${encodeURIComponent(src.lesson_id)}`;
    return studentAnchor(href, 'btn btn--secondary', 'Go to my answer');
  }

  async function start(): Promise<void> {
    if (!api) {
      if (!classId) classId = (await classForPlainLesson(opts.lessonId).catch(() => null)) ?? '';
      if (!classId) {
        body.replaceChildren(waitPanel('Open this lesson from your class page to judge answers.'));
        return;
      }
      api = studentApi(opts.lessonId, block.id, classId);
    }
    poll(root, () => refresh());
  }

  void start();
  return root;
}

function lowerFirst(s: string): string {
  return s ? s[0]!.toLowerCase() + s.slice(1) : s;
}

function endWithStop(s: string): string {
  return /[.!?…]$/.test(s) ? s : `${s}.`;
}
