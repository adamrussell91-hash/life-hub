// tests/unit/get-things-done-copy.test.js
// The public-repo copy check: no shipped Gear Shifter string (techniques, catalogue, glyph
// titles) shares eight words in a row with the book. It needs the private pack, so it runs
// locally and skips where the pack is absent, as in CI. Point GT_BOOK_PACK at the pack, or
// clone life-hub-data beside this repo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkGearShifter, gearShifterStrings } from '../../scripts/book-pack/copy-check.mjs';

const PACK = process.env.GT_BOOK_PACK ?? fileURLToPath(new URL('../../../life-hub-data/book-packs/get-things-done', import.meta.url));
const present = existsSync(`${PACK}/entries`);

test('the shipped strings include every technique, the catalogue and the glyph titles', async () => {
  const where = new Set((await gearShifterStrings()).map(([w]) => w.split(' ')[0]));
  for (const kind of ['gt_procrastination', 'gt_transactional_model', 'catalogue', 'glyph']) assert.ok(where.has(kind), kind);
});

test('no shipped string copies eight words in a row from the book', { skip: present ? false : 'the private pack is not on disk' }, async () => {
  assert.deepEqual(await checkGearShifter(PACK), []);
});
