// file_minutes: Adam attaches official minutes as a PDF in chat and names the
// meeting. The tool stores the PDF and marks it pending on that meeting's
// Minutes card; Adam reviews and ticks items on the meeting page.

import { createMeetingRepository } from './meeting-repository.mjs';
import { isValidMeetingId } from './meeting-schema.mjs';
import { saveMinutesPdf } from '../meeting-minutes-file.mjs';

const NOTE_MAX = 300;
const PDF_DATA_URL_RE = /^data:application\/pdf;base64,(.+)$/s;

export function fileMinutesSchema() {
  return {
    name: 'file_minutes',
    description:
      'Use when Adam attaches official meeting minutes as a PDF and says which meeting they are for. Call search_professional first to get the meeting id. This puts the PDF on that meeting\'s Minutes card for Adam to review and tick. Do not copy the minutes into notes or decisions yourself.',
    input_schema: {
      type: 'object',
      properties: {
        meeting_id: { type: 'string', description: 'meeting_… id from search_professional.' },
        attachment_id: { type: 'string', description: 'The PDF attachment id. Optional when only one PDF is attached.' },
        note: { type: 'string', description: 'Optional short note for Adam, at most 300 characters.' }
      },
      required: ['meeting_id'],
      additionalProperties: false
    }
  };
}

function pdfBase64(attachment) {
  if (!attachment || typeof attachment.dataUrl !== 'string') return null;
  const match = PDF_DATA_URL_RE.exec(attachment.dataUrl);
  return match ? match[1] : null;
}

function pickPdf(attachments, attachmentId) {
  const list = Array.isArray(attachments) ? attachments : [];
  if (typeof attachmentId === 'string' && attachmentId.trim()) {
    const found = list.find(item => item?.id === attachmentId.trim());
    return pdfBase64(found);
  }
  const pdfs = list.filter(item => item?.mime === 'application/pdf' && pdfBase64(item));
  return pdfs.length === 1 ? pdfBase64(pdfs[0]) : null;
}

export async function runFileMinutes(input, { store, env, attachments, now = Date.now } = {}) {
  if (!store) return { ok: false, error: 'professional_store_unavailable' };
  const meetingId = typeof input?.meeting_id === 'string' ? input.meeting_id.trim() : '';
  if (!isValidMeetingId(meetingId)) return { ok: false, error: 'invalid_meeting_id' };
  const data = pickPdf(attachments, input?.attachment_id);
  if (!data) return { ok: false, error: 'no_pdf_attached' };
  const note = typeof input?.note === 'string' ? input.note.trim().slice(0, NOTE_MAX) || null : null;

  const repo = createMeetingRepository({ store, env, now: () => new Date(now()).toISOString() });
  let meeting;
  try {
    meeting = await repo.getMeeting(meetingId);
  } catch (error) {
    if (error?.code === 'meeting_not_found') return { ok: false, error: 'meeting_not_found' };
    throw error;
  }
  const fileKey = await saveMinutesPdf(store, meetingId, data, now);
  await repo.updateMeeting(meetingId, {
    minutes_pending: {
      file_key: fileKey,
      added_at: new Date(now()).toISOString(),
      source: 'chat',
      note
    }
  });
  return {
    ok: true,
    meeting_id: meetingId,
    meeting_title: meeting.title,
    href: `/professional/#/meeting/${meetingId}`,
    next: 'Tell Adam the minutes are ready to review on the meeting page, with the link.'
  };
}
