/**
 * Load timed Life Hub vault events for Schedule Diff hard-busy.
 * Reuses Life calendar vault paths (data/**) — not a new store.
 *
 * Safe skip: file readable but not a hard timed calendar event.
 * Fail closed: candidate blob read/decode unavailable (source failure).
 */
import { parseEventDocument } from '../../../apps/life/js/core/records.js';
import { lifeEventToBusySpan } from './productivity-os.mjs';
import { decodeBlob } from './decode-blob.mjs';

export class LifeEventSourceUnavailableError extends Error {
  constructor(message = 'life_event_source_unavailable', { path = null, cause = null } = {}) {
    super(message);
    this.name = 'LifeEventSourceUnavailableError';
    this.code = 'schedule_validation_unavailable';
    this.path = path;
    if (cause) this.cause = cause;
  }
}

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
    let blob;
    try {
      blob = await client.readBlob(entry.sha);
    } catch (error) {
      throw new LifeEventSourceUnavailableError('life_event_blob_read_failed', {
        path: entry.path,
        cause: error
      });
    }
    let content;
    try {
      content = decodeBlob(blob);
    } catch (error) {
      throw new LifeEventSourceUnavailableError('life_event_blob_decode_failed', {
        path: entry.path,
        cause: error
      });
    }
    if (content == null) {
      throw new LifeEventSourceUnavailableError('life_event_blob_decode_unavailable', {
        path: entry.path
      });
    }
    try {
      const { record } = parseEventDocument(content, entry.path, loadYaml);
      if (!record || typeof record !== 'object') continue;
      if (!lifeEventToBusySpan(record)) continue;
      out.push(record);
    } catch {
      // Readable but not a supported/canonical timed event — safe skip.
    }
  }
  return out;
}
