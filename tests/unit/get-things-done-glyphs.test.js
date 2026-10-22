// tests/unit/get-things-done-glyphs.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { CATALOGUE, SECTIONS } from '../../packages/get-things-done/catalogue.mjs';

const dir = (sub) => new URL(`../../packages/get-things-done/glyphs/${sub}/`, import.meta.url);
const names = async (sub) => (await readdir(dir(sub))).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4)).sort();
const all = async () => (await Promise.all(['models', 'sections', 'identity'].map(async (sub) => (await readdir(dir(sub))).map((f) => [sub, f])))).flat();

test('an emblem per entry except the two variants, five sections, three identity marks', async () => {
  assert.deepEqual(await names('models'), CATALOGUE.filter((e) => !e.reuse).map((e) => e.id).sort());
  assert.equal((await names('models')).length, 35);
  assert.deepEqual(await names('sections'), SECTIONS.map((s) => s.key).sort());
  assert.deepEqual(await names('identity'), ['book-emblem', 'book-emblem-mono', 'wordmark']);
});

test('every glyph is a plain SVG in Adam’s palette: no scripts, remote references, rasters or pack colours', async () => {
  const allowed = new Set(['#2b7de9', '#ea4f2a', '#2a3340', '#fefdf6']);
  for (const [sub, file] of await all()) {
    const svg = await readFile(new URL(file, dir(sub)), 'utf8');
    assert.ok(svg.trimStart().startsWith('<svg'), `${sub}/${file}`);
    assert.ok(!/<script|href="https?:|<image/i.test(svg), `${sub}/${file}`);
    for (const colour of svg.toLowerCase().match(/#[0-9a-f]{6}\b/g) ?? []) assert.ok(allowed.has(colour), `${sub}/${file}: ${colour}`);
  }
});
