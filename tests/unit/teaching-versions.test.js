import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createMemoryJsonStore,
  getVersion,
  listVersionIndex,
  restoreVersion,
  snapshotValidForKind,
  VersionStoreError,
  writeCheckpoint
} from '../../netlify/functions/_shared/teaching-versions.mjs';
import {
  classKey,
  draftLessonKey,
  versionIndexKey,
  versionKey
} from '../../netlify/functions/_shared/teaching-blobs.mjs';

function lessonSnapshot(id, title) {
  return {
    id,
    type: 'lesson',
    title,
    slug: title.toLowerCase().replace(/\s+/g, '-'),
    status: 'active',
    unit_id: 'unit_1',
    sequence: 1,
    blocks: [],
    created_at: '2026-08-11T00:00:00.000Z',
    updated_at: '2026-08-11T00:00:00.000Z',
    schema_version: 1
  };
}

test('writeCheckpoint creates index entry and revision blob', async () => {
  const store = createMemoryJsonStore();
  const snapshot = lessonSnapshot('lesson_1', 'Original');
  const record = await writeCheckpoint(store, {
    kind: 'lesson',
    parentId: 'lesson_1',
    snapshot,
    reason: 'manual_checkpoint',
    label: 'Before rewrite',
    now: '2026-08-11T01:00:00.000Z'
  });

  assert.equal(record.revision, 1);
  assert.equal(record.id, 'version_lesson_lesson_1_1');
  assert.equal(record.label, 'Before rewrite');

  const index = await store.getJSON(versionIndexKey('lesson', 'lesson_1'));
  assert.equal(index.latest_revision, 1);
  assert.equal(index.entries.length, 1);
  assert.equal(index.entries[0].reason, 'manual_checkpoint');
  assert.deepEqual((await store.getJSON(versionKey('lesson', 'lesson_1', 1))).snapshot, snapshot);
});

test('eleventh checkpoint keeps 10 newest and deletes revision 1', async () => {
  const store = createMemoryJsonStore();
  for (let i = 1; i <= 11; i++) {
    await writeCheckpoint(store, {
      kind: 'lesson',
      parentId: 'lesson_1',
      snapshot: lessonSnapshot('lesson_1', `v${i}`),
      reason: 'manual_checkpoint',
      now: `2026-08-11T00:${String(i).padStart(2, '0')}:00.000Z`
    });
  }

  const index = await listVersionIndex(store, 'lesson', 'lesson_1');
  assert.equal(index.entries.length, 10);
  assert.equal(index.latest_revision, 11);
  assert.deepEqual(index.entries.map(entry => entry.revision), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  assert.equal(await getVersion(store, 'lesson', 'lesson_1', 1), null);
  assert.equal((await getVersion(store, 'lesson', 'lesson_1', 2)).revision, 2);
});

test('restoreVersion checkpoints current live then applies the historical snapshot', async () => {
  const store = createMemoryJsonStore();
  const current = lessonSnapshot('lesson_1', 'Current');
  await store.setJSON(draftLessonKey('lesson_1'), current);
  await writeCheckpoint(store, {
    kind: 'lesson',
    parentId: 'lesson_1',
    snapshot: lessonSnapshot('lesson_1', 'Original'),
    reason: 'manual_checkpoint',
    now: '2026-08-11T01:00:00.000Z'
  });

  const live = await restoreVersion(store, {
    kind: 'lesson',
    parentId: 'lesson_1',
    revision: 1,
    now: '2026-08-11T02:00:00.000Z'
  });

  assert.equal(live.title, 'Original');
  assert.equal((await store.getJSON(draftLessonKey('lesson_1'))).title, 'Original');
  const index = await listVersionIndex(store, 'lesson', 'lesson_1');
  assert.equal(index.entries[0].reason, 'restore');
  assert.equal((await getVersion(store, 'lesson', 'lesson_1', 2)).snapshot.title, 'Current');
});

test('invalid historical snapshot does not checkpoint or overwrite live', async () => {
  const live = lessonSnapshot('lesson_1', 'Current title');
  const store = createMemoryJsonStore({
    [draftLessonKey('lesson_1')]: live,
    [versionKey('lesson', 'lesson_1', 1)]: {
      id: 'version_lesson_lesson_1_1',
      type: 'lesson_version',
      kind: 'lesson',
      parent_id: 'lesson_1',
      revision: 1,
      created_at: '2026-08-11T12:00:00.000Z',
      reason: 'manual_checkpoint',
      snapshot: { not_a_lesson: true }
    },
    [versionIndexKey('lesson', 'lesson_1')]: {
      parent_id: 'lesson_1',
      kind: 'lesson',
      latest_revision: 1,
      entries: [{
        id: 'version_lesson_lesson_1_1',
        revision: 1,
        created_at: '2026-08-11T12:00:00.000Z',
        reason: 'manual_checkpoint'
      }]
    }
  });

  await assert.rejects(
    () => restoreVersion(store, { kind: 'lesson', parentId: 'lesson_1', revision: 1 }),
    err => err instanceof VersionStoreError && err.code === 'validation_error'
  );
  assert.equal((await store.getJSON(draftLessonKey('lesson_1'))).title, 'Current title');
  assert.equal(await store.getJSON(versionKey('lesson', 'lesson_1', 2)), null);
  assert.equal(snapshotValidForKind('lesson', { not_a_lesson: true }), false);
});

test('class_homepage restore only changes homepage', async () => {
  const store = createMemoryJsonStore();
  const classDoc = {
    id: 'class_1',
    type: 'class',
    title: '7A Science',
    code: '7A',
    meeting_days: [1, 3, 5],
    active_unit_ids: ['unit_1'],
    current_unit_id: 'unit_1',
    homepage: { announcements: [], resources: [], custom: [] }
  };
  await store.setJSON(classKey('class_1'), classDoc);
  await writeCheckpoint(store, {
    kind: 'class_homepage',
    parentId: 'class_1',
    snapshot: { homepage: { announcements: [{ id: 'b_hist' }], resources: [], custom: [] } },
    reason: 'manual_checkpoint',
    now: '2026-08-11T01:00:00.000Z'
  });

  const live = await restoreVersion(store, {
    kind: 'class_homepage',
    parentId: 'class_1',
    revision: 1,
    now: '2026-08-11T02:00:00.000Z'
  });

  assert.equal(live.homepage.announcements[0].id, 'b_hist');
  assert.deepEqual(live.meeting_days, [1, 3, 5]);
  assert.equal(live.code, '7A');
});
