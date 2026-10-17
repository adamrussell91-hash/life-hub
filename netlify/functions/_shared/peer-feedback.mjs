/**
 * Peer feedback: students write, swap anonymously, and read what came back.
 *
 *   peer_feedback/{lesson}/{block}/active                         round state (teacher writes only)
 *   peer_feedback/{lesson}/{block}/{session}/claims/{symbol}      { token_hash }
 *   peer_feedback/{lesson}/{block}/{session}/tokens/{token_hash}  { symbol }
 *   peer_feedback/{lesson}/{block}/{session}/writing/{symbol}     { text, flagged }
 *   peer_feedback/{lesson}/{block}/{session}/reviews/{symbol}     { strength, suggestion, flagged }, written BY symbol
 *   peer_feedback/{lesson}/{block}/{session}/moderation/{symbol}  { status: released | removed } (teacher)
 *
 * Students never choose or see a symbol. Joining hands out a free one in the
 * background, tied to a random token on the device; the device only keeps
 * the token. The teacher sees everyone by symbol and can switch on "Show
 * student symbols" so each student's own symbol appears on their screen.
 *
 * Text that trips the word check is flagged. Flagged answers start out of the
 * swap; flagged feedback is held from the writer until the teacher releases it.
 *
 * One create-only blob per claim, answer and review, so students never race
 * each other. Only the teacher writes the round, the swap and moderation.
 */
import { randomBytes, randomInt, createHash } from 'node:crypto';
import { isSafeId } from './class-examples.mjs';
import { isDeletedRecord } from './record-liveness.mjs';
import { draftLessonKey, publishedLessonKey } from './teaching-blobs.mjs';
import { flagText } from './peer-feedback-filter.mjs';

const STRONG = { type: 'json', consistency: 'strong' };
const ACTIVITY_HOURS = 12;
export const MAX_WRITING = 8000;
export const MAX_FEEDBACK = 2000;
/** "colour-shape" pairs: six colours by six shapes. */
export const IDENTITIES = Array.from({ length: 36 }, (_, i) => `${i % 6}-${Math.floor(i / 6)}`);

export class PeerError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const reject = (status, code, message) => {
  throw new PeerError(status, code, message);
};
const read = (store, key) => store.get(key, STRONG);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const validToken = (token) => typeof token === 'string' && /^[a-f0-9]{48}$/.test(token);

function findBlock(blocks, id) {
  for (const b of blocks ?? []) {
    if (b.visibility === 'teacher_only') continue;
    if (b.id === id && b.block_type === 'peer_feedback') return b;
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

/** The block must exist in both the draft and the published lesson. */
async function assertLive(store, lesson, block) {
  if (!isSafeId(lesson) || !isSafeId(block)) reject(404, 'not_found', 'Activity not found.');
  const [draft, published] = await Promise.all([
    read(store, draftLessonKey(lesson)),
    read(store, publishedLessonKey(lesson))
  ]);
  const live =
    draft && !isDeletedRecord(draft) && findBlock(draft.blocks, block) && published && findBlock(published.blocks, block);
  if (!live) reject(404, 'not_published', 'Publish this lesson and block before starting an activity.');
}

function keys(lesson, block, session) {
  const base = `peer_feedback/${lesson}/${block}`;
  return {
    active: `${base}/active`,
    claim: (id) => `${base}/${session}/claims/${id}`,
    token: (tokenHash) => `${base}/${session}/tokens/${tokenHash}`,
    writing: (id) => `${base}/${session}/writing/${id}`,
    review: (id) => `${base}/${session}/reviews/${id}`,
    moderation: (id) => `${base}/${session}/moderation/${id}`
  };
}

async function claimedIds(store, k) {
  const claims = await Promise.all(IDENTITIES.map((id) => read(store, k.claim(id))));
  return IDENTITIES.filter((_, i) => claims[i]);
}

function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Who reviews whom: a shuffled ring, so nobody gets their own and every piece gets one reader. */
function ring(ids) {
  const order = shuffle(ids);
  return Object.fromEntries(order.map((id, i) => [id, order[(i + 1) % order.length]]));
}

const reviewerOf = (assignments, writer) => Object.keys(assignments).find((r) => assignments[r] === writer) ?? null;

/** Feedback as the writer may see it: held while flagged and unreleased, gone once removed. */
function visibleReview(review, moderation) {
  if (!review || moderation?.status === 'removed') return null;
  if (review.flagged && moderation?.status !== 'released') return null;
  return { strength: review.strength, suggestion: review.suggestion };
}

async function teacherAction(store, k, activity, body) {
  const action = body.action ?? 'status';
  if (!['status', 'start', 'review', 'results', 'end', 'symbols', 'release', 'remove'].includes(action)) {
    reject(400, 'bad_action', 'Unknown action.');
  }

  if (action === 'symbols') {
    activity = { ...activity, show_symbols: body.show === true };
    await store.setJSON(k.active, activity);
  }
  if (action === 'release' || action === 'remove') {
    if (!IDENTITIES.includes(body.reviewer)) reject(400, 'bad_request', 'Unknown reviewer.');
    await store.setJSON(k.moderation(body.reviewer), { status: action === 'release' ? 'released' : 'removed' });
  }

  const joined = await claimedIds(store, k);
  const writing = Object.fromEntries(await Promise.all(joined.map(async (id) => [id, await read(store, k.writing(id))])));

  if (action === 'review') {
    if (activity.phase !== 'write') reject(409, 'wrong_phase', 'The writing round has already ended.');
    const excluded = new Set(Array.isArray(body.exclude) ? body.exclude : []);
    const included = joined.filter((id) => writing[id] && !excluded.has(id));
    if (included.length < 2) reject(400, 'too_few', 'Include at least two answers to swap.');
    activity = { ...activity, phase: 'review', assignments: ring(included) };
    await store.setJSON(k.active, activity);
  } else if (action === 'results') {
    if (activity.phase !== 'review') reject(409, 'wrong_phase', 'Start the feedback round first.');
    activity = { ...activity, phase: 'results' };
    await store.setJSON(k.active, activity);
  }

  const [reviews, moderation] = await Promise.all(
    [k.review, k.moderation].map(async (key) =>
      Object.fromEntries(await Promise.all(joined.map(async (id) => [id, await read(store, key(id))])))
    )
  );
  const rows = joined.map((id) => {
    const reviewer = reviewerOf(activity.assignments, id);
    const review = reviewer ? reviews[reviewer] : null;
    return {
      id,
      text: writing[id]?.text ?? '',
      flagged: !!writing[id]?.flagged,
      included: id in activity.assignments,
      gave: !!reviews[id],
      reviewer,
      received: review
        ? {
            strength: review.strength,
            suggestion: review.suggestion,
            flagged: !!review.flagged,
            status: moderation[reviewer]?.status ?? (review.flagged ? 'held' : 'ok')
          }
        : null
    };
  });
  return {
    session: activity.session,
    code: activity.code,
    phase: activity.phase,
    show_symbols: !!activity.show_symbols,
    rows
  };
}

/** Hands out a free symbol for this device's token, or finds the one it already has. */
async function join(store, k, tokenHash) {
  const existing = await read(store, k.token(tokenHash));
  if (existing) return existing.symbol;
  const taken = new Set(await claimedIds(store, k));
  for (const id of shuffle(IDENTITIES.filter((x) => !taken.has(x)))) {
    await store.setJSON(k.claim(id), { token_hash: tokenHash }, { onlyIfNew: true });
    const claim = await read(store, k.claim(id));
    if (claim?.token_hash === tokenHash) {
      await store.setJSON(k.token(tokenHash), { symbol: id }, { onlyIfNew: true });
      return id;
    }
  }
  reject(409, 'full', 'This activity is full. Ask your teacher.');
}

async function studentAction(store, k, activity, body) {
  const action = body.action ?? 'status';
  if (!['status', 'join', 'submit', 'feedback'].includes(action)) reject(400, 'bad_action', 'Unknown action.');
  if (body.session && body.session !== activity.session) {
    reject(409, 'new_session', 'Your teacher started a new activity. Join again.');
  }
  const shared = { session: activity.session, phase: activity.phase };
  if (!body.token) {
    if (action !== 'status') reject(400, 'not_joined', 'Join the activity first.');
    return shared;
  }
  if (!validToken(body.token)) reject(400, 'not_joined', 'Join the activity first.');
  const tokenHash = hash(body.token);

  let id;
  if (action === 'join') {
    if (activity.phase !== 'write') reject(409, 'joining_closed', 'Joining has closed for this activity.');
    if (String(body.code ?? '').replace(/\D/g, '') !== activity.code) {
      reject(403, 'wrong_code', 'That code didn’t match. Check the board.');
    }
    id = await join(store, k, tokenHash);
  } else {
    id = (await read(store, k.token(tokenHash)))?.symbol;
    if (!id) reject(403, 'not_joined', 'Join the activity first.');
  }

  const assigned = activity.assignments[id] ?? null;
  if (action === 'submit') {
    if (activity.phase !== 'write') reject(409, 'wrong_phase', 'The writing round has ended.');
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text || text.length > MAX_WRITING) reject(400, 'bad_text', `Write between 1 and ${MAX_WRITING.toLocaleString('en-AU')} characters.`);
    await store.setJSON(k.writing(id), { text, flagged: flagText(text) }, { onlyIfNew: true });
  }
  if (action === 'feedback') {
    if (activity.phase !== 'review' || !assigned) reject(409, 'wrong_phase', 'You have no writing to give feedback on.');
    const [strength, suggestion] = [body.strength, body.suggestion].map((x) => (typeof x === 'string' ? x.trim() : ''));
    if (!strength || !suggestion || strength.length > MAX_FEEDBACK || suggestion.length > MAX_FEEDBACK) {
      reject(400, 'bad_text', 'Fill in both boxes before sending.');
    }
    const flagged = flagText(strength) || flagText(suggestion);
    await store.setJSON(k.review(id), { strength, suggestion, flagged }, { onlyIfNew: true });
  }

  const reviewer = reviewerOf(activity.assignments, id);
  const [own, review, toReview, received, moderation] = await Promise.all([
    read(store, k.writing(id)),
    read(store, k.review(id)),
    assigned && activity.phase === 'review' ? read(store, k.writing(assigned)) : null,
    reviewer && activity.phase === 'results' ? read(store, k.review(reviewer)) : null,
    reviewer && activity.phase === 'results' ? read(store, k.moderation(reviewer)) : null
  ]);
  return {
    ...shared,
    joined: true,
    symbol: activity.show_symbols ? id : null,
    text: own?.text ?? '',
    submitted: !!own,
    included: !!assigned,
    reviewed: !!review,
    assigned_text: toReview?.text ?? '',
    received: visibleReview(received, moderation)
  };
}

export async function peerAction(store, lesson, block, body, teacher = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  await assertLive(store, lesson, block);
  const activeKey = keys(lesson, block, '').active;
  let activity = await read(store, activeKey);

  if (teacher && body.action === 'start') {
    activity = {
      session: randomBytes(16).toString('hex'),
      code: String(randomInt(100000, 1000000)),
      phase: 'write',
      expires: Date.now() + ACTIVITY_HOURS * 3600_000,
      assignments: {},
      show_symbols: false
    };
    await store.setJSON(activeKey, activity);
  }
  if (teacher && body.action === 'end' && activity) {
    activity = { ...activity, expires: 0 };
    await store.setJSON(activeKey, activity);
  }
  if (!activity || activity.expires < Date.now()) return { phase: 'idle' };

  const k = keys(lesson, block, activity.session);
  return teacher ? teacherAction(store, k, activity, body) : studentAction(store, k, activity, body);
}
