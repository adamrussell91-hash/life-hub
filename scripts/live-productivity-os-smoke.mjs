/**
 * Live Clare + Hammond productivity OS smoke.
 * Usage: node scripts/live-productivity-os-smoke.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSessionToken } from '../netlify/functions/_shared/auth-security.mjs';
import { createChatHandler } from '../netlify/functions/chat.mjs';

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

const handler = createChatHandler({
  env,
  fetchImpl: githubStub,
  getTasksStore: async () => memoryStore(TASKS),
  getTeachingStore: async () => memoryStore(TEACHING)
});

async function chat(slug, message) {
  const response = await handler(
    new Request('https://life-hub.test/api/chat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `life_hub_session=${session}`,
        origin: 'https://life-hub.test'
      },
      body: JSON.stringify({ message, priorAgentSlug: slug })
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
  const tools = events.filter((e) => e.type === 'tool_call').map((e) => e.name).filter(Boolean);
  const proposals = events.filter((e) => e.type === 'action_proposal').length;
  const error = events.find((e) => e.type === 'error') ?? null;
  return {
    status: response.status,
    agent,
    text: deltas,
    tools,
    proposals,
    error: error?.message || error?.text || null,
    eventTypes: [...new Set(events.map((e) => e.type))]
  };
}

const scenarios = [
  { id: 'clare-dump', slug: 'clare', message: 'Sort this brain dump: email the parent about homework; waiting on Acme for the quote; someday learn pottery; trash this random note' },
  { id: 'clare-health', slug: 'clare', message: 'What are my projects with no next action?' },
  { id: 'clare-waiting', slug: 'clare', message: 'What am I waiting on?' },
  { id: 'clare-fit', slug: 'clare', message: 'I have 25 minutes and low energy. What fits now?' },
  { id: 'clare-schedule', slug: 'clare', message: 'Plan tomorrow around my classes using protected evenings.' },
  { id: 'clare-runway', slug: 'clare', message: 'Marking is due Friday. Work backwards from the hard deadline.' },
  { id: 'clare-shutdown', slug: 'clare', message: 'Shut down my day.' },
  { id: 'hammond-too-much', slug: 'hammond', message: 'I am doing too much. Which projects should stay active given my limit of 3?' },
  { id: 'hammond-evenings', slug: 'hammond', message: 'Protect my evenings next week.' },
  { id: 'hammond-depth', slug: 'hammond', message: 'What is my deep work capacity next week?' },
  { id: 'hammond-mission', slug: 'hammond', message: 'What should Clare protect next week?' }
];

const lines = [];
function log(line) {
  lines.push(line);
  console.log(line);
}

let failed = 0;
for (const scenario of scenarios) {
  try {
    const result = await chat(scenario.slug, scenario.message);
    const ok =
      result.status === 200 &&
      result.agent === scenario.slug &&
      !result.error &&
      result.text.trim().length > 20;
    if (!ok) failed += 1;
    log(
      JSON.stringify({
        id: scenario.id,
        ok,
        status: result.status,
        agent: result.agent,
        tools: result.tools.slice(0, 10),
        proposals: result.proposals,
        error: result.error,
        excerpt: result.text.replace(/\s+/g, ' ').slice(0, 240)
      })
    );
  } catch (err) {
    failed += 1;
    log(JSON.stringify({ id: scenario.id, ok: false, error: String(err?.message || err) }));
  }
}

mkdirSync('/opt/cursor/artifacts', { recursive: true });
writeFileSync(OUT, `${lines.join('\n')}\nfailed=${failed}\n`, 'utf8');
log(`failed=${failed}`);
process.exit(failed ? 1 : 0);
