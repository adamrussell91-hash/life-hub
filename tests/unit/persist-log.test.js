import test from 'node:test';
import assert from 'node:assert/strict';
import { persistLogEntry } from '../../netlify/functions/_shared/persist-log.mjs';

function mockClient() {
  const writes = [];
  return {
    writes,
    async writeFile(args) {
      writes.push(args);
      return { sha: 'a'.repeat(40), commitSha: 'b'.repeat(40) };
    },
    async resolveTree() {
      throw new Error('planned workouts must not read Central Node');
    },
    async readBlob() {
      throw new Error('planned workouts must not read Central Node');
    }
  };
}

test('planned workout persist skips Central Node and still reports a successful sync', async () => {
  const client = mockClient();
  const result = await persistLogEntry(client, {
    record: {
      type: 'workout',
      date: '2026-09-05',
      title: 'The Full Send',
      status: 'planned',
      session_kind: 'strength',
      day_type: 'workout_45_60'
    },
    notes: '',
    path: 'data/fitness/2026/09/2026-09-05-workout-planned.md',
    nowDateKey: '2026-09-05'
  });

  assert.equal(result.centralNodeUpdated, true);
  assert.equal(client.writes.length, 1);
  assert.equal(client.writes[0].path, 'data/fitness/2026/09/2026-09-05-workout-planned.md');
});
