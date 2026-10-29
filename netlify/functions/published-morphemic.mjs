/**
 * Morphemic matrix for a word a student tapped in a published lesson. Public, no session.
 *
 *   POST /api/published/morphemic/:id        { block_id, word }  the matrix, building it first if no one has
 *   GET  /api/published/morphemic/:id/:key                      poll a build
 *
 * The word must appear in that published block's text, so a caller can only
 * spend a model call on words the teacher published, and each word is built
 * once for everyone (the shared library is the cache).
 */
import { errorResponse, guardRequestOrigin, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { normaliseMatrixWord } from './_shared/morphemic-matrix.mjs';
import { findOrBuildMatrix, readMatrixJob } from './_shared/morphemic-routes.mjs';
import { createPublicStudentHandler } from './_shared/public-student-gate.mjs';
import { getJSON, publishedLessonKey } from './_shared/teaching-blobs.mjs';
import { findBlockById } from './_shared/teaching-student.mjs';
import { kickTextToolRun as defaultKick, richTextToPlain, wordAppearsIn } from './_shared/text-tools.mjs';
import { PUBLISHED_WORD_HELP_RUN_PATH } from './published-word-help.mjs';

export const config = {
  path: ['/api/published/morphemic/:id', '/api/published/morphemic/:id/:key'],
  rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowLimit: 600, windowSize: 60 }
};

const SAFE_ID = /^[a-zA-Z0-9_-]{1,160}$/;

function readParams(request, context = {}) {
  const match = new URL(request.url).pathname.match(/\/api\/published\/morphemic\/([^/]+)(?:\/([^/]+))?$/);
  return {
    lessonId: context.params?.id ?? (match?.[1] ? decodeURIComponent(match[1]) : ''),
    key: context.params?.key ?? (match?.[2] ? decodeURIComponent(match[2]) : '')
  };
}

export function createPublishedMorphemicHandler(deps = {}) {
  const kick = deps.kickTextToolRun ?? defaultKick;
  return createPublicStudentHandler(async (request, context) => {
    const { env, store } = context;
    const { lessonId, key } = readParams(request, context);

    if (request.method === 'GET') {
      const view = key ? await readMatrixJob(store, key) : null;
      if (!view) return withCors(errorResponse(404, 'not_found', 'That build has expired. Try again.', false), request, env);
      return withCors(okResponse(200, view), request, env);
    }
    if (request.method !== 'POST' || key) return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
    const originError = guardRequestOrigin(request, env);
    if (originError) return withCors(originError, request, env);

    const body = await request.json().catch(() => null);
    const blockId = typeof body?.block_id === 'string' ? body.block_id.trim() : '';
    const word = normaliseMatrixWord(body?.word);
    if (!SAFE_ID.test(lessonId) || !blockId || !word) {
      return withCors(errorResponse(400, 'bad_request', 'lesson, block_id and word are required', false), request, env);
    }
    const snapshot = await getJSON(store, publishedLessonKey(lessonId));
    const block = snapshot && typeof snapshot === 'object' ? findBlockById(snapshot.blocks, blockId) : null;
    if (!block || block.block_type !== 'rich_text') {
      return withCors(errorResponse(404, 'not_found', 'Text block not found', false), request, env);
    }
    // Words typed in by the teacher live on the block, not in its text.
    const added = Array.isArray(block.settings?.word_help?.words)
      ? block.settings.word_help.words.some((entry) => entry?.added === true && normaliseMatrixWord(entry.word) === word)
      : false;
    if (!added && !wordAppearsIn(richTextToPlain(block.content?.html), word)) {
      return withCors(errorResponse(404, 'not_found', 'That word is not in this text', false), request, env);
    }
    const view = await findOrBuildMatrix({ request, store, env, word, runPath: PUBLISHED_WORD_HELP_RUN_PATH, kick, fetchImpl: deps.fetchImpl, now: deps.now });
    return withCors(okResponse(200, view), request, env);
  }, deps);
}

export default createPublishedMorphemicHandler();
