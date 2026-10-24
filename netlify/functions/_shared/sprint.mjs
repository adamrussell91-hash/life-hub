/**
 * Design Sprints. Publish keeps the whole student-safe body public (brief and
 * phase guides are for everyone) with a public `sprint` subset; the groups,
 * class and rules go to sprint/{lesson}/config. Student and teacher actions
 * below read and write the records listed in sprint-keys.mjs. No model is
 * called here.
 */
import { isSafeId } from './class-examples.mjs';
import { publishedLessonKey } from './teaching-blobs.mjs';
import { loadRoster } from './class-claims.mjs';
import { QuizError, deviceHash, read, reject } from './question-drop.mjs';
import { identify } from './quiz.mjs';
import { PAYLOAD_SCHEMAS, SprintSettingsSchema } from './sprint-schema.mjs';
import { openPhases, lockState, isFrozen, isLate, tally, heatLevels, endsAtEpoch, phaseDue } from './sprint-rules.mjs';
import { sprintKeys, emptyGroup, emptyLock } from './sprint-keys.mjs';

export { QuizError as SprintError };

const strip = (c) => ({ id: c.id, text: c.text });

export function prepareSprintPublish(draft, studentBlocks) {
  const s = draft.sprint;
  const snapshot = {
    blocks: studentBlocks,
    sprint: {
      support: s.support,
      lock_hours: s.lock_hours,
      criteria: s.criteria.map(strip),
      reflection_criteria: s.reflection_criteria.map(strip),
      reflection_prompts: [...s.reflection_prompts],
      requirements: s.requirements,
      idea_guide: s.idea_guide,
      phases: s.phases
    }
  };
  const config = {
    version: Date.now().toString(36),
    class_id: s.class_id,
    decider: s.decider,
    lock_hours: s.lock_hours,
    groups: s.groups.map((g) => ({ id: g.id, name: g.name, students: [...g.students] })),
    phases: s.phases.map((p) => ({ key: p.key, where: p.where, due_date: p.due_date, due_time: p.due_time, ends_at: p.ends_at })),
    ideas: Object.fromEntries(s.phases.filter((p) => p.ideas).map((p) => [p.key, p.ideas])),
    criteria: s.criteria.map((c) => c.id),
    reflection_criteria: s.reflection_criteria.map((c) => c.id),
    requirements: s.requirements.map((r) => ({ id: r.id, phases: [...r.phases] }))
  };
  return { snapshot, config };
}

/** The server's copy of sprintIssues (apps/teaching/src/sprint/model.ts): the browser checks first, this stops a stale or hand-made draft. */
export function sprintPublishProblems(draft) {
  if (!draft.sprint) return ['Set up the sprint’s Kit before publishing.'];
  const parsed = SprintSettingsSchema.safeParse(draft.sprint);
  if (!parsed.success) return [`The sprint’s Kit isn’t valid: ${parsed.error.issues[0]?.message ?? 'check the settings'}`];
  const s = parsed.data;
  const out = [];
  if (s.criteria.length < 2) out.push('Add at least 2 criteria in the Kit.');
  const dues = s.phases.map((p) => phaseDue(p));
  if (dues.some((d) => d === null)) out.push('Set a deadline for every phase.');
  else if (dues.some((d, i) => i > 0 && d <= dues[i - 1])) out.push('Each phase’s deadline must come after the one before it.');
  if (!s.groups.length || s.groups.some((g) => !g.students.length)) out.push('Put every student in a group.');
  const all = s.groups.flatMap((g) => g.students);
  if (new Set(all).size < all.length) out.push('A student is in two groups. Keep each student in one group.');
  return out;
}

export async function storeSprintConfig(store, lessonId, config) {
  await store.setJSON(sprintKeys(lessonId).config, config);
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

let clock = () => Date.now();
/** Tests set the time; pass nothing to go back to the real clock. */
export const setSprintClock = (fn) => { clock = fn ?? (() => Date.now()); };
const iso = (ms) => new Date(ms).toISOString();
const list = (v) => (Array.isArray(v) ? v : []);
export const PHASES = ['understand', 'sketch', 'decide', 'prototype', 'test'];
const short = (text) => deviceHash(text).slice(0, 12);
export const ownerOf = (classId, studentId) => deviceHash(`student:${classId}:${studentId}`);

async function loadSprint(store, lessonId) {
  if (!isSafeId(lessonId)) reject(404, 'not_found', 'Sprint not found.');
  const lesson = await read(store, publishedLessonKey(lessonId));
  if (!lesson) reject(404, 'not_found', 'Sprint not found.');
  if (lesson.pedagogical_mode !== 'design_sprint') reject(409, 'not_sprint', 'This lesson isn’t a design sprint.');
  const config = await read(store, sprintKeys(lessonId).config);
  if (!config) reject(409, 'not_published', 'Publish the sprint again.');
  return { lesson, config };
}

/** A phase's dates after any extension: student beats group beats class. */
export function phaseFor(config, extend, key, groupId, studentId) {
  const base = config.phases.find((p) => p.key === key);
  const over = (studentId && extend?.student?.[studentId]?.[key]) || extend?.group?.[groupId]?.[key] || extend?.class?.[key];
  return over ? { ...base, ...over } : base;
}
const groupPhases = (config, extend, groupId) => PHASES.map((key) => phaseFor(config, extend, key, groupId, null));

export async function groupState(store, k, groupId) {
  return { ...emptyGroup(), ...((await read(store, k.group(groupId))) ?? {}) };
}

export function factsFor(group, state, lockRec) {
  return {
    size: group.students.length,
    submitted: Object.fromEntries(PHASES.map((key) => [key, list(state.in?.[key]).filter((s) => group.students.includes(s)).length])),
    ended: lockRec.ended ?? {},
    lock: lockRec.lock ?? null
  };
}

/** True once a phase is over for the group: all in, past its deadline, or its class part ended. */
export function phaseDone(config, extend, group, state, lockRec, key, now) {
  const due = phaseDue(phaseFor(config, extend, key, group.id, null));
  const allIn = group.students.length > 0 && group.students.every((s) => list(state.in?.[key]).includes(s));
  return allIn || (due !== null && due <= now) || !!lockRec.ended?.[key];
}

/**
 * End a class part at `at`: students who opened the phase before then were
 * there, so their work is frozen and submitted as it stands; then the sprint
 * locks for lock_hours. Running it twice changes nothing.
 */
export async function endClassPart(store, lessonId, config, phase, at) {
  const k = sprintKeys(lessonId);
  const rec = { ...emptyLock(), ...((await read(store, k.lock)) ?? {}) };
  if (rec.ended[phase]) return rec;
  const present = [];
  for (const g of config.groups) {
    const state = await groupState(store, k, g.id);
    let changed = false;
    for (const s of g.students) {
      const owner = ownerOf(config.class_id, s);
      const seen = (await read(store, k.seen(owner))) ?? {};
      if (!seen[phase] || Date.parse(seen[phase]) > at) continue;
      present.push(s);
      const sub = await read(store, k.sub(owner, phase));
      if (!sub) continue;
      await store.setJSON(k.sub(owner, phase), { ...sub, frozen: true, submitted_at: sub.submitted_at ?? iso(at), late: sub.late ?? false });
      if (!list(state.in[phase]).includes(s)) {
        state.in = { ...state.in, [phase]: [...list(state.in[phase]), s] };
        changed = true;
      }
    }
    if (changed) await store.setJSON(k.group(g.id), state);
  }
  const next = {
    ended: { ...rec.ended, [phase]: { at: iso(at), present } },
    lock: config.lock_hours > 0 ? { phase, until: iso(at + config.lock_hours * 3600000), unlocked: [] } : null
  };
  await store.setJSON(k.lock, next);
  return next;
}

/** Class parts whose end time has passed end on their own, as if End class part was pressed then. */
export async function endDueClassParts(store, lessonId, config) {
  const now = clock();
  let rec = { ...emptyLock(), ...((await read(store, sprintKeys(lessonId).lock)) ?? {}) };
  for (const p of config.phases) {
    if (p.where !== 'class' || rec.ended[p.key]) continue;
    const at = endsAtEpoch(p.ends_at ?? '');
    if (at !== null && at <= now) rec = await endClassPart(store, lessonId, config, p.key, at);
  }
  return rec;
}

// ---------------------------------------------------------------------------
// Anonymous ids. Notes, sets and ideas get ids made from the lesson and the
// author's owner hash, so the server can map them back and students can't.
// ---------------------------------------------------------------------------

const noteId = (lessonId, owner, i) => short(`${lessonId}:note:${owner}:${i}`);
const setId = (lessonId, owner) => short(`${lessonId}:set:${owner}`);
const ideaId = (lessonId, owner, cardId) => short(`${lessonId}:idea:${owner}:${cardId}`);

/** Every group member's subs for one phase: [{ student, owner, sub }]. */
async function groupSubs(store, lessonId, config, group, phase) {
  const k = sprintKeys(lessonId);
  return Promise.all(group.students.map(async (student) => {
    const owner = ownerOf(config.class_id, student);
    return { student, owner, sub: await read(store, k.sub(owner, phase)) };
  }));
}

export async function groupNotes(store, lessonId, config, group) {
  const subs = await groupSubs(store, lessonId, config, group, 'understand');
  return subs.flatMap(({ student, owner, sub }) =>
    list(sub?.payload?.notes).map((text, i) => ({ id: noteId(lessonId, owner, i), index: i, text, student, star: sub?.payload?.star ?? '' })).filter((n) => n.text.trim())
  );
}

/** The gallery: submitted sketches, each author's cards as one set, strongest first. Sets are ordered by id, never by roster. */
export async function groupGallery(store, lessonId, config, group, closedAt) {
  const subs = await groupSubs(store, lessonId, config, group, 'sketch');
  return subs
    .filter(({ sub }) => sub?.submitted_at && (!closedAt || Date.parse(sub.submitted_at) <= Date.parse(closedAt)))
    .map(({ student, owner, sub }) => {
      const cards = list(sub.payload.cards);
      const strongest = sub.payload.strongest;
      const ordered = [...cards.filter((c) => c.id === strongest), ...cards.filter((c) => c.id !== strongest)];
      return {
        id: setId(lessonId, owner),
        student,
        ideas: ordered.map((c) => ({ id: ideaId(lessonId, owner, c.id), index: cards.indexOf(c), title: c.title, idea: c.idea, answers: c.answers, evidence: c.evidence, file: c.file ?? null, strongest: c.id === strongest }))
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Settle what a closed phase decides: the group question after Understand,
 * the chosen idea after Decide's votes. With the teacher as decider (or a
 * tie, or nothing to choose from) the group waits on the teacher instead.
 */
export async function resolveGroup(store, lessonId, config, group, state, lockRec, extend, now) {
  const k = sprintKeys(lessonId);
  let next = state;
  if (!next.question && next.awaiting?.kind !== 'question' && phaseDone(config, extend, group, next, lockRec, 'understand', now)) {
    const notes = await groupNotes(store, lessonId, config, group);
    const subs = await groupSubs(store, lessonId, config, group, 'understand');
    const t = tally(subs.map(({ sub }) => ({ star: sub?.payload?.star ?? '' })), ['star'], notes.map((n) => n.id));
    const top = notes.find((n) => n.id === t.top);
    next = config.decider === 'top_vote' && top
      ? { ...next, question: { id: top.id, text: top.text } }
      : { ...next, awaiting: { kind: 'question', tie: t.tie, empty: notes.length === 0 } };
  }
  const votesIn = group.students.every((s) => list(next.voted).includes(s));
  const decideOver = phaseDone(config, extend, group, next, lockRec, 'decide', now);
  if (!next.votes_closed_at && (votesIn || decideOver) && (next.question || next.awaiting?.kind !== 'question')) {
    const closedAt = iso(now);
    const gallery = await groupGallery(store, lessonId, config, group, closedAt);
    const ideas = gallery.flatMap((set) => set.ideas.map((i) => i.id));
    const subs = await groupSubs(store, lessonId, config, group, 'decide');
    const t = tally(subs.map(({ sub }) => sub?.payload?.votes ?? {}), config.criteria, ideas);
    next = { ...next, votes_closed_at: closedAt };
    if (config.decider === 'top_vote' && t.top) next.chosen = t.top;
    else next.awaiting = { kind: 'idea', tie: t.tie, empty: ideas.length === 0 };
  }
  if (next !== state) await store.setJSON(k.group(group.id), next);
  return next;
}

// ---------------------------------------------------------------------------
// Student actions
// ---------------------------------------------------------------------------

const STUDENT_ACTIONS = ['status', 'claim', 'open', 'save', 'submit', 'parts', 'claim_part', 'pitch', 'feedback'];

async function whoAndGroup(store, config, body, action) {
  let who;
  try {
    who = await identify(store, body, action);
  } catch (e) {
    if (e instanceof QuizError && e.code === 'need_class') reject(e.status, 'need_class', 'Open this sprint from your class page.');
    throw e;
  }
  if (who.need === 'class') reject(403, 'need_class', 'Open this sprint from your class page.');
  const group = who.student && who.classId === config.class_id ? config.groups.find((g) => g.students.includes(who.student.id)) ?? null : null;
  return { who, group };
}

/** Throws unless this student may change this phase now. */
function mayEdit(view, phase) {
  const row = view.phases.find((p) => p.key === phase);
  if (!row) reject(400, 'bad_phase', 'Unknown phase.');
  if (view.lock) reject(423, 'locked', 'The sprint is locked for now. It opens again soon.');
  if (!row.open) reject(409, 'not_open', 'This phase hasn’t opened yet.');
  if (row.frozen) reject(409, 'frozen', 'Your class work for this phase is in.');
  if (row.state === 'in' && row.closed) reject(409, 'closed', 'This phase has closed.');
}

/**
 * Everything the student's screen needs. Authors are never included:
 * notes, sets and ideas carry anonymous ids, and vote counts become heat
 * levels only once voting has closed.
 */
async function studentView(store, lessonId, config, who, group) {
  const k = sprintKeys(lessonId);
  const now = clock();
  const sid = who.student.id;
  const owner = ownerOf(config.class_id, sid);
  const lockRec = await endDueClassParts(store, lessonId, config);
  const extend = (await read(store, k.extend)) ?? {};
  let state = await groupState(store, k, group.id);
  state = await resolveGroup(store, lessonId, config, group, state, lockRec, extend, now);
  const open = openPhases(groupPhases(config, extend, group.id), factsFor(group, state, lockRec), now);
  const roster = await loadRoster(store, config.class_id);
  const initials = new Map(list(roster?.students).map((s) => [s.id, s.initials]));
  const mine = {};
  const phases = [];
  for (const key of PHASES) {
    const sub = await read(store, k.sub(owner, key));
    if (sub) mine[key] = sub.payload;
    const p = phaseFor(config, extend, key, group.id, sid);
    const due = phaseDue(p);
    phases.push({
      key,
      open: open.includes(key),
      due_date: p.due_date,
      due_time: p.due_time,
      state: sub?.submitted_at ? 'in' : sub ? 'draft' : 'none',
      late: !!sub?.late,
      frozen: !!sub?.frozen || isFrozen(lockRec.ended ?? {}, key, sid),
      closed: due !== null && due <= now,
      count_in: list(state.in[key]).filter((s) => group.students.includes(s)).length
    });
  }
  const notes = (await groupNotes(store, lessonId, config, group)).map((n) => ({ id: n.id, text: n.text, mine: n.student === sid }));
  const gallery = open.includes('decide') ? (await groupGallery(store, lessonId, config, group, state.votes_closed_at)).map(({ id, ideas }) => ({ id, ideas })) : null;
  let heat = null;
  if (state.votes_closed_at && gallery) {
    const subs = await groupSubs(store, lessonId, config, group, 'decide');
    const t = tally(subs.map(({ sub }) => sub?.payload?.votes ?? {}), config.criteria, gallery.flatMap((s) => s.ideas.map((i) => i.id)));
    heat = heatLevels(t.counts, config.criteria);
  }
  const chosenIdea = state.chosen && gallery ? gallery.flatMap((s) => s.ideas).find((i) => i.id === state.chosen) ?? null : null;
  const view = {
    identity: { need: null, initials: who.student.initials },
    group: { id: group.id, name: group.name, size: group.students.length, mates: group.students.filter((s) => s !== sid).map((s) => initials.get(s) ?? '–') },
    phases,
    lock: lockState(lockRec.lock, sid, now).locked ? { until: lockRec.lock.until } : null,
    mine,
    notes,
    question: state.question ? { text: state.question.text } : null,
    gallery,
    heat,
    votes_closed: !!state.votes_closed_at,
    chosen: chosenIdea ? { id: chosenIdea.id, title: chosenIdea.title, idea: chosenIdea.idea } : null,
    awaiting: state.awaiting ? { kind: state.awaiting.kind } : null,
    parts: list(state.parts).map((p) => ({ ...p, claimed: list(state.claims[p.id]).length, mine: list(state.claims[p.id]).includes(sid) })),
    pitch: state.pitch ? { kind: state.pitch.kind, name: state.pitch.name ?? '', file: state.pitch.file ?? null, link: state.pitch.link ?? '' } : null
  };
  return view;
}

/** Structural checks the server makes before a submit; the browser shows the kinder, fuller checks. */
async function submitProblem(store, lessonId, config, group, sid, phase, payload, view) {
  if (phase === 'understand') {
    if (!payload.notes.some((n) => n.trim())) return ['need_notes', 'Write at least one question first.'];
    if (!view.notes.some((n) => n.id === payload.star)) return ['need_star', 'Star one of your group’s questions.'];
  }
  if (phase === 'sketch' && !payload.cards.length) return ['need_ideas', 'Write at least one idea first.'];
  if (phase === 'decide') {
    if (!config.criteria.every((c) => payload.votes[c])) return ['need_votes', 'Give every criterion to one idea.'];
    if (!view.parts.some((p) => p.mine)) return ['need_part', 'Claim a part of the prototype.'];
  }
  if (phase === 'test' && payload.reflection.filter((r) => r.trim()).length < 2) return ['need_reflection', 'Answer both reflection questions.'];
  return null;
}

export async function sprintAction(store, lessonId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  const action = body.action ?? 'status';
  if (!STUDENT_ACTIONS.includes(action)) reject(400, 'bad_action', 'Unknown action.');
  const { config } = await loadSprint(store, lessonId);
  const { who, group } = await whoAndGroup(store, config, body, action);
  const identity = { need: who.need, initials: who.student?.initials ?? null };
  if (who.need === 'initials') {
    if (action !== 'status' && action !== 'claim') reject(403, 'need_initials', 'Type your initials first.');
    return { identity, group: null };
  }
  if (!who.student) {
    if (action === 'status' || action === 'claim') return { identity, group: null, anonymous: true };
    reject(403, 'no_list', 'Your teacher hasn’t added a class list yet.');
  }
  if (!group) {
    if (action === 'status' || action === 'claim') return { identity, group: null, not_for_you: true };
    reject(403, 'not_for_you', 'This sprint isn’t set for you.');
  }
  const k = sprintKeys(lessonId);
  const sid = who.student.id;
  const owner = ownerOf(config.class_id, sid);
  let view = await studentView(store, lessonId, config, who, group);
  if (action === 'status' || action === 'claim') return withRound(store, lessonId, config, group, sid, view);

  const phase = body.phase;
  if (action === 'open') {
    if (!PHASES.includes(phase)) reject(400, 'bad_phase', 'Unknown phase.');
    const seen = (await read(store, k.seen(owner))) ?? {};
    if (view.phases.find((p) => p.key === phase)?.open && !seen[phase]) await store.setJSON(k.seen(owner), { ...seen, [phase]: iso(clock()) });
  }
  if (action === 'save' || action === 'submit') {
    if (!PHASES.includes(phase)) reject(400, 'bad_phase', 'Unknown phase.');
    mayEdit(view, phase);
    const parsed = PAYLOAD_SCHEMAS[phase].safeParse(body.payload ?? {});
    if (!parsed.success) reject(400, 'bad_payload', parsed.error.issues[0]?.message ?? 'Check your answer.');
    const payload = parsed.data;
    await checkOwnFiles(store, lessonId, owner, phase, payload);
    if (phase === 'decide') checkVotes(view, config, payload);
    const prev = await read(store, k.sub(owner, phase));
    // Once voting closes, Decide can still be submitted (after claiming a part), but the votes stay as they were.
    if (phase === 'decide' && view.votes_closed) {
      const before = prev?.payload?.votes ?? {};
      if (!config.criteria.every((c) => (before[c] ?? '') === (payload.votes[c] ?? ''))) reject(409, 'votes_closed', 'Voting has closed for your group.');
    }
    const now = clock();
    const next = { ...(prev ?? {}), payload, saved_at: iso(now) };
    if (action === 'submit') {
      const problem = await submitProblem(store, lessonId, config, group, sid, phase, payload, view);
      if (problem) reject(400, problem[0], problem[1]);
      const p = phaseFor(config, (await read(store, k.extend)) ?? {}, phase, group.id, sid);
      next.submitted_at = prev?.submitted_at ?? iso(now);
      next.late = isLate(p, next.submitted_at);
    }
    await store.setJSON(k.sub(owner, phase), next);
    const seen = (await read(store, k.seen(owner))) ?? {};
    if (!seen[phase]) await store.setJSON(k.seen(owner), { ...seen, [phase]: iso(now) });
    const state = await groupState(store, k, group.id);
    let changed = false;
    if (action === 'submit' && !list(state.in[phase]).includes(sid)) {
      state.in = { ...state.in, [phase]: [...list(state.in[phase]), sid] };
      changed = true;
    }
    if (phase === 'decide' && config.criteria.every((c) => payload.votes[c]) && !list(state.voted).includes(sid)) {
      state.voted = [...list(state.voted), sid];
      changed = true;
    }
    if (changed) await store.setJSON(k.group(group.id), state);
  }
  if (action === 'parts' || action === 'claim_part' || action === 'pitch') await groupWrite(store, lessonId, config, group, sid, owner, view, action, body);
  if (action === 'feedback') await giveFeedback(store, lessonId, config, group, sid, body);
  view = await studentView(store, lessonId, config, who, group);
  return withRound(store, lessonId, config, group, sid, view);
}

async function checkOwnFiles() {}
function checkVotes() {}
async function groupWrite() { reject(400, 'bad_action', 'Unknown action.'); }
async function giveFeedback() { reject(400, 'bad_action', 'Unknown action.'); }
async function withRound(store, lessonId, config, group, sid, view) { return view; }
