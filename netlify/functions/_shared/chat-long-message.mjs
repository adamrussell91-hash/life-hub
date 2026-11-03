// A long paste (minutes, an email thread) travels as a text attachment, so the
// model reads all of it while routing and history work from a short message.

export const MAX_CHAT_MESSAGE_CHARS = 4000;
export const MAX_PASTED_MESSAGE_CHARS = 60_000;
const HEAD_CHARS = 1500;
export const PASTED_ATTACHMENT_NAME = 'Pasted message';

export function foldLongMessage(message, attachments = []) {
  if (message.length <= MAX_CHAT_MESSAGE_CHARS) return { message, attachments };
  return {
    message: `${message.slice(0, HEAD_CHARS).trim()}…\n\n[This message was long. All of it is in the attachment named "${PASTED_ATTACHMENT_NAME}".]`,
    attachments: [
      ...attachments.slice(0, 2),
      { id: 'att_pasted', kind: 'file', mime: 'text/plain', name: PASTED_ATTACHMENT_NAME, textExcerpt: message.trim() }
    ]
  };
}
