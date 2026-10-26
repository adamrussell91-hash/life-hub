import { el } from '@/quiz/dom';
import type { ItemStat, Summary } from '../stats';
import type { InsightPayload, InsightQuestion } from '../types';
import { itemNote, pct, svg } from './parts';
import './insight.css';

/** The Results dashboard's own drawings and rows: score ring, score histogram, question rows, per-student strips. */

export type ResultsTab = 'overview' | 'questions' | 'students';
/** What the teacher has opened. The panel owns it so a repaint after a poll keeps their place. */
export type ResultsUi = { tab: ResultsTab; openQuestions: Set<string>; allTags: boolean; hardestFirst: boolean; lowestFirst: boolean };
export const newResultsUi = (): ResultsUi => ({ tab: 'overview', openQuestions: new Set(), allTags: false, hardestFirst: false, lowestFirst: false });

/** Red under half, amber to three quarters, green above: the same read for a ring, a column or a bar. */
export const band = (share: number): 'low' | 'mid' | 'high' => (share < 0.5 ? 'low' : share < 0.75 ? 'mid' : 'high');

/** The class average as a ring, like the progress rings elsewhere in the hub. */
export function scoreRing(share: number | null): HTMLElement {
  const R = 38;
  const C = 2 * Math.PI * R;
  const root = svg('svg', { viewBox: '0 0 100 100', class: 'ev-ring', role: 'img' });
  const title = svg('title');
  title.textContent = share === null ? 'No class average yet' : `Class average ${pct(share)}`;
  root.append(title, svg('circle', { cx: 50, cy: 50, r: R, class: 'ev-ring__track' }));
  if (share !== null) {
    const arc = svg('circle', { cx: 50, cy: 50, r: R, class: 'ev-ring__arc', 'stroke-dasharray': `${C * Math.min(1, share)} ${C}`, transform: 'rotate(-90 50 50)' });
    arc.dataset.band = band(share);
    root.append(arc);
  }
  const value = svg('text', { x: 50, y: 53, class: 'ev-ring__value' });
  value.textContent = pct(share);
  const label = svg('text', { x: 50, y: 68, class: 'ev-ring__label' });
  label.textContent = 'average';
  root.append(value, label);
  return root as unknown as HTMLElement;
}

const BINS = 10;

/** Students per 10% band of the score, coloured by how that band reads, with the middle half shaded and the median marked. */
export function scoreHistogram(shares: number[], s: Summary | null): HTMLElement {
  const W = 300;
  const left = 4;
  const plot = W - left * 2;
  const base = 78;
  const tall = 58;
  const counts = Array.from({ length: BINS }, () => 0);
  for (const share of shares) counts[Math.min(BINS - 1, Math.max(0, Math.floor(share * BINS)))]!++;
  const most = Math.max(1, ...counts);
  const x = (share: number): number => left + share * plot;
  const root = svg('svg', { viewBox: `0 0 ${W} 92`, class: 'ev-hist', role: 'img' });
  const title = svg('title');
  title.textContent = `${shares.length} ${shares.length === 1 ? 'score' : 'scores'} in 10% bands${s ? `, median ${pct(s.median)}` : ''}`;
  root.append(title);
  if (s) root.append(svg('rect', { x: x(s.q1), y: 6, width: Math.max(2, x(s.q3) - x(s.q1)), height: base - 6, rx: 4, class: 'ev-hist__band' }));
  root.append(svg('line', { x1: left, y1: base, x2: W - left, y2: base, class: 'ev-hist__axis' }));
  const w = plot / BINS;
  counts.forEach((n, i) => {
    if (!n) return;
    const h = Math.max(4, (n / most) * tall);
    const bar = svg('rect', { x: left + i * w + 2, y: base - h, width: w - 4, height: h, rx: 3, class: 'ev-hist__bar' });
    bar.dataset.band = band((i + 0.5) / BINS);
    const tip = svg('title');
    tip.textContent = `${i * 10}–${i === BINS - 1 ? 100 : i * 10 + 9}%: ${n} ${n === 1 ? 'student' : 'students'}`;
    bar.append(tip);
    const count = svg('text', { x: left + i * w + w / 2, y: base - h - 3, class: 'ev-hist__n' });
    count.textContent = String(n);
    root.append(bar, count);
  });
  if (s) root.append(svg('line', { x1: x(s.median), y1: 2, x2: x(s.median), y2: base + 4, class: 'ev-hist__median' }));
  const ticks = el('div', 'ev-dots__ticks');
  ticks.setAttribute('aria-hidden', 'true');
  for (const [t, text] of [[0, '0%'], [0.5, '50%'], [1, '100%']] as const) {
    const tick = el('span', 'ev-dots__tick', text);
    tick.style.left = `${(x(t) / W) * 100}%`;
    ticks.append(tick);
  }
  const fig = el('figure', 'ev-histogram');
  fig.append(root, ticks);
  return fig;
}

type ItemRow = Pick<ItemStat, 'facility' | 'discrimination'>;

/** One row per question: number, prompt, how many got it right. A row opens to show the picks and notes. */
export function questionRows(
  questions: InsightQuestion[],
  items: ItemRow[],
  showDiscrimination: boolean,
  ui: ResultsUi,
  detail?: (questionId: string) => HTMLElement | null
): HTMLElement {
  const wrap = el('div', 'ev-qrows-wrap');
  const list = el('ol', 'ev-qrows');
  const draw = (focusId?: string): void => {
    const order = questions.map((_, i) => i);
    if (ui.hardestFirst) order.sort((a, b) => (items[a]?.facility ?? 2) - (items[b]?.facility ?? 2));
    list.replaceChildren(
      ...order.map((i) => {
        const q = questions[i] as InsightQuestion;
        const s = items[i];
        const open = ui.openQuestions.has(q.id);
        const li = el('li', 'ev-qrow');
        const head = el('button', 'ev-qrow__head');
        head.type = 'button';
        head.dataset.id = q.id;
        head.setAttribute('aria-expanded', String(open));
        const bar = el('span', 'ev-qbar');
        bar.setAttribute('aria-hidden', 'true');
        const fill = el('span', 'ev-qbar__fill');
        const share = s?.facility ?? null;
        fill.style.width = `${Math.round((share ?? 0) * 100)}%`;
        if (share !== null) fill.dataset.band = band(share);
        bar.append(fill);
        head.append(el('span', 'ev-qrow__n', String(i + 1)), el('span', 'ev-qrow__prompt', q.prompt || 'Question'), bar, el('span', 'ev-qrow__pct', pct(share)));
        const note = itemNote(s as ItemStat | undefined, showDiscrimination);
        if (note) head.append(el('span', `ev-badge ev-badge--${note === 'Check question' ? 'weak' : 'thin'}`, note));
        head.addEventListener('click', () => {
          if (ui.openQuestions.has(q.id)) ui.openQuestions.delete(q.id);
          else ui.openQuestions.add(q.id);
          draw(q.id);
        });
        li.append(head);
        if (open) {
          const body = el('div', 'ev-qrow__detail');
          if (q.prompt.length > 60) body.append(el('p', 'ev-qrow__full', q.prompt));
          if (showDiscrimination && s?.discrimination !== null && s?.discrimination !== undefined) {
            body.append(el('p', 'ev__note', `Discrimination ${s.discrimination.toFixed(2)}: how well this question separates strong from weak overall scores.`));
          }
          const more = detail?.(q.id);
          if (more) body.append(more);
          li.append(body);
        }
        return li;
      })
    );
    if (focusId) list.querySelector<HTMLElement>(`.ev-qrow__head[data-id="${CSS.escape(focusId)}"]`)?.focus();
  };
  const sort = el('button', 'ev-switch__pill', ui.hardestFirst ? 'Hardest first' : 'Quiz order');
  sort.type = 'button';
  sort.setAttribute('aria-pressed', String(ui.hardestFirst));
  sort.addEventListener('click', () => {
    ui.hardestFirst = !ui.hardestFirst;
    sort.textContent = ui.hardestFirst ? 'Hardest first' : 'Quiz order';
    sort.setAttribute('aria-pressed', String(ui.hardestFirst));
    draw();
  });
  const tools = el('div', 'ev-qrows__tools');
  tools.append(el('span', 'ev__note', 'Share of marks won. Tap a question for its answers.'), sort);
  draw();
  wrap.append(tools, list);
  return wrap;
}

/**
 * A row of small squares per student, one per question: full marks, part marks, none, or waiting to be marked.
 * The head row numbers the questions so a column can be matched to the Questions tab.
 */
export function attemptStrips(p: InsightPayload): { head: HTMLElement; strip: (attemptId: string) => HTMLElement | null } {
  const n = p.questions.length;
  const make = (cls: string): HTMLElement => {
    const node = el('span', cls);
    node.style.setProperty('--n', String(n));
    return node;
  };
  const head = make('ev-strip ev-strip--head');
  head.setAttribute('aria-hidden', 'true');
  p.questions.forEach((_, i) => head.append(el('span', 'ev-strip__q', String(i + 1))));
  const byAttempt = new Map(p.attempts.map((a) => [a.attempt_id, a]));
  const strip = (attemptId: string): HTMLElement | null => {
    const a = byAttempt.get(attemptId);
    if (!a) return null;
    const node = make('ev-strip');
    node.setAttribute('role', 'img');
    const parts: string[] = [];
    p.questions.forEach((q, i) => {
      const row = a.rows.find((r) => r.id === q.id);
      const cell = el('span', 'ev-strip__cell');
      let text: string;
      if (!row) {
        cell.dataset.state = 'skip';
        text = 'not asked';
      } else if (row.awarded === null) {
        cell.dataset.state = 'wait';
        text = 'waiting to be marked';
      } else {
        cell.dataset.state = row.awarded >= row.max ? 'full' : row.awarded > 0 ? 'part' : 'none';
        text = `${row.awarded}/${row.max}`;
      }
      cell.title = `Q${i + 1}: ${text}`;
      parts.push(`Q${i + 1} ${text}`);
      node.append(cell);
    });
    node.setAttribute('aria-label', parts.join(', '));
    return node;
  };
  return { head, strip };
}
