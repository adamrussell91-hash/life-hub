import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

/** Private-repo folder that holds personal intuition packs (read and written through the GitHub data client). */
export const PRIVATE_INTUITION_DIR = 'intuition/';
const PRIVATE_INTUITION_PATH = /^intuition\/[a-z0-9][a-z0-9-]*\.json$/;
const MAX_PRIVATE_PACKS = 64;

function resolveIntuitionRoot() {
  const candidates = [
    join(MODULE_DIR, '../../../../intuition'),
    join(process.cwd(), 'intuition')
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

function isPack(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && typeof value.id === 'string' && value.id.trim());
}

/**
 * Generic, non-personal packs bundled with the public build.
 * Personal packs live only in the private data repo (see loadPrivateIntuitionPacks).
 */
export function loadBundledIntuitionPacks() {
  const root = resolveIntuitionRoot();
  if (!existsSync(root)) return [];
  const packs = [];
  for (const name of readdirSync(root).sort()) {
    if (!name.endsWith('.json')) continue;
    try {
      const pack = JSON.parse(readFileSync(join(root, name), 'utf8'));
      if (isPack(pack)) packs.push(pack);
    } catch {
      // skip unreadable pack
    }
  }
  return packs;
}

export function bundledIntuitionPack(packId) {
  return loadBundledIntuitionPacks().find(pack => pack.id === packId) ?? null;
}

/**
 * Personal packs from the private data repo tree. Any failure yields no packs.
 * @param {Array<{path:string,type:string,sha:string}>} tree
 * @param {(sha:string) => Promise<string>} readText
 */
export async function loadPrivateIntuitionPacks(tree, readText) {
  if (!Array.isArray(tree) || typeof readText !== 'function') return [];
  const entries = tree
    .filter(entry => entry?.type === 'blob' && PRIVATE_INTUITION_PATH.test(String(entry.path || '')) && entry.sha)
    .sort((a, b) => a.path.localeCompare(b.path))
    .slice(0, MAX_PRIVATE_PACKS);
  const results = await Promise.all(entries.map(async entry => {
    try {
      const pack = JSON.parse(await readText(entry.sha));
      return isPack(pack) ? pack : null;
    } catch {
      return null;
    }
  }));
  return results.filter(Boolean);
}

/** Private packs override bundled packs with the same id. */
export function mergeIntuitionPacks(bundled = [], privatePacks = []) {
  const byId = new Map();
  for (const pack of bundled) if (isPack(pack)) byId.set(pack.id, pack);
  for (const pack of privatePacks) if (isPack(pack)) byId.set(pack.id, pack);
  return [...byId.values()];
}

/**
 * Standing priors for judgment only — never gates capacity availability.
 * Pass `privatePacks` (from loadPrivateIntuitionPacks) to include personal packs.
 */
export function loadIntuitionFor({ agentSlug, capacityIds = [], privatePacks = [], bundledPacks } = {}) {
  const all = mergeIntuitionPacks(bundledPacks ?? loadBundledIntuitionPacks(), privatePacks);
  const packs = [];
  for (const pack of all) {
    const agents = Array.isArray(pack.agents) ? pack.agents : [];
    if (agentSlug && agents.length && !agents.includes(agentSlug) && !agents.includes('*')) continue;
    const caps = Array.isArray(pack.capacities) ? pack.capacities : [];
    if (capacityIds.length && caps.length && !caps.some(id => capacityIds.includes(id))) continue;
    packs.push(pack);
  }
  return packs;
}

export function formatIntuitionForPrompt(packs) {
  if (!Array.isArray(packs) || packs.length === 0) return '';
  return [
    'Built intuition (standing priors — inform judgment, never block a capacity):',
    ...packs.map(pack => {
      const lines = [`- ${pack.id}: ${pack.summary ?? ''}`.trim()];
      if (pack.guidance) lines.push(`  Guidance: ${pack.guidance}`);
      return lines.join('\n');
    })
  ].join('\n');
}

/** Agents may edit intuition files (locked decision). */
export function applyIntuitionEdit(existing, patch) {
  if (!patch || typeof patch !== 'object') return null;
  const next = existing && typeof existing === 'object' ? { ...existing } : {};
  if (typeof patch.id === 'string' && patch.id.trim()) next.id = patch.id.trim();
  if (typeof patch.summary === 'string' && patch.summary.trim()) next.summary = patch.summary.trim();
  if (typeof patch.guidance === 'string' && patch.guidance.trim()) next.guidance = patch.guidance.trim();
  if (Array.isArray(patch.agents)) next.agents = patch.agents.filter(a => typeof a === 'string');
  if (Array.isArray(patch.capacities)) next.capacities = patch.capacities.filter(a => typeof a === 'string');
  if (!next.id) return null;
  return next;
}
