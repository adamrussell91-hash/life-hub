import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findAttachment,
  parseSignRequest
} from '../../netlify/functions/_shared/knowledge-attachment-sign.mjs';

test('attachment sign accepts a notes PDF and hashes a stable id', () => {
  const parsed = parseSignRequest({
    filename: 'scan.pdf',
    content_type: 'application/pdf',
    byte_size: 1200,
    page_id: 'page_hub_aa',
    area: 'notes'
  });
  assert.equal(parsed.value.attachment.kind, 'pdf');
  assert.equal(parsed.value.attachment.r2_key, 'notes/page_hub_aa/scan.pdf');
  assert.match(parsed.value.attachment.id, /^attachment_[a-f0-9]{12}$/);
});

test('attachment sign rejects oversize and unknown areas', () => {
  assert.equal(parseSignRequest({
    filename: 'a.pdf',
    content_type: 'application/pdf',
    byte_size: 21 * 1024 * 1024,
    page_id: 'p',
    area: 'notes'
  }).error, 'File exceeds 20MB');
  assert.equal(parseSignRequest({
    filename: 'a.pdf',
    content_type: 'application/pdf',
    byte_size: 10,
    page_id: 'p',
    area: 'podcast'
  }).error, 'area must be notes or university');
});

test('attachment sign accepts recorded voice MIME with codec parameters', () => {
  const parsed = parseSignRequest({
    filename: 'voice.webm',
    content_type: 'audio/webm;codecs=opus',
    byte_size: 2048,
    page_id: 'page_hub_aa',
    area: 'notes'
  });
  assert.equal(parsed.error, undefined);
  assert.equal(parsed.value.content_type, 'audio/webm');
  assert.equal(parsed.value.attachment.kind, 'audio');
  assert.equal(parsed.value.attachment.content_type, 'audio/webm');
});

test('attachment sign still rejects an unknown type even with parameters', () => {
  assert.equal(parseSignRequest({
    filename: 'note.html',
    content_type: 'text/html;charset=utf-8',
    byte_size: 10,
    page_id: 'page_hub_aa',
    area: 'notes'
  }).error, 'content_type not allowed');
});

test('findAttachment matches by id', () => {
  assert.equal(findAttachment({
    attachments: [{ id: 'att-1', r2_key: 'notes/p/a.pdf' }]
  }, 'att-1').r2_key, 'notes/p/a.pdf');
  assert.equal(findAttachment({ attachments: [] }, 'att-1'), null);
});
