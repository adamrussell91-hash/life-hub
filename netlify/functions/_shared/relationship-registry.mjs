// Declared relationship types for Universal Links. Every relationship a
// Universal Link can carry must be declared here before use — the registry,
// not free text labels, controls validation, direction, inverse rendering,
// role values, metadata shape, and duplicate equivalence.

function declaration({
  key,
  sourceKinds,
  targetKinds,
  inverseLabel,
  cardinality,
  temporalMode,
  roleMode,
  metadataKeys = [],
  allowedVisibility = ['operator'],
  allowedRoles = null
}) {
  return Object.freeze({
    key,
    source_kinds: Object.freeze([...sourceKinds]),
    target_kinds: Object.freeze([...targetKinds]),
    inverse_label: inverseLabel,
    cardinality,
    temporal_mode: temporalMode,
    role_mode: roleMode,
    metadata_keys: Object.freeze([...metadataKeys]),
    allowed_visibility: Object.freeze([...allowedVisibility]),
    allowed_roles: allowedRoles == null ? null : Object.freeze([...allowedRoles]),
    // Fields whose combination defines "the same relationship" for
    // deterministic equivalence hashing (universal-link-schema.mjs).
    duplicate_fields: Object.freeze([
      'source_ref',
      'target_ref',
      'relationship_type',
      'context_key',
      'context_ref',
      'role',
      'valid_from',
      'occurred_at'
    ])
  });
}

// Slice 1 declarations — the first-slice set named in the implementation
// programme. Register further relationship keys only in the slice whose
// workflow needs them.
const REGISTRY = new Map([
  [
    'employee_at',
    declaration({
      key: 'employee_at',
      sourceKinds: ['shared:person'],
      targetKinds: ['shared:organisation'],
      inverseLabel: 'employs',
      cardinality: 'many_to_many',
      temporalMode: 'period',
      roleMode: 'optional_text'
    })
  ],
  [
    'member_of',
    declaration({
      key: 'member_of',
      sourceKinds: ['shared:person'],
      targetKinds: ['shared:organisation'],
      inverseLabel: 'has_member',
      cardinality: 'many_to_many',
      temporalMode: 'period',
      roleMode: 'optional_text'
    })
  ],
  [
    'collaborator',
    declaration({
      key: 'collaborator',
      sourceKinds: ['tasks:task'],
      targetKinds: ['shared:person'],
      inverseLabel: 'collaborates_on',
      cardinality: 'many_to_many',
      temporalMode: 'timeless',
      roleMode: 'none'
    })
  ],
  [
    'contact',
    declaration({
      key: 'contact',
      sourceKinds: ['tasks:task'],
      targetKinds: ['shared:person'],
      inverseLabel: 'contacted_for_task',
      cardinality: 'many_to_many',
      temporalMode: 'timeless',
      roleMode: 'none'
    })
  ],
  [
    'recipient',
    declaration({
      key: 'recipient',
      sourceKinds: ['professional:communication'],
      targetKinds: ['shared:person'],
      inverseLabel: 'received_communication',
      cardinality: 'many_to_many',
      temporalMode: 'point',
      roleMode: 'none'
    })
  ],
  [
    'about_person',
    declaration({
      key: 'about_person',
      sourceKinds: ['professional:communication'],
      targetKinds: ['shared:person'],
      inverseLabel: 'communication_about',
      cardinality: 'many_to_many',
      temporalMode: 'point',
      roleMode: 'none'
    })
  ],
  [
    'follows_from',
    declaration({
      key: 'follows_from',
      sourceKinds: ['professional:communication'],
      targetKinds: ['tasks:task'],
      inverseLabel: 'prompted_communication',
      cardinality: 'many_to_many',
      temporalMode: 'timeless',
      roleMode: 'none'
    })
  ],
  [
    'follow_up',
    declaration({
      key: 'follow_up',
      sourceKinds: ['tasks:task'],
      targetKinds: ['professional:communication', 'professional:meeting'],
      inverseLabel: 'has_follow_up',
      cardinality: 'many_to_many',
      temporalMode: 'timeless',
      roleMode: 'none'
    })
  ],
  [
    // Meeting attendee. Allowed optional roles: chair, minute_taker (null ok).
    'attendee',
    declaration({
      key: 'attendee',
      sourceKinds: ['professional:meeting'],
      targetKinds: ['shared:person'],
      inverseLabel: 'attends',
      cardinality: 'many_to_many',
      temporalMode: 'point',
      roleMode: 'optional_text',
      allowedRoles: ['chair', 'minute_taker']
    })
  ],
  [
    'preparation',
    declaration({
      key: 'preparation',
      sourceKinds: ['tasks:task'],
      targetKinds: ['professional:meeting'],
      inverseLabel: 'has_preparation',
      cardinality: 'many_to_many',
      temporalMode: 'timeless',
      roleMode: 'none'
    })
  ],
  [
    'venue',
    declaration({
      key: 'venue',
      sourceKinds: ['professional:event'],
      targetKinds: ['shared:organisation'],
      inverseLabel: 'hosts_event',
      cardinality: 'many_to_many',
      temporalMode: 'timeless',
      roleMode: 'none'
    })
  ],
  [
    'provider',
    declaration({
      key: 'provider',
      sourceKinds: ['professional:event'],
      targetKinds: ['shared:organisation'],
      inverseLabel: 'provides_event',
      cardinality: 'many_to_many',
      temporalMode: 'timeless',
      roleMode: 'none'
    })
  ],
  [
    'learning_for',
    declaration({
      key: 'learning_for',
      sourceKinds: ['tasks:task'],
      targetKinds: ['professional:event'],
      inverseLabel: 'has_learning_task',
      cardinality: 'many_to_many',
      temporalMode: 'timeless',
      roleMode: 'none'
    })
  ],
  [
    // Symmetric Knowledge / hub relationship. Display uses the same label in
    // both directions (`related_to`). migration_source metadata preserves
    // provenance from legacy Knowledge `connected` values.
    'related_to',
    declaration({
      key: 'related_to',
      sourceKinds: [
        'knowledge:page',
        'teaching:unit',
        'tasks:project',
        'life:decision',
        'professional:meeting',
        'professional:event'
      ],
      targetKinds: [
        'knowledge:page',
        'teaching:unit',
        'tasks:project',
        'life:decision',
        'professional:meeting',
        'professional:event'
      ],
      inverseLabel: 'related_to',
      cardinality: 'many_to_many',
      temporalMode: 'timeless',
      roleMode: 'none',
      metadataKeys: ['migration_source']
    })
  ]
]);

export function getRelationshipDeclaration(key) {
  return REGISTRY.get(key) ?? null;
}

export function listRelationshipDeclarations() {
  return [...REGISTRY.values()];
}

// Read-only public projection for the future `GET /api/relationship-registry`
// route (Slice 2). Excludes `duplicate_fields` — an internal detail of how
// the write path computes link equivalence, not something a client needs.
export function projectRelationshipRegistry() {
  return listRelationshipDeclarations().map(decl => ({
    key: decl.key,
    source_kinds: [...decl.source_kinds],
    target_kinds: [...decl.target_kinds],
    inverse_label: decl.inverse_label,
    cardinality: decl.cardinality,
    temporal_mode: decl.temporal_mode,
    role_mode: decl.role_mode,
    metadata_keys: [...decl.metadata_keys],
    allowed_visibility: [...decl.allowed_visibility],
    ...(decl.allowed_roles ? { allowed_roles: [...decl.allowed_roles] } : {})
  }));
}

function validationError(code, message) {
  return Object.assign(new Error(message), { status: 400, code });
}

function refKind(ref) {
  return ref?.namespace && ref?.kind ? `${ref.namespace}:${ref.kind}` : '';
}

function isIsoTimestamp(value) {
  if (typeof value !== 'string' || !value) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
}

// Validates a prospective Universal Link's relationship shape against its
// registry declaration. Does not touch storage or resolve endpoints — it
// only knows about parsed EntityRef objects and the fields the caller
// proposes to store. Throws a validation_error with a specific `code` on
// the first violation found; returns the resolved declaration on success.
export function validateRelationshipInput({
  sourceRef,
  targetRef,
  relationshipType,
  role = null,
  validFrom = null,
  validTo = null,
  occurredAt = null,
  metadata = {},
  visibility = 'operator'
} = {}) {
  const decl = getRelationshipDeclaration(relationshipType);
  if (!decl) {
    throw validationError('unknown_relationship_key', `Unknown relationship type: ${relationshipType}`);
  }

  const sourceKind = refKind(sourceRef);
  const targetKind = refKind(targetRef);
  if (!decl.source_kinds.includes(sourceKind)) {
    throw validationError(
      'invalid_source_kind',
      `Relationship ${decl.key} does not permit source kind ${sourceKind || '(unparsed)'}`
    );
  }
  if (!decl.target_kinds.includes(targetKind)) {
    throw validationError(
      'invalid_target_kind',
      `Relationship ${decl.key} does not permit target kind ${targetKind || '(unparsed)'}`
    );
  }

  if (decl.temporal_mode === 'timeless') {
    if (validFrom !== null || validTo !== null) {
      throw validationError('dates_on_timeless_relationship', `${decl.key} is timeless and cannot carry dates`);
    }
    if (occurredAt !== null) {
      throw validationError('dates_on_timeless_relationship', `${decl.key} is timeless and cannot carry occurred_at`);
    }
  } else if (decl.temporal_mode === 'period') {
    if (occurredAt !== null) {
      throw validationError('occurred_at_on_period_relationship', `${decl.key} is a period relationship; use valid_from/valid_to`);
    }
    if (validFrom !== null && !isIsoTimestamp(validFrom)) {
      throw validationError('invalid_valid_from', `${decl.key} valid_from must be an ISO timestamp`);
    }
    if (validTo !== null) {
      if (!isIsoTimestamp(validTo)) {
        throw validationError('invalid_valid_to', `${decl.key} valid_to must be an ISO timestamp`);
      }
      if (validFrom !== null && new Date(validTo).getTime() < new Date(validFrom).getTime()) {
        throw validationError('valid_to_before_valid_from', `${decl.key} valid_to cannot precede valid_from`);
      }
    }
  } else if (decl.temporal_mode === 'point') {
    if (validFrom !== null || validTo !== null) {
      throw validationError('dates_on_point_relationship', `${decl.key} is point-in-time; use occurred_at, not valid_from/valid_to`);
    }
    if (occurredAt !== null && !isIsoTimestamp(occurredAt)) {
      throw validationError('invalid_occurred_at', `${decl.key} occurred_at must be an ISO timestamp`);
    }
  }

  if (decl.role_mode === 'none' && role !== null) {
    throw validationError('role_not_permitted', `${decl.key} does not accept a role value`);
  }
  if (role !== null && typeof role !== 'string') {
    throw validationError('invalid_role', `${decl.key} role must be a string or null`);
  }
  if (decl.allowed_roles && role !== null && !decl.allowed_roles.includes(role)) {
    throw validationError(
      'invalid_role',
      `${decl.key} role must be one of: ${decl.allowed_roles.join(', ')}`
    );
  }

  const metadataObject = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : null;
  if (!metadataObject) {
    throw validationError('invalid_metadata', `${decl.key} metadata must be an object`);
  }
  for (const metadataKey of Object.keys(metadataObject)) {
    if (!decl.metadata_keys.includes(metadataKey)) {
      throw validationError('unknown_metadata_key', `${decl.key} does not declare metadata key ${metadataKey}`);
    }
  }

  if (!decl.allowed_visibility.includes(visibility)) {
    throw validationError('visibility_not_allowed', `${decl.key} does not permit visibility ${visibility}`);
  }

  return decl;
}
