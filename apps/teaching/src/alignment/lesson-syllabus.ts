import type { NetworkLine } from '@/schemas/block';
import { lineColour } from '@/network/colour';

const OPEN_KEY = 'teaching.lesson-syllabus.open';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === '1';
  } catch {
    return false;
  }
}

function writeOpen(open: boolean): void {
  try {
    localStorage.setItem(OPEN_KEY, open ? '1' : '0');
  } catch { /* The card still opens; it just forgets next time. */ }
}

export type LessonSyllabusCard = {
  element: HTMLElement;
  /** Section hosts, in the order they show when the card is open. */
  points: HTMLElement;
  lines: HTMLElement;
  outcomes: HTMLElement;
  plan: HTMLElement;
  /** The closed card's one-line summary. */
  setSummary(next: { points?: string[]; lines?: NetworkLine[]; outcomes?: number[] }): void;
  dispose(): void;
};

/**
 * One card for what a lesson teaches in the syllabus: dot points, lines,
 * tagged outcomes, and what the dot points ask for (outcomes, concept
 * bullets, processes, thinking skills) in full, to plan activities against.
 * Closed, it is a single summary row; open state is remembered.
 */
export function mountLessonSyllabus(host: HTMLElement): LessonSyllabusCard {
  const root = el('section', 'lsyl');
  root.setAttribute('aria-label', 'Syllabus for this lesson');
  const head = el('button', 'lsyl__head');
  head.type = 'button';
  const title = el('span', 'lsyl__title', 'Syllabus');
  const summary = el('span', 'lsyl__summary');
  const toggle = el('span', 'lsyl__toggle');
  head.append(title, summary, toggle);
  const body = el('div', 'lsyl__body');
  body.id = `lsyl-${Math.random().toString(36).slice(2, 8)}`;
  head.setAttribute('aria-controls', body.id);

  const section = (label: string, className: string): HTMLElement => {
    const wrap = el('div', `lsyl__section ${className}`);
    wrap.append(el('h4', 'lsyl__label', label));
    const slot = el('div', 'lsyl__slot');
    wrap.append(slot);
    body.append(wrap);
    // A section with nothing mounted in it stays out of the way.
    new MutationObserver(() => { wrap.hidden = !slot.querySelector(':scope > :not([hidden])'); }).observe(slot, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
    wrap.hidden = true;
    return slot;
  };
  const points = section('Dot points', 'lsyl__section--points');
  const lines = section('Lines', 'lsyl__section--lines');
  const outcomes = section('Tagged outcomes', 'lsyl__section--outcomes');
  const plan = section('Plan activities for', 'lsyl__section--plan');
  root.append(head, body);
  host.append(root);

  let open = readOpen();
  const setOpen = (next: boolean) => {
    open = next;
    root.classList.toggle('lsyl--open', open);
    head.setAttribute('aria-expanded', String(open));
    body.hidden = !open;
    toggle.textContent = open ? 'Hide' : 'Open';
  };
  head.addEventListener('click', () => {
    setOpen(!open);
    writeOpen(open);
  });
  setOpen(open);

  let state: { points: string[]; lines: NetworkLine[]; outcomes: number[] } = { points: [], lines: [], outcomes: [] };
  const paintSummary = () => {
    summary.replaceChildren();
    if (state.points.length) {
      const ids = el('span', 'lsyl__sum-group');
      for (const id of state.points) ids.append(el('span', 'lsyl__badge', id));
      summary.append(ids);
    }
    if (state.lines.length) {
      const dashes = el('span', 'lsyl__sum-group');
      dashes.title = state.lines.map((l) => l.name).join(', ');
      for (const line of state.lines) {
        const dash = el('span', `lsyl__dash lsyl__dash--${line.mode}`);
        dash.style.setProperty('--net-colour', lineColour(line.colour));
        dashes.append(dash);
      }
      dashes.append(el('span', 'lsyl__sum-text', `${state.lines.length} ${state.lines.length === 1 ? 'line' : 'lines'}`));
      summary.append(dashes);
    }
    if (state.outcomes.length) summary.append(el('span', 'lsyl__sum-text', `Outcomes ${state.outcomes.join(', ')}`));
    if (!summary.childElementCount) summary.append(el('span', 'lsyl__sum-text lsyl__sum-text--empty', 'Nothing tagged yet'));
  };
  paintSummary();

  return {
    element: root,
    points,
    lines,
    outcomes,
    plan,
    setSummary(next) {
      state = { ...state, ...next };
      paintSummary();
    },
    dispose() {
      root.remove();
    }
  };
}
