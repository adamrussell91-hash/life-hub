/**
 * Live Clare / Chadwick pilot harness.
 *
 * Two live-model modes, never mixed:
 *   LIVE MODEL / LOCAL HANDLER  — createChatHandler in-process (optional GitHub stub)
 *   LIVE MODEL / DEPLOYED ROUTE — the user-facing deployed /api/chat network request
 *
 * This script is LOCAL HANDLER only. A live Anthropic key here does not satisfy
 * the strict user-facing deployed-route gate.
 *
 * DETERMINISTIC TEST results are produced by node:test suites, not this script.
 * If ANTHROPIC_API_KEY is missing, it reports blocked and does not invent a pass.
 *
 * Usage: node scripts/live-pilot-verify.mjs
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createSessionToken } from '../netlify/functions/_shared/auth-security.mjs';
import { createChatHandler } from '../netlify/functions/chat.mjs';
import { createChatConfirmHandler } from '../netlify/functions/chat-confirm.mjs';
import { defaultGetTasksStore, listJSON as listTasksJSON, TASK_PREFIX } from '../netlify/functions/_shared/tasks-blobs.mjs';
import {
  defaultGetContentStore as defaultGetTeachingStore,
  listJSON as listTeachingJSON,
  DRAFT_LESSON_PREFIX,
  SCHEDULED_LESSON_PREFIX
} from '../netlify/functions/_shared/teaching-blobs.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_ROOT = process.env.LIFE_HUB_DATA_ROOT || '/agent/repos/life-hub-data';
const OUT_DIR = process.env.PILOT_TRACE_DIR || '/tmp/life-hub-pilot-traces';
const LOCAL_SESSION_FALLBACK = 's'.repeat(32);
const LOCAL_PASSPHRASE_FALLBACK = 'configured';
const SECRET_REDACT_MIN_LENGTH = 16;

export const PILOT_ROUTE_MODE = Object.freeze({
  LOCAL_HANDLER: 'LIVE MODEL / LOCAL HANDLER',
  DEPLOYED_ROUTE: 'LIVE MODEL / DEPLOYED ROUTE'
});

export const LOCAL_GITHUB_STUB = Object.freeze({
  GITHUB_REPOSITORY: 'life-owner/life-repo',
  GITHUB_BRANCH: 'main',
  GITHUB_TOKEN: 'github-secret-token',
  GITHUB_TOKEN_EXPIRES: '2099-01-01'
});

/** Bounded keys copied from the harness environment into createChatHandler. */
export const PILOT_RUNTIME_ENV_KEYS = Object.freeze([
  'ANTHROPIC_API_KEY',
  'LIFE_HUB_PASSPHRASE_HASH',
  'SESSION_SECRET',
  'SITE_ORIGIN',
  'LIFE_HUB_AGENT_KERNEL',
  'GITHUB_REPOSITORY',
  'GITHUB_BRANCH',
  'GITHUB_TOKEN',
  'GITHUB_TOKEN_EXPIRES',
  'KNOWLEDGE_GITHUB_REPOSITORY',
  'TASKS_BLOBS_SITE_ID',
  'TEACHING_BLOBS_SITE_ID',
  'NETLIFY_BLOBS_TOKEN',
  'NETLIFY_BLOBS_CONTEXT',
  'NETLIFY_SITE_ID'
]);

export const PILOT_SECRET_ENV_KEYS = Object.freeze([
  'ANTHROPIC_API_KEY',
  'SESSION_SECRET',
  'LIFE_HUB_PASSPHRASE_HASH',
  'GITHUB_TOKEN',
  'NETLIFY_BLOBS_TOKEN',
  'NETLIFY_BLOBS_CONTEXT'
]);

const RUBRIC = Object.freeze({
  trajectory: [
    'correct_agent_workflow',
    'right_source_categories',
    'retrieved_again_if_needed',
    'no_irrelevant_retrieve',
    'respected_conflicts',
    'respected_confirm_boundary',
    'no_write_before_confirm',
    'used_resumed_state_after_confirm'
  ],
  answer: [
    'factual_grounding',
    'usefulness',
    'completeness',
    'uncertainty_handling',
    'no_invented_facts',
    'consistent_with_evidence',
    'appropriate_brevity',
    'acknowledged_missing_evidence',
    'correct_action_status'
  ],
  scale: '0-2 per criterion. 0 = fail, 1 = partial, 2 = meets. Do not retune after seeing results.'
});

function copyDefinedEnv(source, keys) {
  const env = {};
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === 'string' && value.length > 0) env[key] = value;
  }
  return env;
}

function hasCompleteGitHub(env) {
  return Boolean(
    env.GITHUB_REPOSITORY
    && env.GITHUB_BRANCH
    && env.GITHUB_TOKEN
    && env.GITHUB_TOKEN_EXPIRES
  );
}

export function buildPilotRuntime(source = process.env, options = {}) {
  const forwarded = copyDefinedEnv(source, PILOT_RUNTIME_ENV_KEYS);
  const env = { ...forwarded };
  if (typeof options.apiKey === 'string' && options.apiKey && !env.ANTHROPIC_API_KEY) {
    env.ANTHROPIC_API_KEY = options.apiKey;
  }
  if (!env.LIFE_HUB_PASSPHRASE_HASH) env.LIFE_HUB_PASSPHRASE_HASH = LOCAL_PASSPHRASE_FALLBACK;
  if (!env.SESSION_SECRET) env.SESSION_SECRET = LOCAL_SESSION_FALLBACK;
  const githubBinding = hasCompleteGitHub(forwarded) ? 'runtime' : 'local-stub';
  if (githubBinding === 'local-stub') Object.assign(env, LOCAL_GITHUB_STUB);
  return {
    env,
    githubBinding,
    routeMode: PILOT_ROUTE_MODE.LOCAL_HANDLER,
    forwardedKeys: Object.keys(forwarded).sort()
  };
}

export function buildPilotRuntimeEnv(source = process.env, options = {}) {
  return buildPilotRuntime(source, options).env;
}

export function collectPilotSecrets(env = {}) {
  const secrets = [];
  for (const key of PILOT_SECRET_ENV_KEYS) {
    const value = env[key];
    if (typeof value === 'string' && value.length >= SECRET_REDACT_MIN_LENGTH) secrets.push(value);
  }
  return secrets;
}

function redactString(text, secrets) {
  let out = text;
  for (const secret of secrets) {
    out = out.split(secret).join('[redacted]');
  }
  return out;
}

export function sanitizePilotTrace(value, env) {
  const secrets = collectPilotSecrets(env);
  if (secrets.length === 0) return value;
  return JSON.parse(redactString(JSON.stringify(value), secrets));
}

export function loadApiKey() {
  const fromEnv = typeof process.env.ANTHROPIC_API_KEY === 'string'
    ? process.env.ANTHROPIC_API_KEY.trim()
    : '';
  if (fromEnv) return fromEnv;
  try {
    const text = readFileSync(join(root, '.env.local'), 'utf8');
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      if (trimmed.startsWith('ANTHROPIC_API_KEY=')) {
        return trimmed.slice('ANTHROPIC_API_KEY='.length).trim();
      }
    }
  } catch {
    // optional
  }
  return '';
}

function shaFor(path, content) {
  return createHash('sha1').update(`${path}\n${content}`).digest('hex');
}

function walkFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(path, acc);
    else if (entry.isFile()) acc.push(path);
  }
  return acc;
}

function loadRepoFiles() {
  const blobs = new Map();
  const tree = [];
  const add = (repoPath, content) => {
    const sha = shaFor(repoPath, content);
    blobs.set(sha, content);
    tree.push({ path: repoPath, type: 'blob', sha, size: content.length });
  };
  const dataDir = join(DATA_ROOT, 'data');
  const fitnessDir = join(dataDir, 'fitness');
  const fitnessFiles = walkFiles(fitnessDir)
    .filter(path => path.endsWith('.md'))
    .sort()
    .slice(-80);
  for (const file of fitnessFiles) {
    add(relative(DATA_ROOT, file).replace(/\\/g, '/'), readFileSync(file, 'utf8'));
  }
  for (const extra of ['central-node.md', 'data/exercise-library.json', 'data/food-library.json']) {
    const file = join(DATA_ROOT, extra);
    if (existsSync(file)) add(extra, readFileSync(file, 'utf8'));
  }
  return { blobs, tree };
}

function githubStub(files) {
  const blobs = new Map(files.blobs);
  const tree = files.tree.map(item => ({ ...item }));
  return async (url, options = {}) => {
    const href = String(url);
    if (href.includes('api.anthropic.com')) return fetch(url, options);
    if (href.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (href.includes('/git/trees/')) return Response.json({ tree, truncated: false });
    const blobMatch = /\/git\/blobs\/([0-9a-f]{40})/.exec(href);
    if (blobMatch) {
      const content = blobs.get(blobMatch[1]);
      if (content == null) return Response.json({ message: 'not found' }, { status: 404 });
      return Response.json({
        encoding: 'base64',
        content: Buffer.from(content, 'utf8').toString('base64')
      });
    }
    if (options.method === 'PUT' && href.includes('/contents/')) {
      const body = JSON.parse(options.body);
      const path = decodeURIComponent(href.split('/contents/')[1] ?? '');
      const content = Buffer.from(body.content, 'base64').toString('utf8');
      const sha = shaFor(`${path}:${Date.now()}`, content);
      blobs.set(sha, content);
      const existing = tree.find(item => item.path === path);
      if (existing) existing.sha = sha;
      else tree.push({ path, type: 'blob', sha, size: content.length });
      return Response.json({ content: { sha }, commit: { sha: 'e'.repeat(40) } });
    }
    return Response.json({ message: 'not found' }, { status: 404 });
  };
}

function boundToolArgs(input) {
  if (!input || typeof input !== 'object') return input ?? null;
  const out = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string') out[key] = value.slice(0, 120);
    else if (typeof value === 'number' || typeof value === 'boolean') out[key] = value;
    else if (Array.isArray(value)) out[key] = { count: value.length };
    else if (value && typeof value === 'object') out[key] = { keys: Object.keys(value).slice(0, 8) };
  }
  return out;
}

function summarizeEvents(events) {
  const kernel = events.find(event => event.type === 'kernel_trace') ?? null;
  const tools = events.filter(event => event.type === 'tool_call').map(event => ({
    name: event.name,
    args: boundToolArgs(event.input)
  }));
  const usageEvents = events.filter(event => event.type === 'usage');
  const lastUsage = usageEvents.at(-1) ?? null;
  return {
    agent: events.find(event => event.type === 'agent')?.slug ?? null,
    kernelEnabled: Boolean(kernel),
    workflow: kernel?.workflow ?? null,
    turnId: kernel?.turnId ?? null,
    retrieveRounds: kernel?.retrieveRounds ?? 0,
    requiredSources: kernel?.requiredSources ?? [],
    tools: [...new Set([...(kernel?.tools ?? []), ...tools.map(item => item.name)])],
    toolCalls: tools,
    sourceRefs: kernel?.claims?.map(claim => claim.provenance).filter(Boolean).slice(0, 12) ?? [],
    coverage: {
      limitations: kernel?.limitations ?? [],
      conflicts: kernel?.conflicts ?? [],
      unresolvedConflicts: kernel?.unresolvedConflicts ?? []
    },
    claims: (kernel?.claims ?? []).slice(0, 16),
    confirmation: events.find(event => event.type === 'action_proposal')
      ? { proposed: true, id: events.find(event => event.type === 'action_proposal')?.id ?? null }
      : null,
    finalAnswer: events.filter(event => event.type === 'text').map(event => event.delta).join(''),
    usage: lastUsage,
    errors: events.filter(event => event.type === 'error')
  };
}

async function readSse(response) {
  const text = await response.text();
  if (!text.trim()) return [];
  return text.trim().split('\n\n').map(frame => JSON.parse(frame.replace(/^data: /, '')));
}

export async function probeStores(env, {
  getTasksStore = defaultGetTasksStore,
  getTeachingStore = defaultGetTeachingStore
} = {}) {
  if (!env || typeof env !== 'object') {
    throw new Error('probeStores requires the same env object passed to createChatHandler.');
  }
  const stores = {
    fitness: { available: false, count: 0 },
    tasks: { available: false, count: 0 },
    projects: { available: false, count: 0 },
    teaching: { available: false, count: 0 },
    pain: { available: false, count: 0 }
  };
  const fitnessDir = join(DATA_ROOT, 'data/fitness');
  if (existsSync(fitnessDir)) {
    const files = walkFiles(fitnessDir).filter(path => path.endsWith('.md'));
    stores.fitness = { available: files.length > 0, count: files.length, source: 'life-hub-data files' };
    let pain = 0;
    for (const file of files.slice(-40)) {
      const text = readFileSync(file, 'utf8');
      if (/pain_flags:\s*\n\s+-\s+/m.test(text) || /pain_flags: \[[^\]\s]/.test(text)) pain += 1;
    }
    stores.pain = { available: pain > 0, count: pain, source: 'life-hub-data fitness files' };
  }
  try {
    const tasks = await listTasksJSON(await getTasksStore(env), TASK_PREFIX);
    stores.tasks = { available: tasks.length > 0, count: tasks.length, source: 'tasks blobs' };
  } catch (error) {
    stores.tasks = { available: false, count: 0, error: error?.code || 'unavailable' };
  }
  try {
    const store = await getTeachingStore(env);
    const lessons = [
      ...await listTeachingJSON(store, DRAFT_LESSON_PREFIX),
      ...await listTeachingJSON(store, SCHEDULED_LESSON_PREFIX)
    ];
    stores.teaching = { available: lessons.length > 0, count: lessons.length, source: 'teaching blobs' };
  } catch (error) {
    stores.teaching = { available: false, count: 0, error: error?.code || 'unavailable' };
  }
  return stores;
}

function emptyScore(kind) {
  return Object.fromEntries((RUBRIC[kind] ?? []).map(key => [key, null]));
}

function writeJson(path, value, env) {
  writeFileSync(path, `${JSON.stringify(sanitizePilotTrace(value, env), null, 2)}\n`);
}

async function main() {
  const apiKey = loadApiKey();
  const runtime = buildPilotRuntime(process.env, { apiKey });
  const { env } = runtime;
  const stores = await probeStores(env);
  const report = {
    kind: PILOT_ROUTE_MODE.LOCAL_HANDLER,
    routeMode: runtime.routeMode,
    deployedRouteGate: 'blocked',
    localHandlerGate: apiKey ? 'ready' : 'blocked',
    githubBinding: runtime.githubBinding,
    forwardedEnvKeys: runtime.forwardedKeys,
    model: apiKey ? 'claude-sonnet-5' : null,
    rubric: RUBRIC,
    stores,
    turns: [],
    note: apiKey
      ? 'LIVE MODEL / LOCAL HANDLER: in-process createChatHandler with a live Anthropic key. This is not a deployed /api/chat network request. Only LIVE MODEL / DEPLOYED ROUTE satisfies the strict user-facing route gate.'
      : 'ANTHROPIC_API_KEY missing from the environment and .env.local. Local-handler live model remains blocked. The deployed-route gate stays blocked. Deterministic suites are a separate category.'
  };

  if (!apiKey) {
    console.log(JSON.stringify(sanitizePilotTrace(report, env), null, 2));
    process.exitCode = 2;
    return;
  }

  const files = loadRepoFiles();
  const session = createSessionToken({
    now: Date.now(),
    randomBytes: () => Buffer.alloc(16, 11)
  }, env.SESSION_SECRET).token;
  const fetchImpl = githubStub(files);
  const chat = createChatHandler({ env, fetchImpl, now: () => Date.now() });
  const confirm = createChatConfirmHandler({ env, fetchImpl, now: () => Date.now() });

  const scenarios = [
    { id: 'clare-a', agent: 'clare', message: 'What should I focus on today?', needs: 'tasks' },
    { id: 'clare-b', agent: 'clare', message: "I've only got about 90 minutes of proper work capacity left today. What should I do?", needs: 'tasks' },
    { id: 'clare-c', agent: 'clare', message: 'My energy is low today. Reorder what I should tackle.', needs: 'tasks' },
    { id: 'clare-d', agent: 'clare', message: 'Plan around any lessons or fixed commitments today.', needs: 'teaching' },
    { id: 'clare-e', agent: 'clare', message: 'What should I focus on today if I do not know how long the work will take?', needs: 'tasks' },
    { id: 'clare-f', agent: 'clare', message: 'Add a research note titled Pilot confirm continuation — do not invent a task duration.', needs: 'tasks', write: true },
    { id: 'chadwick-a', agent: 'chadwick', message: 'How is my training going lately?', needs: 'fitness' },
    { id: 'chadwick-b', agent: 'chadwick', message: 'Am I ready to progress my programme?', needs: 'fitness' },
    { id: 'chadwick-c', agent: 'chadwick', message: 'I have a pain flag that should change today. What should I modify?', needs: 'pain' },
    { id: 'chadwick-d', agent: 'chadwick', message: "I can't do bench press today. What should I substitute?", needs: 'fitness' },
    { id: 'chadwick-e', agent: 'chadwick', message: 'Do any of my recent sessions disagree with each other?', needs: 'fitness' },
    { id: 'chadwick-f', agent: 'chadwick', message: 'Is the loaded history enough to progress, or is something missing?', needs: 'fitness' }
  ];

  mkdirSync(OUT_DIR, { recursive: true });

  for (const scenario of scenarios) {
    const store = stores[scenario.needs];
    if (!store?.available) {
      report.turns.push({
        id: scenario.id,
        category: PILOT_ROUTE_MODE.LOCAL_HANDLER,
        status: 'not exercised',
        reason: `${scenario.needs} store unavailable`,
        userRequest: scenario.message,
        trajectory: emptyScore('trajectory'),
        answer: emptyScore('answer')
      });
      continue;
    }
    const started = Date.now();
    const response = await chat(new Request('https://life.example/api/chat', {
      method: 'POST',
      headers: {
        cookie: `life_hub_session=${session}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        message: scenario.message,
        priorAgentSlug: scenario.agent,
        agentKernel: true
      })
    }));
    const events = await readSse(response);
    const summary = summarizeEvents(events);
    let confirmResult = null;
    if (scenario.write && summary.confirmation?.id) {
      const confirmed = await confirm(new Request('https://life.example/api/chat/confirm', {
        method: 'POST',
        headers: {
          cookie: `life_hub_session=${session}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          kind: 'action',
          slug: scenario.agent,
          id: summary.confirmation.id
        })
      }));
      confirmResult = await confirmed.json();
    }
    const trace = sanitizePilotTrace({
      category: PILOT_ROUTE_MODE.LOCAL_HANDLER,
      routeMode: PILOT_ROUTE_MODE.LOCAL_HANDLER,
      deployedRoute: false,
      scenario: scenario.id,
      surface: 'life',
      userRequest: scenario.message,
      route: 'local createChatHandler (not deployed /api/chat)',
      latencyMs: Date.now() - started,
      ...summary,
      confirm: confirmResult ? {
        status: confirmResult?.data?.continuation?.status ?? null,
        invoked: confirmResult?.data?.continuation?.invoked ?? false,
        text: confirmResult?.data?.continuation?.text ?? '',
        turnResumed: confirmResult?.data?.turnResumed === true
      } : null
    }, env);
    const tracePath = join(OUT_DIR, `${scenario.id}.json`);
    writeJson(tracePath, trace, env);
    report.turns.push({
      id: scenario.id,
      category: PILOT_ROUTE_MODE.LOCAL_HANDLER,
      status: summary.errors.length ? 'fail' : 'recorded',
      userRequest: scenario.message,
      route: 'local createChatHandler (not deployed /api/chat)',
      workflow: summary.workflow,
      sources: summary.requiredSources,
      retrieveRounds: summary.retrieveRounds,
      finalAnswer: summary.finalAnswer,
      latencyMs: trace.latencyMs,
      usage: summary.usage,
      trace: relative(root, tracePath),
      trajectory: emptyScore('trajectory'),
      answer: emptyScore('answer')
    });
  }

  writeJson(join(OUT_DIR, 'report.json'), report, env);
  console.log(JSON.stringify(sanitizePilotTrace({
    category: PILOT_ROUTE_MODE.LOCAL_HANDLER,
    routeMode: report.routeMode,
    deployedRouteGate: report.deployedRouteGate,
    localHandlerGate: report.localHandlerGate,
    forwardedEnvKeys: report.forwardedEnvKeys,
    turns: report.turns.map(item => ({
      id: item.id,
      status: item.status,
      workflow: item.workflow,
      trace: item.trace ?? null
    }))
  }, env), null, 2));
}

function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(resolve(entry)).href;
}

if (isMainModule()) {
  await main();
}
