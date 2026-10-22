// tests/unit/get-things-done-provenance.test.js
// The provenance graphics an action record shows: one per catalogue technique (its emblem inside
// a cobalt ring with its section's emblem as a badge), in Gear Shifter's palette, kept in step
// with the generator.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { CATALOGUE } from '../../packages/get-things-done/catalogue.mjs';
import { PROVENANCE_DIR, provenanceFiles } from '../../scripts/generate-get-things-done-provenance.mjs';

const PALETTE = new Set(['#fefdf6', '#2a3340', '#2b7de9', '#ea4f2a', '#f5a623', '#c9cbc4']);

test('every catalogue technique has its provenance graphic, as its generator writes it', async () => {
  const files = await provenanceFiles();
  assert.deepEqual(Object.keys(files).sort(), CATALOGUE.map((entry) => `${entry.id}.svg`).sort());
  assert.deepEqual((await readdir(PROVENANCE_DIR)).sort(), Object.keys(files).sort());
  for (const [name, text] of Object.entries(files)) assert.equal(await readFile(new URL(name, PROVENANCE_DIR), 'utf8'), text, `${name} is stale: run node scripts/generate-get-things-done-provenance.mjs`);
});

test('each is labelled by technique and section, uses only the palette and loads nothing', async () => {
  const files = await provenanceFiles();
  assert.match(files['gt_pomodoro.svg'], /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 240 240" role="img" aria-label="The Pomodoro Technique, from Doing things">/);
  assert.match(files['gt_kanban.svg'], /aria-label="Kanban, from Doing things"/);
  for (const text of Object.values(files)) {
    assert.ok(!/<script|href="https?:|<image/i.test(text));
    for (const colour of text.match(/#[0-9a-f]{6}/gi) ?? []) assert.ok(PALETTE.has(colour.toLowerCase()), `${colour} is not in the palette`);
  }
});
