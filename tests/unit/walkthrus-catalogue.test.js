import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { CATALOGUE, CATALOGUE_IDS, SERIES, techniquesOf, frameworksOf, isTechniqueId } from '../../packages/walkthrus/catalogue.mjs';
import { SETS, setById } from '../../packages/walkthrus/sets.mjs';
import { PROBLEM_TYPES, PROBLEM_TYPE_IDS, rankedFor } from '../../packages/walkthrus/problem-types.mjs';
import { createGlyphSet, placeholderGlyph } from '../../packages/design-kit/js/glyph-set.js';

test('catalogue ids are unique and every entry belongs to a known set and series', () => {
  assert.equal(new Set(CATALOGUE_IDS).size, CATALOGUE.length);
  const seriesKeys = new Set(SERIES.map((s) => s.key));
  for (const e of CATALOGUE) {
    assert.ok(setById(e.set), e.id);
    assert.ok(e.kind === 'technique' ? seriesKeys.has(e.series) && Number.isInteger(e.page) : e.kind === 'framework', e.id);
    assert.ok(e.name && e.glyph, e.id);
  }
  assert.equal(frameworksOf(1).length, 5);
  assert.ok(techniquesOf(1).length >= 50);
});

test('every see_also resolves, and printed page numbers are unique within a set', () => {
  for (const e of CATALOGUE) for (const ref of e.see_also) assert.ok(CATALOGUE_IDS.includes(ref), `${e.id} → ${ref}`);
  const pages = techniquesOf(1).map((e) => e.page);
  assert.equal(new Set(pages).size, pages.length);
});

test('sets: three colours, set 1 yellow', () => {
  assert.deepEqual(SETS.map((s) => s.id), [1, 2, 3]);
  assert.equal(setById(1).colour, '#ffd400');
});

test('problem types rank real technique ids, and sit in a real series', () => {
  assert.equal(PROBLEM_TYPE_IDS.length, 6);
  const seriesKeys = new Set(SERIES.map((s) => s.key));
  for (const type of PROBLEM_TYPE_IDS) {
    assert.ok(seriesKeys.has(PROBLEM_TYPES[type].series), type);
    assert.ok(rankedFor(type).length >= 3, type);
    for (const id of rankedFor(type)) assert.ok(isTechniqueId(id), `${type} → ${id}`);
  }
  assert.deepEqual(rankedFor('nope'), []);
});

test('every catalogue entry has a glyph or gets a placeholder', () => {
  const set = createGlyphSet({ svgs: {}, labelOf: (id) => CATALOGUE.find((e) => e.id === id)?.name ?? id });
  for (const id of CATALOGUE_IDS) {
    const svg = set.markup(id);
    assert.ok(svg.startsWith('<svg'), id);
    assert.ok(!/<script|href="https?:|<image/i.test(svg), id);
  }
  assert.equal(createGlyphSet({ svgs: { a: '<svg id="a"/>' } }).markup('a'), '<svg id="a"/>');
  assert.ok(placeholderGlyph('<b>&').includes('&lt;b&gt;') === false, 'initials come from words, so markup characters are dropped');
});

test('copy guard: no long prose strings in the public walkthrus package', async () => {
  const root = new URL('../../packages/walkthrus/', import.meta.url);
  const walk = async (dir) => {
    const out = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) out.push(...(await walk(new URL(`${entry.name}/`, dir))));
      else if (/\.(mjs|ts|js|json)$/.test(entry.name)) out.push(new URL(entry.name, dir));
    }
    return out;
  };
  const strings = /'((?:[^'\\\n]|\\.){121,})'|"((?:[^"\\\n]|\\.){121,})"|`((?:[^`\\\n]|\\.){121,})`/g;
  for (const file of await walk(root)) {
    const src = await readFile(file, 'utf8');
    assert.equal([...src.matchAll(strings)].length, 0, `${file.pathname} holds a string over 120 characters`);
  }
});
