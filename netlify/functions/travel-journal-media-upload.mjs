import { createHash } from 'node:crypto';
import {
  createTravelOperatorHandler,
  okResponse,
  errorResponse,
  PRIVATE_CACHE
} from './_shared/travel-http.mjs';
import {
  JOURNAL_RELAY_MAX_BYTES,
  parseJournalMediaSignRequest,
  travelJournalPutObject,
  travelJournalR2Unbound
} from './_shared/travel-journal-r2.mjs';
import { stampStoredJournalMedia } from './_shared/travel-journal-media-stamp.mjs';

export const config = { path: '/api/travel-journal-media-upload' };

/**
 * Store one journal photo copy, photo or voice note sent to the API itself:
 * POST the bytes, with `trip`, `id`, `purpose` (original | derivative),
 * `width` (copies) and `checksum` (SHA-256 hex) in the query. The upload never
 * depends on the bucket accepting a PUT from the browser. Anything over
 * JOURNAL_RELAY_MAX_BYTES gets 413, and the page uses a signed upload instead.
 */
export function createTravelJournalMediaUploadHandler(deps = {}) {
  return createTravelOperatorHandler(async (request, ctx) => {
    if (request.method !== 'POST') {
      return errorResponse(405, 'method_not_allowed', 'Use POST.', false, PRIVATE_CACHE);
    }

    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength > JOURNAL_RELAY_MAX_BYTES) {
      return errorResponse(413, 'too_large', 'Too big to send through the API.', false, PRIVATE_CACHE);
    }

    const url = new URL(request.url);
    const width = url.searchParams.get('width');
    const parsed = parseJournalMediaSignRequest({
      trip_id: url.searchParams.get('trip') ?? '',
      media_id: url.searchParams.get('id') ?? '',
      purpose: url.searchParams.get('purpose') ?? '',
      derivative_width: width === null ? undefined : Number(width),
      checksum: url.searchParams.get('checksum') ?? '',
      content_type: request.headers.get('content-type') ?? '',
      byte_size: bytes.byteLength
    });
    if (parsed.error) {
      return errorResponse(400, 'validation_error', parsed.error, false, PRIVATE_CACHE);
    }
    const stored = parsed.value;

    if (createHash('sha256').update(bytes).digest('hex') !== stored.checksum) {
      return errorResponse(400, 'verify_failed', 'Stored checksum does not match', false, PRIVATE_CACHE);
    }

    // Bytes for a row the journal does not hold would sit in storage with nothing pointing at them.
    const { journal } = await ctx.repo.getJournal(stored.trip_id);
    if (!journal.media.some((item) => item.id === stored.media_id)) {
      return errorResponse(404, 'not_found', 'Media not found in journal.', false, PRIVATE_CACHE);
    }

    try {
      await travelJournalPutObject(ctx.env, {
        key: stored.key,
        body: bytes,
        contentType: stored.content_type,
        checksum: stored.checksum,
        putObject: deps.putObject
      });
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

    const saved = await stampStoredJournalMedia(ctx.repo, stored);
    const row = saved.journal.media.find((item) => item.id === stored.media_id);
    return okResponse(
      200,
      {
        upload_state: row?.upload_state ?? 'pending',
        journal: saved.journal,
        version: saved.version,
        key: stored.key
      },
      PRIVATE_CACHE
    );
  }, deps);
}

export default createTravelJournalMediaUploadHandler();
