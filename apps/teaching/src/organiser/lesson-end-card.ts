/** The card at the end of a lesson that added organiser lines. Adds nothing when there are none. */
import { el } from '@/quiz/dom';
import { studentAnchor } from '@/student/shell';
import { studentOrganiserApi } from './api';
import './organiser-student.css';

export type EndCardOptions = {
  lessonId: string;
  classId: string;
  /** The lesson page to come back to, as the initials token passes it. */
  from?: string;
  /** Insert ahead of this node (the lesson footer) when it is still in `content`. */
  before?: Node | null;
  /** Test seam. */
  api?: { lesson(classId: string, lessonId: string): Promise<{ lines: string[]; joining?: boolean }> };
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
  let lines: string[] = [];
  let joining = false;
  try {
    const found = await api.lesson(classId, lessonId);
    lines = found.lines ?? [];
    joining = !!found.joining;
  } catch {
    return handle;
  }
  if (disposed || !lines.length) return handle;

  card = el('section', 'kos-end');
  card.setAttribute('aria-label', 'From this lesson');
  card.append(el('h3', undefined, `From this lesson: ${lines.length} ${joining ? 'new ' : ''}${lines.length === 1 ? 'line' : 'lines'}`));
  const ul = el('ul');
  for (const l of lines) ul.append(el('li', undefined, l));
  card.append(ul, el('p', 'kos-hint', joining ? 'They join your practice tomorrow.' : 'You can find them on your organiser.'));
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
