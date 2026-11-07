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

const CARD_ID = 'achievement_00000000-0000-4000-8000-000000000041';

function oldCriterion(overrides = {}) {
  return { id: CRIT_ID, criterion: 'Leads curriculum change', response: 'Draft', order: 0, completed: false, ...overrides };
}

test('old application records without the prep keys still parse', () => {
  const parsed = parseApplicationRecord(baseRecord({ selection_criteria: [oldCriterion()] }));
  assert.ok(parsed);
  assert.equal(parsed.cover_letter, null);
  assert.equal(parsed.cv, null);
  assert.deepEqual(parsed.selection_criteria[0], {
    ...oldCriterion(),
    word_limit: null,
    check: null,
    response_source: null,
    response_drafted_at: null,
    response_pending: null
  });
});

test('stored criteria accept word limit, check and draft keys, and reject bad values', () => {
  const check = { status: 'partly', evidence: 'Ran a reading program', card_ids: [CARD_ID], confirmed_at: '2026-11-01T00:00:00.000Z' };
  const full = oldCriterion({
    word_limit: 250,
    check,
    response_source: 'ann',
    response_drafted_at: '2026-11-01T00:00:00.000Z',
    response_pending: 'A newer draft'
  });
  const piece = { text: 'Dear panel', source: 'ann', drafted_at: null, updated_at: '2026-11-01T00:00:00.000Z', pending: null };
  const parsed = parseApplicationRecord(baseRecord({ selection_criteria: [full], cover_letter: piece, cv: { ...piece, text: 'Profile' } }));
  assert.ok(parsed);
  assert.deepEqual(parsed.selection_criteria[0].check, check);
  assert.equal(parsed.cover_letter.text, 'Dear panel');
  for (const bad of [
    { word_limit: 10 },
    { word_limit: 2001 },
    { word_limit: 250.5 },
    { check: { ...check, status: 'maybe' } },
    { check: { ...check, evidence: 'x'.repeat(301) } },
    { check: { ...check, card_ids: Array(7).fill(CARD_ID) } },
    { check: { ...check, card_ids: ['not-a-card'] } },
    { check: { ...check, extra: 1 } },
    { response_source: 'clare' },
    { response_pending: 'x'.repeat(16001) },
    { notes: 'unknown key' }
  ]) {
    assert.equal(parseApplicationRecord(baseRecord({ selection_criteria: [oldCriterion(bad)] })), null, JSON.stringify(Object.keys(bad)));
  }
  assert.equal(parseApplicationRecord(baseRecord({ cover_letter: { ...piece, text: 'x'.repeat(8001) } })), null);
  assert.ok(parseApplicationRecord(baseRecord({ cv: { ...piece, text: 'x'.repeat(8001) } })));
  assert.equal(parseApplicationRecord(baseRecord({ cv: { ...piece, source: 'clare' } })), null);
  assert.equal(parseApplicationRecord(baseRecord({ cv: { ...piece, extra: true } })), null);
});

test('field update validates word_limit, check, cover letter and CV', () => {
  const patch = validateApplicationFieldUpdate({
    selection_criteria: [{ criterion: 'Leads change (250 words)', order: 0, completed: false, word_limit: 250 }],
    cover_letter: { text: ' Dear panel ', source: 'adam' },
    cv: null
  });
  assert.equal(patch.selection_criteria[0].word_limit, 250);
  assert.equal(patch.selection_criteria[0].check, null);
  assert.equal(patch.cover_letter.text, 'Dear panel');
  assert.equal(patch.cover_letter.pending, null);
  assert.ok(patch.cover_letter.updated_at);
  assert.equal(patch.cv, null);
  const crit = { criterion: 'x', order: 0, completed: false };
  for (const [bad, code] of [
    [{ word_limit: 5 }, 'invalid_word_limit'],
    [{ notes: 'x' }, 'unknown_field'],
    [{ evidence_refs: [] }, 'unknown_field'],
    [{ check: { status: 'have', evidence: '', card_ids: [], confirmed_at: 'nope' } }, 'invalid_check_confirmed_at'],
    [{ response_source: 'ann!' }, 'invalid_response_source']
  ]) {
    assert.throws(() => validateApplicationFieldUpdate({ selection_criteria: [{ ...crit, ...bad }] }), (e) => e.code === code);
  }
  assert.throws(
    () => validateApplicationFieldUpdate({ cover_letter: { text: 'x'.repeat(8001) } }),
    (e) => e.code === 'cover_letter_too_long'
  );
  assert.throws(() => validateApplicationFieldUpdate({ cv: { text: 'x', colour: 'red' } }), (e) => e.code === 'unknown_field');
});
