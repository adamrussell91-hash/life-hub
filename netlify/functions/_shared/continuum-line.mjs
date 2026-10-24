/**
 * Continuum line: students place their symbol on a line (Implied ↔ Not
 * implied, All · Some · None …) for each statement about one stimulus, and
 * give a reason. Nothing about a placement shows until the teacher reveals
 * that statement. After a reveal the teacher can open a re-place round:
 * students may move and must say why; the moves stay hidden until the
 * teacher shows them.
 *
 *   continuum/{lesson}/{block}/active                               round state (teacher writes only)
 *   continuum/{lesson}/{block}/{session}/claims/{symbol}            { token_hash }
 *   continuum/{lesson}/{block}/{session}/tokens/{token_hash}        { symbol }
 *   continuum/{lesson}/{block}/{session}/place/{statement}/{symbol} { pos, reason, flagged, at }
 *   continuum/{lesson}/{block}/{session}/move/{statement}/{symbol}  { pos, why, flagged, at }
 *   continuum/{lesson}/{block}/{session}/groups/{statement}         { groups: [{ id, name, answer_ids }], made_at } (teacher)
 *
 * Each statement in the round has a phase: collect → revealed → replace.
 * Placing is open only while collecting, moving only during re-place.
 * Teacher led: students answer the statement the teacher is on. Student
 * paced: they answer any statement still collecting.
 *
 * What leaves the server is the safety: while a statement collects, the
 * teacher gets symbols only (the projector drifts them) and students get a
 * count. After a reveal students get the class's positions with no symbols
 * or reasons, plus their own.
 */
import { randomBytes, randomInt, createHash } from 'node:crypto';
import { isSafeId } from './class-examples.mjs';
import { isDeletedRecord } from './record-liveness.mjs';
import { draftLessonKey, publishedLessonKey } from './teaching-blobs.mjs';
import { flagText } from './peer-feedback-filter.mjs';
import { claimedIds, claimSymbol } from './class-symbols.mjs';
import { groupReasons } from './continuum-line-groups.mjs';
import { bringBackRound, listRounds, roundExpiry, saveRound } from './activity-rounds.mjs';

const STRONG = { type: 'json', consistency: 'strong' };
export const MAX_REASON = 280;
const PHASES = ['collect', 'revealed', 'replace'];

export class ContinuumError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const reject = (status, code, message) => {
  throw new ContinuumError(status, code, message);
};
const read = (store, key) => store.get(key, STRONG);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const validToken = (token) => typeof token === 'string' && /^[a-f0-9]{48}$/.test(token);

function findBlock(blocks, id) {
  for (const b of blocks ?? []) {
    if (b.visibility === 'teacher_only') continue;
    if (b.id === id && b.block_type === 'continuum_line') return b;
    const nested = [
      b.content?.blocks,
      ...(b.content?.columns ?? []).map((c) => c.blocks),
      ...(b.content?.tabs ?? []).map((t) => t.blocks)
    ];
    for (const children of nested) {
      const hit = findBlock(children, id);
      if (hit) return hit;
    }
  }
  return null;
}

/** The block must exist in both the draft and the published lesson. Returns the published block. */
async function assertLive(store, lesson, block) {
  if (!isSafeId(lesson) || !isSafeId(block)) reject(404, 'not_found', 'Activity not found.');
  const [draft, published] = await Promise.all([read(store, draftLessonKey(lesson)), read(store, publishedLessonKey(lesson))]);
  const live = draft && !isDeletedRecord(draft) && findBlock(draft.blocks, block) && published && findBlock(published.blocks, block);
  if (!live) reject(404, 'not_published', 'Publish this lesson and block before starting an activity.');
  return live;
}

/** Where a snapped statement can land: the two ends and any named stops, evenly spaced. */
export function snapPoints(stops) {
  const n = Array.isArray(stops) ? stops.length : 0;
  return [0, ...Array.from({ length: n }, (_, i) => (i + 1) / (n + 1)), 1];
}

/** The block's settings, clamped. */
function settings(block) {
  const c = block.content ?? {};
  const scale = c.scale ?? {};
  const stops = (Array.isArray(scale.stops) ? scale.stops : []).filter((s) => typeof s === 'string').slice(0, 3);
  return {
    pace: c.pace === 'student' ? 'student' : 'teacher',
    replace: c.replace !== false,
    scale: { left: String(scale.left ?? ''), right: String(scale.right ?? ''), stops },
    statements: (Array.isArray(c.statements) ? c.statements : [])
      .filter((s) => s && isSafeId(s.id) && typeof s.text === 'string' && s.text.trim())
      .slice(0, 10)
      .map((s) => ({ id: s.id, text: s.text.trim(), snap: s.snap === true }))
  };
}

function keys(lesson, block, session) {
  const base = `continuum/${lesson}/${block}`;
  return {
    base,
    active: `${base}/active`,
    claim: (id) => `${base}/${session}/claims/${id}`,
    token: (tokenHash) => `${base}/${session}/tokens/${tokenHash}`,
    place: (sid, id) => `${base}/${session}/place/${sid}/${id}`,
    move: (sid, id) => `${base}/${session}/move/${sid}/${id}`,
    groups: (sid) => `${base}/${session}/groups/${sid}`
  };
}

/** A position from a request, inside the line and snapped when the statement says so. */
function cleanPos(raw, statement, stops) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) reject(400, 'bad_pos', 'Place your symbol on the line.');
  if (!statement.snap) return Math.round(n * 1000) / 1000;
  return snapPoints(stops).reduce((best, p) => (Math.abs(p - n) < Math.abs(best - n) ? p : best), 0);
}

function cleanText(raw, what) {
  const text = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  if (!text) reject(400, 'bad_text', `Write ${what} first.`);
  if (text.length > MAX_REASON) reject(400, 'bad_text', `Keep it to ${MAX_REASON} characters or fewer.`);
  return text;
}

const phaseOf = (activity, sid) => {
  const p = activity.phases?.[sid]?.phase;
  return PHASES.includes(p) ? p : 'collect';
};

/** Every joined student's placement and move for one statement, in symbol order. */
async function entriesFor(store, k, joined, sid) {
  const [places, moves] = await Promise.all([
    Promise.all(joined.map((id) => read(store, k.place(sid, id)))),
    Promise.all(joined.map((id) => read(store, k.move(sid, id))))
  ]);
  return joined.map((symbol, i) => ({ symbol, place: places[i], move: moves[i] })).filter((e) => e.place);
}

function teacherStatement(statement, activity, entries, groups) {
  const phase = phaseOf(activity, statement.id);
  const showMoves = phase === 'replace' && activity.phases?.[statement.id]?.moves_shown === true;
  const base = { id: statement.id, phase, placed: entries.length, moved: entries.filter((e) => e.move).length, moves_shown: showMoves };
  if (phase === 'collect') return { ...base, entries: entries.map((e) => ({ symbol: e.symbol })), groups: null };
  return {
    ...base,
    entries: entries.map((e) => ({
      symbol: e.symbol,
      pos: e.place.pos,
      reason: e.place.reason,
      flagged: !!e.place.flagged,
      ...(showMoves && e.move ? { new_pos: e.move.pos, why: e.move.why, why_flagged: !!e.move.flagged } : {})
    })),
    groups: groups ?? null
  };
}

async function teacherAction(store, k, activity, setup, body, opts) {
  const action = body.action ?? 'status';
  const allowed = ['status', 'go', 'reveal', 'collect', 'replace', 'show_moves', 'group'];
  if (!allowed.includes(action)) reject(400, 'bad_action', 'Unknown action.');
  const statement = action === 'status' ? null : setup.statements.find((s) => s.id === body.statement);
  if (action !== 'status' && action !== 'go' && !statement) reject(400, 'bad_request', 'Unknown statement.');

  const setPhase = async (sid, patch) => {
    activity = { ...activity, phases: { ...activity.phases, [sid]: { ...activity.phases?.[sid], ...patch } } };
    await saveRound(store, k.base, activity);
  };
  if (action === 'go') {
    const at = setup.statements.findIndex((s) => s.id === body.statement);
    if (at < 0) reject(400, 'bad_request', 'Unknown statement.');
    activity = { ...activity, current: at };
    await saveRound(store, k.base, activity);
  }
  if (action === 'reveal') await setPhase(statement.id, { phase: 'revealed' });
  if (action === 'collect') await setPhase(statement.id, { phase: 'collect' });
  if (action === 'replace') {
    if (!setup.replace) reject(400, 'bad_request', 'This line has no re-place round.');
    if (phaseOf(activity, statement.id) === 'collect') reject(409, 'not_revealed', 'Reveal the line first.');
    await setPhase(statement.id, { phase: 'replace', moves_shown: false });
  }
  if (action === 'show_moves') {
    if (phaseOf(activity, statement.id) !== 'replace') reject(409, 'not_replacing', 'Start the re-place round first.');
    await setPhase(statement.id, { moves_shown: body.show !== false });
  }

  const joined = await claimedIds(store, k.claim);
  if (action === 'group') {
    if (phaseOf(activity, statement.id) === 'collect') reject(409, 'not_revealed', 'Reveal the line first.');
    const entries = (await entriesFor(store, k, joined, statement.id)).filter((e) => !e.place.flagged);
    if (entries.length < 2) reject(400, 'too_few', 'Sorting needs at least two reasons.');
    const apiKey = opts.env?.ANTHROPIC_API_KEY;
    if (!apiKey) reject(503, 'ai_unavailable', 'Sorting isn’t available right now.');
    let groups;
    try {
      groups = await groupReasons({
        statement: statement.text,
        scale: setup.scale,
        stimulus: opts.stimulusText ?? '',
        reasons: entries.map((e) => ({ id: e.symbol, position: e.place.pos, reason: e.place.reason })),
        apiKey,
        fetchImpl: opts.fetchImpl,
        model: opts.env?.CONTINUUM_GROUP_MODEL
      });
    } catch {
      reject(502, 'ai_failed', 'Sorting didn’t work. Try again.');
    }
    await store.setJSON(k.groups(statement.id), { groups, made_at: new Date().toISOString() });
  }

  const statements = await Promise.all(
    setup.statements.map(async (s) => {
      const entries = await entriesFor(store, k, joined, s.id);
      const groups = phaseOf(activity, s.id) === 'collect' ? null : (await read(store, k.groups(s.id)))?.groups ?? null;
      return teacherStatement(s, activity, entries, groups);
    })
  );
  return {
    phase: 'live',
    session: activity.session,
    code: activity.code,
    open: activity.open,
    pace: setup.pace,
    replace: setup.replace,
    current: Math.min(activity.current ?? 0, Math.max(0, setup.statements.length - 1)),
    joined: joined.length,
    statements
  };
}

async function studentAction(store, k, activity, setup, body) {
  const action = body.action ?? 'status';
  if (!['status', 'join', 'place', 'move'].includes(action)) reject(400, 'bad_action', 'Unknown action.');
  if (body.session && body.session !== activity.session) reject(409, 'new_session', 'Your teacher started a new round. Join again.');
  const shared = { phase: 'live', session: activity.session, open: activity.open, pace: setup.pace };
  if (!body.token) {
    if (action !== 'status') reject(400, 'not_joined', 'Join the activity first.');
    return shared;
  }
  if (!validToken(body.token)) reject(400, 'not_joined', 'Join the activity first.');
  const tokenHash = hash(body.token);

  let id;
  if (action === 'join') {
    if (!activity.open) reject(409, 'closed', 'This activity has closed.');
    if (String(body.code ?? '').replace(/\D/g, '') !== activity.code) reject(403, 'wrong_code', 'That code didn’t match. Check the board.');
    id = await claimSymbol(store, k, tokenHash);
    if (!id) reject(409, 'full', 'This activity is full. Ask your teacher.');
  } else {
    id = (await read(store, k.token(tokenHash)))?.symbol;
    if (!id) reject(403, 'not_joined', 'Join the activity first.');
  }

  const current = Math.min(activity.current ?? 0, Math.max(0, setup.statements.length - 1));
  if (action === 'place' || action === 'move') {
    if (!activity.open) reject(409, 'closed', 'This activity has closed.');
    const at = setup.statements.findIndex((s) => s.id === body.statement);
    if (at < 0) reject(400, 'bad_request', 'Unknown statement.');
    const statement = setup.statements[at];
    const phase = phaseOf(activity, statement.id);
    if (action === 'place') {
      if (phase !== 'collect') reject(409, 'revealed', 'Your teacher has revealed this one.');
      if (setup.pace === 'teacher' && at !== current) reject(409, 'moved_on', 'Your teacher has moved to another statement.');
      const pos = cleanPos(body.pos, statement, setup.scale.stops);
      const reason = cleanText(body.reason, 'your reason');
      await store.setJSON(k.place(statement.id, id), { pos, reason, flagged: flagText(reason), at: new Date().toISOString() });
    } else {
      if (phase !== 'replace') reject(409, 'not_replacing', 'Moving isn’t open for this one.');
      if (!(await read(store, k.place(statement.id, id)))) reject(409, 'not_placed', 'You didn’t place a symbol on this one.');
      const pos = cleanPos(body.pos, statement, setup.scale.stops);
      const why = cleanText(body.why, 'why you moved');
      await store.setJSON(k.move(statement.id, id), { pos, why, flagged: flagText(why), at: new Date().toISOString() });
    }
  }

  const joined = await claimedIds(store, k.claim);
  const statements = await Promise.all(
    setup.statements.map(async (s) => {
      const phase = phaseOf(activity, s.id);
      const entries = await entriesFor(store, k, joined, s.id);
      const own = entries.find((e) => e.symbol === id);
      return {
        id: s.id,
        phase,
        placed: entries.length,
        mine: own ? { pos: own.place.pos, reason: own.place.reason, ...(own.move ? { new_pos: own.move.pos, why: own.move.why } : {}) } : null,
        // The class line after a reveal: first positions only, no symbols, no reasons, in a fixed order.
        class: phase === 'collect' ? null : entries.map((e) => e.place.pos).sort((a, b) => a - b)
      };
    })
  );
  return { ...shared, joined: true, symbol: id, current, statements };
}

function freshRound() {
  return {
    session: randomBytes(16).toString('hex'),
    code: String(randomInt(100000, 1000000)),
    open: true,
    started_at: new Date().toISOString(),
    expires: roundExpiry(),
    current: 0,
    phases: {}
  };
}

export async function continuumAction(store, lesson, block, body, opts = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  const teacher = opts.teacher === true;
  const live = await assertLive(store, lesson, block);
  const setup = settings(live);
  const { base, active: activeKey } = keys(lesson, block, '');
  let activity = await read(store, activeKey);

  if (teacher && body.action === 'start') {
    activity = freshRound();
    await saveRound(store, base, activity);
  }
  if (teacher && body.action === 'end' && activity) {
    activity = { ...activity, open: false };
    await saveRound(store, base, activity);
  }
  if (teacher && body.action === 'rounds') return { rounds: await listRounds(store, base, activity, 'claims') };
  if (teacher && body.action === 'resume') {
    activity = await bringBackRound(store, base, body.session, activity, (session) => ({ ...freshRound(), session }), { open: true });
    if (!activity) reject(404, 'no_round', 'That round has nothing saved.');
  }
  if (!activity || activity.expires < Date.now()) return { phase: 'idle' };

  const k = keys(lesson, block, activity.session);
  const rest = ['start', 'end', 'resume'].includes(body.action) ? { ...body, action: 'status' } : body;
  const stimulusText = live.content?.stimulus?.kind === 'text' ? String(live.content.stimulus.text ?? '') : '';
  return teacher ? teacherAction(store, k, activity, setup, rest, { ...opts, stimulusText }) : studentAction(store, k, activity, setup, body);
}
