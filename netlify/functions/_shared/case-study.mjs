/**
 * Case Study: five stations (Brief, The case, Decide, Outcome, Rules).
 *
 * Publish splits the draft. The public snapshot carries `PublicCase` (no
 * documents, outcome, objections or transfer case). Everything else is stored
 * at case/{lesson}/config and reaches a student only when their stage allows.
 *
 *   case/{lesson}/config         the settings (parts, decision, outcome, objections, transfer, pace…)
 *   case/{lesson}/state          teacher pace { open_to, parts_open, outcome_revealed }
 *   case/{lesson}/work/{owner}   CaseWork + { stage_done, at, class_id, student_id }
 *
 * No model is called here.
 */
import { randomBytes } from 'node:crypto';
import { isSafeId } from './class-examples.mjs';
import { draftLessonKey, publishedLessonKey } from './teaching-blobs.mjs';
import { loadRoster } from './class-claims.mjs';
import { listBlobKeys } from './blobs-list.mjs';
import { QuizError, deviceHash, read, reject, validToken } from './question-drop.mjs';
import { identify } from './quiz.mjs';
import { CASE_STATIONS, CaseSettingsSchema } from './case-study-schema.mjs';

export { QuizError as CaseError };

const keys = (lesson) => ({
  config: `case/${lesson}/config`,
  state: `case/${lesson}/state`,
  workAll: `case/${lesson}/work/`,
  work: (owner) => `case/${lesson}/work/${owner}`
});

const list = (value) => (Array.isArray(value) ? value : []);
const clean = (text, max = 1200) => (typeof text === 'string' ? text.trim().slice(0, max) : '');
const today = () => new Date().toISOString().slice(0, 10);
const emptyState = () => ({ open_to: 0, parts_open: 1, outcome_revealed: false });
const allDocs = (config) => list(config.parts).flatMap((p) => list(p.docs));

// ---------------------------------------------------------------- publish

export function casePublishProblems(draft) {
  const c = draft?.case;
  if (!c || typeof c !== 'object') return ['Set up the case before publishing.'];
  const problems = [];
  if (!clean(c.purpose)) problems.push('Say what students will be able to do on a case they haven’t seen (the purpose).');
  if (!list(c.parts).some((p) => list(p?.docs).length > 0)) problems.push('Add a part with at least one document.');
  if (!clean(c.decision?.prompt)) problems.push('Write the decision students will face.');
  else if (c.support !== 'open' && list(c.decision.options).length < 2) problems.push('Give a guided decision at least 2 options.');
  if (!clean(c.outcome?.text)) problems.push('Write what actually happened (the outcome).');
  else if (!clean(c.outcome.source)) problems.push('Add the source for the outcome.');
  const t = c.transfer;
  if (!clean(t?.title) || !list(t?.docs).length || !clean(t?.question)) problems.push('Add a transfer case with a title, a document and a question.');
  if (c.pace === 'own' && list(c.objections).filter((o) => clean(o)).length === 0) problems.push('Own pace needs at least one objection for the Outcome.');
  return problems;
}

/** `{ snapshot: PublicCase, config, problems }`; snapshot and config are null while there are problems. */
export function prepareCasePublish(draft) {
  const problems = casePublishProblems(draft);
  const parsed = problems.length === 0 ? CaseSettingsSchema.safeParse(draft.case) : null;
  if (parsed && !parsed.success) problems.push('The case has a field that is too long or missing. Check each document and option.');
  if (problems.length > 0) return { snapshot: null, config: null, problems };
  const c = parsed.data;
  return {
    problems,
    snapshot: {
      purpose: c.purpose,
      pace: c.pace,
      support: c.support,
      release: c.release,
      decision: c.decision,
      part_titles: c.parts.map((p) => p.title),
      has_objections: c.objections.length > 0,
      ...(c.help ? { help: c.help } : {})
    },
    config: { ...c, version: Date.now().toString(36) }
  };
}

export async function storeCaseConfig(store, lessonId, config) {
  await store.setJSON(keys(lessonId).config, config);
}

// ---------------------------------------------------------------- shared rules

const stagesDone = (work) => list(work.stage_done);

/** Own pace: stations open = those the student has moved past, plus the next. */
function openToFor(config, state, work) {
  if (config.pace === 'teacher') return Math.max(0, Math.min(4, Number(state.open_to) || 0));
  const done = stagesDone(work);
  let n = 0;
  while (n < 4 && done.includes(CASE_STATIONS[n])) n += 1;
  return n;
}

function partsOpenFor(config, state, work) {
  const total = list(config.parts).length;
  if (config.release !== 'layered') return total;
  const n = config.pace === 'teacher' ? state.parts_open : work.parts_open;
  return Math.max(1, Math.min(total, Number(n) || 1));
}

const questionAnswered = (config, work, part) => !part.question || !!work.answers?.[part.id];

/** The stations this student has finished, by the content rules. */
function doneStations(config, work, partsOpen) {
  const done = [];
  const ft = work.first_take;
  if ((ft?.option_id || ft?.text) && ft.why) done.push('brief');
  const parts = list(config.parts);
  const layered = config.release === 'layered';
  if (partsOpen >= parts.length && (!layered || parts.every((p) => questionAnswered(config, work, p)))) done.push('case');
  if (work.decision) done.push('decide');
  const needsObjection = config.pace === 'own' && list(config.objections).length > 0;
  if (work.reflection && (!needsObjection || work.objection)) done.push('outcome');
  if (work.rule && work.transfer) done.push('rules');
  return done;
}

const outcomeVisible = (config, state, work, openTo) => {
  if (!work.decision || openTo < 3) return false;
  return config.pace === 'teacher' ? !!state.outcome_revealed : true;
};
const heldUntil = (config) => (config.pace === 'own' && config.outcome?.hold_until && today() < config.outcome.hold_until ? config.outcome.hold_until : null);

async function allWork(store, lessonId) {
  const k = keys(lessonId);
  const found = await listBlobKeys(store, k.workAll);
  return (await Promise.all(found.map((key) => read(store, key)))).filter(Boolean);
}

function spreadOf(records) {
  const locked = records.map((w) => w.decision).filter(Boolean);
  const options = {};
  for (const d of locked) {
    const key = d.option_id ?? 'text';
    options[key] = (options[key] ?? 0) + 1;
  }
  const total = locked.length;
  const avg = total ? Math.round(locked.reduce((n, d) => n + d.confidence, 0) / total) : null;
  return { options, confidence_avg: avg, total, early: total < 5 };
}

const publicWork = (work) => {
  const { stage_done, at, class_id, student_id, ...rest } = work;
  return rest;
};

async function buildStatus(store, lessonId, config, state, work, identity) {
  const openTo = openToFor(config, state, work);
  const partsOpen = partsOpenFor(config, state, work);
  const layered = config.release === 'layered';
  const parts = openTo >= 1
    ? list(config.parts).slice(0, partsOpen).map((p) => ({ id: p.id, title: p.title, docs: p.docs, ...(layered && p.question ? { question: p.question } : {}) }))
    : [];
  const visible = outcomeVisible(config, state, work, openTo);
  const held = visible ? heldUntil(config) : null;
  const showOutcome = visible && !held;
  const cited = new Set(list(work.evidence).map((e) => e.doc_id));
  const lockedIn = !!work.decision;
  return {
    identity,
    open_to: openTo,
    done: doneStations(config, work, partsOpen),
    parts,
    parts_total: list(config.parts).length,
    work: publicWork(work),
    objections: config.pace === 'own' && lockedIn && openTo >= 3 && list(config.objections).length ? config.objections : null,
    outcome: showOutcome ? { text: config.outcome.text, source: config.outcome.source } : null,
    held_until: held,
    spread: showOutcome ? spreadOf(await allWork(store, lessonId)) : null,
    not_used: showOutcome ? parts.flatMap((p) => p.docs).filter((d) => !cited.has(d.id)).map((d) => d.id) : [],
    transfer: showOutcome && openTo >= 4 && config.transfer ? { title: config.transfer.title, docs: config.transfer.docs, question: config.transfer.question } : null
  };
}

async function loadCase(store, lessonId) {
  if (!isSafeId(lessonId)) reject(404, 'not_found', 'Case not found.');
  const lesson = await read(store, publishedLessonKey(lessonId));
  if (!lesson) reject(404, 'not_found', 'Case not found.');
  if (lesson.pedagogical_mode !== 'case_study') reject(409, 'not_case', 'This lesson isn’t a case study.');
  const config = await read(store, keys(lessonId).config);
  if (!config) reject(404, 'not_found', 'Case not found.');
  return config;
}

// ---------------------------------------------------------------- student

const ACTIONS = ['status', 'claim', 'save', 'next_part', 'advance', 'lock'];
const SAVE_KINDS = ['first_take', 'answer', 'evidence', 'evidence_remove', 'objection', 'reflection', 'rule', 'transfer'];
const MAX_EVIDENCE = 12;

/** The option or free text of a first take / lock; refuses what the case's support level doesn't take. */
function pickDecision(config, input) {
  const options = list(config.decision?.options);
  if (config.support !== 'open' && options.length > 0) {
    if (typeof input.option_id !== 'string' || !options.some((o) => o.id === input.option_id)) reject(400, 'bad_option', 'Pick one of the options.');
    return { option_id: input.option_id };
  }
  const text = clean(input.text);
  if (!text) reject(400, 'empty', 'Write your decision.');
  return { text };
}

export async function caseAction(store, lessonId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  const action = body.action ?? 'status';
  if (!ACTIONS.includes(action)) reject(400, 'bad_action', 'Unknown action.');
  const config = await loadCase(store, lessonId);
  let who;
  try {
    who = await identify(store, body, action);
  } catch (e) {
    if (e instanceof QuizError && e.code === 'need_class') reject(e.status, 'need_class', 'Open this case from your class page.');
    throw e;
  }
  if (who.need === 'class') reject(403, 'need_class', 'Open this case from your class page.');
  const identity = { need: who.need, initials: who.student?.initials ?? null };
  const k = keys(lessonId);
  const state = { ...emptyState(), ...((await read(store, k.state)) ?? {}) };
  const blank = (extra = {}) => ({ identity, open_to: 0, done: [], parts: [], parts_total: list(config.parts).length, work: {}, objections: null, outcome: null, held_until: null, spread: null, not_used: [], transfer: null, ...extra });
  if (who.need === 'initials') {
    if (action !== 'status' && action !== 'claim') reject(403, 'need_initials', 'Type your initials first.');
    return blank();
  }
  if (!who.student) {
    if (action === 'status' || action === 'claim') return blank({ anonymous: true });
    reject(403, 'no_list', 'Your teacher hasn’t added a class list yet.');
  }
  if (config.class_id && config.class_id !== who.classId) {
    if (action === 'status' || action === 'claim') return blank({ not_for_you: true });
    reject(403, 'not_for_you', 'This one isn’t for you today.');
  }
  if (!validToken(body.class_token)) reject(400, 'no_device', 'This browser can’t remember you. Use your usual browser.');
  const owner = deviceHash(`student:${who.classId}:${who.student.id}`);
  const key = k.work(owner);
  const work = (await read(store, key)) ?? {};
  const view = () => buildStatus(store, lessonId, config, state, work, identity);
  if (action === 'status' || action === 'claim') return view();

  const openTo = openToFor(config, state, work);
  const parts = list(config.parts);
  const partsOpen = partsOpenFor(config, state, work);
  const save = async () => {
    work.at = new Date().toISOString();
    work.class_id = who.classId;
    work.student_id = who.student.id;
    work.stage_done = stagesDone(work);
    await store.setJSON(key, work);
    return view();
  };

  if (action === 'advance') {
    if (config.pace === 'teacher') reject(409, 'teacher_pace', 'Your teacher moves the class on.');
    if (openTo >= 4) return view();
    const current = CASE_STATIONS[openTo];
    if (!doneStations(config, work, partsOpen).includes(current)) reject(409, 'not_done', 'Finish this step first.');
    work.stage_done = [...stagesDone(work), current];
    return save();
  }

  if (action === 'next_part') {
    if (config.pace === 'teacher' || config.release !== 'layered') reject(409, 'not_layered', 'There is no next part to open.');
    if (openTo < 1) reject(409, 'not_open', 'That isn’t open yet.');
    if (partsOpen >= parts.length) return view();
    if (!questionAnswered(config, work, parts[partsOpen - 1])) reject(409, 'answer_first', 'Answer the question first.');
    work.parts_open = partsOpen + 1;
    return save();
  }

  if (action === 'lock') {
    if (openTo < 2) reject(409, 'not_open', 'That isn’t open yet.');
    if (work.decision) reject(409, 'already_locked', 'Your decision is locked.');
    const pick = pickDecision(config, body);
    const because = clean(body.because);
    if (!because) reject(400, 'empty', 'Say why.');
    if (!Number.isInteger(body.confidence) || body.confidence < 0 || body.confidence > 100) reject(400, 'bad_confidence', 'Pick how sure you are, 0 to 100.');
    work.decision = { ...pick, because, confidence: body.confidence, locked_at: new Date().toISOString() };
    return save();
  }

  // save
  if (!SAVE_KINDS.includes(body.kind)) reject(400, 'bad_kind', 'Unknown thing to save.');
  const needs = { first_take: 0, answer: 1, evidence: 1, evidence_remove: 1, objection: 3, reflection: 3, rule: 4, transfer: 4 }[body.kind];
  if (openTo < needs) reject(409, 'not_open', 'That isn’t open yet.');
  const lockedOnly = (message) => { if (!work.decision) reject(409, 'lock_first', message); };

  if (body.kind === 'first_take') {
    if (work.decision) reject(409, 'already_locked', 'Your decision is locked, so your first take stays as it was.');
    const why = clean(body.why);
    if (!why) reject(400, 'empty', 'Say why.');
    work.first_take = { ...pickDecision(config, body), why };
  } else if (body.kind === 'answer') {
    const part = parts.slice(0, partsOpen).find((p) => p.id === body.part_id);
    if (!part) reject(400, 'bad_part', 'That part isn’t open.');
    const text = clean(body.text);
    if (!text) reject(400, 'empty', 'Write your answer.');
    work.answers = { ...(work.answers ?? {}), [part.id]: text };
  } else if (body.kind === 'evidence') {
    const doc = parts.slice(0, partsOpen).flatMap((p) => list(p.docs)).find((d) => d.id === body.doc_id);
    if (!doc) reject(400, 'bad_doc', 'That document isn’t open.');
    const quote = clean(body.quote, 400);
    if (!quote) reject(400, 'empty', 'Select some text to cite.');
    const evidence = list(work.evidence);
    if (!evidence.some((e) => e.doc_id === doc.id && e.quote === quote)) {
      if (evidence.length >= MAX_EVIDENCE) reject(409, 'too_many', `You can keep ${MAX_EVIDENCE} pieces of evidence. Remove one first.`);
      work.evidence = [...evidence, { id: randomBytes(4).toString('hex'), doc_id: doc.id, quote }];
    }
  } else if (body.kind === 'evidence_remove') {
    work.evidence = list(work.evidence).filter((e) => e.id !== body.id);
  } else if (body.kind === 'objection') {
    lockedOnly('Lock your decision first.');
    const total = config.pace === 'own' ? list(config.objections).length : 0;
    if (!Number.isInteger(body.index) || body.index < 0 || body.index >= total) reject(400, 'bad_objection', 'Pick one of the objections.');
    const answer = clean(body.answer);
    if (!answer) reject(400, 'empty', 'Write your answer.');
    work.objection = { index: body.index, answer };
  } else if (body.kind === 'reflection') {
    lockedOnly('Lock your decision first.');
    const text = clean(body.text);
    if (!text) reject(400, 'empty', 'Write your reflection.');
    work.reflection = text;
  } else {
    // rule and transfer: only once the Outcome has shown, since the transfer case is behind it.
    if (!outcomeVisible(config, state, work, openTo) || heldUntil(config)) reject(409, 'not_open', 'That isn’t open yet.');
    if (body.kind === 'rule') {
      const rule = { when: clean(body.when), then: clean(body.then), unless: clean(body.unless) };
      if (!rule.when || !rule.then || !rule.unless) reject(400, 'empty', 'Fill in all three parts of your rule.');
      work.rule = rule;
    } else {
      const answer = clean(body.answer);
      if (!answer) reject(400, 'empty', 'Write your answer.');
      work.transfer = { answer, sent_at: new Date().toISOString() };
    }
  }
  return save();
}

// ---------------------------------------------------------------- teacher

const TEACHER_ACTIONS = ['board', 'open', 'release_part', 'reveal', 'clear_student'];

async function board(store, lessonId, draft, config, state) {
  // A case with no class set reaches students through any class link: read the class from their own work.
  const classId = draft?.case?.class_id ?? config.class_id ?? (await allWork(store, lessonId)).find((w) => w.class_id)?.class_id;
  const roster = classId ? await loadRoster(store, classId) : null;
  const k = keys(lessonId);
  const students = await Promise.all(list(roster?.students).map(async (s) => {
    const work = (await read(store, k.work(deviceHash(`student:${classId}:${s.id}`)))) ?? {};
    const d = work.decision;
    const f = work.first_take;
    const changed = !!d && !!f && (d.option_id ? d.option_id !== f.option_id : clean(d.text).toLowerCase() !== clean(f.text).toLowerCase());
    const activity = work.rule || work.transfer ? 4 : work.reflection || work.objection ? 3 : d ? 2 : work.evidence?.length || work.answers || work.parts_open ? 1 : 0;
    return {
      id: s.id,
      initials: s.initials,
      name: s.name,
      started: Object.keys(work).length > 0,
      at: Math.max(activity, config.pace === 'own' ? openToFor(config, state, work) : 0),
      locked: d ? { ...(d.option_id ? { option_id: d.option_id } : { text: d.text }), confidence: d.confidence, changed } : null,
      cited: list(work.evidence).length,
      transfer: work.transfer ? 'in' : 'none',
      rule: !!work.rule,
      _rule: work.rule
    };
  }));
  const spread = spreadOf(students.filter((s) => s.locked).map((s) => ({ decision: { option_id: s.locked.option_id, confidence: s.locked.confidence } })));
  const cites = new Map();
  for (const w of await allWork(store, lessonId)) for (const doc of new Set(list(w.evidence).map((e) => e.doc_id))) cites.set(doc, (cites.get(doc) ?? 0) + 1);
  return {
    open_to: Math.max(0, Math.min(4, Number(state.open_to) || 0)),
    parts_open: partsOpenFor({ ...config, pace: 'teacher' }, state, {}),
    parts_total: list(config.parts).length,
    outcome_revealed: !!state.outcome_revealed,
    pace: config.pace === 'own' ? 'own' : 'teacher',
    students: students.map(({ _rule, ...s }) => s),
    spread: spread.options,
    heat: allDocs(config).map((d) => ({ doc_id: d.id, title: d.title, cited: cites.get(d.id) ?? 0 })),
    rules: students.filter((s) => s._rule).map((s) => ({ initials: s.initials, ...s._rule }))
  };
}

export async function caseTeacherAction(store, lessonId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  if (!isSafeId(lessonId)) reject(404, 'not_found', 'Case not found.');
  const action = body.action ?? 'board';
  if (!TEACHER_ACTIONS.includes(action)) reject(400, 'bad_action', 'Unknown action.');
  const draft = await read(store, draftLessonKey(lessonId));
  if (!draft || draft.pedagogical_mode !== 'case_study') reject(404, 'not_found', 'Case not found.');
  const k = keys(lessonId);
  const config = (await read(store, k.config)) ?? draft.case ?? { parts: [] };
  let state = { ...emptyState(), ...((await read(store, k.state)) ?? {}) };
  const write = async (change) => {
    state = { ...state, ...change };
    await store.setJSON(k.state, state);
  };
  if (action === 'open') {
    if (!Number.isInteger(body.station) || body.station < 0 || body.station > 4) reject(400, 'bad_station', 'Pick a station from 0 to 4.');
    if (body.station < state.open_to) reject(409, 'cannot_close', 'A station can’t be closed once it’s open.');
    await write({ open_to: body.station });
  }
  if (action === 'release_part') {
    if (state.parts_open >= list(config.parts).length) reject(409, 'all_open', 'Every part is already open.');
    await write({ parts_open: state.parts_open + 1 });
  }
  if (action === 'reveal') {
    if (state.open_to < 3) reject(409, 'not_open', 'Open the Outcome station first.');
    await write({ outcome_revealed: true });
  }
  // One student's work, gone for good: they start the case again from the Brief.
  if (action === 'clear_student') {
    const studentId = String(body.student_id ?? '');
    if (!isSafeId(studentId)) reject(400, 'bad_request', 'Unknown student.');
    const found = await listBlobKeys(store, k.workAll);
    const mine = (await Promise.all(found.map(async (key) => ((await read(store, key))?.student_id === studentId ? key : null)))).filter(Boolean);
    if (!mine.length) reject(404, 'not_found', 'That student has no work to clear.');
    await Promise.all(mine.map((key) => store.delete(key)));
  }
  return board(store, lessonId, draft, config, state);
}
