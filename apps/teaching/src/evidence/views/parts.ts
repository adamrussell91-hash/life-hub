import { button, el } from '@/quiz/dom';
import { ITEM } from '../constants';
import type { CompareRow, Quadrants } from '../patterns';
import type { ItemStat, Summary } from '../stats';
import { TAG_KIND_LABEL, type Flag, type InsightQuestion, type MixUp, type TagKind, type TagRow } from '../types';
import './insight.css';

/** Small pieces the quiz insight and the markbook Patterns view share. */

export const pct = (share: number | null | undefined): string => (share === null || share === undefined ? '–' : `${Math.round(share * 100)}%`);
const short = (text: string): string => (text.length > 60 ? `${text.slice(0, 57)}…` : text || 'Question');

export function sectionHead(title: string, extra?: HTMLElement): HTMLElement {
  const head = el('div', 'ev-section');
  head.append(el('h5', 'ev-section__title', title));
  if (extra) head.append(extra);
  return head;
}

function card(label: string, value: string, why?: string): HTMLElement {
  const c = el('div', 'ev-card');
  c.append(el('span', 'ev-card__label', label), el('span', 'ev-card__value', value));
  if (why) c.title = why;
  return c;
}

export function summaryCards(s: Summary | null, attempts: number, of: number, alpha: number | null, alphaWhy: string): HTMLElement {
  const row = el('div', 'ev-cards');
  row.append(
    card('Attempts', of ? `${attempts}/${of}` : String(attempts)),
    card('Mean', pct(s?.mean)),
    card('Median', pct(s?.median)),
    card('Std dev', s ? String(Math.round(s.sd * 100)) : '–', 'Spread, in percentage points.'),
    card('Middle half', s ? `${Math.round(s.q1 * 100)}–${Math.round(s.q3 * 100)}%` : '–'),
    card('Reliability', alpha === null ? '–' : alpha.toFixed(2), alpha === null ? alphaWhy : 'Cronbach’s alpha. Around 0.7 or more is good for a class quiz.')
  );
  return row;
}

const SVG = 'http://www.w3.org/2000/svg';
function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** One dot per student on a 0–100% line, equal scores stacked; the middle half shaded and the median marked. */
export function dotPlot(shares: number[], s: Summary | null): SVGSVGElement {
  const x = (share: number): number => 20 + share * 600;
  const stacks = new Map<number, number>();
  const dots: Array<[number, number]> = [];
  for (const share of [...shares].sort((a, b) => a - b)) {
    const bin = Math.round(share * 50);
    const k = stacks.get(bin) ?? 0;
    stacks.set(bin, k + 1);
    dots.push([x(bin / 50), 32 - k * 9]);
  }
  const top = Math.min(0, ...dots.map(([, y]) => y - 8));
  const root = svg('svg', { viewBox: `0 ${top} 640 ${60 - top}`, class: 'ev-dots', role: 'img' });
  const title = svg('title');
  title.textContent = `Scores of ${shares.length} ${shares.length === 1 ? 'student' : 'students'}${s ? `, median ${pct(s.median)}` : ''}`;
  root.append(title, svg('line', { x1: 20, y1: 40, x2: 620, y2: 40, class: 'ev-dots__axis' }));
  if (s) {
    root.append(svg('rect', { x: x(s.q1), y: 22, width: Math.max(2, x(s.q3) - x(s.q1)), height: 18, rx: 3, class: 'ev-dots__band' }));
    root.append(svg('line', { x1: x(s.median), y1: 16, x2: x(s.median), y2: 44, class: 'ev-dots__median' }));
  }
  for (const [cx, cy] of dots) root.append(svg('circle', { cx, cy, r: 4.5, class: 'ev-dots__dot' }));
  for (const [t, text] of [[0, '0%'], [0.5, '50%'], [1, '100%']] as const) {
    const tick = svg('text', { x: x(t), y: 56, 'text-anchor': 'middle', class: 'ev-dots__tick' });
    tick.textContent = text;
    root.append(tick);
  }
  return root;
}

export function tagSwitch(kinds: TagKind[], current: TagKind, onPick: (kind: TagKind) => void): HTMLElement {
  const group = el('div', 'ev-switch');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Group by');
  for (const kind of kinds) {
    const b = el('button', 'ev-switch__pill', TAG_KIND_LABEL[kind]);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(kind === current));
    b.addEventListener('click', () => onPick(kind));
    group.append(b);
  }
  return group;
}

const BAND_TEXT = { weak: 'Weak', developing: 'Developing', secure: 'Secure', thin: '1 question' } as const;

/** Tags weakest first: a bar (dark = full marks, light = part marks), a band and how sure students were. */
export function tagRows(rows: TagRow[], label: (tag: string) => string): HTMLElement {
  if (!rows.length) return el('p', 'ev__empty', 'No tagged questions yet.');
  const list = el('ul', 'ev-tags');
  for (const r of rows) {
    const li = el('li', 'ev-tag');
    const bar = el('span', 'ev-bar');
    bar.setAttribute('aria-hidden', 'true');
    const full = el('span', `ev-bar__full ev-bar--${r.band}`);
    full.style.width = `${Math.round(r.full * 100)}%`;
    const part = el('span', 'ev-bar__part');
    part.style.width = `${Math.round(r.half * 100)}%`;
    bar.append(full, part);
    const meta = el('span', 'ev-tag__meta');
    meta.append(el('span', `ev-badge ev-badge--${r.band}`, BAND_TEXT[r.band]), ` ${pct(r.mean)}${r.confidence === null ? '' : ` · sure ${r.confidence.toFixed(1)}`}`);
    li.append(el('span', 'ev-tag__name', label(r.tag)), bar, meta);
    list.append(li);
  }
  return list;
}

const FLAG_TEXT: Record<Flag['type'], { head: (tag: string) => string; note: string }> = {
  sure_wrong: { head: (t) => `Sure but wrong on ${t}`, note: 'Likely a firm misunderstanding.' },
  guessing: { head: (t) => `Possible guessing on ${t}`, note: 'Right, but unsure. Check again before moving on.' },
  thin: { head: (t) => `${t} tested once`, note: 'Too little evidence to decide.' },
  outlier: { head: (t) => `Behind the class on ${t}`, note: 'The rest of the class is secure here.' }
};

export type FlagCardOptions = {
  label: (tag: string) => string;
  who: (ids: string[]) => string;
  onDismiss: (flag: Flag) => void;
  /** Shown as "Ann drafts follow-up quiz" when given. */
  onFollowUp?: (flag: Flag) => void;
  /** A follow-up already made from this flag, with what it found. */
  followed?: (flag: Flag) => { title: string; open: () => void; outcome: string | null } | null;
};

export function flagCards(flags: Flag[], o: FlagCardOptions): HTMLElement {
  if (!flags.length) return el('p', 'ev__empty', 'Nothing needs following up.');
  const list = el('ul', 'ev-flags');
  for (const f of flags) {
    const text = FLAG_TEXT[f.type];
    const li = el('li', 'ev-flag');
    const head = el('p', 'ev-flag__head');
    head.append(el('strong', undefined, text.head(o.label(f.tag))), f.students.length ? ` · ${o.who(f.students)}` : '');
    li.append(head, el('p', 'ev-flag__note', text.note));
    const actions = el('div', 'ev-flag__actions');
    const done = o.followed?.(f) ?? null;
    if (done) {
      const link = button(`Follow-up: ${done.title}`, 'ghost', () => done.open());
      actions.append(link);
      if (done.outcome) li.append(el('p', 'ev-flag__outcome', done.outcome));
    } else if (o.onFollowUp) actions.append(button('Ann drafts follow-up quiz', 'secondary', () => o.onFollowUp!(f)));
    actions.append(button('Dismiss', 'ghost', () => o.onDismiss(f)));
    li.append(actions);
    list.append(li);
  }
  return list;
}

export function mixUpText(m: MixUp, label: (tag: string) => string, codeLabel: (id: string) => string): string {
  const what = m.tag ? label(m.tag) : 'Question';
  switch (m.why.type) {
    case 'named':
      return `${what} named as ${label(m.why.as)}`;
    case 'not_found':
      return `${what} not found`;
    case 'option':
      return `${what}: picked “${m.why.text}”`;
    case 'placement':
      return `“${m.why.text}” put in the wrong place`;
    case 'code':
      return `${what}: ${codeLabel(m.why.id)}`;
  }
}

/** Mistakes two or more students share, most common first. */
export function mixUpList(mixUps: MixUp[], label: (tag: string) => string, codeLabel: (id: string) => string): HTMLElement {
  const shared = mixUps.filter((m) => m.count >= 2).slice(0, 8);
  if (!shared.length) return el('p', 'ev__empty', 'No mistake was shared by two or more students.');
  const list = el('ul', 'ev-mixups');
  for (const m of shared) list.append(el('li', undefined, `${mixUpText(m, label, codeLabel)} · ${m.count}`));
  return list;
}

export function quadrantGrid(q: Quadrants, who: (ids: string[]) => string): HTMLElement {
  if (!q.total) return el('p', 'ev__empty', 'This quiz didn’t ask how sure students were.');
  const share = (n: number) => pct(n / q.total);
  const grid = el('div', 'ev-cards ev-cards--two');
  const sureWrong = card('Sure but wrong', share(q.sureWrong));
  sureWrong.classList.add('ev-card--warn');
  if (q.sureWrongStudents.length) sureWrong.append(el('span', 'ev-card__who', who(q.sureWrongStudents)));
  grid.append(card('Sure and right', share(q.sureRight)), sureWrong, card('Unsure but right (guess?)', share(q.unsureRight)), card('Unsure and wrong', share(q.unsureWrong)));
  return grid;
}

/** Facility and discrimination per question, with a quality note. */
export function questionTable(questions: InsightQuestion[], stats: ItemStat[], showDiscrimination: boolean): HTMLElement {
  const table = el('table', 'ev-questions');
  const head = el('tr');
  for (const h of ['Question', 'Right', showDiscrimination ? 'Discrimination' : '', '']) head.append(el('th', undefined, h));
  table.append(head);
  questions.forEach((q, i) => {
    const s = stats[i];
    const tr = el('tr');
    const note =
      !s ? '' : s.facility >= ITEM.tooEasy ? 'Too easy' : s.facility <= ITEM.tooHard ? 'Too hard' : showDiscrimination && s.discrimination !== null && s.discrimination < 0 ? 'Check question' : '';
    const prompt = el('td', 'ev-questions__prompt', short(q.prompt));
    prompt.title = q.prompt;
    tr.append(
      prompt,
      el('td', undefined, pct(s?.facility)),
      el('td', undefined, showDiscrimination && s?.discrimination !== null && s?.discrimination !== undefined ? s.discrimination.toFixed(2) : ''),
      el('td', note ? `ev-badge ev-badge--${note === 'Check question' ? 'weak' : 'thin'}` : undefined, note)
    );
    table.append(tr);
  });
  return table;
}

export function comparePanel(rows: CompareRow[], label: (tag: string) => string, title: string): HTMLElement {
  const wrap = el('div', 'ev-compare');
  wrap.append(el('p', 'ev__note', `Before: ${title}. Each student’s change is a rough guide; one short quiz is noisy.`));
  if (!rows.length) {
    wrap.append(el('p', 'ev__empty', 'The two quizzes share no tags.'));
    return wrap;
  }
  const list = el('ul', 'ev-tags');
  for (const r of rows) {
    const sign = r.change >= 0 ? '+' : '−';
    list.append(el('li', 'ev-compare__row', `${label(r.tag)} · ${pct(r.before)} → ${pct(r.after)} (${sign}${Math.abs(Math.round(r.change * 100))}) · ${r.up} up a band, ${r.down} down`));
  }
  wrap.append(list);
  return wrap;
}
