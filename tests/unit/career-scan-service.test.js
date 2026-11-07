import test from 'node:test';
import assert from 'node:assert/strict';
import {
  keepScanProposal,
  proposalOccurredOn,
  shouldRunCareerScanNow,
  skillTitleKey,
  sourceRefsHash,
  isoWeekKey,
  labelScanProposals
} from '../../netlify/functions/_shared/career-scan-service.mjs';
import { careerScanProposalKey } from '../../netlify/functions/_shared/professional-blobs.mjs';
import { generateScanProposalId } from '../../netlify/functions/_shared/career-schema.mjs';

function memoryStore() {
  const data = new Map();
  return {
    data,
    async get(key) {
      return data.has(key) ? structuredClone(data.get(key)) : null;
    },
    async setJSON(key, value) {
      data.set(key, structuredClone(value));
    }
  };
}

test('sourceRefsHash is order-insensitive', () => {
  assert.equal(
    sourceRefsHash(['tasks:task:a', 'professional:meeting:b']),
    sourceRefsHash(['professional:meeting:b', 'tasks:task:a'])
  );
});

test('shouldRunCareerScanNow is Sunday 17–19 Sydney with once-per-week success', () => {
  // 2026-09-27 is a Sunday. 07:00 UTC = 17:00 Sydney (AEST, UTC+10).
  const sunday1700 = new Date('2026-09-27T07:00:00Z');
  const gate = shouldRunCareerScanNow(sunday1700, {});
  assert.equal(gate.run, true);
  assert.ok(gate.weekKey);

  const already = shouldRunCareerScanNow(sunday1700, { last_success_week: gate.weekKey });
  assert.equal(already.run, false);

  assert.equal(shouldRunCareerScanNow(new Date('2026-09-27T08:00:00Z'), {}).run, true);
  assert.equal(shouldRunCareerScanNow(new Date('2026-09-27T09:00:00Z'), {}).run, true);

  const monday = new Date('2026-09-28T07:00:00Z');
  assert.equal(shouldRunCareerScanNow(monday, {}).run, false);
});

test('isoWeekKey is stable for a Sydney Sunday', () => {
  const key = isoWeekKey(new Date('2026-09-27T07:00:00Z'));
  assert.match(key, /^\d{4}-W\d{2}$/);
});

test('skillTitleKey treats case, spacing, ampersands and punctuation as the same skill', () => {
  assert.equal(
    skillTitleKey('Research translation & professional writing'),
    skillTitleKey('  research translation and Professional Writing. ')
  );
  assert.notEqual(skillTitleKey('Mentoring'), skillTitleKey('Mentoring new staff'));
});

test('proposalOccurredOn dates a card from its latest source, not the scan day', () => {
  const dates = new Map([
    ['professional:meeting:a', '2026-03-02'],
    ['professional:meeting:b', '2026-05-09']
  ]);
  assert.equal(
    proposalOccurredOn(['professional:meeting:a', 'professional:meeting:b'], dates, '2026-10-02', '2026-10-19T07:00:00Z'),
    '2026-05-09'
  );
  assert.equal(proposalOccurredOn(['x'], new Map(), '2026-04-01', '2026-10-19T07:00:00Z'), '2026-04-01');
  assert.equal(proposalOccurredOn([], new Map(), 'not a date', '2026-10-19T07:00:00Z'), '2026-10-19');
});

test('keeping a proposal whose title is already in the ledger reuses that card', async () => {
  const store = memoryStore();
  const id = generateScanProposalId();
  await store.setJSON(careerScanProposalKey(id), {
    id,
    status: 'pending',
    equivalence_hash: 'h1',
    title: 'Research translation & professional writing',
    occurred_on: '2026-05-09',
    date_precision: 'day',
    star: {},
    skills: [],
    apst: [],
    source_refs: [],
    witness_refs: [],
    future_matches: []
  });
  let created = 0;
  const existing = {
    id: 'ach_existing',
    title: 'Research translation and professional writing',
    lifecycle_status: 'active'
  };
  const careerRepo = {
    async listAchievements() {
      return [existing];
    },
    async createAchievement() {
      created += 1;
      return { id: 'ach_new' };
    }
  };
  const result = await keepScanProposal(
    { store, careerRepo, universalStore: memoryStore(), nowIso: '2026-10-19T07:00:00Z' },
    id
  );
  assert.equal(created, 0);
  assert.equal(result.achievement.id, 'ach_existing');
  assert.equal(result.proposal.status, 'kept');
  assert.equal(result.proposal.achievement_id, 'ach_existing');
});

test('labelScanProposals names and links source and witness refs', async () => {
  const calls = [];
  const resolveEntity = async (ref) => {
    calls.push(ref);
    if (ref === 'tasks:project:gone') throw new Error('not found');
    return { display_label: `Label for ${ref}`, href: `/hub/#/${ref}` };
  };
  const [proposal] = await labelScanProposals(
    [
      {
        id: 'p1',
        source_refs: ['tasks:project:p1', 'tasks:project:gone'],
        witness_refs: ['tasks:project:p1']
      }
    ],
    { resolveEntity }
  );
  assert.deepEqual(proposal.source_labels, [
    { ref: 'tasks:project:p1', label: 'Label for tasks:project:p1', href: '/hub/#/tasks:project:p1' },
    { ref: 'tasks:project:gone', label: null, href: null }
  ]);
  assert.equal(proposal.witness_labels[0].href, '/hub/#/tasks:project:p1');
  assert.equal(calls.filter((ref) => ref === 'tasks:project:p1').length, 1);
});

// ---- Wider scan readers ----
import {
  collectScanSources,
  defaultScanListers,
  runCareerScanPass
} from '../../netlify/functions/_shared/career-scan-service.mjs';

function blobStore(seed = {}) {
  const data = new Map(Object.entries(seed).map(([k, v]) => [k, structuredClone(v)]));
  return {
    data,
    async list({ prefix }) {
      return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) };
    },
    async get(key) {
      return data.has(key) ? structuredClone(data.get(key)) : null;
    },
    async setJSON(key, value) {
      data.set(key, structuredClone(value));
    },
    async delete(key) {
      data.delete(key);
    }
  };
}

const NOW = '2026-11-07T00:00:00.000Z';
const base = { nowIso: NOW, since: '2026-10-20T00:00:00.000Z' };

test('tasks, projects and goals are collected with the right filter and date', async () => {
  const tasksStore = blobStore({
    'tasks/t1': { id: 't1', title: 'Ship the rubric', description: 'Moderated with the team', status: 'done', completed_at: '2026-11-01T02:00:00Z', parent_project_id: 'p1' },
    'tasks/t2': { id: 't2', title: 'Still open', status: 'open', parent_project_id: 'p2' },
    'tasks/t3': { id: 't3', title: 'Binned', status: 'done', completed_at: '2026-11-02T00:00:00Z', trashed_at: '2026-11-03T00:00:00Z' },
    'tasks/t4': { id: 't4', title: 'Too old', status: 'done', completed_at: '2026-01-01T00:00:00Z' },
    'tasks/t5': { id: 't5', title: 'Second step', bucket: 'done', updated_at: '2026-11-02T00:00:00Z', parent_project_id: 'p1' },
    'projects/p1': { id: 'p1', title: 'Rubric project', description: 'All done', updated_at: '2026-11-03T00:00:00Z' },
    'projects/p2': { id: 'p2', title: 'Half done', updated_at: '2026-11-03T00:00:00Z' },
    'projects/p3': { id: 'p3', title: 'No tasks', updated_at: '2026-11-03T00:00:00Z' },
    'goals/g1': { id: 'g1', title: 'Run a workshop', status: 'achieved', updated_at: '2026-11-04T00:00:00Z' },
    'goals/g2': { id: 'g2', title: 'Not yet', status: 'active', updated_at: '2026-11-04T00:00:00Z' }
  });
  const result = await collectScanSources({ ...base, ...defaultScanListers({ tasksStore }) });
  const refs = result.sources.map((s) => s.ref).sort();
  assert.deepEqual(refs, [
    'tasks:goal:g1',
    'tasks:project:p1',
    'tasks:task:t1',
    'tasks:task:t5'
  ]);
  const t1 = result.sources.find((s) => s.ref === 'tasks:task:t1');
  assert.equal(t1.date, '2026-11-01');
  assert.equal(t1.kind, 'task');
  assert.match(t1.text, /Moderated/);
  assert.equal(result.sources.find((s) => s.ref === 'tasks:project:p1').date, '2026-11-03');
  assert.deepEqual(result.read_kinds.sort(), ['goal', 'project', 'task']);
});

test('teaching units and lessons are collected; quiz activity is a number, never rows', async () => {
  const teachingStore = blobStore({
    'units/u1': { id: 'u1', title: 'Invented Unit', code: 'IU1', description: 'A unit', updated_at: '2026-11-02T00:00:00Z' },
    'units/u2': { id: 'u2', title: 'Old Unit', updated_at: '2026-02-02T00:00:00Z' },
    'lessons/l1': { id: 'l1', title: 'Lesson one', pedagogical_mode: 'tutorial', unit_id: 'u1', created_at: '2026-10-25T00:00:00Z', blocks: [{ secret: 'BLOCK BODY' }] },
    'lessons/l2': { id: 'l2', title: 'Old lesson', created_at: '2026-01-01T00:00:00Z' },
    'lessons/l3': { id: 'l3', title: 'Trashed lesson', created_at: '2026-11-01T00:00:00Z', status: 'trashed' },
    'lessons/l4': { id: 'l4', title: 'Taught lesson', created_at: '2026-01-01T00:00:00Z' },
    'scheduled_lessons/s1': { id: 's1', lesson_id: 'l4', class_id: 'c1', date: '2026-11-03', delivery_status: 'delivered' },
    'scheduled_lessons/s2': { id: 's2', lesson_id: 'l4', class_id: 'c2', date: '2026-11-04', delivery_status: 'delivered' },
    'scheduled_lessons/s3': { id: 's3', lesson_id: 'l2', class_id: 'c1', date: '2026-11-04', delivery_status: 'planned' },
    'quiz/l1/results/ab': { student: 'Invented Student', score: 9 },
    'quiz/l1/results/cd': { student: 'Another Student', score: 4 },
    'quiz/l2/results/ef': { student: 'Nobody', score: 1 }
  });
  const result = await collectScanSources({ ...base, ...defaultScanListers({ teachingStore }) });
  const refs = result.sources.map((s) => s.ref).sort();
  assert.deepEqual(refs, ['teaching:lesson:l1', 'teaching:lesson:l4', 'teaching:unit:u1']);
  const l1 = result.sources.find((s) => s.ref === 'teaching:lesson:l1');
  assert.match(l1.text, /2 quiz hand-ins/);
  assert.match(l1.text, /Unit: Invented Unit/);
  const l4 = result.sources.find((s) => s.ref === 'teaching:lesson:l4');
  assert.equal(l4.date, '2026-11-04');
  assert.match(l4.text, /Taught to 2 classes/);
  const sent = JSON.stringify(result.sources);
  assert.ok(!sent.includes('Invented Student') && !sent.includes('BLOCK BODY') && !/"score"/.test(sent));
});

test('professional events, communications, meetings and knowledge pages are collected', async () => {
  const result = await collectScanSources({
    ...base,
    listMeetings: async () => [
      { id: 'm1', title: 'Planning', occurred_on: '2026-11-01', notes: 'Agreed the plan' },
      { id: 'm2', title: 'No notes', occurred_on: '2026-11-01' },
      { id: 'm3', title: 'Summary only', scheduled_start: '2026-11-02T01:00:00Z', summary: 'Short summary' }
    ],
    listEvents: async () => [
      { id: 'e1', title: 'Workshop', event_type: 'professional_development', start: '2026-11-02T00:00:00Z', occurrence_state: 'completed', hours: 3, talks: [{ title: 'Talk A' }] },
      { id: 'e2', title: 'Upcoming', start: '2026-11-02T00:00:00Z', occurrence_state: 'scheduled' }
    ],
    listCommunications: async () => [
      { id: 'c1', subject: 'Parent call', summary: 'Resolved concern', occurred_at: '2026-11-03T00:00:00Z' },
      { id: 'c2', subject: 'No summary', occurred_at: '2026-11-03T00:00:00Z' }
    ],
    listKnowledge: async () => [
      { id: 'k1', title: 'Note', tags: ['pedagogy'], excerpt: 'An excerpt', updated_at: '2026-11-05T00:00:00Z' },
      { id: 'k2', title: 'Stale', updated_at: '2025-01-01T00:00:00Z' }
    ]
  });
  assert.deepEqual(result.sources.map((s) => s.ref), [
    'knowledge:page:k1',
    'professional:communication:c1',
    'professional:event:e1',
    'professional:meeting:m3',
    'professional:meeting:m1'
  ]);
  const event = result.sources.find((s) => s.kind === 'event');
  assert.match(event.text, /3 hours/);
  assert.match(event.text, /Talk A/);
  assert.deepEqual(result.read_kinds.sort(), ['communication', 'event', 'meeting', 'page']);
});

test('a reader that throws is skipped and missing from read_kinds', async () => {
  const result = await collectScanSources({
    ...base,
    listMeetings: async () => [{ id: 'm1', title: 'A', occurred_on: '2026-11-01', notes: 'n' }],
    listKnowledge: async () => {
      throw Object.assign(new Error('unbound'), { code: 'knowledge_repo_unbound' });
    },
    listTasks: async () => {
      throw new Error('tasks store unbound');
    },
    listProjects: async () => []
  });
  assert.deepEqual(result.read_kinds, ['meeting']);
  assert.equal(result.sources.length, 1);
});

test('weekly scan keeps the newest 60 sources', async () => {
  const meetings = Array.from({ length: 80 }, (_, i) => ({
    id: `m${i}`,
    title: `Meeting ${i}`,
    occurred_on: `2026-11-${String((i % 5) + 1).padStart(2, '0')}`,
    notes: 'x'.repeat(900)
  }));
  const result = await collectScanSources({ ...base, listMeetings: async () => meetings });
  assert.equal(result.sources.length, 60);
  assert.ok(result.sources.every((s) => s.text.length <= 600));
  assert.ok(result.sources.every((s) => s.date >= '2026-11-02'));
});

test('the window is clamped to 21 days even when the last success is long ago', async () => {
  const result = await collectScanSources({
    nowIso: NOW,
    since: '2025-01-01T00:00:00.000Z',
    listMeetings: async () => [
      { id: 'new', title: 'New', occurred_on: '2026-10-25', notes: 'n' },
      { id: 'old', title: 'Old', occurred_on: '2026-09-01', notes: 'n' }
    ]
  });
  assert.deepEqual(result.sources.map((s) => s.ref), ['professional:meeting:new']);
});

test('runCareerScanPass reads through injected listers and records read_kinds', async () => {
  const store = blobStore();
  const seen = [];
  const result = await runCareerScanPass({
    env: { ANTHROPIC_API_KEY: 'test' },
    now: () => new Date(NOW),
    professionalStore: store,
    force: true,
    listMeetings: async () => [{ id: 'm1', title: 'Planning', occurred_on: '2026-11-01', notes: 'Agreed' }],
    listKnowledge: async () => {
      throw new Error('knowledge_repo_unbound');
    },
    fetchImpl: async (_url, init) => {
      seen.push(JSON.parse(init.body));
      return { ok: true, json: async () => ({ content: [{ text: '{"proposals":[]}' }] }) };
    }
  });
  assert.equal(result.sources, 1);
  assert.deepEqual(result.read_kinds, ['meeting']);
  assert.deepEqual(result.scan_state.read_kinds, ['meeting']);
  assert.match(seen[0].messages[0].content, /"kind":"meeting"/);
  assert.match(seen[0].messages[0].content, /Agreed/);
});
