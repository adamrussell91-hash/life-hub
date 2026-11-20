import { apiGet } from '@/api/client';
import { navigate } from '@/app/router';
import { isTeacherPreview } from '@/quiz/teacher-preview';
import './game-invite.css';

/**
 * Push invite, the student half. Every class page asks every few seconds
 * (while the tab is visible) whether the teacher pushed a live-game invite
 * for its class (/api/published/game-invite/{class}, edge-cached). An invite
 * shows a toast with one Join button: it opens the game lesson with the code
 * in, and the arcade joins straight away (arcade.ts `?game=`).
 *
 * Pages without a class in the link (a plain lesson link, feedback) use the
 * class this browser last opened. Closing the toast, joining, or already
 * sitting in that room keeps it away until the teacher pushes again.
 */

export type GameInvite = { room: string; code: string; lesson_id: string; game_id: string; title: string; sent_at: number };

/** Fired on window when Join is pressed on the invite's own lesson page; the arcade opens the game. */
export const GAME_INVITE_EVENT = 'classroom:game-invite';

const POLL_MS = 6000;
const CLASS_KEY = 'game-invite:class';
const doneKey = (inv: Pick<GameInvite, 'room' | 'sent_at'>) => `game-invite:done:${inv.room}:${inv.sent_at}`;
const joinedKey = (room: string) => `game-invite:joined:${room}`;

function store(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
function get(key: string): string | null {
  try {
    return store()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}
function set(key: string, value: string): void {
  try {
    store()?.setItem(key, value);
  } catch {
    // Private windows can refuse: the toast just comes back on the next page.
  }
}

/** The arcade calls this once a student is in a room, by any route (toast, QR or typed code). */
export function markGameRoomJoined(room: string): void {
  if (room) set(joinedKey(room), '1');
}

/** The lesson link the toast opens: that lesson for that class, the code in, this game picked. */
export function inviteHref(classId: string, inv: GameInvite): string {
  return `/s/classes/${encodeURIComponent(classId)}/lessons/${encodeURIComponent(inv.lesson_id)}?join=${encodeURIComponent(inv.code)}&game=${encodeURIComponent(inv.game_id)}`;
}

/** Whether this invite should show: not closed or joined already. */
export function inviteWanted(inv: GameInvite | null): inv is GameInvite {
  return !!inv && !get(doneKey(inv)) && !get(joinedKey(inv.room));
}

type Watch = { classId: string; timer: number | undefined; busy: boolean; shown: GameInvite | null };
let watch: Watch | null = null;
let toastEl: HTMLElement | null = null;

function hideToast(): void {
  toastEl?.remove();
  toastEl = null;
  if (watch) watch.shown = null;
}

function onThisLesson(classId: string, inv: GameInvite): boolean {
  const path = location.pathname.replace(/\/+$/, '');
  return path.endsWith(`/s/classes/${encodeURIComponent(classId)}/lessons/${encodeURIComponent(inv.lesson_id)}`) || path.endsWith(`/s/lessons/${encodeURIComponent(inv.lesson_id)}`);
}

function showToast(classId: string, inv: GameInvite): void {
  if (watch?.shown && watch.shown.room === inv.room && watch.shown.sent_at === inv.sent_at && toastEl?.isConnected) return;
  hideToast();
  const box = document.createElement('div');
  box.className = 'gi-toast';
  box.setAttribute('role', 'alertdialog');
  box.setAttribute('aria-labelledby', 'gi-toast-title');
  const text = document.createElement('div');
  text.className = 'gi-toast__text';
  const title = document.createElement('p');
  title.className = 'gi-toast__title';
  title.id = 'gi-toast-title';
  title.textContent = 'Live game starting';
  const sub = document.createElement('p');
  sub.className = 'gi-toast__sub';
  sub.textContent = inv.title;
  text.append(title, sub);
  const join = document.createElement('button');
  join.type = 'button';
  join.className = 'btn btn--primary gi-toast__join';
  join.textContent = 'Join game';
  join.addEventListener('click', () => {
    set(doneKey(inv), '1');
    hideToast();
    if (onThisLesson(classId, inv)) window.dispatchEvent(new CustomEvent(GAME_INVITE_EVENT, { detail: { game_id: inv.game_id, code: inv.code } }));
    else navigate(inviteHref(classId, inv));
  });
  const shut = document.createElement('button');
  shut.type = 'button';
  shut.className = 'gi-toast__close';
  shut.setAttribute('aria-label', 'Not now');
  shut.textContent = '×';
  shut.addEventListener('click', () => {
    set(doneKey(inv), '1');
    hideToast();
  });
  box.append(text, join, shut);
  document.body.append(box);
  toastEl = box;
  if (watch) watch.shown = inv;
}

async function poll(): Promise<void> {
  const w = watch;
  if (!w || w.busy || document.hidden) return;
  w.busy = true;
  try {
    const res = await apiGet<{ invite: GameInvite | null }>(`/api/published/game-invite/${encodeURIComponent(w.classId)}`);
    if (watch !== w) return;
    const inv = res?.invite ?? null;
    if (inviteWanted(inv)) showToast(w.classId, inv);
    else hideToast();
  } catch {
    // Offline or a blip: try again next round.
  } finally {
    w.busy = false;
  }
}

function schedule(): void {
  if (!watch) return;
  window.clearTimeout(watch.timer);
  watch.timer = window.setTimeout(async () => {
    await poll();
    schedule();
  }, POLL_MS);
}

function onVisible(): void {
  if (!document.hidden) void poll();
}

/**
 * Called on every route change. A student route passes its class (or null
 * for a page without one: the remembered class is used); a teacher route
 * passes `false` and the watch stops.
 */
export function syncGameInviteWatch(classId: string | null | false): void {
  const id = classId === false ? null : classId || get(CLASS_KEY);
  if (classId) set(CLASS_KEY, classId);
  if (!id || isTeacherPreview()) {
    stopGameInviteWatch();
    return;
  }
  if (watch?.classId === id) {
    // A new page: hide a toast for the room this page is already in, and look again now.
    void poll();
    return;
  }
  stopGameInviteWatch();
  watch = { classId: id, timer: undefined, busy: false, shown: null };
  document.addEventListener('visibilitychange', onVisible);
  void poll();
  schedule();
}

export function stopGameInviteWatch(): void {
  if (watch) window.clearTimeout(watch.timer);
  watch = null;
  document.removeEventListener('visibilitychange', onVisible);
  hideToast();
}
