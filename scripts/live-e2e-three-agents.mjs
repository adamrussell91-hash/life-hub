/**
 * End-to-end live check: Brisket → Chadwick → Hammond.
 * Chat (real Anthropic) through Confirm (mocked GitHub writes) where applicable.
 * Usage: node scripts/live-e2e-three-agents.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSessionToken } from '../netlify/functions/_shared/auth-security.mjs';
import { createChatHandler } from '../netlify/functions/chat.mjs';
import { createChatConfirmHandler } from '../netlify/functions/chat-confirm.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = 's'.repeat(32);

function loadApiKey() {
  const fromEnv = typeof process.env.ANTHROPIC_API_KEY === 'string'
    ? process.env.ANTHROPIC_API_KEY.trim()
    : '';
  if (fromEnv) return fromEnv;
  try {
    const text = readFileSync(resolve(root, '.env.local'), 'utf8');
    for (const line of text.split('\n')) {
      if (line.startsWith('ANTHROPIC_API_KEY=')) return line.slice('ANTHROPIC_API_KEY='.length).trim();
    }
  } catch {
    // .env.local is optional when the Cloud Agent environment already has the secret
  }
  return null;
}

const apiKey = loadApiKey();
if (!apiKey) {
  console.error('Missing ANTHROPIC_API_KEY in the environment or .env.local');
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

const nowMs = Date.now();
const session = createSessionToken({
  now: nowMs,
  randomBytes: () => Buffer.alloc(16, 9)
}, SECRET).token;

const FOOD_LIBRARY = JSON.stringify([
  {
    name: "Coles Roast Chicken Breast (100g)",
    serving: '100g',
    calories: 165,
    protein_g: 31,
    fat_g: 3.6,
    sodium_mg: 280,
    verified_at: '2026-07-01'
  }
], null, 2);

const CENTRAL_NODE = `# Central Node

## Constraints & Priorities
- Crohn's / IBD awareness; fat ceiling 50 g/day when flared.
- No seafood.
- Protein target ~120 g/day.

## Today's Status (Friday 7 August 2026)
Nutrition: light so far.
Exercise: none yet.
Flags: —

## Cross-Agent Coordination
—

## Recent Agent Actions
—
`;

const foodSha = 'f'.repeat(40);
const cnSha = 'c'.repeat(40);
const treeSha = 'd'.repeat(40);
const commitSha = 'a'.repeat(40);
const b64 = text => Buffer.from(text, 'utf8').toString('base64');

/** Mutable repo mirror for write verification */
const writes = [];
let writeCounter = 0;
const blobs = new Map([
  [cnSha, CENTRAL_NODE],
  [foodSha, FOOD_LIBRARY],
  ['e'.repeat(40), '[]']
]);
let tree = [
  { path: 'central-node.md', type: 'blob', sha: cnSha },
  { path: 'data/food-library.json', type: 'blob', sha: foodSha },
  { path: 'data/exercise-library.json', type: 'blob', sha: 'e'.repeat(40) }
];

function githubStub(url, options = {}) {
  const u = String(url);
  if (u.includes('api.anthropic.com')) return fetch(url, options);

  if (u.includes('/commits/')) {
    return Response.json({ sha: commitSha, commit: { tree: { sha: treeSha } } });
  }
  if (u.includes('/git/trees/')) {
    return Response.json({ tree, truncated: false });
  }
  const blobMatch = u.match(/\/git\/blobs\/([0-9a-f]{40})/);
  if (blobMatch) {
    const sha = blobMatch[1];
    const content = blobs.get(sha);
    if (content == null) return Response.json({ message: 'not found' }, { status: 404 });
    return Response.json({ encoding: 'base64', content: b64(content) });
  }
  if (options.method === 'PUT' && u.includes('/contents/')) {
    const body = JSON.parse(options.body);
    const path = decodeURIComponent(u.split('/contents/')[1]);
    const content = Buffer.from(body.content, 'base64').toString('utf8');
    writeCounter += 1;
    const newSha = writeCounter.toString(16).padStart(40, '0');
    const newCommit = (writeCounter + 1000).toString(16).padStart(40, '0');
    blobs.set(newSha, content);
    const existing = tree.find(entry => entry.path === path);
    if (existing) existing.sha = newSha;
    else tree.push({ path, type: 'blob', sha: newSha });
    writes.push({ path, content, message: body.message, sha: body.sha ?? null });
    return Response.json({
      content: { sha: newSha },
      commit: { sha: newCommit }
    });
  }
  return Response.json({ message: 'not found' }, { status: 404 });
}

async function readSse(response) {
  const text = await response.text();
  if (!text.trim()) return [];
  return text.trim().split('\n\n').map(frame => JSON.parse(frame.replace(/^data: /, '')));
}

function summarizeChat(events) {
  return {
    agent: events.find(e => e.type === 'agent')?.slug ?? null,
    statuses: events.filter(e => e.type === 'status').map(e => e.text),
    text: events.filter(e => e.type === 'text').map(e => e.delta).join(''),
    proposal: events.find(e => e.type === 'record_proposal') ?? null,
    rejected: events.find(e => e.type === 'record_rejected') ?? null,
    error: events.find(e => e.type === 'error') ?? null,
    done: events.some(e => e.type === 'done'),
    searches: events.filter(e => e.type === 'search').map(e => e.query),
    foodSaved: events.filter(e => e.type === 'food_library_saved').map(e => e.name),
    types: events.map(e => e.type)
  };
}

function toCandidate(record) {
  const { schema_version, id, created_at, updated_at, source, type, date, time, notes, ...fields } = record;
  return { type, date, ...(time ? { time } : {}), ...(notes ? { notes } : {}), fields };
}

function slugFromPath(path) {
  return path.split('/').at(-1).replace(/\.md$/, '').split('-').slice(3).join('-');
}

const chat = createChatHandler({ env, now: () => Date.now(), fetchImpl: githubStub });
const confirm = createChatConfirmHandler({ env, now: () => Date.now(), fetchImpl: githubStub });

async function runChat(message) {
  const response = await chat(new Request('https://life.example/api/chat', {
    method: 'POST',
    headers: {
      cookie: `life_hub_session=${session}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ message })
  }));
  const events = await readSse(response);
  return { status: response.status, ...summarizeChat(events) };
}

async function runConfirm(proposal) {
  const candidate = toCandidate(proposal.record);
  const slug = slugFromPath(proposal.path);
  const response = await confirm(new Request('https://life.example/api/chat/confirm', {
    method: 'POST',
    headers: {
      cookie: `life_hub_session=${session}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ candidate, slug, overwrite: false })
  }));
  const payload = await response.json();
  return { status: response.status, payload, slug, candidate };
}

const failures = [];
function check(label, ok, detail = '') {
  if (ok) console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`);
  else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
    failures.push(`${label}: ${detail || 'failed'}`);
  }
}

console.log('=== E2E live: Brisket → Chadwick → Hammond ===\n');

// ─── 1. Brisket: chat → Confirm ─────────────────────────────────────────────
console.log('1) BRISKET — meal log through Confirm');
{
  const beforeWrites = writes.length;
  const turn = await runChat(
    'Brisket, log lunch — 150g Coles roast chicken breast with white rice'
  );
  check('HTTP 200', turn.status === 200, `status=${turn.status}`);
  check('agent brisket', turn.agent === 'brisket', `got ${turn.agent}`);
  check('status heartbeats', turn.statuses.length >= 2, turn.statuses.join(' | '));
  check('assistant text', turn.text.trim().length > 40, `${turn.text.length} chars`);
  check('no stream error', !turn.error, turn.error ? turn.error.code : 'clean');
  check('stream done', turn.done);
  check('meal proposal', turn.proposal?.record?.type === 'meal', turn.proposal?.record?.type ?? 'none');
  check('sodium present', typeof turn.proposal?.record?.sodium_mg === 'number',
    `sodium_mg=${turn.proposal?.record?.sodium_mg}`);
  check('proposal path', typeof turn.proposal?.path === 'string' && turn.proposal.path.includes('nutrition'),
    turn.proposal?.path ?? 'none');

  if (turn.proposal) {
    const conf = await runConfirm(turn.proposal);
    check('confirm HTTP 200', conf.status === 200, `status=${conf.status}`);
    check('confirm ok', conf.payload?.ok === true);
    check('confirm path', conf.payload?.data?.path === turn.proposal.path,
      conf.payload?.data?.path ?? 'none');
    check('confirm sha', typeof conf.payload?.data?.sha === 'string');
    const newWrites = writes.slice(beforeWrites);
    check('wrote meal file', newWrites.some(w => w.path === turn.proposal.path),
      newWrites.map(w => w.path).join(', ') || 'no writes');
    check('wrote central node', newWrites.some(w => w.path === 'central-node.md'),
      `centralNodeUpdated=${conf.payload?.data?.centralNodeUpdated}`);
    const mealWrite = newWrites.find(w => w.path === turn.proposal.path);
    if (mealWrite) {
      check('meal markdown has frontmatter', mealWrite.content.startsWith('---\n'));
      check('meal type in file', mealWrite.content.includes('type: "meal"') || mealWrite.content.includes("type: 'meal'") || /type:\s*"meal"/.test(mealWrite.content) || /type: "meal"/.test(mealWrite.content) || mealWrite.content.includes('type: "meal"') || /"meal"/.test(mealWrite.content));
      // frontmatter uses JSON.stringify so type: "meal"
      check('meal content includes type meal', /type:\s*"meal"/.test(mealWrite.content));
      check('meal content includes sodium', /sodium_mg/.test(mealWrite.content));
    }
    console.log(`   text: ${turn.text.slice(0, 140).replace(/\s+/g, ' ')}…`);
    console.log(`   notes: ${turn.proposal.notes ?? turn.proposal.record?.notes ?? '—'}`);
  } else {
    failures.push('brisket: missing proposal — cannot confirm');
  }
}

console.log('\n2) CHADWICK — workout log through Confirm');
{
  const beforeWrites = writes.length;
  const turn = await runChat(
    'Chadwick, log a completed 35 min strength session titled Push Pump: incline DB press 3x10 @ 22kg, cable row 3x12 @ 30kg'
  );
  check('HTTP 200', turn.status === 200, `status=${turn.status}`);
  check('agent chadwick', turn.agent === 'chadwick', `got ${turn.agent}`);
  check('status heartbeats', turn.statuses.length >= 2, turn.statuses.join(' | '));
  check('assistant text', turn.text.trim().length > 20, `${turn.text.length} chars`);
  check('no stream error', !turn.error, turn.error ? turn.error.code : 'clean');
  check('stream done', turn.done);
  check('workout proposal', turn.proposal?.record?.type === 'workout', turn.proposal?.record?.type ?? 'none');
  check('proposal path', typeof turn.proposal?.path === 'string' && turn.proposal.path.includes('fitness'),
    turn.proposal?.path ?? 'none');

  if (turn.proposal) {
    const conf = await runConfirm(turn.proposal);
    check('confirm HTTP 200', conf.status === 200, `status=${conf.status} body=${JSON.stringify(conf.payload).slice(0, 200)}`);
    check('confirm ok', conf.payload?.ok === true);
    check('confirm path', conf.payload?.data?.path === turn.proposal.path,
      conf.payload?.data?.path ?? 'none');
    const newWrites = writes.slice(beforeWrites);
    check('wrote workout file', newWrites.some(w => w.path === turn.proposal.path),
      newWrites.map(w => w.path).join(', ') || 'no writes');
    const planned = String(turn.proposal.path).includes('workout-planned')
      || turn.proposal.record?.status === 'planned';
    if (planned) {
      check('planned workout leaves central node alone',
        !newWrites.some(w => w.path === 'central-node.md'),
        newWrites.map(w => w.path).join(', '));
    } else {
      check('wrote central node or template',
        newWrites.some(w => w.path === 'central-node.md') || newWrites.some(w => w.path.includes('templates')),
        newWrites.map(w => w.path).join(', '));
    }
    check('centralNodeUpdated reported', conf.payload?.data?.centralNodeUpdated === true
      || conf.payload?.data?.centralNodeUpdated === false,
      `centralNodeUpdated=${conf.payload?.data?.centralNodeUpdated}`);
    console.log(`   text: ${turn.text.slice(0, 140).replace(/\s+/g, ' ')}…`);
    console.log(`   title: ${turn.proposal.record?.title ?? '—'}`);
  } else {
    failures.push('chadwick: missing proposal — cannot confirm');
  }
}

console.log('\n3) HAMMOND — full protocol turn (no record confirm)');
{
  const turn = await runChat(
    'Hammond, after that lunch and push session, give me the mission objective for the rest of today — food, recovery, and one non-negotiable.'
  );
  check('HTTP 200', turn.status === 200, `status=${turn.status}`);
  check('agent hammond', turn.agent === 'hammond', `got ${turn.agent}`);
  check('status heartbeats', turn.statuses.length >= 2, turn.statuses.join(' | '));
  check('assistant text', turn.text.trim().length > 80, `${turn.text.length} chars`);
  check('no stream error', !turn.error, turn.error ? turn.error.code : 'clean');
  check('stream done', turn.done);
  check('no accidental proposal', !turn.proposal, turn.proposal?.record?.type ?? 'none');
  check('no record rejection', !turn.rejected);
  // Protocol voice / framing signals (light, not brittle)
  const lower = turn.text.toLowerCase();
  check('mission framing present',
    /objective|mission|execute|alright|walk me through|non-negotiable|recovery|protein|food/.test(lower),
    'expected Hammond ops language');
  console.log(`   text: ${turn.text.slice(0, 220).replace(/\s+/g, ' ')}…`);
}

console.log('\n=== Writes observed ===');
for (const w of writes) {
  console.log(`- ${w.path} (${w.message})`);
}

console.log('\n=== Result ===');
if (failures.length === 0) {
  console.log('PASS — Brisket + Chadwick confirmed end-to-end; Hammond completed cleanly.');
  process.exit(0);
}
console.log(`FAIL — ${failures.length} check(s):`);
for (const f of failures) console.log(`  - ${f}`);
process.exit(1);
