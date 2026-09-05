import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logEntryToolSchema } from '../chat-schema.mjs';
import { foodLibraryEntrySchema } from '../food-library.mjs';
import { saveExerciseLibraryEntrySchema, searchExerciseLibrarySchema } from '../exercise-library.mjs';
import { getLastWorkoutSchema, searchWorkoutRecordsSchema } from '../workout-history.mjs';
import {
  listSkincareRoutinesSchema,
  searchSkincareLibrarySchema,
  saveSkincareLibraryEntrySchema,
  setSkincareRoutineMembershipSchema
} from '../skincare-library-tools.mjs';
import { getMindSessionSchema, searchMindRecordsSchema } from '../mind-session-read.mjs';
import {
  searchMedicalRecordsSchema,
  briefMedicalAppointmentSchema
} from '../medical-overview-read.mjs';
import { proposeCentralNodePatchSchema, appendGovernanceLogSchema } from '../hammond-tools.mjs';
import { proposeActionToolSchema } from './propose-action.mjs';
import { shortcutSchemas } from './shortcuts.mjs';
import { selectCapabilityIdsForTurn } from './intent-router.mjs';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

function resolveCapabilitiesRoot() {
  const candidates = [
    join(MODULE_DIR, '../../../../capabilities'),
    join(process.cwd(), 'capabilities')
  ];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'registry.json'))) return candidate;
  }
  return candidates[0];
}

const CAPABILITIES_ROOT = resolveCapabilitiesRoot();

let cachedRegistry;
let cachedDefinitions = new Map();
let cachedAllowlists = new Map();

export function capabilitiesRoot() {
  return CAPABILITIES_ROOT;
}

export function loadRegistry() {
  if (cachedRegistry) return cachedRegistry;
  const raw = readFileSync(join(CAPABILITIES_ROOT, 'registry.json'), 'utf8');
  cachedRegistry = JSON.parse(raw);
  return cachedRegistry;
}

export function loadCapability(id) {
  if (cachedDefinitions.has(id)) return cachedDefinitions.get(id);
  const registry = loadRegistry();
  const entry = registry.capabilities?.[id];
  if (!entry?.file) return null;
  const def = JSON.parse(readFileSync(join(CAPABILITIES_ROOT, entry.file), 'utf8'));
  cachedDefinitions.set(id, def);
  return def;
}

export function loadAllowlist(slug) {
  if (cachedAllowlists.has(slug)) return cachedAllowlists.get(slug);
  const path = join(CAPABILITIES_ROOT, 'allowlists', `${slug}.json`);
  if (!existsSync(path)) {
    cachedAllowlists.set(slug, null);
    return null;
  }
  const allowlist = JSON.parse(readFileSync(path, 'utf8'));
  cachedAllowlists.set(slug, allowlist);
  return allowlist;
}

/** Clear caches — tests only. */
export function resetCapabilityCaches() {
  cachedRegistry = undefined;
  cachedDefinitions = new Map();
  cachedAllowlists = new Map();
}

/**
 * Shared OS floor — every agent in config/agents.yml inherits these via agents: ["*"].
 * Domain exclusives (food library, CN patch, etc.) stay enumerated. Add a new agent by
 * roster + allowlist only; do not re-list them on floor capabilities.
 */
export const OS_FLOOR_CAPABILITY_IDS = Object.freeze([
  'os.propose-action',
  'remember.set-week-flag',
  'remember.note-context',
  'track.open-challenge',
  'track.log-progress',
  'track.close-challenge',
  'coordinate.request-cn-write',
  'research.save-brief',
  'research.expiring-brief',
  'publish.surface-widget',
  'os.capability-scoreboard',
  'intuition.edit-pack',
  'os.promote-shortcut',
  'os.list-promoted-shortcuts',
  'os.run-promoted-shortcut'
]);

export function capabilityIdsForAgent(slug) {
  const registry = loadRegistry();
  const ids = [];
  for (const [id, entry] of Object.entries(registry.capabilities ?? {})) {
    const agents = entry.agents ?? [];
    if (agents.includes('*') || agents.includes(slug)) ids.push(id);
  }
  // Universal fallback always present even if registry is hand-edited poorly.
  if (!ids.includes('os.propose-action')) ids.unshift('os.propose-action');
  return ids;
}

/** Floor ids an agent actually receives (intersection with registry * entries). */
export function osFloorIdsForAgent(slug) {
  const have = new Set(capabilityIdsForAgent(slug));
  return OS_FLOOR_CAPABILITY_IDS.filter(id => have.has(id));
}

export function promptOneLinersForAgent(slug) {
  return capabilityIdsForAgent(slug)
    .map(id => loadCapability(id))
    .filter(Boolean)
    .map(def => `- ${def.id}: ${def.prompt_one_liner}`)
    .join('\n');
}

/**
 * Match path against simple ** / * globs used in allowlist files.
 * Supports prefix/** and exact paths and single-segment *.
 */
export function matchGlob(pattern, path) {
  if (typeof pattern !== 'string' || typeof path !== 'string') return false;
  if (pattern === path) return true;
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    return path === prefix || path.startsWith(`${prefix}/`);
  }
  if (pattern.includes('*')) {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '<<<DS>>>')
      .replace(/\*/g, '[^/]*')
      .replace(/<<<DS>>>/g, '.*');
    return new RegExp(`^${escaped}$`).test(path);
  }
  return false;
}

export function isPathAllowedForAgent(slug, path, { mode = 'write' } = {}) {
  if (typeof path !== 'string' || path.length === 0) return false;
  if (/[\\\u0000-\u001f\u007f]/.test(path) || path.includes('//')) return false;
  if (path.split('/').some(segment => segment === '.' || segment === '..')) return false;

  const allowlist = loadAllowlist(slug);
  if (!allowlist) return false;
  const globs = mode === 'read' ? (allowlist.read_globs ?? []) : (allowlist.write_globs ?? []);
  return globs.some(glob => matchGlob(glob, path));
}

const SHORTCUT_CAPABILITY_IDS = new Set([
  'remember.set-week-flag',
  'remember.note-context',
  'track.open-challenge',
  'track.log-progress',
  'track.close-challenge',
  'coordinate.request-cn-write',
  'research.save-brief',
  'research.expiring-brief',
  'publish.surface-widget',
  'plan.week-meals',
  'lookup.food-brand-au',
  'os.capability-scoreboard',
  'intuition.edit-pack',
  'os.promote-shortcut',
  'os.list-promoted-shortcuts',
  'os.run-promoted-shortcut'
]);

/**
 * Build the Anthropic tools array for one agent turn.
 * Capacity shortcuts come from the registry; Phase 1–3 named shortcuts are
 * narrowed by the same-call intent pass when `message` is provided.
 */
export function buildAgentTools({
  slug,
  allowedTypes,
  stripWebSearch = false,
  needsFoodLibrary = false,
  needsExerciseLibrary = false,
  needsSkincareLibrary = false,
  needsHammondTools = false,
  needsVeraMindTools = false,
  needsSaraMedicalTools = false,
  message = null
} = {}) {
  if (typeof slug !== 'string' || !slug) throw new TypeError('slug is required');

  const tools = [];
  if (!stripWebSearch) {
    tools.push({ type: 'web_search_20250305', name: 'web_search' });
  }

    const allIds = capabilityIdsForAgent(slug);
  // Intent pass narrows Phase 1–3 shortcuts only; legacy/domain tools stay
  // available whenever their feature flags / allowlists say so.
  const selectedIds = message == null
    ? allIds
    : selectCapabilityIdsForTurn({ slug, message });
  const has = id => allIds.includes(id);
  const hasShortcut = id => selectedIds.includes(id);

  if (has('os.propose-action')) {
    tools.push(proposeActionToolSchema());
  }

  if (has('log.entry') && Array.isArray(allowedTypes) && allowedTypes.length > 0) {
    tools.push(logEntryToolSchema(allowedTypes));
  }

  if (has('lookup.save-food-library') && needsFoodLibrary) {
    tools.push(foodLibraryEntrySchema());
  }

  if (has('lookup.save-exercise-library') && needsExerciseLibrary) {
    tools.push(
      searchExerciseLibrarySchema(),
      saveExerciseLibraryEntrySchema(),
      getLastWorkoutSchema(),
      searchWorkoutRecordsSchema()
    );
  } else if (needsExerciseLibrary) {
    // Search is resourcing, not yet a named capacity — keep available for Chadwick.
    tools.push(searchExerciseLibrarySchema(), getLastWorkoutSchema(), searchWorkoutRecordsSchema());
  }

  if (needsVeraMindTools) {
    tools.push(getMindSessionSchema(), searchMindRecordsSchema());
  }

  if (needsSaraMedicalTools) {
    tools.push(searchMedicalRecordsSchema(), briefMedicalAppointmentSchema());
  }

  if (needsSkincareLibrary) {
    tools.push(
      listSkincareRoutinesSchema(),
      searchSkincareLibrarySchema(),
      saveSkincareLibraryEntrySchema(),
      setSkincareRoutineMembershipSchema()
    );
  }

  if (has('publish.cn-patch') && (needsHammondTools || slug === 'clare' || slug === 'ann')) {
    tools.push(proposeCentralNodePatchSchema());
  }
  if (has('publish.governance-log-entry') && needsHammondTools) {
    tools.push(appendGovernanceLogSchema());
  }

  const schemas = shortcutSchemas();
  for (const id of selectedIds) {
    if (!SHORTCUT_CAPABILITY_IDS.has(id)) continue;
    const def = loadCapability(id);
    const toolName = def?.tool_name;
    if (!toolName || !schemas[toolName]) continue;
    tools.push(schemas[toolName]);
  }

  return tools;
}

/** Dev helper: list definition files under capabilities/. */
export function listCapabilityDefinitionFiles() {
  const files = [];
  function walk(dir, prefix = '') {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      if (entry.name === 'allowlists' || entry.name === 'schema.json' || entry.name === 'registry.json') continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(join(dir, entry.name), rel);
      else if (entry.name.endsWith('.json')) files.push(rel);
    }
  }
  if (existsSync(CAPABILITIES_ROOT)) walk(CAPABILITIES_ROOT);
  return files.sort();
}
