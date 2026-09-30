import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isClosedTask, isOpenTask } from '../../netlify/functions/_shared/task-liveness.mjs';
import { isDeletedRecord, withoutDeleted } from '../../netlify/functions/_shared/record-liveness.mjs';
import {
  getTeachingContext,
  hydrateTeachingSchedule,
  searchTeaching
} from '../../netlify/functions/_shared/domain-retrieval.mjs';
import { buildCurriculum } from '../../netlify/functions/curriculum.mjs';
import {
  CLASS_PREFIX,
  DRAFT_LESSON_PREFIX,
  SCHEDULED_LESSON_PREFIX,
  UNIT_PREFIX
} from '../../netlify/functions/_shared/teaching-blobs.mjs';

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
      else if (entry.name.endsWith('.mjs') && !['task-liveness.mjs', 'record-liveness.mjs'].includes(entry.name)) {
        if (/^\s*(export\s+)?function\s+(isOpenTask|isOpen|isClosedTask)\s*\(\s*task\b/m.test(readFileSync(full, 'utf8'))) {
          offenders.push(full.slice(dir.length));
        }
      }
    }
  };
  walk(dir);
  assert.deepEqual(offenders, [], 'import from _shared/task-liveness.mjs or _shared/record-liveness.mjs instead');
});

test('record liveness: every hub deleted state is gone, archived is not', () => {
  for (const record of [
    { status: 'dead' },
    { status: 'trashed' },
    { status: 'deleted' },
    { status: 'removed' },
    { status: 'archived_dead' },
    { status: 'active', trashed_at: '2026-09-01T00:00:00Z' },
    { status: 'open', bucket: 'trash' },
    { lifecycle_status: 'deleted' },
    { lifecycle_status: 'deidentified' },
    { deleted_at: '2026-09-01' }
  ]) {
    assert.equal(isDeletedRecord(record), true, JSON.stringify(record));
  }
  for (const record of [{ status: 'active' }, { status: 'archived' }, { lifecycle_status: 'archived' }, { status: 'done' }, {}]) {
    assert.equal(isDeletedRecord(record), false, JSON.stringify(record));
  }
  assert.deepEqual(withoutDeleted([{ id: 'a' }, { id: 'b', status: 'trashed' }, null, { id: 'c', status: 'archived' }]).map(r => r.id), ['a', 'c']);
});

test('teaching retrieval: trashed classes, lessons and units never reach Ann', () => {
  const now = new Date('2026-09-30T00:00:00Z');
  const classes = [
    { id: 'c_live', code: '10ENG', display_name: 'Year 10 English', status: 'active' },
    { id: 'c_dead', code: '10ENX', display_name: 'Year 10 English old', status: 'trashed' }
  ];
  const lessons = [
    { id: 'l_live', type: 'lesson', title: 'Macbeth act 1', date: '2026-10-01', class_id: 'c_live', status: 'active' },
    { id: 'l_dead', type: 'lesson', title: 'Macbeth act 2', date: '2026-10-02', class_id: 'c_live', status: 'trashed', trashed_at: '2026-09-20T00:00:00Z' }
  ];
  const units = [
    { id: 'u_live', title: 'Macbeth', status: 'active' },
    { id: 'u_dead', title: 'Macbeth draft', status: 'trashed' }
  ];
  const hits = searchTeaching({ query: 'macbeth', classes, lessons, units });
  assert.deepEqual(hits.results.map(r => r.id).sort(), ['l_live', 'u_live']);
  const classHits = searchTeaching({ query: 'year 10 english', classes, lessons, units });
  assert.ok(classHits.results.every(r => r.id !== 'c_dead'));
  assert.deepEqual(hydrateTeachingSchedule(lessons, { now }).map(l => l.id), ['l_live']);
  const ctx = getTeachingContext({ classes, lessons, units, query: 'macbeth draft', now });
  assert.notEqual(ctx.unit?.id, 'u_dead');
});

test('curriculum payload: schedule rows under trashed lessons, units or classes are dropped', async () => {
  const data = new Map(Object.entries({
    [`${UNIT_PREFIX}u1`]: { id: 'u1', status: 'active', lesson_ids: [] },
    [`${UNIT_PREFIX}u2`]: { id: 'u2', status: 'trashed' },
    [`${DRAFT_LESSON_PREFIX}l1`]: { id: 'l1', type: 'lesson', title: 'Live', status: 'active' },
    [`${DRAFT_LESSON_PREFIX}l2`]: { id: 'l2', type: 'lesson', title: 'Binned', status: 'trashed' },
    [`${CLASS_PREFIX}c1`]: { id: 'c1', status: 'active' },
    [`${CLASS_PREFIX}c2`]: { id: 'c2', status: 'trashed' },
    [`${CLASS_PREFIX}c3`]: { id: 'c3', status: 'archived' },
    [`${SCHEDULED_LESSON_PREFIX}s1`]: { id: 's1', lesson_id: 'l1', unit_id: 'u1', class_id: 'c1', date: '2026-09-30' },
    [`${SCHEDULED_LESSON_PREFIX}s2`]: { id: 's2', lesson_id: 'l2', unit_id: 'u1', class_id: 'c1', date: '2026-09-30' },
    [`${SCHEDULED_LESSON_PREFIX}s3`]: { id: 's3', lesson_id: 'l1', unit_id: 'u2', class_id: 'c1', date: '2026-09-30' },
    [`${SCHEDULED_LESSON_PREFIX}s4`]: { id: 's4', lesson_id: 'l1', unit_id: 'u1', class_id: 'c2', date: '2026-09-30' },
    [`${SCHEDULED_LESSON_PREFIX}s5`]: { id: 's5', lesson_id: 'l1', unit_id: 'u1', class_id: 'c3', date: '2026-09-30' }
  }));
  const store = {
    async get(key) { return data.get(key) ?? null; },
    async list({ prefix }) { return { blobs: [...data.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }; }
  };
  const curriculum = await buildCurriculum(store);
  assert.deepEqual(curriculum.scheduled_lessons.map(r => r.id).sort(), ['s1', 's5']);
  // The trashed items themselves stay in the payload so the Trash view can restore them.
  assert.ok(curriculum.lessons.some(l => l.id === 'l2' && l.status === 'trashed'));
});
