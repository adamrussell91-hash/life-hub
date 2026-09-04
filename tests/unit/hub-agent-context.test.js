import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatHubAgentContext,
  loadHubAgentContext
} from '../../netlify/functions/_shared/hub-agent-context.mjs';

const NOW = new Date('2026-09-04T02:00:00Z');

test('empty stores produce no hub digest', () => {
  assert.equal(formatHubAgentContext({ now: NOW }), '');
});

test('lists open Tasks and skips done ones', () => {
  const text = formatHubAgentContext({
    now: NOW,
    tasks: [
      { title: 'Mark 11PSYCHA', domain: 'teaching', status: 'open', due_date: '2026-09-05', priority: 'high' },
      { title: 'Finished essay brief', domain: 'teaching', status: 'done', due_date: '2026-09-01' }
    ]
  });
  assert.match(text, /Other hubs/);
  assert.match(text, /Tasks:/);
  assert.match(text, /Mark 11PSYCHA/);
  assert.match(text, /due 2026-09-05/);
  assert.doesNotMatch(text, /Finished essay brief/);
});

test('lists active Teaching classes and upcoming scheduled lessons', () => {
  const text = formatHubAgentContext({
    now: NOW,
    classes: [
      { code: '11PSYCHA', display_name: 'Psychology', status: 'active' },
      { code: 'OLDCLASS', status: 'trashed', trashed_at: '2026-08-01T00:00:00Z' }
    ],
    scheduledLessons: [
      { date: '2026-09-08', class_id: 'c1', delivery_status: 'planned', lesson_id: 'les_1' },
      { date: '2026-08-01', class_id: 'c1', delivery_status: 'planned', lesson_id: 'les_old' }
    ]
  });
  assert.match(text, /Teaching:/);
  assert.match(text, /11PSYCHA/);
  assert.doesNotMatch(text, /OLDCLASS/);
  assert.match(text, /2026-09-08/);
  assert.doesNotMatch(text, /2026-08-01/);
});

test('caps Tasks rows so the prompt stays short', () => {
  const tasks = Array.from({ length: 20 }, (_, i) => ({
    title: `Task ${i}`,
    domain: 'life',
    status: 'open',
    due_date: `2026-09-${String(10 + (i % 9)).padStart(2, '0')}`
  }));
  const text = formatHubAgentContext({ now: NOW, tasks });
  assert.equal([...text.matchAll(/Task \d+/g)].length, 12);
});

test('loadHubAgentContext fails open when a store throws', async () => {
  const text = await loadHubAgentContext({
    now: NOW,
    listTasks: async () => {
      throw new Error('unbound');
    },
    listClasses: async () => [{ code: '12ENA6', status: 'active' }],
    listScheduledLessons: async () => []
  });
  assert.match(text, /12ENA6/);
  assert.doesNotMatch(text, /Tasks:/);
});

test('loadHubAgentContext formats both stores when they resolve', async () => {
  const text = await loadHubAgentContext({
    now: NOW,
    listTasks: async () => [{ title: 'Call Clare', domain: 'life', status: 'open' }],
    listClasses: async () => [{ code: '11RETA', status: 'active' }],
    listScheduledLessons: async () => []
  });
  assert.match(text, /Call Clare/);
  assert.match(text, /11RETA/);
});
