import { el } from '@/quiz/dom';
import { navigate } from '@/app/router';
import { apiGet } from '@/api/client';
import './marking.css';

export type ToMarkKind = 'piece' | 'quiz' | 'voice' | 'sprint' | 'handup' | 'ask';

export type ToMarkTask = {
  kind?: ToMarkKind;
  what?: string;
  href?: string;
  class_id: string;
  class_title: string;
  column_id?: string;
  title: string;
  lesson_id: string;
  block_id?: string;
  waiting: number;
  handed_in?: number;
  roster: number;
  answers?: number;
  who?: string[];
  rows?: unknown[];
  /** Takes on a tagged viva question the AI could still read. */
  ai_ready?: number;
  oldest_at: string | null;
  late: boolean;
};

const KIND_LABEL: Record<ToMarkKind, string> = {
  piece: 'Writing',
  quiz: 'Quiz',
  voice: 'Voice',
  sprint: 'Sprint',
  handup: 'Hand-up',
  ask: 'Question'
};

const days = (iso: string) => Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86400000));
const ageText = (iso: string) => {
  const d = days(iso);
  return d === 0 ? 'today' : d === 1 ? '1 day' : `${d} days`;
};

function link(text: string, path: string, className: string): HTMLAnchorElement {
  const a = el('a', className, text);
  a.setAttribute('href', path);
  a.addEventListener('click', (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    navigate(path);
  });
  return a;
}

function whoText(t: ToMarkTask): string {
  const who = t.who ?? [];
  return who.length > 6 ? `${who.slice(0, 6).join(', ')} +${who.length - 6}` : who.join(', ');
}

function row(t: ToMarkTask): HTMLElement {
  const kind = t.kind ?? 'piece';
  const path = t.href ?? `/mark/${encodeURIComponent(t.class_id)}/${encodeURIComponent(t.column_id ?? '')}`;
  const item = el('div', `tm-task${t.late ? ' is-late' : ''}`);
  const text = el('div');
  const head = el('div', 'tm-task__head');
  head.append(el('span', `tm-kind tm-kind--${kind}`, KIND_LABEL[kind]), link(t.title, path, 'tm-task__title'));
  const where = [t.class_title, t.what, t.waiting === 0 && t.handed_in !== undefined ? `${t.handed_in} of ${t.roster} handed in` : ''].filter(Boolean).join(' · ');
  text.append(head, el('p', 'tm-task__where', where));
  const who = whoText(t);
  if (who) text.append(el('p', 'tm-task__who', who));
  const age = el('span', 'tm-age', t.oldest_at ? ageText(t.oldest_at) : 'open');
  const count = el('span', 'tm-count', t.waiting ? `${t.waiting} waiting` : `${t.handed_in ?? 0} in`);
  item.append(text);
  if (t.waiting) item.append(age);
  item.append(count);
  return item;
}

/** Everything waiting on the teacher across every class: waiting first (oldest first), then linked tasks still coming in. */
export function toMarkView(tasks: ToMarkTask[], o: { limit?: number } = {}): HTMLElement {
  const root = el('section', 'tm');
  const waiting = tasks.filter((t) => t.waiting > 0);
  // Linked tasks with nothing to mark stay only while some of the class has still to hand in.
  const open = tasks.filter((t) => t.waiting === 0 && t.handed_in !== undefined && t.handed_in < t.roster);
  const total = waiting.reduce((n, t) => n + t.waiting, 0);
  const top = el('div', 'tm-top');
  top.append(el('h2', 'tm-title', 'To mark'));
  if (o.limit) top.append(link('Open To mark', '/to-mark', 'tm-all'));
  root.append(top, el('p', 'tm-sub', total ? `${total} waiting for your feedback` : 'Nothing waiting for your feedback.'));
  const shown = o.limit ? waiting.slice(0, o.limit) : waiting;
  for (const [title, list] of [['Waiting for you', shown], ['Coming in', o.limit ? [] : open]] as const) {
    if (!list.length) continue;
    root.append(el('p', 'tm-group', title));
    for (const t of list) root.append(row(t));
  }
  if (o.limit && waiting.length > o.limit) root.append(link(`See all ${waiting.length}`, '/to-mark', 'tm-more'));
  return root;
}

export const loadQueue = () => apiGet<{ tasks: ToMarkTask[] }>('/api/to-mark').then((r) => r.tasks);

/** The To mark box on the Teaching home: always there, so an empty queue reads as empty, not missing. */
export function mountToMark(host: HTMLElement, load: () => Promise<ToMarkTask[]> = loadQueue): void {
  host.replaceChildren(el('p', 'tm-sub', 'Checking what is waiting for feedback…'));
  void load().then(
    (tasks) => host.replaceChildren(toMarkView(tasks, { limit: 5 })),
    () => host.replaceChildren(el('p', 'tm-sub', 'Could not load what is waiting for feedback.'))
  );
}
