import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSystemPrompt } from '../../netlify/functions/_shared/persona.mjs';
import {
  buildAgentTools,
  resetCapabilityCaches
} from '../../netlify/functions/_shared/capabilities/registry.mjs';
import { activationForTurn } from '../../netlify/functions/_shared/capabilities/activation-policy.mjs';
import {
  CLARE_JOBS,
  CLARE_PROTOCOL_PATH,
  assertPublicHttpUrl,
  buildClareMutation,
  clareWorkSchemas,
  executeClareWork,
  extractPlaceFacts,
  extractReadableText,
  formatClareDraft,
  formatClareJobsForPrompt,
  inspectBoard,
  isBlockedFetchHost,
  isClareWorkTool,
  lookupAuDates,
  planWork
} from '../../netlify/functions/_shared/clare-work.mjs';
import {
  executeProposeActionWrites,
  validateProposeActionInput
} from '../../netlify/functions/_shared/capabilities/propose-action.mjs';

const NOW = new Date('2026-09-06T01:00:00.000Z');

const TASKS = [
  {
    id: 'task_mark',
    title: 'Mark essays',
    status: 'open',
    domain: 'teaching',
    priority: 'high',
    due_date: '2026-09-06',
    estimated_duration: 90,
    tags: ['marking'],
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z'
  },
  {
    id: 'task_email',
    title: 'Email parent',
    status: 'open',
    domain: 'teaching',
    priority: 'medium',
    due_date: '2026-09-06',
    estimated_duration: 15,
    tags: ['comms'],
    waiting_on: 'parent reply',
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z'
  },
  {
    id: 'task_dup_a',
    title: 'Permission note',
    status: 'open',
    domain: 'teaching',
    created_at: '2026-08-20T00:00:00.000Z'
  },
  {
    id: 'task_dup_b',
    title: 'Permission note',
    status: 'open',
    domain: 'teaching',
    created_at: '2026-08-21T00:00:00.000Z'
  }
];

const PROJECTS = [
  { id: 'proj_mindworks', title: 'MindWorks', status: 'active', type: 'standard' }
];

const LESSONS = [
  { id: 'l1', title: 'Year 10 essay', date: '2026-09-06', class_id: 'c1' }
];

test('Clare workbench catalogues exactly 40 jobs and 15 tools', () => {
  assert.equal(CLARE_JOBS.length, 40);
  assert.equal(new Set(CLARE_JOBS.map(item => item.id)).size, 40);
  const schemas = clareWorkSchemas();
  assert.equal(schemas.length, 15);
  for (const job of CLARE_JOBS) {
    assert.ok(isClareWorkTool(job.tool), job.tool);
  }
  assert.ok(formatClareJobsForPrompt().includes('Fetch a URL'));
});

test('buildAgentTools attaches Clare workbench only for Clare', () => {
  resetCapabilityCaches();
  const clare = buildAgentTools({ slug: 'clare' }).map(tool => tool.name);
  const brisket = buildAgentTools({ slug: 'brisket', allowedTypes: ['meal'] }).map(tool => tool.name);
  const hammond = buildAgentTools({ slug: 'hammond', needsHammondTools: true }).map(tool => tool.name);
  for (const name of ['fetch_url', 'research_topic', 'clare_mutate', 'parse_dump', 'check_clock']) {
    assert.ok(clare.includes(name), name);
    assert.ok(!brisket.includes(name), name);
    assert.ok(!hammond.includes(name), name);
  }
  assert.ok(clare.includes('web_search'));
  assert.ok(clare.includes('get_tasks_focus'));
});

test('Clare prompt delivers the 40-job catalogue; other agents do not', () => {
  const act = activationForTurn({ slug: 'clare', message: 'What should I focus on today?' });
  const clare = buildSystemPrompt({
    slug: 'clare',
    activationCatalogue: act.catalogueBlock,
    activationDirective: act.activationBlock
  });
  assert.match(clare, /Clare workbench/);
  assert.match(clare, /fetch_url/);
  assert.match(clare, /clare_mutate/);
  assert.match(clare, /Saying you cannot do that job is a failure/);
  const brisket = buildSystemPrompt({ slug: 'brisket' });
  assert.ok(!brisket.includes('Clare workbench'));
  assert.ok(!brisket.includes('clare_mutate'));
});

test('activation forces parse_dump on a dump and research_topic on official-source asks', () => {
  const dump = activationForTurn({ slug: 'clare', message: 'Here is a dump: mark 10ENG, email the parent' });
  assert.equal(dump.intentClass, 'clare_dump');
  assert.deepEqual(dump.requiredTools, ['parse_dump']);
  const research = activationForTurn({ slug: 'clare', message: 'Find the official NSW term dates' });
  assert.equal(research.intentClass, 'clare_research');
  assert.deepEqual(research.requiredTools, ['research_topic']);
});

test('SSRF guard blocks private hosts and accepts public https', () => {
  assert.equal(isBlockedFetchHost('localhost'), true);
  assert.equal(isBlockedFetchHost('127.0.0.1'), true);
  assert.equal(isBlockedFetchHost('10.0.0.4'), true);
  assert.equal(isBlockedFetchHost('192.168.1.1'), true);
  assert.equal(isBlockedFetchHost('169.254.169.254'), true);
  assert.equal(isBlockedFetchHost('education.nsw.gov.au'), false);
  assert.equal(assertPublicHttpUrl('http://127.0.0.1/secret').error, 'blocked_host');
  assert.equal(assertPublicHttpUrl('file:///etc/passwd').error, 'unsupported_protocol');
  assert.equal(assertPublicHttpUrl('https://education.nsw.gov.au/terms').ok, true);
});

test('fetch_url extracts text and reports live status', async () => {
  const html = '<html><head><title>NSW Terms</title></head><body><script>evil()</script><p>Term 1 starts 27 January 2026.</p></body></html>';
  const result = await executeClareWork('fetch_url', { url: 'https://education.nsw.gov.au/terms' }, {
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      url: 'https://education.nsw.gov.au/terms',
      arrayBuffer: async () => Buffer.from(html)
    })
  });
  assert.equal(result.ok, true);
  assert.equal(result.live, true);
  assert.equal(result.title, 'NSW Terms');
  assert.match(result.text, /Term 1 starts 27 January 2026/);
  assert.ok(!result.text.includes('evil'));
});

test('fetch_url refuses localhost even if the model asks', async () => {
  const result = await executeClareWork('fetch_url', { url: 'http://localhost:8787/admin' }, {
    fetchImpl: async () => {
      throw new Error('should not fetch');
    }
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'blocked_host');
});

test('research_topic without URLs returns official AU sources; with URLs it cites fetched pages', async () => {
  const official = await executeClareWork('research_topic', {
    topic: 'NSW term dates',
    mode: 'official'
  });
  assert.equal(official.ok, true);
  assert.ok(official.official.some(item => /calendar|term/i.test(item.label)));
  assert.ok(official.official.every(item => item.url.startsWith('https://')));
  assert.ok(official.official.every(item => !/fairwork\.gov\.au|qcaa\.qld\.edu\.au/.test(item.url)));

  const sourced = await executeClareWork('research_topic', {
    topic: 'term dates',
    urls: ['https://education.nsw.gov.au/terms']
  }, {
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      url: 'https://education.nsw.gov.au/terms',
      arrayBuffer: async () => Buffer.from('<title>Terms</title><p>Term 2 begins 27 April.</p>')
    })
  });
  assert.equal(sourced.sources[0].live, true);
  assert.match(sourced.sources[0].excerpt, /Term 2 begins 27 April/);
});

test('lookup_au_dates returns 2026 NSW terms and holidays', () => {
  const result = lookupAuDates({ year: 2026, state: 'NSW', kind: 'both' });
  assert.equal(result.ok, true);
  assert.ok(result.school_terms.some(term => term.term === 1 && term.start === '2026-01-27'));
  assert.ok(result.holidays.some(day => day.date === '2026-04-25' && day.name === 'Anzac Day'));
  assert.ok(result.official.length >= 3);
});

test('lookup_place and compare_options use fetched pages', async () => {
  const html = '<title>Town Hall</title><p>Hours: 9am–5pm. Phone 02 9265 9333. info@city.nsw.gov.au</p>';
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    url: 'https://www.cityofsydney.nsw.gov.au/hall',
    arrayBuffer: async () => Buffer.from(html)
  });
  const place = await executeClareWork('lookup_place', {
    url: 'https://www.cityofsydney.nsw.gov.au/hall',
    name: 'Town Hall'
  }, { fetchImpl });
  assert.equal(place.ok, true);
  assert.ok(place.phones.length >= 1);
  const compared = await executeClareWork('compare_options', {
    question: 'Which hall?',
    urls: ['https://www.cityofsydney.nsw.gov.au/hall']
  }, { fetchImpl });
  assert.equal(compared.options[0].live, true);
});

test('inspect_board lists projects, stale, blocked, and duplicates', () => {
  assert.equal(inspectBoard('projects', { projects: PROJECTS }).count, 1);
  const stale = inspectBoard('stale', { tasks: TASKS });
  assert.equal(stale.results[0].id, 'task_mark');
  const blocked = inspectBoard('blocked', { tasks: TASKS });
  assert.ok(blocked.results.some(task => task.id === 'task_email'));
  const dupes = inspectBoard('duplicates', { tasks: TASKS });
  assert.equal(dupes.count, 1);
  assert.equal(dupes.results[0].length, 2);
});

test('plan_work detects teaching collisions and sequences short wins', () => {
  const collisions = planWork('collisions', { tasks: TASKS, lessons: LESSONS, date: '2026-09-06', now: NOW });
  assert.equal(collisions.lesson_count, 1);
  assert.equal(collisions.collisions[0].kind, 'teaching_and_tasks');
  const energy = planWork('energy', { tasks: TASKS, now: NOW });
  assert.ok(energy.sequence.some(task => task.short_win));
  const slots = planWork('free_slots', { tasks: TASKS, date: '2026-09-06', now: NOW });
  assert.ok(slots.slots.length >= 1);
});

test('parse_dump, desk protocol, clock, draft, and protocol read execute', async () => {
  const dump = await executeClareWork('parse_dump', { text: 'mark 10ENG and email the parent' }, {
    now: NOW,
    tasks: TASKS,
    projects: PROJECTS
  });
  assert.ok(dump.count >= 1);
  assert.ok(dump.items.every(item => item.title));

  const sweep = await executeClareWork('run_desk_protocol', { protocol_id: 'morning-sweep' }, {
    now: NOW,
    tasks: TASKS
  });
  assert.equal(sweep.briefing.protocol_id, 'morning-sweep');

  const clock = await executeClareWork('check_clock', { reason: 'planning' }, { now: NOW });
  assert.equal(clock.today, '2026-09-06');
  assert.equal(clock.timezone, 'Australia/Sydney');

  const draft = await executeClareWork('draft_comms', {
    task_id: 'task_email',
    audience: 'Sam',
    intent: 'Need the permission note back by Friday'
  }, { tasks: TASKS });
  assert.equal(draft.sent, false);
  assert.match(draft.draft, /Sam/);
  assert.match(draft.draft, /permission note/i);

  const protocol = await executeClareWork('read_protocol', {}, { protocol: '# Clare\n\nBe useful.' });
  assert.match(protocol.markdown, /Be useful/);
});

test('clare_mutate create/complete/reschedule return Confirm proposals on tasks:task paths', () => {
  resetCapabilityCaches();
  const created = buildClareMutation({
    op: 'create_task',
    title: 'Book the hall',
    domain: 'life',
    due_date: '2026-09-10'
  }, { nowIso: () => '2026-09-06T01:00:00.000Z' });
  assert.equal(created.kind, 'propose');
  assert.match(created.proposal.writes[0].path, /^tasks:task:task_/);
  const validated = validateProposeActionInput(created.proposal, { agentSlug: 'clare' });
  assert.equal(validated.ok, true);

  const done = buildClareMutation({ op: 'complete_task', task_id: 'task_mark' }, { tasks: TASKS, nowIso: () => '2026-09-06T01:00:00.000Z' });
  assert.equal(done.kind, 'propose');
  assert.match(done.proposal.writes[0].content, /"status": "done"/);

  const moved = buildClareMutation({
    op: 'reschedule_task',
    task_id: 'task_mark',
    due_date: '2026-09-12'
  }, { tasks: TASKS, nowIso: () => '2026-09-06T01:00:00.000Z' });
  assert.match(moved.proposal.writes[0].content, /2026-09-12/);
});

test('clare_mutate refuses unknown tasks and does not hardcode a fixture reply', async () => {
  const missing = await executeClareWork('clare_mutate', { op: 'complete_task', task_id: 'nope' }, { tasks: TASKS });
  assert.equal(missing.ok, false);
  assert.equal(missing.error, 'task_not_found');
});

test('update_protocol proposes an overwrite of the seed protocol path', async () => {
  resetCapabilityCaches();
  const result = await executeClareWork('update_protocol', {
    mode: 'append',
    markdown: 'Never invent due dates.',
    reason: 'sticky pref'
  }, { protocol: '# Clare\n\nSeed.' });
  assert.equal(result.kind, 'propose');
  assert.equal(result.proposal.writes[0].path, CLARE_PROTOCOL_PATH);
  const validated = validateProposeActionInput(result.proposal, { agentSlug: 'clare' });
  assert.equal(validated.ok, true);
  assert.match(result.proposal.writes[0].content, /Never invent due dates/);
});

test('executeProposeActionWrites creates a task blob and touches tasks/_index', async () => {
  const store = {
    data: new Map(),
    async setJSON(key, value) {
      this.data.set(key, value);
    },
    async get(key) {
      return this.data.get(key) ?? null;
    }
  };
  const created = buildClareMutation({
    op: 'create_task',
    title: 'Print permission notes',
    domain: 'teaching'
  }, { nowIso: () => '2026-09-06T01:00:00.000Z' });
  const write = created.proposal.writes[0];
  const applied = await executeProposeActionWrites({}, {
    agent: 'clare',
    intent: created.proposal.intent,
    writes: write
      ? [write]
      : []
  }, { blobStores: { tasks: store } });
  assert.equal(applied.ok, true);
  assert.ok(store.data.has(`tasks/${applied.results[0].id}`));
  assert.ok((store.data.get('tasks/_index') ?? []).includes(applied.results[0].id));
});

test('extract helpers stay boring', () => {
  const readable = extractReadableText('<h1>Hello</h1><script>x</script><p>World</p>');
  assert.equal(readable.text.includes('Hello'), true);
  assert.equal(readable.text.includes('x'), false);
  const facts = extractPlaceFacts('Call 02 9265 9333. Opening hours: 9am to 5pm weekdays.');
  assert.ok(facts.phones.length >= 1);
  const draft = formatClareDraft({ audience: 'Jordan', intent: 'Can we move Monday?' });
  assert.match(draft, /Jordan/);
  assert.match(draft, /Adam/);
});
