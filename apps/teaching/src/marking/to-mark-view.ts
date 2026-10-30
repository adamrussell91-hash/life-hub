import { el } from '@/quiz/dom';
import { navigate } from '@/app/router';
import './marking.css';

export type ToMarkTask = { class_id: string; class_title: string; column_id: string; title: string; lesson_id: string; block_id: string; waiting: number; handed_in: number; roster: number; oldest_at: string | null; late: boolean };

const days = (iso: string) => Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86400000));

/** Handed-in work across every class: what is waiting for feedback first, then tasks still coming in. */
export function toMarkView(tasks: ToMarkTask[]): HTMLElement {
  const root = el('section', 'tm');
  const waiting = tasks.filter((t) => t.waiting > 0);
  const open = tasks.filter((t) => t.waiting === 0);
  const total = waiting.reduce((n, t) => n + t.waiting, 0);
  root.append(el('h2', 'tm-title', 'To mark'), el('p', 'tm-sub', total ? `${total} ${total === 1 ? 'piece' : 'pieces'} waiting` : 'Nothing waiting for feedback.'));
  for (const [title, list] of [['Waiting for feedback', waiting], ['Coming in', open]] as const) {
    if (!list.length) continue;
    root.append(el('p', 'tm-group', title));
    for (const t of list) {
      const row = el('div', `tm-task${t.late ? ' is-late' : ''}`);
      const path = `/mark/${encodeURIComponent(t.class_id)}/${encodeURIComponent(t.column_id)}`;
      const link = el('a', 'tm-task__title', t.title);
      link.setAttribute('href', path);
      link.addEventListener('click', (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.preventDefault();
        navigate(path);
      });
      const where = el('p', 'tm-task__where', `${t.class_title} · ${t.handed_in} of ${t.roster} handed in`);
      const age = el('span', 'tm-age', t.oldest_at ? `${days(t.oldest_at)} days` : 'open');
      const count = el('span', 'tm-count', t.waiting ? `${t.waiting} left` : `${t.handed_in} in`);
      const text = el('div');
      text.append(link, where);
      row.append(text, age, count);
      root.append(row);
    }
  }
  return root;
}

/** The To mark section for the Teaching home: empty until the queue loads, and stays empty when no task is linked. */
export function mountToMark(host: HTMLElement, load: () => Promise<ToMarkTask[]>): void {
  void load().then(
    (tasks) => {
      if (tasks.length) host.replaceChildren(toMarkView(tasks));
    },
    () => undefined
  );
}

