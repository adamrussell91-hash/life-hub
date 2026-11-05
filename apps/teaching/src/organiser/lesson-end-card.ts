/** The card at the end of a lesson with organiser lines: what to remember, and what happens to it. Adds nothing when there are none. */
import { el } from '@/quiz/dom';
import { studentAnchor } from '@/student/shell';
import { studentOrganiserApi } from './api';
import type { EndCardItem } from './types';
import './organiser-student.css';

export type EndCardOptions = {
  lessonId: string;
  classId: string;
  /** The lesson page to come back to, as the initials token passes it. */
  from?: string;
  /** Insert ahead of this node (the lesson footer) when it is still in `content`. */
  before?: Node | null;
  /** Test seam. */
  api?: { lesson(classId: string, lessonId: string): Promise<{ items: EndCardItem[]; joining?: boolean; done?: boolean }> };
};

export async function mountOrganiserEndCard(content: HTMLElement, options: EndCardOptions): Promise<{ dispose(): void }> {
  const { lessonId, classId, from, before } = options;
  const api = options.api ?? studentOrganiserApi;
  let card: HTMLElement | null = null;
  let disposed = false;
  const handle = {
    dispose() {
      disposed = true;
      card?.remove();
      card = null;
    }
  };
  let items: EndCardItem[] = [];
  let joining = false;
  let done = false;
  try {
    const found = await api.lesson(classId, lessonId);
    items = found.items ?? [];
    joining = !!found.joining;
    done = !!found.done;
  } catch {
    return handle;
  }
  if (disposed || !items.length) return handle;

  const one = items.length === 1;
  card = el('section', 'kos-end');
  card.setAttribute('aria-label', 'What to remember from this lesson');
  card.append(el('h3', undefined, 'What to remember from this lesson'));
  card.append(el('p', 'kos-hint', `${one ? 'This goes' : 'These go'} on your organiser, your sheet of what to know for this unit.`));
  const ul = el('ul', 'kos-end__list');
  for (const item of items) {
    const li = el('li');
    li.append(el('span', 'kos-end__from', item.section), el('span', undefined, item.text));
    ul.append(li);
  }
  card.append(ul);
  if (joining) card.append(el('p', 'kos-hint', done ? 'It’s in your practice now, so you’ll get asked this on a later day.'.replace('It’s', one ? 'It’s' : 'They’re').replace('this', one ? 'this' : 'these') : `Tick this lesson off below and ${one ? 'it becomes a practice card' : 'they become practice cards'}.`));
  const path = `/s/classes/${encodeURIComponent(classId)}/profile?tab=organiser${from ? `&from=${encodeURIComponent(from)}` : ''}`;
  const open = studentAnchor(path, 'kos-btn kos-btn--primary', 'Open my organiser');
  open.style.display = 'inline-flex';
  open.style.alignItems = 'center';
  open.style.justifySelf = 'start';
  open.style.textDecoration = 'none';
  card.append(open);
  if (before && before.parentNode === content) content.insertBefore(card, before);
  else content.append(card);
  return handle;
}
