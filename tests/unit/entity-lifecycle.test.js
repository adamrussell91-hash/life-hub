import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ORGANISATION_TRANSITIONS,
  PERSON_TRANSITIONS,
  applyLifecycleTransition,
  assertLifecycleTransitionAllowed,
  writeLifecycleEvent
} from '../../netlify/functions/_shared/entity-lifecycle.mjs';
import { TOMBSTONE_LABEL, generatePersonId } from '../../netlify/functions/_shared/identity-schema.mjs';
import { entityEventsPrefix } from '../../netlify/functions/_shared/universal-link-blobs.mjs';

function createMemoryStore() {
  const map = new Map();
  return {
    async setJSON(key, value) { map.set(key, value); },
    async list({ prefix = '' } = {}) {
      return { blobs: [...map.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) };
    },
    _dump() { return [...map.entries()]; }
  };
}

test('PERSON_TRANSITIONS matches the documented graph exactly', () => {
  assert.deepEqual([...PERSON_TRANSITIONS.active].sort(), ['archived', 'deidentified', 'inactive', 'retained']);
  assert.deepEqual([...PERSON_TRANSITIONS.inactive].sort(), ['active', 'archived', 'deidentified', 'retained']);
  assert.deepEqual([...PERSON_TRANSITIONS.archived].sort(), ['active', 'deidentified', 'retained']);
  assert.deepEqual([...PERSON_TRANSITIONS.retained].sort(), ['archived', 'deidentified', 'deleted']);
  assert.deepEqual([...PERSON_TRANSITIONS.deidentified].sort(), ['deleted']);
  assert.deepEqual([...PERSON_TRANSITIONS.deleted], []);
});

test('ORGANISATION_TRANSITIONS omits deidentified entirely (resolved decision)', () => {
  assert.deepEqual([...ORGANISATION_TRANSITIONS.active].sort(), ['archived', 'inactive', 'retained']);
  assert.deepEqual([...ORGANISATION_TRANSITIONS.retained].sort(), ['archived', 'deleted']);
  assert.equal('deidentified' in ORGANISATION_TRANSITIONS, false);
});

test('assertLifecycleTransitionAllowed permits every documented transition and rejects everything else', () => {
  assert.doesNotThrow(() => assertLifecycleTransitionAllowed({ kind: 'person', fromStatus: 'active', toStatus: 'inactive', isSelf: false }));
  assert.doesNotThrow(() => assertLifecycleTransitionAllowed({
    kind: 'person', fromStatus: 'active', toStatus: 'retained', isSelf: false, retentionReason: 'legal_hold', retentionReviewAt: '2027-01-01T00:00:00.000Z'
  }));
  assert.throws(
    () => assertLifecycleTransitionAllowed({ kind: 'person', fromStatus: 'deleted', toStatus: 'active', isSelf: false }),
    error => error.status === 409 && error.code === 'invalid_lifecycle_transition'
  );
  assert.throws(
    () => assertLifecycleTransitionAllowed({ kind: 'organisation', fromStatus: 'active', toStatus: 'deidentified', isSelf: false }),
    error => error.code === 'invalid_lifecycle_transition'
  );
});

test('retained requires retention_reason and an ISO retention_review_at', () => {
  assert.throws(
    () => assertLifecycleTransitionAllowed({ kind: 'person', fromStatus: 'active', toStatus: 'retained', isSelf: false }),
    error => error.code === 'retention_reason_required'
  );
  assert.throws(
    () => assertLifecycleTransitionAllowed({ kind: 'person', fromStatus: 'active', toStatus: 'retained', isSelf: false, retentionReason: 'legal_hold' }),
    error => error.code === 'retention_review_at_required'
  );
  assert.throws(
    () => assertLifecycleTransitionAllowed({
      kind: 'person', fromStatus: 'active', toStatus: 'retained', isSelf: false, retentionReason: 'legal_hold', retentionReviewAt: 'not-a-date'
    }),
    error => error.code === 'retention_review_at_required'
  );
});

test('the self identity rejects archived, retained, deidentified, and deleted but permits active/inactive toggling', () => {
  for (const toStatus of ['archived', 'retained', 'deidentified', 'deleted']) {
    assert.throws(
      () => assertLifecycleTransitionAllowed({
        kind: 'person', fromStatus: 'active', toStatus, isSelf: true, retentionReason: 'x', retentionReviewAt: '2027-01-01T00:00:00.000Z'
      }),
      error => error.status === 403 && error.code === 'self_identity_protected',
      `expected self to reject ${toStatus}`
    );
  }
  assert.doesNotThrow(() => assertLifecycleTransitionAllowed({ kind: 'person', fromStatus: 'active', toStatus: 'inactive', isSelf: true }));
  assert.doesNotThrow(() => assertLifecycleTransitionAllowed({ kind: 'person', fromStatus: 'inactive', toStatus: 'active', isSelf: true }));
});

test('applyLifecycleTransition sets lifecycle_status/updated_at and clears retention fields off "retained"', () => {
  const record = {
    id: generatePersonId(), kind: 'person', display_name: 'Seth Example', sort_name: null, aliases: [],
    lifecycle_status: 'retained', is_self: false, retention_reason: 'legal_hold', retention_review_at: '2027-01-01T00:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z'
  };
  const reactivated = applyLifecycleTransition({ record, toStatus: 'archived', now: '2026-09-11T00:00:00.000Z' });
  assert.equal(reactivated.lifecycle_status, 'archived');
  assert.equal(reactivated.retention_reason, null);
  assert.equal(reactivated.retention_review_at, null);
  assert.equal(reactivated.updated_at, '2026-09-11T00:00:00.000Z');
  assert.equal(reactivated.display_name, 'Seth Example', 'archiving does not redact the name');
});

test('applyLifecycleTransition physically redacts identifying fields when transitioning to deleted or deidentified', () => {
  const record = {
    id: generatePersonId(), kind: 'person', display_name: 'Seth Example', sort_name: 'Example, Seth', aliases: ['Sethy'],
    lifecycle_status: 'active', is_self: false, retention_reason: null, retention_review_at: null,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z'
  };
  const deleted = applyLifecycleTransition({ record, toStatus: 'deleted', now: '2026-09-11T00:00:00.000Z' });
  assert.equal(deleted.display_name, TOMBSTONE_LABEL);
  assert.deepEqual(deleted.aliases, []);
  assert.equal(deleted.sort_name, null);

  const deidentified = applyLifecycleTransition({ record, toStatus: 'deidentified', now: '2026-09-11T00:00:00.000Z' });
  assert.equal(deidentified.display_name, TOMBSTONE_LABEL);
});

test('applyLifecycleTransition sets retention_reason/retention_review_at when transitioning to retained', () => {
  const record = {
    id: generatePersonId(), kind: 'person', display_name: 'Seth Example', sort_name: null, aliases: [],
    lifecycle_status: 'active', is_self: false, retention_reason: null, retention_review_at: null,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z'
  };
  const retained = applyLifecycleTransition({
    record, toStatus: 'retained', retentionReason: 'legal_hold', retentionReviewAt: '2027-01-01T00:00:00.000Z', now: '2026-09-11T00:00:00.000Z'
  });
  assert.equal(retained.retention_reason, 'legal_hold');
  assert.equal(retained.retention_review_at, '2027-01-01T00:00:00.000Z');
});

test('writeLifecycleEvent writes one event Blob under entities/events/<hash>/ with no display label', async () => {
  const store = createMemoryStore();
  const ref = `shared:person:${generatePersonId()}`;
  const event = await writeLifecycleEvent(store, { entityRef: ref, fromStatus: 'active', toStatus: 'archived', now: '2026-09-11T00:00:00.000Z' });
  assert.equal(event.entity_ref, ref);
  assert.equal(event.from_status, 'active');
  assert.equal(event.to_status, 'archived');
  const [[key, value]] = store._dump();
  assert.ok(key.startsWith(entityEventsPrefix(ref)));
  assert.deepEqual(value, event);
  assert.doesNotMatch(JSON.stringify(event), /Seth|display_label|display_name/i);
});
