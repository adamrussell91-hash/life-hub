/**
 * One code a day for the live class activities (continuum line, brainstorm).
 * A device keeps one secret token per lesson per Sydney day. Typing the code
 * on the board once lets that token into every round in the lesson until
 * midnight, so later rounds join on their own. Mirrors lesson-pass.mjs.
 *
 * The page also says which class it was opened in, so a join can note whose
 * symbol it is from the class initials claim (the same one the quiz uses).
 * Only the teacher's view ever shows that.
 */
import { apiPost } from '@/api/client';
import { readJSON, writeJSON } from '@/blocks/peer-feedback-ui';
import { deviceToken, newDeviceToken } from '@/quiz/dom';

type Pass = { day: string; token: string; ok: boolean };
/** A round this device joined, kept so the teacher's view can learn who it was. */
type Round = { session: string; token: string; linked?: boolean };

const MAX_ROUNDS = 30;
const LINK_EVERY_MS = 60_000;

let lessonClass: string | null = null;

/** The class page this lesson was opened from, or null for a bare lesson link. */
export function setLessonClass(classId: string | null): void {
  lessonClass = classId;
}

/** What a join or link sends so the server can find the device's class initials claim. */
export function classFields(): Record<string, string> {
  if (!lessonClass) return {};
  const token = deviceToken(`class:${lessonClass}`);
  return token ? { class_id: lessonClass, class_token: token } : {};
}

/** Today in Sydney, YYYY-MM-DD: the day a pass is good for. */
export function lessonDay(now = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
}

const passKey = (lessonId: string) => `lesson-pass:${lessonId}`;

/** Today's token for the lesson on this device, made on first ask. Null when the browser can't store it. */
export function passFor(lessonId: string): Pass | null {
  const day = lessonDay();
  const held = readJSON<Pass>(passKey(lessonId));
  if (held && held.day === day && /^[a-f0-9]{48}$/.test(held.token)) return held;
  const fresh = { day, token: newDeviceToken(), ok: false };
  return writeJSON(passKey(lessonId), fresh) ? fresh : null;
}

/** True once today's code has let this device in, so other activities in the lesson can join on their own. */
export function hasPass(lessonId: string): boolean {
  const held = readJSON<Pass>(passKey(lessonId));
  return !!held && held.day === lessonDay() && held.ok === true;
}

export function markPass(lessonId: string, ok: boolean): void {
  const pass = passFor(lessonId);
  if (pass) writeJSON(passKey(lessonId), { ...pass, ok });
}

/** Keeps a round this device joined. `storage` is the activity's own storage prefix. */
export function rememberRound(storage: string, device: { session: string; token: string } | null): void {
  if (!device) return;
  const rounds = readJSON<Round[]>(`${storage}:rounds`) ?? [];
  if (rounds.some((r) => r.session === device.session && r.token === device.token)) return;
  writeJSON(`${storage}:rounds`, [...rounds, { session: device.session, token: device.token }].slice(-MAX_ROUNDS));
}

const lastLink = new Map<string, number>();

/**
 * Tells the server whose each kept round was, once the page knows the class
 * and the device has claimed its initials. Tries again at most once a minute
 * until every round is linked.
 */
export async function linkRounds(endpoint: string, storage: string, force = false): Promise<void> {
  const fields = classFields();
  if (!fields.class_token) return;
  const now = Date.now();
  if (!force && now - (lastLink.get(storage) ?? 0) < LINK_EVERY_MS) return;
  lastLink.set(storage, now);
  const rounds = readJSON<Round[]>(`${storage}:rounds`) ?? [];
  const open = rounds.filter((r) => !r.linked);
  if (!open.length) return;
  const done = new Set<string>();
  for (const r of open) {
    try {
      const reply = await apiPost<{ linked: boolean }>(endpoint, { action: 'link', session: r.session, token: r.token, ...fields });
      if (reply.linked) done.add(`${r.session}:${r.token}`);
    } catch {
      // Gone or offline: try again next time.
    }
  }
  if (!done.size) return;
  const latest = readJSON<Round[]>(`${storage}:rounds`) ?? [];
  writeJSON(`${storage}:rounds`, latest.map((r) => (done.has(`${r.session}:${r.token}`) ? { ...r, linked: true } : r)));
}
