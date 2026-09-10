/**
 * Specialist expansion live harness — LOCAL HANDLER only.
 *
 * LIVE MODEL / LOCAL HANDLER ≠ LIVE MODEL / DEPLOYED ROUTE.
 * Deployed /api/chat remains the passed gate. This script never claims passed.
 *
 * Usage: node scripts/live-specialist-verify.mjs
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSessionToken } from '../netlify/functions/_shared/auth-security.mjs';
import { createChatHandler } from '../netlify/functions/chat.mjs';
import {
  buildPilotRuntime,
  collectPilotSecrets,
  loadApiKey,
  PILOT_ROUTE_MODE,
  sanitizePilotTrace
} from './live-pilot-verify.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_ROOT = process.env.LIFE_HUB_DATA_ROOT || '/agent/repos/life-hub-data';
const OUT_DIR = process.env.SPECIALIST_TRACE_DIR || '/tmp/life-hub-specialist-traces';

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
  for (const folder of ['fitness', 'body', 'nutrition', 'skincare', 'mind']) {
    const files = walkFiles(join(DATA_ROOT, 'data', folder))
      .filter(path => path.endsWith('.md') || path.endsWith('.json'))
      .sort()
      .slice(-120);
    for (const file of files) {
      add(relative(DATA_ROOT, file).replace(/\\/g, '/'), readFileSync(file, 'utf8'));
    }
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
    return Response.json({ message: 'not found' }, { status: 404 });
  };
}

async function readSse(response) {
  const text = await response.text();
  if (!text.trim()) return [];
  return text.trim().split('\n\n').map(frame => JSON.parse(frame.replace(/^data: /, '')));
}

function summarize(events) {
  const kernel = events.find(event => event.type === 'kernel_trace') ?? null;
  const text = events.filter(event => event.type === 'text').map(event => event.delta || '').join('');
  const error = events.find(event => event.type === 'error') ?? null;
  return {
    kernelTraces: events.filter(event => event.type === 'kernel_trace').length,
    workflow: kernel?.workflow ?? null,
    retrieveRounds: kernel?.retrieveRounds ?? null,
    sufficiencyDecision: kernel?.sufficiencyDecision ?? null,
    claimFacts: (kernel?.claims ?? []).map(c => c.fact).slice(0, 20),
    silentNullProvenance: (kernel?.claims ?? []).filter(c => c.provenance == null).length,
    answerPreview: String(text).slice(0, 500),
    error: error || null,
    limitationKinds: kernel?.limitationKinds ?? []
  };
}

const SCENARIOS = [
  { id: 'ann-today', agent: 'ann', message: 'what am I teaching today', needs: 'teaching' },
  { id: 'ann-next', agent: 'ann', message: 'what is next for this class', needs: 'teaching' },
  { id: 'ann-gaps', agent: 'ann', message: 'I only have 20 minutes for this lesson — what is missing', needs: 'teaching' },
  { id: 'clem-notes', agent: 'clementine', message: 'what do I already know about cognitive load', needs: 'knowledge' },
  { id: 'clem-themes', agent: 'clementine', message: 'what themes recur across my notes on memory', needs: 'knowledge' },
  { id: 'sara-weight', agent: 'sara', message: 'is my weight change unusual lately', needs: 'body' },
  { id: 'sara-history', agent: 'sara', message: 'any medical context I should know', needs: 'medical' },
  { id: 'sara-symptom', agent: 'sara', message: 'my stomach is flaring today — any medical context I should know', needs: 'body' },
  { id: 'brisket-eat', agent: 'brisket', message: 'how am I eating lately', needs: 'nutrition' },
  { id: 'chadwick-reg', agent: 'chadwick', message: 'How is my training going lately?', needs: 'fitness' }
];

async function main() {
  const apiKey = loadApiKey();
  const runtime = buildPilotRuntime(process.env, { apiKey });
  const { env } = runtime;
  const files = loadRepoFiles();
  const bodyCount = files.tree.filter(item => item.path.startsWith('data/body/')).length;
  const fitnessCount = files.tree.filter(item => item.path.startsWith('data/fitness/')).length;
  const nutritionCount = files.tree.filter(item => item.path.startsWith('data/nutrition/')).length;
  const report = {
    kind: PILOT_ROUTE_MODE.LOCAL_HANDLER,
    deployedRouteGate: 'blocked',
    deployedRouteReason: 'LIFE_HUB session/passphrase secret not available in this environment; POST /api/chat on deploy-preview-247 returns unauthenticated',
    deployPreviewUrl: 'https://deploy-preview-247--life-hub2.netlify.app',
    productionKernel: 'off',
    localStores: {
      bodyFiles: bodyCount,
      fitnessFiles: fitnessCount,
      nutritionFiles: nutritionCount,
      teaching: 'unbound',
      knowledge: 'unbound',
      tasks: 'unbound',
      medicalVisits: 'none in local life-hub-data body tree'
    },
    turns: []
  };

  if (!apiKey) {
    report.localHandlerGate = 'blocked';
    writeFileSync(join(OUT_DIR, 'specialist-local-report.json'), `${JSON.stringify(sanitizePilotTrace(report, env), null, 2)}\n`);
    console.log(JSON.stringify(sanitizePilotTrace(report, env), null, 2));
    process.exitCode = 2;
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const session = createSessionToken({
    now: Date.now(),
    randomBytes: () => Buffer.alloc(16, 13)
  }, env.SESSION_SECRET).token;
  const chat = createChatHandler({ env, fetchImpl: githubStub(files), now: () => Date.now() });

  for (const scenario of SCENARIOS) {
    const blockedNeeds = {
      teaching: true,
      knowledge: true,
      tasks: true,
      medical: true
    };
    if (blockedNeeds[scenario.needs]) {
      report.turns.push({
        id: scenario.id,
        agent: scenario.agent,
        status: 'not exercised',
        reason: `${scenario.needs} store unavailable in local handler`,
        userRequest: scenario.message
      });
      continue;
    }
    const started = Date.now();
    const response = await chat(new Request('https://life.example/api/chat', {
      method: 'POST',
      headers: {
        cookie: `life_hub_session=${session}`,
        'content-type': 'application/json',
        origin: 'https://life.example'
      },
      body: JSON.stringify({
        message: scenario.message,
        priorAgentSlug: scenario.agent,
        agentKernel: true
      })
    }));
    const events = await readSse(response);
    const summary = summarize(events);
    const turn = {
      id: scenario.id,
      agent: scenario.agent,
      category: PILOT_ROUTE_MODE.LOCAL_HANDLER,
      httpStatus: response.status,
      status: summary.error ? 'error' : (summary.kernelTraces ? 'exercised' : 'no_kernel_trace'),
      latencyMs: Date.now() - started,
      userRequest: scenario.message,
      ...summary
    };
    report.turns.push(turn);
    writeFileSync(
      join(OUT_DIR, `${scenario.id}.json`),
      `${JSON.stringify(sanitizePilotTrace({ turn, events: events.filter(e => ['kernel_trace', 'error', 'text', 'agent'].includes(e.type)).slice(0, 30) }, env), null, 2)}\n`
    );
  }

  report.secretsRedacted = collectPilotSecrets(env).length;
  writeFileSync(join(OUT_DIR, 'specialist-local-report.json'), `${JSON.stringify(sanitizePilotTrace(report, env), null, 2)}\n`);
  console.log(JSON.stringify(sanitizePilotTrace(report, env), null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
