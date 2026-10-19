import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { errorResponse, okResponse, methodNotAllowed, withCors } from './_shared/http.mjs';
import { boundedJson } from './_shared/alchemy-analysis.mjs';
import { alchemyJobError } from './_shared/alchemy-check.mjs';
import { knowledgeIndex } from './_shared/alchemy-unit-notes.mjs';
import { lexicalRetrieve } from './_shared/knowledge-alchemist.mjs';
import { readNoteText } from './_shared/alchemy-notes-index.mjs';
import { readAgentSettings, writeAgentSettings, rememberAcceptedSource } from './_shared/alchemy-agent.mjs';
import { startAgentJob, readAgentJob, latestAgentJob, updateAgentJob, invokeAgentRun, isSafeId } from './_shared/alchemy-agent-jobs.mjs';

export const config = { path: ['/api/alchemy-agent', '/api/alchemy-agent/settings'], timeout: 26 };

const reply = (request, env, data, status = 200) => withCors(okResponse(status, data), request, env);
const fail = (request, env, error) => {
  const e = alchemyJobError(error);
  return withCors(errorResponse(e.status, e.code, e.message, e.status >= 500 || e.status === 429), request, env);
};
const bad = (request, env, message) => withCors(errorResponse(400, 'validation_error', message, false), request, env);

/** What the page needs from a job: never the raw transcript. */
export function publicJob(job) {
  if (!job) return null;
  return { job: job.id, kind: job.kind, id: job.entityId, blockId: job.blockId, scope: job.scope, status: job.status, progress: job.progress ?? [], result: job.result ?? null, error: job.error ?? null, decisions: job.decisions ?? {}, created_at: job.created_at };
}

/**
 * Quick front door for Ann's lesson reviews. Starting a review creates a job
 * and hands it to the background runner (`/api/alchemy-agent/run`); the page
 * polls `GET ?job=`. Also records accept/dismiss decisions and holds the
 * rules-note setting.
 */
export function createAlchemyAgentHandler(deps = {}) {
  return createOperatorHandler(async (request, { env, store }) => {
    const url = new URL(request.url);
    try {
      if (url.pathname.endsWith('/settings')) return await settings(request, env, store, url);
      if (request.method === 'GET') {
        const jobId = url.searchParams.get('job');
        const kind = url.searchParams.get('kind') === 'unit' ? 'unit' : 'lesson';
        const entityId = url.searchParams.get('id');
        if (jobId) {
          const job = await readAgentJob(store, jobId);
          return job ? reply(request, env, publicJob(job)) : withCors(errorResponse(404, 'not_found', 'That review is no longer available.', false), request, env);
        }
        if (isSafeId(entityId)) return reply(request, env, publicJob(await latestAgentJob(store, kind, entityId)));
        return bad(request, env, 'Choose a lesson, unit or review.');
      }
      if (request.method !== 'POST') return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
      let body; try { body = await boundedJson(new Response(request.body, { headers: request.headers }), 16000); } catch { body = null; }
      if (!body || typeof body !== 'object') return bad(request, env, 'Send a lesson to review.');
      if (body.action === 'accepted' || body.action === 'dismissed') {
        const job = await readAgentJob(store, body.job);
        const proposal = job?.result?.proposals?.find(p => p.id === body.proposal);
        if (!proposal) return withCors(errorResponse(404, 'not_found', 'That suggestion is no longer available.', false), request, env);
        const next = await updateAgentJob(store, job.id, current => ({ ...current, decisions: { ...(current.decisions ?? {}), [proposal.id]: body.action } }));
        if (body.action === 'accepted') {
          const entity = job.kind === 'unit' ? null : await store.get('lessons/' + job.entityId, { type: 'json', consistency: 'strong' });
          await rememberAcceptedSource(store, job.kind === 'unit' ? job.entityId : entity?.unit_id, proposal).catch(() => {});
        }
        return reply(request, env, publicJob(next));
      }
      if (!['lesson', 'unit'].includes(body.kind) || !isSafeId(body.id)) return bad(request, env, 'Choose a lesson or unit to review.');
      if (body.blockId !== undefined && body.blockId !== null && !isSafeId(body.blockId)) return bad(request, env, 'Choose a block.');
      if (body.request !== undefined && (typeof body.request !== 'string' || body.request.length > 2000)) return bad(request, env, 'Keep your request under 2,000 characters.');
      const { job, existing } = await startAgentJob(store, { kind: body.kind, id: body.id, blockId: body.blockId ?? null, request: body.request ?? '' }, { env, now: deps.now });
      if (!existing) {
        const started = await (deps.invokeRun ?? invokeAgentRun)(request, job.id).catch(() => false);
        if (!started) {
          await updateAgentJob(store, job.id, current => ({ ...current, status: 'error', error: { status: 503, code: 'alchemy_unavailable', message: 'Ann could not start. Try again in a minute.' } }));
          return withCors(errorResponse(503, 'alchemy_unavailable', 'Ann could not start. Try again in a minute.', true), request, env);
        }
      }
      return reply(request, env, publicJob(job), 202);
    } catch (error) {
      return fail(request, env, error);
    }
  }, deps);
}

async function settings(request, env, store, url) {
  if (request.method === 'GET') {
    const search = url.searchParams.get('search');
    if (search !== null) {
      // Title search over the manifest: quick enough for a live request.
      const rows = await knowledgeIndex({ store, env, fetchImpl: fetch });
      return reply(request, env, { notes: lexicalRetrieve(rows, search, 12).map(r => ({ id: r.id, title: r.title })) });
    }
    return reply(request, env, await readAgentSettings(store));
  }
  if (request.method !== 'PUT') return withCors(methodNotAllowed('GET, PUT, OPTIONS'), request, env);
  let body; try { body = await boundedJson(new Response(request.body, { headers: request.headers }), 4000); } catch { body = null; }
  if (body?.rulesNoteId === null) return reply(request, env, await writeAgentSettings(store, {}));
  if (typeof body?.rulesNoteId !== 'string' || !body.rulesNoteId) return bad(request, env, 'Choose a note.');
  const note = await readNoteText(body.rulesNoteId, { env, fetchImpl: fetch });
  if (!note) return withCors(errorResponse(404, 'not_found', 'That note is not in the Knowledge Hub.', false), request, env);
  return reply(request, env, await writeAgentSettings(store, { rulesNoteId: note.id, rulesNoteTitle: note.title }));
}

export default createAlchemyAgentHandler();
