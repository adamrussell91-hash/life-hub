import test from 'node:test';
import assert from 'node:assert/strict';
import { createFeedbackDoc, listFeedbackDocs, sweepFeedbackAudio } from '../../netlify/functions/_shared/teaching-feedback.mjs';
import { profileAction } from '../../netlify/functions/_shared/profile.mjs';
import { loadRoster } from '../../netlify/functions/_shared/class-claims.mjs';
import { mediaFileKey, mediaKey } from '../../netlify/functions/_shared/teaching-blobs.mjs';
import { readVoiceAudio } from '../../netlify/functions/_shared/voice-submissions.mjs';

function storeFixture(entries = []) {
  const data = new Map(entries);
  const meta = new Map();
  return {
    data,
    async get(key) { return structuredClone(data.get(key) ?? null); },
    async getWithMetadata(key) { return data.has(key) ? { data: data.get(key), metadata: meta.get(key) ?? {}, etag: 'e0' } : null; },
    async set(key, value, options) { data.set(key, value); meta.set(key, options?.metadata ?? {}); return { modified: true }; },
    async setJSON(key, value) { data.set(key, structuredClone(value)); return { modified: true }; },
    async delete(key) { data.delete(key); },
    async list({ prefix }) { return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}
const device = { class_token: 'a'.repeat(48) };
const NOW = '2026-11-02T00:00:00.000Z';
const DAY = 86400_000;

async function setup() {
  const store = storeFixture([
    ['classes/class1', { id: 'class1', type: 'class', title: '12 English', active_unit_ids: [], students: [{ name: 'Ava Nguyen' }] }],
    [mediaKey('media1'), { id: 'media1', status: 'active', mime_type: 'audio/webm' }],
    [mediaFileKey('media1'), new Uint8Array([1, 2, 3]).buffer]
  ]);
  const roster = await loadRoster(store, 'class1');
  const ava = roster.students[0];
  await profileAction(store, 'class1', { action: 'claim', initials: ava.initials, ...device });
  const doc = await createFeedbackDoc(store, { title: 'Before your final draft', body_html: '<p>Hi</p>', class_id: 'class1', student_id: ava.id, audio_media_id: 'media1' }, { nowIso: () => NOW });
  return { store, doc };
}

test('a recording moves out of Media and plays by its unguessable key', async () => {
  const { store, doc } = await setup();
  assert.equal(store.data.has(mediaKey('media1')), false);
  assert.equal(store.data.has(mediaFileKey('media1')), false);
  const key = doc.audio_url.split('/').pop();
  const file = await readVoiceAudio(store, key);
  assert.equal(file.data.byteLength, 3);
  assert.equal(file.metadata.contentType, 'audio/webm');
  assert.equal(doc.audio_delete_after, new Date(Date.parse(NOW) + 28 * DAY).toISOString());
});

test('the student gets the recording on the note, and no media id or key field', async () => {
  const { store, doc } = await setup();
  const note = await profileAction(store, 'class1', { action: 'piece', item: `n:${doc.id}`, ...device });
  assert.equal(note.audio_url, doc.audio_url);
  assert.equal(note.audio_deleted, false);
  for (const banned of ['audio_key', 'audio_media_id', 'media1']) assert.equal(JSON.stringify(note).includes(banned), false, banned);
});

test('a note refuses a recording that is missing or not audio', async () => {
  const store = storeFixture([[mediaKey('pic'), { id: 'pic', status: 'active', mime_type: 'image/png' }], [mediaFileKey('pic'), new Uint8Array([1]).buffer]]);
  await assert.rejects(createFeedbackDoc(store, { title: 'x', audio_media_id: 'pic' }), /Record it again/);
  await assert.rejects(createFeedbackDoc(store, { title: 'x', audio_media_id: 'gone' }), /Record it again/);
  assert.equal(store.data.has(mediaKey('pic')), true);
});

test('after 28 days the recording goes and the note stays, and not a day before', async () => {
  const { store, doc } = await setup();
  const key = doc.audio_url.split('/').pop();
  const early = await sweepFeedbackAudio({ store, now: Date.parse(NOW) + 27 * DAY });
  assert.deepEqual(early.deleted, []);
  assert.ok(await readVoiceAudio(store, key));
  const late = await sweepFeedbackAudio({ store, now: Date.parse(NOW) + 28 * DAY + 60_000 });
  assert.deepEqual(late.deleted, [doc.id]);
  assert.equal(await readVoiceAudio(store, key), null);
  const note = await profileAction(store, 'class1', { action: 'piece', item: `n:${doc.id}`, ...device });
  assert.equal(note.audio_url, null);
  assert.equal(note.audio_deleted, true);
  assert.equal(note.body_html, '<p>Hi</p>');
  const [row] = await listFeedbackDocs(store);
  assert.deepEqual([row.audio_url, row.audio_deleted], [null, true]);
  assert.deepEqual((await sweepFeedbackAudio({ store, now: Date.parse(NOW) + 29 * DAY })).deleted, []);
});
