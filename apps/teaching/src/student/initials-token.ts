import { apiGet, apiPost } from '@/api/client';
import { deviceToken, el, readJSON, writeJSON } from '@/quiz/dom';
import { studentAnchor } from '@/student/shell';
import './initials-token.css';

/**
 * The student's way to their own page from any lesson: their initials in the
 * top bar, with a count when feedback is waiting. Before they've given their
 * initials it says My progress, and the progress page asks who they are.
 */

type TokenReply = { need: 'initials' | null; initials?: string; unseen?: number };
export type InitialsTokenOptions = {
  classId: string;
  /** The lesson page to come back to, passed on to the progress page. */
  from: string;
  /** Test seam. */
  call?: () => Promise<TokenReply>;
};
export type InitialsTokenHandle = { element: HTMLElement; refresh(): void; dispose(): void };

const askToken = (classId: string): Promise<TokenReply> =>
  apiPost<TokenReply>(`/api/published/profile/${encodeURIComponent(classId)}`, { action: 'token', class_token: deviceToken(`class:${classId}`) });

/**
 * A plain lesson link names no class, so find the one this student belongs to: the lesson's only
 * class, or the one that knows this device. Several classes and no initials yet: no class to name.
 * This device remembers the answer per lesson, because the lookup reads every class and timetable row.
 */
export async function classForPlainLesson(lessonId: string): Promise<string | null> {
  const key = `lesson-token-class:${lessonId}`;
  const saved = readJSON<string>(key);
  if (saved) return saved;
  const { classes } = await apiGet<{ classes?: Array<{ id: string }> }>(`/api/published/lessons/${encodeURIComponent(lessonId)}?classes=1`);
  const ids = (classes ?? []).map((c) => c.id);
  let found = ids.length === 1 ? ids[0]! : null;
  for (const id of ids.length > 1 ? ids : []) {
    if ((await askToken(id).catch(() => null))?.initials) {
      found = id;
      break;
    }
  }
  if (found) writeJSON(key, found);
  return found;
}

export function mountInitialsToken(options: InitialsTokenOptions): InitialsTokenHandle {
  const { classId, from } = options;
  const call = options.call ?? (() => askToken(classId));
  let disposed = false;

  const link = studentAnchor(`/s/classes/${encodeURIComponent(classId)}/profile?from=${encodeURIComponent(from)}`, 'st-token');
  // Hidden until the first reply, so it never flashes My progress at someone it knows.
  link.hidden = true;

  const paint = (initials: string | undefined, unseen: number): void => {
    const who = el('span', `st-token__who${initials ? ' is-initials' : ''}`, initials ?? 'My progress');
    link.replaceChildren(who);
    if (unseen > 0) link.append(el('span', 'st-token__count', String(unseen)));
    const fresh = unseen === 1 ? ', 1 piece of new feedback' : unseen > 1 ? `, ${unseen} pieces of new feedback` : '';
    link.setAttribute('aria-label', `My progress${initials ? `, ${initials}` : ''}${fresh}`);
    link.hidden = false;
  };

  const refresh = (): void => {
    void Promise.resolve().then(call).then(
      (reply) => {
        if (!disposed) paint(reply.need ? undefined : reply.initials, reply.need ? 0 : reply.unseen ?? 0);
      },
      () => {
        // The link still works when the check fails: the progress page says what's wrong.
        if (!disposed && link.hidden) paint(undefined, 0);
      }
    );
  };
  refresh();

  return {
    element: link,
    refresh,
    dispose() {
      disposed = true;
      link.remove();
    }
  };
}

/** The lesson page a progress page was opened from, or null for anything else in `from`. */
export function lessonToReturnTo(search: string): string | null {
  const from = new URLSearchParams(search).get('from');
  return from && /^\/s\/(?:classes\/[^/?#]+\/)?lessons\/[^/?#]+(?:\?class=[^&#/]+)?$/.test(from) ? from : null;
}
