/**
 * Question Quadrant, live: students send their own questions and place them
 * on the quadrant; the teacher sees the whole class on one map.
 *
 *   quadrant/questions/<lessonId>/<blockId>/<deviceId>   { at, symbol, items: [{ id, at, text, student, ai? }] }
 *   quadrant/board/<lessonId>/<blockId>                  { closed, moved: { id: {x,y} }, chosen: [id], hidden: [id] }
 *
 * One blob per device, so a class sending at once never overwrites a shared
 * record. The board is the teacher's: moves, chosen questions, hidden ones.
 *
 * Positions are 0–1 on both axes: x runs closed → open, y runs textual (top)
 * → intellectual (bottom). The student places their own question; the app's
 * guess (`ai`) is only ever shown to the teacher.
 *
 * No names are stored. Each device gets a coloured symbol (six colours by six
 * shapes, as in Peer feedback) so its dots read as one student's.
 */
import { randomUUID } from 'node:crypto';
import { completeMessage } from './anthropic-client.mjs';
import { listBlobKeys, mapBounded } from './blobs-list.mjs';
import { deleteKey, getJSON, setJSON } from './teaching-blobs.mjs';
import { findBlockById } from './teaching-student.mjs';

const SAFE_ID = /^[A-Za-z0-9_-]{1,120}$/;
const DEVICE_ID = /^[A-Za-z0-9_-]{12,64}$/;
export const QUADRANT_TEXT_MAX = 200;
export const QUADRANT_PER_STUDENT = 3;
const READ_BATCH = 10;
const SYMBOLS = 36;
const PLACE_MODEL = 'claude-haiku-5-5';
const PLACE_TIMEOUT_MS = 8000;

export class QuadrantError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function isSafeQuadrantId(value) {
  return typeof value === 'string' && SAFE_ID.test(value);
}

export const quadrantQuestionPrefix = (lessonId, blockId) => `quadrant/questions/${lessonId}/${blockId}/`;
export const quadrantQuestionKey = (lessonId, blockId, deviceId) => `${quadrantQuestionPrefix(lessonId, blockId)}${deviceId}`;
export const quadrantBoardKey = (lessonId, blockId) => `quadrant/board/${lessonId}/${blockId}`;

/** Only a student-visible Question Quadrant with collecting switched on takes questions. */
export function blockTakesQuestions(block) {
  return !!block && block.block_type === 'question_quadrant' && block.visibility !== 'teacher_only'
    && block.content?.collect_questions === true;
}

/** A 0–1 point, or null. */
export function point(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const clamp = n => Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000;
  return { x: clamp(x), y: clamp(y) };
}

/**
 * Symbol n as "colour-shape". Walking the diagonals means the first six
 * students get six different colours and six different shapes.
 */
export function symbolFor(n) {
  const i = ((n % SYMBOLS) + SYMBOLS) % SYMBOLS;
  const colour = i % 6;
  return `${colour}-${(colour + Math.floor(i / 6)) % 6}`;
}

function emptyBoard() {
  return { closed: false, moved: {}, chosen: [], hidden: [] };
}

async function readBoard(store, lessonId, blockId) {
  const saved = await getJSON(store, quadrantBoardKey(lessonId, blockId), { consistency: 'strong' });
  if (!saved || typeof saved !== 'object') return emptyBoard();
  return {
    closed: saved.closed === true,
    moved: saved.moved && typeof saved.moved === 'object' ? saved.moved : {},
    chosen: Array.isArray(saved.chosen) ? saved.chosen.filter(isSafeQuadrantId) : [],
    hidden: Array.isArray(saved.hidden) ? saved.hidden.filter(isSafeQuadrantId) : []
  };
}

async function readRecords(store, lessonId, blockId) {
  const keys = await listBlobKeys(store, quadrantQuestionPrefix(lessonId, blockId));
  const records = await mapBounded(keys, READ_BATCH, key => getJSON(store, key, { consistency: 'strong' }));
  return records.filter(r => r && Array.isArray(r.items));
}

function stimulusOf(block) {
  return typeof block?.content?.stimulus === 'string' ? block.content.stimulus.slice(0, 1500) : '';
}

const PLACE_SYSTEM = `You place a student's question on the Question Quadrant (Thinking Toolkit).
Two axes, each from 0 to 1:
- x: 0 = fully closed (one answer that can be found or checked), 1 = fully open (many possible answers, needs imagination or discussion).
- y: 0 = fully textual (about the stimulus itself), 1 = fully intellectual (about ideas and the world beyond the stimulus).
Quadrants: textual+closed = Reading comprehension (answer is in the stimulus); textual+open = Literary speculation (imagine beyond the stimulus); intellectual+closed = Research (answer found from experts and sources); intellectual+open = Inquiry (needs discussion, many perspectives).
A question that is only just open sits close to 0.5 on x. Be decisive but honest about borderline questions.
Reply with JSON only: {"x": number, "y": number}`;

/** The app's guess. Returns a point, or null when there is no key or the model is slow or odd. */
export async function placeWithClaude({ env, text, stimulus, fetchImpl }) {
  if (!env?.ANTHROPIC_API_KEY) return null;
  try {
    const raw = await completeMessage({
      apiKey: env.ANTHROPIC_API_KEY,
      fetchImpl,
      model: env.QUADRANT_PLACE_MODEL || PLACE_MODEL,
      maxTokens: 60,
      system: PLACE_SYSTEM,
      messages: [{
        role: 'user',
        content: `${stimulus ? `Stimulus:\n${stimulus}\n\n` : ''}Question: ${text}`
      }],
      signal: AbortSignal.timeout(PLACE_TIMEOUT_MS)
    });
    const match = String(raw).match(/\{[^}]*\}/);
    return match ? point(JSON.parse(match[0])) : null;
  } catch {
    return null;
  }
}

function findQuestionBlock(snapshot, blockId) {
  if (!isSafeQuadrantId(blockId)) throw new QuadrantError(400, 'invalid_field', 'Unknown block.');
  const block = findBlockById(snapshot?.blocks, blockId);
  if (!blockTakesQuestions(block)) throw new QuadrantError(404, 'not_found', 'This quadrant is not taking questions.');
  return block;
}

function studentState(record, board) {
  const hidden = new Set(board.hidden);
  return {
    open: !board.closed,
    symbol: record?.symbol ?? null,
    per_student: QUADRANT_PER_STUDENT,
    mine: (record?.items ?? []).filter(item => !hidden.has(item.id)).map(({ id, text, student }) => ({ id, text, student }))
  };
}

async function chosenTexts(store, lessonId, blockId, board) {
  if (!board.chosen.length) return [];
  const records = await readRecords(store, lessonId, blockId);
  const byId = new Map(records.flatMap(r => r.items.map(item => [item.id, item])));
  return board.chosen.map(id => byId.get(id)).filter(Boolean).map(item => ({ id: item.id, text: item.text }));
}

/**
 * Student side. `action: 'status'` reads their own questions and the chosen
 * questions; `action: 'send'` adds a question with the student's placement.
 */
export async function handleStudentQuadrant(store, snapshot, body, deps = {}) {
  const lessonId = snapshot?.lesson_id;
  const blockId = typeof body?.block_id === 'string' ? body.block_id : '';
  const deviceId = typeof body?.device_id === 'string' ? body.device_id : '';
  if (!DEVICE_ID.test(deviceId)) throw new QuadrantError(400, 'invalid_field', 'Unknown device.');
  const block = findQuestionBlock(snapshot, blockId);
  const key = quadrantQuestionKey(lessonId, blockId, deviceId);
  const [record, board] = await Promise.all([getJSON(store, key, { consistency: 'strong' }), readBoard(store, lessonId, blockId)]);

  if (body.action === 'status') {
    return { ...studentState(record, board), chosen: await chosenTexts(store, lessonId, blockId, board) };
  }
  if (body.action !== 'send') throw new QuadrantError(400, 'invalid_action', 'Unknown action.');
  if (board.closed) throw new QuadrantError(409, 'closed', 'Your teacher has closed questions for now.');

  const text = typeof body.text === 'string' ? body.text.replace(/\s+/g, ' ').trim().slice(0, QUADRANT_TEXT_MAX) : '';
  const student = point(body.student);
  if (!text) throw new QuadrantError(400, 'invalid_field', 'Write your question first.');
  if (!student) throw new QuadrantError(400, 'invalid_field', 'Place your question on the quadrant first.');
  const items = Array.isArray(record?.items) ? record.items : [];
  if (items.length >= QUADRANT_PER_STUDENT) {
    throw new QuadrantError(409, 'limit', `You can send ${QUADRANT_PER_STUDENT} questions.`);
  }

  let symbol = record?.symbol;
  if (!symbol) {
    const taken = new Set((await readRecords(store, lessonId, blockId)).map(r => r.symbol));
    let n = 0;
    while (taken.has(symbolFor(n)) && n < SYMBOLS) n += 1;
    symbol = symbolFor(n);
  }

  const place = deps.placeQuestion ?? placeWithClaude;
  const ai = await place({ env: deps.env ?? {}, text, stimulus: stimulusOf(block), fetchImpl: deps.fetchImpl });
  const at = deps.nowIso ? deps.nowIso() : new Date().toISOString();
  const item = { id: (deps.newId ?? (() => randomUUID().replace(/-/g, '').slice(0, 16)))(), at, text, student, ...(ai ? { ai } : {}) };
  const next = { at, symbol, items: [...items, item] };
  await setJSON(store, key, next);
  return { ...studentState(next, board), chosen: await chosenTexts(store, lessonId, blockId, board) };
}

/** Teacher side: every question for the block, with the board applied. */
export async function readQuadrantBoard(store, lessonId, blockId) {
  if (!isSafeQuadrantId(blockId)) throw new QuadrantError(400, 'invalid_field', 'Unknown block.');
  const [records, board] = await Promise.all([readRecords(store, lessonId, blockId), readBoard(store, lessonId, blockId)]);
  const hidden = new Set(board.hidden);
  const questions = records
    .flatMap(r => r.items.map(item => ({ ...item, symbol: r.symbol })))
    .filter(item => !hidden.has(item.id) && point(item.student))
    .sort((a, b) => String(a.at).localeCompare(String(b.at)))
    .map(({ id, text, symbol, student, ai }) => ({
      id,
      text,
      symbol,
      student,
      ...(ai ? { ai } : {}),
      ...(board.moved[id] ? { teacher: board.moved[id] } : {})
    }));
  const ids = new Set(questions.map(q => q.id));
  return {
    lesson_id: lessonId,
    block_id: blockId,
    open: !board.closed,
    questions,
    chosen: board.chosen.filter(id => ids.has(id))
  };
}

/** Teacher actions: move, unmove, choose, hide, open, reset. */
export async function updateQuadrantBoard(store, lessonId, body) {
  const blockId = typeof body?.block_id === 'string' ? body.block_id : '';
  if (!isSafeQuadrantId(blockId)) throw new QuadrantError(400, 'invalid_field', 'Unknown block.');
  const action = body?.action;
  if (action === 'reset') {
    const keys = await listBlobKeys(store, quadrantQuestionPrefix(lessonId, blockId));
    await Promise.all([...keys, quadrantBoardKey(lessonId, blockId)].map(key => deleteKey(store, key)));
    return readQuadrantBoard(store, lessonId, blockId);
  }
  const board = await readBoard(store, lessonId, blockId);
  const id = typeof body?.question_id === 'string' ? body.question_id : '';
  const needsId = ['move', 'unmove', 'choose', 'hide'].includes(action);
  if (needsId && !isSafeQuadrantId(id)) throw new QuadrantError(400, 'invalid_field', 'Unknown question.');

  if (action === 'move') {
    const to = point(body.to);
    if (!to) throw new QuadrantError(400, 'invalid_field', 'Unknown position.');
    board.moved = { ...board.moved, [id]: to };
  } else if (action === 'unmove') {
    const { [id]: _drop, ...rest } = board.moved;
    board.moved = rest;
  } else if (action === 'choose') {
    board.chosen = body.on === false ? board.chosen.filter(c => c !== id) : [...new Set([...board.chosen, id])];
  } else if (action === 'hide') {
    board.hidden = [...new Set([...board.hidden, id])];
    board.chosen = board.chosen.filter(c => c !== id);
  } else if (action === 'open') {
    board.closed = body.on === false;
  } else {
    throw new QuadrantError(400, 'invalid_action', 'Unknown action.');
  }
  await setJSON(store, quadrantBoardKey(lessonId, blockId), board);
  return readQuadrantBoard(store, lessonId, blockId);
}
