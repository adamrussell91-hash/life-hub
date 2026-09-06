#!/usr/bin/env node
/**
 * Live evidence-pack demos against functioning stores only.
 *
 * Life Hub files: LIFE_HUB_DATA_ROOT (default /agent/repos/life-hub-data/data).
 * Tasks / Teaching / Knowledge blob stores: Blocked here unless a real store is
 * mounted — this script will NOT invent Clare/Ann/Clementine/Hammond hub rows.
 *
 * Conversational Anthropic turns: Blocked when ANTHROPIC_API_KEY is absent.
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
const { buildAnnTeachingEvidence } = await import(
  pathToFileURL(join(root, 'netlify/functions/_shared/ann-teaching-surface.mjs')).href
);

const DATA_ROOT = process.env.LIFE_HUB_DATA_ROOT || '/agent/repos/life-hub-data/data';
const OUT_DIR = process.env.EVIDENCE_DEMO_OUT || '/opt/cursor/artifacts/agent-evidence-live';
const TODAY = process.env.DEMO_TODAY || '2026-08-20';

const LIFE_AGENTS = new Set(['chadwick', 'brisket', 'sara', 'penelope', 'vera', 'hyaluronica']);

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

const HUB_BLOCKERS = {
  clare:
    'Tasks blob store not available in this environment (no functioning projects/tasks JSON). Pack not Demonstrated against a real Tasks store.',
  ann: 'Teaching blob store not available in this environment. Pack not Demonstrated against a real Teaching store. buildAnnTeachingEvidence adapter exists for production wiring.',
  clementine:
    'Knowledge pages store not available in this environment. Pack not Demonstrated against a real Knowledge corpus.',
  hammond:
    'Cross-hub blob stores (Tasks/Teaching) not available; Life files alone are insufficient to claim full Hammond Demonstrated.'
};

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
  const domainRoot = join(DATA_ROOT, subdir);
  const paths = await walkMarkdown(domainRoot);
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
  return { records, events, paths, available: paths.length > 0 };
}

function conversationalStatus() {
  const present = Boolean(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.length > 8);
  return {
    api_key_present: present,
    conversational_turn: present ? 'NOT_RUN_IN_THIS_SCRIPT' : 'Blocked',
    conversational_blocker: present
      ? null
      : 'ANTHROPIC_API_KEY is not set in this Cloud Agent environment — cannot run a genuine model turn through chat.mjs.'
  };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const fitness = await loadDomain('fitness');
  const nutrition = await loadDomain('nutrition');
  const body = await loadDomain('body');
  const mind = await loadDomain('mind');
  const skincare = await loadDomain('skincare');

  const lifeAvailable =
    fitness.available || nutrition.available || body.available || mind.available || skincare.available;

  const composition = body.records.filter(r => r.type === 'composition' || r.weight_kg != null);
  const measurements = body.records.filter(r => r.type === 'measurement' || r.waist_cm != null);
  const medicalEvents = body.events.filter(
    e =>
      (e.record?.type ?? e.type) === 'medical' ||
      String(e.path || '').includes('medical') ||
      String(e.path || '').includes('bloods')
  );

  const lifeStores = {
    workouts: fitness.records.filter(r => r.type === 'workout' || r.exercises),
    meals: nutrition.records.filter(r => r.type === 'meal' || r.calories != null),
    composition,
    measurements,
    mindEvents: mind.events,
    skincare: skincare.records,
    medicalEvents,
    tasks: [],
    projects: [],
    classes: [],
    lessons: [],
    units: [],
    pages: [],
    loadErrors: {}
  };

  const conv = conversationalStatus();
  const results = [];

  for (const [slug, message] of Object.entries(PROMPTS)) {
    let row;
    if (LIFE_AGENTS.has(slug)) {
      if (!lifeAvailable) {
        row = {
          slug,
          message,
          store: DATA_ROOT,
          status: 'Blocked',
          blocker: `Life Hub data root missing or empty at ${DATA_ROOT}`,
          pack_active: false,
          invented_hub_rows: false,
          ...conv
        };
      } else {
        const pack = assembleEvidencePack({ slug, message, today: TODAY, stores: lifeStores });
        row = {
          slug,
          message,
          store: DATA_ROOT,
          status: pack.active ? 'Demonstrated' : 'Failed',
          layer: 'evidence_pack',
          workouts_loaded: lifeStores.workouts.length,
          meals_loaded: lifeStores.meals.length,
          mind_events_loaded: lifeStores.mindEvents.length,
          skincare_loaded: lifeStores.skincare.length,
          body_composition_loaded: lifeStores.composition.length,
          pack_active: pack.active,
          intent: pack.intentClass,
          tools_executed: pack.toolsExecuted,
          section_kinds: pack.sections.map(s => ({ id: s.id, kind: s.kind })),
          answerable: pack.answerable,
          prompt_excerpt: String(pack.promptBlock || '').slice(0, 4000),
          invented_hub_rows: false,
          ...conv
        };
      }
    } else {
      let adapter = null;
      if (slug === 'ann') {
        const empty = buildAnnTeachingEvidence({
          message,
          today: TODAY,
          classes: [],
          lessons: [],
          units: [],
          loadErrors: { teaching: 'store_unavailable' }
        });
        adapter = {
          name: 'buildAnnTeachingEvidence',
          note: 'Empty-store honesty only — not Demonstrated live Teaching retrieval.',
          active_on_empty_store: empty.active,
          intent: empty.intentClass,
          tools_executed: empty.toolsExecuted
        };
      }
      row = {
        slug,
        message,
        store: null,
        status: 'Blocked',
        blocker: HUB_BLOCKERS[slug],
        pack_active: false,
        invented_hub_rows: false,
        adapter,
        ...conv
      };
    }

    results.push(row);
    await writeFile(join(OUT_DIR, `${slug}.json`), JSON.stringify(row, null, 2));
  }

  const summary = {
    generated_at: new Date().toISOString(),
    life_data_root: DATA_ROOT,
    life_available: lifeAvailable,
    honesty:
      'Hub agents are Blocked here — no synthetic Tasks/Teaching/Knowledge rows were injected. Pack-layer Demonstrated only for Life agents against real Life files. Conversational E2E remains Blocked without ANTHROPIC_API_KEY. Unit tests still do not prove model interpretation.',
    ...conv,
    results: results.map(r => ({
      slug: r.slug,
      status: r.status,
      pack_active: r.pack_active,
      blocker: r.blocker ?? null,
      conversational: r.conversational_turn
    }))
  };
  await writeFile(join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
