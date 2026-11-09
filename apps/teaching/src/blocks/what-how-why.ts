import { apiPost } from '@/api/client';
import type { Block } from '@/schemas/block';
import type { RenderContext, RenderMode } from '@/blocks/render';
import { shuffleArray } from '@/blocks/learning-activity';
import { button, el, errorText, isNotPublished, notLivePanel } from '@/blocks/peer-feedback-ui';
import { poller } from '@/blocks/brainstorm/shared';
import { deviceToken } from '@/quiz/dom';
import { whatHowWhyContent } from '@/blocks/what-how-why-editor';
import '@/blocks/peer-feedback.css';
import './what-how-why.css';

/**
 * What, How, Why: the lesson's learning intentions as nested brackets. The What
 * and the prepared How live in the block. Each student writes their own Why,
 * then it fades through the class's with theirs in its own colour. Students can
 * suggest criteria, and the teacher picks and rewords them on this block. The
 * rules live on the server (netlify/functions/_shared/lesson-why.mjs).
 */

type OutcomesBlock = Extract<Block, { block_type: 'outcomes' }>;
type Criterion = { id: string; text: string };
type StudentState = { mine: string | null; others: string[]; criteria: Criterion[]; suggested: number };
type TeacherWhy = { id: string; text: string; flagged: boolean; visible: boolean };
type TeacherState = { whys: TeacherWhy[]; suggestions: Array<{ id: string; text: string; flagged: boolean }>; criteria: Criterion[] };
type Line = { text: string; mine?: boolean };

const MAX_WHY = 120;
const MAX_CRITERION = 120;
const MAX_SUGGESTIONS = 3;
const HOLD_MS = 4500;
const FADE_MS = 1100;
/** Students read slowly and there may be a whole class of them, so they ask less often. */
const STUDENT_POLL_MS = 20000;

function bracket(kind: 'what' | 'how' | 'why', label: string): HTMLElement {
  const box = el('div', `whw__br whw__br--${kind}`);
  box.append(el('p', 'whw__label', label));
  return box;
}

/** Fades through lines one at a time. Stops by itself once it leaves the page. */
function fader(): { root: HTMLElement; set(lines: Line[]): void } {
  const root = el('p', 'whw__fade');
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  let lines: Line[] = [];
  let at = 0;
  let timer: number | undefined;
  const show = () => {
    const line = lines[at];
    root.textContent = line?.text ?? '';
    root.classList.toggle('whw__fade--mine', Boolean(line?.mine));
  };
  const step = () => {
    if (!root.isConnected && timer !== undefined) {
      window.clearInterval(timer);
      timer = undefined;
      return;
    }
    if (lines.length < 2) return;
    at = (at + 1) % lines.length;
    if (still) return show();
    root.classList.add('whw__fade--out');
    window.setTimeout(() => {
      show();
      root.classList.remove('whw__fade--out');
    }, FADE_MS);
  };
  return {
    root,
    set(next) {
      const current = lines[at]?.text;
      lines = next;
      const kept = lines.findIndex((l) => l.text === current);
      at = kept >= 0 ? kept : 0;
      show();
      if (timer === undefined) timer = window.setInterval(step, HOLD_MS);
    }
  };
}

/** The student's own Why first and again part way through, among the class's. */
export function fadeLines(mine: string | null, others: string[], shuffle: (items: string[]) => string[] = shuffleArray): Line[] {
  const mixed: Line[] = shuffle(others).map((text) => ({ text }));
  if (!mine) return mixed;
  mixed.splice(Math.ceil(mixed.length / 2), 0, { text: mine, mine: true });
  return [{ text: mine, mine: true }, ...(mixed.length > 1 ? mixed : [])];
}

function mountStudent(block: OutcomesBlock, lessonId: string, parts: Parts): void {
  const endpoint = `/api/published/why/${encodeURIComponent(lessonId)}/${encodeURIComponent(block.id)}`;
  const deviceKey = deviceToken(`why:${lessonId}`);
  const alert = el('p', 'pf-alert');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  const fade = fader();
  const suggestBox = el('div', 'whw__suggest');
  const paintedHow = { key: '' };
  let state: StudentState | null = null;
  let editing = false;
  let suggesting = false;
  let thanked = false;
  let mineShown: string | null | undefined;

  async function send(action: string, extra: Record<string, unknown> = {}): Promise<boolean> {
    try {
      state = await apiPost<StudentState>(endpoint, { token: deviceKey, action, ...extra });
      alert.hidden = true;
      paint();
      return true;
    } catch (error) {
      // A quiet poll failing shouldn't interrupt a student who is reading.
      if (action !== 'status') {
        alert.textContent = errorText(error);
        alert.hidden = false;
      }
      return false;
    }
  }

  function paintHow(): void {
    const items = [...block.content.how, ...(state?.criteria ?? [])];
    const key = JSON.stringify(items);
    if (key === paintedHow.key) return;
    paintedHow.key = key;
    parts.how.replaceChildren(
      ...items.map((criterion) => el('li', 'whw__item', criterion.text))
    );
  }

  function paintSuggest(): void {
    if (suggestBox.contains(document.activeElement) && suggesting) return;
    suggestBox.replaceChildren();
    if (!deviceKey || (state?.suggested ?? 0) >= MAX_SUGGESTIONS) {
      if (thanked) suggestBox.append(el('p', 'whw__note', 'Sent to your teacher.'));
      return;
    }
    if (!suggesting) {
      suggestBox.append(button('Suggest one', 'ghost', () => {
        suggesting = true;
        thanked = false;
        paintSuggest();
        suggestBox.querySelector('input')?.focus();
      }));
      if (thanked) suggestBox.append(el('span', 'whw__note', 'Sent to your teacher.'));
      return;
    }
    const form = writeForm('What should be on the list?', 'Suggest a criterion', 'Send', MAX_CRITERION, async (text) => {
      const ok = await send('suggest', { text });
      if (ok) {
        suggesting = false;
        thanked = true;
        (document.activeElement as HTMLElement | null)?.blur();
        paintSuggest();
      }
    });
    suggestBox.append(form);
  }

  function paintWhy(): void {
    const mine = state?.mine ?? null;
    fade.set(fadeLines(mine, state?.others ?? []));
    if (mine === mineShown && !editing && parts.why.childElementCount) return;
    if (editing && parts.why.querySelector('input')) return;
    mineShown = mine;
    parts.why.replaceChildren();
    if (!deviceKey) {
      parts.why.append(el('p', 'whw__note', 'This browser can’t remember you. Write your why in your book.'));
      return;
    }
    if (!mine || editing) {
      parts.why.append(
        writeForm('Why does this matter to you?', 'Why this matters to you', mine ? 'Save' : 'Add mine', MAX_WHY, async (text) => {
          if (await send('why', { text })) {
            editing = false;
            mineShown = undefined;
            paintWhy();
          }
        }, mine ?? '')
      );
      return;
    }
    parts.why.append(
      fade.root,
      button('Change mine', 'ghost', () => {
        editing = true;
        paintWhy();
        parts.why.querySelector('input')?.focus();
      })
    );
  }

  function paint(): void {
    paintHow();
    paintSuggest();
    paintWhy();
  }

  parts.howExtra.append(suggestBox);
  parts.root.append(alert);
  paint();
  poller(parts.root, async () => {
    if (deviceKey) await send('status');
  }, STUDENT_POLL_MS);
}

function writeForm(placeholder: string, label: string, action: string, max: number, onSend: (text: string) => Promise<void>, start = ''): HTMLElement {
  const form = el('form', 'whw__write');
  const input = el('input', 'whw__input');
  input.type = 'text';
  input.maxLength = max;
  input.placeholder = placeholder;
  input.value = start;
  input.setAttribute('aria-label', label);
  const go = button(action, 'primary', () => {});
  go.type = 'submit';
  const error = el('p', 'whw__error');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  input.addEventListener('input', () => {
    error.hidden = true;
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) {
      error.textContent = 'Write something first';
      error.hidden = false;
      return;
    }
    go.disabled = true;
    await onSend(text);
    go.disabled = false;
  });
  form.append(input, go, error);
  return form;
}

function mountTeacher(block: OutcomesBlock, lessonId: string, parts: Parts, display: boolean): void {
  const endpoint = `/api/lessons/${encodeURIComponent(lessonId)}/why/${encodeURIComponent(block.id)}`;
  const panel = el('div', 'whw__panel');
  const alert = el('p', 'pf-alert');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  const fade = fader();
  let state: TeacherState | null = null;
  let painted = '';
  let howKey = '';

  async function send(action: string, extra: Record<string, unknown> = {}): Promise<void> {
    try {
      state = await apiPost<TeacherState>(endpoint, { action, ...extra });
      alert.hidden = true;
      paint();
    } catch (error) {
      if (isNotPublished(error)) {
        parts.why.replaceChildren(el('p', 'whw__note', 'Students write theirs here once this is published.'));
        if (!display) panel.replaceChildren(notLivePanel());
      } else if (action !== 'status' || !state) {
        alert.textContent = errorText(error);
        alert.hidden = false;
      }
    }
  }

  function paintHow(): void {
    const added = state?.criteria ?? [];
    const key = JSON.stringify(added);
    if (key === howKey) return;
    howKey = key;
    parts.how.replaceChildren(
      ...[...block.content.how.map((c) => ({ ...c, live: false })), ...added.map((c) => ({ ...c, live: true }))].map((c) => {
        const li = el('li', 'whw__item', c.text);
        if (c.live && !display) {
          li.append(' ', button('Remove', 'ghost', () => void send('remove_criterion', { id: c.id })));
        }
        return li;
      })
    );
  }

  function paintWhy(): void {
    const shown = (state?.whys ?? []).filter((w) => w.visible).map((w) => ({ text: w.text }));
    if (!shown.length) {
      parts.why.replaceChildren(el('p', 'whw__note', 'Students’ whys fade through here as they add them.'));
      return;
    }
    fade.set(shuffleArray(shown));
    if (!parts.why.contains(fade.root)) parts.why.replaceChildren(fade.root);
  }

  function paintPanel(): void {
    if (display || !state) return;
    const key = JSON.stringify([state.suggestions, state.whys]);
    // Polling mustn't wipe a suggestion the teacher is rewording.
    if (key === painted || panel.contains(document.activeElement)) return;
    painted = key;
    panel.replaceChildren();
    panel.append(el('p', 'whw__panel-title', 'With the class'));
    panel.append(writeForm('Add to the How list', 'Add a criterion', 'Add', MAX_CRITERION, (text) => send('add', { text })));

    if (state.suggestions.length) {
      panel.append(el('p', 'whw__panel-head', 'Suggestions: reword and add the ones you want'));
      const list = el('ul', 'whw__rows');
      for (const s of state.suggestions) {
        const li = el('li', 'whw__row');
        const input = el('input', 'whw__input');
        input.type = 'text';
        input.maxLength = MAX_CRITERION;
        input.value = s.text;
        input.setAttribute('aria-label', 'Reword this suggestion');
        li.append(input);
        if (s.flagged) li.append(el('span', 'whw__flag', 'Flagged'));
        li.append(
          button('Add', 'secondary', () => void send('add', { id: s.id, text: input.value })),
          button('Dismiss', 'ghost', () => void send('dismiss', { id: s.id }))
        );
        list.append(li);
      }
      panel.append(list);
    }

    if (state.whys.length) {
      panel.append(el('p', 'whw__panel-head', `Whys (${state.whys.length})`));
      const list = el('ul', 'whw__rows');
      for (const w of state.whys) {
        const li = el('li', 'whw__row');
        li.append(el('span', w.visible ? 'whw__row-text' : 'whw__row-text whw__row-text--hidden', w.text));
        if (w.flagged && !w.visible) li.append(el('span', 'whw__flag', 'Flagged'));
        li.append(
          w.visible
            ? button('Hide', 'ghost', () => void send('hide', { id: w.id }))
            : button('Show', 'ghost', () => void send('show', { id: w.id }))
        );
        list.append(li);
      }
      panel.append(list);
    }

    if (state.whys.length || state.suggestions.length || state.criteria.length) {
      panel.append(
        button('Clear for a new class', 'ghost', () => {
          if (window.confirm('Clear every why and suggestion, and the criteria added in class? Your prepared list stays.')) void send('clear');
        })
      );
    }
  }

  function paint(): void {
    paintHow();
    paintWhy();
    paintPanel();
  }

  paintHow();
  parts.root.append(alert);
  if (!display) parts.root.append(panel);
  poller(parts.root, () => send('status'));
}

type Parts = { root: HTMLElement; how: HTMLElement; howExtra: HTMLElement; why: HTMLElement };

export function renderWhatHowWhy(placed: OutcomesBlock, mode: RenderMode, ctx: RenderContext = {}): HTMLElement {
  const block: OutcomesBlock = { ...placed, content: whatHowWhyContent(placed.content) };
  const root = el('section', 'whw');
  root.dataset.blockId = block.id;
  const { what, how } = block.content;
  // A block placed before this design has nothing to say until the teacher writes it.
  if (mode !== 'teacher' && !what.trim() && !how.length) root.hidden = true;

  const outer = bracket('what', 'What we’re learning');
  outer.append(el('p', 'whw__what', what.trim() || (mode === 'teacher' ? 'Write what the class is learning' : '')));
  const howBox = bracket('how', 'How we’ll learn it and show it');
  const list = el('ul', 'whw__list');
  list.append(...how.map((c) => el('li', 'whw__item', c.text)));
  const howExtra = el('div', 'whw__how-extra');
  const whyBox = bracket('why', 'Why it matters');
  const why = el('div', 'whw__why');
  whyBox.append(why);
  howBox.append(list, howExtra, whyBox);
  outer.append(howBox);
  root.append(outer);

  if (mode === 'print') {
    why.append(el('div', 'pf-print__lines'));
    return root;
  }
  const parts: Parts = { root, how: list, howExtra, why };
  if (!ctx.lessonId) {
    why.append(el('p', 'whw__note', 'Each student writes their own from the published lesson.'));
  } else if (mode === 'teacher') {
    mountTeacher(block, ctx.lessonId, parts, ctx.display === true);
  } else if (!root.hidden) {
    mountStudent(block, ctx.lessonId, parts);
  }
  return root;
}
