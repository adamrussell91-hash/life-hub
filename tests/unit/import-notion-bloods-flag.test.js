import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, eventBody } from '../../scripts/import-notion-history.mjs';

test('parseArgs reads --bloods-csv', () => {
  const args = parseArgs(['--bloods-csv', '/tmp/bloods.csv', '--out', '/tmp/out']);
  assert.equal(args.bloodsCsv, '/tmp/bloods.csv');
  assert.equal(args.out, '/tmp/out');
});

test('eventBody uses fresh notes when the import supplies them', () => {
  const existing = '---\ntype: "bloods"\n---\nOld lab note.\n';
  assert.equal(eventBody(existing, 'New note.'), 'New note.\n');
});

test('eventBody keeps the existing notes when a re-import has none', () => {
  const existing = '---\ntype: "bloods"\n---\n4Cyte Pathology. Lab #83467167.\n\nGGT down from 162.\n';
  assert.equal(eventBody(existing, ''), '4Cyte Pathology. Lab #83467167.\n\nGGT down from 162.\n');
});

test('eventBody returns an empty body for a new file with no notes', () => {
  assert.equal(eventBody(null, ''), '');
  assert.equal(eventBody('---\ntype: "bloods"\n---\n', ''), '');
});
