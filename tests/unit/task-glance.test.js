import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDueBadge } from '../../apps/life/js/shell/task-glance.js';

test('formatDueBadge labels today and tomorrow relative to the given date', () => {
  assert.equal(formatDueBadge('2026-09-15', { today: '2026-09-15' }), 'Today');
  assert.equal(formatDueBadge('2026-09-16', { today: '2026-09-15' }), 'Tomorrow');
  assert.equal(formatDueBadge('2026-12-25', { today: '2026-09-15' }), '25/12');
  assert.equal(formatDueBadge('', { today: '2026-09-15' }), '');
});
