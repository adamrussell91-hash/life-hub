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
 * Annotate mode (block content `mode: 'annotate'`) swaps each answer to two
 * readers instead of one, and feedback is a set of notes anchored to the text:
 *
 *   .../{session}/annotations/{reviewer}/{writer}       { notes: [{ start, end, quote, code_id?, code_label?, answer?, comment?, flagged? }] }
 *   .../{session}/note_moderation/{reviewer}/{writer}   { notes: { [index]: released | removed } } (teacher)
 *
 * The buttons a note can carry come from the shared bank (peer-feedback-bank.mjs).
 * The writer gets one layer per reviewer, labelled only "Reviewer 1" and "Reviewer 2".
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
import { readBank } from './peer-feedback-bank.mjs';

const STRONG = { type: 'json', consistency: 'strong' };
const ACTIVITY_HOURS = 12;
export const MAX_WRITING = 8000;
export const MAX_FEEDBACK = 2000;
export const MAX_NOTES = 20;
export const MAX_ANSWER = 80;
export const MAX_COMMENT = 300;
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

/** The block must exist in both the draft and the published lesson. Returns the published block. */
async function assertLive(store, lesson, block) {
  if (!isSafeId(lesson) || !isSafeId(block)) reject(404, 'not_found', 'Activity not found.');
  const [draft, published] = await Promise.all([
    read(store, draftLessonKey(lesson)),
    read(store, publishedLessonKey(lesson))
  ]);
  const live =
    draft && !isDeletedRecord(draft) && findBlock(draft.blocks, block) && published && findBlock(published.blocks, block);
  if (!live) reject(404, 'not_published', 'Publish this lesson and block before starting an activity.');
  return live;
}

function keys(lesson, block, session) {
  const base = `peer_feedback/${lesson}/${block}`;
  return {
    active: `${base}/active`,
    claim: (id) => `${base}/${session}/claims/${id}`,
    token: (tokenHash) => `${base}/${session}/tokens/${tokenHash}`,
    writing: (id) => `${base}/${session}/writing/${id}`,
    review: (id) => `${base}/${session}/reviews/${id}`,
    moderation: (id) => `${base}/${session}/moderation/${id}`,
    annotation: (reviewer, writer) => `${base}/${session}/annotations/${reviewer}/${writer}`,
    noteModeration: (reviewer, writer) => `${base}/${session}/note_moderation/${reviewer}/${writer}`
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

/**
 * Annotate mode: each reader takes the next two pieces round a shuffled ring,
 * so everyone gives two and gets two, never their own. With only two pieces
 * in the swap there is nobody else to ask, so each gets one.
 */
function pairRing(ids) {
  const order = shuffle(ids);
  const steps = order.length >= 3 ? [1, 2] : [1];
  return Object.fromEntries(order.map((id, i) => [id, steps.map((step) => order[(i + step) % order.length])]));
}

/** Readers of a piece, in ring order (the order the writer's layers are numbered in). */
const reviewersOf = (assignments, writer) =>
  Object.keys(assignments)
    .filter((r) => assignments[r].includes(writer))
    .sort((a, b) => assignments[a].indexOf(writer) - assignments[b].indexOf(writer));

function cleanNotes(raw, text, codes) {
  if (!Array.isArray(raw) || raw.length === 0) reject(400, 'no_notes', 'Add at least one note before sending.');
  if (raw.length > MAX_NOTES) reject(400, 'too_many', `Keep it to ${MAX_NOTES} notes.`);
  const byId = new Map(codes.map((c) => [c.id, c]));
  return raw.map((n) => {
    const start = Number(n?.start);
    const end = Number(n?.end);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > text.length) {
      reject(400, 'bad_note', 'A note points at text that isn’t there. Reload the page.');
    }
    const code = n.code_id == null ? null : byId.get(n.code_id);
    if (n.code_id != null && !code) reject(400, 'bad_note', 'That feedback button has changed. Reload the page.');
    const [answer, comment] = [n.answer, n.comment].map((x) => (typeof x === 'string' ? x.trim() : ''));
    if (answer.length > MAX_ANSWER || comment.length > MAX_COMMENT) reject(400, 'bad_note', 'Keep each note short.');
    if (!code && !comment) reject(400, 'bad_note', 'Pick a button or write a comment for every note.');
    if (code?.ask && !answer) reject(400, 'bad_note', `Fill in “${code.ask}” for ${code.label}.`);
    const note = { start, end, quote: text.slice(start, end) };
    if (code) Object.assign(note, { code_id: code.id, code_label: code.label });
    if (code?.ask) note.answer = answer;
    if (comment) note.comment = comment;
    if (flagText(note.answer ?? '') || flagText(comment)) note.flagged = true;
    return note;
  });
}

function noteStatus(note, i, moderation) {
  const status = moderation?.notes?.[i];
  if (status === 'removed' || status === 'released') return status;
  return note.flagged ? 'held' : 'ok';
}

/** Notes as the writer may see them: held while flagged and unreleased, gone once removed. */
function visibleNotes(review, moderation) {
  return (review?.notes ?? []).flatMap((note, i) => {
    const status = noteStatus(note, i, moderation);
    if (status === 'removed' || status === 'held') return [];
    const { flagged: _flagged, ...shown } = note;
    return [shown];
  });
}

/** Feedback as the writer may see it: held while flagged and unreleased, gone once removed. */
function visibleReview(review, moderation) {
  if (!review || moderation?.status === 'removed') return null;
  if (review.flagged && moderation?.status !== 'released') return null;
  return { strength: review.strength, suggestion: review.suggestion };
}

async function teacherAction(store, k, activity, body) {
  const action = body.action ?? 'status';
  const annotate = activity.mode === 'annotate';
  if (!['status', 'start', 'review', 'results', 'end', 'symbols', 'release', 'remove', 'release_note', 'remove_note'].includes(action)) {
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
  if (action === 'release_note' || action === 'remove_note') {
    const pairs = annotate ? activity.assignments[body.reviewer] : null;
    if (!pairs?.includes(body.writer) || !Number.isInteger(body.note) || body.note < 0) reject(400, 'bad_request', 'Unknown note.');
    const current = (await read(store, k.noteModeration(body.reviewer, body.writer))) ?? { notes: {} };
    await store.setJSON(k.noteModeration(body.reviewer, body.writer), {
      notes: { ...current.notes, [body.note]: action === 'release_note' ? 'released' : 'removed' }
    });
  }

  const joined = await claimedIds(store, k);
  const writing = Object.fromEntries(await Promise.all(joined.map(async (id) => [id, await read(store, k.writing(id))])));

  if (action === 'review') {
    if (activity.phase !== 'write') reject(409, 'wrong_phase', 'The writing round has already ended.');
    const excluded = new Set(Array.isArray(body.exclude) ? body.exclude : []);
    const included = joined.filter((id) => writing[id] && !excluded.has(id));
    if (included.length < 2) reject(400, 'too_few', 'Include at least two answers to swap.');
    activity = { ...activity, phase: 'review', assignments: annotate ? pairRing(included) : ring(included) };
    await store.setJSON(k.active, activity);
  } else if (action === 'results') {
    if (activity.phase !== 'review') reject(409, 'wrong_phase', 'Start the feedback round first.');
    activity = { ...activity, phase: 'results' };
    await store.setJSON(k.active, activity);
  }

  if (annotate) return annotateTeacherState(store, k, activity, joined, writing);

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

async function annotateTeacherState(store, k, activity, joined, writing) {
  const reviewOf = async (reviewer, writer) => {
    const [review, moderation] = await Promise.all([
      read(store, k.annotation(reviewer, writer)),
      read(store, k.noteModeration(reviewer, writer))
    ]);
    return { review, moderation };
  };
  const rows = await Promise.all(
    joined.map(async (id) => {
      const readers = reviewersOf(activity.assignments, id);
      const layers = await Promise.all(
        readers.map(async (reviewer) => {
          const { review, moderation } = await reviewOf(reviewer, id);
          return {
            reviewer,
            sent: !!review,
            notes: (review?.notes ?? []).map((note, i) => ({ ...note, flagged: !!note.flagged, i, status: noteStatus(note, i, moderation) }))
          };
        })
      );
      const toGive = activity.assignments[id] ?? [];
      const given = await Promise.all(toGive.map((writer) => read(store, k.annotation(id, writer))));
      return {
        id,
        text: writing[id]?.text ?? '',
        flagged: !!writing[id]?.flagged,
        included: id in activity.assignments,
        gave: given.filter(Boolean).length,
        to_give: toGive.length,
        layers
      };
    })
  );
  return {
    session: activity.session,
    code: activity.code,
    phase: activity.phase,
    mode: 'annotate',
    show_symbols: !!activity.show_symbols,
    codes: await readBank(store),
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
  if (!['status', 'join', 'submit', 'feedback', 'annotate'].includes(action)) reject(400, 'bad_action', 'Unknown action.');
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

  if (activity.mode === 'annotate') return annotateStudent(store, k, activity, id, action, body);

  const assigned = activity.assignments[id] ?? null;
  if (action === 'submit') await submitWriting(store, k, activity, id, body);
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

async function submitWriting(store, k, activity, id, body) {
  if (activity.phase !== 'write') reject(409, 'wrong_phase', 'The writing round has ended.');
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text || text.length > MAX_WRITING) reject(400, 'bad_text', `Write between 1 and ${MAX_WRITING.toLocaleString('en-AU')} characters.`);
  await store.setJSON(k.writing(id), { text, flagged: flagText(text) }, { onlyIfNew: true });
}

async function annotateStudent(store, k, activity, id, action, body) {
  if (action === 'feedback') reject(400, 'bad_action', 'Unknown action.');
  const assigned = activity.assignments[id] ?? [];
  if (action === 'submit') await submitWriting(store, k, activity, id, body);
  const codes = await readBank(store);
  if (action === 'annotate') {
    const writer = Number.isInteger(body.piece) ? assigned[body.piece] : undefined;
    if (activity.phase !== 'review' || !writer) reject(409, 'wrong_phase', 'You have no writing to give feedback on.');
    const piece = await read(store, k.writing(writer));
    const notes = cleanNotes(body.notes, piece?.text ?? '', codes);
    await store.setJSON(k.annotation(id, writer), { notes }, { onlyIfNew: true });
  }

  const own = await read(store, k.writing(id));
  const state = {
    session: activity.session,
    phase: activity.phase,
    mode: 'annotate',
    joined: true,
    symbol: activity.show_symbols ? id : null,
    text: own?.text ?? '',
    submitted: !!own,
    included: assigned.length > 0,
    codes: codes.map(({ id: codeId, label, colour, ask }) => ({ id: codeId, label, colour, ...(ask ? { ask } : {}) }))
  };
  if (activity.phase === 'review') {
    const pieces = await Promise.all(
      assigned.map(async (writer) => {
        const [writing, sent] = await Promise.all([read(store, k.writing(writer)), read(store, k.annotation(id, writer))]);
        return { text: writing?.text ?? '', sent: !!sent };
      })
    );
    state.pieces = pieces;
    state.reviewed = pieces.length > 0 && pieces.every((p) => p.sent);
  }
  if (activity.phase === 'results') {
    // Resources are attached now, from the bank as it is today.
    state.codes = codes;
    const layers = await Promise.all(
      reviewersOf(activity.assignments, id).map(async (reviewer) => {
        const [review, moderation] = await Promise.all([
          read(store, k.annotation(reviewer, id)),
          read(store, k.noteModeration(reviewer, id))
        ]);
        return visibleNotes(review, moderation);
      })
    );
    state.layers = layers.filter((notes) => notes.length).map((notes) => ({ notes }));
  }
  return state;
}

export async function peerAction(store, lesson, block, body, teacher = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  const live = await assertLive(store, lesson, block);
  const activeKey = keys(lesson, block, '').active;
  let activity = await read(store, activeKey);

  if (teacher && body.action === 'start') {
    activity = {
      session: randomBytes(16).toString('hex'),
      code: String(randomInt(100000, 1000000)),
      phase: 'write',
      expires: Date.now() + ACTIVITY_HOURS * 3600_000,
      assignments: {},
      show_symbols: false,
      mode: live.content?.mode === 'annotate' ? 'annotate' : 'comments'
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
