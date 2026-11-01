/**
 * Student files for a sprint: sketches and prototype parts. Kept under the
 * sprint, apart from the teacher's media library. A student may read their
 * own files and their group's; the teacher reads any. Fetched by POST so the
 * class token never sits in a URL.
 */
import { randomBytes } from 'node:crypto';
import { read, reject } from './question-drop.mjs';
import { identify } from './quiz.mjs';
import { sprintAction, ownerOf } from './sprint.mjs';
import { sprintKeys } from './sprint-keys.mjs';
import { listBlobKeys } from './blobs-list.mjs';

export const SPRINT_FILE_MIME = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);
/** The finished prototype may also be a slide deck or document; the teacher downloads it to present. */
export const PITCH_FILE_MIME = new Set(['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
export const SPRINT_FILE_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 6;

/** The student's sprint view, through the same identity and group rules as every sprint action. */
async function studentFor(store, lessonId, fields) {
  const view = await sprintAction(store, lessonId, { action: 'status', class_id: fields.class_id, class_token: fields.class_token });
  if (!view.group) reject(403, view.not_for_you ? 'not_for_you' : 'need_initials', view.not_for_you ? 'This sprint isn’t set for you.' : 'Type your initials first.');
  return view;
}

/** The claimed student's id for these class fields. */
async function studentIdFor(store, fields) {
  const who = await identify(store, { class_id: fields.class_id, class_token: fields.class_token }, 'status');
  if (!who.student) reject(403, 'need_initials', 'Type your initials first.');
  return who.student.id;
}

export async function uploadSprintFile(store, lessonId, form) {
  const fields = { class_id: form.get('class_id'), class_token: form.get('class_token') };
  const phase = form.get('phase');
  const file = form.get('file');
  if (phase !== 'sketch' && phase !== 'prototype') reject(400, 'bad_phase', 'Files go with Sketch or Prototype.');
  if (!(file instanceof File)) reject(400, 'no_file', 'Pick a file.');
  if (!SPRINT_FILE_MIME.has(file.type) && !(phase === 'prototype' && PITCH_FILE_MIME.has(file.type))) reject(400, 'bad_type', phase === 'prototype' ? 'Upload a PDF, PowerPoint, Word file or a picture (PNG, JPG or WEBP).' : 'Upload a PDF or a picture (PNG, JPG or WEBP).');
  if (file.size > SPRINT_FILE_BYTES) reject(413, 'too_large', 'That file is over 5 MB. Save a smaller copy or add a link.');
  const view = await studentFor(store, lessonId, fields);
  if (view.lock) reject(423, 'locked', 'The sprint is locked for now. It opens again soon.');
  if (!view.phases.find((p) => p.key === phase)?.open) reject(409, 'not_open', 'This phase hasn’t opened yet.');
  const config = await read(store, sprintKeys(lessonId).config);
  const studentId = await studentIdFor(store, fields);
  const owner = ownerOf(config.class_id, studentId);
  const k = sprintKeys(lessonId);
  if ((await listBlobKeys(store, k.fileMetaPrefix(owner))).length >= MAX_FILES) reject(429, 'too_many', 'You’ve uploaded 6 files. Use a link for more.');
  const id = randomBytes(8).toString('hex');
  await store.set(k.file(owner, id), await file.arrayBuffer(), { metadata: { contentType: file.type } });
  const meta = { name: file.name.slice(0, 120), mime: file.type, size: file.size, at: new Date().toISOString(), phase };
  await store.setJSON(k.fileMeta(owner, id), meta);
  await store.setJSON(k.fileOwner(id), { owner, student: studentId });
  return { id, ...meta };
}

async function fileRecord(store, lessonId, fileId) {
  if (typeof fileId !== 'string' || !/^[a-f0-9]{16}$/.test(fileId)) reject(404, 'not_found', 'That file has gone.');
  const k = sprintKeys(lessonId);
  const index = await read(store, k.fileOwner(fileId));
  if (!index) reject(404, 'not_found', 'That file has gone.');
  const meta = await read(store, k.fileMeta(index.owner, fileId));
  const blob = await store.get(k.file(index.owner, fileId), { type: 'arrayBuffer', consistency: 'strong' });
  // The real store returns the ArrayBuffer; the test store keeps { bytes, metadata }.
  const bytes = blob?.bytes ?? blob;
  if (!meta || !bytes) reject(404, 'not_found', 'That file has gone.');
  return { ...meta, bytes, student: index.student };
}

/** A student reads a file of their own or their group's. */
export async function readSprintFile(store, lessonId, body) {
  await studentFor(store, lessonId, body);
  const config = await read(store, sprintKeys(lessonId).config);
  const me = await studentIdFor(store, body);
  const file = await fileRecord(store, lessonId, body.file_id);
  const group = config.groups.find((g) => g.students.includes(me));
  if (!group?.students.includes(file.student)) reject(404, 'not_found', 'That file has gone.');
  return file;
}

export async function teacherSprintFile(store, lessonId, body) {
  return fileRecord(store, lessonId, body.file_id);
}
