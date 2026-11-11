/**
 * Game lesson storage paths, and the read the markbook and student profile
 * use. Kept apart from games.mjs so markbook.mjs can read game evidence
 * without importing the game endpoints (which import the markbook).
 *
 * Game ids can't be 'keys' or 'current' (game-schema.mjs, RESERVED_GAME_IDS).
 */
import { isSafeId } from './class-examples.mjs';
import { read } from './question-drop.mjs';

export const gameKeys = (lesson) => ({
  current: `games/${lesson}/current`,
  version: (v) => `games/${lesson}/keys/${v}`,
  plays: (game) => `games/${lesson}/${game}/plays/`,
  play: (game, play) => `games/${lesson}/${game}/plays/${play}`,
  events: (game, play, owner) => `games/${lesson}/${game}/events/${play}/${owner}`,
  summary: (game, cls) => `games/${lesson}/${game}/summary/${cls}`,
  /** Live rooms opened for a game (game-rooms.mjs): { room, code, class_id, version, opened_at, folded }. */
  rooms: (game) => `games/${lesson}/${game}/rooms/`,
  room: (game, room) => `games/${lesson}/${game}/rooms/${room}`
});

/** A live room's join code → where it is. Freed when the room folds, or once it is 6 h old. */
export const roomCodeKey = (code) => `game-rooms/codes/${code}`;

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

/**
 * Game evidence for the markbook and student profile: each game in a
 * published Game lesson that a student on the list has finished, with their
 * latest play's evidence and its Sydney day. Readers place it with source
 * `game:{lesson}:{game}` and count it as "right once" at most. Empty for any
 * other lesson.
 */
export async function classGameEvidence(store, lessonId, classId, studentIds) {
  if (!isSafeId(lessonId)) return [];
  const k = gameKeys(lessonId);
  const current = await read(store, k.current);
  if (!current?.version) return [];
  const record = await read(store, k.version(current.version));
  if (!record) return [];
  const onList = new Set(studentIds);
  const out = [];
  for (const gameId of Array.isArray(record.order) ? record.order : []) {
    const summary = await read(store, k.summary(gameId, classId));
    const students = {};
    for (const [id, s] of Object.entries(obj(summary?.students))) {
      if (onList.has(id) && Array.isArray(s?.evidence) && s.evidence.length) students[id] = { date: s.date, evidence: s.evidence };
    }
    if (Object.keys(students).length) out.push({ lesson_id: lessonId, game_id: gameId, title: record.games?.[gameId]?.title ?? '', kind: record.games?.[gameId]?.kind ?? null, students });
  }
  return out;
}
