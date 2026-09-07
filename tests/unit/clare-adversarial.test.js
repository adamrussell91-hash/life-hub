/**
 * Adversarial Clare cases from AGENT_CAPABILITY_STRATEGY Phase 0.
 * These prove observed workbench contracts — not conversational behaviour.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  executeClareWork,
  inspectBoard,
  planWork
} from '../../netlify/functions/_shared/clare-work.mjs';

const NOW = new Date('2026-09-06T01:00:00.000Z');

const TASKS = [
  {
    id: 'task_mark',
    title: 'Mark essays',
    status: 'open',
    domain: 'teaching',
    priority: 'high',
    due_date: '2026-09-06',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z'
  },
  {
    id: 'task_email',
    title: 'Email parent',
    status: 'open',
    domain: 'teaching',
    tags: ['comms'],
    waiting_on: 'parent reply',
    due_date: '2026-09-06',
    estimated_duration: 15,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z'
  }
];

const STALE_PROJECT = {
  id: 'proj_stale',
  title: 'Unit redesign',
  status: 'active',
  updated_at: '2026-05-01T00:00:00.000Z'
};

const LESSONS = [
  { id: 'l1', title: 'Year 10 essay', date: '2026-09-06', class_id: 'c1', starts_at: '11:00' }
];

test('correction: wording fix is not captured as a new task', async () => {
  const dump = await executeClareWork(
    'parse_dump',
    { text: 'Encouraging is supposed to be incursion for both of those' },
    { now: NOW, tasks: TASKS }
  );
  assert.equal(dump.ok, true);
  assert.ok(dump.items.every(item => item.kind === 'meta' && item.actionable === false));
  const created = await executeClareWork(
    'clare_mutate',
    { op: 'create_task', title: 'Encouraging is supposed to be incursion for both of those' },
    { now: NOW, tasks: TASKS }
  );
  assert.equal(created.kind, 'propose');
  assert.ok(
    dump.items.every(item => !item.actionable),
    'parse_dump must not treat the correction as an actionable create'
  );
});

test('long list: parse_dump keeps a visible omitted count', async () => {
  const lines = Array.from({ length: 25 }, (_, i) => `Mark class ${i + 1} essays`);
  const dump = await executeClareWork('parse_dump', { text: lines.join('\n') }, { now: NOW });
  assert.equal(dump.count, 25);
  assert.equal(dump.items.length, 20);
  assert.equal(dump.truncated, true);
  assert.equal(dump.kept, 20);
  assert.equal(dump.omitted, 5);
});

test('missing times: time-block starts at 08:00 and defaults untimed tasks to 45 minutes', () => {
  const plan = planWork('time_block', {
    tasks: TASKS,
    lessons: LESSONS,
    date: '2026-09-06',
    now: NOW
  });
  assert.equal(plan.blocks[0].start, '08:00');
  const mark = plan.blocks.find(block => block.id === 'task_mark');
  assert.ok(mark);
  assert.equal(mark.minutes, 45);
  assert.equal(plan.lessons, 1);
  assert.ok(
    plan.blocks.every(block => !block.title?.includes('Year 10 essay')),
    'lesson times are counted but not reserved on the workday'
  );
});

test('calendar collisions: same-day teaching and tasks are named', () => {
  const collisions = planWork('collisions', {
    tasks: TASKS,
    lessons: LESSONS,
    date: '2026-09-06',
    now: NOW
  });
  assert.equal(collisions.task_count, 2);
  assert.equal(collisions.lesson_count, 1);
  assert.equal(collisions.collisions[0].kind, 'teaching_and_tasks');
  const timed = planWork('time_block', {
    tasks: TASKS,
    lessons: LESSONS,
    date: '2026-09-06',
    now: NOW
  });
  assert.equal(timed.blocks[0].start, '08:00');
  assert.ok(
    !timed.blocks.some(block => block.start === '11:00'),
    'current planner does not shift tasks around the 11:00 lesson'
  );
});

test('stale projects: projects list includes the old project; stale view is tasks-only', () => {
  const projects = inspectBoard('projects', { projects: [STALE_PROJECT], tasks: TASKS });
  assert.equal(projects.count, 1);
  assert.equal(projects.projects[0].id, 'proj_stale');
  const stale = inspectBoard('stale', { projects: [STALE_PROJECT], tasks: TASKS });
  assert.ok(stale.results.every(item => item.id !== 'proj_stale'));
  assert.equal(stale.results[0].id, 'task_mark');
});

test('partial tool failure: one dead URL stays visible beside a live source', async () => {
  const researched = await executeClareWork('research_topic', {
    topic: 'NSW term dates',
    urls: ['https://education.nsw.gov.au/terms', 'https://localhost/secret']
  }, {
    fetchImpl: async (url) => {
      if (String(url).includes('localhost')) throw new Error('should not fetch localhost');
      return {
        ok: true,
        status: 200,
        url: 'https://education.nsw.gov.au/terms',
        arrayBuffer: async () => Buffer.from('<title>Terms</title><p>Term 1 starts 27 January.</p>')
      };
    }
  });
  assert.equal(researched.ok, true);
  const live = researched.sources.find(source => source.url.includes('education.nsw.gov.au'));
  const dead = researched.sources.find(source => String(source.url).includes('localhost'));
  assert.equal(live.live, true);
  assert.equal(dead.live, false);
  assert.ok(dead.error);
});
