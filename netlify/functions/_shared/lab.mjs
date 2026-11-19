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
 *   student  { student_id, pred, reason, notes: { [step]: text }, ratings?, picks?, done: { [step]: true } }
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
import { deal, dealLate, setResult, stepsFor } from './lab-model.mjs';
import { labKeys } from './lab-keys.mjs';
import { isSafeId } from './class-examples.mjs';
import { isDeletedRecord } from './record-liveness.mjs';
import { draftLessonKey, publishedLessonKey } from './teaching-blobs.mjs';
import { loadRoster } from './class-claims.mjs';
import { listBlobKeys, mapBounded } from './blobs-list.mjs';
import { QuizError, deviceHash, read, reject, validToken } from './question-drop.mjs';
import { identify } from './quiz.mjs';
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

/**
 * What the deal is made from, for this lab. Null when the level has no deal
 * yet: Students write it (Task 3: writers with released writing) and Pairs
 * design it (Task 4: pairs with a change on the bench) add their cases here.
 */
function dealInput(config, studentIds) {
  if (config.level === 'supplied') {
    const options = list(config.options).length;
    return config.judge === 'rate' ? { kind: 'split', students: studentIds, versions: options } : { kind: 'set', students: studentIds, options };
  }
  return null;
}

/** The reading lists, written once (create-only) from the students who have a record when the teacher moves to Test. */
async function writeDeal(store, k, config, round) {
  const records = await allRecords(store, k, round.session);
  const students = records.map(([, r]) => r.student_id).sort();
  const input = dealInput(config, students);
  if (!input) return;
  await store.setJSON(k.deal(round.session), { seed: round.session, students, lists: deal(input, round.session), at: new Date().toISOString() }, { onlyIfNew: true });
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
  const input = dealInput(config, list(dealt.students));
  if (!input) return null;
  const items = dealLate(input, lists, studentId, dealt.seed ?? round.session);
  const written = await store.setJSON(k.late(round.session, owner), { student_id: studentId, items, at: new Date().toISOString() }, { onlyIfNew: true });
  if (written?.modified === false) return (await read(store, k.late(round.session, owner)))?.items ?? items;
  return items;
}

/** A reading item as a reader may see it: the words, never which option they are. */
function itemView(config, item) {
  if (item.kind === 'text') return { kind: 'text', text: list(config.texts)[item.version] ?? '' };
  if (item.kind === 'set') return { kind: 'set', pieces: list(item.order).map((i) => list(config.texts)[i] ?? '') };
  return null;
}

/** Items a reader rates on the line; the others (a set, a writer's versions) are picked from. */
const isRated = (item) => item.kind === 'text' || item.kind === 'control' || item.kind === 'version';
const answered = (record, item, i) => Number.isFinite(isRated(item) ? record.ratings?.[i] : record.picks?.[i]);

/** The class result for the two supplied levels, from every record and reading list. */
async function classResult(store, k, config, round) {
  const records = await allRecords(store, k, round.session);
  const { lists } = await allLists(store, k, round.session);
  const options = list(config.options).length;
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

/** Results exist for the two supplied levels (Pairs design it adds its findings in Task 4). */
const resultsFor = async (store, k, config, steps, round) =>
  config.level !== 'pairs' && reached(steps, round, 'Result') ? classResult(store, k, config, round) : null;

// ---------------------------------------------------------------------------
// Student side
// ---------------------------------------------------------------------------

const STUDENT_ACTIONS = ['status', 'claim', 'predict', 'note', 'rate', 'pick', 'explain'];

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
  const empty = { identity, round, me: null, pair: null, reading: null, results: null };
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

  if (action === 'predict') {
    // Pairs design it predicts as a pair (Task 4: pair_predict).
    if (config.level === 'pairs') reject(400, 'bad_action', 'Unknown action.');
    during('Predict');
    if (record.pred !== null && record.pred !== undefined) reject(409, 'locked', 'Your prediction is locked in.');
    const pred = Number(body.pred);
    if (!Number.isInteger(pred) || pred < 0 || pred >= list(config.options).length) reject(400, 'bad_pred', 'Choose one of the options.');
    await save({ pred, reason: clean(body.reason, MAX_REASON), done: { ...record.done, Predict: true } });
  }
  if (action === 'note') {
    const at = steps.indexOf(body.step);
    if (at < 0 || round.finished || at > round.step) wrongStep();
    await save({ notes: { ...record.notes, [body.step]: clean(body.text, MAX_NOTE) } });
  }
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
      await save({ ratings, done: { ...record.done, ...(items.every((it, i) => i === index || answered(record, it, i)) ? { Test: true } : {}) } });
    } else {
      const order = item.kind === 'set' || item.kind === 'writer' ? list(item.order) : null;
      const choice = Number(body.choice);
      if (!order) reject(400, 'bad_item', 'This one is rated, not chosen.');
      if (!Number.isInteger(choice) || choice < 0 || choice >= order.length) reject(400, 'bad_choice', 'Choose one of them.');
      // The reader sends a position; which option sat there never leaves the server.
      const picks = [...list(record.picks)];
      picks[index] = order[choice];
      await save({ picks, done: { ...record.done, ...(items.every((it, i) => i === index || answered(record, it, i)) ? { Test: true } : {}) } });
    }
  }
  if (action === 'explain') {
    during('Explain');
    await save({ done: { ...record.done, Explain: true } });
  }

  // What this student may see now.
  const me = { pred: record.pred ?? null, reason: record.reason ?? '', notes: record.notes ?? {}, done: record.done ?? {} };
  let reading = null;
  if (reached(steps, round, 'Test')) {
    const items = (await listFor(store, k, config, round, who.student.id, owner)) ?? [];
    const next = items.findIndex((item, i) => !answered(record, item, i));
    if (!round.finished && stepAt(steps, round, 'Test') && items.length) {
      reading = { index: next < 0 ? items.length : next, total: items.length, item: next < 0 ? null : itemView(config, items[next]) };
    }
    if (reached(steps, round, 'Result')) {
      // Once the result is out a reader may know which version they had.
      me.read = items.flatMap((item, i) => (item.kind === 'text' && Number.isFinite(record.ratings?.[i]) ? [{ version: item.version, value: record.ratings[i] }]
        : item.kind === 'set' && Number.isInteger(record.picks?.[i]) ? [{ version: record.picks[i], value: null }] : []));
    }
  }
  return { identity, round, me, pair: null, reading, results: await resultsFor(store, k, config, steps, round) };
}

// ---------------------------------------------------------------------------
// Teacher side: the board
// ---------------------------------------------------------------------------

const TEACHER_ACTIONS = ['board', 'start', 'next', 'reveal', 'rounds', 'resume', 'end', 'release', 'remove', 'student'];

async function board(store, k, config, steps, active) {
  const round = roundView(active, steps);
  const roster = config.class_id ? await loadRoster(store, config.class_id) : null;
  const total = list(roster?.students).length;
  const base = { round, level: config.level, judge: config.judge, counts: { here: 0, done: 0, total }, predictions: null, results: null, texts: null, debrief: null };
  if (!round) return base;
  const records = (await allRecords(store, k, round.session)).map(([, r]) => r);
  const name = round.step_name;
  const done = name === 'Predict' ? records.filter((r) => r.pred !== null && r.pred !== undefined).length
    : name === 'Question' || name === 'Result' || !name ? records.length
      : records.filter((r) => r.done?.[name]).length;
  const options = list(config.options).length;
  const showPredictions = config.level !== 'pairs' && ((name === 'Predict' && round.revealed) || reached(steps, round, 'Result'));
  const results = await resultsFor(store, k, config, steps, round);
  return {
    ...base,
    counts: { here: records.length, done, total },
    predictions: showPredictions ? Array.from({ length: options }, (_, i) => records.filter((r) => r.pred === i).length) : null,
    results,
    // The versions side by side, once nobody is still reading one blind.
    texts: config.level === 'supplied' && results ? list(config.texts) : null,
    explained: records.filter((r) => r.done?.Explain).length,
    debrief: round.finished || round.step === steps.length - 1 ? config.debrief ?? '' : null
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
    // Flagged writing held for the teacher (Students write it, Task 3 reads this).
    if (!/^[a-f0-9]{24}$/.test(body.owner ?? '')) reject(400, 'bad_id', 'That piece wasn’t found.');
    await store.setJSON(k.held(active.session, body.owner), { status: action === 'release' ? 'released' : 'removed', at: new Date().toISOString() });
  }
  if (action === 'student') {
    // One student's record, for marking their explanation beside their notes and their trial.
    if (typeof body.student_id !== 'string' || !config.class_id) reject(400, 'bad_student', 'That student isn’t on this class list.');
    const owner = ownerOf(config.class_id, body.student_id);
    const record = await read(store, k.student(active.session, owner));
    const { lists } = await allLists(store, k, active.session);
    return { student_id: body.student_id, record: record ?? null, items: lists[body.student_id] ?? [] };
  }
  return board(store, k, config, steps, active);
}
