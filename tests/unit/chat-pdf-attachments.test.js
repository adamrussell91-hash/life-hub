import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_CHAT_PDF_BYTES,
  buildUserContent,
  fileToChatAttachment
} from '../../packages/design-kit/js/hub-chat-attachments.js';
import {
  attachmentsFitChatBody,
  hasVisualAttachments,
  visualActivationContext,
  visualEvidenceStubFromAttachment
} from '../../packages/design-kit/js/hub-visual-evidence.js';
import { MAX_BODY_BYTES } from '../../netlify/functions/chat.mjs';
import { bindChatComposer } from '../../apps/life/js/app/chat-composer.js';

class FakeFileReader {
  result = '';
  onload = null;
  onerror = null;
  readAsDataURL(blob) {
    Promise.resolve(blob.arrayBuffer()).then(buf => {
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(buf).toString('base64')}`;
      this.onload?.();
    }, () => this.onerror?.());
  }
}

async function withFileReader(fn) {
  const previous = globalThis.FileReader;
  globalThis.FileReader = FakeFileReader;
  try {
    return await fn();
  } finally {
    globalThis.FileReader = previous;
  }
}

const pdfFile = (bytes, name = 'minutes.pdf') =>
  new File([new Uint8Array(bytes)], name, { type: 'application/pdf' });

test('fileToChatAttachment keeps a PDF up to 3 MB as a data URL', async () => {
  await withFileReader(async () => {
    const att = await fileToChatAttachment(pdfFile(1200));
    assert.equal(att.kind, 'file');
    assert.equal(att.mime, 'application/pdf');
    assert.match(att.dataUrl, /^data:application\/pdf;base64,/);
    const atCap = await fileToChatAttachment(pdfFile(MAX_CHAT_PDF_BYTES));
    assert.ok(atCap.dataUrl);
  });
});

test('fileToChatAttachment refuses a PDF over 3 MB with a plain message', async () => {
  await withFileReader(async () => {
    await assert.rejects(
      fileToChatAttachment(pdfFile(MAX_CHAT_PDF_BYTES + 1)),
      { message: 'That PDF is over 3 MB. Paste the part you need instead.' }
    );
  });
});

test('buildUserContent sends a PDF as a document block and marks it delivered', () => {
  const data = Buffer.from('%PDF-1.4 minutes').toString('base64');
  const att = { id: 'att_pdf1', kind: 'file', mime: 'application/pdf', name: 'minutes.pdf', dataUrl: `data:application/pdf;base64,${data}` };
  const content = buildUserContent('These are the minutes for the faculty meeting', [att]);
  assert.ok(Array.isArray(content));
  assert.match(content[0].text, /Attachment delivered to model · id=att_pdf1 · kind=file · mime=application\/pdf/);
  assert.doesNotMatch(content[0].text, /unavailable/);
  const doc = content.find(block => block.type === 'document');
  assert.deepEqual(doc, { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } });
  assert.equal(content.some(block => block.type === 'image'), false);
});

test('a non-PDF file data URL is still reported unavailable', () => {
  const att = { id: 'att_zip', kind: 'file', mime: 'application/zip', name: 'a.zip', dataUrl: 'data:application/zip;base64,AAAA' };
  const content = buildUserContent('see attached', [att]);
  assert.equal(typeof content, 'string');
  assert.match(content, /Attachment unavailable to model · id=att_zip/);
});

test('visual evidence ignores PDFs', () => {
  const att = { id: 'att_pdf1', kind: 'file', mime: 'application/pdf', name: 'minutes.pdf', dataUrl: 'data:application/pdf;base64,JVBERg==' };
  assert.equal(hasVisualAttachments([att]), false);
  assert.equal(visualActivationContext('file these minutes', [att]).hasVisualEvidence, false);
  assert.equal(visualEvidenceStubFromAttachment(att), null);
});

test('one 3 MB PDF plus a short message fits the client and server body caps', () => {
  const dataUrl = `data:application/pdf;base64,${'A'.repeat(Math.ceil(MAX_CHAT_PDF_BYTES / 3) * 4)}`;
  const att = { id: 'att_pdf1', kind: 'file', mime: 'application/pdf', name: 'minutes.pdf', dataUrl };
  const message = 'These are the minutes for Tuesday\'s faculty meeting, please file them.';
  assert.equal(attachmentsFitChatBody([att], { messageBytes: message.length }), true);
  const body = JSON.stringify({ message, attachments: [att], history: [] });
  assert.ok(Buffer.byteLength(body) + 32 * 1024 <= MAX_BODY_BYTES, 'server cap leaves room for some history');
});

test('composer says "files", not "photos", when two PDFs are too large together', async () => {
  const notes = [];
  const attachList = {
    hidden: true,
    children: [],
    replaceChildren() { this.children = []; },
    append(node) { this.children.push(node); if (node.className === 'chat-attach-error') notes.push(node.textContent); }
  };
  const attachInput = new EventTarget();
  attachInput.files = [pdfFile(2_900_000, 'one.pdf'), pdfFile(2_900_000, 'two.pdf')];
  attachInput.value = 'x';
  attachInput.click = () => {};
  const attachBtn = new EventTarget();
  attachBtn.dataset = {};
  const root = {
    querySelector(selector) {
      if (selector === '#chat-attach') return attachBtn;
      if (selector === '#chat-attach-input') return attachInput;
      if (selector === '#chat-attach-list') return attachList;
      return null;
    }
  };
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement: () => ({ addEventListener() {}, className: '', textContent: '' })
  };
  try {
    await withFileReader(async () => {
      bindChatComposer(root, {});
      attachInput.dispatchEvent(new Event('change'));
      for (let i = 0; i < 200 && !notes.length; i += 1) await new Promise(resolve => setTimeout(resolve, 10));
    });
  } finally {
    globalThis.document = previousDocument;
  }
  assert.deepEqual(notes, ['Those files together are too large to send. Remove one and try again.']);
});
