const REF_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;

export const HUB_REF_KINDS = {
  knowledge: new Set(['page']),
  teaching: new Set(['unit']),
  tasks: new Set(['project'])
};

export const HUB_SITES = {
  life: 'https://life-hub.adam-russell.com',
  teaching: 'https://teaching-hub.adam-russell.com',
  knowledge: 'https://knowledge-hub.adam-russell.com',
  tasks: 'https://tasks-hub.adam-russell.com'
};

export function parseHubRef(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;
  if (!raw.includes(':')) {
    return REF_ID.test(raw) ? { hub: 'knowledge', kind: 'page', id: raw } : null;
  }
  const parts = raw.split(':');
  if (parts.length !== 3) return null;
  const [hub, kind, id] = parts;
  if (!HUB_REF_KINDS[hub]?.has(kind) || !REF_ID.test(id)) return null;
  return { hub, kind, id };
}

export function formatHubRef(ref) {
  if (!ref?.hub || !ref.kind || !ref.id) return '';
  if (ref.hub === 'knowledge' && ref.kind === 'page') return ref.id;
  return `${ref.hub}:${ref.kind}:${ref.id}`;
}

export function normalizeConnected(list) {
  if (!Array.isArray(list)) {
    throw Object.assign(new Error('connected must be an array of refs'), {
      status: 400,
      code: 'validation_error'
    });
  }
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const parsed = parseHubRef(item);
    if (!parsed) {
      throw Object.assign(new Error(`Invalid connected ref: ${item}`), {
        status: 400,
        code: 'validation_error'
      });
    }
    const stored = formatHubRef(parsed);
    if (seen.has(stored)) continue;
    seen.add(stored);
    out.push(stored);
  }
  return out;
}

export function hrefForHubRef(ref) {
  if (ref?.hub === 'teaching' && ref.kind === 'unit') {
    return `${HUB_SITES.teaching}/units/${encodeURIComponent(ref.id)}`;
  }
  if (ref?.hub === 'tasks' && ref.kind === 'project') {
    return `${HUB_SITES.tasks}/#/project/${encodeURIComponent(ref.id)}`;
  }
  return null;
}

export function labelForHubRef(ref) {
  if (ref?.hub === 'teaching' && ref.kind === 'unit') return `Teaching unit ${ref.id}`;
  if (ref?.hub === 'tasks' && ref.kind === 'project') return `Tasks project ${ref.id}`;
  return ref?.id ?? '';
}
