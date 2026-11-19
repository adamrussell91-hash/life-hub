import { el } from '@/quiz/dom';

/**
 * The lab's charts. `bars` is here now; the dot readings, the findings chart
 * and the level bars (Tasks 4 and 5) join it.
 */

/** Grows every `[data-w]` bar under `root` to its width. Bars start at zero so the growth shows; reduced motion drops the transition in CSS. */
export function growBars(root: HTMLElement): void {
  const set = () => root.querySelectorAll<HTMLElement>('[data-w]').forEach((bar) => { bar.style.width = `${bar.dataset.w}%`; });
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(set));
  else set();
}

export type BarsInput = {
  labels: string[];
  values: number[];
  /** The index drawn in full lilac: the winner, or the most predicted. -1 for none (too close to call). */
  top?: number;
  /** The value a full-width bar stands for. Defaults to the largest value. */
  scaleMax?: number;
};

/** One row per option, largest first: label, bar, value. */
export function bars(input: BarsInput): HTMLElement {
  const { labels, values } = input;
  const max = input.scaleMax && input.scaleMax > 0 ? input.scaleMax : Math.max(...values, 1);
  const order = values.map((_, i) => i).sort((a, b) => values[b]! - values[a]! || a - b);
  const box = el('div', 'lab-bars');
  for (const i of order) {
    const row = el('div', `lab-bar${i === input.top ? ' is-top' : ''}`);
    const fill = el('i');
    fill.dataset.w = String(Math.max(0, Math.min(100, (values[i]! / max) * 100)));
    fill.style.width = '0';
    row.append(el('span', '', labels[i] ?? ''), fill, el('span', '', String(values[i])));
    box.append(row);
  }
  growBars(box);
  return box;
}

/** A thin progress bar: how many are in. */
export function meter(done: number, total: number): HTMLElement {
  const box = el('div', 'lab-meter');
  const fill = el('i');
  const share = total > 0 ? Math.max(0, Math.min(100, (done / total) * 100)) : 0;
  fill.dataset.w = String(share);
  fill.style.width = `${share}%`;
  box.setAttribute('role', 'progressbar');
  box.setAttribute('aria-valuemin', '0');
  box.setAttribute('aria-valuemax', String(total));
  box.setAttribute('aria-valuenow', String(done));
  box.append(fill);
  return box;
}
