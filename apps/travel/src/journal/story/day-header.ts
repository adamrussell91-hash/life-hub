import { el } from '@/journal/story/dom';

export interface DayHeaderOptions {
  /** 0 when the day cannot be numbered (no trip dates). */
  number: number;
  /** "Friday 5 March". */
  date: string;
  isToday: boolean;
  /** Facts under the date, e.g. "4 moments", "sunset 6:31 pm". */
  facts: string[];
}

/** "Day 3 · Friday 5 March", a Today tag, and one line of facts. */
export function renderDayHeader(options: DayHeaderOptions): HTMLElement {
  const header = el('header', 'story-day');
  const title = el('h3', 'story-day__title');
  if (options.number > 0) title.append(el('span', 'story-day__number num', `Day ${options.number}`));
  if (options.date) title.append(el('span', 'story-day__date num', options.date));
  header.append(title);
  if (options.isToday) header.append(el('span', 'story-day__today', 'Today'));
  const facts = options.facts.filter(Boolean);
  if (facts.length) header.append(el('p', 'story-day__facts num', facts.join(' · ')));
  return header;
}
