import test from 'node:test';
import assert from 'node:assert/strict';
import { codeApplies, targetRow, codeGrid, nextSteps, classPatterns } from '../../netlify/functions/_shared/progress-patterns.mjs';

const piece = (id, kind, places, tags = [], at = `2026-10-0${id}T00:00:00Z`) => ({ id: `p${id}`, title: `Task ${id}`, short: `T${id}`, at, kind, places, tags });
const g = (code_id) => ({ code_id, positive: false });
const s = (code_id) => ({ code_id, positive: true });
const library = [
  { id: 'ts', code: 'TS', group: 'composition' },
  { id: 'ef', code: 'EF', group: 'composition' },
  { id: 'qi', code: 'QI', group: 'composition' },
  { id: 'pr', code: 'P', group: 'composition' },
  { id: 'vf', code: 'VF', group: 'viva' }
];

test('a code applies to pieces of its own kind only', () => {
  assert.equal(codeApplies(library[0], { kind: 'written' }), true);
  assert.equal(codeApplies(library[0], { kind: 'viva' }), false);
  assert.equal(codeApplies(library[4], { kind: 'viva' }), true);
  assert.equal(codeApplies(library[4], { kind: 'assessment' }), false);
});

test('holding: the same step on 3+ assessed pieces in a row, below the top', () => {
  const pieces = [
    piece(1, 'written', { 'out:a': 'starting' }),
    piece(2, 'viva', {}),
    piece(3, 'written', { 'out:a': 'building' }, [g('ts')]),
    piece(4, 'written', { 'out:a': 'building' }, [g('ts'), g('ts')]),
    piece(5, 'written', { 'out:a': 'building' }, [g('ef')])
  ];
  const row = targetRow(pieces, 'out:a', library);
  assert.deepEqual(row.cells, ['starting', null, 'building', 'building', 'building']);
  assert.equal(row.now, 'building');
  assert.deepEqual(row.story, { kind: 'holding', step: 'building', count: 3, code_id: 'ts' });
});

test('moved up names where it rose; a fall only states the current step', () => {
  const up = targetRow([piece(1, 'written', { 'out:a': 'starting' }), piece(2, 'written', { 'out:a': 'building' }), piece(3, 'written', { 'out:a': 'secure' })], 'out:a', library);
  assert.deepEqual(up.story, { kind: 'moved_up', from: 'building', to: 'secure', piece_id: 'p3' });
  const down = targetRow([piece(1, 'written', { 'out:a': 'secure' }), piece(2, 'written', { 'out:a': 'building' }), piece(3, 'written', { 'out:a': 'secure' }), piece(4, 'written', { 'out:a': 'building' })], 'out:a', library);
  assert.deepEqual(down.story, { kind: 'now', step: 'building' });
});

test('fewer than 3 assessed pieces tells the student more will show the pattern', () => {
  const row = targetRow([piece(1, 'written', { 'out:a': 'secure' }), piece(2, 'written', {})], 'out:a', library);
  assert.deepEqual(row.story, { kind: 'few', count: 1 });
});

test('Extending and Excellent never hold', () => {
  const pieces = [1, 2, 3].map((n) => piece(n, 'written', { 'skill:composing.para': 'excellent' }));
  assert.equal(targetRow(pieces, 'skill:composing.para', library).story.kind, 'now');
});

test('code grid: counts per piece, n/a where the code does not apply, totals and drop-off', () => {
  const pieces = [
    piece(1, 'written', {}, [g('qi'), g('qi'), g('qi')]),
    piece(2, 'viva', {}, [g('vf')]),
    piece(3, 'written', {}, [g('qi'), g('ts')]),
    piece(4, 'written', {}, [g('ts'), g('ts')]),
    piece(5, 'written', {}, [g('ts'), s('pr')]),
    piece(6, 'written', {}, [g('ts'), s('pr')])
  ];
  const rows = codeGrid(pieces, library);
  const ts = rows.find((r) => r.code_id === 'ts' && !r.positive);
  assert.deepEqual(ts.cells, [0, null, 1, 2, 1, 1]);
  assert.deepEqual([ts.hit, ts.of, ts.total, ts.dropped], [4, 5, 5, false]);
  const qi = rows.find((r) => r.code_id === 'qi');
  assert.deepEqual([qi.hit, qi.of, qi.total, qi.dropped], [2, 5, 4, true]);
  const pr = rows.find((r) => r.code_id === 'pr');
  assert.equal(pr.positive, true);
  assert.equal(rows.some((r) => r.code_id === 'ef'), false, 'codes never used are left out');
});

test('next steps: top 2 growth codes on 2+ of the last 5 applicable pieces, then 1 strength', () => {
  const pieces = [
    piece(1, 'written', {}, [g('ef')]),
    piece(2, 'written', {}, [g('ef'), s('pr')]),
    piece(3, 'written', {}, [g('ts'), s('pr')]),
    piece(4, 'written', {}, [g('ts'), g('qi')]),
    piece(5, 'written', {}, [g('ts'), g('ef'), s('pr')]),
    piece(6, 'written', {}, [g('ts')])
  ];
  assert.deepEqual(nextSteps(pieces, library), [
    { code_id: 'ts', positive: false, hit: 4, of: 5 },
    { code_id: 'ef', positive: false, hit: 2, of: 5 },
    { code_id: 'pr', positive: true, hit: 3, of: 5 }
  ]);
});

test('class patterns group 3+ students holding at the same step, with their top code', () => {
  const holder = (code) => [1, 2, 3].map((n) => piece(n, 'written', { 'out:a': 'building' }, [g(code)]));
  const out = classPatterns([
    { id: 'st_a', pieces: holder('ts') }, { id: 'st_b', pieces: holder('ts') }, { id: 'st_c', pieces: holder('ef') },
    { id: 'st_d', pieces: [piece(1, 'written', { 'out:a': 'secure' })] }
  ], library);
  assert.deepEqual(out, [{ key: 'out:a', step: 'building', students: ['st_a', 'st_b', 'st_c'], code_id: 'ts' }]);
});
