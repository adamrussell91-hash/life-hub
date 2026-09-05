import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyClipboardData,
  suggestIngestTarget
} from '../../packages/design-kit/js/hub-rich-paste.js';
import { fitWithin } from '../../packages/design-kit/js/hub-image-pipeline.js';

function fakeTransfer({ text = '', html = '', files = [] } = {}) {
  return {
    files,
    getData(type) {
      if (type === 'text/plain') return text;
      if (type === 'text/html') return html;
      return '';
    }
  };
}

test('classifyClipboardData reads plain text', () => {
  const payload = classifyClipboardData(fakeTransfer({ text: 'remember milk' }));
  assert.equal(payload.kind, 'text');
  assert.equal(payload.text, 'remember milk');
});

test('classifyClipboardData detects URL subtypes', () => {
  const yt = classifyClipboardData(
    fakeTransfer({ text: 'https://www.youtube.com/watch?v=abc123' })
  );
  assert.equal(yt.kind, 'url');
  assert.equal(yt.subtype, 'youtube');

  const maps = classifyClipboardData(
    fakeTransfer({ text: 'https://www.google.com/maps/place/Sydney' })
  );
  assert.equal(maps.subtype, 'maps');

  const pdf = classifyClipboardData(
    fakeTransfer({ text: 'https://example.com/paper.pdf' })
  );
  assert.equal(pdf.subtype, 'pdf');
});

test('classifyClipboardData prefers files over text', () => {
  const file = new File(['x'], 'scan.pdf', { type: 'application/pdf' });
  const payload = classifyClipboardData(fakeTransfer({ text: 'ignore', files: [file] }));
  assert.equal(payload.kind, 'file');
  assert.equal(payload.subtype, 'pdf');
});

test('classifyClipboardData treats image files as image', () => {
  const file = new File(['x'], 'shot.png', { type: 'image/png' });
  const payload = classifyClipboardData(fakeTransfer({ files: [file] }));
  assert.equal(payload.kind, 'image');
});

test('classifyClipboardData keeps useful HTML structure', () => {
  const payload = classifyClipboardData(
    fakeTransfer({ html: '<table><tr><td>a</td></tr></table>', text: 'a' })
  );
  assert.equal(payload.kind, 'html');
});

test('suggestIngestTarget routes by kind and hub', () => {
  const url = classifyClipboardData(fakeTransfer({ text: 'https://example.com/a' }));
  assert.deepEqual(suggestIngestTarget(url), {
    hub: 'knowledge',
    action: 'link',
    reason: 'URL'
  });

  const img = classifyClipboardData(
    fakeTransfer({ files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] })
  );
  assert.equal(suggestIngestTarget(img, { currentHub: 'teaching' }).action, 'image_block');
  assert.equal(suggestIngestTarget(img, { currentHub: 'life' }).action, 'photo');
});

test('fitWithin never upscales', () => {
  assert.deepEqual(fitWithin(800, 600, 1920, 1920), { width: 800, height: 600 });
  assert.deepEqual(fitWithin(4000, 3000, 1920, 1920), { width: 1920, height: 1440 });
});
