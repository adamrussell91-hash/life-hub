import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { CATALOGUE } from '../../packages/walkthrus/catalogue.mjs';

const dir = (set) => new URL(`../../packages/walkthrus/glyphs/${set}/`, import.meta.url);
const techniques = CATALOGUE.filter((e) => e.kind === 'technique');

for (const [set, viewBox] of [['figure', '0 0 120 90'], ['symbol', '0 0 100 100']]) {
  test(`every technique has a ${set} icon in the drawn grammar`, () => {
    const files = new Set(readdirSync(dir(set)));
    for (const { id } of techniques) {
      assert.ok(files.has(`${id}.svg`), `${set}/${id}.svg is missing`);
      const svg = readFileSync(new URL(`${id}.svg`, dir(set)), 'utf8');
      assert.ok(svg.includes(`viewBox="${viewBox}"`), `${id}: ${set} frame`);
      assert.ok(svg.includes('stroke="currentColor"'), `${id}: line art in currentColor`);
      // Figures fill their people with the paper token and may letter a question mark; nothing else is fixed.
      const plain = set === 'figure' ? svg.replaceAll('var(--wt-paper, #fff)', '').replace(/<text[^>]*>\?<\/text>/g, '') : svg;
      assert.doesNotMatch(plain, /#[0-9a-f]{3,6}\b|<image|<text/i, `${id}: no fixed colours, bitmaps or text`);
    }
    assert.equal(files.size, techniques.length, `${set}: no stray files`);
  });
}
