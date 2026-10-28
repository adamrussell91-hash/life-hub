// tests/unit/communication-book-copy.test.js
// The public-repo copy check: no shipped Communication Book string (models, the Commit and Review
// tools, the coach's knowledge and rubric, catalogue, glyph titles, the app's copy once it exists)
// shares eight words in a row with the book. It needs the private pack, so it runs locally and
// skips where the pack is absent, as in CI. Point CM_BOOK_PACK at the pack, or clone
// life-hub-data beside this repo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkCommunicationBook, communicationBookStrings } from '../../scripts/book-pack/copy-check.mjs';

const PACK = process.env.CM_BOOK_PACK ?? fileURLToPath(new URL('../../../life-hub-data/book-packs/communication-book', import.meta.url));
const present = existsSync(`${PACK}/entries`) && existsSync(`${PACK}/book.json`);

test('the shipped strings include every part: models, the Commit and Review tools, the coach, the catalogue and the glyph titles', async () => {
  const where = new Set((await communicationBookStrings()).map(([w]) => w.split(' ')[0]));
  for (const kind of ['cm_persuasion', 'cm_apology', 'cm_second_order', 'cm_peak_end', 'cm_commit', 'cm_review', 'knowledge', 'rubric', 'catalogue', 'glyph']) assert.ok(where.has(kind), kind);
});

test('no shipped string copies eight words in a row from the book', { skip: present ? false : 'the private pack is not on disk' }, async () => {
  assert.deepEqual(await checkCommunicationBook(PACK), []);
});

test('no book page numbers, printed-page claims, PDF locators or dated source snapshots ship', async () => {
  for (const [where, text] of await communicationBookStrings()) {
    assert.doesNotMatch(text, /\b(pp?\.|pdf page|printed page)\s*\d/i, where);
    assert.doesNotMatch(text, /\bpage \d+\b/i, where);
    assert.doesNotMatch(text, /\bPDF [AB]\b/, where);
    assert.doesNotMatch(text, /\b(19|20)\d\d\b(?!-\d\d-\d\d)/, where);
  }
});
