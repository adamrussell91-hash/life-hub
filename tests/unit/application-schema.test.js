import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertApplicationPipelineTransition,
  parseApplicationRecord,
  projectApplication,
  validateApplicationCreateInput,
  validateApplicationFieldUpdate
} from '../../netlify/functions/_shared/application-schema.mjs';

const APPLICATION_ID = 'application_00000000-0000-4000-8000-000000000001';

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
    pipeline_status: 'researching',
    documents: [],
    selection_criteria: [],
    interview_rounds: [],
    outcome: null,
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
    links: [{ target_ref: 'shared:organisation:organisation_x', relationship_type: 'applicant_to' }]
  });
  assert.equal(validated.position_title, 'Classroom Teacher');
  assert.equal(validated.pipeline_status, undefined);
  assert.throws(
    () =>
      validateApplicationCreateInput({
        position_title: 'x',
        organisation_id: 'organisation_x'
      }),
    (error) => error.code === 'unknown_field'
  );
  assert.throws(
    () =>
      validateApplicationCreateInput({
        position_title: 'x',
        person_id: 'person_x'
      }),
    (error) => error.code === 'unknown_field'
  );

  const record = baseRecord();
  assert.ok(parseApplicationRecord(record));
  assert.equal(parseApplicationRecord({ ...record, organisation_id: 'x' }), null);
  assert.equal(parseApplicationRecord({ ...record, contact_ids: [] }), null);
  assert.equal(parseApplicationRecord({ ...record, task_id: 'task_x' }), null);
  assert.equal(parseApplicationRecord({ ...record, page_id: 'page_x' }), null);
});

test('application pipeline transitions are explicit and terminal', () => {
  assertApplicationPipelineTransition('researching', 'preparing');
  assertApplicationPipelineTransition('preparing', 'submitted');
  assertApplicationPipelineTransition('submitted', 'interview');
  assertApplicationPipelineTransition('interview', 'offered');
  assertApplicationPipelineTransition('offered', 'accepted');
  assertApplicationPipelineTransition('offered', 'declined');
  assertApplicationPipelineTransition('researching', 'withdrawn');
  assertApplicationPipelineTransition('submitted', 'unsuccessful');
  assert.throws(
    () => assertApplicationPipelineTransition('accepted', 'preparing'),
    (e) => e.code === 'invalid_pipeline_transition'
  );
  assert.throws(
    () => assertApplicationPipelineTransition('researching', 'offered'),
    (e) => e.code === 'invalid_pipeline_transition'
  );
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
    outcome: {
      status: 'offered',
      date: '2026-10-01',
      offer_details: '0.8 FTE',
      reason: null
    }
  });
  const patch = validateApplicationFieldUpdate(
    { advertisement: { url: 'https://example.com/new' } },
    existing
  );
  assert.equal(patch.advertisement.title, 'Keep me');
  assert.equal(patch.advertisement.url, 'https://example.com/new');
  assert.equal(patch.advertisement.source, 'Seek');

  const outcomePatch = validateApplicationFieldUpdate({ outcome: { reason: 'relocating' } }, existing);
  assert.equal(outcomePatch.outcome.status, 'offered');
  assert.equal(outcomePatch.outcome.offer_details, '0.8 FTE');
  assert.equal(outcomePatch.outcome.reason, 'relocating');
});

test('documents, criteria, and interview rounds validate shapes', () => {
  const validated = validateApplicationCreateInput({
    position_title: 'Teacher',
    documents: [
      {
        document_type: 'resume',
        label: 'CV',
        url_or_storage_ref: 'blob:cv-v1',
        version: '1',
        status: 'ready'
      }
    ],
    selection_criteria: [
      { criterion: 'Demonstrated excellence', response: 'Draft answer', order: 0, completed: false }
    ],
    interview_rounds: [
      {
        date: '2026-10-15T02:00:00.000Z',
        time_zone: 'Australia/Sydney',
        format: 'video',
        location: null,
        preparation_notes: 'Review panel pack',
        panel_notes: null,
        result: 'pending',
        lifecycle_state: 'scheduled'
      }
    ]
  });
  assert.equal(validated.documents.length, 1);
  assert.equal(validated.selection_criteria[0].order, 0);
  assert.equal(validated.interview_rounds[0].format, 'video');

  const projected = projectApplication(baseRecord({ documents: validated.documents }));
  assert.equal(projected.documents[0].label, 'CV');
  assert.equal('organisation_id' in projected, false);
});
