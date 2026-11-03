import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSheet, defaultPicks, isSheetToken, sheetOptions, sheetSnapshotKey } from '../../netlify/functions/_shared/meeting-sheet.mjs';
import { createMeetingSheetsHandler } from '../../netlify/functions/meeting-sheets.mjs';
import { createPublishedSheetHandler } from '../../netlify/functions/published-sheet.mjs';
import { loadPublicMediaIds } from '../../netlify/functions/media-file.mjs';
import { isPublicStudentApi } from '../../netlify/functions/_shared/public-student-routes.mjs';

const MEETING_ID = 'meeting_00000000-0000-4000-8000-000000000001';

function fixture() {
  return {
    id: MEETING_ID,
    title: 'Coaching: questioning',
    scheduled_start: '2026-11-03T04:30:00.000Z',
    time_zone: 'Australia/Sydney',
    agenda: 'Secret agenda text',
    location_text: 'Room 12',
    notes: 'Follow-ups are strong.\n» Sam: send the transcript',
    decisions: [{ id: 'd1', text: 'Decision text' }],
    guide_runs: [{ id: 'g1', note: 'Guide text' }],
    minutes_draft: 'Draft text',
    blocks: [
      { id: 'h', block_type: 'heading', content: { text: 'Questioning' } },
      { id: 'r', block_type: 'rich_text', content: { html: '<p>Keep this.</p><p>» Sam: book the room</p>' } },
      { id: 'empty', block_type: 'rich_text', content: { html: '<p>» Sam: only a promise</p>' } },
      { id: 'q', block_type: 'question_set', content: { questions: [] } },
      { id: 't', block_type: 'teacher_note', visibility: 'teacher_only', content: { html: '<p>Teacher only text</p>' } },
      { id: 'img', block_type: 'image', content: { media_id: 'media_on_sheet', alt_text: '' } },
      {
        id: 'cols',
        block_type: 'columns',
        content: { columns: [{ id: 'c1', blocks: [{ id: 'q2', block_type: 'cloze', content: {} }] }] }
      },
      {
        id: 'a',
        block_type: 'annotation',
        content: {
          text: { kind: 'verse', stanzas: [] },
          exemplar: { html: 'Exemplar text' },
          anthology: { tag: 'x' },
          layers: [
            { id: 'open', name: 'Try next', kind: 'free', colour: 'navy' },
            { id: 'mine', name: 'My thinking', kind: 'teacher', colour: 'navy' },
            { id: 'voice', name: 'Voice', kind: 'voice', colour: 'navy' }
          ],
          annotations: [
            { id: 'n1', layer_id: 'open', body: { html: '<p>Open note</p>', attachments: [{ kind: 'block', block_id: 't' }] } },
            { id: 'n2', layer_id: 'mine', body: { html: '<p>Private note</p>', attachments: [] } }
          ],
          voice_tracks: [
            { id: 'v1', layer_id: 'voice', status: 'published', media_id: 'media_voice', transcript: { words: ['secret'] }, clips: [] },
            { id: 'v2', layer_id: 'voice', status: 'draft', media_id: 'media_draft', transcript: { words: [] }, clips: [] }
          ]
        }
      }
    ],
    minutes: {
      sections: [
        { heading: 'Attendees', text: 'Sam, Priya' },
        { heading: 'Action items', text: 'Sam to send' },
        { heading: 'Next observation', text: 'Same class.\n» Priya: pick a date' }
      ]
    },
    minutes_notes: [{ key: 'k', heading: 'Tasks', text: 'A task note' }],
    coaching_sheets: [
      { id: 'c', person_ref: 'professional:person:1', person_name: 'Sam', technique_id: 'not-a-technique', steps: { 1: { seen: 'Seen text', next: '' } } }
    ]
  };
}

const onSheet = (result) => JSON.stringify(result.sheet);

test('a default sheet holds the notes and none of what stays behind', () => {
  const result = buildSheet(fixture());
  const text = onSheet(result);
  for (const gone of [MEETING_ID, 'Secret agenda', 'Room 12', 'Decision text', 'Guide text', 'Draft text', 'Teacher only', 'book the room', 'only a promise', 'send the transcript', 'Exemplar text', 'Attendees', 'Sam, Priya', 'Sam to send', 'pick a date', 'A task note', 'Private note', 'person_ref', 'media_draft', 'secret"']) {
    assert.ok(!text.includes(gone), `should not carry: ${gone}`);
  }
  for (const kept of ['Keep this.', 'Open note', 'Follow-ups are strong.', 'Same class.', 'media_on_sheet', 'media_voice']) {
    assert.ok(text.includes(kept), `should carry: ${kept}`);
  }
  assert.equal(result.sheet.coaching.length, 0);
  assert.deepEqual(result.left_off, { blocks: 3, promise_lines: 4, minutes_sections: 2, voice_unpublished: 1 });
});

test('a ticked private layer reaches readers as an ordinary layer', () => {
  const { sheet } = buildSheet(fixture(), { off_layers: [] });
  const block = sheet.blocks.find((row) => row.block_type === 'annotation');
  assert.equal(block.content.layers.find((layer) => layer.id === 'mine').kind, 'free');
  assert.ok(block.content.annotations.some((ann) => ann.id === 'n2'));
});

test('every layer on the sheet starts showing', () => {
  const on = buildSheet(fixture()).sheet.blocks.find((row) => row.block_type === 'annotation');
  assert.equal(on.content.settings.default_layer_id, 'open');
  const all = buildSheet(fixture(), { off_layers: [] }).sheet.blocks.find((row) => row.block_type === 'annotation');
  assert.equal(all.content.settings.default_layer_id, 'mine');
});

test('ticks take parts off the sheet', () => {
  const { sheet } = buildSheet(fixture(), { notes: false, voice: false, minutes: false, summary: false, off_layers: ['open', 'mine'] });
  assert.deepEqual(sheet.blocks.map((block) => block.block_type), ['annotation']);
  assert.equal(sheet.blocks[0].content.annotations.length, 0);
  assert.ok(!JSON.stringify(sheet.blocks[0].content.voice_tracks ?? []).includes('media_voice'));
  assert.equal(sheet.summary, '');
  assert.deepEqual(sheet.minutes, []);
  const none = buildSheet(fixture(), { notes: false, annotations: false }).sheet;
  assert.deepEqual(none.blocks, []);
});

test('coaching sheets carry the feedback and not the person', () => {
  const { sheet } = buildSheet(fixture(), { coaching: true });
  assert.deepEqual(sheet.coaching, [{ technique: 'Technique', steps: [{ step: '1', seen: 'Seen text', next: '' }] }]);
});

test('options list private layers apart and leave voice layers to the voice tick', () => {
  const options = sheetOptions(fixture());
  assert.deepEqual(options.layers.map((layer) => [layer.id, layer.private]), [['open', false], ['mine', true]]);
  assert.deepEqual(defaultPicks(fixture()).off_layers, ['mine']);
  assert.equal(options.minutes && options.coaching && options.voice, true);
});

function fakeStore() {
  const rows = new Map();
  return {
    rows,
    async get(key) { return rows.has(key) ? structuredClone(rows.get(key)) : null; },
    async setJSON(key, value) { rows.set(key, structuredClone(value)); },
    async delete(key) { rows.delete(key); },
    async list({ prefix = '' } = {}) { return { blobs: [...rows.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}

function handlers() {
  const professional = fakeStore();
  const snapshots = fakeStore();
  const owner = createMeetingSheetsHandler({
    env: { LIFE_HUB_PASSPHRASE_HASH: 'x', SESSION_SECRET: 'x'.repeat(32) },
    verifySessionToken: () => ({ valid: true }),
    getContentStore: async () => professional,
    getSnapshotStore: async () => snapshots,
    createMeetingRepository: () => ({ getMeeting: async () => fixture() }),
    newToken: () => 'b'.repeat(48),
    now: () => '2026-11-04T01:00:00.000Z'
  });
  const reader = createPublishedSheetHandler({ env: {}, getContentStore: async () => snapshots });
  const post = (action, picks) =>
    owner(new Request(`https://api.example/api/meeting-sheets?meeting_id=${MEETING_ID}&action=${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: 'life_hub_session=ok', origin: 'https://api.example' },
      body: JSON.stringify({ picks })
    }), {});
  const read = () => reader(new Request(`https://api.example/api/published/sheets/${'b'.repeat(48)}`), {});
  return { post, read, snapshots, professional };
}

test('a link serves a copy, updates in place and stops', async () => {
  const { post, read, snapshots, professional } = handlers();
  assert.equal((await read()).status, 404);
  assert.equal((await post('preview', {})).status, 200);
  assert.equal(snapshots.rows.size, 0, 'a preview publishes nothing');

  const first = await post('publish', { title: 'First' });
  assert.equal(first.status, 200);
  const served = await read();
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('cache-control'), 'no-store');
  const body = await served.json();
  assert.equal(body.data.title, 'First');
  assert.ok(!JSON.stringify(body).includes(MEETING_ID));

  await post('publish', { title: 'Second' });
  assert.equal((await (await read()).json()).data.title, 'Second');
  assert.equal(snapshots.rows.size, 1, 'the same link keeps one copy');
  assert.ok(snapshots.rows.has(sheetSnapshotKey('b'.repeat(48))));

  await post('stop');
  assert.equal((await read()).status, 404);
  assert.equal(snapshots.rows.size, 0);
  assert.equal(professional.rows.size, 0);
});

test('without a session nothing can be shared', async () => {
  const store = fakeStore();
  const owner = createMeetingSheetsHandler({
    env: { LIFE_HUB_PASSPHRASE_HASH: 'x', SESSION_SECRET: 'x'.repeat(32) },
    verifySessionToken: () => ({ valid: false }),
    getContentStore: async () => store,
    getSnapshotStore: async () => store,
    createMeetingRepository: () => ({ getMeeting: async () => fixture() })
  });
  const response = await owner(new Request(`https://api.example/api/meeting-sheets?meeting_id=${MEETING_ID}&action=publish`, { method: 'POST', body: '{}', headers: { origin: 'https://api.example' } }), {});
  assert.ok([401, 403].includes(response.status));
  assert.equal(store.rows.size, 0);
});

test('tokens: the public route takes only the long form', () => {
  assert.equal(isSheetToken('b'.repeat(48)), true);
  assert.equal(isSheetToken('b'.repeat(47)), false);
  assert.equal(isPublicStudentApi('GET', `/api/published/sheets/${'b'.repeat(48)}`), true);
  assert.equal(isPublicStudentApi('GET', '/api/published/sheets/short'), false);
  assert.equal(isPublicStudentApi('POST', `/api/published/sheets/${'b'.repeat(48)}`), false);
  assert.equal(isPublicStudentApi('GET', '/api/meeting-sheets'), false);
});

test('media on a sheet is public only while the link is on', async () => {
  const store = fakeStore();
  const { sheet } = buildSheet(fixture());
  await store.setJSON(sheetSnapshotKey('b'.repeat(48)), sheet);
  assert.ok((await loadPublicMediaIds(store)).has('media_on_sheet'));
  await store.delete(sheetSnapshotKey('b'.repeat(48)));
  assert.ok(!(await loadPublicMediaIds(store)).has('media_on_sheet'));
});
