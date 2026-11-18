import {
  createTravelOperatorHandler,
  okResponse,
  errorResponse,
  readJson,
  PRIVATE_CACHE
} from './_shared/travel-http.mjs';
import { audioBytesKey, audioMetaKey, defaultGetTravelStore, isAudioId } from './_shared/travel-blobs.mjs';
import { knowledgeKernelFetch } from './_shared/knowledge-kernel.mjs';
import { checkRateLimit } from './_shared/travel-rate-limit.mjs';

export const config = { path: '/api/travel-transcribe' };

/** One call for a 30 second clip. The function itself is allowed 26 seconds (netlify.toml). */
export const TRANSCRIBE_TIMEOUT_MS = 20_000;
export const TRANSCRIBE_PER_MINUTE = 10;
export const MAX_TRANSCRIPT_CHARS = 600;

/** One paragraph of plain words, short enough for the back of a postcard. */
export function tidyTranscript(text) {
  const flat = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
  return Array.from(flat).slice(0, MAX_TRANSCRIPT_CHARS).join('');
}

/**
 * POST ?trip=… with { audio_id }: the words of a stored clip.
 * Owner only. The words are personal: they go back to the owner and are never logged.
 */
export function createTravelTranscribeHandler(deps = {}) {
  const getStore = deps.getTravelStore ?? defaultGetTravelStore;
  const kernelFetch = deps.kernelFetch ?? knowledgeKernelFetch;
  const timeoutMs = deps.timeoutMs ?? TRANSCRIBE_TIMEOUT_MS;
  const failed = () =>
    errorResponse(502, 'transcription_failed', "Couldn't write out the words. Try again.", true, PRIVATE_CACHE);

  return createTravelOperatorHandler(async (request, ctx) => {
    if (request.method !== 'POST') {
      return errorResponse(405, 'method_not_allowed', 'Use POST.', false, PRIVATE_CACHE);
    }
    const tripId = new URL(request.url).searchParams.get('trip');
    const body = await readJson(request);
    const audioId = body?.audio_id;
    if (!tripId || !isAudioId(audioId)) {
      return errorResponse(400, 'validation_error', 'trip and audio_id are required.', false, PRIVATE_CACHE);
    }
    await ctx.repo.getTrip(tripId);

    const store = await getStore(ctx.env);
    let meta = null;
    try {
      const raw = await store.get(audioMetaKey(audioId), { type: 'text' });
      meta = raw ? JSON.parse(raw) : null;
    } catch {
      meta = null;
    }
    const clip =
      meta?.trip_id === tripId
        ? await store.getWithMetadata(audioBytesKey(audioId), { type: 'arrayBuffer' })
        : null;
    if (!clip?.data) {
      return errorResponse(404, 'not_found', 'Clip not found.', false, PRIVATE_CACHE);
    }

    const sessionKey = ctx.session?.token || ctx.session?.id || 'anon';
    checkRateLimit(`transcribe:${sessionKey}`, { limit: TRANSCRIBE_PER_MINUTE, now: ctx.now() });

    let response;
    try {
      response = await kernelFetch('/transcribe', {
        env: ctx.env,
        fetchImpl: deps.fetchImpl ?? fetch,
        method: 'POST',
        body: { audio: Buffer.from(clip.data).toString('base64') },
        timeoutMs
      });
    } catch (error) {
      if (error?.code === 'knowledge_kernel_unbound') {
        return errorResponse(
          503,
          'transcription_unavailable',
          "Transcription isn't connected.",
          false,
          PRIVATE_CACHE
        );
      }
      return failed();
    }
    if (!response.ok) return failed();
    const payload = await response.json().catch(() => null);
    return okResponse(200, { text: tidyTranscript(payload?.text) }, PRIVATE_CACHE);
  }, deps);
}

export default createTravelTranscribeHandler();
