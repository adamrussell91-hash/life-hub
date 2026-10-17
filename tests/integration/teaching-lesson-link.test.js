import test from 'node:test';
import assert from 'node:assert/strict';
import { createScheduledLessonLinkHandler } from '../../netlify/functions/scheduled-lesson-link.mjs';
import { teachingEventsFromCurriculum } from '../../packages/design-kit/js/calendar/teaching-calendar.js';
import { itemPatchRequest } from '../../packages/design-kit/js/calendar/calendar-item-actions.js';
import { itemCardHtml } from '../../packages/design-kit/js/calendar/calendar-item-card.js';
import { chipFromEvent } from '../../packages/design-kit/js/calendar/tideline-model.js';

const ISO = '2026-10-12T00:00:00Z';
const row = (id, lesson_id, date, period, start_time) => ({
  id, type: 'scheduled_lesson', class_id: 'c', unit_id: 'u', lesson_id, date, period, start_time,
  schedule_order: 1, delivery_status: 'planned', created_at: ISO, updated_at: ISO, schema_version: 1
});

function setup() {
  const map = new Map([
    ['classes/c', { id: 'c', type: 'class', title: '12 English', subject_id: 'eng' }],
    ['units/u', { id: 'u', type: 'unit', title: 'Poetry', subject_id: 'eng', lesson_ids: ['poem', 'blank'] }],
    ['lessons/poem', { id: 'poem', type: 'lesson', title: 'The Remedy of Butterflies', unit_id: 'u', sequence: 1, blocks: [{ id: 'b' }], status: 'active' }],
    ['lessons/blank', { id: 'blank', type: 'lesson', title: 'Lesson 2 — Poetry', unit_id: 'u', sequence: 2, blocks: [], status: 'active' }],
    ['scheduled_lessons/thu', row('thu', 'poem', '2026-10-16', '4', '11:50')],
    ['scheduled_lessons/fri', row('fri', 'blank', '2026-10-17', '5', '12:45')]
  ]);
  const versions = new Map();
  const store = {
    get: async key => structuredClone(map.get(key) ?? null),
    getWithMetadata: async key => map.has(key) ? { data: structuredClone(map.get(key)), etag: String(versions.get(key) ?? 0) } : null,
    setJSON: async (key, val, conditions = {}) => {
      if ((conditions.onlyIfNew && map.has(key)) || (conditions.onlyIfMatch !== undefined && String(versions.get(key) ?? 0) !== conditions.onlyIfMatch)) return { modified: false };
      map.set(key, val); versions.set(key, (versions.get(key) ?? 0) + 1); return { modified: true };
    },
    set: async (key, val) => { map.set(key, JSON.parse(val)); },
    list: async ({ prefix }) => ({ blobs: [...map.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) })
  };
  const handler = createScheduledLessonLinkHandler({
    env: { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: 's'.repeat(32) },
    verifySessionToken: token => ({ valid: token === 'ok' }),
    getContentStore: async () => store
  });
  const post = (id, body, signed = true) => handler(new Request(`https://api.example/api/scheduled-lessons/${id}/link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(signed ? { cookie: 'life_hub_session=ok' } : {}) },
    body: JSON.stringify(body)
  }));
  return { map, post };
}

test('Friday becomes the linked card for Thursday’s lesson and the empty draft goes to Trash', async () => {
  const { map, post } = setup();
  const res = await post('fri', { lesson_id: 'poem' });
  assert.equal(res.status, 200);
  const data = (await res.json()).data;
  assert.equal(data.trashed_lesson_id, 'blank');
  const fri = map.get('scheduled_lessons/fri');
  assert.equal(fri.lesson_id, 'poem');
  assert.equal(fri.date, '2026-10-17');
  assert.equal(fri.period, '5');
  assert.equal(fri.start_time, '12:45');
  assert.equal(map.get('lessons/blank').status, 'trashed');
  assert.ok(map.get('lessons/blank').trashed_at);
  assert.deepEqual(map.get('lessons/poem').blocks, [{ id: 'b' }]);
});

test('a written lesson left behind is kept; unlinking gives the slot a fresh blank lesson', async () => {
  const { map, post } = setup();
  map.get('lessons/blank').blocks = [{ id: 'written' }];
  assert.equal((await post('fri', { lesson_id: 'poem' })).status, 200);
  assert.equal(map.get('lessons/blank').status, 'active');
  const res = await post('fri', { lesson_id: null });
  assert.equal(res.status, 200);
  const fresh = (await res.json()).data.lesson;
  assert.equal(map.get('scheduled_lessons/fri').lesson_id, fresh.id);
  assert.deepEqual(fresh.blocks, []);
  assert.equal(fresh.unit_id, 'u');
  assert.ok(map.get('units/u').lesson_ids.includes(fresh.id));
  assert.equal(map.get('lessons/poem').status, 'active', 'unlinking never trashes a lesson another slot still teaches');
});

test('rejects unsigned, unknown, self-link and bad input without writing', async () => {
  const { map, post } = setup();
  const before = JSON.stringify([...map]);
  assert.equal((await post('fri', { lesson_id: 'poem' }, false)).status, 401);
  assert.equal((await post('nope', { lesson_id: 'poem' })).status, 404);
  assert.equal((await post('fri', { lesson_id: 'missing' })).status, 404);
  assert.equal((await post('fri', { lesson_id: 'blank' })).status, 400);
  assert.equal((await post('fri', { lesson_id: 7 })).status, 400);
  assert.equal(JSON.stringify([...map].filter(([k]) => !k.startsWith('locks/'))), JSON.stringify(JSON.parse(before).filter(([k]) => !k.startsWith('locks/'))));
});

test('calendar chips name the part, cards offer the link, and the request hits the link endpoint', () => {
  const lessons = [{ id: 'poem', title: 'The Remedy of Butterflies', planning_status: 'planned' }, { id: 'blank', title: 'Lesson 2 — Poetry', planning_status: 'not_planned' }];
  const before = teachingEventsFromCurriculum({ lessons, scheduled_lessons: [row('thu', 'poem', '2026-10-16', '4', '11:50'), row('fri', 'blank', '2026-10-17', '5', '12:45')] });
  const fri = before.find(e => e.record.id === 'fri');
  assert.deepEqual(fri.record.previous_lesson, { id: 'poem', title: 'The Remedy of Butterflies' });
  const card = itemCardHtml({ ...fri, source: 'scheduled_lesson' });
  assert.match(card, /data-link-lesson="poem"/);
  assert.match(card, /Same lesson as “The Remedy of Butterflies”/);
  assert.match(card, /empty lesson here goes to Trash/);
  assert.deepEqual(itemPatchRequest(fri, { link_lesson: 'poem' }), { path: '/api/scheduled-lessons/fri/link', method: 'POST', body: { lesson_id: 'poem' } });

  const after = teachingEventsFromCurriculum({ lessons, scheduled_lessons: [row('thu', 'poem', '2026-10-16', '4', '11:50'), row('fri', 'poem', '2026-10-17', '5', '12:45')] });
  const [thu, fri2] = after;
  assert.equal(thu.record.title, 'The Remedy of Butterflies');
  assert.equal(fri2.record.title, 'The Remedy of Butterflies');
  assert.equal(thu.record.session_index, 1);
  assert.equal(fri2.record.session_index, 2);
  assert.equal(fri2.record.session_count, 2);
  const linked = itemCardHtml(fri2);
  assert.match(linked, /Taught over/);
  assert.match(linked, /data-link-lesson=""/);
  assert.doesNotMatch(itemCardHtml(thu), /Same lesson as/);
  assert.deepEqual(itemPatchRequest(fri2, { link_lesson: null }).body, { lesson_id: null });

  assert.equal(chipFromEvent(fri2).meta, 'P5 · part 2 of 2');
  assert.equal(chipFromEvent(fri2).title, 'The Remedy of Butterflies');
  assert.equal(chipFromEvent(before[0]).meta, 'P4 · The Remedy of Butterflies');
});

test('a lesson the calendar cannot find never shows its internal id', () => {
  const [event] = teachingEventsFromCurriculum({ scheduled_lessons: [row('fri', 'lesson_timetable_d123', '2026-10-17', '5', '12:45')] });
  assert.equal(event.record.title, 'Untitled lesson');
});
