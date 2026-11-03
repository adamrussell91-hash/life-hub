import test from 'node:test';
import assert from 'node:assert/strict';
import { foldLongMessage, MAX_CHAT_MESSAGE_CHARS } from '../../netlify/functions/_shared/chat-long-message.mjs';
import { buildUserContent } from '../../packages/design-kit/js/hub-chat-attachments.js';

test('an ordinary message is left alone', () => {
  const attachments = [{ id: 'a' }];
  assert.deepEqual(foldLongMessage('Hello', attachments), { message: 'Hello', attachments });
});

test('a long paste reaches the model in full and the message stays short', () => {
  const paste = `Minutes of the faculty meeting. ${'Item. '.repeat(2000)}Last line.`;
  const { message, attachments } = foldLongMessage(paste);
  assert.ok(message.length < MAX_CHAT_MESSAGE_CHARS);
  assert.match(message, /^Minutes of the faculty meeting/);
  const content = buildUserContent(message, attachments);
  assert.ok(content.some(block => block.type === 'text' && block.text.includes('Last line.')));
});

test('a long paste keeps room for files attached with it', () => {
  const files = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const { attachments } = foldLongMessage('x'.repeat(MAX_CHAT_MESSAGE_CHARS + 1), files);
  assert.deepEqual(attachments.map(item => item.id), ['a', 'b', 'att_pasted']);
});
