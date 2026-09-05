import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUserContent,
  formatAttachmentProvenance,
  normalizeChatAttachments,
  parseChatAttachment
} from '../../packages/design-kit/js/hub-chat-attachments.js';
import {
  normalizeImageAnnotations,
  parseImageAnnotation
} from '../../packages/design-kit/js/hub-image-annotate.js';
import { formatPdfHighlightMarkdown, parsePdfHighlight } from '../../packages/design-kit/js/hub-pdf-viewer.js';

test('parseChatAttachment accepts image payloads', () => {
  const parsed = parseChatAttachment({
    id: 'att_1',
    kind: 'image',
    mime: 'image/png',
    name: 'shot.png',
    dataUrl: 'data:image/png;base64,aaa'
  });
  assert.equal(parsed?.id, 'att_1');
  assert.equal(parsed?.kind, 'image');
});

test('buildUserContent expands image attachments into Anthropic blocks', () => {
  const content = buildUserContent('What is this?', [
    {
      id: 'att_1',
      kind: 'image',
      mime: 'image/jpeg',
      name: 'board.jpg',
      dataUrl: 'data:image/jpeg;base64,abc123'
    }
  ]);
  assert.ok(Array.isArray(content));
  assert.equal(content[0].type, 'text');
  assert.match(content[0].text, /Attachment delivered to model/);
  assert.equal(content[1].type, 'image');
  assert.equal(content[1].source.type, 'base64');
  assert.equal(content[1].source.data, 'abc123');
});

test('normalizeChatAttachments caps at three', () => {
  const list = normalizeChatAttachments(
    Array.from({ length: 5 }, (_, i) => ({
      id: `a${i}`,
      kind: 'file',
      mime: 'text/plain',
      name: `f${i}.txt`,
      textExcerpt: 'hi'
    }))
  );
  assert.equal(list.length, 3);
});

test('formatAttachmentProvenance is empty without attachments', () => {
  assert.equal(formatAttachmentProvenance([]), '');
});

test('parseImageAnnotation reads body or Annotorious bodies', () => {
  assert.deepEqual(parseImageAnnotation({ id: 'r1', body: 'Label' }), {
    id: 'r1',
    body: 'Label'
  });
  assert.equal(
    parseImageAnnotation({
      id: 'r2',
      bodies: [{ value: 'Region note' }]
    })?.body,
    'Region note'
  );
  assert.equal(normalizeImageAnnotations([null, { id: 'x' }]).length, 0);
});

test('pdf highlight helpers still round-trip', () => {
  const parsed = parsePdfHighlight({ page: 2, quote: 'Exact line', title: 'Paper' });
  const md = formatPdfHighlightMarkdown(parsed);
  assert.match(md, /p\.2/);
  assert.match(md, /Exact line/);
});
