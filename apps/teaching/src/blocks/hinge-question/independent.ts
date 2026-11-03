import { apiPost } from '@/api/client';
import { button, el, errorText, readJSON, writeJSON } from '@/blocks/peer-feedback-ui';
import { LETTERS, REASON_MAX, independentFeedback, type HingeBlock, type HingeTier } from './shared';

type Choice = { id: string; text: string };
type TryView = { pick: string; sure: boolean | null; tier: HingeTier; note: string };
export type IndependentView = {
  phase: 'independent';
  first: TryView | null;
  retry: null | { prompt: string; options: Choice[]; answer: TryView | null; correct_id?: string };
  done: boolean;
  /** The main question's right answer, sent only once the student has finished. */
  correct_id?: string;
};

let seq = 0;

function deviceToken(key: string): string | null {
  const saved = readJSON<string>(key);
  if (saved && /^[a-f0-9]{48}$/.test(saved)) return saved;
  const fresh = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('');
  return writeJSON(key, fresh) ? fresh : null;
}

/** The answers as buttons. Once answered they lock, with the student's pick and (when known) the right answer marked. */
function choiceList(options: Choice[], answered: TryView | null, correctId: string | undefined, onPick?: (id: string) => void): HTMLElement {
  const list = el('div', 'hq-choices');
  list.setAttribute('role', 'radiogroup');
  list.setAttribute('aria-label', 'Your answer');
  options.forEach((o, i) => {
    const choice = el('button', 'hq-choice');
    choice.type = 'button';
    choice.dataset.id = o.id;
    choice.setAttribute('role', 'radio');
    const chosen = answered?.pick === o.id;
    choice.setAttribute('aria-checked', String(chosen));
    choice.dataset.chosen = String(chosen);
    if (correctId) choice.dataset.right = String(o.id === correctId);
    choice.disabled = !!answered;
    choice.append(el('span', 'hq-letter', LETTERS[i] ?? '?'), el('span', 'hq-choice__text', o.text));
    if (chosen) choice.append(el('span', 'hq-choice__mine', 'Your answer'));
    if (!answered && onPick) choice.addEventListener('click', () => onPick(o.id));
    list.append(choice);
  });
  return list;
}

function feedbackBox(t: TryView): HTMLElement {
  const f = independentFeedback(t.tier, t.sure, t.note);
  const box = el('div', `hq-verdict hq-verdict--${f.tone === 'right' ? 'right' : f.tone === 'close' ? 'close' : 'nudge'}`);
  box.setAttribute('role', 'status');
  box.append(el('p', 'hq-verdict__title block-subtitle', f.title), el('p', 'block-body', f.body));
  return box;
}

/** Pick, say why, optionally say how sure, then check. */
function askForm(options: Choice[], label: string, onSubmit: (pick: string, reason: string, sure: boolean | null) => Promise<void>): HTMLElement {
  const wrap = el('div', 'hq-ind__ask');
  let pick: string | null = null;
  let sure: boolean | null = null;
  const list = choiceList(options, null, undefined, (id) => {
    pick = id;
    for (const b of list.querySelectorAll<HTMLButtonElement>('.hq-choice')) {
      const on = b.dataset.id === id;
      b.setAttribute('aria-checked', String(on));
      b.dataset.chosen = String(on);
    }
    sync();
  });

  const id = `hq-why-${++seq}`;
  const why = el('div', 'pf-field hq-ind__why');
  const whyLabel = el('label', 'pf-field__label', 'Why do you think that?');
  whyLabel.htmlFor = id;
  const reason = el('textarea', 'pf-field__input hq-ind__reason');
  reason.id = id;
  reason.rows = 2;
  reason.maxLength = REASON_MAX;
  reason.placeholder = 'A sentence is plenty.';
  const count = el('p', 'pf-field__hint block-secondary hq-ind__count', `0 / ${REASON_MAX}`);
  reason.addEventListener('input', () => {
    count.textContent = `${reason.value.length} / ${REASON_MAX}`;
    sync();
  });
  why.append(whyLabel, reason, count);

  const conf = el('div', 'pf-field hq-ind__sure');
  conf.append(el('p', 'pf-field__label', 'How sure are you? (optional)'));
  const chips = el('div', 'hq-chips');
  chips.setAttribute('role', 'group');
  chips.setAttribute('aria-label', 'How sure are you?');
  const paintChips = () => {
    for (const b of chips.querySelectorAll<HTMLButtonElement>('button')) b.setAttribute('aria-pressed', String(b.dataset.value === String(sure)));
  };
  for (const [value, text] of [[true, 'Sure'], [false, 'Not sure']] as const) {
    const chip = button(text, 'ghost', () => {
      // Tap again to take it back.
      sure = sure === value ? null : value;
      paintChips();
    });
    chip.className = 'hq-chip';
    chip.dataset.value = String(value);
    chips.append(chip);
  }
  paintChips();
  conf.append(chips);

  const check = button(label, 'primary', async function () {
    if (!pick || !reason.value.trim()) return;
    this.disabled = true;
    const text = this.textContent;
    this.textContent = 'Checking…';
    try {
      await onSubmit(pick, reason.value, sure);
    } finally {
      if (this.isConnected) {
        this.textContent = text;
        sync();
      }
    }
  });
  check.classList.add('hq-ind__check');
  const sync = () => {
    check.disabled = !pick || !reason.value.trim();
  };
  sync();
  wrap.append(list, why, conf, check);
  return wrap;
}

/**
 * A hinge question set to independent pace, outside a lecture: the student
 * answers alone with a reason and gets their own feedback. A miss earns one
 * fresh try on the back-up question, then they move on either way. The
 * server grades every try; the right answer arrives only once they finish.
 */
export function mountIndependent(block: HingeBlock, lessonId: string): HTMLElement {
  const endpoint = `/api/published/hinge/${encodeURIComponent(lessonId)}/${encodeURIComponent(block.id)}`;
  const token = deviceToken(`hinge:${lessonId}:${block.id}:device`);
  const root = el('div', 'hq-run hq-ind');
  const body = el('div', 'hq-ind__body');
  const alert = el('p', 'pf-alert');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  root.append(body, alert);
  let view: IndependentView | null = null;

  async function send(action: string, extra: Record<string, unknown> = {}): Promise<void> {
    try {
      view = await apiPost<IndependentView>(endpoint, { token, action, ...extra });
      alert.hidden = true;
      paint();
    } catch (error) {
      alert.textContent = errorText(error);
      alert.hidden = false;
    }
  }

  function paint(): void {
    if (!token) {
      body.replaceChildren(el('p', 'pf-alert', 'Open a normal (not private) window to answer here.'));
      return;
    }
    if (!view) {
      body.replaceChildren(el('p', 'pf-note block-secondary', 'Loading…'));
      return;
    }
    const v = view;
    const parts: HTMLElement[] = [];
    if (!v.first) {
      parts.push(
        askForm(block.content.options, 'Check my answer', (pick, reason, sure) => send('independent_answer', { pick, reason, sure }))
      );
      body.replaceChildren(...parts);
      return;
    }
    parts.push(choiceList(block.content.options, v.first, v.correct_id), feedbackBox(v.first));
    if (v.retry) {
      const retry = el('div', 'hq-ind__retry');
      retry.append(
        el('p', 'pf-eyebrow block-eyebrow', 'A fresh one'),
        el('p', 'hq-ind__prompt block-subtitle', v.retry.prompt)
      );
      if (!v.retry.answer) {
        retry.append(
          el('p', 'block-secondary', 'Same idea, new question. One try, then you move on either way.'),
          askForm(v.retry.options, 'Check this one', (pick, reason, sure) => send('independent_retry', { pick, reason, sure })),
          button('Move on without it', 'ghost', function () {
            this.disabled = true;
            void send('independent_skip');
          })
        );
      } else {
        retry.append(choiceList(v.retry.options, v.retry.answer, v.retry.correct_id), feedbackBox(v.retry.answer));
      }
      parts.push(retry);
    }
    if (v.done) {
      parts.push(
        el(
          'p',
          'pf-note block-secondary hq-ind__done',
          v.correct_id && v.first.tier !== 'right' ? 'All done. The right answer is marked above, so you can see where it lands.' : 'All done. Your teacher can see your answer and your reason.'
        )
      );
    }
    body.replaceChildren(...parts);
  }

  paint();
  if (token) void send('independent_status');
  return root;
}
