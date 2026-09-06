#!/usr/bin/env node
/**
 * Live evidence-pack demos against /agent/repos/life-hub-data (functioning store).
 * Conversational Anthropic turns are reported Blocked when ANTHROPIC_API_KEY is absent.
 */
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const { parseEventDocument } = await import(pathToFileURL(join(root, 'apps/life/js/core/records.js')).href);
const yaml = (await import('js-yaml')).default;
const { assembleEvidencePack } = await import(
  pathToFileURL(join(root, 'netlify/functions/_shared/evidence-packs.mjs')).href
);

const DATA_ROOT = process.env.LIFE_HUB_DATA_ROOT || '/agent/repos/life-hub-data/data';
const OUT_DIR = process.env.EVIDENCE_DEMO_OUT || '/opt/cursor/artifacts/agent-evidence-live';
const TODAY = process.env.DEMO_TODAY || '2026-08-20';

function loadYaml(text) {
  return yaml.load(text);
}

async function walkMarkdown(dir, acc = []) {
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walkMarkdown(path, acc);
    else if (entry.isFile() && entry.name.endsWith('.md')) acc.push(path);
  }
  return acc;
}

async function loadDomain(subdir) {
  const root = join(DATA_ROOT, subdir);
  const paths = await walkMarkdown(root);
  const records = [];
  const events = [];
  for (const path of paths.slice(0, 200)) {
    const content = await readFile(path, 'utf8');
    try {
      const parsed = parseEventDocument(content, path, loadYaml);
      if (parsed?.record) {
        records.push(parsed.record);
        events.push(parsed);
      } else if (parsed?.type) {
        records.push(parsed);
        events.push({ record: parsed, path, body: parsed.notes ?? '' });
      }
    } catch {
      // skip unreadable fixture
    }
  }
  return { records, events, paths };
}

const PROMPTS = {
  chadwick: 'How has my training been going lately?',
  brisket: "How's my nutrition looking this week?",
  sara: 'Is my weight change unusual lately?',
  penelope: 'Have I been feeling like this often?',
  vera: 'What patterns do you notice across our recent sessions?',
  hyaluronica: 'Is my routine actually helping?',
  clare: 'What should I focus on today?',
  ann: "Help me improve tomorrow's Year 10 lesson",
  clementine: 'What do I already know about cognitive load?',
  hammond: 'What is slipping across my life?'
};

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const fitness = await loadDomain('fitness');
  const nutrition = await loadDomain('nutrition');
  const body = await loadDomain('body');
  const mind = await loadDomain('mind');
  const skincare = await loadDomain('skincare');

  const composition = body.records.filter(r => r.type === 'composition' || r.weight_kg != null);
  const measurements = body.records.filter(r => r.type === 'measurement' || r.waist_cm != null);
  const medicalEvents = body.events.filter(e => (e.record?.type ?? e.type) === 'medical' || String(e.path || '').includes('medical') || String(e.path || '').includes('bloods'));

  const stores = {
    workouts: fitness.records.filter(r => r.type === 'workout' || r.exercises),
    meals: nutrition.records.filter(r => r.type === 'meal' || r.calories != null),
    composition,
    measurements,
    mindEvents: mind.events,
    skincare: skincare.records,
    medicalEvents,
    tasks: [
      { id: 'demo-1', title: 'Mark Year 10 essays', status: 'open', due_date: '2026-08-19', priority: 'high', updated_at: '2026-08-01' },
      { id: 'demo-2', title: 'Call Kate', status: 'open', due_date: '2026-08-21', priority: 'medium', updated_at: '2026-08-18' }
    ],
    projects: [{ id: 'demo-p', title: 'Unit redesign', status: 'active', updated_at: '2026-05-01' }],
    classes: [{ id: 'c1', code: '10ENG', display_name: 'Year 10 English' }],
    lessons: [
      {
        id: 'l1',
        date: '2026-08-21',
        title: 'Persuasive openings',
        class_id: 'c1',
        learning_intentions: ['Identify rhetorical moves'],
        blocks: [{ type: 'hook' }]
      }
    ],
    units: [{ id: 'u1', title: 'Rhetoric', code: 'R1' }],
    pages: [
      {
        id: 'page_hub_clt',
        title: 'Cognitive load theory',
        excerpt: 'Intrinsic vs extraneous load',
        tags: ['CLT'],
        claims: ['Reduce extraneous load'],
        connected: []
      }
    ],
    loadErrors: {}
  };

  const apiKeyPresent = Boolean(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.length > 8);
  const results = [];

  for (const [slug, message] of Object.entries(PROMPTS)) {
    const pack = assembleEvidencePack({ slug, message, today: TODAY, stores });
    const row = {
      slug,
      message,
      store: DATA_ROOT,
      workouts_loaded: stores.workouts.length,
      meals_loaded: stores.meals.length,
      mind_events_loaded: stores.mindEvents.length,
      skincare_loaded: stores.skincare.length,
      body_composition_loaded: stores.composition.length,
      pack_active: pack.active,
      intent: pack.intentClass,
      tools_executed: pack.toolsExecuted,
      section_kinds: pack.sections.map(s => ({ id: s.id, kind: s.kind })),
      answerable: pack.answerable,
      conversational_turn: apiKeyPresent ? 'NOT_RUN_IN_THIS_SCRIPT' : 'Blocked',
      conversational_blocker: apiKeyPresent
        ? null
        : 'ANTHROPIC_API_KEY is not set in this Cloud Agent environment — cannot run a genuine model turn through chat.mjs. Evidence-pack retrieval against the local store is Demonstrated.'
    };
    results.push(row);
    await writeFile(join(OUT_DIR, `${slug}.json`), JSON.stringify({ ...row, prompt_excerpt: pack.promptBlock.slice(0, 4000) }, null, 2));
  }

  await writeFile(join(OUT_DIR, 'summary.json'), JSON.stringify({ generated_at: new Date().toISOString(), apiKeyPresent, results }, null, 2));
  console.log(JSON.stringify({ out: OUT_DIR, apiKeyPresent, agents: results.map(r => ({ slug: r.slug, active: r.pack_active, tools: r.tools_executed.length, answerable: r.answerable, conversational: r.conversational_turn })) }, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
