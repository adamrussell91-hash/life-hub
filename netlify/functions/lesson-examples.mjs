/**
 * Teacher side of class examples.
 * GET  /api/lessons/:id/examples?context=<classId|direct>
 * POST /api/lessons/:id/examples  { action, context?, ... }
 *
 * Both answer with the same payload so the editor repaints from one source.
 */
import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { isDeletedRecord, withoutDeleted } from './_shared/record-liveness.mjs';
import {
  classKey,
  draftLessonKey,
  getJSON,
  SCHEDULED_LESSON_PREFIX
} from './_shared/teaching-blobs.mjs';
import {
  addSlot,
  clearEntry,
  closeSlot,
  DIRECT_CONTEXT,
  editText,
  ExampleError,
  isSafeId,
  markLiveContext,
  normaliseContext,
  openSlot,
  readTeacherExamples,
  removeSlot,
  renameSlot,
  restoreSlot,
  setShown
} from './_shared/class-examples.mjs';

export const config = { path: '/api/lessons/:id/examples' };

function readLessonId(request, context = {}) {
  if (typeof context.params?.id === 'string' && context.params.id) return context.params.id;
  const match = new URL(request.url).pathname.match(/\/api\/lessons\/([^/]+)\/examples$/);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

/** Classes this lesson is scheduled in, plus the bare lesson link. */
async function lessonContexts(store, lessonId) {
  const { blobs } = await store.list({ prefix: SCHEDULED_LESSON_PREFIX });
  const rows = await Promise.all(blobs.map(blob => getJSON(store, blob.key)));
  const byClass = new Map();
  for (const row of withoutDeleted(rows)) {
    if (row?.lesson_id !== lessonId || !isSafeId(row.class_id)) continue;
    const dates = byClass.get(row.class_id) ?? [];
    if (typeof row.date === 'string' && row.date) dates.push(row.date);
    byClass.set(row.class_id, dates);
  }

  const contexts = [];
  for (const [classId, dates] of byClass) {
    const cls = await getJSON(store, classKey(classId));
    if (!cls || isDeletedRecord(cls) || cls.status === 'archived') continue;
    const name = [cls.code, cls.title].filter(part => typeof part === 'string' && part.trim());
    contexts.push({
      id: classId,
      label: name[0]?.trim() || classId,
      detail: name.length > 1 ? name[1].trim() : '',
      dates: [...new Set(dates)].sort()
    });
  }
  contexts.sort((a, b) => a.label.localeCompare(b.label));
  contexts.push({ id: DIRECT_CONTEXT, label: 'Lesson link', detail: 'Students who open the lesson on its own', dates: [] });
  return contexts;
}

async function payload(store, lessonId, context) {
  const [examples, contexts] = await Promise.all([
    readTeacherExamples(store, lessonId, context),
    lessonContexts(store, lessonId)
  ]);
  return { ...examples, contexts };
}

/** Actions on one class's answers; each marks that class as the one being taught. */
const CONTEXT_ACTIONS = new Set(['open', 'close', 'show', 'hide', 'edit_text', 'clear']);

const ACTIONS = {
  add_slot: (store, id, _ctx, body, deps) => addSlot(store, id, body, deps),
  rename_slot: (store, id, _ctx, body, deps) => renameSlot(store, id, body, deps),
  remove_slot: (store, id, _ctx, body, deps) => removeSlot(store, id, body, deps),
  restore_slot: (store, id, _ctx, body, deps) => restoreSlot(store, id, body, deps),
  open: (store, id, ctx, body, deps) => openSlot(store, id, ctx, body, deps),
  close: (store, id, ctx, body) => closeSlot(store, id, ctx, body),
  show: (store, id, ctx, body) => setShown(store, id, ctx, { ...body, shown: true }),
  hide: (store, id, ctx, body) => setShown(store, id, ctx, { ...body, shown: false }),
  edit_text: (store, id, ctx, body, deps) => editText(store, id, ctx, body, deps),
  clear: (store, id, ctx, body) => clearEntry(store, id, ctx, body)
};

export function createLessonExamplesHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    const lessonId = readLessonId(request, context);
    const draft = isSafeId(lessonId) ? await getJSON(store, draftLessonKey(lessonId)) : null;
    if (!draft || isDeletedRecord(draft)) {
      return withCors(errorResponse(404, 'not_found', 'Lesson not found', false), request, env);
    }

    if (request.method === 'GET') {
      const exampleContext = normaliseContext(new URL(request.url).searchParams.get('context'));
      if (!exampleContext) {
        return withCors(errorResponse(400, 'invalid_field', 'Unknown class.', false), request, env);
      }
      return withCors(okResponse(200, await payload(store, lessonId, exampleContext)), request, env);
    }

    if (request.method !== 'POST') {
      return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
    }

    const body = await request.json().catch(() => ({}));
    const run = typeof body?.action === 'string' && Object.hasOwn(ACTIONS, body.action)
      ? ACTIONS[body.action]
      : null;
    if (!run) {
      return withCors(errorResponse(400, 'invalid_action', 'Unknown action.', false), request, env);
    }
    const exampleContext = normaliseContext(body.context);
    if (!exampleContext) {
      return withCors(errorResponse(400, 'invalid_field', 'Unknown class.', false), request, env);
    }

    try {
      const result = await run(store, lessonId, exampleContext, body, deps);
      if (CONTEXT_ACTIONS.has(body.action)) await markLiveContext(store, lessonId, exampleContext, deps);
      const data = await payload(store, lessonId, exampleContext);
      return withCors(
        okResponse(200, body.action === 'remove_slot' ? { ...data, removed: result } : data),
        request,
        env
      );
    } catch (error) {
      if (error instanceof ExampleError) {
        return withCors(errorResponse(error.status, error.code, error.message, false), request, env);
      }
      throw error;
    }
  }, deps);
}

export default createLessonExamplesHandler();
