/**
 * Student "Dictionary scan" on a published rich text block. Public, no session.
 *
 *   POST /api/published/word-help/:id        { block_id }  start or reuse a scan
 *   GET  /api/published/word-help/:id/:key                 poll it
 *
 * The text always comes from the published snapshot, never from the request,
 * so a caller can only spend a model call on text the teacher published, and
 * each distinct block text is scanned once (the job record is the cache).
 * A teacher's own pre-scan ships inside the block, so the page never calls this.
 */
import {
  errorResponse,
  guardRequestOrigin,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { createPublicStudentHandler } from './_shared/public-student-gate.mjs';
import { getJSON, publishedLessonKey } from './_shared/teaching-blobs.mjs';
import { findBlockById } from './_shared/teaching-student.mjs';
import {
  kickTextToolRun as defaultKick,
  publicJobView,
  readTextToolJob,
  richTextToPlain,
  startTextToolJob,
  textToolInputError
} from './_shared/text-tools.mjs';

export const config = {
  path: ['/api/published/word-help/:id', '/api/published/word-help/:id/:key'],
  // A whole class shares one school IP and each scan polls for a few seconds.
  rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowLimit: 600, windowSize: 60 }
};

export const PUBLISHED_WORD_HELP_RUN_PATH = '/api/published/word-help-run';
const SAFE_ID = /^[a-zA-Z0-9_-]{1,160}$/;

function readParams(request, context = {}) {
  const match = new URL(request.url).pathname.match(/\/api\/published\/word-help\/([^/]+)(?:\/([^/]+))?$/);
  return {
    lessonId: context.params?.id ?? (match?.[1] ? decodeURIComponent(match[1]) : ''),
    key: context.params?.key ?? (match?.[2] ? decodeURIComponent(match[2]) : '')
  };
}

export function createPublishedWordHelpHandler(deps = {}) {
  const kick = deps.kickTextToolRun ?? defaultKick;
  return createPublicStudentHandler(async (request, context) => {
    const { env, store } = context;
    const { lessonId, key } = readParams(request, context);

    if (request.method === 'GET') {
      const job = key ? await readTextToolJob(store, key) : null;
      if (!job || job.tool !== 'dictionary') {
        return withCors(errorResponse(404, 'not_found', 'That scan has expired. Try again.', false), request, env);
      }
      return withCors(okResponse(200, publicJobView(key, job)), request, env);
    }
    if (request.method !== 'POST' || key) {
      return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
    }
    const originError = guardRequestOrigin(request, env);
    if (originError) return withCors(originError, request, env);

    const body = await request.json().catch(() => null);
    const blockId = typeof body?.block_id === 'string' ? body.block_id.trim() : '';
    if (!SAFE_ID.test(lessonId) || !blockId) {
      return withCors(errorResponse(400, 'bad_request', 'lesson and block_id are required', false), request, env);
    }
    const snapshot = await getJSON(store, publishedLessonKey(lessonId));
    if (!snapshot || typeof snapshot !== 'object') {
      return withCors(errorResponse(404, 'not_found', 'Lesson is not published', false), request, env);
    }
    const block = findBlockById(snapshot.blocks, blockId);
    if (!block || block.block_type !== 'rich_text') {
      return withCors(errorResponse(404, 'not_found', 'Text block not found', false), request, env);
    }

    const text = richTextToPlain(block.content?.html);
    const inputError = textToolInputError('dictionary', text);
    if (inputError) {
      return withCors(errorResponse(400, 'validation_error', inputError, false), request, env);
    }
    const started = await startTextToolJob({ store, env, tool: 'dictionary', text, now: deps.now });
    if (started.kick) await kick(request, PUBLISHED_WORD_HELP_RUN_PATH, started.key, deps.fetchImpl);
    return withCors(okResponse(200, publicJobView(started.key, started.job)), request, env);
  }, deps);
}

export default createPublishedWordHelpHandler();
