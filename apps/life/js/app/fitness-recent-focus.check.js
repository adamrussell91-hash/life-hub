import assert from 'node:assert/strict';
import { matchFitnessRecentRows } from './fitness-recent-focus.js';

const rows = [{ date: '2026-09-01' }, { date: '2026-09-03' }, { date: null }, { date: '2026-09-05' }];

assert.deepEqual(matchFitnessRecentRows(rows, '2026-09-03'), [false, true, false, false]);
assert.deepEqual(matchFitnessRecentRows(rows, null), [false, false, false, false]);
assert.deepEqual(matchFitnessRecentRows(rows, '2026-09-99'), [false, false, false, false]);

console.log('fitness-recent-focus.check: ok');
