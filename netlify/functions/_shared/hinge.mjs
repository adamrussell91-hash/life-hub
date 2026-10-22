/**
 * Hinge question: one quick multiple-choice check at the turning point of a
 * lesson. Students tap an answer on the open lesson while the teacher holds
 * it open; the teacher sees the spread and decides what to do next.
 *
 *   hinge/{lesson}/{block}/active                       round state (teacher writes only)
 *   hinge/{lesson}/{block}/{session}/answers/{device}   { pick, at }, changeable while open
 *
 * The right answer, the misconception notes and the move-on / reteach marks
 * never reach students: publish strips them (teaching-student.mjs), and this
 * module reads them from the draft for the teacher only. Students learn the
 * right answer only after the teacher reveals it, and never see the spread,
 * the notes or the marks.
 *
 * No accounts and no join code. A device keeps a random token and the server
 * keeps a hash of it, so each device holds one answer per round.
 *
 * A round asks either the main question or the block's back-up question (a
 * parallel question for the re-check after re-teaching; see hinge-backup.mjs).
 * The back-up lives only in the draft, so during a back-up round students get
 * its prompt and answers from this module rather than from their published
 * copy of the block.
 */
import { randomBytes } from 'node:crypto';
import { isSafeId } from './class-examples.mjs';
import { isDeletedRecord } from './record-liveness.mjs';
import { draftLessonKey, publishedLessonKey } from './teaching-blobs.mjs';
import { listBlobKeys } from './blobs-list.mjs';
import { deviceHash, validToken, walkBlocks } from './question-drop.mjs';
import { backupForBlock, cleanBackupDraft, hingeBackupSource } from './hinge-backup.mjs';

const STRONG = { type: 'json', consistency: 'strong' };
const ACTIVITY_HOURS = 12;
const TIMES = [0, 30, 60, 90, 120];
/** Answers sent a moment after the timer still count: phones lag. */
const GRACE_MS = 3000;

export class HingeError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const reject = (status, code, message) => {
  throw new HingeError(status, code, message);
};
const read = (store, key) => store.get(key, STRONG);

function findHinge(blocks, id) {
  for (const b of walkBlocks(blocks)) {
    if (b.id === id && b.block_type === 'hinge_question' && b.visibility !== 'teacher_only') return b;
  }
  return null;
}

/** The block must exist in both the draft and the published lesson. */
async function assertLive(store, lesson, block) {
  if (!isSafeId(lesson) || !isSafeId(block)) reject(404, 'not_found', 'Activity not found.');
  const [draftLesson, publishedLesson] = await Promise.all([read(store, draftLessonKey(lesson)), read(store, publishedLessonKey(lesson))]);
  const draft = draftLesson && !isDeletedRecord(draftLesson) ? findHinge(draftLesson.blocks, block) : null;
  const published = draft && publishedLesson ? findHinge(publishedLesson.blocks, block) : null;
  if (!draft || !published) reject(404, 'not_published', 'Publish this lesson and block before asking the class.');
  return { draft, published, draftLesson };
}

/** The draft's back-up question, if it is complete enough to ask. */
function backupOf(draft) {
  const b = draft.content?.backup;
  if (!b || typeof b.prompt !== 'string' || !b.prompt.trim() || !Array.isArray(b.options)) return null;
  const options = b.options
    .filter((o) => o && typeof o.id === 'string' && typeof o.text === 'string' && o.text.trim())
    .map((o) => ({ id: o.id, text: o.text, misconception: typeof o.misconception === 'string' ? o.misconception : '' }));
  if (options.length < 2 || !options.some((o) => o.id === b.correct_id)) return null;
  return { prompt: b.prompt, options, correct_id: b.correct_id, source: b.source === 'ann' ? 'ann' : 'teacher' };
}

/** Options as students got them, with the teacher's notes from the draft joined on by id. */
function setup(draft, published, round = 'main') {
  const d = draft.content ?? {};
  const backup = backupOf(draft);
  const p = published.content ?? {};
  const notes = new Map((Array.isArray(d.options) ? d.options : []).map((o) => [o.id, o]));
  const options = (Array.isArray(p.options) ? p.options : []).map((o) => ({
    id: String(o.id),
    text: typeof o.text === 'string' ? o.text : '',
    misconception: typeof notes.get(o.id)?.misconception === 'string' ? notes.get(o.id).misconception : ''
  }));
  const moveOn = Number.isInteger(d.move_on) ? Math.min(100, Math.max(1, d.move_on)) : 80;
  const reteach = Number.isInteger(d.reteach) ? Math.min(moveOn - 1, Math.max(0, d.reteach)) : Math.min(50, moveOn - 1);
  const sameText = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  if (round === 'backup' && backup) {
    return {
      round: 'backup',
      prompt: backup.prompt,
      options: backup.options,
      correct_id: backup.correct_id,
      seconds: TIMES.includes(p.seconds) ? p.seconds : 60,
      move_on: moveOn,
      reteach,
      backup,
      stale: false
    };
  }
  return {
    round: 'main',
    backup,
    prompt: typeof p.prompt === 'string' ? p.prompt : '',
    options,
    correct_id: options.some((o) => o.id === d.correct_id) ? d.correct_id : '',
    seconds: TIMES.includes(p.seconds) ? p.seconds : 60,
    move_on: moveOn,
    reteach,
    // The teacher changed the question after publishing; students still see the old one.
    stale:
      d.prompt !== p.prompt ||
      !sameText(
        (d.options ?? []).map((o) => [o.id, o.text]),
        options.map((o) => [o.id, o.text])
      )
  };
}

function keys(lesson, block, session) {
  const base = `hinge/${lesson}/${block}`;
  return {
    active: `${base}/active`,
    answer: (device) => `${base}/${session}/answers/${device}`,
    answers: `${base}/${session}/answers/`
  };
}

/** Open means the teacher hasn't closed it and the timer (if any) hasn't run out. */
function isOpen(activity, now = Date.now()) {
  if (!activity.open) return false;
  const closes = Date.parse(activity.closes_at ?? '');
  return !Number.isFinite(closes) || now <= closes + GRACE_MS;
}

async function tally(store, k, options) {
  const list = await listBlobKeys(store, k.answers);
  const answers = (await Promise.all(list.map((key) => read(store, key)))).filter(Boolean);
  const known = new Set(options.map((o) => o.id));
  const picks = Object.fromEntries(options.map((o) => [o.id, 0]));
  for (const a of answers) if (known.has(a.pick)) picks[a.pick] += 1;
  return { answered: Object.values(picks).reduce((x, y) => x + y, 0), picks };
}

/** The back-up as the teacher's screen shows it in the checkpoint preview. */
function publicBackup(backup) {
  return backup ? { prompt: backup.prompt, options: backup.options.map(({ id, text }) => ({ id, text })), correct_id: backup.correct_id, source: backup.source } : null;
}

async function teacherAction(store, k, activity, s, body) {
  const action = body.action ?? 'status';
  if (!['status', 'close', 'reveal', 'hide'].includes(action)) reject(400, 'bad_action', 'Unknown action.');
  const open = isOpen(activity);
  const patch = {};
  if (action === 'close' && open) patch.open = false;
  if (action === 'reveal') Object.assign(patch, { open: false, revealed: true });
  if (action === 'hide') patch.revealed = false;
  if (Object.keys(patch).length) {
    activity = { ...activity, ...patch };
    await store.setJSON(k.active, activity);
  }
  const { answered, picks } = await tally(store, k, s.options);
  return {
    phase: 'live',
    session: activity.session,
    round: s.round,
    open: isOpen(activity),
    closes_at: activity.closes_at ?? null,
    revealed: !!activity.revealed,
    backup: publicBackup(s.backup),
    prompt: s.prompt,
    options: s.options,
    correct_id: s.correct_id,
    move_on: s.move_on,
    reteach: s.reteach,
    stale: s.stale,
    answered,
    picks
  };
}

async function studentAction(store, k, activity, s, body) {
  const action = body.action ?? 'status';
  if (!['status', 'answer'].includes(action)) reject(400, 'bad_action', 'Unknown action.');
  const open = isOpen(activity);
  const shared = {
    phase: 'live',
    session: activity.session,
    open,
    closes_at: activity.closes_at ?? null,
    revealed: !!activity.revealed,
    // A back-up round's question is not in the student's published copy.
    ...(s.round === 'backup' ? { question: { prompt: s.prompt, options: s.options.map(({ id, text }) => ({ id, text })) } } : {})
  };
  if (!body.token) {
    if (action !== 'status') reject(400, 'no_device', 'This browser needs to allow saving to answer.');
    return { ...shared, mine: null };
  }
  if (!validToken(body.token)) reject(400, 'no_device', 'This browser needs to allow saving to answer.');
  const answerKey = k.answer(deviceHash(body.token));

  if (action === 'answer') {
    if (!open) reject(409, 'closed', 'Answers are closed.');
    if (body.session !== activity.session) reject(409, 'new_session', 'Your teacher asked again. Answer this one.');
    if (!s.options.some((o) => o.id === body.pick)) reject(400, 'bad_pick', 'Choose one of the answers.');
    await store.setJSON(answerKey, { pick: body.pick, at: new Date().toISOString() });
  }
  const mine = (await read(store, answerKey))?.pick ?? null;
  return { ...shared, mine, ...(activity.revealed ? { correct_id: s.correct_id } : {}) };
}

export async function hingeAction(store, lesson, block, body, opts = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  const teacher = opts.teacher === true;
  const { draft, published, draftLesson } = await assertLive(store, lesson, block);
  const activeKey = keys(lesson, block, '').active;
  let activity = await read(store, activeKey);

  if (teacher && body.action === 'save_backup') {
    const clean = cleanBackupDraft(body.backup);
    if (!clean) reject(400, 'bad_backup', 'A back-up question needs a question, at least two answers and exactly one right answer.');
    // Saved on the draft only: it never goes to students until a back-up round asks it.
    draft.content = { ...draft.content, backup: backupForBlock(block, clean, body.source === 'teacher' ? 'teacher' : 'ann') };
    draftLesson.updated_at = new Date().toISOString();
    await store.setJSON(draftLessonKey(lesson), draftLesson);
  }

  const askRound = body.round === 'backup' ? 'backup' : 'main';
  if (teacher && body.action === 'ask' && askRound === 'backup' && !backupOf(draft)) {
    reject(409, 'no_backup', 'This hinge question has no back-up question yet.');
  }
  const round = teacher && body.action === 'ask' ? askRound : activity?.round === 'backup' ? 'backup' : 'main';
  const s = setup(draft, published, round);

  if (teacher && body.action === 'ask') {
    if (s.options.length < 2 || !s.correct_id) reject(409, 'unfinished', 'Finish the question and mark the right answer, then publish again.');
    const now = Date.now();
    activity = {
      session: randomBytes(16).toString('hex'),
      round,
      open: true,
      revealed: false,
      opened_at: new Date(now).toISOString(),
      closes_at: s.seconds ? new Date(now + s.seconds * 1000).toISOString() : null,
      expires: now + ACTIVITY_HOURS * 3600_000
    };
    await store.setJSON(activeKey, activity);
  }
  if (teacher && body.action === 'finish' && activity) {
    activity = { ...activity, expires: 0 };
    await store.setJSON(activeKey, activity);
  }
  if (!activity || activity.expires < Date.now()) {
    return teacher
      ? { phase: 'idle', stale: s.stale, ready: s.options.length >= 2 && !!s.correct_id, backup: publicBackup(s.backup) }
      : { phase: 'idle' };
  }

  const k = keys(lesson, block, activity.session);
  const rest = ['ask', 'finish', 'save_backup'].includes(body.action) ? { ...body, action: 'status' } : body;
  return teacher ? teacherAction(store, k, activity, s, rest) : studentAction(store, k, activity, s, body);
}

/**
 * What Ann needs to draft a back-up: the main question as the class saw it,
 * the teacher's notes and the votes from the current round. The teacher route
 * starts the job; nothing here calls a model.
 */
export async function hingeBackupInput(store, lesson, block) {
  const { draft, published } = await assertLive(store, lesson, block);
  const s = setup(draft, published, 'main');
  if (s.options.length < 2 || !s.correct_id) reject(409, 'unfinished', 'Finish the question and mark the right answer first.');
  const activity = await read(store, keys(lesson, block, '').active);
  const live = activity && activity.expires >= Date.now() && activity.round !== 'backup';
  const { answered, picks } = live ? await tally(store, keys(lesson, block, activity.session), s.options) : { answered: 0, picks: {} };
  return hingeBackupSource({ prompt: s.prompt, options: s.options, correct_id: s.correct_id, picks, answered });
}
