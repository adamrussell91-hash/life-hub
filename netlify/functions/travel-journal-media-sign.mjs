import {
  createTravelOperatorHandler,
  okResponse,
  errorResponse,
  readJson,
  PRIVATE_CACHE
} from './_shared/travel-http.mjs';
import {
  JOURNAL_MEDIA_SIGN_EXPIRES_IN,
  parseJournalMediaSignRequest,
  travelJournalHeadObject,
  travelJournalPresignPut,
  travelJournalR2Unbound,
  verifyHeadObject
} from './_shared/travel-journal-r2.mjs';
import { stampStoredJournalMedia } from './_shared/travel-journal-media-stamp.mjs';

export const config = { path: '/api/travel-journal-media-sign' };

export function createTravelJournalMediaSignHandler(deps = {}) {
  return createTravelOperatorHandler(async (request, ctx) => {
    if (request.method !== 'POST') {
      return errorResponse(405, 'method_not_allowed', 'Use POST.', false, PRIVATE_CACHE);
    }

    const body = await readJson(request);
    const parsed = parseJournalMediaSignRequest(body);
    if (parsed.error) {
      return errorResponse(400, 'validation_error', parsed.error, false, PRIVATE_CACHE);
    }

    if (parsed.value.action === 'verify') {
      const head = await travelJournalHeadObject(ctx.env, {
        key: parsed.value.key,
        headObject: deps.headObject
      });
      const check = verifyHeadObject(head, parsed.value);
      if (!check.ok) {
        return errorResponse(400, 'verify_failed', check.message, false, PRIVATE_CACHE);
      }

      const saved = await stampStoredJournalMedia(ctx.repo, parsed.value);
      const row = saved.journal.media.find((item) => item.id === parsed.value.media_id);
      return okResponse(
        200,
        {
          upload_state: row?.upload_state ?? 'pending',
          journal: saved.journal,
          version: saved.version,
          key: parsed.value.key
        },
        PRIVATE_CACHE
      );
    }

    try {
      const upload_url = await travelJournalPresignPut(ctx.env, {
        key: parsed.value.key,
        contentType: parsed.value.content_type,
        checksum: parsed.value.checksum,
        signPut: deps.signPut
      });
      return okResponse(
        200,
        {
          upload_url,
          headers: { 'Content-Type': parsed.value.content_type },
          key: parsed.value.key,
          expires_in: JOURNAL_MEDIA_SIGN_EXPIRES_IN
        },
        PRIVATE_CACHE
      );
    } catch (error) {
      if (error?.code === travelJournalR2Unbound().code || error?.status === 503) {
        return errorResponse(
          503,
          'travel_journal_r2_unbound',
          'Journal media storage is not configured',
          true,
          PRIVATE_CACHE
        );
      }
      throw error;
    }
  }, deps);
}

export default createTravelJournalMediaSignHandler();
