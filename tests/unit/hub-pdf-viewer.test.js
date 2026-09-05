import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatPdfHighlightMarkdown,
  parsePdfHighlight
} from '../../packages/design-kit/js/hub-pdf-viewer.js';

test('parsePdfHighlight accepts page + quote', () => {
  const parsed = parsePdfHighlight({
    page: 3,
    quote: '  Useful claim.  ',
    attachmentId: 'att_1',
    title: 'Paper.pdf'
  });
  assert.deepEqual(parsed, {
    page: 3,
    quote: 'Useful claim.',
    attachmentId: 'att_1',
    title: 'Paper.pdf'
  });
});

test('parsePdfHighlight rejects empty quote or bad page', () => {
  assert.equal(parsePdfHighlight({ page: 0, quote: 'x' }), null);
  assert.equal(parsePdfHighlight({ page: 1, quote: '   ' }), null);
  assert.equal(parsePdfHighlight(null), null);
});

test('formatPdfHighlightMarkdown builds a citable block', () => {
  const md = formatPdfHighlightMarkdown({
    page: 2,
    quote: 'Line one\nLine two',
    title: 'Notes.pdf'
  });
  assert.match(md, /Highlight · p\.2 · Notes\.pdf/);
  assert.match(md, /> Line one/);
  assert.match(md, /> Line two/);
});
