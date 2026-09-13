import { formatHubRef, parseHubRef } from './hub-ref.mjs';
import { getKnowledgePage, listKnowledgePages } from './knowledge-data.mjs';
import {
  combineBacklinks,
  listIndexedKnowledgeBacklinks
} from './knowledge-universal-links.mjs';
import { isKnowledgeDualReadEnabled, isKnowledgeWriteCutoverEnabled } from './knowledge-ul-config.mjs';

const SMALL_ARCHIVE = 24;

export function normalizeInverseLinks(result) {
  if (Array.isArray(result)) {
    return { links: result, groups: [], status: 'ready' };
  }
  if (result && typeof result === 'object') {
    const links = Array.isArray(result.links) ? result.links : [];
    const groups = Array.isArray(result.groups) ? result.groups : [];
    const status = result.status === 'unavailable' ? 'unavailable' : 'ready';
    return { links, groups, status };
  }
  return { links: [], groups: [], status: 'ready' };
}

export function collectInverseLinks(entries, targetId) {
  const target = parseHubRef(targetId);
  if (!target) return [];
  const wanted = formatHubRef(target);
  const inbound = [];
  const seen = new Set();
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || typeof entry.id !== 'string') continue;
    if (target.hub === 'knowledge' && target.kind === 'page' && entry.id === target.id) continue;
    const connected = Array.isArray(entry.connected) ? entry.connected : [];
    const pointsHere = connected.some(item => {
      const ref = parseHubRef(item);
      return Boolean(ref && formatHubRef(ref) === wanted);
    });
    if (!pointsHere || seen.has(entry.id)) continue;
    seen.add(entry.id);
    inbound.push({
      id: entry.id,
      title: typeof entry.title === 'string' && entry.title ? entry.title : entry.id
    });
  }
  return inbound;
}

export function collectDecisionBacklinks(entries) {
  const groups = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || typeof entry.id !== 'string') continue;
    const source = {
      id: entry.id,
      title: typeof entry.title === 'string' && entry.title ? entry.title : entry.id
    };
    for (const item of Array.isArray(entry.connected) ? entry.connected : []) {
      const ref = parseHubRef(item);
      if (ref?.hub !== 'life' || ref.kind !== 'decision') continue;
      const target = formatHubRef(ref);
      const list = groups.get(target) ?? [];
      if (list.some(row => row.id === source.id)) continue;
      list.push(source);
      groups.set(target, list);
    }
  }
  return [...groups.entries()].map(([target, sources]) => ({ target, sources }));
}

async function hydrateConnected(entries, { env, fetchImpl }) {
  const list = Array.isArray(entries) ? entries : [];
  if (!list.length) return list;
  if (list.length <= SMALL_ARCHIVE) {
    const next = [];
    for (const entry of list) {
      if (Array.isArray(entry?.connected)) {
        next.push(entry);
        continue;
      }
      try {
        const page = await getKnowledgePage(entry.id, { env, fetchImpl });
        next.push({
          ...entry,
          connected: Array.isArray(page?.connected) ? page.connected : []
        });
      } catch {
        next.push({ ...entry, connected: [] });
      }
    }
    return next;
  }
  if (list.some(entry => Array.isArray(entry?.connected))) return list;
  const known = list.find(entry => entry.id === 'page_aotfw');
  if (!known) return list;
  try {
    const page = await getKnowledgePage('page_aotfw', { env, fetchImpl });
    return list.map(entry => (
      entry.id === 'page_aotfw'
        ? { ...entry, connected: Array.isArray(page?.connected) ? page.connected : [] }
        : entry
    ));
  } catch {
    return list;
  }
}

export async function defaultLoadInverseLinks({
  env,
  fetchImpl = fetch,
  page,
  listPages = listKnowledgePages,
  listIncoming = null,
  dualRead = isKnowledgeDualReadEnabled(env),
  writeCutover = isKnowledgeWriteCutoverEnabled(env)
} = {}) {
  try {
    // After cutover, ordinary requests must never scan the archive. If the
    // indexed read is not bound, fail visibly instead of falling back.
    if (writeCutover && typeof listIncoming !== 'function') {
      return {
        links: [],
        groups: [],
        status: 'unavailable',
        source: 'universal_links_unavailable'
      };
    }

    let indexed = { links: [], status: 'ready' };
    if (page?.id && typeof listIncoming === 'function') {
      try {
        indexed = await listIndexedKnowledgeBacklinks({
          pageId: page.id,
          listIncoming
        });
      } catch {
        indexed = { links: [], status: 'unavailable' };
      }
    }

    if (writeCutover) {
      return {
        links: indexed.links,
        groups: [],
        status: indexed.status === 'unavailable' ? 'unavailable' : 'ready',
        source:
          indexed.status === 'unavailable'
            ? 'universal_links_unavailable'
            : 'universal_links_indexed'
      };
    }

    const listed = await listPages({ env, fetchImpl });
    const entries = await hydrateConnected(listed, { env, fetchImpl });
    const legacyLinks = page?.id ? collectInverseLinks(entries, page.id) : [];
    const groups = collectDecisionBacklinks(entries);

    if (dualRead && typeof listIncoming === 'function') {
      return {
        links: combineBacklinks({
          indexedLinks: indexed.links,
          legacyLinks
        }),
        groups,
        status: indexed.status === 'unavailable' ? 'unavailable' : 'ready',
        source: 'dual_read'
      };
    }

    return { links: legacyLinks, groups, status: 'ready', source: 'legacy_scan' };
  } catch {
    return { links: [], groups: [], status: 'unavailable', source: 'error' };
  }
}
