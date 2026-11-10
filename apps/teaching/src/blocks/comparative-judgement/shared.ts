import { el } from '@/quiz/dom';
import type { Block } from '@/schemas/block';
import type { ChipPicks, JudgeBody, Pair, Reliability, Side, Third } from './api';

export type CjBlock = Extract<Block, { block_type: 'comparative_judgement' }>;
export type CjContent = CjBlock['content'];

export const POLL_MS = 8000;
export const REASON_MAX = 200;
export const REFLECTION_MAX = 600;

export const THIRD_LABEL: Record<Third, string> = { top: 'Top third', middle: 'Middle third', bottom: 'Bottom third' };
export const SIDE_LETTER: Record<Side, 'A' | 'B'> = { left: 'A', right: 'B' };

/** Plain words for the reliability signal (D9). */
export const LEVEL_TEXT: Record<Reliability['level'], { title: string; body: string }> = {
  marks: { title: 'Reliable enough for marks', body: 'The order is steady. You can use it for marks.' },
  feedback: { title: 'Reliable enough for feedback', body: 'The order is steady enough to talk about and give feedback from. A few more judgements make it fit for marks.' },
  keep: { title: 'Keep judging', body: 'The order is still settling. More judgements will steady it.' }
};

export const criterionOf = (content: CjContent): string => content.criterion.trim() || 'Which answer is stronger overall?';

/** Runs `tick` now and every few seconds while `root` is on the page and the tab is visible. */
export function poll(root: HTMLElement, tick: () => Promise<void>, ms = POLL_MS): void {
  let timer: number | undefined;
  const onVisible = () => {
    if (!root.isConnected) return document.removeEventListener('visibilitychange', onVisible);
    if (!document.hidden) void tick();
  };
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(async () => {
      if (!root.isConnected) return document.removeEventListener('visibilitychange', onVisible);
      if (!document.hidden) await tick().catch(() => undefined);
      schedule();
    }, ms);
  };
  document.addEventListener('visibilitychange', onVisible);
  void tick()
    .catch(() => undefined)
    .finally(schedule);
}

/** One answer card: "Answer A" and the text, kept as typed (line breaks stay). */
export function answerCard(side: Side, text: string, extra?: HTMLElement): HTMLElement {
  const card = el('article', 'cj-card');
  card.dataset.side = side;
  const head = el('p', 'cj-card__label', `Answer ${SIDE_LETTER[side]}`);
  const body = el('div', 'cj-card__text block-body', text.trim() || '(No writing)');
  card.setAttribute('aria-label', `Answer ${SIDE_LETTER[side]}`);
  card.append(head, body);
  if (extra) card.append(extra);
  return card;
}

/** Two answers side by side on a wide screen, one above the other on a phone. */
export function pairRow(left: HTMLElement, right: HTMLElement): HTMLElement {
  const row = el('div', 'cj-pair');
  row.append(left, right);
  return row;
}

export type PairFormOptions = {
  pair: Pair;
  criterion: string;
  chips: string[];
  /** e.g. "Pair 3 of 8". */
  progress?: string;
  onPick: (body: JudgeBody, pressed: HTMLButtonElement) => void | Promise<void>;
};

/**
 * The judging view: two answers, chips under each ("What does this answer do
 * well?"), an optional one-line reason and the two choice buttons. Students
 * and the teacher use the same view (D16), so it never shows whose answer it is.
 */
export function pairForm(opts: PairFormOptions): HTMLElement {
  const root = el('div', 'cj-judge');
  const picks: ChipPicks = { left: [], right: [] };
  const head = el('div', 'cj-judge__head');
  if (opts.progress) head.append(el('p', 'cj-progress block-secondary', opts.progress));
  head.append(el('p', 'cj-criterion block-subtitle', opts.criterion));
  root.append(head);

  const chipsFor = (side: Side): HTMLElement | undefined => {
    if (!opts.chips.length) return undefined;
    const box = el('div', 'cj-chips');
    const q = el('p', 'cj-chips__q block-secondary', 'What does this answer do well?');
    const row = el('div', 'cj-chips__row');
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', `What answer ${SIDE_LETTER[side]} does well`);
    opts.chips.forEach((label, i) => {
      const chip = el('button', 'cj-chip', label);
      chip.type = 'button';
      chip.setAttribute('aria-pressed', 'false');
      chip.addEventListener('click', () => {
        const list = picks[side];
        const at = list.indexOf(i);
        if (at >= 0) list.splice(at, 1);
        else list.push(i);
        chip.setAttribute('aria-pressed', String(at < 0));
      });
      row.append(chip);
    });
    box.append(q, row);
    return box;
  };
  root.append(pairRow(answerCard('left', opts.pair.left.text, chipsFor('left')), answerCard('right', opts.pair.right.text, chipsFor('right'))));

  const reasonWrap = el('div', 'pf-field cj-reason');
  const reasonId = `cj-reason-${Math.random().toString(36).slice(2, 8)}`;
  const reasonLabel = el('label', 'pf-field__label', 'Why? (optional, one line)');
  reasonLabel.htmlFor = reasonId;
  const reason = el('input', 'cj-input');
  reason.id = reasonId;
  reason.type = 'text';
  reason.maxLength = REASON_MAX;
  reason.autocomplete = 'off';
  reasonWrap.append(reasonLabel, reason);
  root.append(reasonWrap);

  const actions = el('div', 'cj-choose');
  for (const side of ['left', 'right'] as const) {
    const b = el('button', 'btn btn--primary cj-choose__btn', `${SIDE_LETTER[side]} is stronger`);
    b.type = 'button';
    b.addEventListener('click', () => {
      const winner = side === 'left' ? opts.pair.left.id : opts.pair.right.id;
      for (const other of actions.querySelectorAll('button')) other.disabled = true;
      void Promise.resolve(
        opts.onPick({ left: opts.pair.left.id, right: opts.pair.right.id, winner, chips: { left: [...picks.left], right: [...picks.right] }, reason: reason.value.trim() }, b)
      ).finally(() => {
        if (b.isConnected) for (const other of actions.querySelectorAll('button')) other.disabled = false;
      });
    });
    actions.append(b);
  }
  root.append(actions);
  return root;
}

export function waitPanel(title: string, sub?: string): HTMLElement {
  const box = el('div', 'pf-panel pf-panel--wait');
  box.append(el('p', 'pf-panel__title block-subtitle', title));
  if (sub) box.append(el('p', 'pf-panel__text block-body', sub));
  return box;
}

export function alertBox(): HTMLParagraphElement {
  const alert = el('p', 'pf-alert');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  return alert;
}

/** Linear map of the scale to marks (D20), matching the server's markFor. */
export function markFrom(marks: { a: number; b: number; out_of: number }, theta: number): number {
  const raw = marks.a + marks.b * theta;
  const rounded = Math.round((Number.isFinite(raw) ? raw : 0) * 2) / 2;
  return Math.min(marks.out_of, Math.max(0, rounded));
}

export const pct = (x: number): string => `${Math.round((Number.isFinite(x) ? x : 0) * 100)}%`;
export const two = (x: number | null | undefined): string => (x === null || x === undefined || !Number.isFinite(x) ? '–' : x.toFixed(2).replace(/^0\./, '.').replace(/^-0\./, '-.'));
