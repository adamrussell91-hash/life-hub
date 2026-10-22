// tests/unit/decision-book-glyphs.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { CATALOGUE_IDS, SECTIONS } from '../../packages/decision-book/catalogue.mjs';

const dir = (sub) => new URL(`../../packages/decision-book/glyphs/${sub}/`, import.meta.url);
const names = async (sub) => (await readdir(dir(sub))).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4)).sort();

test('one emblem per catalogue model, four section emblems, three identity marks', async () => {
  assert.deepEqual(await names('models'), [...CATALOGUE_IDS].sort());
  assert.deepEqual(await names('sections'), SECTIONS.map((s) => s.key).sort());
  assert.deepEqual(await names('identity'), ['book-emblem', 'book-emblem-mono', 'wordmark']);
});

test('every glyph is a plain SVG: no scripts, no remote references, no raster images', async () => {
  for (const sub of ['models', 'sections', 'identity']) {
    for (const file of await readdir(dir(sub))) {
      const svg = await readFile(new URL(file, dir(sub)), 'utf8');
      assert.ok(svg.trimStart().startsWith('<svg'), `${sub}/${file}`);
      assert.ok(!/<script|href="https?:|<image/i.test(svg), `${sub}/${file}`);
    }
  }
});
