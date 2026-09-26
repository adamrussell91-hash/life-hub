import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { completeJson } from './_shared/clare-comms-model.mjs';
import {
  checkPurpose, generateBrief, generateDrafts, generateSummary, readHandwriting, suggestNextSession, suggestTaskTitle
} from './_shared/clare-comms.mjs';
import { calendarGhostFromToolInput } from './calendar-ghosts.mjs';
import { enqueueCalendarGhost } from './_shared/calendar-ghost-queue.mjs';
import { createGitHubClient } from './_shared/github-client.mjs';
import { decodeBlob } from './_shared/decode-blob.mjs';
import { defaultGetProfessionalStore } from './_shared/professional-blobs.mjs';

export const config = { path: '/api/clare/comms' };

const MAX_BODY_CHARS = 8_000_000;

function sydneyStamp(date) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Australia/Sydney', dateStyle: 'short', timeStyle: 'medium' }).format(date).replace(' ', 'T');
}

export function createClareCommsHandler(deps = {}) {
  // `clareNow` is Clare's own business clock (the ghost's created_at stamp), kept
  // distinct from `deps.now`, which createOperatorHandler reserves for the session
  // freshness check (same split as communications.mjs's `communicationNow`).
  const clareNow = deps.clareNow ?? (() => new Date());
  return createOperatorHandler(
    async (request, context) => {
      const env = deps.env ?? context.env;
      if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
      const apiKey = env?.ANTHROPIC_API_KEY;
      if (!apiKey && !deps.complete) {
        return withCors(errorResponse(503, 'clare_unconfigured', 'Clare needs ANTHROPIC_API_KEY on the server.', false), request, env);
      }
      const complete = deps.complete ?? ((input) => completeJson({ ...input, apiKey }));
      const enqueue = deps.enqueue ?? ((entry) => enqueueCalendarGhost({ client: createGitHubClient({ env }), decodeBlob, entry }));
      try {
        const parsed = await readJsonObject(request);
        if (parsed.error) return withCors(parsed.error, request, env);
        const body = parsed.value;
        if (JSON.stringify(body).length > MAX_BODY_CHARS) {
          return withCors(errorResponse(413, 'too_large', 'That is too much for Clare in one go.', false), request, env);
        }
        const ctx = body?.context ?? {};
        switch (body?.action) {
          case 'brief': return withCors(okResponse(200, await generateBrief(ctx, { complete })), request, env);
          case 'summary': return withCors(okResponse(200, await generateSummary(ctx, { complete })), request, env);
          case 'drafts': return withCors(okResponse(200, await generateDrafts(ctx, { complete })), request, env);
          case 'handwriting': return withCors(okResponse(200, await readHandwriting(body.image, { complete })), request, env);
          case 'purpose_check': return withCors(okResponse(200, await checkPurpose(ctx, { complete })), request, env);
          case 'task_title': return withCors(okResponse(200, await suggestTaskTitle(ctx, { complete })), request, env);
          case 'propose_next': {
            const slot = await suggestNextSession(ctx, { complete });
            const entry = calendarGhostFromToolInput({
              kind: 'book_comm',
              date: slot.date,
              time: slot.time,
              duration_min: slot.duration_min,
              title: String(ctx.title ?? 'Next session').slice(0, 120),
              channel: ctx.channel ?? 'in_person',
              time_zone: ctx.time_zone ?? 'Australia/Sydney',
              purpose_tag: ctx.purpose_tag ?? null,
              thread_ref: ctx.thread_ref ?? null,
              person_refs: (ctx.people ?? []).filter((person) => person.role === 'with').map((person) => person.ref),
              reason: slot.reason
            }, { agent: 'clare', nowIso: sydneyStamp(clareNow()) });
            const result = await enqueue({ ...entry, via: 'clare-comms' });
            return withCors(okResponse(200, { ...slot, ghost_id: result.id, queued: result.added }), request, env);
          }
          default:
            return withCors(errorResponse(400, 'invalid_action', 'Unknown Clare action.', false), request, env);
        }
      } catch (error) {
        const status = Number.isInteger(error?.status) ? error.status : 500;
        const code = typeof error?.code === 'string' ? error.code : 'internal_error';
        return withCors(errorResponse(status, code, error?.message || 'Clare could not finish.', status >= 500), request, env);
      }
    },
    {
      ...deps,
      unboundCode: deps.unboundCode ?? 'professional_blobs_unbound',
      unboundMessage: deps.unboundMessage ?? 'Professional content store is not bound.',
      getContentStore: deps.getContentStore ?? defaultGetProfessionalStore
    }
  );
}

export default createClareCommsHandler();
