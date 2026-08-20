import test from 'node:test';
import assert from 'node:assert/strict';
import { describeRecordForLog } from '../../netlify/functions/_shared/persist-log.mjs';

test('describeRecordForLog names a medical visit by title', () => {
  assert.equal(
    describeRecordForLog({ type: 'medical', title: 'GP review' }),
    'Logged medical visit: GP review.'
  );
});
