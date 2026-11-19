/**
 * Lab lessons: a class tests one claim about language on readers.
 *
 * Publish splits the draft. The lines students may see and the Explain block
 * go in the public snapshot. The whole Plan card (supplied texts, the control,
 * the pairs, the debrief notes) is stored at lab/{lesson}/config and reaches a
 * student only through the round, when the step that shows it is open.
 *
 * One live round per lab, paced by the teacher from the board one step at a
 * time (activity-rounds.mjs keeps past rounds and brings one back):
 *
 *   round    { session, step, revealed, started_at, expires }   step is an index into stepsFor(level);
 *                                                                one past the last step means the lab is finished
 *   student  { student_id, pred, reason, notes: { [step]: text }, ratings?, picks?, done: { [step]: true },
 *              writing?: [text per option], flagged?: [bool per option], written_at? }      Students write it
 *   pair     { edit, flagged, edited_at, ready, pred, feature, by, at }                     Pairs design it: any member
 *              saves the pair's edit to the control and the last save wins
 *   held     { status: 'released' | 'removed', at }   the teacher's call on flagged writing; it stands
 *                                                      until the writer changes the writing again
 *
 * Lab notes: when the lab has them on, a step's completing action (lock in a
 * prediction, finish the writing, put a version on the bench, name the
 * feature) is refused until that student's note for the step has words. The
 * note can ride in the same request as the action (`note`). At Question, Test
 * and Result the note is itself what completes the step, so an empty one is
 * refused. With lab notes off none of this applies.
 *
 * Students are known by the class list (class_token + initials claim), as in
 * a tutorial. Results are worked out on read from the students' records with
 * lab-model.mjs, and never leave the server before the Result step, to a
 * student or to the board.
 *
 * Keys are in lab-keys.mjs. No model is called here.
 */
import { randomBytes } from 'node:crypto';
import { LabSettingsSchema, LAB_EXPLAIN_BLOCK_ID, labIssues, publicLab, withExplainBlock } from './lab-schema.mjs';
import { applyEdits, changeLabel, deal, dealLate, describeEdits, hasChange, levelGroups, pairFindings, sanitiseEdit, setResult, stepsFor, tokenise } from './lab-model.mjs';
import { labKeys } from './lab-keys.mjs';
import { isSafeId } from './class-examples.mjs';
import { isDeletedRecord } from './record-liveness.mjs';
import { draftLessonKey, publishedLessonKey } from './teaching-blobs.mjs';
import { loadRoster } from './class-claims.mjs';
import { listBlobKeys, mapBounded } from './blobs-list.mjs';
import { QuizError, deviceHash, read, reject, validToken } from './question-drop.mjs';
import { identify } from './quiz.mjs';
import { flagText } from './peer-feedback-filter.mjs';
import { bringBackRound, listRounds, roundExpiry, saveRound, validSession } from './activity-rounds.mjs';

export { QuizError as LabError };

/**
 * What publish stores for a lab: the config (teacher only), the public
 * snapshot's `lab`, the snapshot's blocks (the Explain block alone) and the
 * draft's blocks with the Explain block in place.
 */
export function prepareLabPublish(draft) {
  const parsed = LabSettingsSchema.safeParse(draft?.lab);
  if (!parsed.success) return { problems: ['Fill in the Lab card before you publish.'], config: null, snapshot: null, blocks: [], draftBlocks: draft?.blocks ?? [] };
  const settings = parsed.data;
  const problems = labIssues(settings);
  if (problems.length > 0) return { problems, config: null, snapshot: null, blocks: [], draftBlocks: draft?.blocks ?? [] };
  // One Explain block, the same in the draft and the snapshot, so marking finds the block the students answered.
  const draftBlocks = withExplainBlock(Array.isArray(draft.blocks) ? draft.blocks : [], settings);
  return {
    problems: [],
    config: { ...settings, version: Date.now().toString(36) },
    snapshot: publicLab(settings),
    blocks: draftBlocks.filter((b) => b.id === LAB_EXPLAIN_BLOCK_ID),
    draftBlocks
  };
}

export async function storeLabConfig(store, lessonId, config) {
  await store.setJSON(labKeys(lessonId).config, config);
}

export { LAB_EXPLAIN_BLOCK_ID };

// ---------------------------------------------------------------------------
// The round
// ---------------------------------------------------------------------------

const MAX_NOTE = 600;
const MAX_REASON = 300;
const MAX_WRITING = 2000;
/** Pick one, Students write it: how many writers each reader gets. */
const WRITERS_EACH = 6;
/** Pairs design it: each reader rates two controls and up to four other pairs' versions. */
const VERSIONS_EACH = 4;
const CONTROLS_EACH = 2;
const clean = (text, max) => (typeof text === 'string' ? text.trim().slice(0, max) : '');
const list = (value) => (Array.isArray(value) ? value : []);
const ownerOf = (classId, studentId) => deviceHash(`student:${classId}:${studentId}`);
const freshRound = () => ({ session: randomBytes(16).toString('hex'), step: 0, revealed: false, started_at: new Date().toISOString(), expires: roundExpiry() });
const emptyRecord = (studentId) => ({ student_id: studentId, pred: null, reason: '', notes: {}, done: {} });

async function loadLab(store, lessonId) {
  if (!isSafeId(lessonId)) reject(404, 'not_found', 'Lab not found.');
  const k = labKeys(lessonId);
  const [lesson, draft, config] = await Promise.all([read(store, publishedLessonKey(lessonId)), read(store, draftLessonKey(lessonId)), read(store, k.config)]);
  if (!lesson || !draft || isDeletedRecord(draft)) reject(404, 'not_found', 'Lab not found.');
  if (lesson.pedagogical_mode !== 'lab' || !config) reject(409, 'not_lab', 'This lesson isn’t a lab.');
  return { k, config, steps: stepsFor(config.level) };
}

/** The round as anyone may see it. Null when there is none, or it has gone idle. */
function roundView(round, steps) {
  if (!round || round.expires < Date.now()) return null;
  const step = Math.max(0, Math.min(steps.length, Number(round.step) || 0));
  return { session: round.session, step, step_name: steps[step] ?? null, steps, revealed: round.revealed === true, finished: step >= steps.length };
}

const stepAt = (steps, round, name) => steps[round.step] === name;
/** True once the round has reached this step (or passed it, or finished). */
const reached = (steps, round, name) => steps.includes(name) && round.step >= steps.indexOf(name);

/** Every student's record in the round, as [owner, record]. */
async function allRecords(store, k, session) {
  const prefix = k.students(session);
  const keys = await listBlobKeys(store, prefix);
  const rows = await mapBounded(keys, 8, async (key) => [key.slice(prefix.length), await read(store, key)]);
  return rows.filter(([, record]) => record && typeof record.student_id === 'string');
}

// ---------------------------------------------------------------------------
// Students write it: whose writing readers get
// ---------------------------------------------------------------------------

const optionCount = (config) => list(config.options).length;
const writingOf = (config, record) => Array.from({ length: optionCount(config) }, (_, i) => (typeof record?.writing?.[i] === 'string' ? record.writing[i] : ''));
const writingComplete = (config, record) => optionCount(config) > 0 && writingOf(config, record).every((text) => text.trim());

/** The teacher's calls on held work in this round, by owner. */
async function heldDecisions(store, k, session) {
  const prefix = k.helds(session);
  const keys = await listBlobKeys(store, prefix);
  const rows = await mapBounded(keys, 8, async (key) => [key.slice(prefix.length), await read(store, key)]);
  return new Map(rows.filter(([, d]) => d && (d.status === 'released' || d.status === 'removed')));
}

/** The teacher's call on this work, while it still applies: changing the work after the call sets it aside. */
const decisionFor = (decisions, owner, changedAt) => {
  const d = decisions.get(owner);
  return d && (!changedAt || String(d.at) >= String(changedAt)) ? d.status : null;
};

/** 'in' the reading, 'held' for the teacher, 'removed' by the teacher, or 'unfinished'. */
function writerState(config, record, decision) {
  if (!writingComplete(config, record)) return 'unfinished';
  if (decision === 'removed') return 'removed';
  if (list(record.flagged).some(Boolean) && decision !== 'released') return 'held';
  return 'in';
}

/** Per writer: how often each of their versions was chosen, and by how many readers. */
function writerTallies(config, records, lists) {
  const tallies = new Map();
  for (const [, record] of records) {
    list(lists[record.student_id]).forEach((item, i) => {
      const pick = record.picks?.[i];
      if (item.kind !== 'writer' || !Number.isInteger(pick) || pick < 0 || pick >= optionCount(config)) return;
      const t = tallies.get(item.writer) ?? { chosen: Array.from({ length: optionCount(config) }, () => 0), readers: 0 };
      t.chosen[pick] += 1;
      t.readers += 1;
      tallies.set(item.writer, t);
    });
  }
  return tallies;
}

// ---------------------------------------------------------------------------
// Pairs design it: the pairs, their versions, and what readers made of them
// ---------------------------------------------------------------------------

const controlTokens = (config) => tokenise(config.control ?? '');
const pairOfStudent = (config, studentId) => list(config.pairs).find((p) => list(p.students).includes(studentId)) ?? null;
/** A pair's key among the held work, apart from any student's. */
const pairHeldOwner = (pairId) => `pair.${pairId}`;

/** Every pair's record in the round, by pair id. A pair that has saved nothing is absent. */
async function allPairs(store, k, config, session) {
  const rows = await mapBounded(list(config.pairs), 8, async (pair) => [pair.id, await read(store, k.pair(session, pair.id))]);
  return new Map(rows.filter(([, record]) => record));
}

/** 'in' the reading, 'held' for the teacher (a flagged word), 'removed' by the teacher, or 'none' when nothing is changed. */
function pairState(tokens, record, decision) {
  if (!record || !hasChange(tokens, record.edit)) return 'none';
  if (decision === 'removed') return 'removed';
  if (record.flagged && decision !== 'released') return 'held';
  return 'in';
}
/** The pair has a trial as far as its own members can tell: a held version looks the same to them as one in the reading. */
const hasTrial = (state) => state === 'in' || state === 'held';

/**
 * What the class's trials found, worked out from every reader's ratings.
 * Each trial carries its pair id, its edit and its ratings (sorted, so a
 * rating can't be traced to a reader); callers cut that down for students.
 */
export async function labFindings(store, k, config, session) {
  const tokens = controlTokens(config);
  const [records, { lists }, pairs, decisions] = await Promise.all([allRecords(store, k, session), allLists(store, k, session), allPairs(store, k, config, session), heldDecisions(store, k, session)]);
  const control = [];
  const byPair = new Map();
  for (const [, record] of records) {
    list(lists[record.student_id]).forEach((item, i) => {
      const value = record.ratings?.[i];
      if (!Number.isFinite(value)) return;
      if (item.kind === 'control') control.push(value);
      if (item.kind === 'version') byPair.set(item.pair, [...(byPair.get(item.pair) ?? []), value]);
    });
  }
  const sorted = (values) => [...values].sort((a, b) => a - b);
  const inTrial = list(config.pairs).filter((p) => pairState(tokens, pairs.get(p.id), decisionFor(decisions, pairHeldOwner(p.id), pairs.get(p.id)?.edited_at)) === 'in');
  const found = pairFindings({
    tokens,
    threshold: config.threshold,
    control,
    trials: inTrial.map((p) => {
      const record = pairs.get(p.id);
      return { id: p.id, edit: record.edit, ratings: sorted(byPair.get(p.id) ?? []), pred: [-1, 0, 1].includes(record.pred) ? record.pred : null, feature: Number.isInteger(record.feature) ? record.feature : null };
    })
  });
  return {
    control: { ...found.control, ratings: sorted(control) },
    threshold: config.threshold,
    trials: found.trials.map((t) => ({ ...t, pair: t.id, number: list(config.pairs).findIndex((p) => p.id === t.id) + 1, edit: pairs.get(t.id).edit, ratings: sorted(byPair.get(t.id) ?? []) }))
  };
}

/** The findings as a student may have them: every trial by its change alone, and their own pair's in full. */
function findingsForStudent(findings, pairId) {
  const mine = findings.trials.find((t) => t.pair === pairId) ?? null;
  const open = (t) => ({ desc: t.desc, shift: t.shift, n: t.n, verdict: t.verdict, thin: t.thin, mine: t.pair === pairId });
  return {
    control: findings.control,
    threshold: findings.threshold,
    trials: findings.trials.map(open),
    mine: mine ? { ...open(mine), edit: mine.edit, ratings: mine.ratings, mean: mine.mean, pred: mine.pred, held: mine.held } : null
  };
}

// ---------------------------------------------------------------------------
// Who reads what
// ---------------------------------------------------------------------------

/**
 * What the deal is made from, without the readers. Students write it deals
 * the writers whose every version is written and is not held; Pairs design it
 * deals the pairs with a change on the bench that is not held. A pair with no
 * change has no trial, and its members read like anyone else.
 */
async function dealPool(store, k, config, session) {
  if (config.level === 'supplied') {
    return config.judge === 'rate' ? { kind: 'split', versions: optionCount(config) } : { kind: 'set', options: optionCount(config) };
  }
  if (config.level === 'students') {
    const [records, decisions] = await Promise.all([allRecords(store, k, session), heldDecisions(store, k, session)]);
    const writers = records.filter(([owner, r]) => writerState(config, r, decisionFor(decisions, owner, r.written_at)) === 'in').map(([, r]) => r.student_id).sort();
    return { kind: 'writers', writers, options: optionCount(config), per: WRITERS_EACH };
  }
  if (config.level === 'pairs') {
    const tokens = controlTokens(config);
    const [pairs, decisions] = await Promise.all([allPairs(store, k, config, session), heldDecisions(store, k, session)]);
    const versions = list(config.pairs).filter((p) => pairState(tokens, pairs.get(p.id), decisionFor(decisions, pairHeldOwner(p.id), pairs.get(p.id)?.edited_at)) === 'in').map((p) => p.id);
    // Every member of every pair, here or not, so a reader who joins late is still kept from their own pair's version.
    const pairOf = Object.fromEntries(list(config.pairs).flatMap((p) => list(p.students).map((s) => [s, p.id])));
    return { kind: 'pairs', pairOf, versions, per: VERSIONS_EACH, controls: CONTROLS_EACH };
  }
  return null;
}

/** The reading lists, written once (create-only) from the students who have a record when the teacher moves to Test. */
async function writeDeal(store, k, config, round) {
  const records = await allRecords(store, k, round.session);
  const students = records.map(([, r]) => r.student_id).sort();
  const pool = await dealPool(store, k, config, round.session);
  if (!pool) return;
  // The pool is kept with the deal, so a reader who joins later is dealt from the same writing.
  await store.setJSON(k.deal(round.session), { seed: round.session, students, pool, lists: deal({ ...pool, students }, round.session), at: new Date().toISOString() }, { onlyIfNew: true });
}

/** Every reader's list: the deal, then anyone who joined after it. */
async function allLists(store, k, session) {
  const dealt = await read(store, k.deal(session));
  const lists = { ...(dealt?.lists ?? {}) };
  const prefix = k.lates(session);
  for (const key of await listBlobKeys(store, prefix)) {
    const late = await read(store, key);
    if (late && typeof late.student_id === 'string' && Array.isArray(late.items)) lists[late.student_id] = late.items;
  }
  return { dealt, lists };
}

/** This student's reading list. A student who joined after the deal gets one on first ask, kept create-only. */
async function listFor(store, k, config, round, studentId, owner) {
  const { dealt, lists } = await allLists(store, k, round.session);
  if (lists[studentId]) return lists[studentId];
  if (!dealt) return null;
  const pool = dealt.pool ?? (await dealPool(store, k, config, round.session));
  if (!pool) return null;
  const items = dealLate({ ...pool, students: list(dealt.students) }, lists, studentId, dealt.seed ?? round.session);
  const written = await store.setJSON(k.late(round.session, owner), { student_id: studentId, items, at: new Date().toISOString() }, { onlyIfNew: true });
  if (written?.modified === false) return (await read(store, k.late(round.session, owner)))?.items ?? items;
  return items;
}

/** A reading item as a reader may see it: the words, never which option they are or who wrote them. */
async function itemView(store, k, config, session, item) {
  if (item.kind === 'text') return { kind: 'text', text: list(config.texts)[item.version] ?? '' };
  if (item.kind === 'set') return { kind: 'set', pieces: list(item.order).map((i) => list(config.texts)[i] ?? '') };
  if (item.kind === 'writer') {
    const writer = await read(store, k.student(session, ownerOf(config.class_id, item.writer)));
    const writing = writingOf(config, writer);
    return { kind: 'set', pieces: list(item.order).map((i) => writing[i] ?? '') };
  }
  // The control and a pair's version look the same to a reader: lines, with no marks.
  if (item.kind === 'control') return { kind: 'lines', lines: applyEdits(controlTokens(config), {}).lines };
  if (item.kind === 'version') return { kind: 'lines', lines: applyEdits(controlTokens(config), (await read(store, k.pair(session, item.pair)))?.edit ?? {}).lines };
  return null;
}

/** Items a reader rates on the line; the others (a set, a writer's versions) are picked from. */
const isRated = (item) => item.kind === 'text' || item.kind === 'control' || item.kind === 'version';
const answered = (record, item, i) => Number.isFinite(isRated(item) ? record.ratings?.[i] : record.picks?.[i]);

/** The class result for the two supplied levels, from every record and reading list. */
async function classResult(store, k, config, round) {
  const records = await allRecords(store, k, round.session);
  const { lists } = await allLists(store, k, round.session);
  const options = optionCount(config);
  const picks = Array.from({ length: options }, () => 0);
  const ratings = Array.from({ length: options }, () => []);
  const predictions = Array.from({ length: options }, () => 0);
  let readers = 0;
  for (const [, record] of records) {
    if (Number.isInteger(record.pred) && record.pred >= 0 && record.pred < options) predictions[record.pred] += 1;
    let read1 = false;
    list(lists[record.student_id]).forEach((item, i) => {
      if (item.kind === 'text' && Number.isFinite(record.ratings?.[i]) && ratings[item.version]) {
        ratings[item.version].push(record.ratings[i]);
        read1 = true;
      }
      if ((item.kind === 'set' || item.kind === 'writer') && Number.isInteger(record.picks?.[i]) && picks[record.picks[i]] !== undefined) {
        picks[record.picks[i]] += 1;
        read1 = true;
      }
    });
    if (read1) readers += 1;
  }
  return setResult({ judge: config.judge, options, picks, ratings, predictions, readers, threshold: config.threshold });
}

/** The class result for the two supplied levels. Pairs design it has findings instead (labFindings). */
const resultsFor = async (store, k, config, steps, round) =>
  config.level !== 'pairs' && reached(steps, round, 'Result') ? classResult(store, k, config, round) : null;

// ---------------------------------------------------------------------------
// Student side
// ---------------------------------------------------------------------------

const STUDENT_ACTIONS = ['status', 'claim', 'predict', 'note', 'write', 'bench', 'ready', 'pair_predict', 'feature', 'rate', 'pick', 'explain'];

export async function labAction(store, lessonId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  const action = body.action ?? 'status';
  if (!STUDENT_ACTIONS.includes(action)) reject(400, 'bad_action', 'Unknown action.');
  const { k, config, steps } = await loadLab(store, lessonId);
  let who;
  try {
    who = await identify(store, body, action);
  } catch (e) {
    if (e instanceof QuizError && e.code === 'need_class') reject(e.status, 'need_class', 'Open this lab from your class page.');
    throw e;
  }
  if (who.need === 'class') reject(403, 'need_class', 'Open this lab from your class page.');
  const identity = { need: who.need, initials: who.student?.initials ?? null };
  const active = await read(store, k.active);
  const round = roundView(active, steps);
  const empty = { identity, round, me: null, pair: null, control: null, reading: null, results: null, findings: null };
  const asking = action === 'status' || action === 'claim';
  if (who.need === 'initials') {
    if (!asking) reject(403, 'need_initials', 'Type your initials first.');
    return { ...empty, round: null };
  }
  if (!who.student) {
    if (asking) return { ...empty, round: null, anonymous: true };
    reject(403, 'no_list', 'Your teacher hasn’t added a class list yet.');
  }
  // A lab belongs to the one class it was planned for.
  if (config.class_id && config.class_id !== who.classId) {
    if (asking) return { ...empty, round: null, not_for_you: true };
    reject(403, 'not_for_you', 'This lab is for another class.');
  }
  if (!validToken(body.class_token)) reject(400, 'no_device', 'This browser can’t remember you. Use your usual browser.');
  if (!round) {
    if (asking) return empty;
    reject(409, 'no_round', 'Your teacher hasn’t started the lab yet.');
  }
  // A device still holding an earlier round's session is told, so it starts again on the new one.
  if (body.session && body.session !== round.session) reject(409, 'new_session', 'Your teacher started the lab again. Your screen will catch up.');

  const owner = ownerOf(who.classId, who.student.id);
  const key = k.student(round.session, owner);
  let record = await read(store, key);
  if (!record) {
    // Joining is the first look at a live round; a late joiner enters at the current step.
    record = { ...emptyRecord(who.student.id), class_id: who.classId, joined_at: new Date().toISOString() };
    await store.setJSON(key, record);
  }
  const save = async (change) => {
    record = { ...record, ...change, at: new Date().toISOString() };
    await store.setJSON(key, record);
  };
  const wrongStep = () => reject(409, 'wrong_step', 'The class has moved on. Your screen will catch up.');
  const during = (name) => {
    if (round.finished || !stepAt(steps, round, name)) wrongStep();
  };
  const only = (level) => {
    if (config.level !== level) reject(400, 'bad_action', 'Unknown action.');
  };
  const notesOn = config.notes_on === true;
  /** The record's notes with the note that came with this action (if it has words) in place. */
  const withNote = (step) => {
    const sent = clean(body.note, MAX_NOTE);
    return sent ? { ...record.notes, [step]: sent } : { ...record.notes };
  };
  /** Lab notes on: the step's completing action waits for this student's note. */
  const needNote = (step) => {
    if (notesOn && !clean(withNote(step)[step], MAX_NOTE)) reject(400, 'need_note', 'Write your lab note to carry on.');
  };
  /** A note sent with a pair's action is the sender's own: it is kept on their record. */
  const keepNote = async (step) => {
    if (clean(body.note, MAX_NOTE)) await save({ notes: withNote(step), done: { ...record.done, [step]: true } });
    else await save({ done: { ...record.done, [step]: true } });
  };

  if (action === 'predict') {
    // Pairs design it predicts as a pair (pair_predict).
    if (config.level === 'pairs') reject(400, 'bad_action', 'Unknown action.');
    during('Predict');
    if (record.pred !== null && record.pred !== undefined) reject(409, 'locked', 'Your prediction is locked in.');
    const pred = Number(body.pred);
    if (!Number.isInteger(pred) || pred < 0 || pred >= optionCount(config)) reject(400, 'bad_pred', 'Choose one of the options.');
    needNote('Predict');
    await save({ pred, reason: clean(body.reason, MAX_REASON), notes: withNote('Predict'), done: { ...record.done, Predict: true } });
  }
  if (action === 'note') {
    const at = steps.indexOf(body.step);
    if (at < 0 || round.finished || at > round.step) wrongStep();
    const text = clean(body.text, MAX_NOTE);
    if (notesOn && !text) reject(400, 'need_note', 'Write your lab note to carry on.');
    const done = { ...record.done };
    // At Question and Result the note is what finishes the step; at Test it finishes it once every text is judged.
    if (notesOn && (body.step === 'Question' || body.step === 'Result')) done[body.step] = true;
    if (notesOn && body.step === 'Test' && reached(steps, round, 'Test')) {
      const items = (await listFor(store, k, config, round, who.student.id, owner)) ?? [];
      if (items.length && items.every((it, i) => answered(record, it, i))) done.Test = true;
    }
    await save({ notes: { ...record.notes, [body.step]: text }, done });
  }
  if (action === 'write') {
    // One version per option, written or written over until the teacher closes Make.
    only('students');
    during('Make');
    const option = Number(body.option);
    if (!Number.isInteger(option) || option < 0 || option >= optionCount(config)) reject(400, 'bad_option', 'That option isn’t in this lab.');
    const text = clean(body.text, MAX_WRITING);
    if (!text) reject(400, 'empty', 'Write your version first.');
    const writing = writingOf(config, record);
    writing[option] = text;
    // The write that finishes the set is the step's completing action.
    if (writing.every((t) => t.trim())) needNote('Make');
    const now = new Date().toISOString();
    // Flagged writing still saves; it waits for the teacher before any reader gets it.
    await save({ writing, flagged: writing.map((t) => flagText(t)), written_at: now, notes: withNote('Make'), done: { ...record.done, Make: writing.every((t) => t.trim()) } });
  }

  // Pairs design it: the version, its place on the bench and the prediction are the pair's. Any member acts for the pair.
  const pair = config.level === 'pairs' ? pairOfStudent(config, who.student.id) : null;
  const tokens = config.level === 'pairs' ? controlTokens(config) : [];
  let pairRecord = pair ? await read(store, k.pair(round.session, pair.id)) : null;
  const savePair = async (change) => {
    pairRecord = { edit: {}, flagged: false, ready: false, pred: null, feature: null, ...pairRecord, ...change, by: who.student.id, at: new Date().toISOString() };
    await store.setJSON(k.pair(round.session, pair.id), pairRecord);
  };
  const needPair = () => {
    only('pairs');
    if (!pair) reject(403, 'no_pair', 'You are a reader in this lab. Ask your teacher to add you to a pair.');
  };
  const pairStateNow = async () => (pair ? pairState(tokens, pairRecord, decisionFor(await heldDecisions(store, k, round.session), pairHeldOwner(pair.id), pairRecord?.edited_at)) : 'none');
  if (action === 'bench') {
    // The last save wins, whichever partner made it.
    needPair();
    during('Design');
    if (pairRecord?.ready) reject(409, 'locked', 'Your version is on the bench. Take it off to change it.');
    const edit = sanitiseEdit(tokens, body.edit);
    const words = Object.values(edit.rep ?? {});
    // A replaced word is the one thing a pair types that readers see, so it goes through the filter.
    await savePair({ edit, flagged: words.some((w) => flagText(w)) || flagText(words.join(' ')), edited_at: new Date().toISOString() });
  }
  if (action === 'ready') {
    needPair();
    during('Design');
    const on = body.on !== false;
    if (on && !hasChange(tokens, pairRecord?.edit)) reject(400, 'no_change', 'Change one thing first.');
    if (on) needNote('Design');
    await savePair({ ready: on });
    if (on) await keepNote('Design');
  }
  if (action === 'pair_predict') {
    needPair();
    during('Predict');
    if (!hasTrial(await pairStateNow())) reject(409, 'no_trial', 'Your pair has no version on the bench.');
    if (pairRecord.pred === -1 || pairRecord.pred === 0 || pairRecord.pred === 1) reject(409, 'locked', 'Your pair’s prediction is locked in.');
    const pred = Number(body.pred);
    if (![-1, 0, 1].includes(pred)) reject(400, 'bad_pred', 'Choose lower, about the same or higher.');
    needNote('Predict');
    await savePair({ pred });
    await keepNote('Predict');
  }
  if (action === 'feature') {
    // The pair names the feature it changed, from the lab's list. Either partner can; the last choice stands.
    needPair();
    during('Name it');
    if (!hasTrial(await pairStateNow())) reject(409, 'no_trial', 'Your pair has no version on the bench.');
    const feature = Number(body.feature);
    if (!Number.isInteger(feature) || feature < 0 || feature >= list(config.features).length) reject(400, 'bad_feature', 'Choose a feature from the list.');
    needNote('Name it');
    await savePair({ feature });
    await keepNote('Name it');
  }
  /** With lab notes on, the Test step is finished once the reader has also written its note. */
  const testNoted = () => !notesOn || !!clean(record.notes?.Test, MAX_NOTE);
  if (action === 'rate' || action === 'pick') {
    during('Test');
    const items = (await listFor(store, k, config, round, who.student.id, owner)) ?? [];
    const index = Number(body.item);
    const item = Number.isInteger(index) ? items[index] : undefined;
    if (!item) reject(400, 'bad_item', 'That text has changed. Your screen will catch up.');
    if (answered(record, item, index)) reject(409, 'locked', 'You’ve already sent that one.');
    if (action === 'rate') {
      const value = Number(body.value);
      if (!isRated(item)) reject(400, 'bad_item', 'This one is chosen, not rated.');
      if (!Number.isInteger(value) || value < 0 || value > 10) reject(400, 'bad_value', 'Rate it from 0 to 10.');
      const ratings = [...list(record.ratings)];
      ratings[index] = value;
      await save({ ratings, done: { ...record.done, ...(items.every((it, i) => i === index || answered(record, it, i)) && testNoted() ? { Test: true } : {}) } });
    } else {
      const order = item.kind === 'set' || item.kind === 'writer' ? list(item.order) : null;
      const choice = Number(body.choice);
      if (!order) reject(400, 'bad_item', 'This one is rated, not chosen.');
      if (!Number.isInteger(choice) || choice < 0 || choice >= order.length) reject(400, 'bad_choice', 'Choose one of them.');
      // The reader sends a position; which option sat there never leaves the server.
      const picks = [...list(record.picks)];
      picks[index] = order[choice];
      await save({ picks, done: { ...record.done, ...(items.every((it, i) => i === index || answered(record, it, i)) && testNoted() ? { Test: true } : {}) } });
    }
  }
  if (action === 'explain') {
    during('Explain');
    await save({ done: { ...record.done, Explain: true } });
  }

  // What this student may see now.
  const me = { pred: record.pred ?? null, reason: record.reason ?? '', notes: record.notes ?? {}, done: record.done ?? {} };
  if (config.level === 'students') me.writing = writingOf(config, record);
  let reading = null;
  if (reached(steps, round, 'Test')) {
    const items = (await listFor(store, k, config, round, who.student.id, owner)) ?? [];
    const next = items.findIndex((item, i) => !answered(record, item, i));
    if (!round.finished && stepAt(steps, round, 'Test') && items.length) {
      reading = { index: next < 0 ? items.length : next, total: items.length, item: next < 0 ? null : await itemView(store, k, config, round.session, items[next]) };
    }
    if (reached(steps, round, 'Result')) {
      // Once the result is out a reader may know which version they had.
      me.read = items.flatMap((item, i) => (item.kind === 'text' && Number.isFinite(record.ratings?.[i]) ? [{ version: item.version, value: record.ratings[i] }]
        : item.kind === 'set' && Number.isInteger(record.picks?.[i]) ? [{ version: record.picks[i], value: null }] : []));
      if (config.level === 'students') {
        // How the student's own writing went: how often readers chose each of their versions.
        const [records, { lists }] = await Promise.all([allRecords(store, k, round.session), allLists(store, k, round.session)]);
        const mine = writerTallies(config, records, lists).get(who.student.id);
        if (mine) me.own = mine;
      }
    }
  }
  const pairView = pair
    ? { edit: pairRecord?.edit ?? {}, ready: pairRecord?.ready === true, pred: [-1, 0, 1].includes(pairRecord?.pred) ? pairRecord.pred : null, feature: Number.isInteger(pairRecord?.feature) ? pairRecord.feature : null, trial: hasTrial(await pairStateNow()) }
    : null;
  const findings = config.level === 'pairs' && reached(steps, round, 'Result') ? findingsForStudent(await labFindings(store, k, config, round.session), pair?.id ?? null) : null;
  return {
    identity, round, me, pair: pairView,
    // The control reaches a student through the round: it is on the Question screen.
    control: config.level === 'pairs' ? config.control ?? '' : null,
    reading, results: await resultsFor(store, k, config, steps, round), findings
  };
}

// ---------------------------------------------------------------------------
// Teacher side: the board
// ---------------------------------------------------------------------------

/** A held piece's owner: a student's record key, or `pair.{pairId}` for a pair's version. */
const HELD_OWNER = /^(?:[a-f0-9]{24}|pair\.[a-z0-9_-]{1,40})$/;
const TEACHER_ACTIONS = ['board', 'start', 'next', 'reveal', 'rounds', 'resume', 'end', 'release', 'remove', 'student'];

/** Flagged work waiting for the teacher: who (initials, for the teacher only) and the words. */
async function heldWork(store, k, config, round, roster, records) {
  if (config.level === 'supplied') return [];
  const decisions = await heldDecisions(store, k, round.session);
  const initials = new Map(list(roster?.students).map((s) => [s.id, s.initials ?? '']));
  if (config.level === 'pairs') {
    const tokens = controlTokens(config);
    const pairs = await allPairs(store, k, config, round.session);
    return list(config.pairs)
      .filter((p) => pairState(tokens, pairs.get(p.id), decisionFor(decisions, pairHeldOwner(p.id), pairs.get(p.id)?.edited_at)) === 'held')
      .map((p) => ({
        owner: pairHeldOwner(p.id),
        initials: list(p.students).map((s) => initials.get(s) ?? '').filter(Boolean).join(', '),
        pieces: [{ label: 'Their change', text: changeLabel(describeEdits(tokens, pairs.get(p.id).edit)), flagged: true }]
      }));
  }
  return records
    .filter(([owner, r]) => writerState(config, r, decisionFor(decisions, owner, r.written_at)) === 'held')
    .map(([owner, r]) => ({
      owner,
      initials: initials.get(r.student_id) ?? '',
      pieces: writingOf(config, r).map((text, i) => ({ label: list(config.options)[i] ?? '', text, flagged: r.flagged?.[i] === true }))
    }))
    .sort((a, b) => a.initials.localeCompare(b.initials));
}

/** The one piece readers chose most, with no name on it. Null until a choice is in. */
function mostChosen(config, records, lists) {
  let best = null;
  for (const [writer, t] of [...writerTallies(config, records, lists)].sort(([a], [b]) => a.localeCompare(b))) {
    t.chosen.forEach((chosen, option) => {
      if (chosen > 0 && (!best || chosen > best.chosen || (chosen === best.chosen && t.readers < best.readers))) best = { writer, option, chosen, readers: t.readers };
    });
  }
  if (!best) return null;
  const record = records.find(([, r]) => r.student_id === best.writer)?.[1];
  return { text: writingOf(config, record)[best.option] ?? '', option: best.option, chosen: best.chosen, readers: best.readers };
}

async function board(store, k, config, steps, active) {
  const round = roundView(active, steps);
  const roster = config.class_id ? await loadRoster(store, config.class_id) : null;
  const total = list(roster?.students).length;
  const base = { round, level: config.level, judge: config.judge, counts: { here: 0, done: 0, total }, predictions: null, results: null, texts: null, debrief: null, held: [], best: null, pairs: null, findings: null, levels: null };
  if (!round) return base;
  const owned = await allRecords(store, k, round.session);
  const records = owned.map(([, r]) => r);
  const name = round.step_name;
  const done = name === 'Predict' ? records.filter((r) => r.pred !== null && r.pred !== undefined).length
    : name === 'Question' || name === 'Result' || !name ? records.length
      : records.filter((r) => r.done?.[name]).length;
  const options = optionCount(config);
  const showPredictions = (name === 'Predict' && round.revealed) || reached(steps, round, 'Result');
  const results = await resultsFor(store, k, config, steps, round);
  let pairCounts = null;
  let pairPredictions = null;
  let findings = null;
  let levels = null;
  if (config.level === 'pairs') {
    const tokens = controlTokens(config);
    const [pairs, decisions] = await Promise.all([allPairs(store, k, config, round.session), heldDecisions(store, k, round.session)]);
    const withTrial = list(config.pairs).filter((p) => hasTrial(pairState(tokens, pairs.get(p.id), decisionFor(decisions, pairHeldOwner(p.id), pairs.get(p.id)?.edited_at))));
    const preds = withTrial.map((p) => pairs.get(p.id).pred).filter((v) => v === -1 || v === 0 || v === 1);
    // How the pairs are going: on the bench at Design, locked in at Predict.
    pairCounts = {
      total: list(config.pairs).length, changed: withTrial.length, ready: withTrial.filter((p) => pairs.get(p.id).ready === true).length, predicted: preds.length,
      named: withTrial.filter((p) => Number.isInteger(pairs.get(p.id).feature)).length
    };
    // Lower, about the same, higher.
    pairPredictions = [-1, 0, 1].map((v) => preds.filter((x) => x === v).length);
    if (reached(steps, round, 'Result')) {
      const found = await labFindings(store, k, config, round.session);
      const initials = new Map(list(roster?.students).map((s) => [s.id, s.initials ?? '']));
      const members = new Map(list(config.pairs).map((p) => [p.id, list(p.students).map((s) => initials.get(s) ?? '').filter(Boolean)]));
      // The teacher sees who is in each pair; nothing a student is sent carries this.
      findings = { ...found, trials: found.trials.map((t) => ({ ...t, initials: members.get(t.pair) ?? [] })) };
      // From Name it: the trials regrouped by level of language. A trial with too few readers is left out.
      if (reached(steps, round, 'Name it')) levels = levelGroups(found.trials.map((t) => ({ feature: t.feature, shift: t.shift, readers: t.n })), list(config.features));
    }
  }
  return {
    ...base,
    counts: { here: records.length, done, total },
    predictions: !showPredictions ? null : config.level === 'pairs' ? pairPredictions : Array.from({ length: options }, (_, i) => records.filter((r) => r.pred === i).length),
    pairs: pairCounts,
    findings,
    levels,
    results,
    // The versions side by side, once nobody is still reading one blind.
    texts: config.level === 'supplied' && results ? list(config.texts) : null,
    explained: records.filter((r) => r.done?.Explain).length,
    debrief: round.finished || round.step === steps.length - 1 ? config.debrief ?? '' : null,
    held: await heldWork(store, k, config, round, roster, owned),
    best: config.level === 'students' && results ? mostChosen(config, owned, (await allLists(store, k, round.session)).lists) : null
  };
}

export async function labTeacherAction(store, lessonId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  const action = body.action ?? 'board';
  if (!TEACHER_ACTIONS.includes(action)) reject(400, 'bad_action', 'Unknown action.');
  const { k, config, steps } = await loadLab(store, lessonId);
  let active = await read(store, k.active);

  if (action === 'rounds') return { rounds: await listRounds(store, k.base, active, 'students') };
  if (action === 'start') {
    active = freshRound();
    await saveRound(store, k.base, active);
    return board(store, k, config, steps, active);
  }
  if (action === 'resume') {
    active = await bringBackRound(store, k.base, body.session, active, (session) => ({ ...freshRound(), session }));
    if (!active) reject(404, 'no_round', 'That round has nothing saved.');
    return board(store, k, config, steps, active);
  }
  if (action === 'board') return board(store, k, config, steps, active);

  if (action === 'student') {
    // One student's record, for marking their explanation beside their notes and their trial. Marking often
    // happens after the round has gone idle, so this reads the lab's latest round whether or not it is live.
    if (typeof body.student_id !== 'string' || !config.class_id) reject(400, 'bad_student', 'That student isn’t on this class list.');
    // What the marking view needs to put the record in words; nothing here is teacher-only.
    const lab = { level: config.level, judge: config.judge, notes_on: config.notes_on === true, steps, options: list(config.options), features: list(config.features), trait: config.trait ?? '' };
    const out = { student_id: body.student_id, lab, record: null, items: [], pair: null, trial: null };
    if (!active || !validSession(active.session)) return out;
    const owner = ownerOf(config.class_id, body.student_id);
    out.record = (await read(store, k.student(active.session, owner))) ?? null;
    out.items = (await allLists(store, k, active.session)).lists[body.student_id] ?? [];
    const pair = config.level === 'pairs' ? pairOfStudent(config, body.student_id) : null;
    if (pair) {
      // The pair's version and, once the readings are in, its trial.
      const pairRecord = await read(store, k.pair(active.session, pair.id));
      out.pair = { id: pair.id, students: list(pair.students), record: pairRecord ?? null, change: pairRecord ? describeEdits(controlTokens(config), pairRecord.edit) : [] };
      if (reached(steps, active, 'Result')) out.trial = (await labFindings(store, k, config, active.session)).trials.find((t) => t.pair === pair.id) ?? null;
    }
    return out;
  }

  const live = active && active.expires >= Date.now();
  if (!live) reject(409, 'no_round', 'Start the lab first.');
  // The board in another tab may be a round behind.
  if (validSession(body.session) && body.session !== active.session) reject(409, 'new_session', 'The lab was started again in another tab. This board will catch up.');

  if (action === 'end') {
    active = { ...active, expires: 0 };
    await saveRound(store, k.base, active);
  }
  if (action === 'next') {
    const to = Number(body.step);
    // The board names the step it is moving to, so a double press moves once.
    if (!Number.isInteger(to) || to > steps.length || to > active.step + 1) reject(400, 'bad_step', 'That step isn’t next.');
    if (to === active.step + 1) {
      active = { ...active, step: to, revealed: false };
      if (steps[to] === 'Test') await writeDeal(store, k, config, active);
      await saveRound(store, k.base, active);
    }
  }
  if (action === 'reveal') {
    active = { ...active, revealed: body.on !== false };
    await saveRound(store, k.base, active);
  }
  if (action === 'release' || action === 'remove') {
    // Flagged work held for the teacher: released, it joins the reading when the teacher moves to Test; removed, it stays out.
    if (!HELD_OWNER.test(body.owner ?? '')) reject(400, 'bad_id', 'That piece wasn’t found.');
    await store.setJSON(k.held(active.session, body.owner), { status: action === 'release' ? 'released' : 'removed', at: new Date().toISOString() });
  }
  return board(store, k, config, steps, active);
}
