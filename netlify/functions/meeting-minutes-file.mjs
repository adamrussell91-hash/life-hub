// The original minutes PDF for a meeting, kept in the private Professional store.
// POST saves one ({ meeting_id, media_type, data }) and returns its file_key;
// GET ?key= returns it as base64 for the page to open.

import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { defaultGetProfessionalStore } from './_shared/professional-blobs.mjs';
import { isValidMeetingId } from './_shared/meeting-schema.mjs';

export const config = { path: '/api/meetings/minutes-file' };

const PDF_MAX_CHARS = 5_400_000;
const KEY_RE = /^meeting-minutes\/meeting_[0-9a-f-]{36}\/\d{13}\.pdf$/;

/** Write a minutes PDF (base64) for a meeting and return its file key. */
export async function saveMinutesPdf(store, meetingId, base64, now = Date.now) {
  const key = `meeting-minutes/${meetingId}/${now()}.pdf`;
  await store.set(key, Buffer.from(base64, 'base64'), { metadata: { meeting_id: meetingId, media_type: 'application/pdf' } });
  return key;
}

export async function handleMinutesFile(request, { store, now = Date.now }) {
  if (request.method === 'GET') {
    const key = new URL(request.url).searchParams.get('key') ?? '';
    if (!KEY_RE.test(key)) return errorResponse(400, 'invalid_key', 'That is not a minutes file.', false);
    const entry = await store.getWithMetadata(key, { type: 'arrayBuffer' });
    if (!entry?.data) return errorResponse(404, 'not_found', 'Those minutes are no longer stored.', false);
    return okResponse(200, { media_type: 'application/pdf', data: Buffer.from(entry.data).toString('base64') });
  }
  if (request.method === 'POST') {
    const parsed = await readJsonObject(request);
    if (parsed.error) return parsed.error;
    const { meeting_id: meetingId, media_type: mediaType, data } = parsed.value;
    if (!isValidMeetingId(meetingId)) return errorResponse(400, 'invalid_meeting_id', 'Unknown meeting.', false);
    if (mediaType !== 'application/pdf' || typeof data !== 'string' || !data) {
      return errorResponse(400, 'invalid_file', 'Minutes must be a PDF.', false);
    }
    if (data.length > PDF_MAX_CHARS) return errorResponse(413, 'too_large', 'Minutes PDFs must be under 4 MB.', false);
    return okResponse(201, { file_key: await saveMinutesPdf(store, meetingId, data, now) });
  }
  return methodNotAllowed('GET, POST, OPTIONS');
}

export function createMinutesFileHandler(deps = {}) {
  return createOperatorHandler(
    async (request, context) => withCors(await handleMinutesFile(request, { store: context.store, now: deps.clock }), request, context.env),
    {
      ...deps,
      unboundCode: 'professional_blobs_unbound',
      unboundMessage: 'Professional content store is not bound.',
      getContentStore: deps.getContentStore ?? defaultGetProfessionalStore
    }
  );
}

export default createMinutesFileHandler();
