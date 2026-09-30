import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isClosedTask, isOpenTask } from '../../netlify/functions/_shared/task-liveness.mjs';

test('task liveness: done and trashed tasks are closed, however they were closed', () => {
  for (const task of [
    { title: 'a', status: 'done' },
    { title: 'a', status: 'dead' },
    { title: 'a', status: 'open', bucket: 'done' },
    { title: 'a', status: 'open', bucket: 'trash' },
    { title: 'a', status: 'open', bucket: 'trashed' },
    { title: 'a', status: 'open', completed_at: '2026-09-01T00:00:00Z' }
  ]) {
    assert.equal(isClosedTask(task), true, JSON.stringify(task));
    assert.equal(isOpenTask(task), false, JSON.stringify(task));
  }
  for (const status of ['open', 'in_progress', 'deferred']) {
    assert.equal(isOpenTask({ title: 'Live', status, bucket: 'active' }), true, status);
  }
  assert.equal(isOpenTask({ title: '  ', status: 'open' }), false);
  assert.equal(isOpenTask(null), false);
});

// Guard: the Clare "dead tasks look open" bug came from four hand-copied isOpenTask
// helpers that each forgot a closed state. Server code must import task-liveness.mjs.
test('task liveness: no server module re-implements an open-task check', () => {
  const dir = new URL('../../netlify/functions/', import.meta.url).pathname;
  const offenders = [];
  const walk = folder => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const full = join(folder, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.mjs') && entry.name !== 'task-liveness.mjs') {
        if (/^\s*(export\s+)?function\s+(isOpenTask|isOpen|isClosedTask)\s*\(\s*task\b/m.test(readFileSync(full, 'utf8'))) {
          offenders.push(full.slice(dir.length));
        }
      }
    }
  };
  walk(dir);
  assert.deepEqual(offenders, [], 'import isOpenTask / isClosedTask from _shared/task-liveness.mjs instead');
});
