/**
 * Brainstorm: students send short answers to one question; the teacher's
 * board shows each as the student's symbol, then reveals them together.
 *
 *   brainstorm/{lesson}/{block}/active                           round state (teacher writes only)
 *   brainstorm/{lesson}/{block}/{session}/claims/{symbol}        { token_hash }
 *   brainstorm/{lesson}/{block}/{session}/tokens/{token_hash}    { symbol }
 *   brainstorm/{lesson}/{block}/{session}/answers/{symbol}/{n}   { text, flagged, created_at }, create-only
 *   brainstorm/{lesson}/{block}/{session}/moderation/{symbol}.{n} { status: shown | removed } (teacher)
 *   brainstorm/{lesson}/{block}/{session}/groups                 { groups: [{ id, name, answer_ids }], made_at } (teacher)
 *
 * Safety comes from the published block, never the request:
 *   instant  clean answers go up at once; flagged ones wait for the teacher
 *   approve  every answer waits for the teacher
 *   reveal   answers go up together when the teacher reveals, which also
 *            closes answering so nobody can copy what they've seen
 *
 * Joined students always see the orbit: one symbol per answer on the board,
 * with no text. They see other students' text only when the teacher shares
 * the board and has revealed it, and their cards never carry symbols. Ids a
 * student sees are salted hashes, so neither a card nor an orbiting shape
 * can be traced back to a symbol.
 */
import { randomBytes, randomInt, createHash } from 'node:crypto';
import { isSafeId } from './class-examples.mjs';
import { isDeletedRecord } from './record-liveness.mjs';
import { draftLessonKey, publishedLessonKey } from './teaching-blobs.mjs';
import { flagText } from './peer-feedback-filter.mjs';
import { IDENTITIES, claimedIds, claimSymbol } from './class-symbols.mjs';
import { groupAnswers } from './brainstorm-groups.mjs';

const STRONG = { type: 'json', consistency: 'strong' };
const ACTIVITY_HOURS = 12;
/** "Unlimited" still stops here, so one device can't flood the board. */
export const MAX_PER_STUDENT = 20;
const SAFETY = ['instant', 'approve', 'reveal'];
const LAYOUTS = ['grid', 'cloud', 'groups'];
const MAX_GROUP_NAME = 40;

export class BrainstormError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const reject = (status, code, message) => {
  throw new BrainstormError(status, code, message);
};
const read = (store, key) => store.get(key, STRONG);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const validToken = (token) => typeof token === 'string' && /^[a-f0-9]{48}$/.test(token);

function findBlock(blocks, id) {
  for (const b of blocks ?? []) {
    if (b.visibility === 'teacher_only') continue;
    if (b.id === id && b.block_type === 'brainstorm') return b;
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

/** The block's settings, clamped, so an odd saved value can't loosen safety. */
function settings(block) {
  const c = block.content ?? {};
  const per = Number(c.per_student);
  return {
    question: typeof c.question === 'string' ? c.question.trim() : '',
    safety: SAFETY.includes(c.safety) ? c.safety : 'approve',
    per_student: [0, 1, 3, 5].includes(per) ? per : 3,
    max_length: Number.isInteger(c.max_length) ? Math.min(280, Math.max(20, c.max_length)) : 140,
    layout: LAYOUTS.includes(c.layout) ? c.layout : 'grid'
  };
}

function keys(lesson, block, session) {
  const base = `brainstorm/${lesson}/${block}`;
  return {
    active: `${base}/active`,
    claim: (id) => `${base}/${session}/claims/${id}`,
    token: (tokenHash) => `${base}/${session}/tokens/${tokenHash}`,
    answer: (id, n) => `${base}/${session}/answers/${id}/${n}`,
    moderation: (answerId) => `${base}/${session}/moderation/${answerId}`,
    groups: `${base}/${session}/groups`
  };
}

const answerId = (symbol, n) => `${symbol}.${n}`;
/** An answer id as a student sees it. Rounds started before the salt existed keep their ids. */
const studentId = (activity, id) => (activity.salt ? createHash('sha256').update(`${activity.salt}:${id}`).digest('hex').slice(0, 16) : id);
const parseAnswerId = (id) => {
  const m = /^(\d-\d)\.(\d{1,2})$/.exec(String(id ?? ''));
  return m && IDENTITIES.includes(m[1]) && Number(m[2]) < MAX_PER_STUDENT ? { symbol: m[1], n: Number(m[2]) } : null;
};

/** One student's answers, in the order sent. Reads stop at the first gap. */
async function answersOf(store, k, symbol) {
  const out = [];
  for (let n = 0; n < MAX_PER_STUDENT; n++) {
    const a = await read(store, k.answer(symbol, n));
    if (!a) break;
    out.push({ id: answerId(symbol, n), symbol, ...a });
  }
  return out;
}

/** Every answer this round with its status, oldest first. */
async function allAnswers(store, k, safety) {
  const joined = await claimedIds(store, k.claim);
  const per = await Promise.all(joined.map((id) => answersOf(store, k, id)));
  const answers = per.flat();
  const moderation = await Promise.all(answers.map((a) => read(store, k.moderation(a.id))));
  return {
    joined: joined.length,
    answers: answers
      .map((a, i) => ({ ...a, status: statusOf(a, moderation[i], safety) }))
      .sort((x, y) => String(x.created_at).localeCompare(String(y.created_at)) || x.id.localeCompare(y.id))
  };
}

function statusOf(answer, moderation, safety) {
  if (moderation?.status === 'removed' || moderation?.status === 'shown') return moderation.status;
  if (answer.flagged || safety === 'approve') return 'pending';
  return 'shown';
}

function cleanGroups(groups, ids) {
  const known = new Set(ids);
  return (groups ?? []).map((g) => ({ id: g.id, name: g.name, answer_ids: g.answer_ids.filter((id) => known.has(id)) }));
}

async function teacherAction(store, k, activity, setup, body, opts) {
  const action = body.action ?? 'status';
  const allowed = ['status', 'reveal', 'hide', 'layout', 'students_see', 'symbols', 'symbols_on_cards', 'approve', 'remove', 'group', 'move', 'rename_group'];
  if (!allowed.includes(action)) reject(400, 'bad_action', 'Unknown action.');

  const patch = {};
  if (action === 'reveal') Object.assign(patch, { revealed: true }, setup.safety === 'reveal' ? { open: false } : {});
  if (action === 'hide') patch.revealed = false;
  if (action === 'layout') {
    if (!LAYOUTS.includes(body.value)) reject(400, 'bad_request', 'Unknown layout.');
    patch.layout = body.value;
  }
  if (action === 'students_see') {
    if (!['own', 'all'].includes(body.value)) reject(400, 'bad_request', 'Unknown view.');
    patch.students_see = body.value;
  }
  if (action === 'symbols') patch.show_symbols = body.show === true;
  if (action === 'symbols_on_cards') patch.symbols_on_cards = body.show === true;
  if (Object.keys(patch).length) {
    activity = { ...activity, ...patch };
    await store.setJSON(k.active, activity);
  }

  if (action === 'approve' || action === 'remove') {
    const at = parseAnswerId(body.id);
    if (!at || !(await read(store, k.answer(at.symbol, at.n)))) reject(400, 'bad_request', 'Unknown answer.');
    await store.setJSON(k.moderation(body.id), { status: action === 'approve' ? 'shown' : 'removed' });
  }

  const { joined, answers } = await allAnswers(store, k, setup.safety);
  let groups = (await read(store, k.groups))?.groups ?? null;

  if (action === 'group') {
    const shown = answers.filter((a) => a.status === 'shown');
    if (shown.length < 2) reject(400, 'too_few', 'Reveal at least two answers before grouping.');
    const apiKey = opts.env?.ANTHROPIC_API_KEY;
    if (!apiKey) reject(503, 'ai_unavailable', 'Grouping isn’t available right now.');
    try {
      groups = await groupAnswers({
        question: setup.question,
        answers: shown.map((a) => ({ id: a.id, text: a.text })),
        apiKey,
        fetchImpl: opts.fetchImpl,
        model: opts.env?.BRAINSTORM_GROUP_MODEL
      });
    } catch {
      reject(502, 'ai_failed', 'Grouping didn’t work. Try again.');
    }
    await store.setJSON(k.groups, { groups, made_at: new Date().toISOString() });
  }
  if (action === 'move' || action === 'rename_group') {
    if (!groups) reject(409, 'no_groups', 'Group the answers first.');
    const target = groups.find((g) => g.id === body.group);
    if (!target) reject(400, 'bad_request', 'Unknown group.');
    if (action === 'move') {
      if (!answers.some((a) => a.id === body.id)) reject(400, 'bad_request', 'Unknown answer.');
      groups = groups.map((g) => ({ ...g, answer_ids: g.answer_ids.filter((id) => id !== body.id) }));
      groups.find((g) => g.id === body.group).answer_ids.push(body.id);
    } else {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name || name.length > MAX_GROUP_NAME) reject(400, 'bad_request', `Name it in 1 to ${MAX_GROUP_NAME} characters.`);
      target.name = name;
    }
    await store.setJSON(k.groups, { groups, made_at: new Date().toISOString() });
  }

  return {
    phase: 'live',
    session: activity.session,
    code: activity.code,
    open: activity.open,
    question: setup.question,
    safety: setup.safety,
    per_student: setup.per_student,
    revealed: !!activity.revealed,
    layout: activity.layout,
    students_see: activity.students_see,
    show_symbols: !!activity.show_symbols,
    symbols_on_cards: activity.symbols_on_cards !== false,
    joined,
    answers: answers.map(({ id, symbol, text, flagged, status, created_at }) => ({ id, symbol, text, flagged: !!flagged, status, created_at })),
    groups: groups ? cleanGroups(groups, answers.filter((a) => a.status === 'shown').map((a) => a.id)) : null
  };
}

async function studentAction(store, k, activity, setup, body) {
  const action = body.action ?? 'status';
  if (!['status', 'join', 'submit'].includes(action)) reject(400, 'bad_action', 'Unknown action.');
  if (body.session && body.session !== activity.session) reject(409, 'new_session', 'Your teacher started a new round. Join again.');
  const shared = { phase: 'live', session: activity.session, open: activity.open };
  if (!body.token) {
    if (action !== 'status') reject(400, 'not_joined', 'Join the activity first.');
    return shared;
  }
  if (!validToken(body.token)) reject(400, 'not_joined', 'Join the activity first.');
  const tokenHash = hash(body.token);

  let id;
  if (action === 'join') {
    if (!activity.open) reject(409, 'closed', 'This brainstorm has closed.');
    if (String(body.code ?? '').replace(/\D/g, '') !== activity.code) reject(403, 'wrong_code', 'That code didn’t match. Check the board.');
    id = await claimSymbol(store, k, tokenHash);
    if (!id) reject(409, 'full', 'This activity is full. Ask your teacher.');
  } else {
    id = (await read(store, k.token(tokenHash)))?.symbol;
    if (!id) reject(403, 'not_joined', 'Join the activity first.');
  }

  if (action === 'submit') {
    if (!activity.open) reject(409, 'closed', 'This brainstorm has closed.');
    const text = typeof body.text === 'string' ? body.text.trim().replace(/\s+/g, ' ') : '';
    if (!text) reject(400, 'bad_text', 'Write something first.');
    if (text.length > setup.max_length) reject(400, 'bad_text', `Keep it to ${setup.max_length} characters or fewer.`);
    const cap = setup.per_student || MAX_PER_STUDENT;
    const sent = (await answersOf(store, k, id)).length;
    if (sent >= cap) reject(409, 'limit', 'You’ve reached the answer limit.');
    const saved = await store.setJSON(k.answer(id, sent), { text, flagged: flagText(text), created_at: new Date().toISOString() }, { onlyIfNew: true });
    if (saved?.modified === false) reject(409, 'retry', 'That didn’t go through. Send it again.');
  }

  const own = await answersOf(store, k, id);
  const moderation = await Promise.all(own.map((a) => read(store, k.moderation(a.id))));
  const state = {
    ...shared,
    joined: true,
    symbol: activity.show_symbols ? id : null,
    per_student: setup.per_student,
    max_length: setup.max_length,
    safety: setup.safety,
    revealed: !!activity.revealed,
    mine: own.map((a, i) => ({ text: a.text, status: statusOf(a, moderation[i], setup.safety) })),
    board: null
  };
  const { answers } = await allAnswers(store, k, setup.safety);
  const shown = answers.filter((a) => a.status === 'shown');
  const revealed = activity.students_see === 'all' && !!activity.revealed;
  const groups = revealed ? (await read(store, k.groups))?.groups ?? null : null;
  const masked = (id) => studentId(activity, id);
  state.board = {
    revealed,
    layout: activity.layout,
    count: shown.length,
    // Shapes and cards use different ids, so a shape never flies into its own card.
    orbit: shown.map((a) => ({ id: masked(`orbit:${a.id}`), symbol: a.symbol })).sort((x, y) => x.id.localeCompare(y.id)),
    answers: revealed ? shown.map((a) => ({ id: masked(a.id), text: a.text })) : [],
    groups: groups
      ? cleanGroups(groups, shown.map((a) => a.id)).map(({ id: gid, name, answer_ids }) => ({ id: gid, name, answer_ids: answer_ids.map(masked) }))
      : null
  };
  return state;
}

export async function brainstormAction(store, lesson, block, body, opts = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  const teacher = opts.teacher === true;
  const live = await assertLive(store, lesson, block);
  const setup = settings(live);
  const activeKey = keys(lesson, block, '').active;
  let activity = await read(store, activeKey);

  if (teacher && body.action === 'start') {
    activity = {
      session: randomBytes(16).toString('hex'),
      salt: randomBytes(16).toString('hex'),
      code: String(randomInt(100000, 1000000)),
      open: true,
      expires: Date.now() + ACTIVITY_HOURS * 3600_000,
      revealed: false,
      layout: setup.layout,
      students_see: 'own',
      show_symbols: false,
      symbols_on_cards: true
    };
    await store.setJSON(activeKey, activity);
  }
  if (teacher && body.action === 'end' && activity) {
    activity = { ...activity, open: false };
    await store.setJSON(activeKey, activity);
  }
  if (!activity || activity.expires < Date.now()) return { phase: 'idle' };

  const k = keys(lesson, block, activity.session);
  const rest = body.action === 'start' || body.action === 'end' ? { ...body, action: 'status' } : body;
  return teacher ? teacherAction(store, k, activity, setup, rest, opts) : studentAction(store, k, activity, setup, body);
}
