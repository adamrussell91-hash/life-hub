/**
 * Knowledge Universal Links cutover and dual-read configuration.
 * Defaults keep legacy connected values writable and dual-read enabled.
 */
export function isKnowledgeDualReadEnabled(env = process.env) {
  const raw = env?.KNOWLEDGE_UNIVERSAL_LINKS_DUAL_READ;
  if (raw === '0' || raw === 'false') return false;
  return true;
}

export function isKnowledgeWriteCutoverEnabled(env = process.env) {
  const raw = env?.KNOWLEDGE_UNIVERSAL_LINKS_WRITE_CUTOVER;
  return raw === '1' || raw === 'true';
}
