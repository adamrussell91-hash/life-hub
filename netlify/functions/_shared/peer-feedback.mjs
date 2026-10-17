/** Classroom exchanges use one immutable object per claim, writing and review.
 * Only the teacher writes the active round and frozen review assignments. */
import { randomBytes, randomInt, createHash } from 'node:crypto';
import { isSafeId } from './class-examples.mjs';
import { isDeletedRecord } from './record-liveness.mjs';
import { draftLessonKey, publishedLessonKey } from './teaching-blobs.mjs';
const STRONG = { type: 'json', consistency: 'strong' };
export const IDENTITIES = Array.from({ length: 36 }, (_, i) => `${i % 6}-${Math.floor(i / 6)}`);
const baseKey = (lesson, block) => `peer_feedback/${lesson}/${block}`;
const hash = value => createHash('sha256').update(value).digest('hex');
export class PeerError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const reject = (status, message) => { throw new PeerError(status, message); };
const read = (store, path) => store.get(path, STRONG);
function find(blocks, id) {
  for (const b of blocks ?? []) {
    if (b.visibility === 'teacher_only') continue;
    if (b.id === id && b.block_type === 'peer_feedback') return b;
    const nested = [b.content?.blocks, ...(b.content?.columns ?? []).map(x => x.blocks), ...(b.content?.tabs ?? []).map(x => x.blocks)];
    for (const children of nested) { const hit = find(children, id); if (hit) return hit; }
  }
}
async function liveBlock(store, lesson, block) {
  if (!isSafeId(lesson) || !isSafeId(block)) reject(404, 'Activity not found.');
  const [draft, published] = await Promise.all([read(store, draftLessonKey(lesson)), read(store, publishedLessonKey(lesson))]);
  if (!draft || isDeletedRecord(draft) || !find(draft.blocks, block) || !published || !find(published.blocks, block)) reject(404, 'Publish this lesson and block before starting an activity.');
}
const child = (base, session, kind, id) => `${base}/${session}/${kind}/${id}`;
async function roster(store, base, session) {
  return Promise.all(IDENTITIES.map(async id => {
    const [claim, writing] = await Promise.all([read(store, child(base, session, 'claims', id)), read(store, child(base, session, 'writing', id))]);
    return { id, joined: !!claim, text: writing?.text ?? '' };
  }));
}
export async function peerAction(store, lesson, block, body, teacher = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'Invalid request.');
  await liveBlock(store, lesson, block);
  const base = baseKey(lesson, block);
  let activity = await read(store, `${base}/active`);
  const action = body.action ?? 'status';
  if (teacher && action === 'start') {
    activity = { session: randomBytes(16).toString('hex'), code: String(randomInt(100000, 1000000)), phase: 'write', expires: Date.now() + 12 * 3600000, assignments: {} };
    await store.setJSON(`${base}/active`, activity);
  }
  if (!activity || activity.expires < Date.now()) return { phase: 'idle' };
  if (teacher) {
    const rows = await roster(store, base, activity.session);
    if (action === 'review') {
      if (activity.phase !== 'write') reject(409, 'The writing round has already ended.');
      const excluded = new Set(Array.isArray(body.exclude) ? body.exclude : []);
      const ids = rows.filter(r => r.text && !excluded.has(r.id)).map(r => r.id);
      if (ids.length < 2) reject(400, 'Include at least two pieces of writing.');
      for (let i = ids.length - 1; i > 0; i--) { const j = randomInt(i + 1); [ids[i], ids[j]] = [ids[j], ids[i]]; }
      activity.assignments = Object.fromEntries(ids.map((id, i) => [id, ids[(i + 1) % ids.length]]));
      activity.phase = 'review';
      await store.setJSON(`${base}/active`, activity);
    } else if (action === 'results' || action === 'close') {
      if (action === 'results' && activity.phase !== 'review') reject(409, 'Start the feedback round first.');
      activity.phase = 'results';
      await store.setJSON(`${base}/active`, activity);
    } else if (action !== 'status' && action !== 'start') reject(400, 'Unknown action.');
    const reviews = await Promise.all(rows.map(r => read(store, child(base, activity.session, 'reviews', r.id))));
    return { ...activity, rows: rows.map((r, i) => ({ ...r, review: reviews[i] ?? null })) };
  }
  if (body.session && body.session !== activity.session) reject(409, 'Your teacher started a new activity. Join again.');
  const publicState = { session: activity.session, phase: activity.phase };
  if (!body.identity) {
    if (action !== 'status') reject(400, 'Choose an identity to join.');
    const rows = await roster(store, base, activity.session);
    return { ...publicState, taken: rows.filter(r => r.joined).map(r => r.id) };
  }
  if (!IDENTITIES.includes(body.identity) || typeof body.token !== 'string' || !/^[a-f0-9]{48}$/.test(body.token)) reject(400, 'Choose an identity to join.');
  const id = body.identity;
  const claimKey = child(base, activity.session, 'claims', id);
  if (action === 'join') {
    if (activity.phase !== 'write') reject(409, 'Joining is closed.');
    if (body.code !== activity.code) reject(403, 'Check the activity code.');
    await store.setJSON(claimKey, { token_hash: hash(body.token) }, { onlyIfNew: true });
  }
  const claim = await read(store, claimKey);
  if (!claim || claim.token_hash !== hash(body.token)) reject(403, 'That identity is already taken. Choose another.');
  if (action === 'submit') {
    if (activity.phase !== 'write') reject(409, 'The writing round has ended.');
    if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 8000) reject(400, 'Write between 1 and 8,000 characters.');
    await store.setJSON(child(base, activity.session, 'writing', id), { text: body.text.trim() }, { onlyIfNew: true });
  }
  const assigned = activity.assignments[id];
  if (action === 'feedback') {
    if (activity.phase !== 'review' || !assigned) reject(409, 'You have no writing assigned for review.');
    if (![body.strength, body.suggestion].every(x => typeof x === 'string' && x.trim() && x.length <= 2000)) reject(400, 'Complete both feedback fields (up to 2,000 characters each).');
    await store.setJSON(child(base, activity.session, 'reviews', id), { strength: body.strength.trim(), suggestion: body.suggestion.trim() }, { onlyIfNew: true });
  }
  if (!['status', 'join', 'submit', 'feedback'].includes(action)) reject(400, 'Unknown action.');
  const [own, review, writing] = await Promise.all([
    read(store, child(base, activity.session, 'writing', id)),
    read(store, child(base, activity.session, 'reviews', id)),
    assigned ? read(store, child(base, activity.session, 'writing', assigned)) : null
  ]);
  const reviewer = Object.keys(activity.assignments).find(r => activity.assignments[r] === id);
  const received = activity.phase === 'results' && reviewer ? await read(store, child(base, activity.session, 'reviews', reviewer)) : null;
  return { ...publicState, identity: id, text: own?.text ?? '', submitted: !!own, reviewed: !!review, assigned_text: writing?.text ?? '', received, included: !!assigned };
}
