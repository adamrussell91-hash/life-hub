import { el } from '@/quiz/dom';

export type AnswerTally = {
  groups: Array<{ label: string; rows: Array<{ text: string; n: number; right: boolean }> }>;
  written: Array<{ initials: string | null; name: string | null; text: string; awarded: number | null; max: number | null }>;
};

/** Counts per gap, pair or position, then written answers by student. Null when nobody answered this way. */
export function answerTallyView(tally: AnswerTally | undefined, meter: (percent: number) => HTMLElement): HTMLElement | null {
  if (!tally || (!tally.groups.length && !tally.written.length)) return null;
  const box = el('div', 'qz-tally');
  for (const group of tally.groups) {
    if (group.label) box.append(el('p', 'qz-tally__label', group.label));
    const total = group.rows.reduce((sum, r) => sum + r.n, 0);
    const bars = el('ul', 'qz-bars');
    for (const r of group.rows) {
      const row = el('li', 'qz-bars__row');
      if (r.right) row.dataset.state = 'right';
      row.append(el('span', 'qz-bars__label', r.text), meter(total ? Math.round((r.n / total) * 100) : 0), el('span', 'qz-bars__n', String(r.n)));
      bars.append(row);
    }
    box.append(bars);
  }
  if (tally.written.length) {
    const list = el('ul', 'qz-tally__written');
    for (const w of tally.written) {
      const row = el('li', 'qz-tally__answer');
      const mark = w.awarded === null ? 'To mark' : w.max === null ? '' : `${w.awarded}/${w.max}`;
      const who = el('span', 'qz-tally__who', w.initials ?? 'Student');
      if (w.name) who.title = w.name;
      row.append(who, el('span', 'qz-tally__text', w.text), el('span', 'qz-tally__mark', mark));
      list.append(row);
    }
    box.append(list);
  }
  return box;
}
