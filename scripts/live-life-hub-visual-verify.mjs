#!/usr/bin/env node
/**
 * Life Hub end-to-end live visual intelligence verification.
 *
 * Runs through createChatHandler (real Anthropic + real Brisket path), not a
 * direct vision smoke call.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... node scripts/live-life-hub-visual-verify.mjs
 *
 * Without a key, prints exactly:
 *   LIVE LIFE HUB VISUAL VERIFICATION BLOCKED: ANTHROPIC_API_KEY unavailable.
 * and exits 0 (does not fail CI).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSessionToken } from '../netlify/functions/_shared/auth-security.mjs';
import { createChatHandler } from '../netlify/functions/chat.mjs';
import {
  listHasMeaningfulVisualEvidence,
  normalizeVisualEvidenceList
} from '../packages/design-kit/js/hub-visual-evidence.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = 's'.repeat(32);
const BLOCKED = 'LIVE LIFE HUB VISUAL VERIFICATION BLOCKED: ANTHROPIC_API_KEY unavailable.';

function loadApiKey() {
  const fromEnv = typeof process.env.ANTHROPIC_API_KEY === 'string'
    ? process.env.ANTHROPIC_API_KEY.trim()
    : '';
  if (fromEnv) return fromEnv;
  try {
    const text = readFileSync(resolve(root, '.env.local'), 'utf8');
    for (const line of text.split('\n')) {
      if (line.startsWith('ANTHROPIC_API_KEY=')) {
        return line.slice('ANTHROPIC_API_KEY='.length).trim();
      }
    }
  } catch {
    // optional
  }
  return null;
}

const apiKey = loadApiKey();
if (!apiKey) {
  console.log(BLOCKED);
  process.exit(0);
}

const expected = JSON.parse(
  readFileSync(resolve(root, 'tests/fixtures/vision/nutrition-label.expected.json'), 'utf8')
);
const labelPng = readFileSync(resolve(root, 'tests/fixtures/vision/nutrition-label.png'));
const scenePng = readFileSync(resolve(root, 'tests/fixtures/vision/scene-shapes.png'));

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

const CENTRAL_NODE = `# Central Node

## Constraints & Priorities
- Crohn's / IBD awareness; fat ceiling 50 g/day when flared.
- No seafood.
- Protein target ~120 g/day.

## Today's Status
Nutrition: light so far.
Exercise: none yet.
Flags: —

## Cross-Agent Coordination
—
`;

const FOOD_LIBRARY = JSON.stringify([
  {
    name: 'Test Chicken Pasta',
    serving: '400g',
    calories: 514,
    protein_g: 42,
    fat_g: 14.5,
    carbs_g: 55,
    sodium_mg: 780,
    verified_at: '2026-07-01'
  }
], null, 2);

const foodSha = 'f'.repeat(40);
const cnSha = 'c'.repeat(40);
const treeSha = 'd'.repeat(40);
const commitSha = 'a'.repeat(40);
const b64 = (text) => Buffer.from(text, 'utf8').toString('base64');
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
    blobs.set(newSha, content);
    const existing = tree.find((entry) => entry.path === path);
    if (existing) existing.sha = newSha;
    else tree.push({ path, type: 'blob', sha: newSha });
    writes.push({ path, content, message: body.message });
    return Response.json({
      content: { sha: newSha },
      commit: { sha: (writeCounter + 1000).toString(16).padStart(40, '0') }
    });
  }
  return Response.json({ message: 'not found' }, { status: 404 });
}

async function readSse(response) {
  const text = await response.text();
  if (!text.trim()) return [];
  return text.trim().split('\n\n').map((frame) => JSON.parse(frame.replace(/^data: /, '')));
}

function summarize(events) {
  const visualEvidenceEvents = events.filter((event) => event.type === 'visual_evidence');
  const statusVisual = events
    .filter((event) => event.type === 'status' && event.visual)
    .map((event) => event.visual);
  return {
    agent: events.find((event) => event.type === 'agent')?.slug ?? null,
    statuses: events.filter((event) => event.type === 'status').map((event) => event.text),
    text: events.filter((event) => event.type === 'text').map((event) => event.delta).join(''),
    proposal: events.find((event) => event.type === 'record_proposal') ?? null,
    error: events.find((event) => event.type === 'error') ?? null,
    done: events.some((event) => event.type === 'done'),
    visualEvidence: normalizeVisualEvidenceList(
      visualEvidenceEvents.at(-1)?.items
      ?? statusVisual.find((row) => listHasMeaningfulVisualEvidence(row.visualEvidence || []))?.visualEvidence
      ?? []
    ),
    captureSources: statusVisual.map((row) => row.captureSource).filter(Boolean),
    types: events.map((event) => event.type),
    raw: events
  };
}

function imageAttachment(id, buf, name) {
  return {
    id,
    kind: 'image',
    mime: 'image/png',
    name,
    dataUrl: `data:image/png;base64,${buf.toString('base64')}`
  };
}

const chat = createChatHandler({ env, now: () => Date.now(), fetchImpl: githubStub });

async function runChat({ message, attachments = [], history = [], priorAgentSlug = 'brisket' }) {
  const response = await chat(new Request('https://life.example/api/chat', {
    method: 'POST',
    headers: {
      cookie: `life_hub_session=${session}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      message,
      attachments,
      history,
      priorAgentSlug
    })
  }));
  const events = await readSse(response);
  return { status: response.status, ...summarize(events) };
}

const failures = [];
function check(label, ok, detail = '') {
  if (ok) console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`);
  else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
    failures.push(`${label}: ${detail || 'failed'}`);
  }
}

function evidenceBlob(items) {
  return JSON.stringify(items || []).toLowerCase();
}

console.log('=== LIVE LIFE HUB VISUAL VERIFICATION ===\n');

const labelAttachment = imageAttachment('att_label', labelPng, 'nutrition-label.png');

console.log('Turn 1 — Brisket + nutrition label fixture');
const turn1 = await runChat({
  message: 'Here is my lunch.',
  attachments: [labelAttachment],
  priorAgentSlug: 'brisket'
});

check('HTTP 200', turn1.status === 200, `status=${turn1.status}`);
check('agent brisket', turn1.agent === 'brisket', `got ${turn1.agent}`);
check('no stream error', !turn1.error, turn1.error ? JSON.stringify(turn1.error).slice(0, 200) : 'clean');
check('assistant text', turn1.text.trim().length > 20, `${turn1.text.length} chars`);
check('meaningful visual evidence captured', listHasMeaningfulVisualEvidence(turn1.visualEvidence),
  `items=${turn1.visualEvidence.length}`);
check('evidence linked to attachment id', turn1.visualEvidence.some((item) => item.attachmentId === 'att_label'));
check('no base64 in evidence', !/base64,[a-z0-9+/=]{40,}/i.test(JSON.stringify(turn1.visualEvidence)));

const blob1 = evidenceBlob(turn1.visualEvidence);
check('protein 42 present', /42/.test(blob1) && /protein/.test(blob1));
check('fat 14.5 present', /14\.5/.test(blob1) && /fat/.test(blob1));
check('carbohydrate 55 present', /55/.test(blob1) && /carb/.test(blob1));
check('sodium 780 present', /780/.test(blob1) && /sodium/.test(blob1));
check('serving 400 present', /400/.test(blob1));
check('direct_visual provenance present', /direct_visual/.test(blob1));

const captureSource = turn1.captureSources.at(-1) || null;
console.log(`  captureSource: ${captureSource || 'unknown'}`);
console.log(`  extracted evidence: ${JSON.stringify(turn1.visualEvidence, null, 2).slice(0, 1200)}`);
console.log(`  assistant: ${turn1.text.slice(0, 240).replace(/\s+/g, ' ')}…`);

const history = [
  {
    role: 'user',
    content: 'Here is my lunch.',
    visualEvidence: turn1.visualEvidence
  },
  {
    role: 'assistant',
    content: turn1.text
  }
];

console.log('\nTurn 2 — terse follow-up using retained evidence only');
const turn2 = await runChat({
  message: 'Yep. Log it.',
  attachments: [],
  history,
  priorAgentSlug: 'brisket'
});

check('HTTP 200', turn2.status === 200, `status=${turn2.status}`);
check('agent brisket', turn2.agent === 'brisket', `got ${turn2.agent}`);
check('no stream error', !turn2.error, turn2.error ? JSON.stringify(turn2.error).slice(0, 200) : 'clean');
check('assistant text', turn2.text.trim().length > 10, `${turn2.text.length} chars`);
check('record proposal / Confirm path', Boolean(turn2.proposal), turn2.proposal?.record?.type ?? 'none');
check('no direct write bypass', writes.length === 0, `writes=${writes.length}`);

if (turn2.proposal?.record) {
  const recordJson = JSON.stringify(turn2.proposal.record).toLowerCase();
  console.log(`  log_entry / proposal payload: ${JSON.stringify(turn2.proposal.record, null, 2).slice(0, 1200)}`);
  check('proposal protein 42', /42/.test(recordJson));
  check('proposal fat 14.5', /14\.5/.test(recordJson) || /14\.50/.test(recordJson));
  check('proposal carbs 55', /55/.test(recordJson));
  check('proposal sodium 780', /780/.test(recordJson));
  check('proposal awaiting confirm', turn2.types.includes('record_proposal') || turn2.proposal);
} else {
  failures.push('turn2: missing record proposal — cannot verify Confirm path');
}

console.log('\nScene image — non-text visual understanding via Life Hub path');
const sceneAttachment = imageAttachment('att_scene', scenePng, 'scene-shapes.png');
const sceneTurn = await runChat({
  message: 'What shapes and colours do you see?',
  attachments: [sceneAttachment],
  priorAgentSlug: 'brisket'
});
check('scene HTTP 200', sceneTurn.status === 200);
check('scene no error', !sceneTurn.error);
const sceneBlob = `${sceneTurn.text}\n${evidenceBlob(sceneTurn.visualEvidence)}`.toLowerCase();
check('scene mentions red/circle-ish', /red|circle|round/.test(sceneBlob));
check('scene mentions blue/rectangle-ish', /blue|rect|square|box/.test(sceneBlob));
check('scene meaningful evidence or descriptive answer',
  listHasMeaningfulVisualEvidence(sceneTurn.visualEvidence) || sceneTurn.text.length > 40);

console.log('\n=== Result ===');
if (failures.length === 0) {
  console.log('PASS — Life Hub visual path: image → meaningful evidence → follow-up action.');
  process.exit(0);
}
console.log(`FAIL — ${failures.length} check(s):`);
for (const failure of failures) console.log(`  - ${failure}`);
process.exit(1);
