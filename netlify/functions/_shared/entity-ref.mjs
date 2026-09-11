import { randomUUID } from 'node:crypto';

// Canonical entity reference implementation for the Universal Links programme.
// This is a new, separate implementation from `hub-ref.mjs`, which stays the
// legacy adapter for Knowledge `connected` links until migration (Slice 7).
// Do not extend `hub-ref.mjs` with these namespaces.

const REF_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;
const ID_PREFIX = /^[a-z][a-z0-9_]*$/;

export const ENTITY_REF_NAMESPACES = new Set([
  'shared',
  'professional',
  'tasks',
  'teaching',
  'knowledge',
  'life'
]);

// Registered namespace:kind pairs. Register a new kind only in the slice
// that supplies its resolver — do not add speculative entity types ahead of
// a real workflow (implementation programme, "Absolute exclusions" #11).
export const ENTITY_REF_KINDS = {
  shared: new Set(['person', 'organisation']),
  professional: new Set(['communication']),
  tasks: new Set(['task', 'project']),
  teaching: new Set(),
  knowledge: new Set(),
  life: new Set()
};

export function isRegisteredEntityRefKind(namespace, kind) {
  return Boolean(ENTITY_REF_KINDS[namespace]?.has(kind));
}

// Parsing rejects unknown namespace/kind pairs and malformed ids. Returns
// null rather than throwing so callers can treat "not a valid ref" and
// "not a ref at all" the same way.
export function parseEntityRef(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;
  const parts = raw.split(':');
  if (parts.length !== 3) return null;
  const [namespace, kind, id] = parts;
  if (!isRegisteredEntityRefKind(namespace, kind)) return null;
  if (!REF_ID.test(id)) return null;
  return { namespace, kind, id };
}

export function formatEntityRef(ref) {
  if (!ref || typeof ref !== 'object') return '';
  const { namespace, kind, id } = ref;
  if (!isRegisteredEntityRefKind(namespace, kind)) return '';
  if (typeof id !== 'string' || !REF_ID.test(id)) return '';
  return `${namespace}:${kind}:${id}`;
}

export function isEntityRef(value) {
  return parseEntityRef(value) !== null;
}

// Generated identity ids use a non-semantic prefix plus a random UUID —
// never a name, email, year group, class, or school identifier (programme
// "Absolute exclusions" #4-5 apply to StudentReference; this rule is kept
// general for every identity kind).
export function newEntityId(prefix) {
  if (typeof prefix !== 'string' || !ID_PREFIX.test(prefix)) {
    throw Object.assign(new Error('newEntityId requires a lower_snake_case prefix'), {
      status: 400,
      code: 'validation_error'
    });
  }
  return `${prefix}_${randomUUID()}`;
}
