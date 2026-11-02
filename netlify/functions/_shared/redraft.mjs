/**
 * A student rewriting a piece their teacher asked them to redraft. The current
 * hand-in and feedback stay the latest draft; sending freezes them as a draft
 * and starts the next. Only this student, and only what they can already see.
 *
 *   work_drafts/{lesson}/{block}/{student}/{n}   an earlier draft
 *   work_redraft/{lesson}/{block}/{student}      { scope, fields, at }, the words so far
 */
import { claimFor, loadRoster } from './class-claims.mjs';
import { isSafeId } from './class-examples.mjs';
import { readBook } from './markbook.mjs';
import { read, reject, walkBlocks } from './question-drop.mjs';
import { publishedLessonKey } from './teaching-blobs.mjs';
import { blockLabels, draftKey, handinKey, pieceId, redraftKey, STEP_PART, WORK_LIMITS, writingParts } from './lesson-work.mjs';
import { pieceKey, unionTags } from './piece-feedback.mjs';

export const REDRAFT_ACTIONS = ['redraft_load', 'redraft_save', 'redraft_send'];

const sameScope = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const inScope = (scope, part, field, text) => (scope === 'whole' ? typeof text?.[part]?.[field] === 'string' : scope.part === part && scope.field === field);

/** The piece's text after this redraft, or a refusal. Words outside a section can't change. */
export function redraftText(text, scope, fields) {
  const next = structuredClone(writingParts(text));
  if (scope === 'whole') {
    for (const [part, row] of Object.entries(next)) {
      for (const field of Object.keys(row)) {
        const words = fields?.[part]?.[field];
        if (typeof words === 'string') row[field] = words;
      }
    }
    if (!Object.values(next).some((row) => Object.values(row).some((v) => v.trim()))) reject(400, 'empty', 'Write something before you send it.');
  } else {
    const was = next[scope.part][scope.field];
    const words = fields?.[scope.part]?.[scope.field];
    if (typeof words === 'string' && !words.trim()) reject(400, 'empty', 'Write something before you send it.');
    next[scope.part][scope.field] = `${was.slice(0, scope.start)}${words ?? was.slice(scope.start, scope.end)}${was.slice(scope.end)}`;
  }
  if (Object.values(next).some((row) => Object.values(row).some((v) => v.length > WORK_LIMITS.text))) reject(400, 'too_long', 'That’s too long to send. Shorten it a little.');
  return next;
}

/** Next-step picks on answers this redraft left alone. A changed answer's pick no longer fits it. */
function keptPicks(oldText, next, block) {
  const questions = Array.isArray(block?.content?.questions) ? block.content.questions : [];
  const kept = {};
  for (const [part, fields] of Object.entries(oldText)) {
    const index = STEP_PART.exec(part)?.[1];
    const id = index === undefined ? null : questions[Number(index)]?.id;
    if (id && next.answers?.[id] === oldText.answers?.[id]) kept[part] = fields;
  }
  return kept;
}

export async function redraftAction(store, lessonId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !REDRAFT_ACTIONS.includes(body.action)) reject(400, 'bad_action', 'Unknown action.');
  if (!isSafeId(lessonId) || !isSafeId(body.block_id)) reject(404, 'not_found', 'That piece can’t be found.');
  const roster = await loadRoster(store, body.class_id);
  if (!roster) reject(404, 'need_class', 'Open this from your class page.');
  const student = await claimFor(store, roster, body.class_token);
  if (!student) reject(403, 'need_initials', 'Type your initials first.');
  const classId = roster.cls.id;
  const key = pieceKey(classId, student.id, pieceId(lessonId, body.block_id));
  const [feedback, handin, { book }] = await Promise.all([read(store, key), read(store, handinKey(lessonId, body.block_id, student.id)), readBook(store, classId)]);
  if (!feedback?.redraft) reject(409, 'not_asked', 'Your teacher has changed this. Reopen Returned work.');
  const column = book.columns.find((c) => c.id === feedback.column_id && c.kind === 'assessment' && c.piece?.lesson_id === lessonId && c.piece.block_id === body.block_id);
  if (!column || !handin) reject(409, 'task_changed', 'This task has changed. Ask your teacher.');
  const { scope } = feedback.redraft;
  const workingKey = redraftKey(lessonId, body.block_id, student.id);
  const stored = await read(store, workingKey);
  const working = stored && sameScope(stored.scope, scope) ? stored.fields : {};
  const lessonBlock = async () => {
    const lesson = await read(store, publishedLessonKey(lessonId));
    return lesson ? [...walkBlocks(lesson.blocks)].find((b) => b.id === body.block_id) ?? null : null;
  };

  if (body.action === 'redraft_load') {
    const block = await lessonBlock();
    return { scope, text: writingParts(handin.text), prompts: block ? blockLabels(block).prompts : {}, working };
  }

  if (body.action === 'redraft_save') {
    if (typeof body.part !== 'string' || typeof body.field !== 'string' || typeof body.text !== 'string' || !inScope(scope, body.part, body.field, handin.text)) reject(400, 'out_of_scope', 'That isn’t part of this redraft.');
    if (body.text.length > WORK_LIMITS.text) reject(400, 'too_long', 'That’s too long to save. Shorten it a little.');
    const fields = { ...working, [body.part]: { ...(working[body.part] ?? {}), [body.field]: body.text } };
    const at = new Date().toISOString();
    await store.setJSON(workingKey, { scope, fields, at });
    return { saved: true, at };
  }

  const next = redraftText(handin.text, scope, working);
  const block = await lessonBlock();
  const now = new Date().toISOString();
  const n = feedback.draft ?? 1;
  const steps = book.marks?.[column.id]?.[student.id]?.steps ?? {};
  await store.setJSON(draftKey(lessonId, body.block_id, student.id, n), {
    text: handin.text, tags: feedback.tags ?? [], comment: feedback.comment ?? '', rubric: feedback.rubric ?? null, steps, scope,
    handed_in_at: handin.handed_in_at, returned_at: feedback.returned_at, seen_at: feedback.seen_at ?? null
  });
  await store.setJSON(handinKey(lessonId, body.block_id, student.id), { ...handin, text: { ...next, ...keptPicks(handin.text, next, block) }, handed_in_at: now, draft: n + 1 });
  await store.setJSON(key, {
    kind: feedback.kind, title: feedback.title, ...(feedback.short ? { short: feedback.short } : {}),
    lesson_id: lessonId, block_id: body.block_id, column_id: column.id,
    tags: [], comment: '', ...(feedback.rubric ? { rubric: feedback.rubric } : {}),
    status: 'draft', draft: n + 1,
    first: feedback.first ?? { steps, rubric: feedback.rubric ?? null, returned_at: feedback.returned_at },
    earlier_tags: unionTags(feedback),
    sent_scope: scope, sent_at: now, updated_at: now
  });
  await store.delete(workingKey);
  return { sent: true, at: now, draft: n + 1 };
}
