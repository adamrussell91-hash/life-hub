/**
 * The teacher's private notes on one student: dated lines only the teacher reads.
 *
 *   teacher-notes/{class}/{student}.json   { notes: [{ id, at, text, tag?, edited_at? }] }
 *
 * Kept apart from feedback notes (teaching-feedback.mjs), which students can see. No student
 * route reads this prefix; only teacherProfileAction (operator-gated) calls these.
 */
import { getJSON, newId, setJSON } from './teaching-blobs.mjs';
import { reject } from './question-drop.mjs';

export const TEACHER_NOTES_PREFIX = 'teacher-notes/';
export const NOTE_MAX = 2000;
export const NOTE_TAG = /^(dp|out|skill|fam|tech|kp|du|vocab):.+/;
const NOTE_ID = /^[A-Za-z0-9_-]{1,80}$/;
const TAG_MAX = 200;

export const teacherNotesKey = (classId, studentId) => `${TEACHER_NOTES_PREFIX}${classId}/${studentId}.json`;

async function readNotes(store, classId, studentId) {
  const doc = await getJSON(store, teacherNotesKey(classId, studentId), { consistency: 'strong' });
  return Array.isArray(doc?.notes) ? doc.notes.filter((n) => n && typeof n.id === 'string' && typeof n.text === 'string') : [];
}

/** Newest first; an edit keeps its place. */
const newestFirst = (notes) => [...notes].sort((a, b) => String(b.at).localeCompare(String(a.at)));

const shown = (n) => ({ id: n.id, at: n.at, text: n.text, ...(n.tag ? { tag: n.tag } : {}), ...(n.edited_at ? { edited_at: n.edited_at } : {}) });

export async function teacherNotes(store, classId, studentId) {
  return { notes: newestFirst(await readNotes(store, classId, studentId)).map(shown) };
}

function cleanText(raw) {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text || text.length > NOTE_MAX) reject(400, 'bad_note', `Write a note of up to ${NOTE_MAX} characters.`);
  return text;
}

function cleanTag(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const tag = typeof raw === 'string' ? raw.trim() : '';
  if (!tag || tag.length > TAG_MAX || !NOTE_TAG.test(tag)) reject(400, 'bad_tag', 'That tag isn’t one this page knows.');
  return tag;
}

/** Create a note (no id) or edit one (id): edits keep `at` and stamp `edited_at`. */
export async function saveTeacherNote(store, classId, studentId, note, { now = new Date() } = {}) {
  if (!note || typeof note !== 'object' || Array.isArray(note)) reject(400, 'bad_note', 'Write a note first.');
  const text = cleanText(note.text);
  const tag = cleanTag(note.tag);
  const notes = await readNotes(store, classId, studentId);
  const at = now.toISOString();
  let next;
  if (note.id === undefined || note.id === null || note.id === '') {
    next = [...notes, { id: newId('tn'), at, text, ...(tag ? { tag } : {}) }];
  } else {
    if (typeof note.id !== 'string' || !NOTE_ID.test(note.id) || !notes.some((n) => n.id === note.id)) reject(404, 'not_found', 'That note has gone.');
    next = notes.map((n) => {
      if (n.id !== note.id) return n;
      const { tag: _old, ...rest } = n;
      return { ...rest, text, ...(tag ? { tag } : {}), edited_at: at };
    });
  }
  await setJSON(store, teacherNotesKey(classId, studentId), { notes: next });
  return { notes: newestFirst(next).map(shown) };
}

export async function deleteTeacherNote(store, classId, studentId, noteId) {
  const notes = await readNotes(store, classId, studentId);
  if (typeof noteId !== 'string' || !NOTE_ID.test(noteId) || !notes.some((n) => n.id === noteId)) reject(404, 'not_found', 'That note has gone.');
  const next = notes.filter((n) => n.id !== noteId);
  await setJSON(store, teacherNotesKey(classId, studentId), { notes: next });
  return { notes: newestFirst(next).map(shown) };
}
