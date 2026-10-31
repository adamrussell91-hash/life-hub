import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { CLASS_PREFIX, SCHEDULED_LESSON_PREFIX, getJSON, setJSON } from './_shared/teaching-blobs.mjs';
import { defaultGetProfessionalStore, getJSON as getProfessionalJSON } from './_shared/professional-blobs.mjs';
import { isIndexKey, listBlobKeys, mapBounded } from './_shared/blobs-list.mjs';
import { isDeletedRecord } from './_shared/record-liveness.mjs';
import { classInsight } from './_shared/quiz.mjs';
import { sydneyDay } from './_shared/markbook.mjs';
import { listReps } from './_shared/walkthru-reps.mjs';
import { computeProof, lessonScore } from '../../packages/walkthrus/proof.mjs';
import { isFusionId } from '../../packages/walkthrus/tiles.mjs';
import { isSafeRepId } from '../../packages/walkthrus/reps.mjs';

export const config = { path: '/api/walkthrus-proof' };

const CACHE_KEY = 'walkthrus_proof/cache';
const CACHE_MS = 10 * 60 * 1000;
/** The most recent lesson-and-class pairs looked at. Older lessons drop out of Proof. */
export const MAX_PAIRS = 200;
const BOARD_KEY = 'walkthrus_board/v1';
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * The fusions on Adam's board (professional store), for the Teaching lesson card: name, steps and
 * parents. Step text starts from the book, so it is served only to the signed-in teacher.
 */
export function fusionsOf(board) {
  const list = Array.isArray(board?.fusions) ? board.fusions : [];
  return list
    .filter((f) => f && isFusionId(f.id) && !f.deleted_at)
    .map((f) => ({
      id: f.id,
      name: str(f.name, 120) || 'Fusion',
      parents: Array.isArray(f.parents) ? f.parents.filter((p) => typeof p === 'string').slice(0, 3) : [],
      steps: (Array.isArray(f.steps) ? f.steps : []).slice(0, 9).map((s, i) => ({
        n: i + 1,
        label: str(s?.label ?? s?.heading, 160),
        text: str(s?.text ?? s?.instruction, 2000)
      }))
    }));
}

/**
 * Every (lesson, class) pair worth scoring, newest first: lessons on a class calendar up to today,
 * plus lessons a class has a rep for. Capped at MAX_PAIRS.
 */
async function lessonPairs(store, reps, today) {
  const keys = (await listBlobKeys(store, SCHEDULED_LESSON_PREFIX)).filter((k) => !isIndexKey(k));
  const rows = await mapBounded(keys, 8, (key) => getJSON(store, key, { consistency: 'strong' }).catch(() => null));
  const pairs = new Map();
  for (const row of rows) {
    if (!row || isDeletedRecord(row) || !isSafeRepId(row.lesson_id) || !isSafeRepId(row.class_id)) continue;
    if (!DAY.test(row.date ?? '') || row.date > today) continue;
    const key = `${row.lesson_id}~${row.class_id}`;
    const prev = pairs.get(key);
    if (!prev || row.date > prev.date) pairs.set(key, { lesson_id: row.lesson_id, class_id: row.class_id, date: row.date });
  }
  for (const rep of reps) {
    if (!rep.class_id || pairs.has(`${rep.lesson_id}~${rep.class_id}`)) continue;
    const date = (rep.lesson_end ?? rep.at).slice(0, 10);
    if (date > today) continue;
    pairs.set(`${rep.lesson_id}~${rep.class_id}`, { lesson_id: rep.lesson_id, class_id: rep.class_id, date });
  }
  return [...pairs.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, MAX_PAIRS);
}

/**
 * Proof v1 scores a lesson from quiz attempts only: each student's latest attempt in that class,
 * awarded marks over available marks (packages/walkthrus/proof.mjs lessonScore).
 * Hinge answers are kept per device with no class and no first-try record, so they cannot be
 * scored per class yet and are left out. A class with no list has anonymous attempts, so its
 * score covers every latest attempt at that quiz.
 */
async function insightScore(store, lessonId, classId) {
  const insight = await classInsight(store, lessonId, classId, null, { family: false });
  return insight ? lessonScore(insight.attempts) : null;
}

export async function buildProof(store, { today, now = new Date().toISOString(), scoreLesson = insightScore } = {}) {
  const reps = await listReps(store);
  const pairs = await lessonPairs(store, reps, today ?? sydneyDay(now));
  const lessonIds = [...new Set(pairs.map((p) => p.lesson_id))];
  const hasQuiz = new Set();
  await mapBounded(lessonIds, 8, async (id) => {
    const current = await getJSON(store, `quiz/${id}/current`, { consistency: 'strong' }).catch(() => null);
    if (current?.version) hasQuiz.add(id);
  });
  const scored = await mapBounded(pairs.filter((p) => hasQuiz.has(p.lesson_id)), 4, async (pair) => {
    try {
      const score = await scoreLesson(store, pair.lesson_id, pair.class_id);
      return score === null ? null : { ...pair, score };
    } catch (error) {
      console.warn('walkthrus proof: a lesson could not be scored', error);
      return null;
    }
  });
  const scores = scored.filter(Boolean);
  const rows = computeProof({ scores, reps });
  const classIds = [...new Set(rows.map((r) => r.class_id))];
  const classes = {};
  await mapBounded(classIds, 8, async (id) => {
    const cls = await getJSON(store, `${CLASS_PREFIX}${id}`).catch(() => null);
    classes[id] = str(cls?.display_name || cls?.title || cls?.code, 80) || 'Class';
  });
  return { rows, classes, lessons_scored: scores.length, generated_at: now };
}

/**
 * Teacher only.
 * GET /api/walkthrus-proof[?rebuild=1]  → { proof: { rows, classes, lessons_scored, generated_at } }  (kept 10 minutes)
 * GET /api/walkthrus-proof?fusions=1  → { fusions: [{ id, name, parents, steps: [{ n, label, text }] }] }
 */
export function createWalkthrusProofHandler(deps = {}) {
  const getProfessionalStore = deps.getProfessionalStore ?? defaultGetProfessionalStore;
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    const headers = { 'cache-control': 'no-store' };
    if (request.method !== 'GET') return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
    const params = new URL(request.url).searchParams;
    if (params.get('fusions') === '1') {
      let board = null;
      try {
        const pro = await getProfessionalStore(env);
        board = pro ? await getProfessionalJSON(pro, BOARD_KEY) : null;
      } catch {
        return withCors(errorResponse(503, 'professional_blobs_unbound', 'Professional content store is not bound.', true), request, env);
      }
      return withCors(okResponse(200, { fusions: fusionsOf(board) }, headers), request, env);
    }
    const now = nowIso();
    if (params.get('rebuild') !== '1') {
      const cached = await getJSON(store, CACHE_KEY).catch(() => null);
      if (cached?.proof && Date.parse(now) - Date.parse(cached.at) < CACHE_MS) return withCors(okResponse(200, { proof: cached.proof }, headers), request, env);
    }
    const proof = await buildProof(store, { now, today: deps.today?.() });
    await setJSON(store, CACHE_KEY, { at: now, proof }).catch((error) => console.warn('walkthrus proof cache save failed', error));
    return withCors(okResponse(200, { proof }, headers), request, env);
  }, deps);
}

export default createWalkthrusProofHandler();
