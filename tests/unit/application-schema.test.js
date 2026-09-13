import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertApplicationStateTransition,
  deriveApplicationOperationId,
  parseApplicationRecord,
  projectApplication,
  validateApplicationCreateInput,
  validateApplicationFieldUpdate
} from '../../netlify/functions/_shared/application-schema.mjs';

const APPLICATION_ID = 'application_00000000-0000-4000-8000-000000000001';
const DOC_ID = 'adoc_00000000-0000-4000-8000-000000000011';
const CRIT_ID = 'acrit_00000000-0000-4000-8000-000000000021';
const INT_ID = 'aint_00000000-0000-4000-8000-000000000031';

function baseRecord(overrides = {}) {
  return {
    schema_version: 1,
    id: APPLICATION_ID,
    position_title: 'Classroom Teacher',
    advertisement: {
      title: 'Classroom Teacher — Stage 3',
      url: 'https://example.com/jobs/1',
      source: 'Seek',
      summary: 'Full-time ongoing',
      captured_at: '2026-09-01T00:00:00.000Z'
    },
    closing_date: '2026-09-30',
    pipeline_status: 'drafting',
    documents: [],
    selection_criteria: [],
    interview_rounds: [],
    outcome: { status: 'none', date: null, offer_details: null, reason: null },
    reflection: null,
    created_at: '2026-09-12T00:00:00.000Z',
    updated_at: '2026-09-12T00:00:00.000Z',
    ...overrides
  };
}

test('application create validation and parse reject relationship id fields', () => {
  const validated = validateApplicationCreateInput({
    position_title: 'Classroom Teacher',
    advertisement: { title: 'Ad', url: null, source: 'Seek', summary: null, captured_at: null },
    closing_date: '2026-09-30',
    links: [{ target_ref: 'shared:organisation:organisation_x', relationship_type: 'applies_to' }]
  });
  assert.equal(validated.position_title, 'Classroom Teacher');
  assert.throws(
    () => validateApplicationCreateInput({ position_title: 'x', organisation_id: 'organisation_x' }),
    (error) => error.code === 'unknown_field'
  );
  assert.throws(
    () => validateApplicationCreateInput({ position_title: 'x', person_id: 'person_x' }),
    (error) => error.code === 'unknown_field'
  );
  const record = baseRecord();
  assert.ok(parseApplicationRecord(record));
  assert.equal(parseApplicationRecord({ ...record, organisation_id: 'x' }), null);
  assert.equal(parseApplicationRecord({ ...record, contact_ids: [] }), null);
  assert.equal(parseApplicationRecord({ ...record, task_id: 'task_x' }), null);
  assert.equal(parseApplicationRecord({ ...record, page_id: 'page_x' }), null);
  assert.equal(parseApplicationRecord({ ...record, link_id: 'ul_x' }), null);
});

test('application pipeline transitions are explicit and terminal', () => {
  assertApplicationStateTransition('drafting', 'ready');
  assertApplicationStateTransition('ready', 'submitted');
  assertApplicationStateTransition('submitted', 'under_review');
  assertApplicationStateTransition('under_review', 'interviewing');
  assertApplicationStateTransition('interviewing', 'offer');
  assertApplicationStateTransition('interviewing', 'interviewing');
  assertApplicationStateTransition('offer', 'accepted');
  assertApplicationStateTransition('offer', 'declined');
  assertApplicationStateTransition('drafting', 'withdrawn');
  assertApplicationStateTransition('submitted', 'unsuccessful');
  assert.throws(() => assertApplicationStateTransition('accepted', 'ready'), (e) => e.code === 'invalid_pipeline_transition');
  assert.throws(() => assertApplicationStateTransition('drafting', 'offer'), (e) => e.code === 'invalid_pipeline_transition');
});

test('partial advertisement and outcome updates preserve existing nested fields', () => {
  const existing = baseRecord({
    advertisement: {
      title: 'Keep me',
      url: 'https://example.com/old',
      source: 'Seek',
      summary: 'Summary',
      captured_at: '2026-09-01T00:00:00.000Z'
    },
    outcome: { status: 'offer', date: '2026-10-01', offer_details: '0.8 FTE', reason: null }
  });
  const patch = validateApplicationFieldUpdate({ advertisement: { url: 'https://example.com/new' } }, existing);
  assert.equal(patch.advertisement.title, 'Keep me');
  assert.equal(patch.advertisement.url, 'https://example.com/new');
  assert.equal(patch.advertisement.source, 'Seek');
  const outcomePatch = validateApplicationFieldUpdate({ outcome: { reason: 'relocating' } }, existing);
  assert.equal(outcomePatch.outcome.status, 'offer');
  assert.equal(outcomePatch.outcome.offer_details, '0.8 FTE');
  assert.equal(outcomePatch.outcome.reason, 'relocating');
});

test('documents, criteria, and interview rounds validate shapes and reject unknowns', () => {
  const validated = validateApplicationCreateInput({
    position_title: 'Teacher',
    documents: [{ document_type: 'resume', label: 'CV', url: null, storage_ref: 'blob:cv-v1', version: '1', status: 'draft' }],
    selection_criteria: [{ criterion: 'Demonstrated excellence', response: 'Draft answer', order: 0, completed: false }],
    interview_rounds: [{
      scheduled_at: '2026-10-15T02:00:00.000Z',
      time_zone: 'Australia/Sydney',
      format: 'video',
      location_text: null,
      preparation_notes: 'Review panel pack',
      panel_notes: null,
      result: 'pending',
      lifecycle_state: 'planned'
    }]
  });
  assert.equal(validated.documents.length, 1);
  assert.match(validated.documents[0].id, /^adoc_/);
  assert.match(validated.selection_criteria[0].id, /^acrit_/);
  assert.match(validated.interview_rounds[0].id, /^aint_/);
  assert.throws(
    () => validateApplicationCreateInput({
      position_title: 'Teacher',
      documents: [{ document_type: 'resume', label: 'CV', version: '1', status: 'draft', org_id: 'x' }]
    }),
    (e) => e.code === 'unknown_field'
  );
  assert.throws(
    () => validateApplicationCreateInput({
      position_title: 'Teacher',
      interview_rounds: [{
        scheduled_at: '2026-10-15T02:00:00.000Z',
        time_zone: 'Not/AZone',
        format: 'video',
        lifecycle_state: 'planned'
      }]
    }),
    (e) => e.code === 'invalid_time_zone'
  );
  const stored = baseRecord({
    documents: [{ id: DOC_ID, document_type: 'resume', label: 'CV', url: null, storage_ref: 'blob:cv-v1', version: '1', status: 'draft' }],
    selection_criteria: [{ id: CRIT_ID, criterion: 'Excellence', response: null, order: 1, completed: false }],
    interview_rounds: [{
      id: INT_ID,
      scheduled_at: '2026-10-15T02:00:00.000Z',
      time_zone: 'Australia/Sydney',
      format: 'video',
      location_text: null,
      preparation_notes: null,
      panel_notes: null,
      result: null,
      lifecycle_state: 'planned'
    }]
  });
  assert.ok(parseApplicationRecord(stored));
  assert.equal(projectApplication(stored).documents[0].label, 'CV');
});

test('closing_date accepts YYYY-MM-DD or full ISO; advertisement unknown keys rejected', () => {
  assert.ok(validateApplicationCreateInput({ position_title: 'A', closing_date: '2026-09-30T12:00:00.000Z' }).closing_date);
  assert.throws(
    () => validateApplicationCreateInput({ position_title: 'A', advertisement: { title: 'x', organisation_id: 'nope' } }),
    (e) => e.code === 'unknown_field'
  );
});

test('deriveApplicationOperationId is deterministic aop_ hex', () => {
  const a = deriveApplicationOperationId(['create_application_links', APPLICATION_ID, ['ul_1']]);
  const b = deriveApplicationOperationId(['create_application_links', APPLICATION_ID, ['ul_1']]);
  assert.equal(a, b);
  assert.match(a, /^aop_[0-9a-f]{32}$/);
});
