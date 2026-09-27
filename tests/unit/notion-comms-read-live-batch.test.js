import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLiveBatch } from '../../scripts/lib/notion-comms/read-live-batch.mjs';

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/notion-comms/live-batch.json');

test('readLiveBatch converts private page input into planner rows', async () => {
  const result = await readLiveBatch(fixture);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].notionId, 'a'.repeat(32));
  assert.equal(result.rows[0].attendees[0].name, 'Sam K.');
  assert.deepEqual(result.unmatchedRows, []);
});
