import test from 'node:test';
import assert from 'node:assert/strict';
import { fileMinutesSchema, MINUTES_STASH_MAX_AGE_MS, runFileMinutes, stashChatMinutes } from '../../netlify/functions/_shared/minutes-chat.mjs';
import { saveMinutesPdf } from '../../netlify/functions/meeting-minutes-file.mjs';
import { createMeetingRepository } from '../../netlify/functions/_shared/meeting-repository.mjs';

function memoryStore() {
  const map = new Map();
  return {
    async get(key, { type } = {}) {
      if (!map.has(key)) return null;
      const raw = map.get(key);
      return type === 'json' ? structuredClone(raw) : raw;
    },
    async setJSON(key, value) { map.set(key, structuredClone(value)); },
    async set(key, value, opts) { map.set(key, { value, metadata: opts?.metadata ?? {} }); },
    async delete(key) { map.delete(key); },
    async list({ prefix = '' } = {}) {
      return { blobs: [...map.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) };
    },
    _map: map
  };
}

const NOW = 1762000000000;
const gone = { ok: false, error: 'no_minutes_found', next: 'Tell Adam the minutes are no longer here and ask him to attach or paste them again.' };
const pasted = { id: 'att_pasted', kind: 'file', mime: 'text/plain', name: 'Pasted message', textExcerpt: 'Item 1. Exams move to Week 8.' };
const pdfData = Buffer.from('%PDF-1.4 invented minutes').toString('base64');
const pdf = (id = 'att_pdf1') => ({ id, kind: 'file', mime: 'application/pdf', name: 'minutes.pdf', dataUrl: `data:application/pdf;base64,${pdfData}` });
const photo = { id: 'att_img', kind: 'image', mime: 'image/jpeg', name: 'photo.jpg', dataUrl: 'data:image/jpeg;base64,/9j/' };

async function seed(store) {
  const { meeting } = await createMeetingRepository({ store, env: {} }).createMeeting({
    title: 'Faculty meeting',
    scheduled_start: '2026-10-28T03:30:00.000Z',
    scheduled_end: '2026-10-28T04:30:00.000Z',
    time_zone: 'Australia/Sydney'
  });
  return meeting;
}

test('fileMinutesSchema names the tool and requires a meeting id', () => {
  const schema = fileMinutesSchema();
  assert.equal(schema.name, 'file_minutes');
  assert.deepEqual(schema.input_schema.required, ['meeting_id']);
  assert.deepEqual(Object.keys(schema.input_schema.properties), ['meeting_id', 'attachment_id', 'note']);
  assert.match(schema.description, /search_professional/);
  assert.match(schema.description, /Minutes card/);
});

test('saveMinutesPdf writes the bytes under the meeting and returns the key', async () => {
  const store = memoryStore();
  const id = 'meeting_00000000-0000-4000-8000-000000000001';
  const key = await saveMinutesPdf(store, id, pdfData, () => NOW);
  assert.equal(key, `meeting-minutes/${id}/${NOW}.pdf`);
  assert.equal(Buffer.from(store._map.get(key).value).toString(), '%PDF-1.4 invented minutes');
  assert.equal(store._map.get(key).metadata.media_type, 'application/pdf');
});

test('runFileMinutes stores the only attached PDF and marks the meeting pending', async () => {
  const store = memoryStore();
  const meeting = await seed(store);
  const result = await runFileMinutes(
    { meeting_id: meeting.id, note: '  From the head teacher  ' },
    { store, env: {}, attachments: [photo, pdf()], now: () => NOW }
  );
  assert.deepEqual(result, {
    ok: true,
    meeting_id: meeting.id,
    meeting_title: 'Faculty meeting',
    href: `/professional/#/meeting/${meeting.id}`,
    next: 'Tell Adam the minutes are ready to review on the meeting page, with the link.'
  });
  const key = `meeting-minutes/${meeting.id}/${NOW}.pdf`;
  assert.ok(store._map.has(key));
  const saved = await createMeetingRepository({ store, env: {} }).getMeeting(meeting.id);
  assert.deepEqual(saved.minutes_pending, {
    file_key: key,
    added_at: new Date(NOW).toISOString(),
    source: 'chat',
    note: 'From the head teacher'
  });
  assert.equal(saved.minutes, null);
  assert.equal(saved.notes, null);
  assert.deepEqual(saved.decisions, []);
});

test('runFileMinutes picks an attachment by id when there are several PDFs', async () => {
  const store = memoryStore();
  const meeting = await seed(store);
  const attachments = [pdf('att_a'), pdf('att_b')];
  assert.deepEqual(
    await runFileMinutes({ meeting_id: meeting.id }, { store, env: {}, attachments, now: () => NOW }),
    gone
  );
  const result = await runFileMinutes({ meeting_id: meeting.id, attachment_id: 'att_b' }, { store, env: {}, attachments, now: () => NOW });
  assert.equal(result.ok, true);
  const saved = await createMeetingRepository({ store, env: {} }).getMeeting(meeting.id);
  assert.equal(saved.minutes_pending.note, null);
});

test('runFileMinutes reports missing PDFs, bad ids and unknown meetings without writing', async () => {
  const store = memoryStore();
  const meeting = await seed(store);
  const before = store._map.size;
  const run = (input, attachments) => runFileMinutes(input, { store, env: {}, attachments, now: () => NOW });
  assert.deepEqual(await run({ meeting_id: meeting.id }, []), gone);
  assert.deepEqual(await run({ meeting_id: meeting.id }, [photo]), gone);
  assert.deepEqual(await run({ meeting_id: meeting.id, attachment_id: 'att_img' }, [photo]), gone);
  assert.deepEqual(
    await run({ meeting_id: meeting.id }, [{ ...pdf(), dataUrl: undefined }]),
    gone
  );
  assert.deepEqual(await run({ meeting_id: 'Faculty meeting' }, [pdf()]), { ok: false, error: 'invalid_meeting_id' });
  assert.deepEqual(
    await run({ meeting_id: 'meeting_00000000-0000-4000-8000-0000000000ff' }, [pdf()]),
    { ok: false, error: 'meeting_not_found' }
  );
  assert.equal(store._map.size, before);
});

test('pasted minutes wait on the card as text', async () => {
  const store = memoryStore();
  const meeting = await seed(store);
  const result = await runFileMinutes({ meeting_id: meeting.id }, { store, env: {}, attachments: [pasted], now: () => NOW });
  assert.equal(result.ok, true);
  const saved = await createMeetingRepository({ store, env: {} }).getMeeting(meeting.id);
  assert.equal(saved.minutes_pending.file_key, `meeting-minutes/${meeting.id}/${NOW}.txt`);
  assert.equal(store._map.get(saved.minutes_pending.file_key).value.toString('utf8'), pasted.textExcerpt);
});

test('minutes given in an earlier message can be filed once, then are gone', async () => {
  const store = memoryStore();
  const meeting = await seed(store);
  await stashChatMinutes(store, [pdf()], () => NOW);
  const run = () => runFileMinutes({ meeting_id: meeting.id }, { store, env: {}, attachments: [], now: () => NOW + 60_000 });
  assert.equal((await run()).ok, true);
  assert.deepEqual(await run(), gone);
});

test('kept minutes run out after an hour', async () => {
  const store = memoryStore();
  const meeting = await seed(store);
  await stashChatMinutes(store, [pasted], () => NOW);
  const late = NOW + MINUTES_STASH_MAX_AGE_MS + 1;
  assert.deepEqual(await runFileMinutes({ meeting_id: meeting.id }, { store, env: {}, attachments: [], now: () => late }), gone);
});

test('a later unclear attachment clears older kept minutes, so the wrong file is never filed', async () => {
  const store = memoryStore();
  const meeting = await seed(store);
  await stashChatMinutes(store, [pdf()], () => NOW);
  await stashChatMinutes(store, [pdf('att_a'), pdf('att_b')], () => NOW);
  assert.deepEqual(await runFileMinutes({ meeting_id: meeting.id }, { store, env: {}, attachments: [], now: () => NOW }), gone);
});
