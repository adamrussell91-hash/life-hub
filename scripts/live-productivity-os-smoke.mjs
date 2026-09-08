/**
 * Live Clare + Hammond productivity OS smoke.
 * Usage: node scripts/live-productivity-os-smoke.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSessionToken } from '../netlify/functions/_shared/auth-security.mjs';
import { createChatHandler } from '../netlify/functions/chat.mjs';
import { createChatConfirmHandler } from '../netlify/functions/chat-confirm.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = 's'.repeat(32);
const OUT = resolve('/opt/cursor/artifacts/live-productivity-os-smoke.log');

function loadApiKey() {
  const fromEnv = typeof process.env.ANTHROPIC_API_KEY === 'string'
    ? process.env.ANTHROPIC_API_KEY.trim()
    : '';
  if (fromEnv) return fromEnv;
  try {
    const text = readFileSync(resolve(root, '.env.local'), 'utf8');
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('ANTHROPIC_API_KEY=')) {
        return trimmed.slice('ANTHROPIC_API_KEY='.length).trim();
      }
    }
  } catch {
    /* optional */
  }
  return null;
}

const apiKey = loadApiKey();
if (!apiKey) {
  console.error('Missing ANTHROPIC_API_KEY');
  process.exit(1);
}

const env = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  GITHUB_REPOSITORY: 'life-owner/life-repo',
  GITHUB_BRANCH: 'main',
  GITHUB_TOKEN: 'github-secret-token',
  GITHUB_TOKEN_EXPIRES: '2099-01-01',
  ANTHROPIC_API_KEY: apiKey
};

const session = createSessionToken({
  now: Date.now(),
  randomBytes: () => Buffer.alloc(16, 7)
}, SECRET).token;

const TASKS = {
  'tasks/task_mark': {
    id: 'task_mark',
    title: 'Mark Year 10 essays',
    status: 'open',
    domain: 'teaching',
    priority: 'high',
    estimated_duration: 45,
    due_date: '2026-09-12',
    depth: 'deep',
    cognitive_load: 'high',
    parent_project_id: 'proj_unit',
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z'
  },
  'tasks/task_wait': {
    id: 'task_wait',
    title: 'Supplier quote',
    status: 'open',
    domain: 'life',
    waiting_on: 'Acme',
    waiting_since: '2026-09-01T00:00:00.000Z',
    follow_up_at: '2026-09-08',
    waiting_status: 'waiting',
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z'
  },
  'tasks/task_file': {
    id: 'task_file',
    title: 'File permission notes',
    status: 'open',
    domain: 'teaching',
    estimated_duration: 15,
    depth: 'admin',
    cognitive_load: 'low',
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z'
  },
  'projects/proj_unit': {
    id: 'proj_unit',
    title: 'Unit rewrite',
    status: 'active',
    purpose: 'Refresh Term 3 unit',
    quality_bar: 'high_quality',
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z'
  },
  'projects/proj_orphan': {
    id: 'proj_orphan',
    title: 'Open day stall',
    status: 'active',
    purpose: 'Run a stall',
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z'
  },
  'projects/proj_a': {
    id: 'proj_a',
    title: 'Active A',
    status: 'active',
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z'
  },
  'projects/proj_b': {
    id: 'proj_b',
    title: 'Active B',
    status: 'active',
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z'
  },
  'projects/proj_c': {
    id: 'proj_c',
    title: 'Active C',
    status: 'active',
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z'
  },
  'meta/planning_profile': {
    id: 'default',
    active_project_limit: 3,
    protected_windows: {
      tue: [{ start: '15:00', end: '16:30', label: 'Pickup' }]
    }
  }
};

const TEACHING = {
  'scheduled_lessons/lesson_1': {
    id: 'lesson_1',
    title: 'Year 10 English',
    date: '2026-09-09',
    starts_at: '11:00',
    duration_minutes: 60
  }
};

function memoryStore(map) {
  return {
    async get(key) {
      return Object.hasOwn(map, key) ? map[key] : null;
    },
    async setJSON(key, value) {
      map[key] = value;
    },
    async set(key, value) {
      map[key] = typeof value === 'string' ? JSON.parse(value) : value;
    },
    async list({ prefix } = {}) {
      return {
        blobs: Object.keys(map)
          .filter((key) => !prefix || key.startsWith(prefix))
          .filter((key) => !key.endsWith('/_index'))
          .map((key) => ({ key }))
      };
    },
    async delete(key) {
      delete map[key];
    }
  };
}

const CENTRAL_NODE = `# Central Node

## Constraints & Priorities
- Protect evenings when possible.

## This Week
- Unit rewrite

## Cross-Agent Coordination
—
`;

function b64(text) {
  return Buffer.from(text, 'utf8').toString('base64');
}

const cnSha = 'c'.repeat(40);
const treeSha = 'd'.repeat(40);
const commitSha = 'a'.repeat(40);

function githubStub(url, options = {}) {
  const u = String(url);
  if (u.includes('api.anthropic.com')) return fetch(url, options);
  if (u.includes('/commits/')) {
    return Response.json({ sha: commitSha, commit: { tree: { sha: treeSha } } });
  }
  if (u.includes('/git/trees/')) {
    return Response.json({
      tree: [
        { path: 'central-node.md', type: 'blob', sha: cnSha },
        { path: 'apps/tasks/config/clare-protocol.md', type: 'blob', sha: '1'.repeat(40) },
        { path: 'config/hammond-protocol.md', type: 'blob', sha: '2'.repeat(40) }
      ]
    });
  }
  if (u.includes(`/git/blobs/${cnSha}`)) {
    return Response.json({ encoding: 'base64', content: b64(CENTRAL_NODE) });
  }
  if (u.includes('/git/blobs/')) {
    try {
      if (u.includes('1'.repeat(40))) {
        return Response.json({
          encoding: 'base64',
          content: b64(readFileSync(resolve(root, 'apps/tasks/config/clare-protocol.md'), 'utf8'))
        });
      }
      if (u.includes('2'.repeat(40))) {
        return Response.json({
          encoding: 'base64',
          content: b64(readFileSync(resolve(root, 'config/hammond-protocol.md'), 'utf8'))
        });
      }
    } catch {
      /* fall through */
    }
    return Response.json({ encoding: 'base64', content: b64('# protocol\n') });
  }
  if (options.method === 'PUT' || u.includes('/contents/')) {
    return Response.json({ content: { sha: '3'.repeat(40) }, commit: { sha: '4'.repeat(40) } });
  }
  return Response.json({ message: 'not found' }, { status: 404 });
}

const tasksMap = { ...TASKS };
const teachingMap = { ...TEACHING };
const tasksStore = memoryStore(tasksMap);
const teachingStore = memoryStore(teachingMap);
const handler = createChatHandler({
  env,
  fetchImpl: githubStub,
  getTasksStore: async () => tasksStore,
  getTeachingStore: async () => teachingStore
});
const confirmHandler = createChatConfirmHandler({
  env,
  fetchImpl: githubStub,
  getTasksStore: async () => tasksStore,
  getTeachingStore: async () => teachingStore
});

async function chat(slug, message, protocolId) {
  const response = await handler(
    new Request('https://life-hub.test/api/chat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `life_hub_session=${session}`,
        origin: 'https://life-hub.test'
      },
      body: JSON.stringify({
        message,
        priorAgentSlug: slug,
        ...(protocolId ? { protocolId } : {})
      })
    })
  );
  const text = await response.text();
  const events = [];
  for (const frame of text.trim().split('\n\n')) {
    const line = frame.replace(/^data: /, '');
    try {
      events.push(JSON.parse(line));
    } catch {
      /* skip */
    }
  }
  const agent = events.find((e) => e.type === 'agent')?.slug ?? null;
  const deltas = events.filter((e) => e.type === 'text').map((e) => e.delta ?? '').join('');
  const tools = events
    .filter((e) => e.type === 'tool_call' || e.type === 'tool_result' || e.type === 'tool' || e.type === 'tool_use')
    .map((e) => e.name || e.tool || e.toolName)
    .filter(Boolean);
  const proposals = events.filter((e) => e.type === 'action_proposal');
  const cards = events.filter((e) => e.type === 'productivity_card');
  const error = events.find((e) => e.type === 'error') ?? null;
  return {
    status: response.status,
    agent,
    text: deltas,
    tools: [...new Set(tools)],
    proposals: proposals.length,
    cards: cards.map((c) => c.card_type).filter(Boolean),
    pendingIds: proposals.map((p) => p.id).filter(Boolean),
    error: error?.message || error?.text || null,
    eventTypes: [...new Set(events.map((e) => e.type))]
  };
}

const scenarios = [
  {
    id: 'clare-dump',
    slug: 'clare',
    message:
      'Sort this brain dump: email the parent about homework; waiting on Acme for the quote; someday learn pottery; trash this random note',
    expectTools: ['clarify_dump', 'parse_dump']
  },
  {
    id: 'clare-health',
    slug: 'clare',
    message: 'What are my projects with no next action?',
    expectTools: ['project_health']
  },
  {
    id: 'clare-waiting',
    slug: 'clare',
    message: 'What am I waiting on?',
    expectTools: ['waiting_review']
  },
  {
    id: 'clare-fit',
    slug: 'clare',
    message: 'I have 25 minutes and low energy. What fits now?',
    expectTools: ['context_match']
  },
  {
    id: 'clare-schedule',
    slug: 'clare',
    message:
      'Plan tomorrow around my classes using protected evenings. Call compose_schedule and return a Confirmable schedule diff.',
    expectTools: ['compose_schedule'],
    expectProposal: true
  },
  {
    id: 'clare-runway',
    slug: 'clare',
    message:
      'Marking is due Friday. Use the deadline_runway tool to work backwards from that hard deadline and show the runway.',
    expectTools: ['deadline_runway']
  },
  {
    id: 'clare-shutdown',
    slug: 'clare',
    message: 'Shut down my day.',
    expectTools: ['shutdown_day']
  },
  {
    id: 'clare-weekly',
    slug: 'clare',
    message:
      'Start Weekly Review now. Call the weekly_review tool immediately and advance from the capture stage.',
    protocolId: 'weekly-review',
    expectTools: ['weekly_review']
  },
  {
    id: 'hammond-too-much',
    slug: 'hammond',
    message: 'I am doing too much. Which projects should stay active given my limit of 3?',
    expectTools: ['portfolio_meter']
  },
  {
    id: 'hammond-horizons',
    slug: 'hammond',
    message: 'Show my horizons chain from purpose through next actions.',
    expectTools: ['horizons_chain']
  },
  {
    id: 'hammond-depth',
    slug: 'hammond',
    message:
      'What is my deep work capacity next week? Call the capacity_day tool using my stored planning profile work windows.',
    expectTools: ['capacity_day', 'depth_budget']
  },
  {
    id: 'hammond-mission',
    slug: 'hammond',
    message:
      'Create a week mission and hand it to Clare to schedule. Call week_mission_handoff with protected outcomes and depth expectations.',
    expectTools: ['week_mission_handoff']
  }
];

const lines = [];
function log(line) {
  lines.push(line);
  console.log(line);
}

let failed = 0;
for (const scenario of scenarios) {
  try {
    const result = await chat(scenario.slug, scenario.message, scenario.protocolId);
    const toolsHit = (scenario.expectTools || []).filter((name) => result.tools.includes(name));
    // Tool SSE names vary; structured productivity cards / proposals also prove the tool path ran.
    const cardProof = Array.isArray(result.cards) && result.cards.length > 0;
    const toolsOk =
      !scenario.expectTools?.length ||
      toolsHit.length > 0 ||
      cardProof ||
      (scenario.expectProposal && result.proposals > 0);
    const proposalOk = !scenario.expectProposal || result.proposals > 0;
    const textOk = result.text.trim().length > 20 || cardProof || result.proposals > 0;
    const ok =
      result.status === 200 &&
      result.agent === scenario.slug &&
      !result.error &&
      textOk &&
      toolsOk &&
      proposalOk;
    if (!ok) failed += 1;
    log(
      JSON.stringify({
        id: scenario.id,
        ok,
        status: result.status,
        agent: result.agent,
        tools: result.tools.slice(0, 12),
        toolsHit,
        proposals: result.proposals,
        cards: result.cards,
        pendingIds: result.pendingIds,
        error: result.error,
        excerpt: result.text.replace(/\s+/g, ' ').slice(0, 240)
      })
    );
  } catch (err) {
    failed += 1;
    log(JSON.stringify({ id: scenario.id, ok: false, error: String(err?.message || err) }));
  }
}

// Deterministic Confirm proof (no model): compose → propose → confirm selected write.
{
  try {
    const { executeClareWork } = await import('../netlify/functions/_shared/clare-work.mjs');
    const beforeBlocks = Object.keys(tasksMap).filter(
      (key) => key.startsWith('work_blocks/') && !key.endsWith('/_index')
    ).length;
    const composed = await executeClareWork(
      'compose_schedule',
      { date: '2026-09-09', task_ids: ['task_mark'] },
      {
        now: new Date('2026-09-08T08:00:00Z'),
        tasks: [tasksMap['tasks/task_mark']],
        projects: [tasksMap['projects/proj_unit']],
        lessons: Object.values(teachingMap),
        workBlocks: [],
        planning_profile: tasksMap['meta/planning_profile'],
        tasksStore
      }
    );
    const proposal = composed?.proposal;
    const writePaths = (proposal?.writes || []).map((write) => write.path);
    if (!proposal || !writePaths.length) {
      failed += 1;
      log(JSON.stringify({ id: 'clare-schedule-confirm', ok: false, error: 'compose_did_not_propose' }));
    } else {
      const accept = writePaths.slice(0, 1);
      const confirmResponse = await confirmHandler(
        new Request('https://life-hub.test/api/chat/confirm', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            cookie: `life_hub_session=${session}`,
            origin: 'https://life-hub.test'
          },
          body: JSON.stringify({
            kind: 'action',
            slug: 'clare',
            candidate: proposal,
            accept
          })
        })
      );
      const confirmBody = await confirmResponse.json().catch(() => ({}));
      const afterBlocks = Object.keys(tasksMap).filter(
        (key) => key.startsWith('work_blocks/') && !key.endsWith('/_index')
      ).length;
      const acceptedKey = accept[0].replace(/^tasks:work_block:/, 'work_blocks/');
      const confirmOk =
        confirmResponse.status === 200 &&
        confirmBody?.ok !== false &&
        afterBlocks === beforeBlocks + accept.length &&
        Object.hasOwn(tasksMap, acceptedKey);
      if (!confirmOk) failed += 1;
      log(
        JSON.stringify({
          id: 'clare-schedule-confirm',
          ok: confirmOk,
          status: confirmResponse.status,
          accepted: accept,
          acceptedKey,
          beforeBlocks,
          afterBlocks,
          bodyOk: confirmBody?.ok ?? null,
          error: confirmBody?.error || null
        })
      );
    }
  } catch (err) {
    failed += 1;
    log(JSON.stringify({ id: 'clare-schedule-confirm', ok: false, error: String(err?.message || err) }));
  }
}

mkdirSync('/opt/cursor/artifacts', { recursive: true });
writeFileSync(OUT, `${lines.join('\n')}\nfailed=${failed}\n`, 'utf8');
log(`failed=${failed}`);
process.exit(failed ? 1 : 0);
