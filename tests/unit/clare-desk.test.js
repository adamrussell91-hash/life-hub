import assert from 'node:assert/strict';
import test from 'node:test';
import {
  briefingToMarkdown,
  buildMorningSweep,
  buildTomorrowSetup,
  buildWeeklyReset,
  findHighStakesTasks
} from '../../netlify/functions/_shared/clare-desk.mjs';

const now = new Date(2026, 7, 25, 9, 0, 0);

function task(overrides) {
  return {
    id: 'task_1',
    title: 'Lock MindWorks term brief',
    kind: 'task',
    bucket: 'active',
    status: 'open',
    priority: 'high',
    domain: 'teaching',
    due_date: '2026-08-27',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    estimated_duration: 60,
    tags: [],
    ...overrides
  };
}

const tasks = [
  task({}),
  task({
    id: 'task_2',
    title: 'Email parents',
    priority: 'medium',
    due_date: '2026-08-25',
    tags: ['comms'],
    created_at: '2026-08-24T00:00:00.000Z',
    updated_at: '2026-08-24T00:00:00.000Z'
  }),
  task({
    id: 'task_3',
    title: 'Overdue marking pile',
    priority: 'medium',
    due_date: '2026-08-20',
    created_at: '2026-08-10T00:00:00.000Z',
    updated_at: '2026-08-10T00:00:00.000Z'
  })
];

test('flags stale high-stakes work', () => {
  const stakes = findHighStakesTasks(tasks, now);
  assert.ok(stakes.map(item => item.title).includes('Lock MindWorks term brief'));
  assert.ok(stakes.every(item => item.priority === 'high' || item.priority === 'urgent'));
});

test('morning sweep leads with the stuck deadline', () => {
  const briefing = buildMorningSweep(tasks, now);
  assert.match(briefing.lead, /one thing before we start/i);
  assert.match(briefing.lead, /has not moved/i);
  assert.equal(briefing.closer, 'That is your day. Dump away.');
  const words = [briefing.lead, briefing.closer, ...briefing.sections.flatMap(section => section.lines)]
    .join(' ')
    .split(/\s+/)
    .filter(Boolean);
  assert.ok(words.length < 300);
});

test('tomorrow setup asks what to carry forward', () => {
  const briefing = buildTomorrowSetup(tasks, now);
  assert.match(briefing.closer, /reschedule|carry forward|close/i);
  assert.ok(briefing.sections.length > 0);
});

test('weekly reset names overdue decisions', () => {
  const briefing = buildWeeklyReset(tasks, now);
  assert.ok(briefing.sections.some(section => /decide|week/i.test(section.heading)));
});

test('flattens a briefing into markdown', () => {
  const briefing = buildMorningSweep(tasks, now);
  const markdown = briefingToMarkdown(briefing);
  assert.ok(markdown.includes(briefing.lead));
  assert.ok(markdown.includes(briefing.closer));
  if (briefing.sections[0]) {
    assert.ok(markdown.includes(`**${briefing.sections[0].heading}**`));
    assert.match(markdown, /^- /m);
  }
});
