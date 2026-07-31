import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCalendarMarkers, getSearchExtension, searchEvents } from '../../js/core/search.js';

const events = [
  { record: { id: 'm1', type: 'meal', date: '2026-07-30', meal: 'lunch' }, body: 'Marley Spoon chicken bowl.' },
  { record: { id: 'd1', type: 'diary', date: '2026-07-30', tags: ['evening'], highlights: 'Solid workout' }, body: 'Private prose.' },
  { record: { id: 'w1', type: 'workout', date: '2026-07-29', title: 'Chest and Curls' }, body: 'Good session.' }
];

test('search terms are case-insensitive and ANDed', () => {
  assert.deepEqual(searchEvents(events, 'chicken bowl').map(result => result.id), ['m1']);
  assert.deepEqual(searchEvents(events, 'chicken workout'), []);
});

test('results are newest first and contain bounded snippets', () => {
  const [result] = searchEvents(events, 'solid');
  assert.equal(result.id, 'd1');
  assert.match(result.snippet, /Solid workout/);
});

test('searches title, tags, meal names, diary highlights, and diary challenges', () => {
  const searchable = [
    { record: { id: 'title', type: 'workout', date: '2026-07-30', title: 'Lower Body' }, body: '' },
    { record: { id: 'tag', type: 'diary', date: '2026-07-29', tags: ['Recovery'] }, body: '' },
    { record: { id: 'meal', type: 'meal', date: '2026-07-28', meal: 'Breakfast' }, body: '' },
    { record: { id: 'highlight', type: 'diary', date: '2026-07-27', highlights: 'Felt strong' }, body: '' },
    { record: { id: 'challenge', type: 'diary', date: '2026-07-26', challenges: 'Late bedtime' }, body: '' }
  ];

  assert.deepEqual(searchEvents(searchable, 'lower').map(result => result.id), ['title']);
  assert.deepEqual(searchEvents(searchable, 'recovery').map(result => result.id), ['tag']);
  assert.deepEqual(searchEvents(searchable, 'breakfast').map(result => result.id), ['meal']);
  assert.deepEqual(searchEvents(searchable, 'strong').map(result => result.id), ['highlight']);
  assert.deepEqual(searchEvents(searchable, 'bedtime').map(result => result.id), ['challenge']);
});

test('preserves same-date source order and original case in a 160-character snippet', () => {
  const longBody = `SECOND Match ${'x'.repeat(160)} Solid Workout`;
  const sameDay = [
    { record: { id: 'first', type: 'diary', date: '2026-07-30' }, body: 'FIRST Match' },
    { record: { id: 'second', type: 'diary', date: '2026-07-30' }, body: longBody }
  ];

  const results = searchEvents(sameDay, 'match');
  assert.deepEqual(results.map(result => result.id), ['first', 'second']);
  const [longResult] = searchEvents(sameDay, 'solid');
  assert.equal(longResult.snippet.length, 160);
  assert.equal(longResult.snippet.startsWith('SECOND Match'), true);
});

test('calendar markers map canonical types to specified categories', () => {
  assert.deepEqual(buildCalendarMarkers(events)['2026-07-30'], ['nutrition', 'diary']);
});

test('calendar markers deduplicate categories and omit unsupported types', () => {
  const markers = buildCalendarMarkers([
    { record: { id: 'weight', type: 'weight', date: '2026-07-30' } },
    { record: { id: 'composition', type: 'composition', date: '2026-07-30' } },
    { record: { id: 'unsupported', type: 'heart', date: '2026-07-30' } },
    { record: { id: 'sleep', type: 'sleep', date: '2026-07-29' } }
  ]);

  assert.deepEqual(markers, {
    '2026-07-30': ['body'],
    '2026-07-29': ['sleep']
  });
});

test('search extension moves exactly three calendar months backward', () => {
  assert.equal(getSearchExtension('2026-07-01'), '2026-04-01');
});

test('search extension crosses January into the prior year and normalizes to the first', () => {
  assert.equal(getSearchExtension('2026-01-31'), '2025-10-01');
});

test('search extension rejects impossible calendar starts and accepts leap days', () => {
  for (const date of ['2026-00-01', '2026-13-01', '2026-02-30', '2026-02-29']) {
    assert.throws(() => getSearchExtension(date), TypeError);
  }
  assert.equal(getSearchExtension('2024-02-29'), '2023-11-01');
});
