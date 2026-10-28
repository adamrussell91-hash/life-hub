// netlify/functions/question-book.mjs
// The Question Book's API, operator only. Answers save as you go and keep earlier versions, in
// the encrypted R2 cognitive store under question-book/v1 (never the Teaching content store);
// the one model call (Notice a pattern) runs only when asked.
//
//   GET  /api/question-book                              groups and chapters with counts
//   GET  /api/question-book?chapter=<id>                 one chapter: questions, charts, answers, notes
//   GET  /api/question-book?chapter=<id>&history=<qid>   one question's earlier versions
//   PUT  /api/question-book  { chapter, question, value }        save (value null clears)
//   PUT  /api/question-book  { chapter: 'qb_your_questions', own } save your own questions
//   POST /api/question-book/notice  { chapter }          one short observation and a follow-up question
import { createSessionOriginHandler } from './_shared/operator-gate.mjs';
import { QuizError } from './_shared/question-drop.mjs';
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { AnswerError } from '../../packages/question-book/answers.mjs';
import { OWN_CHAPTER } from '../../packages/question-book/catalogue.mjs';
import { createQuestionSource, defaultGetQuestionBookStore, listChapters, ownerDocs, notice, readChapter, readHistory, saveAnswer, saveOwn } from './_shared/question-book.mjs';

export const config = { path: ['/api/question-book', '/api/question-book/notice'], timeout: 26 };

/** The cognitive store's owner, as Problem Solver picks it. */
export function owner(env) {
  return env.COGNITIVE_OWNER_ID || 'operator';
}

export function createQuestionBookHandler(deps = {}) {
  let loadSource = deps.loadSource ?? null;
  return createSessionOriginHandler(async (request, context) => {
    const { env } = context;
    let cognitive = null;
    try {
      cognitive = deps.getStore ? await deps.getStore(env) : await defaultGetQuestionBookStore(env);
    } catch {
      cognitive = null;
    }
    if (!cognitive) return withCors(errorResponse(503, 'store_unbound', 'Question Book storage is not configured.', true), request, env);
    const store = ownerDocs(cognitive, owner(env));
    loadSource ??= createQuestionSource({ env, fetchImpl: deps.fetchImpl ?? fetch, now: deps.now ?? Date.now });
    const now = deps.now ?? Date.now;
    const ok = (data) => withCors(okResponse(200, data, { 'cache-control': 'no-store' }), request, env);
    try {
      const url = new URL(request.url);
      const isNotice = url.pathname.endsWith('/notice') || url.searchParams.get('action') === 'notice';
      if (isNotice) {
        if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
        return ok(await notice(store, loadSource, await request.json(), { env, now, complete: deps.completeMessage, modelFetch: deps.modelFetch, newId: deps.newId }));
      }
      if (request.method === 'GET') {
        const chapter = url.searchParams.get('chapter');
        const history = url.searchParams.get('history');
        if (chapter && history) return ok(await readHistory(store, loadSource, chapter, history));
        if (chapter) return ok(await readChapter(store, loadSource, chapter));
        return ok(await listChapters(store, loadSource));
      }
      if (request.method === 'PUT') {
        const body = await request.json();
        if (body?.chapter === OWN_CHAPTER) return ok(await saveOwn(store, body, { now }));
        return ok(await saveAnswer(store, loadSource, body, { now }));
      }
      return withCors(methodNotAllowed('GET, PUT, POST, OPTIONS'), request, env);
    } catch (e) {
      if (e instanceof QuizError || e instanceof AnswerError || e instanceof SyntaxError) {
        return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      }
      throw e;
    }
  }, deps);
}

export default createQuestionBookHandler();
