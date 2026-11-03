// file_minutes: Adam gives official minutes in chat, as a PDF or pasted text, and
// names the meeting. The tool stores them and marks them pending on that meeting's
// Minutes card; Adam reviews and ticks items on the meeting page.

import { createMeetingRepository } from './meeting-repository.mjs';
import { isValidMeetingId } from './meeting-schema.mjs';
import { getJSON, setJSON } from './professional-blobs.mjs';
import { saveMinutesPdf, saveMinutesText } from '../meeting-minutes-file.mjs';

const NOTE_MAX = 300;
const PDF_DATA_URL_RE = /^data:application\/pdf;base64,(.+)$/s;
// "Which meeting?" takes a second message, and the attachment only rides on the first.
const STASH_KEY = 'chat-minutes-stash/latest';
export const MINUTES_STASH_MAX_AGE_MS = 60 * 60_000;

export function fileMinutesSchema() {
  return {
    name: 'file_minutes',
    description:
      'Use when Adam gives official meeting minutes, as a PDF or pasted text, and says which meeting they are for. Call search_professional first to get the meeting id. If he gave the minutes in an earlier message of this chat, still call this: they are kept for an hour, so never ask him to send them again unless this tool says they are gone. This puts the minutes on that meeting\'s Minutes card for Adam to review and tick. Do not copy the minutes into notes or decisions yourself.',
    input_schema: {
      type: 'object',
      properties: {
        meeting_id: { type: 'string', description: 'meeting_… id from search_professional.' },
        attachment_id: { type: 'string', description: 'The attachment id. Optional when only one PDF or text attachment was given.' },
        note: { type: 'string', description: 'Optional short note for Adam, at most 300 characters.' }
      },
      required: ['meeting_id'],
      additionalProperties: false
    }
  };
}

function minutesFrom(attachment) {
  if (!attachment) return null;
  const match = typeof attachment.dataUrl === 'string' ? PDF_DATA_URL_RE.exec(attachment.dataUrl) : null;
  if (match) return { pdf: match[1] };
  const text = typeof attachment.textExcerpt === 'string' ? attachment.textExcerpt.trim() : '';
  return text ? { text } : null;
}

function pickMinutes(attachments, attachmentId) {
  const list = Array.isArray(attachments) ? attachments : [];
  if (typeof attachmentId === 'string' && attachmentId.trim()) {
    const named = minutesFrom(list.find(item => item?.id === attachmentId.trim()));
    if (named) return named;
  }
  const usable = list.map(minutesFrom).filter(Boolean);
  return usable.length === 1 ? usable[0] : null;
}

/** Keep this turn's minutes for a follow-up message, or clear older ones it replaces. */
export async function stashChatMinutes(store, attachments, now = Date.now) {
  const minutes = pickMinutes(attachments);
  if (minutes) await setJSON(store, STASH_KEY, { ...minutes, at: now() });
  else await store.delete(STASH_KEY);
}

async function stashedMinutes(store, now) {
  const stash = await getJSON(store, STASH_KEY, { consistency: 'strong' });
  if (!stash || now() - stash.at > MINUTES_STASH_MAX_AGE_MS) return null;
  return stash.pdf ? { pdf: stash.pdf } : stash.text ? { text: stash.text } : null;
}

export async function runFileMinutes(input, { store, env, attachments, now = Date.now } = {}) {
  if (!store) return { ok: false, error: 'professional_store_unavailable' };
  const meetingId = typeof input?.meeting_id === 'string' ? input.meeting_id.trim() : '';
  if (!isValidMeetingId(meetingId)) return { ok: false, error: 'invalid_meeting_id' };
  const minutes = pickMinutes(attachments, input?.attachment_id) ?? await stashedMinutes(store, now);
  if (!minutes) {
    return { ok: false, error: 'no_minutes_found', next: 'Tell Adam the minutes are no longer here and ask him to attach or paste them again.' };
  }
  const note = typeof input?.note === 'string' ? input.note.trim().slice(0, NOTE_MAX) || null : null;

  const repo = createMeetingRepository({ store, env, now: () => new Date(now()).toISOString() });
  let meeting;
  try {
    meeting = await repo.getMeeting(meetingId);
  } catch (error) {
    if (error?.code === 'meeting_not_found') return { ok: false, error: 'meeting_not_found' };
    throw error;
  }
  const fileKey = minutes.pdf
    ? await saveMinutesPdf(store, meetingId, minutes.pdf, now)
    : await saveMinutesText(store, meetingId, minutes.text, now);
  await repo.updateMeeting(meetingId, {
    minutes_pending: {
      file_key: fileKey,
      added_at: new Date(now()).toISOString(),
      source: 'chat',
      note
    }
  });
  await store.delete(STASH_KEY);
  return {
    ok: true,
    meeting_id: meetingId,
    meeting_title: meeting.title,
    href: `/professional/#/meeting/${meetingId}`,
    next: 'Tell Adam the minutes are ready to review on the meeting page, with the link.'
  };
}
