import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../../scripts/import-notion-history.mjs';

test('parseArgs reads --medical-csv', () => {
  const args = parseArgs(['--medical-csv', '/tmp/medical.csv', '--out', '/tmp/out']);
  assert.equal(args.medicalCsv, '/tmp/medical.csv');
  assert.equal(args.out, '/tmp/out');
});
