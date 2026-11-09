/**
 * Station Rotation: students move round a map of stations; a pretest sets
 * their level at each; gates stop them skipping past a misconception; what
 * they collect goes onto an evidence board that feeds a finale.
 *
 * Publish splits the draft. The public snapshot carries `PublicRotation` and
 * the station blocks with every quiz question split (no answers). The full
 * settings, the question keys, the hinge answers and back-ups, the pretest
 * keys, the lock answer and the written gates' private parts are stored here:
 *
 *   rotation/{lesson}/config                 settings + keys (written at publish)
 *   rotation/{lesson}/state                  teacher side: { fallback_on, calls, ticks, started_at }
 *   rotation/{lesson}/seats                  { owner: { station, at } } who is at which station now
 *   rotation/{lesson}/work/{owner}           one student's state (RotationWork + class_id, student_id, at)
 *   rotation/{lesson}/board/{owner}/pos      { station: { x, y } } evidence board positions
 *   rotation/{lesson}/board/{owner}/links    [{ from, to, word }] evidence board links
 *   rotation/{lesson}/spend/{class}/{day}    { aud } written-gate spend, for the daily cap
 *
 * Positions and links are saved apart, so a drag on one device never wipes a
 * link made on another. Gates are practice only: nothing here writes a mark
 * to the markbook. Every mark is worked out here, never in the browser.
 */
import { randomBytes } from 'node:crypto';
import { isSafeId } from './class-examples.mjs';
import { draftLessonKey, publishedLessonKey } from './teaching-blobs.mjs';
import { loadRoster } from './class-claims.mjs';
import { listBlobKeys } from './blobs-list.mjs';
import { QuizError, deviceHash, read, reject, validToken } from './question-drop.mjs';
import { identify } from './quiz.mjs';
import { checkQuestion, cleanResponse, hasAnswer, markResponse, splitQuestion } from './quiz-core.mjs';
import { RotationSettingsSchema, PublicWrittenGateSchema, WrittenGateSchema } from './rotation-schema.mjs';
import { levelAt, levelsFromPretest, lockReason, piecesLeft, recommend, routeChoiceOpen, unlockProblems } from './rotation-rules.mjs';

export { QuizError as RotationError };

export const rotationKeys = (lesson) => ({
  config: `rotation/${lesson}/config`,
  state: `rotation/${lesson}/state`,
  seats: `rotation/${lesson}/seats`,
  workAll: `rotation/${lesson}/work/`,
  work: (owner) => `rotation/${lesson}/work/${owner}`,
  pos: (owner) => `rotation/${lesson}/board/${owner}/pos`,
  links: (owner) => `rotation/${lesson}/board/${owner}/links`,
  spend: (classId, day) => `rotation/${lesson}/spend/${classId}/${day}`
});

const list = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const clean = (text, max = 1200) => (typeof text === 'string' ? text.trim().slice(0, max) : '');
const now = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);
/** Seats count a student as at a station for this long after their last move there. */
const SEAT_MS = 30 * 60 * 1000;
const MAX_LINKS = 40;

const roleOf = (b) => {
  const r = b?.settings?.rotation_role;
  return ['recall', 'goal', 'step', 'hint', 'gate', 'after', 'done', 'exit'].includes(r) ? r : 'step';
};
const isStationSection = (b) => b?.block_type === 'section' && typeof b.content?.rotation_station === 'string';
const learning = (stations) => list(stations).filter((s) => s.kind !== 'teacher');

// ---------------------------------------------------------------- publish

const cryptoRandom = () => randomBytes(4).readUInt32BE(0) / 2 ** 32;

export function rotationPublishProblems(draft) {
  const r = draft?.rotation;
  if (!r || typeof r !== 'object') return ['Set up the rotation before publishing.'];
  const parsed = RotationSettingsSchema.safeParse(r);
  if (!parsed.success) return ['The rotation has a setting that is too long or missing. Check each station.'];
  const s = parsed.data;
  const problems = [];
  if (!clean(s.class_id)) problems.push('Pick the class this rotation is for.');
  const stations = learning(s.stations);
  if (stations.length < 2) problems.push('Add at least 2 stations.');
  if (stations.length > 8) problems.push('A rotation can have at most 8 stations, plus one teacher station.');
  if (s.stations.filter((x) => x.kind === 'teacher').length > 1) problems.push('Keep to one teacher station.');
  const sections = new Map(list(draft.blocks).filter(isStationSection).map((b) => [b.content.rotation_station, list(b.content.blocks)]));
  for (const st of stations) {
    const blocks = sections.get(st.id);
    if (!blocks) { problems.push(`${st.title || 'A station'} has no content yet.`); continue; }
    if (!blocks.some((b) => roleOf(b) === 'exit' && b.block_type === 'quiz_question')) problems.push(`${st.title || 'A station'} needs an exit check question.`);
    if (!blocks.some((b) => roleOf(b) === 'goal')) problems.push(`${st.title || 'A station'} needs a goal.`);
    const asked = s.pretest.filter((p) => p.station === st.id);
    if (asked.length !== 3) problems.push(`${st.title || 'A station'} needs exactly 3 pretest questions.`);
    for (const p of asked) {
      const c = checkQuestion({ ...p.question, id: p.id });
      if (!c.ok) { problems.push(`A pretest question for ${st.title || 'a station'} isn’t finished: ${c.message}`); break; }
    }
    const g = st.written_gate;
    if (g && (!clean(g.passage) || !clean(g.prompt) || !clean(g.idea) || !list(g.checks).length || g.pass_at > g.marks)) problems.push(`The written gate at ${st.title || 'a station'} isn’t finished.`);
  }
  if (s.path === 'choose_n' && (!s.choose_n || s.choose_n >= stations.length)) problems.push('“Choose some” needs a number smaller than the number of stations.');
  if (s.path === 'unlocks') problems.push(...unlockProblems(s.stations));
  if (s.stations.some((x) => clean(x.token)) && !(s.finale.lock && list(s.finale.lock.options).some((o) => o.id === s.finale.lock.correct_id))) problems.push('A breakout with letters needs a lock question with a right answer.');
  return problems;
}

const mapStationBlocks = (blocks, fn) => list(blocks).map((b) => (isStationSection(b) ? { ...b, content: { ...b.content, blocks: list(b.content.blocks).map((c) => fn(c, b.content.rotation_station)).filter(Boolean) } } : b));

/**
 * `{ snapshot: { blocks, rotation }, config, problems }`. `studentBlocks` have
 * been through filterBlocksForStudent (hinge answers already gone); the draft
 * still has them, so hinge keys are read from the draft.
 */
export function prepareRotationPublish(draft, studentBlocks, random = cryptoRandom) {
  const problems = rotationPublishProblems(draft);
  if (problems.length) return { snapshot: null, config: null, problems };
  const s = RotationSettingsSchema.parse(draft.rotation);
  const keys = {};
  const blocks = mapStationBlocks(studentBlocks, (b, station) => {
    if (b.block_type !== 'quiz_question') return b;
    const checked = checkQuestion({ ...(b.content?.question ?? {}), id: b.id });
    if (!checked.ok) {
      problems.push(`A question at a station isn’t finished: ${checked.message}`);
      return null;
    }
    const { question, key } = splitQuestion(checked.question, random);
    keys[b.id] = { key, station, role: roleOf(b) };
    return { ...b, content: { question } };
  });
  const hinges = {};
  mapStationBlocks(draft.blocks, (b, station) => {
    if (b.block_type === 'hinge_question' && roleOf(b) === 'gate') {
      const c = b.content ?? {};
      hinges[b.id] = { station, prompt: c.prompt ?? '', options: list(c.options), correct_id: c.correct_id ?? '', backup: c.backup ?? null };
    }
    return b;
  });
  const pretest = [];
  const pretestKeys = {};
  for (const p of s.pretest) {
    const checked = checkQuestion({ ...p.question, id: p.id });
    if (!checked.ok) { problems.push(`A pretest question isn’t finished: ${checked.message}`); continue; }
    const { question, key } = splitQuestion(checked.question, random);
    pretest.push({ id: p.id, station: p.station, question, ...(p.misconception ? { misconception: true } : {}) });
    pretestKeys[p.id] = key;
  }
  if (problems.length) return { snapshot: null, config: null, problems };
  const publicStations = s.stations.map(({ written_gate, offline_code, script, ...st }) => ({
    ...st,
    ...(written_gate ? { written_gate: PublicWrittenGateSchema.parse(written_gate) } : {}),
    ...(offline_code ? { has_offline_code: true } : {})
  }));
  const lock = s.finale.lock ? { prompt: s.finale.lock.prompt, options: s.finale.lock.options } : undefined;
  return {
    problems,
    snapshot: {
      blocks,
      rotation: {
        dial: s.dial,
        fade_dial: s.fade_dial,
        path: s.path,
        ...(s.choose_n ? { choose_n: s.choose_n } : {}),
        evidence: s.evidence,
        link_words: s.link_words,
        stations: publicStations,
        finale: { ...(lock ? { lock } : {}), build_prompt: s.finale.build_prompt, formats: s.finale.formats, debrief: s.finale.debrief },
        ...(s.story ? { story: s.story } : {}),
        behind_fallback: s.behind_fallback,
        pretest_count: pretest.length
      }
    },
    config: { ...s, version: Date.now().toString(36), keys, hinges, pretest_public: pretest, pretest_keys: pretestKeys }
  };
}

export async function storeRotationConfig(store, lessonId, config) {
  await store.setJSON(rotationKeys(lessonId).config, config);
}

// ---------------------------------------------------------------- loading

async function loadRotation(store, lessonId) {
  if (!isSafeId(lessonId)) reject(404, 'not_found', 'Rotation not found.');
  const lesson = await read(store, publishedLessonKey(lessonId));
  if (!lesson) reject(404, 'not_found', 'Rotation not found.');
  if (lesson.pedagogical_mode !== 'station_rotation') reject(409, 'not_rotation', 'This lesson isn’t a station rotation.');
  const config = await read(store, rotationKeys(lessonId).config);
  if (!config) reject(404, 'not_found', 'Rotation not found.');
  return { lesson, config };
}

const emptyWork = () => ({ pretest: {}, levels: {}, level_overrides: {}, level_log: [], opened: [], done: [], collected: [], hints: {}, hint_log: [], recall: {}, gates: {}, exits: {}, finale: {} });
/** A record from before a republish keeps only stations that still exist. */
function normaliseWork(raw, config) {
  const ids = new Set(list(config.stations).map((s) => s.id));
  const w = { ...emptyWork(), ...obj(raw) };
  const keep = (m) => Object.fromEntries(Object.entries(obj(m)).filter(([k]) => ids.has(k)));
  return {
    ...w,
    done: list(w.done).filter((id) => ids.has(id)),
    collected: list(w.collected).filter((id) => ids.has(id)),
    opened: list(w.opened).filter((id) => ids.has(id)),
    levels: keep(w.levels),
    level_overrides: keep(w.level_overrides),
    hints: keep(w.hints),
    recall: keep(w.recall),
    gates: keep(w.gates),
    exits: keep(w.exits),
    pretest: Object.fromEntries(Object.entries(obj(w.pretest)).filter(([id]) => list(config.pretest_public).some((p) => p.id === id))),
    current: ids.has(w.current) ? w.current : undefined,
    finale: obj(w.finale)
  };
}

const stationBlocks = (lesson, stationId) => list(list(lesson.blocks).find((b) => isStationSection(b) && b.content.rotation_station === stationId)?.content?.blocks);
const hintCount = (lesson, stationId) => stationBlocks(lesson, stationId).filter((b) => roleOf(b) === 'hint').length;
const exitIds = (config, stationId) => Object.entries(obj(config.keys)).filter(([, k]) => k.station === stationId && k.role === 'exit').map(([id]) => id);
const hingeOf = (config, stationId) => Object.entries(obj(config.hinges)).find(([, h]) => h.station === stationId);
const gateKind = (config, stationId) => (list(config.stations).find((s) => s.id === stationId)?.written_gate ? 'written' : hingeOf(config, stationId) ? 'hinge' : null);
const gateOpen = (config, work, stationId) => !gateKind(config, stationId) || ['passed', 'unlocked'].includes(work.gates[stationId]?.state);
const fallbackOn = (state) => !!state.fallback_on;
const settingsOf = (config) => ({ dial: config.dial, fade_dial: config.fade_dial, path: config.path, choose_n: config.choose_n, stations: list(config.stations), pretest: list(config.pretest_public) });

/** A student's level at a station, and where it came from. */
function levelInfo(config, work, stationId) {
  const own = config.dial !== 'guided' ? work.level_overrides[stationId] : undefined;
  if (own) return { level: own, source: 'own' };
  if (work.levels[stationId]) return { level: work.levels[stationId], source: 'pretest' };
  return { level: levelAt(stationId, work, config.dial), source: 'default' };
}

async function seatsTaken(store, lessonId) {
  const seats = obj(await read(store, rotationKeys(lessonId).seats));
  const cutoff = Date.now() - SEAT_MS;
  const taken = {};
  for (const v of Object.values(seats)) if (v?.station && Date.parse(v.at) > cutoff) taken[v.station] = (taken[v.station] ?? 0) + 1;
  return { seats, taken };
}

async function setSeat(store, lessonId, owner, station) {
  const k = rotationKeys(lessonId).seats;
  const seats = obj(await read(store, k));
  if (station) seats[owner] = { station, at: now() };
  else delete seats[owner];
  await store.setJSON(k, seats);
}

// ---------------------------------------------------------------- the student's view

const publicGate = (config, work, stationId) => {
  const kind = gateKind(config, stationId);
  if (!kind) return null;
  const g = work.gates[stationId] ?? { state: 'open', attempts: [] };
  const out = { kind, state: g.state ?? 'open', tries: list(g.attempts).length };
  if (kind === 'hinge') {
    const [, h] = hingeOf(config, stationId);
    const lastWrong = list(g.attempts).filter((a) => a.correct === false).pop();
    if (lastWrong && ['backup', 'flagged'].includes(out.state)) {
      const from = lastWrong.backup ? list(h.backup?.options) : list(h.options);
      const note = clean(from.find((o) => o.id === lastWrong.choice)?.misconception, 300);
      out.reteach = note || 'That answer mixes something up. Read the step above again.';
    }
    if (h.backup && ['backup', 'flagged'].includes(out.state)) out.backup = { prompt: h.backup.prompt, options: list(h.backup.options).map((o) => ({ id: o.id, text: o.text })) };
  } else {
    const gate = WrittenGateSchema.parse(list(config.stations).find((s) => s.id === stationId).written_gate);
    const written = list(g.written);
    const counted = written.filter((a) => a.counted !== false).length;
    out.checks_left = Math.max(0, gate.max_checks - counted);
    const last = written[written.length - 1];
    if (last) out.last = { text: last.text, at: last.at, outcome: last.outcome, feedback: list(last.feedback), passed: last.passed ?? 0, need: last.need ?? gate.pass_at, points: list(last.points) };
    if (g.appeal_at) out.appeal_at = g.appeal_at;
    if (g.teacher) out.teacher = g.teacher;
  }
  return out;
};

async function buildStatus(store, lessonId, lesson, config, state, work, identity, owner, extra = {}) {
  const settings = settingsOf(config);
  const { taken } = await seatsTaken(store, lessonId);
  const k = rotationKeys(lessonId);
  const [pos, links] = await Promise.all([read(store, k.pos(owner)), read(store, k.links(owner))]);
  const stations = list(config.stations);
  const levels = {};
  for (const s of learning(stations)) levels[s.id] = levelInfo(config, work, s.id);
  const locks = {};
  for (const s of stations) { const r = lockReason(s, settings, work); if (r) locks[s.id] = r; }
  const gates = {};
  for (const s of learning(stations)) { const g = publicGate(config, work, s.id); if (g) gates[s.id] = g; }
  const exitResults = {};
  for (const s of learning(stations)) {
    const e = work.exits[s.id];
    if (!e) continue;
    exitResults[s.id] = Object.fromEntries(Object.entries(obj(e.results)).map(([id, r]) => [id, { mark: r.mark, key: config.keys[id]?.key ?? null }]));
  }
  const recallResults = Object.fromEntries(Object.entries(work.recall).map(([sid, r]) => [sid, { block_id: r.block_id, mark: r.mark, key: config.keys[r.block_id]?.key ?? null }]));
  const pretestResults = Object.fromEntries(Object.entries(work.pretest).map(([id, r]) => [id, { mark: r.mark, key: config.pretest_keys?.[id] ?? null }]));
  const call = Object.values(obj(state.calls)).filter((c) => list(c.students).includes(work.student_id)).sort((a, b) => (a.at < b.at ? 1 : -1))[0] ?? null;
  return {
    identity,
    pretest: { items: list(config.pretest_public).map(({ id, station, question }) => ({ id, station, question })), results: pretestResults },
    levels,
    locks,
    gates,
    seats: taken,
    recommend: recommend(settings, work, taken),
    route_open: routeChoiceOpen(settings, work),
    pieces_left: piecesLeft(settings, work, fallbackOn(state)),
    fallback_on: fallbackOn(state),
    called: call && !call.done ? { at: call.at, group: call.group, title: call.title ?? 'Teacher station' } : null,
    work: {
      current: work.current ?? null,
      opened: work.opened,
      done: work.done,
      collected: work.collected,
      hints: work.hints,
      level_overrides: work.level_overrides,
      hand_up_at: work.hand_up_at ?? null,
      finale: work.finale,
      exits: Object.fromEntries(Object.entries(work.exits).map(([id, e]) => [id, { correct: !!e.correct, answered: list(e.answered), at: e.at }])),
      results: exitResults,
      recall: recallResults
    },
    board: { pos: obj(pos), links: list(links) },
    ...extra
  };
}

// ---------------------------------------------------------------- student actions

const ACTIONS = ['status', 'claim', 'pretest_answer', 'open_station', 'leave_station', 'level', 'hint', 'recall_answer', 'gate_answer', 'exit_answer', 'collect', 'offline_code', 'board_move', 'board_link', 'board_unlink', 'hand_up', 'hand_down', 'check_writing', 'appeal', 'finale_lock', 'finale_save'];

/**
 * `deps.checkWriting(input)` runs the written gate (rotation-writing.mjs); the
 * Netlify function passes the real one. Without it, a written gate goes to
 * the teacher.
 */
export async function rotationAction(store, lessonId, body, deps = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  const action = body.action ?? 'status';
  if (!ACTIONS.includes(action)) reject(400, 'bad_action', 'Unknown action.');
  const { lesson, config } = await loadRotation(store, lessonId);
  let who;
  try {
    who = await identify(store, body, action);
  } catch (e) {
    if (e instanceof QuizError && e.code === 'need_class') reject(e.status, 'need_class', 'Open this rotation from your class page.');
    throw e;
  }
  if (who.need === 'class') reject(403, 'need_class', 'Open this rotation from your class page.');
  const identity = { need: who.need, initials: who.student?.initials ?? null };
  const blank = (extra = {}) => ({ identity, pretest: { items: [], results: {} }, levels: {}, locks: {}, gates: {}, seats: {}, recommend: null, route_open: false, pieces_left: 0, fallback_on: false, called: null, work: null, board: { pos: {}, links: [] }, ...extra });
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
  const k = rotationKeys(lessonId);
  const state = obj(await read(store, k.state));
  const work = normaliseWork(await read(store, k.work(owner)), config);
  work.class_id = who.classId;
  work.student_id = who.student.id;
  const view = (extra) => buildStatus(store, lessonId, lesson, config, state, work, identity, owner, extra);
  if (action === 'status' || action === 'claim') return view();

  const stations = list(config.stations);
  const settings = settingsOf(config);
  const save = async (extra) => {
    work.at = now();
    await store.setJSON(k.work(owner), work);
    if (!state.started_at) await store.setJSON(k.state, { ...state, started_at: work.at });
    return view(extra);
  };
  const station = (id = body.station) => {
    const s = stations.find((x) => x.id === id);
    if (!s) reject(400, 'bad_station', 'That station isn’t in this rotation.');
    return s;
  };
  const markWith = (key, response) => {
    const cleaned = cleanResponse(key.kind, response);
    if (!cleaned || !hasAnswer(cleaned)) reject(400, 'empty', 'Answer the question first.');
    return markResponse(key, cleaned);
  };

  if (action === 'pretest_answer') {
    const item = list(config.pretest_public).find((p) => p.id === body.item_id);
    if (!item) reject(400, 'bad_item', 'That question isn’t in the pretest.');
    if (work.pretest[item.id]) return view({ result: { item_id: item.id, mark: work.pretest[item.id].mark, key: config.pretest_keys[item.id] } });
    const mark = markWith(config.pretest_keys[item.id], body.response);
    work.pretest[item.id] = { correct: mark.correct === true, mark, at: now() };
    work.levels = { ...work.levels, ...levelsFromPretest(config.pretest_public, work.pretest) };
    return save({ result: { item_id: item.id, mark, key: config.pretest_keys[item.id] } });
  }

  if (action === 'open_station') {
    const s = station();
    // Seats are a guide, not a lock: a full station still opens. A locked one doesn't.
    const why = lockReason(s, settings, work);
    if (why) reject(409, 'locked', why);
    work.current = s.id;
    if (!work.opened.includes(s.id)) work.opened = [...work.opened, s.id];
    await setSeat(store, lessonId, owner, s.id);
    return save();
  }

  if (action === 'leave_station') {
    work.current = undefined;
    await setSeat(store, lessonId, owner, null);
    return save();
  }

  if (action === 'level') {
    const s = station();
    if (config.dial === 'guided') reject(409, 'guided', 'Your teacher has set your levels for this rotation.');
    if (!['support', 'core', 'extend'].includes(body.level)) reject(400, 'bad_level', 'Pick Support, Core or Extend.');
    work.level_overrides = { ...work.level_overrides, [s.id]: body.level };
    work.level_log = [...list(work.level_log), { station: s.id, level: body.level, from: levelInfo(config, { ...work, level_overrides: {} }, s.id).level, at: now() }].slice(-60);
    return save();
  }

  if (action === 'hint') {
    const s = station();
    const total = hintCount(lesson, s.id);
    const n = work.hints[s.id] ?? 0;
    if (n >= total) return view();
    work.hints = { ...work.hints, [s.id]: n + 1 };
    work.hint_log = [...list(work.hint_log), { station: s.id, n: n + 1, level: levelInfo(config, work, s.id).level, at: now() }].slice(-120);
    return save();
  }

  if (action === 'recall_answer') {
    const s = station();
    const key = config.keys[body.block_id];
    if (!key || key.station !== s.id || key.role !== 'recall') reject(400, 'bad_block', 'That isn’t this station’s recall question.');
    if (work.recall[s.id]) return view();
    const mark = markWith(key.key, body.response);
    work.recall = { ...work.recall, [s.id]: { block_id: body.block_id, correct: mark.correct === true, mark, at: now() } };
    return save();
  }

  if (action === 'gate_answer') {
    const s = station();
    const hinge = hingeOf(config, s.id)?.[1];
    if (!hinge) reject(409, 'no_gate', 'This station has no question gate.');
    const g = work.gates[s.id] ?? { state: 'open', attempts: [] };
    if (['passed', 'unlocked'].includes(g.state)) return view();
    if (g.state === 'flagged') reject(409, 'flagged', 'Your teacher will check this one with you. Carry on with another station.');
    const reason = clean(body.reason, 400);
    if (reason.split(/\s+/).filter(Boolean).length < 3) reject(400, 'reason', 'Give a reason of at least three words.');
    const backup = g.state === 'backup' && !!hinge.backup;
    const q = backup ? hinge.backup : hinge;
    if (!list(q.options).some((o) => o.id === body.choice)) reject(400, 'bad_option', 'Pick one of the options.');
    const correct = body.choice === q.correct_id;
    const attempt = { choice: body.choice, reason, at: now(), correct, backup };
    const nextState = correct ? 'passed' : !backup && hinge.backup ? 'backup' : 'flagged';
    work.gates = { ...work.gates, [s.id]: { ...g, attempts: [...list(g.attempts), attempt], state: nextState } };
    if (nextState === 'flagged') work.teacher_group = `reteach:${s.id}`;
    return save();
  }

  if (action === 'exit_answer') {
    const s = station();
    if (!gateOpen(config, work, s.id)) reject(409, 'gate', 'Get past the check first.');
    const key = config.keys[body.block_id];
    if (!key || key.station !== s.id || key.role !== 'exit') reject(400, 'bad_block', 'That isn’t this station’s exit check.');
    const e = work.exits[s.id] ?? { answered: [], results: {}, correct: false };
    if (list(e.answered).includes(body.block_id)) return view();
    const mark = markWith(key.key, body.response);
    const results = { ...obj(e.results), [body.block_id]: { mark, at: now() } };
    const answered = [...list(e.answered), body.block_id];
    const all = exitIds(config, s.id);
    const correct = all.every((id) => results[id]?.mark?.correct === true);
    work.exits = { ...work.exits, [s.id]: { answered, results, correct, at: now(), level: levelInfo(config, work, s.id).level } };
    return save();
  }

  if (action === 'collect') {
    const s = station();
    if (s.kind === 'teacher') reject(409, 'teacher', 'The teacher station has no piece to collect.');
    if (!gateOpen(config, work, s.id)) reject(409, 'gate', 'Get past the check first.');
    const all = exitIds(config, s.id);
    if (!all.every((id) => list(work.exits[s.id]?.answered).includes(id))) reject(409, 'exit', 'Answer the exit check first.');
    return collect(s.id);
  }

  if (action === 'offline_code') {
    const s = station();
    if (!s.offline_code) reject(409, 'no_code', 'This station isn’t done offline.');
    if (clean(body.code, 20).toLowerCase() !== s.offline_code.toLowerCase()) reject(400, 'bad_code', 'That code isn’t right. Ask at the station.');
    return collect(s.id);
  }

  async function collect(id) {
    if (!work.done.includes(id)) work.done = [...work.done, id];
    if (!work.collected.includes(id)) work.collected = [...work.collected, id];
    if (work.current === id) {
      work.current = undefined;
      await setSeat(store, lessonId, owner, null);
    }
    return save();
  }

  if (action === 'board_move') {
    const s = station();
    if (!work.collected.includes(s.id)) reject(409, 'not_collected', 'Collect that piece first.');
    const x = Number(body.x);
    const y = Number(body.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) reject(400, 'bad_pos', 'That isn’t a place on the board.');
    const pos = obj(await read(store, k.pos(owner)));
    pos[s.id] = { x: Math.max(0, Math.min(100, Math.round(x * 10) / 10)), y: Math.max(0, Math.min(100, Math.round(y * 10) / 10)) };
    await store.setJSON(k.pos(owner), pos);
    return view({ saved: 'board' });
  }

  if (action === 'board_link' || action === 'board_unlink') {
    const from = station(body.from);
    const to = station(body.to);
    if (from.id === to.id) reject(400, 'same', 'Link two different cards.');
    const links = list(await read(store, k.links(owner))).filter((l) => !(l.from === from.id && l.to === to.id) && !(l.from === to.id && l.to === from.id));
    if (action === 'board_link') {
      if (!work.collected.includes(from.id) || !work.collected.includes(to.id)) reject(409, 'not_collected', 'Collect both pieces first.');
      if (!list(config.link_words).includes(body.word)) reject(400, 'bad_word', 'Pick one of the link words.');
      if (links.length >= MAX_LINKS) reject(409, 'too_many', 'That’s a lot of links. Remove one first.');
      links.push({ from: from.id, to: to.id, word: body.word });
    }
    await store.setJSON(k.links(owner), links);
    return view({ saved: 'board' });
  }

  if (action === 'hand_up') { work.hand_up_at = now(); work.hand_station = work.current ?? null; return save(); }
  if (action === 'hand_down') { delete work.hand_up_at; delete work.hand_station; return save(); }

  if (action === 'check_writing' || action === 'appeal') {
    const s = station();
    const gate = s.written_gate ? WrittenGateSchema.parse(s.written_gate) : null;
    if (!gate) reject(409, 'no_gate', 'This station has no written gate.');
    const g = work.gates[s.id] ?? { state: 'open', attempts: [], written: [] };
    if (action === 'appeal') {
      if (!list(g.written).length) reject(409, 'nothing', 'Check your writing first.');
      work.gates = { ...work.gates, [s.id]: { ...g, appeal_at: now() } };
      return save();
    }
    if (['passed', 'unlocked'].includes(g.state)) reject(409, 'open', 'This gate is already open.');
    const level = levelInfo(config, work, s.id).level;
    const outcome = await (deps.checkWriting ?? teacherOnly)({ store, lessonId, classId: who.classId, gate, level, gateState: g, text: body.text });
    const attempt = { at: now(), ...outcome.attempt };
    const written = [...list(g.written), attempt];
    const counted = written.filter((a) => a.counted !== false).length;
    const nextState = attempt.outcome === 'passed' ? 'passed' : attempt.outcome === 'teacher' || counted >= gate.max_checks ? 'flagged' : 'open';
    work.gates = { ...work.gates, [s.id]: { ...g, written, state: nextState } };
    if (nextState === 'flagged') work.teacher_group = `reteach:${s.id}`;
    return save({ writing: { outcome: attempt.outcome, message: outcome.message ?? null } });
  }

  if (action === 'finale_lock' || action === 'finale_save') {
    if (piecesLeft(settings, work, fallbackOn(state)) > 0) reject(409, 'pieces', 'Collect your pieces first.');
    if (action === 'finale_lock') {
      const lock = config.finale?.lock;
      if (!lock) return view();
      if (!list(lock.options).some((o) => o.id === body.option_id)) reject(400, 'bad_option', 'Pick one of the answers.');
      const right = body.option_id === lock.correct_id;
      work.finale = { ...work.finale, lock_tries: (work.finale.lock_tries ?? 0) + 1, ...(right ? { lock_passed: true } : {}) };
      return save({ lock: { right } });
    }
    if (config.finale?.lock && !work.finale.lock_passed) reject(409, 'lock', 'Open the lock first.');
    const next = { ...work.finale };
    if (typeof body.build === 'string') {
      if (state.fallback_on && config.behind_fallback === 'skip_finale_build') reject(409, 'skipped', 'Your teacher has skipped the build today.');
      next.build = clean(body.build, 4000);
    }
    if (typeof body.format === 'string') {
      if (!list(config.finale?.formats).includes(body.format)) reject(400, 'bad_format', 'Pick one of the formats.');
      if (config.dial === 'guided' && body.format !== config.finale.formats[0]) reject(409, 'guided', 'Your teacher has set the format.');
      next.format = body.format;
    }
    if (body.debrief && typeof body.debrief === 'object') {
      const answers = { ...obj(next.debrief) };
      for (const [i, text] of Object.entries(body.debrief)) if (/^\d$/.test(i) && Number(i) < list(config.finale?.debrief).length) answers[i] = clean(text, 1200);
      next.debrief = answers;
    }
    work.finale = next;
    return save();
  }

  reject(400, 'bad_action', 'Unknown action.');
}

/** No checker wired: a written answer goes to the teacher and doesn't count against the student. */
async function teacherOnly({ text }) {
  return { attempt: { text: clean(text, 3000), outcome: 'teacher', rules: [], verdicts: [], feedback: [], counted: false }, message: 'Your teacher will look at this one.' };
}

// ---------------------------------------------------------------- teacher

const TEACHER_ACTIONS = ['board', 'call_group', 'group_tick', 'group_done', 'open_gate', 'writing_decision', 'going', 'fallback', 'clear_student'];

async function allWork(store, lessonId, config) {
  const k = rotationKeys(lessonId);
  const found = await listBlobKeys(store, k.workAll);
  return (await Promise.all(found.map(async (key) => ({ key, owner: key.slice(k.workAll.length), work: await read(store, key) }))))
    .filter((r) => r.work)
    .map((r) => ({ ...r, work: { ...normaliseWork(r.work, config), class_id: r.work.class_id, student_id: r.work.student_id, at: r.work.at, hand_up_at: r.work.hand_up_at, hand_station: r.work.hand_station, teacher_group: r.work.teacher_group } }));
}

/** Pretest routing: a reteach group a station for those who missed its misconception questions (or were flagged there), and an extend group. */
function groupsOf(config, rows, state) {
  const groups = [];
  const pretest = list(config.pretest_public);
  for (const s of learning(config.stations)) {
    const misconceptions = pretest.filter((p) => p.station === s.id && p.misconception);
    const members = [];
    for (const r of rows) {
      const missed = misconceptions.filter((p) => r.work.pretest[p.id] && !r.work.pretest[p.id].correct).map((p) => pretest.indexOf(p) + 1);
      const flagged = r.work.gates[s.id]?.state === 'flagged';
      if (missed.length || flagged) members.push({ student_id: r.student.id, name: r.student.name, missed, flagged });
    }
    if (members.length) groups.push({ id: `reteach:${s.id}`, kind: 'reteach', station: s.id, title: `${s.title || 'Station'} · reteach`, questions: misconceptions.map((p) => ({ n: pretest.indexOf(p) + 1, prompt: p.question.prompt })), members });
  }
  const extend = rows.filter((r) => {
    const lv = Object.values(r.work.levels);
    return lv.length && lv.filter((l) => l === 'extend').length >= Math.ceil(learning(config.stations).length / 2);
  }).map((r) => ({ student_id: r.student.id, name: r.student.name, missed: [], flagged: false }));
  if (extend.length) groups.push({ id: 'extend', kind: 'extend', station: null, title: 'Extend', questions: [], members: extend });
  const calls = obj(state.calls);
  return groups.map((g) => ({ ...g, called_at: calls[g.id]?.done ? null : calls[g.id]?.at ?? null, ticks: obj(obj(state.ticks)[g.id]) }));
}

async function teacherBoard(store, lessonId, draft, config, state) {
  const classId = config.class_id || draft?.rotation?.class_id;
  const roster = classId ? await loadRoster(store, classId) : null;
  const works = await allWork(store, lessonId, config);
  const byStudent = new Map(works.filter((w) => w.work.class_id === classId).map((w) => [w.work.student_id, w]));
  const students = list(roster?.students).filter((s) => !s.removed);
  const rows = students.map((s) => ({ student: s, owner: deviceHash(`student:${classId}:${s.id}`), work: byStudent.get(s.id)?.work ?? normaliseWork({}, config) }));
  const stationsList = list(config.stations);
  const settings = settingsOf(config);
  const learningStations = learning(stationsList);
  const out = rows.map(({ student, work }) => {
    const hints = work.current ? work.hints[work.current] ?? 0 : 0;
    const gateMiss = work.current && ['backup', 'flagged'].includes(work.gates[work.current]?.state);
    const stuck = !!work.hand_up_at || !!gateMiss || (!!work.current && hints >= 3 && !work.exits[work.current]);
    const pretestScore = {};
    for (const s of learningStations) {
      const items = list(config.pretest_public).filter((p) => p.station === s.id);
      pretestScore[s.id] = { right: items.filter((p) => work.pretest[p.id]?.correct).length, asked: items.length, answered: items.filter((p) => work.pretest[p.id]).length };
    }
    return {
      id: student.id,
      name: student.name,
      initials: student.initials,
      started: !!work.at || Object.keys(work.pretest).length > 0,
      at: work.current ?? null,
      done: work.done,
      collected: work.collected,
      levels: Object.fromEntries(learningStations.map((s) => [s.id, levelInfo(config, work, s.id).level])),
      pretest: pretestScore,
      exits: Object.fromEntries(Object.entries(work.exits).map(([id, e]) => [id, { correct: !!e.correct, level: e.level ?? null }])),
      hints: work.hints,
      gates: Object.fromEntries(Object.entries(work.gates).map(([id, g]) => [id, g.state])),
      stuck,
      hand_up_at: work.hand_up_at ?? null,
      hand_station: work.hand_station ?? null,
      pieces_left: piecesLeft(settings, work, fallbackOn(state)),
      finale: { lock_passed: !!work.finale.lock_passed, built: !!clean(work.finale.build) }
    };
  });
  const heat = {};
  const gateMisses = {};
  for (const { work } of rows) {
    for (const h of list(work.hint_log)) {
      heat[h.station] ??= { support: 0, core: 0, extend: 0 };
      if (heat[h.station][h.level] !== undefined) heat[h.station][h.level] += 1;
    }
    for (const [sid, g] of Object.entries(work.gates)) gateMisses[sid] = (gateMisses[sid] ?? 0) + list(g.attempts).filter((a) => a.correct === false).length + list(g.written).filter((a) => a.outcome === 'not_yet').length;
  }
  const writing = [];
  for (const { student, work } of rows) {
    for (const [sid, g] of Object.entries(work.gates)) {
      const written = list(g.written);
      if (!written.length) continue;
      if (g.state !== 'flagged' && !g.appeal_at) continue;
      if (g.teacher && (!g.appeal_at || g.teacher.at > g.appeal_at)) continue;
      writing.push({ student_id: student.id, name: student.name, station: sid, appeal: !!g.appeal_at, state: g.state, attempts: written.map((a) => ({ text: a.text, at: a.at, outcome: a.outcome, feedback: list(a.feedback), rules: list(a.rules), verdicts: list(a.verdicts), points: list(a.points), flagged_text: !!a.flagged_text })) });
    }
  }
  const queue = out.filter((s) => s.hand_up_at).sort((a, b) => (a.hand_up_at < b.hand_up_at ? -1 : 1)).map((s) => ({ student_id: s.id, name: s.name, station: s.hand_station, at: s.hand_up_at }));
  const doneCount = out.reduce((n, s) => n + s.done.filter((id) => learningStations.some((x) => x.id === id)).length, 0);
  const possible = out.length * Math.max(1, learningStations.length);
  return {
    class_id: classId ?? null,
    started_at: state.started_at ?? null,
    fallback_on: fallbackOn(state),
    behind_fallback: config.behind_fallback,
    stations: stationsList.map((s) => ({ id: s.id, title: s.title, kind: s.kind, strand: s.strand ?? null, minutes: s.minutes, seats: s.seats, x: s.x ?? null, y: s.y ?? null, script: s.script ?? null })),
    students: out,
    groups: groupsOf(config, rows, state),
    queue,
    heat,
    gate_misses: gateMisses,
    writing,
    done_share: possible ? Math.round((doneCount / possible) * 100) : 0
  };
}

export async function rotationTeacherAction(store, lessonId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  if (!isSafeId(lessonId)) reject(404, 'not_found', 'Rotation not found.');
  const action = body.action ?? 'board';
  if (!TEACHER_ACTIONS.includes(action)) reject(400, 'bad_action', 'Unknown action.');
  const draft = await read(store, draftLessonKey(lessonId));
  if (!draft || draft.pedagogical_mode !== 'station_rotation') reject(404, 'not_found', 'Rotation not found.');
  const k = rotationKeys(lessonId);
  const config = await read(store, k.config);
  if (!config) reject(409, 'not_published', 'Publish the rotation first.');
  let state = obj(await read(store, k.state));
  const write = async (change) => {
    state = { ...state, ...change };
    await store.setJSON(k.state, state);
  };
  const studentWork = async (studentId) => {
    if (!isSafeId(String(studentId ?? ''))) reject(400, 'bad_request', 'Unknown student.');
    const owner = deviceHash(`student:${config.class_id}:${studentId}`);
    const raw = await read(store, k.work(owner));
    return { owner, work: normaliseWork(raw ?? {}, config), raw: obj(raw) };
  };
  const putWork = (owner, raw, work) => store.setJSON(k.work(owner), { ...raw, ...work, at: now() });

  if (action === 'call_group') {
    const board = await teacherBoard(store, lessonId, draft, config, state);
    const g = board.groups.find((x) => x.id === body.group);
    if (!g) reject(404, 'no_group', 'That group is empty now.');
    const teacher = list(config.stations).find((s) => s.kind === 'teacher');
    await write({ calls: { ...obj(state.calls), [g.id]: { at: now(), group: g.id, title: teacher?.title || 'Teacher station', students: g.members.map((m) => m.student_id) } } });
  }
  if (action === 'group_done') {
    const calls = obj(state.calls);
    if (calls[body.group]) await write({ calls: { ...calls, [body.group]: { ...calls[body.group], done: true } } });
  }
  if (action === 'group_tick') {
    if (!['got_it', 'needs_more'].includes(body.result)) reject(400, 'bad_result', 'Pick Got it or Needs more.');
    const ticks = obj(state.ticks);
    await write({ ticks: { ...ticks, [body.group]: { ...obj(ticks[body.group]), [String(body.student_id)]: body.result } } });
  }
  if (action === 'open_gate' || action === 'writing_decision') {
    const sid = String(body.station ?? '');
    if (!list(config.stations).some((s) => s.id === sid)) reject(400, 'bad_station', 'That station isn’t in this rotation.');
    const { owner, work, raw } = await studentWork(body.student_id);
    const g = work.gates[sid] ?? { state: 'open', attempts: [] };
    if (action === 'open_gate') work.gates = { ...work.gates, [sid]: { ...g, state: 'unlocked', teacher: { decision: 'pass', at: now() } } };
    else {
      if (!['pass', 'keep'].includes(body.decision)) reject(400, 'bad_decision', 'Pick Pass or Keep closed.');
      // The teacher's decision wins over the checker's.
      work.gates = { ...work.gates, [sid]: { ...g, state: body.decision === 'pass' ? 'passed' : 'open', teacher: { decision: body.decision, at: now() }, ...(body.decision === 'keep' ? { written: list(g.written).map((a) => ({ ...a, counted: false })) } : {}) } };
    }
    await putWork(owner, raw, { gates: work.gates });
  }
  if (action === 'going') {
    const { owner, raw } = await studentWork(body.student_id);
    const { hand_up_at: _h, hand_station: _s, ...rest } = raw;
    await store.setJSON(k.work(owner), { ...rest, at: now() });
  }
  if (action === 'fallback') await write({ fallback_on: body.on !== false });
  if (action === 'clear_student') {
    const { owner } = await studentWork(body.student_id);
    await Promise.all([store.delete(k.work(owner)), store.delete(k.pos(owner)), store.delete(k.links(owner))]);
    await setSeat(store, lessonId, owner, null);
  }
  return teacherBoard(store, lessonId, draft, config, state);
}
