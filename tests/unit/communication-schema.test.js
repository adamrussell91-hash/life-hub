import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COMMUNICATION_SCHEMA_VERSION,
  SUBJECT_MAX_LENGTH,
  SUMMARY_MAX_LENGTH,
  communicationDisplayLabel,
  compareCommunicationsNewestFirst,
  deriveCommunicationOperationId,
  generateCommunicationId,
  isValidCommunicationId,
  parseCommunicationRecord,
  projectCommunication,
  validateCommunicationCreateInput,
  validateCommunicationFieldUpdate
} from '../../netlify/functions/_shared/communication-schema.mjs';
import { communicationKey, communicationOperationKey } from '../../netlify/functions/_shared/professional-blobs.mjs';

test('generateCommunicationId is path-safe and validates', () => {
  const id = generateCommunicationId();
  assert.equal(isValidCommunicationId(id), true);
  assert.match(id, /^communication_[0-9a-f-]{36}$/);
});

test('rejects unsafe communication ids before key construction', () => {
  assert.throws(() => communicationKey('../etc/passwd'), (error) => error.code === 'invalid_communication_id');
  assert.throws(() => communicationKey('communication_not-a-uuid'), (error) => error.code === 'invalid_communication_id');
  assert.throws(
    () => communicationOperationKey('op_not_valid'),
    (error) => error.code === 'invalid_communication_operation_id'
  );
});

test('deriveCommunicationOperationId is deterministic and path-safe', () => {
  const a = deriveCommunicationOperationId(['create_communication_links', 'x', ['ul_1']]);
  const b = deriveCommunicationOperationId(['create_communication_links', 'x', ['ul_1']]);
  assert.equal(a, b);
  assert.match(a, /^cop_[0-9a-f]{32}$/);
});

test('parseCommunicationRecord rejects unknown fields and direction/status mismatch', () => {
  const id = generateCommunicationId();
  const base = {
    schema_version: COMMUNICATION_SCHEMA_VERSION,
    id,
    direction: 'outbound',
    channel: 'email',
    occurred_at: '2026-09-01T10:00:00.000Z',
    subject: 'Hello',
    summary: 'Body',
    status: 'completed',
    created_at: '2026-09-01T10:00:00.000Z',
    updated_at: '2026-09-01T10:00:00.000Z'
  };
  assert.ok(parseCommunicationRecord(base));
  assert.equal(parseCommunicationRecord({ ...base, recipient_id: 'x' }), null);
  assert.equal(parseCommunicationRecord({ ...base, status: 'received' }), null);
});

test('validateCommunicationCreateInput trims, bounds, and derives status', () => {
  const validated = validateCommunicationCreateInput({
    direction: 'inbound',
    channel: 'phone',
    occurred_at: '2026-09-01T10:00:00.000Z',
    subject: '  hi  ',
    summary: '  note  ',
    links: []
  });
  assert.equal(validated.status, 'received');
  assert.equal(validated.subject, 'hi');
  assert.equal(validated.summary, 'note');
});

test('validateCommunicationCreateInput rejects unknown fields and overlong subject/summary', () => {
  assert.throws(
    () =>
      validateCommunicationCreateInput({
        direction: 'outbound',
        channel: 'email',
        occurred_at: '2026-09-01T10:00:00.000Z',
        person_id: 'x'
      }),
    (error) => error.code === 'unknown_field'
  );
  assert.throws(
    () =>
      validateCommunicationCreateInput({
        direction: 'outbound',
        channel: 'email',
        occurred_at: '2026-09-01T10:00:00.000Z',
        subject: 'x'.repeat(SUBJECT_MAX_LENGTH + 1)
      }),
    (error) => error.code === 'subject_too_long'
  );
  assert.throws(
    () =>
      validateCommunicationCreateInput({
        direction: 'outbound',
        channel: 'email',
        occurred_at: '2026-09-01T10:00:00.000Z',
        summary: 'x'.repeat(SUMMARY_MAX_LENGTH + 1)
      }),
    (error) => error.code === 'summary_too_long'
  );
});

test('validateCommunicationFieldUpdate only accepts subject/summary', () => {
  assert.deepEqual(validateCommunicationFieldUpdate({ subject: ' A ' }), { subject: 'A' });
  assert.throws(
    () => validateCommunicationFieldUpdate({ direction: 'inbound' }),
    (error) => error.code === 'unknown_field'
  );
});

test('display label prefers subject and never uses summary', () => {
  assert.equal(
    communicationDisplayLabel({
      subject: 'Proposal',
      summary: 'secret',
      channel: 'email',
      occurred_at: '2026-09-01T00:00:00.000Z'
    }),
    'Proposal'
  );
  assert.equal(
    communicationDisplayLabel({
      subject: '',
      summary: 'secret',
      channel: 'in_person',
      occurred_at: '2026-09-01T00:00:00.000Z'
    }),
    'in person · 2026-09-01'
  );
});

test('projectCommunication optionally attaches incomplete_links without mutating the record', () => {
  const id = generateCommunicationId();
  const record = {
    schema_version: COMMUNICATION_SCHEMA_VERSION,
    id,
    direction: 'outbound',
    channel: 'email',
    occurred_at: '2026-09-01T10:00:00.000Z',
    subject: 'Hello',
    summary: 'Body',
    status: 'completed',
    created_at: '2026-09-01T10:00:00.000Z',
    updated_at: '2026-09-01T10:00:00.000Z'
  };
  const projected = projectCommunication(record, {
    operation_id: 'cop_1',
    status: 'repair_needed',
    completed_link_ids: [],
    failed_intent_ids: ['intent_1'],
    pending_intent_ids: ['intent_1']
  });
  assert.equal(projected.incomplete_links.operation_id, 'cop_1');
  assert.equal(Object.prototype.hasOwnProperty.call(record, 'incomplete_links'), false);
});

test('list sort is occurred_at desc then id', () => {
  const rows = [
    { id: 'communication_a', occurred_at: '2026-01-01T00:00:00.000Z' },
    { id: 'communication_c', occurred_at: '2026-02-01T00:00:00.000Z' },
    { id: 'communication_b', occurred_at: '2026-02-01T00:00:00.000Z' }
  ];
  rows.sort(compareCommunicationsNewestFirst);
  assert.deepEqual(
    rows.map((row) => row.id),
    ['communication_c', 'communication_b', 'communication_a']
  );
});

const V1 = {
  schema_version: 1,
  id: 'communication_00000000-0000-4000-8000-000000000001',
  direction: 'outbound',
  channel: 'in_person',
  occurred_at: '2026-10-14T00:50:00.000Z',
  subject: 'Declan essay feedback',
  summary: '',
  status: 'completed',
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z'
};

test('comm schema is v2 and v1 records read with empty v2 fields', () => {
  assert.equal(COMMUNICATION_SCHEMA_VERSION, 2);
  const parsed = parseCommunicationRecord(V1);
  assert.equal(parsed.scheduled_start, null);
  assert.equal(parsed.scheduled_end, null);
  assert.equal(parsed.time_zone, null);
  assert.equal(parsed.purpose_tag, null);
  assert.deepEqual(parsed.agenda, []);
  assert.deepEqual(parsed.blocks, []);
  assert.deepEqual(projectCommunication(parsed).blocks, []);
});

test('create accepts a scheduled window and purpose tag', () => {
  const input = validateCommunicationCreateInput({
    direction: 'outbound',
    channel: 'in_person',
    occurred_at: '2026-10-14T00:50:00.000Z',
    scheduled_start: '2026-10-14T00:50:00.000Z',
    scheduled_end: '2026-10-14T01:05:00.000Z',
    time_zone: 'Australia/Sydney',
    purpose_tag: 'Feedback'
  });
  assert.equal(input.scheduled_end, '2026-10-14T01:05:00.000Z');
  assert.equal(input.purpose_tag, 'feedback');
  assert.throws(
    () => validateCommunicationCreateInput({
      direction: 'outbound', channel: 'in_person', occurred_at: '2026-10-14T00:50:00.000Z',
      scheduled_start: '2026-10-14T01:05:00.000Z', scheduled_end: '2026-10-14T00:50:00.000Z'
    }),
    { code: 'invalid_scheduled_window' }
  );
  assert.throws(
    () => validateCommunicationCreateInput({
      direction: 'outbound', channel: 'in_person', occurred_at: '2026-10-14T00:50:00.000Z', time_zone: 'Mars/Base'
    }),
    { code: 'invalid_time_zone' }
  );
});

test('update accepts agenda and blocks; blocks are sanitised', () => {
  const patch = validateCommunicationFieldUpdate({
    agenda: [{ id: 'ag_1', text: 'What went well', source: 'clare' }],
    blocks: [{ id: 'block_1', block_type: 'rich_text', content: { html: '<p>ok</p><script>x()</script>' } }]
  });
  assert.equal(patch.agenda[0].source, 'clare');
  assert.equal(patch.blocks[0].content.html, '<p>ok</p>');
  assert.throws(() => validateCommunicationFieldUpdate({ agenda: [{ id: 'a', text: 'x', source: 'bob' }] }), {
    code: 'invalid_agenda'
  });
  assert.throws(() => validateCommunicationFieldUpdate({ blocks: [{ block_type: 'rich_text' }] }), {
    code: 'invalid_blocks'
  });
});
