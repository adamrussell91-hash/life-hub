import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFatSeries,
  buildHubLoad,
  buildKnowledgeTopics,
  buildMoodStrip,
  buildTrainingWeeks,
  buildWeightPoint,
  loopId,
  parseDepositLines,
  parseWeightTarget
} from '../../apps/life/js/app/central-node-board.js';

function event(record) {
  return { record, body: '', path: '' };
}

test('parseWeightTarget reads the recomposition band from constraints', () => {
  assert.deepEqual(parseWeightTarget('Body composition goal: 78–82kg'), { low: 78, high: 82 });
  assert.equal(parseWeightTarget('No band'), null);
});

test('board builders stay honest on sparse events', () => {
  assert.deepEqual(buildFatSeries([], '2026-07-30').days, []);
  assert.equal(buildWeightPoint([]), null);
  assert.equal(buildTrainingWeeks([], '2026-07-30').every(week => week.minutes === 0), true);
  assert.equal(buildMoodStrip([], '2026-07-30').every(day => day.logged === false), true);
  assert.deepEqual(buildHubLoad({ date: '2026-07-30' }).hubs, []);
  assert.deepEqual(buildKnowledgeTopics([], '2026-07-30').topics, []);
});

test('fat, weight, training and mood read Life events', () => {
  const events = [
    event({ type: 'meal', date: '2026-07-30', meal: 'lunch', calories: 600, protein_g: 40, fat_g: 62 }),
    event({ type: 'weight', date: '2026-07-24', weight_kg: 80 }),
    event({ type: 'workout', date: '2026-07-29', status: 'completed', duration_min: 40 }),
    event({ type: 'diary', date: '2026-07-30', mood_score: 7, energy: 'medium' })
  ];
  const fat = buildFatSeries(events, '2026-07-30', { fatCeiling: 50 });
  assert.equal(fat.days.find(day => day.date === '2026-07-30').over, true);
  assert.deepEqual(buildWeightPoint(events), { date: '2026-07-24', weight_kg: 80 });
  const weeks = buildTrainingWeeks(events, '2026-07-30');
  assert.ok(weeks.some(week => week.minutes === 40 && week.over));
  const mood = buildMoodStrip(events, '2026-07-30');
  assert.deepEqual(mood.find(day => day.date === '2026-07-30'), {
    date: '2026-07-30',
    mood: 7,
    energy: 5,
    logged: true
  });
});

test('hub load drops empty hubs and cancelled lessons', () => {
  const load = buildHubLoad({
    date: '2026-07-30',
    scheduledLessons: [
      { date: '2026-07-30', delivery_status: 'scheduled' },
      { date: '2026-07-31', delivery_status: 'cancelled' }
    ],
    tasks: [{ title: 'Mark', due_date: '2026-07-30', status: 'open' }],
    events: [event({ type: 'workout', date: '2026-08-02', status: 'planned' })]
  });
  assert.deepEqual(load.hubs.map(hub => hub.name), ['Teaching', 'Tasks', 'Life']);
  assert.deepEqual(load.stack[0], 2);
  assert.equal(load.hubs.find(hub => hub.name === 'Teaching').vals[1], 0);
});

test('knowledge topics prefer book origins, then Knowledge tags, then title aliases', () => {
  const topics = buildKnowledgeTopics([
    { title: 'Unreliable narration', created_at: '2026-07-28', origins: [{ kind: 'book', label: 'An Artist of the Floating World' }] },
    { title: 'Identification models', created_at: '2026-07-22', tags: ['High Potential and High Ability Education'] },
    { title: 'Gifted education notes', updated_at: '2026-07-21' },
    { title: 'Unrelated shopping list', updated_at: '2026-07-28' }
  ], '2026-07-30');
  assert.equal(topics.topics[0].name, 'An Artist of the Floating World');
  assert.deepEqual(
    topics.topics.map(topic => topic.name).sort(),
    ['An Artist of the Floating World', 'Gifted education', 'High Potential and High Ability Education']
  );
  assert.ok(topics.topics[0].vals.some(value => value === 1));
});

test('deposit lines keep from → to and loop ids are stable', () => {
  const deposits = parseDepositLines('- Chadwick→Brisket: session logged.\n- stray note');
  assert.deepEqual(deposits[0], {
    from: 'Chadwick',
    to: 'Brisket',
    text: 'session logged.',
    raw: 'Chadwick→Brisket: session logged.'
  });
  assert.equal(deposits[1].text, 'stray note');
  assert.equal(loopId({ source: 'governance', dateKey: '2026-07-01', title: 'Open loop' }), 'governance:2026-07-01:Open loop');
});
