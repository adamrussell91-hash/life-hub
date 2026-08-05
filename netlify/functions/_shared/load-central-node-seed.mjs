import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEED_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../central-node.md'
);

export function loadCentralNodeSeed({ readFileSyncImpl = readFileSync } = {}) {
  try {
    const text = readFileSyncImpl(SEED_PATH, 'utf8');
    return typeof text === 'string' ? text : '';
  } catch {
    return '';
  }
}
