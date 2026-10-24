/**
 * Design Sprints. Publish keeps the whole student-safe body public (brief and
 * phase guides are for everyone) with a public `sprint` subset; the groups,
 * class and rules go to sprint/{lesson}/config. Student and teacher actions
 * below read and write the records listed in sprint-keys.mjs. No model is
 * called here.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { isSafeId } from './class-examples.mjs';
import { publishedLessonKey, draftLessonKey } from './teaching-blobs.mjs';
import { loadRoster } from './class-claims.mjs';
import { QuizError, deviceHash, read, reject } from './question-drop.mjs';
import { identify } from './quiz.mjs';
import { FeedbackEntrySchema, PAYLOAD_SCHEMAS, PartsSchema, SprintSettingsSchema, UnderstandSettingsSchema, LIMIT_BOXES } from './sprint-schema.mjs';
import { flagText } from './peer-feedback-filter.mjs';
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
      phases: s.phases,
      understand: UnderstandSettingsSchema.parse(s.understand ?? {}),
      sketch_timer: Number.isInteger(s.sketch_timer) ? s.sketch_timer : 8,
      decide_dots: Number.isInteger(s.decide_dots) ? s.decide_dots : 3
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
    requirements: s.requirements.map((r) => ({ id: r.id, phases: [...r.phases] })),
    understand: snapshot.sprint.understand.steps,
    dots: snapshot.sprint.decide_dots
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

let baseClock = () => Date.now();
/** Tests set the time; pass nothing to go back to the real clock. */
export const setSprintClock = (fn) => { baseClock = fn ?? (() => Date.now()); };

/**
 * A practice run (sprint-practice.mjs) runs these actions inside a scope that
 * brings its own time, config, roster and student, so it never touches the
 * real class's records or clock. Outside a scope everything reads as usual.
 */
const scope = new AsyncLocalStorage();
export const withSprintScope = (ctx, fn) => scope.run(ctx, fn);
const clock = () => scope.getStore()?.now ?? baseClock();
const rosterOf = (store, classId) => scope.getStore()?.roster ?? loadRoster(store, classId);
const iso = (ms) => new Date(ms).toISOString();
const list = (v) => (Array.isArray(v) ? v : []);
export const PHASES = ['understand', 'sketch', 'decide', 'prototype', 'test'];
const short = (text) => deviceHash(text).slice(0, 12);
export const ownerOf = (classId, studentId) => deviceHash(`student:${classId}:${studentId}`);

async function loadSprint(store, lessonId) {
  const sc = scope.getStore();
  if (sc?.config) return { lesson: sc.lesson, config: sc.config };
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

/**
 * What the group votes on in Understand: each member's problem statement
 * (Say it), then any "How might we" notes from earlier sprints. `field` is
 * where the text sits in the submission, for the spotlight.
 */
export async function groupNotes(store, lessonId, config, group) {
  const subs = await groupSubs(store, lessonId, config, group, 'understand');
  return subs.flatMap(({ student, owner, sub }) => {
    const p = sub?.payload ?? {};
    const star = p.star ?? '';
    const say = typeof p.say === 'string' && p.say.trim() ? [{ id: noteId(lessonId, owner, 'say'), index: -1, field: 'say', text: p.say, student, star }] : [];
    const notes = list(p.notes).map((text, i) => ({ id: noteId(lessonId, owner, i), index: i, field: `notes.${i}`, text, student, star })).filter((n) => n.text.trim());
    return [...say, ...notes];
  });
}

/** An Understand step is on unless the Kit switched it off (sprints published before steps had them all on). */
export const stepOn = (config, step) => config.understand?.[step] !== false;

const norm = (text) => text.trim().replace(/\s+/g, ' ').toLowerCase();
/** Repeated answers stacked: [{ text, count }], most common first, the first wording kept. */
function stack(texts) {
  const seen = new Map();
  for (const t of texts) {
    if (typeof t !== 'string' || !t.trim()) continue;
    const key = norm(t);
    const row = seen.get(key);
    if (row) row.count += 1;
    else seen.set(key, { text: t.trim(), count: 1 });
  }
  return [...seen.values()].sort((a, b) => b.count - a.count);
}
const questionId = (lessonId, text) => short(`${lessonId}:q:${norm(text)}`);
/** A group member as other members see them: a key that names no one, and their initials. */
const memberKey = (lessonId, student) => short(`${lessonId}:member:${student}`);
/** Stand-out dots each student places in Decide (sprints published before dots have none). */
const dotsOf = (config) => (Number.isInteger(config.dots) ? config.dots : 0);
const IDEA_PART_TEXT = { idea: 'idea', answers: 'answers', evidence: 'evidence' };

/**
 * After voting closes: how many stand-out dots each part of each idea got,
 * and the most-dotted parts of the ideas that weren't chosen, to borrow.
 */
async function dotResults(store, lessonId, config, group, gallery, chosenId) {
  const subs = await groupSubs(store, lessonId, config, group, 'decide');
  const ideas = new Map(gallery.flatMap((set) => set.ideas).map((i) => [i.id, i]));
  const counts = {};
  const notes = {};
  for (const { sub } of subs) for (const d of list(sub?.payload?.dots)) {
    if (!ideas.has(d.idea) || !IDEA_PART_TEXT[d.part]) continue;
    counts[d.idea] = { idea: 0, answers: 0, evidence: 0, ...(counts[d.idea] ?? {}) };
    counts[d.idea][d.part] += 1;
    if (d.note?.trim()) (notes[`${d.idea}:${d.part}`] ??= []).push(d.note.trim());
  }
  const borrow = Object.entries(counts)
    .filter(([id]) => id !== chosenId)
    .flatMap(([id, parts]) => Object.entries(parts).filter(([, n]) => n > 0).map(([part, n]) => {
      const idea = ideas.get(id);
      return { idea_id: id, title: idea.title, part, text: idea[part] ?? '', count: n, notes: notes[`${id}:${part}`] ?? [] };
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  return { counts, borrow };
}

/**
 * The group's shared Understand space: everyone's audiences and limits
 * stacked (no names), the agreed audience, the questions made from the
 * unknowns plus any the group added, which are picked, and what was sent with
 * the teacher's answers.
 */
export async function groupUnderstand(store, lessonId, config, group, state) {
  const subs = (await groupSubs(store, lessonId, config, group, 'understand')).map(({ sub }) => sub?.payload ?? {});
  const limits = Object.fromEntries(LIMIT_BOXES.map((box) => [box, stack(subs.flatMap((p) => list(p.limits?.[box])))]));
  const fromUnknowns = [...limits.can_unknown, ...limits.cant_unknown];
  const questions = stack([...fromUnknowns.flatMap((c) => Array(c.count).fill(c.text)), ...list(state.ask_added).map((q) => q.text)])
    .map((q) => ({ id: questionId(lessonId, q.text), text: q.text, count: q.count }));
  const picked = list(state.ask_picked);
  const answers = state.answers ?? {};
  return {
    who: stack(subs.map((p) => p.audience?.who)),
    why: stack(subs.map((p) => p.audience?.why)),
    audience: state.audience ? { who: state.audience.who, why: state.audience.why } : null,
    limits,
    questions: questions.map((q) => ({ ...q, picked: picked.includes(q.id), sent: list(state.ask_sent).some((x) => x.id === q.id) })),
    sent: list(state.ask_sent).map((q) => ({ id: q.id, text: q.text, answer: answers[q.id]?.text ?? null }))
  };
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

const STUDENT_ACTIONS = ['status', 'claim', 'open', 'save', 'submit', 'parts', 'claim_part', 'assign', 'pitch', 'feedback', 'audience', 'ask_add', 'ask_pick', 'ask_send'];

async function whoAndGroup(store, config, body, action) {
  let who = scope.getStore()?.who;
  if (!who) try {
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
  const roster = await rosterOf(store, config.class_id);
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
  const shared = await groupUnderstand(store, lessonId, config, group, state);
  const gallery = open.includes('decide') ? (await groupGallery(store, lessonId, config, group, state.votes_closed_at)).map(({ id, ideas }) => ({ id, ideas })) : null;
  let heat = null;
  if (state.votes_closed_at && gallery) {
    const subs = await groupSubs(store, lessonId, config, group, 'decide');
    const t = tally(subs.map(({ sub }) => sub?.payload?.votes ?? {}), config.criteria, gallery.flatMap((s) => s.ideas.map((i) => i.id)));
    heat = heatLevels(t.counts, config.criteria);
  }
  const chosenIdea = state.chosen && gallery ? gallery.flatMap((s) => s.ideas).find((i) => i.id === state.chosen) ?? null : null;
  const dotView = state.votes_closed_at && gallery && dotsOf(config) ? await dotResults(store, lessonId, config, group, gallery, state.chosen) : null;
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
    parts: list(state.parts).map((p) => ({ ...p, claimed: list(state.claims[p.id]).length, mine: list(state.claims[p.id]).includes(sid), assigned: list(state.claims[p.id]).map((x) => memberKey(lessonId, x)) })),
    members: group.students.map((x) => ({ key: memberKey(lessonId, x), initials: initials.get(x) ?? '–', me: x === sid })),
    dots: dotsOf(config),
    pitch: state.pitch ? { kind: state.pitch.kind, name: state.pitch.name ?? '', file: state.pitch.file ?? null, link: state.pitch.link ?? '' } : null,
    understand_group: shared,
    dot_counts: dotView?.counts ?? null,
    borrow: dotView?.borrow ?? null,
    // What the group takes from Understand into the later phases.
    brief: {
      problem: state.question?.text ?? null,
      audience: shared.audience,
      answers: shared.sent.filter((q) => q.answer).map((q) => ({ question: q.text, answer: q.answer }))
    }
  };
  const stage = (await read(store, k.stage)) ?? {};
  view.spotlight = stage.spotlight ?? null;
  return view;
}

/** Structural checks the server makes before a submit; the browser shows the kinder, fuller checks. */
async function submitProblem(store, lessonId, config, group, sid, phase, payload, view) {
  if (phase === 'understand') {
    if (stepOn(config, 'say') && !payload.say.trim() && !payload.notes.some((n) => n.trim())) return ['need_say', 'Write the problem in your own words first.'];
    if (stepOn(config, 'vote') && !view.notes.some((n) => n.id === payload.star)) return ['need_star', 'Star one of your group’s problem statements.'];
  }
  if (phase === 'sketch' && !payload.cards.length) return ['need_ideas', 'Write at least one idea first.'];
  if (phase === 'decide') {
    if (!config.criteria.every((c) => payload.votes[c])) return ['need_votes', 'Give every criterion to one idea.'];
    // Fewer parts to dot than dots (a tiny gallery) needs only as many as there are.
    const dottable = (view.gallery ?? []).flatMap((set) => set.ideas).reduce((n, i) => n + Object.keys(IDEA_PART_TEXT).filter((k) => (i[k] ?? '').trim()).length, 0);
    if (dotsOf(config) && payload.dots.length < Math.min(dotsOf(config), dottable)) return ['need_dots', `Place all ${dotsOf(config)} stand-out dots.`];
    if (!view.parts.some((p) => p.mine)) return ['need_part', 'Your group hasn’t given you a part yet.'];
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
      payload.dots = list(prev?.payload?.dots);
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
  if (action === 'parts' || action === 'claim_part' || action === 'assign' || action === 'pitch') await groupWrite(store, lessonId, config, group, sid, owner, view, action, body);
  if (action === 'audience' || action.startsWith('ask_')) await understandWrite(store, lessonId, config, group, view, action, body);
  if (action === 'feedback') await giveFeedback(store, lessonId, config, group, sid, body);
  view = await studentView(store, lessonId, config, who, group);
  return withRound(store, lessonId, config, group, sid, view);
}

/** Files named in a payload must be the student's own. */
async function checkOwnFiles(store, lessonId, owner, phase, payload) {
  const ids = phase === 'prototype' ? payload.files : phase === 'sketch' ? payload.cards.map((c) => c.file).filter(Boolean) : [];
  const k = sprintKeys(lessonId);
  for (const id of ids) {
    const index = await read(store, k.fileOwner(id));
    if (index?.owner !== owner) reject(400, 'bad_file', 'That file has gone. Upload it again.');
  }
}

/** Feedback on the presenting group: once per student, while the round is open, never on your own group. */
async function giveFeedback(store, lessonId, config, group, sid, body) {
  const k = sprintKeys(lessonId);
  const target = config.groups.find((g) => g.id === body.group_id);
  if (!target) reject(404, 'not_found', 'That group is gone.');
  if (target.id === group.id) reject(400, 'own_group', 'Your group is presenting. Listen to the feedback.');
  const round = await read(store, k.round(target.id));
  if (round?.status !== 'open') reject(409, 'round_closed', 'Feedback for this group has closed.');
  const parsed = FeedbackEntrySchema.safeParse(body.entry);
  if (!parsed.success) reject(400, 'bad_feedback', parsed.error.issues[0]?.message ?? 'Check your feedback.');
  const e = parsed.data;
  const levels = Object.fromEntries(Object.entries(e.levels).filter(([c]) => config.criteria.includes(c)));
  const flagged = flagText(e.worked) || flagText(e.next);
  const entries = { ...(round.entries ?? {}), [sid]: { levels, worked: e.worked, next: e.next, about: config.criteria.includes(e.about) ? e.about : '', flagged, status: flagged ? 'held' : 'ok', at: iso(clock()) } };
  await store.setJSON(k.round(target.id), { ...round, entries });
}

/** Adds the running round's card, the group's released feedback and the spotlight to a student view. */
async function withRound(store, lessonId, config, group, sid, view) {
  const k = sprintKeys(lessonId);
  const stage = (await read(store, k.stage)) ?? {};
  let round = null;
  for (const g of config.groups) {
    if (g.id === group.id) continue;
    const r = await read(store, k.round(g.id));
    if (r?.status === 'open') { round = { group_id: g.id, group_name: g.name, sent: !!r.entries?.[sid] }; break; }
  }
  const own = await read(store, k.round(group.id));
  let received = null;
  if (own?.status === 'released') {
    const shown = Object.values(own.entries ?? {}).filter((e) => e.status === 'ok' || e.status === 'released');
    const levels = Object.fromEntries(config.criteria.map((c) => [c, [1, 2, 3].map((lv) => shown.filter((e) => e.levels[c] === lv).length)]));
    received = { levels, lines: shown.map((e) => ({ worked: e.worked, next: e.next, about: e.about })) };
  }
  return { ...view, round, received, running: stage.running ?? null };
}

/** run: who is pitching now. round: open, close or release a group's feedback. moderate: release or remove one entry. */
async function roundAction(store, lessonId, config, action, body) {
  const k = sprintKeys(lessonId);
  if (action === 'run') {
    if (body.group_id !== null && !config.groups.some((g) => g.id === body.group_id)) reject(404, 'not_found', 'That group is gone.');
    const stage = (await read(store, k.stage)) ?? {};
    await store.setJSON(k.stage, { ...stage, running: body.group_id });
    return;
  }
  const g = config.groups.find((x) => x.id === body.group_id);
  if (!g) reject(404, 'not_found', 'That group is gone.');
  const round = (await read(store, k.round(g.id))) ?? { status: 'closed', entries: {} };
  if (action === 'round') {
    const now = iso(clock());
    if (body.op === 'open') {
      // One round at a time: opening this one closes any other.
      for (const other of config.groups) {
        if (other.id === g.id) continue;
        const r = await read(store, k.round(other.id));
        if (r?.status === 'open') await store.setJSON(k.round(other.id), { ...r, status: 'closed', closed_at: now });
      }
      await store.setJSON(k.round(g.id), { ...round, status: 'open', opened_at: now });
    } else if (body.op === 'close') await store.setJSON(k.round(g.id), { ...round, status: 'closed', closed_at: now });
    else if (body.op === 'release') await store.setJSON(k.round(g.id), { ...round, status: 'released' });
    else reject(400, 'bad_op', 'Open, close or release.');
  }
  if (action === 'moderate') {
    const e = round.entries?.[body.student_id];
    if (!e || !['released', 'removed'].includes(body.status)) reject(404, 'not_found', 'That feedback is gone.');
    await store.setJSON(k.round(g.id), { ...round, entries: { ...round.entries, [body.student_id]: { ...e, status: body.status } } });
  }
}
/** Votes name a known criterion and an idea in this group's gallery; opened lists only real set ids. */
function checkVotes(view, config, payload) {
  const ideas = new Set((view.gallery ?? []).flatMap((s) => s.ideas.map((i) => i.id)));
  const sets = new Set((view.gallery ?? []).map((s) => s.id));
  for (const [c, idea] of Object.entries(payload.votes)) {
    if (!config.criteria.includes(c) || !ideas.has(idea)) reject(400, 'bad_vote', 'That idea has changed. Reload the page.');
  }
  payload.opened = payload.opened.filter((id) => sets.has(id));
  payload.dots = payload.dots.filter((d) => ideas.has(d.idea)).slice(0, dotsOf(config));
}

/** The group's shared Understand space: the agreed audience, questions added, picked and sent to the teacher. */
async function understandWrite(store, lessonId, config, group, view, action, body) {
  const k = sprintKeys(lessonId);
  if (view.lock) reject(423, 'locked', 'The sprint is locked for now. It opens again soon.');
  const row = view.phases.find((p) => p.key === 'understand');
  if (!row?.open) reject(409, 'not_open', 'Understand hasn’t opened yet.');
  if (row.frozen) reject(409, 'frozen', 'Your class work for this phase is in.');
  const state = await groupState(store, k, group.id);
  const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  if (action === 'audience') {
    if (!stepOn(config, 'merge')) reject(409, 'step_off', 'This step is switched off.');
    state.audience = { who: str(body.who, 200), why: str(body.why, 300), at: iso(clock()) };
  } else {
    if (!stepOn(config, 'ask')) reject(409, 'step_off', 'This step is switched off.');
    const shared = await groupUnderstand(store, lessonId, config, group, state);
    if (action === 'ask_add') {
      const text = str(body.text, 200);
      if (!text) reject(400, 'empty', 'Write the question first.');
      if (list(state.ask_added).length >= 10) reject(409, 'too_many', 'Your group has added 10 questions. Pick from those.');
      if (!shared.questions.some((q) => q.id === questionId(lessonId, text))) state.ask_added = [...list(state.ask_added), { text, at: iso(clock()) }];
    }
    if (action === 'ask_pick') {
      if (!shared.questions.some((q) => q.id === body.id)) reject(404, 'not_found', 'That question has gone. Reload the page.');
      const picked = list(state.ask_picked);
      if (picked.includes(body.id)) state.ask_picked = picked.filter((id) => id !== body.id);
      else if (picked.length >= 3) reject(409, 'too_many', 'Pick up to 3. Unstar one first.');
      else state.ask_picked = [...picked, body.id];
    }
    if (action === 'ask_send') {
      const picked = shared.questions.filter((q) => list(state.ask_picked).includes(q.id));
      if (!picked.length) reject(400, 'none_picked', 'Star up to 3 questions first.');
      const sent = list(state.ask_sent);
      state.ask_sent = [...sent, ...picked.filter((q) => !sent.some((x) => x.id === q.id)).map((q) => ({ id: q.id, text: q.text, at: iso(clock()) }))];
    }
  }
  await store.setJSON(k.group(group.id), state);
}

/** Parts list, part claims and the pitch file: shared group state any member may write. */
async function groupWrite(store, lessonId, config, group, sid, owner, view, action, body) {
  const k = sprintKeys(lessonId);
  if (view.lock) reject(423, 'locked', 'The sprint is locked for now. It opens again soon.');
  const state = await groupState(store, k, group.id);
  if (action === 'parts' || action === 'claim_part' || action === 'assign') {
    if (!view.phases.find((p) => p.key === 'decide')?.open) reject(409, 'not_open', 'Decide hasn’t opened yet.');
    if (!state.chosen) reject(409, 'no_idea_yet', 'Your group’s idea is still being chosen.');
    if (view.phases.find((p) => p.key === 'decide')?.frozen) reject(409, 'frozen', 'Your class work for this phase is in.');
  }
  if (action === 'parts') {
    const parsed = PartsSchema.safeParse(body.parts);
    if (!parsed.success) reject(400, 'bad_parts', parsed.error.issues[0]?.message ?? 'Check the parts list.');
    const keep = new Set(parsed.data.map((p) => p.id));
    state.parts = parsed.data.map((p) => ({ ...p, criterion: config.criteria.includes(p.criterion) ? p.criterion : '' }));
    state.claims = Object.fromEntries(Object.entries(state.claims).filter(([id]) => keep.has(id)));
  }
  if (action === 'claim_part') {
    const part = list(state.parts).find((p) => p.id === body.part_id);
    if (!part) reject(404, 'not_found', 'That part has gone. Reload the page.');
    // Two may share a part only when the group has more people than parts.
    const cap = group.students.length > list(state.parts).length ? 2 : 1;
    const others = list(state.claims[part.id]).filter((s) => s !== sid);
    if (others.length >= cap) reject(409, 'part_taken', 'Someone has claimed that part. Pick another.');
    state.claims = Object.fromEntries(Object.entries(state.claims).map(([id, ss]) => [id, list(ss).filter((s) => s !== sid)]));
    state.claims[part.id] = [...others, sid];
  }
  if (action === 'assign') {
    // The group gives a part to one member, or two when there are more people than parts. Each member has one part.
    const part = list(state.parts).find((p) => p.id === body.part_id);
    if (!part) reject(404, 'not_found', 'That part has gone. Reload the page.');
    const byKey = new Map(group.students.map((x) => [memberKey(lessonId, x), x]));
    const keys = Array.isArray(body.keys) ? body.keys : [];
    if (keys.some((key) => !byKey.has(key))) reject(400, 'bad_member', 'That person isn’t in your group. Reload the page.');
    const who = [...new Set(keys.map((key) => byKey.get(key)))];
    const cap = group.students.length > list(state.parts).length ? 2 : 1;
    if (who.length > cap) reject(409, 'too_many', cap === 1 ? 'One person per part.' : 'Two people at most on one part.');
    state.claims = Object.fromEntries(Object.entries(state.claims).map(([id, ss]) => [id, list(ss).filter((x) => !who.includes(x))]));
    state.claims[part.id] = who;
  }
  if (action === 'pitch') {
    if (!view.phases.find((p) => p.key === 'prototype')?.open) reject(409, 'not_open', 'Prototype hasn’t opened yet.');
    if (typeof body.link === 'string' && body.link) {
      if (!/^https:\/\/\S{3,490}$/.test(body.link)) reject(400, 'bad_link', 'Links start with https://');
      state.pitch = { kind: 'link', link: body.link, by: sid, at: iso(clock()) };
    } else {
      const meta = typeof body.file_id === 'string' ? await read(store, k.fileMeta(owner, body.file_id)) : null;
      if (!meta) reject(404, 'not_found', 'Upload the file first.');
      state.pitch = { kind: 'file', file: body.file_id, name: meta.name, by: sid, at: iso(clock()) };
    }
  }
  await store.setJSON(k.group(group.id), state);
}

// ---------------------------------------------------------------------------
// Teacher side: the progress map, a group's board and the class controls.
// Names show here only; anything put up for students goes through stage, nameless.
// ---------------------------------------------------------------------------

const TEACHER_ACTIONS = ['summary', 'board', 'end_class', 'unlock', 'extend', 'confirm', 'spotlight', 'move', 'run', 'round', 'moderate', 'answer'];

async function teacherContext(store, lessonId) {
  const { config } = await loadSprint(store, lessonId);
  const k = sprintKeys(lessonId);
  const lockRec = await endDueClassParts(store, lessonId, config);
  const extend = (await read(store, k.extend)) ?? {};
  const roster = await rosterOf(store, config.class_id);
  const byId = new Map(list(roster?.students).map((s) => [s.id, s]));
  return { config, k, lockRec, extend, byId };
}

async function teacherSummary(store, lessonId) {
  const { config, k, lockRec, extend, byId } = await teacherContext(store, lessonId);
  const now = clock();
  const groups = [];
  for (const g of config.groups) {
    const state = await resolveGroup(store, lessonId, config, g, await groupState(store, k, g.id), lockRec, extend, now);
    const open = openPhases(groupPhases(config, extend, g.id), factsFor(g, state, lockRec), now);
    const students = await Promise.all(g.students.map(async (id) => {
      const owner = ownerOf(config.class_id, id);
      const phases = {};
      for (const key of PHASES) {
        const sub = await read(store, k.sub(owner, key));
        phases[key] = !sub ? 'none' : !sub.submitted_at ? 'draft' : sub.late ? 'late' : 'in';
      }
      // Who has opened each phase: End class part uses it to say who was there.
      const seen = (await read(store, k.seen(owner))) ?? {};
      const opened = Object.fromEntries(PHASES.map((key) => [key, !!seen[key]]));
      return { id, initials: byId.get(id)?.initials ?? '–', name: byId.get(id)?.name ?? 'Removed student', phases, opened };
    }));
    groups.push({ id: g.id, name: g.name, students, open, awaiting: state.awaiting ?? null, chosen: !!state.chosen, question: state.question?.text ?? null, asked: list(state.ask_sent).filter((q) => !state.answers?.[q.id]).length });
  }
  const classParts = Object.fromEntries(config.phases.filter((p) => p.where === 'class').map((p) => [p.key, lockRec.ended[p.key] ? 'ended' : 'open']));
  const lock = lockRec.lock && Date.parse(lockRec.lock.until) > now ? lockRec.lock : null;
  const stage = (await read(store, k.stage)) ?? {};
  return { groups, class_parts: classParts, ended: lockRec.ended, lock, extend, running: stage.running ?? null, spotlight: stage.spotlight ?? null };
}

async function teacherBoard(store, lessonId, groupId) {
  const { config, k, lockRec, extend, byId } = await teacherContext(store, lessonId);
  const g = config.groups.find((x) => x.id === groupId);
  if (!g) reject(404, 'not_found', 'That group is gone.');
  const state = await resolveGroup(store, lessonId, config, g, await groupState(store, k, g.id), lockRec, extend, clock());
  const name = (id) => byId.get(id)?.name ?? 'Removed student';
  const notes = (await groupNotes(store, lessonId, config, g)).map((n) => ({ id: n.id, text: n.text, name: name(n.student), student_id: n.student, index: n.index, field: n.field }));
  const understand = await groupUnderstand(store, lessonId, config, g, state);
  const gallery = (await groupGallery(store, lessonId, config, g, state.votes_closed_at)).map((set) => ({ id: set.id, name: name(set.student), student_id: set.student, ideas: set.ideas }));
  const decide = await groupSubs(store, lessonId, config, g, 'decide');
  const t = tally(decide.map(({ sub }) => sub?.payload?.votes ?? {}), config.criteria, gallery.flatMap((s) => s.ideas.map((i) => i.id)));
  const subs = {};
  for (const key of ['prototype', 'test']) {
    subs[key] = (await groupSubs(store, lessonId, config, g, key)).map(({ student, sub }) => ({ student_id: student, name: name(student), sub }));
  }
  const reasons = decide.map(({ student, sub }) => ({ name: name(student), votes: sub?.payload?.votes ?? {}, reasons: sub?.payload?.reasons ?? {}, dots: list(sub?.payload?.dots) }));
  const round = (await read(store, k.round(g.id))) ?? null;
  return {
    group: { id: g.id, name: g.name },
    awaiting: state.awaiting ?? null,
    question: state.question ?? null,
    chosen: state.chosen ?? null,
    notes,
    understand,
    gallery,
    totals: t.totals,
    heat: heatLevels(t.counts, config.criteria),
    reasons,
    parts: list(state.parts).map((p) => ({ ...p, by: list(state.claims[p.id]).map(name) })),
    pitch: state.pitch ? { ...state.pitch, by: name(state.pitch.by) } : null,
    subs,
    round: round ? { ...round, entries: Object.entries(round.entries ?? {}).map(([student, e]) => ({ student_id: student, name: name(student), ...e })) } : null
  };
}

/** "notes.0", "cards.1.idea", "reasons.c1", "text": one text field from a submission. */
function fieldText(payload, field) {
  if (typeof field !== 'string' || !/^[a-z_]+(\.[a-z0-9_]+){0,2}$/.test(field)) return null;
  let value = payload;
  for (const part of field.split('.')) value = value?.[/^\d+$/.test(part) ? Number(part) : part];
  return typeof value === 'string' && value.trim() ? value : null;
}

/** Moves a student in the published config and in the draft (against its etag, so a save in another tab wins and the move retries). */
async function moveStudent(store, lessonId, config, studentId, groupId) {
  const k = sprintKeys(lessonId);
  if (!config.groups.some((g) => g.id === groupId)) reject(404, 'not_found', 'That group is gone.');
  const shift = (groups) => groups.map((g) => {
    const others = list(g.students).filter((s) => s !== studentId);
    return { ...g, students: g.id === groupId ? [...others, studentId] : others };
  });
  await store.setJSON(k.config, { ...config, groups: shift(config.groups) });
  for (let i = 0; i < 3; i += 1) {
    const row = await store.getWithMetadata(draftLessonKey(lessonId), { type: 'json', consistency: 'strong' });
    if (!row?.data?.sprint) return;
    const written = await store.setJSON(draftLessonKey(lessonId), { ...row.data, sprint: { ...row.data.sprint, groups: shift(row.data.sprint.groups) }, updated_at: iso(clock()) }, { onlyIfMatch: row.etag });
    if (written?.modified !== false) return;
  }
  reject(409, 'changed', 'The lesson changed in another tab. Try again.');
}

export async function sprintTeacherAction(store, lessonId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  const action = body.action ?? 'summary';
  if (!TEACHER_ACTIONS.includes(action)) reject(400, 'bad_action', 'Unknown action.');
  if (action === 'summary') return teacherSummary(store, lessonId);
  if (action === 'board') return teacherBoard(store, lessonId, body.group_id);
  const { config, k, extend } = await teacherContext(store, lessonId);
  const now = clock();

  if (action === 'end_class') {
    const p = config.phases.find((x) => x.key === body.phase);
    if (!p || p.where !== 'class') reject(400, 'not_class', 'Only class phases have a class part to end.');
    await endClassPart(store, lessonId, config, p.key, now);
  }
  if (action === 'unlock') {
    const rec = { ...emptyLock(), ...((await read(store, k.lock)) ?? {}) };
    if (rec.lock && typeof body.student_id === 'string') await store.setJSON(k.lock, { ...rec, lock: { ...rec.lock, unlocked: [...new Set([...rec.lock.unlocked, body.student_id])] } });
  }
  if (action === 'extend') {
    if (!PHASES.includes(body.phase) || !/^\d{4}-\d{2}-\d{2}$/.test(body.due_date ?? '')) reject(400, 'bad_date', 'Pick a phase and a date.');
    const time = /^\d{2}:\d{2}$/.test(body.due_time ?? '') ? body.due_time : '15:00';
    const scope = body.scope;
    if (scope === 'group' && !config.groups.some((g) => g.id === body.id)) reject(404, 'not_found', 'That group is gone.');
    if (scope === 'student' && !config.groups.some((g) => g.students.includes(body.id))) reject(404, 'not_found', 'That student isn’t in this sprint.');
    if (!['class', 'group', 'student'].includes(scope)) reject(400, 'bad_scope', 'Pick the class, a group or a student.');
    const next = { class: {}, group: {}, student: {}, ...extend };
    const over = { due_date: body.due_date, due_time: time };
    if (scope === 'class') next.class = { ...next.class, [body.phase]: over };
    else next[scope] = { ...next[scope], [body.id]: { ...(next[scope][body.id] ?? {}), [body.phase]: over } };
    await store.setJSON(k.extend, next);
  }
  if (action === 'confirm') {
    const g = config.groups.find((x) => x.id === body.group_id);
    if (!g) reject(404, 'not_found', 'That group is gone.');
    const state = await groupState(store, k, g.id);
    if (body.kind === 'question') {
      const note = (await groupNotes(store, lessonId, config, g)).find((n) => n.id === body.id);
      if (!note) reject(404, 'not_found', 'That question is gone.');
      await store.setJSON(k.group(g.id), { ...state, question: { id: note.id, text: note.text }, awaiting: null });
    } else if (body.kind === 'idea') {
      const ideas = (await groupGallery(store, lessonId, config, g, state.votes_closed_at)).flatMap((s) => s.ideas);
      if (!ideas.some((i) => i.id === body.id)) reject(404, 'not_found', 'That idea is gone.');
      await store.setJSON(k.group(g.id), { ...state, chosen: body.id, awaiting: null, votes_closed_at: state.votes_closed_at ?? iso(now) });
    } else reject(400, 'bad_kind', 'Confirm a question or an idea.');
  }
  if (action === 'answer') {
    const g = config.groups.find((x) => x.id === body.group_id);
    if (!g) reject(404, 'not_found', 'That group is gone.');
    const state = await groupState(store, k, g.id);
    if (!list(state.ask_sent).some((q) => q.id === body.id)) reject(404, 'not_found', 'That question is gone.');
    const text = typeof body.text === 'string' ? body.text.trim().slice(0, 600) : '';
    const answers = { ...(state.answers ?? {}) };
    if (text) answers[body.id] = { text, at: iso(now) };
    else delete answers[body.id];
    await store.setJSON(k.group(g.id), { ...state, answers });
  }
  if (action === 'spotlight') {
    const stage = (await read(store, k.stage)) ?? {};
    if (body.clear) await store.setJSON(k.stage, { ...stage, spotlight: null });
    else {
      if (!PHASES.includes(body.phase) || !config.groups.some((g) => g.students.includes(body.student_id))) reject(400, 'bad_spotlight', 'That answer is gone.');
      const sub = await read(store, k.sub(ownerOf(config.class_id, body.student_id), body.phase));
      const text = fieldText(sub?.payload, body.field);
      if (!text) reject(404, 'not_found', 'That answer is gone.');
      await store.setJSON(k.stage, { ...stage, spotlight: { text, label: 'One idea from the class' } });
    }
  }
  if (action === 'move' && scope.getStore()) reject(409, 'practice', 'The practice group stays as it is.');
  if (action === 'move') await moveStudent(store, lessonId, config, body.student_id, body.group_id);
  if (action === 'run' || action === 'round' || action === 'moderate') await roundAction(store, lessonId, config, action, body);
  return teacherSummary(store, lessonId);
}
