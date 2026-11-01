import test from 'node:test';
import assert from 'node:assert/strict';
import { handleMinutesFile } from '../../netlify/functions/meeting-minutes-file.mjs';

const MEETING = 'meeting_00000000-0000-4000-8000-000000000001';
function fakeStore() {
  const map = new Map();
  return {
    map,
    async set(key, value, opts) { map.set(key, { value, metadata: opts?.metadata ?? {} }); },
    async getWithMetadata(key) { return map.has(key) ? { data: map.get(key).value, metadata: map.get(key).metadata } : null; }
  };
}
const post = (body) => new Request('https://hub.test/api/meetings/minutes-file', { method: 'POST', body: JSON.stringify(body) });
const get = (key) => new Request(`https://hub.test/api/meetings/minutes-file?key=${encodeURIComponent(key)}`);

test('POST saves a PDF under the meeting and GET reads it back', async () => {
  const store = fakeStore();
  const data = Buffer.from('%PDF-1.4 test').toString('base64');
  const saved = await handleMinutesFile(post({ meeting_id: MEETING, media_type: 'application/pdf', data }), { store, now: () => 1762000000000 });
  assert.equal(saved.status, 201);
  const { data: out } = await saved.json();
  assert.equal(out.file_key, `meeting-minutes/${MEETING}/1762000000000.pdf`);
  const read = await handleMinutesFile(get(out.file_key), { store });
  assert.equal(read.status, 200);
  const body = await read.json();
  assert.equal(body.data.media_type, 'application/pdf');
  assert.equal(Buffer.from(body.data.data, 'base64').toString(), '%PDF-1.4 test');
});

test('rejects bad meeting ids, non-PDFs, big files and foreign keys', async () => {
  const store = fakeStore();
  const data = Buffer.from('%PDF').toString('base64');
  assert.equal((await handleMinutesFile(post({ meeting_id: 'x', media_type: 'application/pdf', data }), { store })).status, 400);
  assert.equal((await handleMinutesFile(post({ meeting_id: MEETING, media_type: 'image/png', data }), { store })).status, 400);
  assert.equal((await handleMinutesFile(post({ meeting_id: MEETING, media_type: 'application/pdf', data: 'x'.repeat(5_400_001) }), { store })).status, 413);
  assert.equal((await handleMinutesFile(get('meetings/records/x.json'), { store })).status, 400);
  assert.equal((await handleMinutesFile(get(`meeting-minutes/${MEETING}/1762000000001.pdf`), { store })).status, 404);
});
