/**
 * Live Anthropic smoke for agent protocols.
 * Loads ANTHROPIC_API_KEY from the environment or .env.local; GitHub is stubbed.
 * Usage: node scripts/live-agent-protocol-smoke.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSessionToken } from '../netlify/functions/_shared/auth-security.mjs';
import { createChatHandler } from '../netlify/functions/chat.mjs';

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
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      if (trimmed.startsWith('ANTHROPIC_API_KEY=')) return trimmed.slice('ANTHROPIC_API_KEY='.length).trim();
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

const session = createSessionToken({
  now: Date.now(),
  randomBytes: () => Buffer.alloc(16, 7)
}, SECRET).token;

const FOOD_LIBRARY = JSON.stringify([
  {
    name: "Domino's Meatlovers Pizza (1 slice)",
    serving: '1 slice',
    calories: 250,
    protein_g: 12,
    fat_g: 12,
    sodium_mg: 620,
    verified_at: '2026-07-01'
  },
  {
    name: 'YoPro High Protein Yoghurt (160g)',
    serving: '160g tub',
    calories: 96,
    protein_g: 15,
    fat_g: 0.4,
    sodium_mg: 55,
    verified_at: '2026-07-01'
  }
], null, 2);

const CENTRAL_NODE = `# Central Node

## Constraints & Priorities
- Crohn's / IBD: flare protocol often active; fat ceiling 50 g/day when flared.
- No seafood.
- Protein target ~120 g/day (140 g post-workout).

## Today's Status (Friday 7 August 2026)
Nutrition so far: breakfast yoghurt logged. Protein ~15 g. Fat low.
Exercise: none yet.
Flags: —

## Cross-Agent Coordination
—

## Recent Agent Actions
- Brisket: YoPro breakfast — on track.
`;

const foodSha = 'f'.repeat(40);
const cnSha = 'c'.repeat(40);
const treeSha = 'd'.repeat(40);
const commitSha = 'a'.repeat(40);

function b64(text) {
  return Buffer.from(text, 'utf8').toString('base64');
}

function githubStub(url, options = {}) {
  const u = String(url);
  if (u.includes('api.anthropic.com')) {
    return fetch(url, options);
  }
  if (u.includes('/commits/')) {
    return Response.json({ sha: commitSha, commit: { tree: { sha: treeSha } } });
  }
  if (u.includes('/git/trees/')) {
    return Response.json({
      tree: [
        { path: 'central-node.md', type: 'blob', sha: cnSha },
        { path: 'data/food-library.json', type: 'blob', sha: foodSha },
        { path: 'data/exercise-library.json', type: 'blob', sha: 'e'.repeat(40) }
      ]
    });
  }
  if (u.includes(`/git/blobs/${cnSha}`)) {
    return Response.json({ encoding: 'base64', content: b64(CENTRAL_NODE) });
  }
  if (u.includes(`/git/blobs/${foodSha}`)) {
    return Response.json({ encoding: 'base64', content: b64(FOOD_LIBRARY) });
  }
  if (u.includes('/git/blobs/')) {
    return Response.json({ encoding: 'base64', content: b64('[]') });
  }
  if (options.method === 'PUT' || u.includes('/contents/')) {
    return Response.json({
      content: { sha: '1'.repeat(40) },
      commit: { sha: '2'.repeat(40) }
    });
  }
  return Response.json({ message: 'not found' }, { status: 404 });
}

async function readSse(response) {
  const text = await response.text();
  if (!text.trim()) return [];
  return text.trim().split('\n\n').map(frame => {
    const line = frame.replace(/^data: /, '');
    try {
      return JSON.parse(line);
    } catch {
      return { type: 'parse_error', raw: line.slice(0, 200) };
    }
  });
}

function summarize(events) {
  const agent = events.find(e => e.type === 'agent')?.slug ?? null;
  const statuses = events.filter(e => e.type === 'status').map(e => e.text);
  const text = events.filter(e => e.type === 'text').map(e => e.delta).join('');
  const proposal = events.find(e => e.type === 'record_proposal') ?? null;
  const rejected = events.find(e => e.type === 'record_rejected') ?? null;
  const error = events.find(e => e.type === 'error') ?? null;
  const done = events.some(e => e.type === 'done');
  const searches = events.filter(e => e.type === 'search').map(e => e.query);
  return { agent, statuses, text, proposal, rejected, error, done, searches, eventTypes: events.map(e => e.type) };
}

const CASES = [
  {
    id: 'brisket-meal-library',
    protocol: 'brisket',
    message: "Brisket, log dinner — two slices of Domino's Meatlovers pizza",
    expectAgent: 'brisket',
    requireProposalType: 'meal',
    requireSodium: true
  },
  {
    id: 'brisket-unknown-food',
    protocol: 'brisket',
    message: 'Brisket, lunch was a chicken Caesar wrap from the cafe downstairs — please log it',
    expectAgent: 'brisket',
    requireProposalType: 'meal',
    requireSodium: true
  },
  {
    id: 'brisket-flare-coach',
    protocol: 'brisket',
    message: 'Brisket, flare is active and I am thinking about bacon and a Musashi bar for a snack — what should I do?',
    expectAgent: 'brisket',
    requireText: true
  },
  {
    id: 'brisket-weekend-out',
    protocol: 'brisket',
    message: 'Brisket, weekend no Vyvanse — going to Nomad for dinner, any ordering tips?',
    expectAgent: 'brisket',
    requireText: true
  },
  {
    id: 'brisket-correction',
    protocol: 'brisket',
    message: 'actually make that one slice not two',
    priorAgentSlug: 'brisket',
    history: [
      { role: 'user', content: "Brisket, log dinner — two slices of Domino's Meatlovers pizza" },
      { role: 'assistant', content: 'Logging those two slices for dinner, buddy.' }
    ],
    expectAgent: 'brisket',
    requireProposalType: 'meal',
    requireSodium: true
  },
  {
    id: 'chadwick-workout',
    protocol: 'chadwick',
    message: 'Chadwick, log a completed 30 min strength session: squat 3x8 @ 60kg, bench 3x8 @ 50kg',
    expectAgent: 'chadwick',
    requireProposalType: 'workout'
  },
  {
    id: 'hyaluronica',
    protocol: 'hyaluronica',
    message: 'Hyaluronica, my T-zone is oily and cheeks are dry — what should I change tonight?',
    expectAgent: 'hyaluronica',
    requireText: true
  },
  {
    id: 'penelope',
    protocol: 'penelope',
    message: 'Penelope, help me jot a short diary note about feeling restless after work',
    expectAgent: 'penelope',
    requireText: true
  },
  {
    id: 'vera',
    protocol: 'vera',
    message: 'Vera, I keep doomscrolling when work is uncertain — sit with that with me for a minute',
    expectAgent: 'vera',
    requireText: true
  },
  {
    id: 'sara',
    protocol: 'sara',
    message: 'Sara, weight this morning was 84.2 kg — anything to note given Crohn\'s and Vyvanse?',
    expectAgent: 'sara',
    requireText: true
  },
  {
    id: 'hammond',
    protocol: 'hammond',
    message: 'Hammond, give me a clear objective for the rest of today across training and food',
    expectAgent: 'hammond',
    requireText: true
  }
];

function evaluate(caseDef, summary) {
  const failures = [];
  if (summary.error) failures.push(`error:${summary.error.code ?? 'unknown'}`);
  if (summary.agent !== caseDef.expectAgent) {
    failures.push(`agent=${summary.agent} expected ${caseDef.expectAgent}`);
  }
  if (!summary.done && !summary.error) failures.push('missing done');
  if (caseDef.requireText && !summary.text.trim()) failures.push('empty text');
  if (caseDef.requireProposalType) {
    if (!summary.proposal) failures.push('missing record_proposal');
    else if (summary.proposal.record?.type !== caseDef.requireProposalType) {
      failures.push(`proposal type=${summary.proposal.record?.type}`);
    }
  }
  if (caseDef.requireSodium && summary.proposal) {
    const sodium = summary.proposal.record?.sodium_mg;
    if (typeof sodium !== 'number' || !(sodium >= 0)) failures.push('missing sodium_mg');
  }
  if (summary.rejected) failures.push(`record_rejected:${JSON.stringify(summary.rejected.errors ?? [])}`);
  // Empty-stream failure mode from production
  if (!summary.text.trim() && !summary.proposal && !summary.error) {
    failures.push('empty stream (no text, no proposal)');
  }
  return failures;
}

const handler = createChatHandler({
  env,
  now: () => Date.now(),
  fetchImpl: githubStub
});

const results = [];
console.log(`Running ${CASES.length} live protocol smokes against Anthropic…\n`);

for (const caseDef of CASES) {
  const started = Date.now();
  process.stdout.write(`→ ${caseDef.id} (${caseDef.protocol})… `);
  try {
    const body = {
      message: caseDef.message,
      ...(caseDef.priorAgentSlug ? { priorAgentSlug: caseDef.priorAgentSlug } : {}),
      ...(caseDef.history ? { history: caseDef.history } : {})
    };
    const response = await handler(new Request('https://life.example/api/chat', {
      method: 'POST',
      headers: {
        cookie: `life_hub_session=${session}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    }));
    const events = await readSse(response);
    const summary = summarize(events);
    const failures = response.status === 200
      ? evaluate(caseDef, summary)
      : [`http ${response.status}`];
    const ms = Date.now() - started;
    const ok = failures.length === 0;
    console.log(ok ? `PASS (${ms}ms)` : `FAIL (${ms}ms)`);
    if (!ok) console.log(`   failures: ${failures.join('; ')}`);
    console.log(`   agent=${summary.agent} textChars=${summary.text.length} proposal=${summary.proposal?.record?.type ?? '—'} sodium=${summary.proposal?.record?.sodium_mg ?? '—'} searches=${summary.searches.length} statuses=${summary.statuses.length}`);
    if (summary.text) console.log(`   text: ${summary.text.slice(0, 160).replace(/\s+/g, ' ')}${summary.text.length > 160 ? '…' : ''}`);
    results.push({ id: caseDef.id, protocol: caseDef.protocol, ok, failures, ms, summary });
  } catch (error) {
    const ms = Date.now() - started;
    console.log(`FAIL (${ms}ms)`);
    console.log(`   exception: ${error.message}`);
    results.push({ id: caseDef.id, protocol: caseDef.protocol, ok: false, failures: [error.message], ms });
  }
}

const protocols = [...new Set(results.map(r => r.protocol))];
const passed = results.filter(r => r.ok);
const failed = results.filter(r => !r.ok);

console.log('\n=== Summary ===');
console.log(`protocols covered: ${protocols.join(', ')} (${protocols.length})`);
console.log(`cases: ${passed.length}/${results.length} passed`);
for (const r of failed) {
  console.log(`FAIL ${r.id}: ${r.failures.join('; ')}`);
}

process.exit(failed.length ? 1 : 0);
