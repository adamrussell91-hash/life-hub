import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

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

/**
 * Standing priors for judgment only — never gates capacity availability.
 */
export function loadIntuitionFor({ agentSlug, capacityIds = [] } = {}) {
  const root = resolveIntuitionRoot();
  if (!existsSync(root)) return [];

  const packs = [];
  for (const name of readdirSync(root)) {
    if (!name.endsWith('.json')) continue;
    let pack;
    try {
      pack = JSON.parse(readFileSync(join(root, name), 'utf8'));
    } catch {
      continue;
    }
    if (!pack || typeof pack !== 'object') continue;
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
