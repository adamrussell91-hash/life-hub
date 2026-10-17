/**
 * Question drop: students write a question in an ordinary lesson and it lands
 * in a quiz lesson in the same unit for the teacher to approve.
 *
 *   question_drop/{quiz}/subs/{source}/{block}/{device}/{n}   one create-only blob per question
 *   question_drop/{quiz}/review/{submission}                  { status, quiz_block_id?, at } (teacher)
 *
 * No accounts and no names. A device keeps a random token; the server stores
 * only a hash of it, used to cap how many questions one device sends. The
 * teacher sees which questions came from the same device, never who.
 *
 * The block, its settings and its target are read from the published lesson,
 * so a student can't widen what the teacher allowed. The target must be a
 * live quiz lesson in the same unit as the block's lesson.
 */
import { createHash, randomBytes } from 'node:crypto';
import { isSafeId } from './class-examples.mjs';
import { isDeletedRecord } from './record-liveness.mjs';
import { draftLessonKey, publishedLessonKey } from './teaching-blobs.mjs';
import { listBlobKeys } from './blobs-list.mjs';
import { flagText } from './peer-feedback-filter.mjs';
import { QUIZ_QUESTION_KINDS, checkQuestion } from './quiz-core.mjs';

const STRONG = { type: 'json', consistency: 'strong' };
export const MAX_PER_BLOCK = 400;

export class QuizError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const reject = (status, code, message) => {
  throw new QuizError(status, code, message);
};
export const read = (store, key) => store.get(key, STRONG);
export const deviceHash = (token) => createHash('sha256').update(token).digest('hex').slice(0, 24);
export const validToken = (token) => typeof token === 'string' && /^[a-f0-9]{48}$/.test(token);

/** Every block in a lesson tree, including those inside sections, columns and tabs. */
export function* walkBlocks(blocks) {
  for (const b of Array.isArray(blocks) ? blocks : []) {
    if (!b || typeof b !== 'object') continue;
    yield b;
    const nested = [b.content?.blocks, ...(b.content?.columns ?? []).map((c) => c?.blocks), ...(b.content?.tabs ?? []).map((t) => t?.blocks)];
    for (const children of nested) yield* walkBlocks(children);
  }
}

function findDrop(blocks, id) {
  for (const b of walkBlocks(blocks)) {
    if (b.id === id && b.block_type === 'question_drop' && b.visibility !== 'teacher_only') return b;
  }
  return null;
}

/** Image links a student may use: only images already in the lesson. */
export function lessonImageUrls(blocks) {
  const urls = new Set();
  for (const b of walkBlocks(blocks)) {
    if (b.block_type === 'image' && typeof b.content?.url === 'string') urls.add(b.content.url);
    if (b.block_type === 'gallery') for (const item of b.content?.items ?? []) if (typeof item?.url === 'string') urls.add(item.url);
  }
  return urls;
}

/** Every string in a question, for the word check. */
function questionText(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => questionText(v, out));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) if (k !== 'url' && k !== 'id') questionText(v, out);
  return out;
}

const subsPrefix = (quiz) => `question_drop/${quiz}/subs/`;
export const submissionId = (key, quiz) => key.slice(subsPrefix(quiz).length).split('/').join('~');
const SUBMISSION_ID = /^[A-Za-z0-9_-]{1,120}~[A-Za-z0-9_-]{1,120}~[a-f0-9]{24}~\d{1,2}$/;
export const isSubmissionId = (id) => typeof id === 'string' && SUBMISSION_ID.test(id);
const submissionKey = (quiz, id) => `${subsPrefix(quiz)}${id.split('~').join('/')}`;
const reviewKey = (quiz, id) => `question_drop/${quiz}/review/${id}`;

/** The quiz a drop may feed: a live quiz lesson in the same unit. */
export async function readTargetQuiz(store, targetId, unitId) {
  if (!isSafeId(targetId)) return null;
  const quiz = await read(store, draftLessonKey(targetId));
  if (!quiz || isDeletedRecord(quiz) || quiz.pedagogical_mode !== 'quiz') return null;
  if (unitId && quiz.unit_id !== unitId) return null;
  return quiz;
}

function allowedKinds(content) {
  const kinds = Array.isArray(content.kinds) ? content.kinds.filter((k) => QUIZ_QUESTION_KINDS.includes(k)) : [];
  return kinds.length ? kinds : [...QUIZ_QUESTION_KINDS];
}

function dropSettings(content) {
  const min = Math.max(1, Math.min(20, Number(content.marks_min) || 1));
  const max = Math.max(min, Math.min(20, Number(content.marks_max) || 3));
  return {
    target: typeof content.target_quiz_id === 'string' ? content.target_quiz_id : '',
    kinds: allowedKinds(content),
    marks_min: min,
    marks_max: max,
    per_student: Math.max(1, Math.min(5, Number(content.per_student) || 1)),
    accepting: content.accepting !== false
  };
}

/** Student side of a Question drop block: status and submit. */
export async function questionDropAction(store, lessonId, blockId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  if (!isSafeId(lessonId) || !isSafeId(blockId)) reject(404, 'not_found', 'Activity not found.');
  const action = body.action ?? 'status';
  if (!['status', 'submit'].includes(action)) reject(400, 'bad_action', 'Unknown action.');

  const [draft, published] = await Promise.all([read(store, draftLessonKey(lessonId)), read(store, publishedLessonKey(lessonId))]);
  const block = draft && !isDeletedRecord(draft) && findDrop(draft.blocks, blockId) && published ? findDrop(published.blocks, blockId) : null;
  if (!block) reject(404, 'not_published', 'This question box isn’t published yet.');
  const settings = dropSettings(block.content ?? {});
  const quiz = settings.target ? await readTargetQuiz(store, settings.target, draft.unit_id) : null;
  const closesAt = Date.parse(quiz?.quiz?.closes_at ?? '');
  const closed = Number.isFinite(closesAt) && closesAt < Date.now();
  const open = !!quiz && settings.accepting && !closed;

  const shared = {
    open,
    reason: !quiz ? 'no_quiz' : !settings.accepting ? 'paused' : closed ? 'closed' : null,
    quiz_title: quiz?.title ?? '',
    kinds: settings.kinds,
    marks_min: settings.marks_min,
    marks_max: settings.marks_max,
    per_student: settings.per_student
  };
  if (!body.token) {
    if (action !== 'status') reject(400, 'no_device', 'This browser needs to allow saving to send a question.');
    return { ...shared, sent: [] };
  }
  if (!validToken(body.token)) reject(400, 'no_device', 'This browser needs to allow saving to send a question.');
  const device = deviceHash(body.token);
  const mineKeys = quiz ? await listBlobKeys(store, `${subsPrefix(quiz.id)}${lessonId}/${blockId}/${device}/`) : [];

  if (action === 'submit') {
    if (!open) reject(409, 'closed', shared.reason === 'closed' ? 'This quiz has closed to new questions.' : 'This question box isn’t taking questions right now.');
    if (mineKeys.length >= settings.per_student) {
      reject(409, 'limit', settings.per_student === 1 ? 'You’ve already sent your question.' : `You’ve already sent ${settings.per_student} questions.`);
    }
    const checked = checkQuestion({ ...(body.question ?? {}), id: 'q' });
    if (!checked.ok) reject(400, 'bad_question', checked.message);
    const question = { ...checked.question, id: randomBytes(6).toString('hex') };
    if (!settings.kinds.includes(question.kind)) reject(400, 'bad_kind', 'Your teacher hasn’t turned on that question type here.');
    if (question.marks < settings.marks_min || question.marks > settings.marks_max) {
      reject(400, 'bad_marks', `Marks must be between ${settings.marks_min} and ${settings.marks_max}.`);
    }
    if (question.image) {
      const images = lessonImageUrls(published.blocks);
      if (!images.has(question.image.url)) reject(400, 'bad_image', 'Use one of this lesson’s images.');
    }
    const blockCount = (await listBlobKeys(store, `${subsPrefix(quiz.id)}${lessonId}/${blockId}/`)).length;
    if (blockCount >= MAX_PER_BLOCK) reject(409, 'full', 'This question box is full. Ask your teacher.');
    const flagged = questionText(question).some((text) => flagText(text));
    const record = {
      question,
      flagged,
      created_at: new Date().toISOString(),
      source_lesson_id: lessonId,
      block_id: blockId,
      device
    };
    let written = false;
    for (let n = mineKeys.length; n < settings.per_student && !written; n++) {
      const key = `${subsPrefix(quiz.id)}${lessonId}/${blockId}/${device}/${n}`;
      const result = await store.setJSON(key, record, { onlyIfNew: true });
      written = result?.modified !== false;
      if (written) mineKeys.push(key);
    }
    if (!written) reject(409, 'limit', 'You’ve already sent your question.');
  }

  const sent = await Promise.all(mineKeys.map(async (key) => (await read(store, key))?.question)).then((rows) =>
    rows.filter(Boolean).map((q) => ({ kind: q.kind, prompt: q.prompt || q.passage || '' }))
  );
  return { ...shared, sent };
}

/** Teacher: every question sent to a quiz, with its review state, newest first. */
export async function listSubmissions(store, quizId) {
  const keys = await listBlobKeys(store, subsPrefix(quizId));
  const rows = await Promise.all(
    keys.map(async (key) => {
      const id = submissionId(key, quizId);
      if (!isSubmissionId(id)) return null;
      const [record, review] = await Promise.all([read(store, key), read(store, reviewKey(quizId, id))]);
      if (!record?.question) return null;
      return {
        id,
        question: record.question,
        flagged: !!record.flagged,
        created_at: record.created_at,
        source_lesson_id: record.source_lesson_id,
        block_id: record.block_id,
        device: record.device?.slice(0, 6) ?? '',
        status: review?.status ?? 'pending',
        quiz_block_id: review?.quiz_block_id ?? null
      };
    })
  );
  const list = rows.filter(Boolean).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const titles = new Map();
  for (const id of new Set(list.map((r) => r.source_lesson_id))) {
    titles.set(id, (await read(store, draftLessonKey(id)))?.title ?? 'A lesson');
  }
  return list.map((r) => ({ ...r, source_title: titles.get(r.source_lesson_id) }));
}

export async function reviewSubmission(store, quizId, body) {
  if (!isSubmissionId(body.submission_id)) reject(400, 'bad_request', 'Unknown question.');
  if (!['approved', 'rejected', 'pending'].includes(body.status)) reject(400, 'bad_request', 'Unknown review.');
  const record = await read(store, submissionKey(quizId, body.submission_id));
  if (!record) reject(404, 'not_found', 'That question is gone.');
  const review = { status: body.status, at: new Date().toISOString() };
  if (body.status === 'approved' && isSafeId(body.quiz_block_id)) review.quiz_block_id = body.quiz_block_id;
  await store.setJSON(reviewKey(quizId, body.submission_id), review);
  return review;
}
