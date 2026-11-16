/**
 * Every returned piece along one line, oldest on the left. A dot's colour is the kind of
 * feedback (always with its word in the key and the preview); a ring is one still to open; pieces
 * returned on one day stack. Tapping a dot previews it, then Open opens it.
 *
 * The buttons above the line are what the feedback keeps saying, in words. Tapping one keeps the
 * dots bright where the teacher said it. This replaces the code grid on the student's page.
 */
import { el } from '@/quiz/dom';
import { GROUP_WORD, kindGroup, verdictLine, type KindGroup } from '@/progress/verdict';
import type { FeedbackRow, ReturnedItem } from '@/progress/types';

/** At most this many buttons: things to work on, then things done well. */
export const PATTERN_MAX = { work: 3, good: 2 };

/** The few things the feedback says most, most often first. Never the whole code library. */
export function pickPatterns(rows: readonly FeedbackRow[] = []): FeedbackRow[] {
  const top = (positive: boolean, max: number): FeedbackRow[] => rows.filter((r) => r.positive === positive && r.hit > 0 && r.label).sort((a, b) => b.hit - a.hit).slice(0, max);
  return [...top(false, PATTERN_MAX.work), ...top(true, PATTERN_MAX.good)];
}

const askWords = (item: ReturnedItem): string => (item.redraft === 'asked' ? (item.kind === 'answer' ? 'Have another go' : 'Redraft asked') : item.redraft === 'sent' ? 'Sent to your teacher' : '');

/** `items` newest first, as the server sends them; `onOpen` opens one piece. */
export function feedbackTimeline(items: readonly ReturnedItem[], patterns: readonly FeedbackRow[], onOpen: (id: string, wasNew: boolean) => void): HTMLElement {
  const sorted = [...items].reverse();
  const box = el('div', 'ft');
  const dots = new Map<string, HTMLButtonElement>();
  let chosen = sorted.at(-1) ?? null;
  let filter: FeedbackRow | null = null;

  const say = el('p', 'ft-say');
  say.hidden = true;
  const peek = el('div', 'ft-peek');
  peek.setAttribute('aria-live', 'polite');

  const hasCode = (item: ReturnedItem, row: FeedbackRow): boolean => (row.positive ? item.good : item.work)?.includes(row.code_id) ?? item.codes.includes(row.code_id);

  const draw = (): void => {
    for (const item of sorted) {
      const dot = dots.get(item.id)!;
      dot.classList.toggle('is-on', item === chosen);
      dot.classList.toggle('is-dim', Boolean(filter && !hasCode(item, filter)));
    }
    say.hidden = !filter;
    if (filter) {
      const lead = el('b', undefined, filter.label);
      const less = !filter.positive && filter.trend === 'less' ? ' That is less often than before.' : '';
      say.replaceChildren(lead, ` came up on ${filter.hit} of your last ${filter.of} ${filter.of === 1 ? 'piece' : 'pieces'}.${less} The bright dots are where.`);
      if (filter.do) say.append(el('span', 'ft-say__do', `${filter.positive ? 'Keep doing' : 'Do this next'}: ${filter.do}`));
    }
    peek.replaceChildren();
    if (!chosen) return;
    const item = chosen;
    const text = el('span', 'ft-peek__text');
    const went = verdictLine(item.verdict, item.kind);
    text.append(el('span', 'ft-peek__title', item.title), el('span', 'ft-peek__meta', [item.date, went, askWords(item), item.new ? 'New' : ''].filter(Boolean).join(' · ')));
    const open = el('button', 'btn btn--primary ft-peek__open', 'Open');
    open.type = 'button';
    open.addEventListener('click', () => onOpen(item.id, Boolean(item.new)));
    peek.append(el('span', `fb-kind fb-kind--${kindGroup(item.kind)}`, GROUP_WORD[kindGroup(item.kind)]), text, open);
  };

  if (patterns.length) {
    const wrap = el('div', 'ft-filter');
    wrap.dataset.tour = 'patterns';
    const chips = el('div', 'ft-filter__chips');
    for (const row of patterns) {
      const chip = el('button', `ft-chip ft-chip--${row.positive ? 'good' : 'work'}`, row.label);
      chip.type = 'button';
      chip.setAttribute('aria-pressed', 'false');
      chip.addEventListener('click', () => {
        filter = filter === row ? null : row;
        for (const c of chips.children) c.setAttribute('aria-pressed', String(c === chip && filter === row));
        draw();
      });
      chips.append(chip);
    }
    wrap.append(el('span', 'ft-filter__label', 'Show where your teacher said:'), chips);
    box.append(wrap, say);
  }

  const scroll = el('div', 'ft-scroll');
  scroll.dataset.tour = 'timeline';
  const line = el('div', 'ft-line');
  line.setAttribute('role', 'list');
  const days: { key: string; date: string; items: ReturnedItem[] }[] = [];
  for (const item of sorted) {
    const key = item.day || item.date;
    const last = days.at(-1);
    if (last?.key === key) last.items.push(item);
    else days.push({ key, date: item.date, items: [item] });
  }
  const groups = new Set<KindGroup>();
  for (const d of days) {
    const col = el('div', 'ft-day');
    col.setAttribute('role', 'listitem');
    const stack = el('div', 'ft-day__dots');
    for (const item of d.items) {
      const group = kindGroup(item.kind);
      groups.add(group);
      const dot = el('button', `ft-dot ft-dot--${group}${item.new ? ' is-new' : ''}`);
      dot.type = 'button';
      dot.dataset.piece = item.id;
      dot.setAttribute('aria-label', `${GROUP_WORD[group]}: ${item.title}, ${item.date}${item.new ? ', new' : ''}`);
      dot.addEventListener('click', () => {
        chosen = item;
        draw();
      });
      dots.set(item.id, dot);
      stack.append(dot);
    }
    col.append(stack, el('span', 'ft-day__stem'), el('span', 'ft-day__date', d.date));
    line.append(col);
  }
  scroll.append(line);

  const key = el('p', 'pg-hint ft-key');
  for (const g of ['written', 'spoken', 'short'] as const) {
    if (!groups.has(g)) continue;
    const word = el('span');
    word.append(el('i', `ft-key__dot ft-dot--${g}`), GROUP_WORD[g]);
    key.append(word);
  }
  if (sorted.some((i) => i.new)) {
    const word = el('span');
    word.append(el('i', 'ft-key__dot is-new'), 'New');
    key.append(word);
  }
  box.append(scroll, key, peek);
  draw();
  // The newest end is the one that matters: start there when the line is wider than the screen.
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => (scroll.scrollLeft = scroll.scrollWidth));
  return box;
}
