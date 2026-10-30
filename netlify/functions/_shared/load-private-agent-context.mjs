import { decodeBlob } from './decode-blob.mjs';

/**
 * Personal standing context for an agent protocol (diagnoses, medications,
 * clinicians, habits, body targets). It lives only in the private data repo at
 * `config/agent-context/<slug>.md` and is appended to the public protocol at
 * prompt-build time. Public protocols stay generic and point here.
 *
 * Not part of the browser manifest (repo-policy CONFIG_PATHS); read server side
 * through the authenticated data client and its resolved tree only.
 */
export const PRIVATE_AGENT_CONTEXT_DIR = 'config/agent-context/';
const SLUG = /^[a-z][a-z0-9-]*$/;
const MAX_CHARS = 24_000;

export function privateAgentContextPath(slug) {
  return SLUG.test(String(slug || '')) ? `${PRIVATE_AGENT_CONTEXT_DIR}${slug}.md` : null;
}

export async function loadPrivateAgentContext(slug, { client, tree = [] } = {}) {
  const path = privateAgentContextPath(slug);
  if (!path || !client || typeof client.readBlob !== 'function' || !Array.isArray(tree)) return '';
  const entry = tree.find(item => item?.type === 'blob' && item.path === path);
  if (!entry?.sha) return '';
  try {
    const text = (decodeBlob(await client.readBlob(entry.sha)) ?? '').trim();
    return text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;
  } catch {
    return '';
  }
}

/** Append private standing context to a public protocol. Empty protocol stays empty. */
export function withPrivateAgentContext(protocol, context) {
  const base = typeof protocol === 'string' ? protocol.trim() : '';
  const extra = typeof context === 'string' ? context.trim() : '';
  if (!base) return base;
  if (!extra) return base;
  return [
    base,
    '## Private standing context (from the private data repo)',
    'These are Adam-specific facts and defaults. Live Central Node Constraints & Priorities still win if they conflict.',
    extra
  ].join('\n\n');
}
