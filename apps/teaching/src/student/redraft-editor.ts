/** Where a student rewrites a returned piece: the section their teacher chose, or the whole thing. Saves as they type. */
import { button, el, errorText } from '@/quiz/dom';

export type RedraftScope = 'whole' | { part: string; field: string; start: number; end: number };
export type RedraftLoad = { scope: RedraftScope; text: Record<string, Record<string, string>>; prompts: Record<string, string>; working: Record<string, Record<string, string>> };
export type RedraftApi = {
  load: () => Promise<RedraftLoad>;
  save: (part: string, field: string, text: string) => Promise<unknown>;
  send: () => Promise<unknown>;
};

const SAVE_AFTER = 800;

export function redraftEditor(api: RedraftApi, onSent: () => void): HTMLElement {
  const root = el('div', 'pg-redraft');
  const status = el('p', 'pg-redraft__status');
  status.setAttribute('role', 'status');
  root.append(el('p', 'pm-empty', 'Loading…'));
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const pending = new Map<string, () => Promise<unknown>>();
  let saving: Promise<void> = Promise.resolve();

  // One save at a time, so a send never overtakes one. A save that fails stays waiting for the next try.
  const flush = (): Promise<void> => {
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
    saving = saving.catch(() => undefined).then(async () => {
      for (const [key, run] of [...pending]) {
        await run();
        if (pending.get(key) === run) pending.delete(key);
      }
    });
    return saving;
  };

  const box = (part: string, field: string, value: string, label: string): HTMLTextAreaElement => {
    const area = el('textarea', 'pg-redraft__box');
    area.value = value;
    area.setAttribute('aria-label', label);
    area.addEventListener('input', () => {
      const key = `${part}|${field}`;
      clearTimeout(timers.get(key));
      pending.set(key, () => api.save(part, field, area.value).then(() => { status.textContent = 'Saved'; }));
      timers.set(key, setTimeout(() => {
        void flush().catch((e: unknown) => { status.textContent = errorText(e, 'Couldn’t save. Your words are still here. Try again.'); });
      }, SAVE_AFTER));
    });
    return area;
  };

  void api.load().then(
    ({ scope, text, prompts, working }) => {
      root.replaceChildren();
      if (scope === 'whole') {
        for (const [part, fields] of Object.entries(text)) {
          for (const [field, value] of Object.entries(fields)) {
            if (prompts[field]) root.append(el('p', 'pg-redraft__prompt', prompts[field]));
            root.append(box(part, field, working[part]?.[field] ?? value, prompts[field] ?? 'Your answer'));
          }
        }
      } else {
        const value = text[scope.part]?.[scope.field] ?? '';
        const before = value.slice(0, scope.start);
        const after = value.slice(scope.end);
        if (prompts[scope.field]) root.append(el('p', 'pg-redraft__prompt', prompts[scope.field]));
        if (before) root.append(el('span', 'pg-redraft__locked', before));
        root.append(box(scope.part, scope.field, working[scope.part]?.[scope.field] ?? value.slice(scope.start, scope.end), 'Your redraft of this section'));
        if (after) root.append(el('span', 'pg-redraft__locked', after));
      }
      const send = button('Send my redraft', 'primary', () => {
        send.disabled = true;
        status.textContent = '';
        void flush().then(() => api.send()).then(onSent, (e: unknown) => {
          status.textContent = errorText(e, 'Couldn’t send it. Your words are still here. Try again.');
          send.disabled = false;
        });
      });
      send.dataset.action = 'send';
      root.append(status, send);
    },
    (e: unknown) => root.replaceChildren(el('p', 'pm-empty', errorText(e, 'Couldn’t open your redraft. Try again.')))
  );
  return root;
}
