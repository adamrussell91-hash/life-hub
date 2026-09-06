import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

const PROTOCOL_PATHS = {
  clare: 'apps/tasks/config/clare-protocol.md',
  ann: 'apps/teaching/config/ann-protocol.md',
  // Teaching-hub copy is the school workplace protocol (intentional).
  // Knowledge research spine remains config/knowledge/* via Knowledge chat.
  clementine: 'apps/teaching/config/clementine-protocol.md'
};

function loadProtocol(slug, { readFileSyncImpl = readFileSync } = {}) {
  const rel = PROTOCOL_PATHS[slug];
  if (!rel) return '';
  try {
    const text = readFileSyncImpl(join(ROOT, rel), 'utf8');
    return typeof text === 'string' ? text.trim() : '';
  } catch {
    return '';
  }
}

export function loadClareProtocol(opts) {
  return loadProtocol('clare', opts);
}

export function loadAnnProtocol(opts) {
  return loadProtocol('ann', opts);
}

export function loadClementineProtocol(opts) {
  return loadProtocol('clementine', opts);
}
