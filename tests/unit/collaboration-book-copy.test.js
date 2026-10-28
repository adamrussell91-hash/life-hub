// tests/unit/collaboration-book-copy.test.js
// The public-repo copy check: no shipped Collaboration Book string (models, the Agree and Review
// tools, the coach's knowledge and rubric, catalogue, glyph titles, the app's copy) shares eight
// words in a row with the book. It needs the private pack, so it runs locally and skips where the
// pack is absent, as in CI. Point CB_BOOK_PACK at the pack, or clone life-hub-data beside this repo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkCollaborationBook, collaborationBookStrings } from '../../scripts/book-pack/copy-check.mjs';

const PACK = process.env.CB_BOOK_PACK ?? fileURLToPath(new URL('../../../life-hub-data/book-packs/collaboration-book', import.meta.url));
const present = existsSync(`${PACK}/entries`);

test('the shipped strings include every part: models, the Agree and Review tools, the coach, the catalogue and the glyph titles', async () => {
  const where = new Set((await collaborationBookStrings()).map(([w]) => w.split(' ')[0]));
  for (const kind of ['cb_two_pizza', 'cb_postmortem', 'cb_corporate_culture', 'cb_nunchi', 'cb_commit', 'cb_review', 'knowledge', 'rubric', 'catalogue', 'glyph']) assert.ok(where.has(kind), kind);
});

test('no shipped string copies eight words in a row from the book', { skip: present ? false : 'the private pack is not on disk' }, async () => {
  assert.deepEqual(await checkCollaborationBook(PACK), []);
});

test('no book page numbers, printed-page claims or dated source snapshots ship', async () => {
  for (const [where, text] of await collaborationBookStrings()) {
    assert.doesNotMatch(text, /\b(pp?\.|pdf page|printed page)\s*\d/i, where);
    assert.doesNotMatch(text, /\bpage \d+\b/i, where);
    assert.doesNotMatch(text, /\b(19|20)\d\d\b(?!-\d\d-\d\d)/, where);
  }
});
