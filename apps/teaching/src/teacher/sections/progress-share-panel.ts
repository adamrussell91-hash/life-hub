import { apiPost } from '@/api/client';
import { studentSiteOrigin } from '@/app/class-site';
import { askConfirmCard } from '@/teacher/confirm-dialog';

/**
 * Progress share links for one student, on the class student list: a private link plus a
 * one-off PIN for a pastoral teacher or parent. The viewer types their initials and the PIN
 * once per browser. New PIN lets another browser in; Remove stops the link at once.
 */

export type ShareRow = { token: string; student_id: string; initials: string; made_at: string; opened_at: string | null; pin: string | null; pin_used_at: string | null; devices: number };
export type ShareLogRow = { token: string; student_id: string; initials: string; made_at: string; removed_at: string | null };
type Reply = { shares: ShareRow[]; log?: ShareLogRow[]; made?: string };
export type ShareApi = {
  list: (classId: string) => Promise<Reply>;
  add: (classId: string, studentId: string, initials: string) => Promise<Reply>;
  newPin: (classId: string, token: string) => Promise<Reply>;
  remove: (classId: string, token: string) => Promise<Reply>;
};

const call = (classId: string, body: Record<string, string>) => apiPost<Reply>(`/api/classes/${encodeURIComponent(classId)}/shares`, body);
export const defaultShareApi: ShareApi = {
  list: (classId) => call(classId, { action: 'list' }),
  add: (classId, studentId, initials) => call(classId, { action: 'add', student_id: studentId, initials }),
  newPin: (classId, token) => call(classId, { action: 'new_pin', token }),
  remove: (classId, token) => call(classId, { action: 'remove', token })
};

const day = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', timeZone: 'Australia/Sydney' });
const when = (iso: string | null) => (iso ? day.format(new Date(iso)) : '');
const stamp = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Sydney' });
const at = (iso: string | null) => (iso ? stamp.format(new Date(iso)) : '');

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export type ProgressSharePanelOptions = { classId: string; studentId: string; studentName: string; api?: ShareApi; origin?: string };

export function mountProgressSharePanel(host: HTMLElement, options: ProgressSharePanelOptions): { dispose(): void } {
  const { classId, studentId, studentName } = options;
  const api = options.api ?? defaultShareApi;
  const origin = options.origin ?? studentSiteOrigin();
  let disposed = false;
  const box = el('div', 'share-panel');
  box.append(el('p', 'share-panel__lead', `A view-only link to ${studentName}’s progress for a pastoral teacher or parent. They type their own initials and the 6-digit PIN shown here once per browser. The PIN is not ${studentName}’s sign-in code.`));
  const list = el('ul', 'share-panel__list');
  const say = el('p', 'share-panel__say');
  say.setAttribute('role', 'status');
  const form = el('form', 'share-panel__add');
  const input = el('input', 'share-panel__initials');
  input.name = 'viewer-initials';
  input.maxLength = 5;
  input.autocomplete = 'off';
  input.placeholder = 'Their initials';
  input.setAttribute('aria-label', `Initials of the person to share ${studentName}’s progress with`);
  const add = el('button', 'btn btn--secondary', 'Make a link');
  add.type = 'submit';
  form.append(input, add);
  const logBox = el('details', 'share-panel__log');
  const logSummary = el('summary', 'share-panel__log-title', 'Link log');
  const logList = el('ul', 'share-panel__log-list');
  logBox.append(logSummary, logList);
  box.append(list, form, say, logBox);
  host.append(box);

  const paintLog = (log: ShareLogRow[] | undefined) => {
    const mine = (log ?? []).filter((l) => l.student_id === studentId);
    logBox.hidden = !mine.length;
    logSummary.textContent = `Link log (${mine.length})`;
    logList.replaceChildren(
      ...mine.map((l) => {
        const li = el('li', `share-panel__log-row${l.removed_at ? ' is-removed' : ''}`);
        li.append(el('span', 'share-panel__log-who', l.initials));
        li.append(el('span', 'share-panel__log-when', `Made ${at(l.made_at)}`));
        li.append(el('span', 'share-panel__log-state', l.removed_at ? `Removed ${at(l.removed_at)}` : 'Active'));
        return li;
      })
    );
  };

  const paint = (shares: ShareRow[], log?: ShareLogRow[]) => {
    if (disposed) return;
    paintLog(log);
    const mine = shares.filter((s) => s.student_id === studentId);
    list.replaceChildren(
      ...mine.map((s) => {
        const li = el('li', 'share-panel__row');
        const link = `${origin}/s/share/${s.token}`;
        li.append(el('p', 'share-panel__who', `${s.initials} · made ${at(s.made_at)}${s.opened_at ? ` · last opened ${when(s.opened_at)}` : ''}`));
        li.append(el('code', 'share-panel__link', link));
        li.append(el('p', `share-panel__pin${s.pin ? ' is-fresh' : ''}`, s.pin ? `PIN ${s.pin} (works once)` : `PIN used ${when(s.pin_used_at)} · ${s.devices} ${s.devices === 1 ? 'browser' : 'browsers'} in`));
        const copy = el('button', 'btn btn--ghost', 'Copy link');
        copy.type = 'button';
        copy.addEventListener('click', () => {
          void navigator.clipboard?.writeText(link).then(
            () => (say.textContent = 'Link copied.'),
            () => (say.textContent = 'Copy didn’t work. Select the link and copy it.')
          );
        });
        const fresh = el('button', 'btn btn--ghost', 'New PIN');
        fresh.type = 'button';
        fresh.setAttribute('aria-label', `Make a new PIN for ${s.initials}`);
        fresh.addEventListener('click', () => void run(() => api.newPin(classId, s.token), `New PIN made for ${s.initials}. The old one stops working; browsers already in stay in.`));
        const remove = el('button', 'btn btn--ghost', 'Remove link');
        remove.type = 'button';
        remove.setAttribute('aria-label', `Remove ${s.initials}’s link`);
        remove.addEventListener('click', async () => {
          const sure = await askConfirmCard({
            title: `Remove ${s.initials}’s link?`,
            supporting: `It stops working at once, on every browser. The link log keeps when it was made and removed.`,
            confirmLabel: 'Remove link'
          });
          if (sure) void run(() => api.remove(classId, s.token), `${s.initials}’s link is removed. It stays in the link log.`);
        });
        li.append(copy, fresh, remove);
        return li;
      })
    );
    if (!mine.length) list.append(el('li', 'share-panel__none', 'No links yet.'));
  };

  const run = async (fn: () => Promise<Reply>, done: string) => {
    try {
      const reply = await fn();
      paint(reply.shares, reply.log);
      say.textContent = done;
      return true;
    } catch (e) {
      say.textContent = e instanceof Error && e.message ? e.message : 'That didn’t go through. Check your connection and try again.';
      return false;
    }
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const initials = input.value.trim();
    if (!initials) {
      say.textContent = 'Type their initials first.';
      return;
    }
    add.disabled = true;
    void run(() => api.add(classId, studentId, initials), 'Link made. Give them the link and the PIN.').then((ok) => {
      add.disabled = false;
      if (ok) input.value = '';
    });
  });

  void api.list(classId).then(
    (r) => paint(r.shares, r.log),
    () => (say.textContent = 'Links didn’t load. Check your connection.')
  );
  return {
    dispose() {
      disposed = true;
      box.remove();
    }
  };
}
