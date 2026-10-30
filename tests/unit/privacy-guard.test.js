import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compileDenylist,
  loadDenylist,
  parseDenylist,
  scanPath,
  scanText
} from '../../scripts/privacy-guard.mjs';

const denylist = compileDenylist(['Pat Example', 'Zorbatrin']);

test('parseDenylist reads lines and commas and drops comments', () => {
  assert.deepEqual(parseDenylist('# header, with a comma\nPat Example\nZorbatrin, Quillfield # note\nab'), [
    'Pat Example',
    'Zorbatrin',
    'Quillfield'
  ]);
});

test('denylist terms match on word edges, case-insensitively, across separators', () => {
  const findings = scanText('Seen by pat example.\nzorbatrin-cycle\nPat_Example\nZorbatrinX', 'note.md', denylist);
  assert.deepEqual(findings.map(f => f.where), ['note.md:1', 'note.md:3', 'note.md:2']);
});

test('findings never include the matched term', () => {
  const [finding] = scanText('Zorbatrin dose', 'PR_BODY', denylist);
  assert.equal(finding.rule, 'denylist term #2');
  assert.doesNotMatch(JSON.stringify(finding), /Zorbatrin/i);
});

test('generic rules catch home paths, bank details and real-looking mobiles', () => {
  const text = 'cd /Users/someone/Projects\nBSB 123-456 Acc 1234\ncall 0412 345 678\nfake 0400 000 000\n/Users/example/x';
  assert.deepEqual(scanText(text, 'x.md', []).map(f => f.rule).sort(), [
    'au-mobile-number',
    'bank-details',
    'home-directory-path'
  ]);
});

test('personal record folders and diaries are flagged by path; test fixtures are not', () => {
  assert.equal(scanPath('data/mind/2026/01/2026-01-01-diary.md', []).length, 2);
  assert.equal(scanPath('chatgpt-diary-30-aug.md', []).length, 1);
  assert.equal(scanPath('tests/fixtures/valid/data/mind/2026/07/2026-07-30-diary.md', []).length, 0);
  assert.equal(scanPath('scripts/zorbatrin-backfill.mjs', denylist)[0].rule, 'denylist term #2 in file name');
});

test('loadDenylist prefers the env secret, then a file, then nothing', () => {
  assert.deepEqual(loadDenylist({ env: { PRIVACY_DENYLIST: 'Pat Example' }, root: '/nonexistent' }).terms, ['Pat Example']);
  assert.deepEqual(loadDenylist({ env: {}, root: '/nonexistent' }), { terms: [], source: null });
});
