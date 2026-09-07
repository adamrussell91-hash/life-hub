/**
 * Phase 5 surface unification: same agent, same read + memory on every surface.
 * Pack/kernel layer. Not a live conversational behaviour suite.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { runSurfaceAgentTurn } from '../../netlify/functions/_shared/agent-surface.mjs';
import { buildClareBriefing } from '../../netlify/functions/_shared/clare-desk.mjs';

const TODAY = '2026-08-20';
const NOW = new Date('2026-08-20T01:00:00.000Z');

const TASKS = [
  { id: '1', title: 'Mark essays', status: 'open', due_date: '2026-08-10', domain: 'teaching', priority: 'high' },
  { id: '2', title: 'Email parent', status: 'open', due_date: TODAY, domain: 'teaching' }
];
const PROJECTS = [{ id: 'p1', title: 'Term 3 marking', status: 'open' }];
const LESSONS = [{ id: 'l1', title: 'Year 10 essay', date: TODAY, class_id: 'c1' }];
const CLASSES = [{ id: 'c1', code: '10ENG', name: 'Year 10 English' }];
const UNITS = [{ id: 'u1', title: 'Essay unit', class_id: 'c1' }];
const PAGES = [{ id: 'note-1', title: 'Cognitive load', excerpt: 'Working memory limits', tags: ['memory'] }];
const MEMORIES = [{
  id: 'mem_standing',
  class: 'user',
  text: 'Keep replies short on school nights',
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
  superseded: false
}];

function texts(turn) {
  return (turn.memory ?? []).map(item => item.text).sort();
}

test('unknown surface is rejected', () => {
  assert.throws(
    () => runSurfaceAgentTurn({ surface: 'notion', slug: 'clare', message: 'hi' }),
    /unknown surface/
  );
});

test('Clare read + memory match on Life and Tasks', () => {
  const shared = {
    slug: 'clare',
    message: 'What should I focus on today?',
    today: TODAY,
    now: NOW,
    stores: { tasks: TASKS, projects: PROJECTS, lessons: LESSONS, memories: MEMORIES },
    flag: true
  };
  const life = runSurfaceAgentTurn({ surface: 'life', ...shared });
  const tasks = runSurfaceAgentTurn({ surface: 'tasks', ...shared });
  assert.equal(life.kernel.plan.workflow, 'daily_focus');
  assert.equal(tasks.kernel.plan.workflow, 'daily_focus');
  assert.deepEqual(life.pack.toolsExecuted, tasks.pack.toolsExecuted);
  assert.ok(life.pack.toolsExecuted.includes('get_tasks_focus'));
  assert.deepEqual(texts(life), texts(tasks));
  assert.match(life.promptBlock, /Mark essays/);
  assert.match(tasks.promptBlock, /Mark essays/);
  assert.match(life.promptBlock, /Keep replies short on school nights/);
  assert.match(tasks.promptBlock, /Keep replies short on school nights/);
  assert.match(life.interpretationBlock, /not a domain record/);
  assert.match(tasks.interpretationBlock, /not a domain record/);
});

test('Ann read + memory match on Life and Teaching', () => {
  const shared = {
    slug: 'ann',
    message: "Help me improve tomorrow's Year 10 lesson",
    today: TODAY,
    now: NOW,
    stores: { classes: CLASSES, lessons: LESSONS, units: UNITS, memories: MEMORIES }
  };
  const life = runSurfaceAgentTurn({ surface: 'life', ...shared });
  const teaching = runSurfaceAgentTurn({ surface: 'teaching', ...shared });
  assert.equal(life.pack.active, true);
  assert.equal(teaching.pack.active, true);
  assert.deepEqual(life.pack.toolsExecuted, teaching.pack.toolsExecuted);
  assert.ok(life.pack.toolsExecuted.includes('search_teaching'));
  assert.ok(life.pack.toolsExecuted.includes('get_teaching_diagnosis'));
  assert.deepEqual(texts(life), texts(teaching));
  assert.match(life.promptBlock, /not source records/);
  assert.match(teaching.promptBlock, /not source records/);
});

test('Clementine read + memory match on Life and Knowledge', () => {
  const shared = {
    slug: 'clementine',
    message: 'What do I already know about cognitive load?',
    today: TODAY,
    now: NOW,
    stores: { pages: PAGES, classes: CLASSES, lessons: LESSONS, units: UNITS, memories: MEMORIES }
  };
  const life = runSurfaceAgentTurn({ surface: 'life', ...shared });
  const knowledge = runSurfaceAgentTurn({ surface: 'knowledge', ...shared });
  assert.equal(life.pack.active, true);
  assert.equal(knowledge.pack.active, true);
  assert.deepEqual(life.pack.toolsExecuted, knowledge.pack.toolsExecuted);
  assert.ok(life.pack.toolsExecuted.includes('search_knowledge'));
  assert.deepEqual(texts(life), texts(knowledge));
  assert.match(life.promptBlock, /Keep replies short on school nights/);
  assert.match(knowledge.promptBlock, /Keep replies short on school nights/);
});

test('Tasks Clare briefing uses the same kernel prompt as Life', () => {
  const briefing = buildClareBriefing(TASKS, 'morning-sweep', NOW, {
    projects: PROJECTS,
    memories: MEMORIES,
    flag: true
  });
  const life = runSurfaceAgentTurn({
    surface: 'life',
    slug: 'clare',
    message: 'What should I focus on today?',
    today: NOW.toISOString().slice(0, 10),
    now: NOW,
    stores: { tasks: TASKS, projects: PROJECTS, memories: MEMORIES },
    flag: true
  });
  assert.match(briefing.evidence_prompt, /Mark essays/);
  assert.match(briefing.evidence_prompt, /Keep replies short on school nights/);
  assert.match(life.promptBlock, /Keep replies short on school nights/);
  assert.equal(
    briefing.evidence_prompt.replace(/Agent kernel turn \S+/, 'Agent kernel turn'),
    life.promptBlock.replace(/Agent kernel turn \S+/, 'Agent kernel turn')
  );
  assert.ok(briefing.evidence_pack.tools.includes('get_tasks_focus'));
});
