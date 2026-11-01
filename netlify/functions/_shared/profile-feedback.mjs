/**
 * A claimed student's own feedback and progress patterns. Only returned work,
 * only this student, never marks, totals, teacher notes or other students.
 * From the skills continuum, only the two lines each row needs.
 */
import { readBook } from './markbook.mjs';
import { readFeedbackCodes } from './feedback-codes.mjs';
import { read, reject } from './question-drop.mjs';
import { listBlobKeys, mapBounded } from './blobs-list.mjs';
import { piecePrefix, pieceKey } from './piece-feedback.mjs';
import { handinKey, writingParts } from './lesson-work.mjs';
import { studentNotes, markNoteSeen, feedbackDocKey, toPublishedFeedbackPayload } from './teaching-feedback.mjs';
import { getJSON } from './teaching-blobs.mjs';
import { stepForShare, rungForShare, lowerOf, stepName, STEPS, RUNGS } from './progress-steps.mjs';
import { targetKeys, targetRow, codeGrid, nextSteps, ranked, CHART_MAX } from './progress-patterns.mjs';
import { stepsBySkill } from './next-steps.mjs';
import { readStoredSkills } from './skills-continuum.mjs';

const day = (iso) => new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'Australia/Sydney' });

function placesFor(column, mark) {
  const places = {};
  const put = (key, step) => { if (step) places[key] = places[key] ? lowerOf(places[key], step) : step; };
  for (const c of column.criteria) {
    const placed = mark?.steps?.[c.id];
    const share = Number.isFinite(mark?.criteria?.[c.id]) ? mark.criteria[c.id] / c.max : NaN;
    const step = placed && STEPS.includes(placed) ? placed : stepForShare(share);
    const rung = placed && RUNGS.includes(placed) ? placed : rungForShare(share);
    for (const o of c.outcomes ?? []) put(`out:${o}`, step);
    for (const k of c.concepts ?? []) put(`con:${k}`, step);
    if (c.skill) put(`skill:${c.skill}`, rung);
  }
  return places;
}

/** The confirmed tags on a student's returned viva takes in one lesson. */
async function vivaTags(store, lessonId, studentId) {
  const keys = await listBlobKeys(store, `voice_submissions/${lessonId}/`);
  const rows = await mapBounded(keys, 8, (k) => read(store, k));
  return rows.filter((r) => r?.student_id === studentId && r.status === 'returned').flatMap((r) => (r.tags ?? []).filter((t) => t.confirmed !== false).map((t) => ({ code_id: t.code_id, positive: Boolean(t.positive) })));
}

/** Every returned piece for one student, oldest first. */
export async function studentPieces(store, classId, studentId) {
  const { book } = await readBook(store, classId);
  const columns = new Map(book.columns.map((c) => [c.id, c]));
  const pieces = [];
  const keys = await listBlobKeys(store, piecePrefix(classId, studentId));
  for (const [key, row] of await mapBounded(keys, 8, async (k) => [k, await read(store, k)])) {
    if (row?.status !== 'returned') continue;
    const id = key.slice(piecePrefix(classId, studentId).length);
    const column = columns.get(row.column_id);
    const tags = row.kind === 'viva' ? await vivaTags(store, row.lesson_id, studentId) : (row.tags ?? []).map((t) => ({ code_id: t.code_id, positive: Boolean(t.positive) }));
    pieces.push({ id, kind: row.kind, title: row.title, short: row.short ?? column?.piece?.short ?? null, at: row.returned_at, places: column ? placesFor(column, book.marks?.[column.id]?.[studentId]) : {}, tags, seen_at: row.seen_at ?? null, comment: row.comment ?? '' });
  }
  for (const column of book.columns.filter((c) => c.kind === 'assessment' && !c.piece)) {
    const mark = book.marks?.[column.id]?.[studentId];
    if (!mark || mark.exempt) continue;
    const tags = Object.values(mark.codes ?? {}).flat().map((code_id) => ({ code_id, positive: false }));
    pieces.push({ id: `a:${column.id}`, kind: 'assessment', title: column.title, short: null, at: `${column.date}T00:00:00Z`, places: placesFor(column, mark), tags, seen_at: null, comment: '' });
  }
  return pieces.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

async function outcomeName(store, id) {
  const o = await read(store, `outcomes/${id}`);
  if (!o) return { name: id, sub: '' };
  const first = String(o.description ?? '').split(/[,;.]/)[0].trim();
  return { name: o.short || o.code, sub: o.short ? `${o.code} · ${first}` : first };
}

function looksFor(column, key, now) {
  const ladder = STEPS;
  const next = ladder[ladder.indexOf(now) + 1];
  const c = column?.criteria.find((x) => (x.outcomes ?? []).includes(key.slice(4)) || (x.concepts ?? []).includes(key.slice(4)));
  const line = next && c?.steps?.[next];
  return line ? `${stepName(next)} looks like: ${line}` : null;
}

export async function progressFor(store, roster, student) {
  const all = await studentPieces(store, roster.cls.id, student.id);
  const pieces = all.slice(-CHART_MAX);
  const library = await readFeedbackCodes(store);
  const codes = new Map(library.map((c) => [c.id, c]));
  const { book } = await readBook(store, roster.cls.id);
  const lastColumn = (key) => [...book.columns].reverse().find((c) => c.kind === 'assessment' && c.criteria.some((x) => (x.outcomes ?? []).includes(key.slice(4)) || (x.concepts ?? []).includes(key.slice(4))));
  const outcomes = [];
  const concepts = [];
  const skillRows = [];
  for (const key of targetKeys(pieces)) {
    const row = targetRow(pieces, key);
    if (key.startsWith('out:')) outcomes.push({ ...row, ...(await outcomeName(store, key.slice(4))), looks: looksFor(lastColumn(key), key, row.now) });
    else if (key.startsWith('con:')) concepts.push({ ...row, name: key.slice(4).replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()), sub: 'Concept', looks: looksFor(lastColumn(key), key, row.now) });
    else skillRows.push(row);
  }
  const continuum = await readStoredSkills(store).catch(() => null);
  const skills = [];
  for (const row of skillRows) {
    const ref = row.key.slice(6);
    const [strandId, subId] = ref.split('.');
    const strand = continuum?.strands.find((s) => s.strand === strandId);
    const sub = strand?.sub_strands.find((s) => s.id === subId);
    const counts = Object.fromEntries(RUNGS.map((r) => [r, row.cells.filter((c) => c === r).length]));
    const nextRung = RUNGS[Math.max(1, RUNGS.indexOf(row.now) + 1)];
    const entry = { key: row.key, name: sub?.name ?? subId, counts, now: row.now, story: row.story, i_can: row.now !== 'below' ? sub?.rungs?.[row.now]?.i_can ?? null : null, next_move: nextRung ? sub?.rungs?.[nextRung]?.build?.next_move ?? null : null, next_rung: nextRung ?? null };
    const group = skills.find((s) => s.strand === (strand?.name ?? strandId)) ?? (skills.push({ strand: strand?.name ?? strandId, rows: [] }), skills.at(-1));
    group.rows.push(entry);
  }
  const grid = codeGrid(pieces, library).map((r) => ({ ...r, code: codes.get(r.code_id)?.code, label: codes.get(r.code_id)?.label, colour: codes.get(r.code_id)?.colour }));
  const next = nextSteps(pieces, library).map((n) => {
    const c = codes.get(n.code_id);
    const action = n.positive ? c?.strength_descriptor || c?.descriptor : c?.descriptor;
    return { ...n, code: c?.code, colour: c?.colour, action: action ?? c?.label, ...(c?.resource ? { resource: c.resource } : {}) };
  });
  return {
    pieces: pieces.map((p) => ({ id: p.id, label: p.short || p.title, date: day(p.at), kind: p.kind })),
    outcomes, concepts, skills, codes: grid, next,
    unseen: all.filter((p) => p.kind !== 'assessment' && !p.seen_at).length
  };
}

/**
 * What a writing box needs to pick this student's next step: per skill, their
 * latest placed rung and their top repeating growth code linked to that skill.
 * The client picks the bank line; rungs and codes are never shown.
 */
export async function stepsFor(store, classId, studentId) {
  const pieces = await studentPieces(store, classId, studentId);
  const library = await readFeedbackCodes(store);
  const rungs = {};
  for (const key of targetKeys(pieces)) if (key.startsWith('skill:')) rungs[key.slice(6)] = targetRow(pieces, key).now;
  const codes = new Map(library.map((c) => [c.id, c]));
  return { need: null, skills: stepsBySkill(ranked(pieces, library, false), codes, rungs) };
}

export async function returnedFor(store, roster, student) {
  const pieces = await studentPieces(store, roster.cls.id, student.id);
  const rows = pieces.filter((p) => p.kind !== 'assessment').map((p) => ({ at: p.at, item: { id: p.id, kind: p.kind, title: p.title, date: day(p.at), new: !p.seen_at, codes: [...new Set(p.tags.map((t) => t.code_id))] } }));
  for (const doc of await studentNotes(store, roster.cls.id, student.id)) {
    rows.push({ at: doc.returned_at, item: { id: `n:${doc.id}`, kind: 'note', title: doc.title, date: day(doc.returned_at), new: !doc.seen_at, codes: [] } });
  }
  return { items: rows.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).map((r) => r.item) };
}

/** A note that was returned to this student, or a refusal. */
async function ownNote(store, roster, student, item) {
  const doc = await getJSON(store, feedbackDocKey(item.slice(2)), { consistency: 'strong' });
  if (!doc || doc.class_id !== roster.cls.id || doc.student_id !== student.id || !doc.returned_at || doc.revoked_at) reject(404, 'not_found', 'That note isn’t here.');
  return doc;
}

export async function pieceFor(store, roster, student, item) {
  if (typeof item !== 'string' || !/^[wvn]:[A-Za-z0-9_:-]{1,200}$/.test(item)) reject(400, 'bad_item', 'That piece can’t be found.');
  if (item.startsWith('n:')) {
    const doc = await ownNote(store, roster, student, item);
    return { id: item, kind: 'note', date: day(doc.returned_at), audio_url: null, ...toPublishedFeedbackPayload(doc, null) };
  }
  const row = await read(store, pieceKey(roster.cls.id, student.id, item));
  if (row?.status !== 'returned') reject(404, 'not_found', 'That piece isn’t back yet.');
  const library = await readFeedbackCodes(store);
  const codes = new Map(library.map((c) => [c.id, c]));
  const { book } = await readBook(store, roster.cls.id);
  const column = book.columns.find((c) => c.id === row.column_id);
  const mark = column ? book.marks?.[column.id]?.[student.id] : null;
  const earlier = (await studentPieces(store, roster.cls.id, student.id)).filter((p) => p.at < row.returned_at && p.kind === row.kind).at(-1);
  const handin = row.kind === 'written' ? await read(store, handinKey(row.lesson_id, row.block_id, student.id)) : null;
  return {
    id: item, kind: row.kind, title: row.title, date: day(row.returned_at), comment: row.comment ?? '',
    text: handin?.text ? writingParts(handin.text) : null,
    tags: (row.tags ?? []).map((t) => { const c = codes.get(t.code_id); return { part: t.part, field: t.field, start: t.start, end: t.end, positive: t.positive, code: c?.code, label: c?.label, colour: c?.colour, action: t.positive ? c?.strength_descriptor || c?.descriptor : c?.descriptor, ...(t.note ? { note: t.note } : {}), ...(c?.resource ? { resource: c.resource } : {}) }; }),
    criteria: (column?.criteria ?? []).map((c) => {
      const step = placesFor({ criteria: [c] }, mark)[c.skill ? `skill:${c.skill}` : c.outcomes?.[0] ? `out:${c.outcomes[0]}` : `con:${c.concepts?.[0]}`] ?? null;
      const prevKey = c.skill ? `skill:${c.skill}` : c.outcomes?.[0] ? `out:${c.outcomes[0]}` : `con:${c.concepts?.[0]}`;
      return { label: c.label, step, was: earlier?.places?.[prevKey] ?? null };
    })
  };
}

export async function markSeen(store, roster, student, item) {
  if (typeof item !== 'string' || !/^[wvn]:[A-Za-z0-9_:-]{1,200}$/.test(item)) reject(400, 'bad_item', 'That piece can’t be found.');
  if (item.startsWith('n:')) {
    await markNoteSeen(store, await ownNote(store, roster, student, item));
    return { ok: true };
  }
  const key = pieceKey(roster.cls.id, student.id, item);
  const row = await read(store, key);
  if (row?.status !== 'returned') reject(404, 'not_found', 'That piece isn’t back yet.');
  if (!row.seen_at) await store.setJSON(key, { ...row, seen_at: new Date().toISOString() });
  return { ok: true };
}
