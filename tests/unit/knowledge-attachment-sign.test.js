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

test('findAttachment matches by id', () => {
  assert.equal(findAttachment({
    attachments: [{ id: 'att-1', r2_key: 'notes/p/a.pdf' }]
  }, 'att-1').r2_key, 'notes/p/a.pdf');
  assert.equal(findAttachment({ attachments: [] }, 'att-1'), null);
});
