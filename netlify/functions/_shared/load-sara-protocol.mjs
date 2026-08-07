import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROTOCOL_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../config/sara-protocol.md'
);

export function loadSaraProtocol({ readFileSyncImpl = readFileSync } = {}) {
  try {
    const text = readFileSyncImpl(PROTOCOL_PATH, 'utf8');
    return typeof text === 'string' ? text.trim() : '';
  } catch {
    return '';
  }
}
