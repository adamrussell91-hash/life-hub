import { createHash } from 'node:crypto';

// Canonical entity reference implementation for the Universal Links programme.
// This is a new, separate implementation from `hub-ref.mjs`, which stays the
// legacy adapter for Knowledge `connected` links until migration (Slice 7).
// Do not extend `hub-ref.mjs` with these namespaces.

const REF_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;

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
  teaching: new Set(['unit']),
  knowledge: new Set(['page']),
  life: new Set(['decision'])
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

// Format validation, not existence or access. A malformed or unregistered
// ref is a caller error (400) — distinct from `entity-access.mjs`'s
// `endpointNotFoundError` (404), which is about existence/visibility of an
// otherwise well-formed ref. Accepts either a string or an already-parsed
// { namespace, kind, id } object and always returns the parsed object.
export function assertRegisteredEntityRef(refInput) {
  const ref = typeof refInput === 'string' ? parseEntityRef(refInput) : refInput;
  const valid = ref && isRegisteredEntityRefKind(ref.namespace, ref.kind) && formatEntityRef(ref);
  if (!valid) {
    throw Object.assign(new Error(`Invalid or unregistered entity ref: ${JSON.stringify(refInput)}`), {
      status: 400,
      code: 'invalid_entity_ref'
    });
  }
  return ref;
}

// SHA-256 hash of the canonical ref string, used for Universal Link
// membership key safety (implementation programme, "Storage layout": "Hash
// canonical refs for key safety with SHA 256"). Accepts a string or a
// parsed ref object.
export function hashEntityRef(refInput) {
  const canonical = typeof refInput === 'string' ? refInput : formatEntityRef(refInput);
  if (!canonical) {
    throw Object.assign(new Error(`Cannot hash an unformattable entity ref: ${JSON.stringify(refInput)}`), {
      status: 400,
      code: 'invalid_entity_ref'
    });
  }
  return createHash('sha256').update(canonical).digest('hex');
}
