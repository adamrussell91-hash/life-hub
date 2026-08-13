import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../../scripts/import-notion-history.mjs';

test('parseArgs reads --bloods-csv', () => {
  const args = parseArgs(['--bloods-csv', '/tmp/bloods.csv', '--out', '/tmp/out']);
  assert.equal(args.bloodsCsv, '/tmp/bloods.csv');
  assert.equal(args.out, '/tmp/out');
});
