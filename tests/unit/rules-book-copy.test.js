// tests/unit/rules-book-copy.test.js
// The public-repo copy check: no shipped Rules Book string (rules, the Act and Review tools, the
// coach's knowledge and rubric, catalogue, glyph titles, the app's copy) shares eight words in a
// row with the book. It needs the private pack, so it runs locally and skips where the pack is
// absent, as in CI. Point RB_BOOK_PACK at the pack, or clone life-hub-data beside this repo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkRulesBook, rulesBookStrings } from '../../scripts/book-pack/copy-check.mjs';

const PACK = process.env.RB_BOOK_PACK ?? fileURLToPath(new URL('../../../life-hub-data/book-packs/rules-book', import.meta.url));
const present = existsSync(`${PACK}/entries`);

test('the shipped strings include every rule, the Act and Review tools, the coach, the catalogue and the glyph titles', async () => {
  const where = new Set((await rulesBookStrings()).map(([w]) => w.split(' ')[0]));
  for (const kind of ['rb_ketchup', 'rb_korzybski', 'rb_pareto', 'rb_one_step', 'rb_commit', 'rb_review', 'knowledge', 'rubric', 'catalogue', 'glyph', 'app']) assert.ok(where.has(kind), kind);
});

test('no shipped string copies eight words in a row from the book', { skip: present ? false : 'the private pack is not on disk' }, async () => {
  assert.deepEqual(await checkRulesBook(PACK), []);
});

test('no book page numbers, printed-page claims or named-author quotations ship', async () => {
  for (const [where, text] of await rulesBookStrings()) {
    assert.doesNotMatch(text, /\b(pp?\.|pdf page|printed page)\s*\d/i, where);
    assert.doesNotMatch(text, /\bpage \d+\b/i, where);
  }
});
