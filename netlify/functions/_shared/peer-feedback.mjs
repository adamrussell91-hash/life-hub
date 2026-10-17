/**
 * Peer feedback: students write, swap anonymously, and read what came back.
 *
 *   peer_feedback/{lesson}/{block}/active                       round state (teacher writes only)
 *   peer_feedback/{lesson}/{block}/{session}/claims/{identity}  { token_hash }
 *   peer_feedback/{lesson}/{block}/{session}/writing/{identity} { text }
 *   peer_feedback/{lesson}/{block}/{session}/reviews/{identity} { strength, suggestion }, written BY identity
 *
 * One create-only blob per claim, piece of writing and review, so students
 * never race each other. Only the teacher writes the round and the frozen
 * review assignments. A student proves an identity with a random device token.
 */
import { randomBytes, randomInt, createHash } from 'node:crypto';
import { isSafeId } from './class-examples.mjs';
import { isDeletedRecord } from './record-liveness.mjs';
import { draftLessonKey, publishedLessonKey } from './teaching-blobs.mjs';

const STRONG = { type: 'json', consistency: 'strong' };
const ACTIVITY_HOURS = 12;
export const MAX_WRITING = 8000;
export const MAX_FEEDBACK = 2000;
/** "colour-symbol" pairs: six colours by six symbols. */
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
    writing: (id) => `${base}/${session}/writing/${id}`,
    review: (id) => `${base}/${session}/reviews/${id}`
  };
}

async function claimedIds(store, k) {
  const claims = await Promise.all(IDENTITIES.map((id) => read(store, k.claim(id))));
  return IDENTITIES.filter((_, i) => claims[i]);
}

/** Who reviews whom: a shuffled ring, so nobody gets their own and every piece gets one reader. */
function ring(ids) {
  const order = [...ids];
  for (let i = order.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return Object.fromEntries(order.map((id, i) => [id, order[(i + 1) % order.length]]));
}

const reviewerOf = (assignments, writer) => Object.keys(assignments).find((r) => assignments[r] === writer) ?? null;

async function teacherAction(store, k, activity, body) {
  const action = body.action ?? 'status';
  if (!['status', 'start', 'review', 'results', 'end'].includes(action)) reject(400, 'bad_action', 'Unknown action.');

  const joined = await claimedIds(store, k);
  const writing = Object.fromEntries(
    await Promise.all(joined.map(async (id) => [id, (await read(store, k.writing(id)))?.text ?? '']))
  );

  if (action === 'review') {
    if (activity.phase !== 'write') reject(409, 'wrong_phase', 'The writing round has already ended.');
    const excluded = new Set(Array.isArray(body.exclude) ? body.exclude : []);
    const included = joined.filter((id) => writing[id] && !excluded.has(id));
    if (included.length < 2) reject(400, 'too_few', 'Include at least two pieces of writing to swap.');
    activity = { ...activity, phase: 'review', assignments: ring(included) };
    await store.setJSON(k.active, activity);
  } else if (action === 'results') {
    if (activity.phase !== 'review') reject(409, 'wrong_phase', 'Start the feedback round first.');
    activity = { ...activity, phase: 'results' };
    await store.setJSON(k.active, activity);
  }

  const reviews = Object.fromEntries(
    await Promise.all(joined.map(async (id) => [id, await read(store, k.review(id))]))
  );
  const rows = joined.map((id) => {
    const reviewer = reviewerOf(activity.assignments, id);
    return {
      id,
      text: writing[id],
      included: id in activity.assignments,
      gave: !!reviews[id],
      reviewer,
      received: reviewer ? reviews[reviewer] ?? null : null
    };
  });
  return { session: activity.session, code: activity.code, phase: activity.phase, expires: activity.expires, rows };
}

async function studentAction(store, k, activity, body) {
  const action = body.action ?? 'status';
  if (!['status', 'join', 'submit', 'feedback'].includes(action)) reject(400, 'bad_action', 'Unknown action.');
  if (body.session && body.session !== activity.session) {
    reject(409, 'new_session', 'Your teacher started a new activity. Join again.');
  }
  const shared = { session: activity.session, phase: activity.phase };

  if (!body.identity) {
    if (action !== 'status') reject(400, 'no_identity', 'Choose a symbol to join.');
    return { ...shared, taken: activity.phase === 'write' ? await claimedIds(store, k) : [] };
  }
  const id = body.identity;
  if (!IDENTITIES.includes(id) || typeof body.token !== 'string' || !/^[a-f0-9]{48}$/.test(body.token)) {
    reject(400, 'no_identity', 'Choose a symbol to join.');
  }

  if (action === 'join') {
    if (activity.phase !== 'write') reject(409, 'joining_closed', 'Joining has closed for this activity.');
    if (String(body.code ?? '').trim() !== activity.code) reject(403, 'wrong_code', 'That code didn’t match. Check the board.');
    await store.setJSON(k.claim(id), { token_hash: hash(body.token) }, { onlyIfNew: true });
  }
  const claim = await read(store, k.claim(id));
  if (!claim) reject(403, 'not_joined', 'Join the activity first.');
  if (claim.token_hash !== hash(body.token)) reject(403, 'taken', 'Someone just took that symbol. Pick another.');

  const assigned = activity.assignments[id] ?? null;
  if (action === 'submit') {
    if (activity.phase !== 'write') reject(409, 'wrong_phase', 'The writing round has ended.');
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text || text.length > MAX_WRITING) reject(400, 'bad_text', `Write between 1 and ${MAX_WRITING.toLocaleString('en-AU')} characters.`);
    await store.setJSON(k.writing(id), { text }, { onlyIfNew: true });
  }
  if (action === 'feedback') {
    if (activity.phase !== 'review' || !assigned) reject(409, 'wrong_phase', 'You have no writing to give feedback on.');
    const fields = [body.strength, body.suggestion].map((x) => (typeof x === 'string' ? x.trim() : ''));
    if (fields.some((x) => !x || x.length > MAX_FEEDBACK)) reject(400, 'bad_text', 'Fill in both boxes before sending.');
    await store.setJSON(k.review(id), { strength: fields[0], suggestion: fields[1] }, { onlyIfNew: true });
  }

  const reviewer = reviewerOf(activity.assignments, id);
  const [own, review, toReview, received] = await Promise.all([
    read(store, k.writing(id)),
    read(store, k.review(id)),
    assigned && activity.phase === 'review' ? read(store, k.writing(assigned)) : null,
    reviewer && activity.phase === 'results' ? read(store, k.review(reviewer)) : null
  ]);
  return {
    ...shared,
    identity: id,
    text: own?.text ?? '',
    submitted: !!own,
    included: !!assigned,
    reviewed: !!review,
    assigned_text: toReview?.text ?? '',
    received: received ?? null
  };
}

export async function peerAction(store, lesson, block, body, teacher = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  await assertLive(store, lesson, block);
  let activity = await read(store, keys(lesson, block, '').active);

  if (teacher && body.action === 'start') {
    activity = {
      session: randomBytes(16).toString('hex'),
      code: String(randomInt(100000, 1000000)),
      phase: 'write',
      expires: Date.now() + ACTIVITY_HOURS * 3600_000,
      assignments: {}
    };
    await store.setJSON(keys(lesson, block, '').active, activity);
  }
  if (teacher && body.action === 'end' && activity) {
    activity = { ...activity, expires: 0 };
    await store.setJSON(keys(lesson, block, '').active, activity);
  }
  if (!activity || activity.expires < Date.now()) return { phase: 'idle' };

  const k = keys(lesson, block, activity.session);
  return teacher ? teacherAction(store, k, activity, body) : studentAction(store, k, activity, body);
}
