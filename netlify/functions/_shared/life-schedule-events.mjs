/**
 * Load timed Life Hub vault events for Schedule Diff hard-busy.
 * Reuses Life calendar vault paths (data/**) — not a new store.
 */
import { parseEventDocument } from '../../../apps/life/js/core/records.js';
import { lifeEventToBusySpan } from './productivity-os.mjs';
import { decodeBlob } from './decode-blob.mjs';

let loadYamlImpl = null;
async function yamlLoader() {
  if (loadYamlImpl) return loadYamlImpl;
  const mod = await import('js-yaml');
  loadYamlImpl = (text) => mod.load(text);
  return loadYamlImpl;
}

/**
 * @param {{ client: any, tree: any[], dates: string[] }} args
 * @returns {Promise<object[]>}
 */
export async function loadTimedLifeEventsFromTree({ client, tree, dates }) {
  const dateSet = new Set((dates ?? []).filter((d) => typeof d === 'string' && d));
  if (!client || !Array.isArray(tree) || !dateSet.size) return [];
  const loadYaml = await yamlLoader();
  const candidates = tree.filter((entry) => {
    if (entry?.type !== 'blob' || typeof entry.path !== 'string') return false;
    if (!entry.path.startsWith('data/')) return false;
    for (const date of dateSet) {
      if (entry.path.includes(`/${date}-`)) return true;
    }
    return false;
  });
  const out = [];
  for (const entry of candidates.slice(0, 100)) {
    try {
      const content = decodeBlob(await client.readBlob(entry.sha));
      if (content == null) continue;
      const { record } = parseEventDocument(content, entry.path, loadYaml);
      if (!record || typeof record !== 'object') continue;
      if (!lifeEventToBusySpan(record)) continue;
      out.push(record);
    } catch {
      // Skip unreadable / non-canonical vault files.
    }
  }
  return out;
}
