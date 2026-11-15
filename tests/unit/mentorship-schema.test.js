import assert from 'node:assert/strict';
import test from 'node:test';
import {
  generateMentorshipId,
  isValidMentorshipId,
  parseMentorshipRecord,
  projectMentorshipSummary,
  validateMentorshipCreateInput,
  validateMentorshipPatchInput
} from '../../netlify/functions/_shared/mentorship-schema.mjs';
import { mentorshipKey } from '../../netlify/functions/_shared/professional-blobs.mjs';

const PERSON = 'shared:person:person_00000000-0000-4000-8000-000000000001';
const ORG = 'shared:organisation:organisation_00000000-0000-4000-8000-000000000002';
const block = { id: 'b1', block_type: 'rich_text', content: { html: '<p>Invented note</p>' } };

test('ids have the mentorship_ shape and key under mentorships/records/', () => {
  const id = generateMentorshipId();
  assert.equal(isValidMentorshipId(id), true);
  assert.equal(isValidMentorshipId('thread_00000000-0000-4000-8000-000000000001'), false);
  assert.equal(mentorshipKey(id), `mentorships/records/${id}`);
  assert.throws(() => mentorshipKey('nope'), { code: 'invalid_mentorship_id' });
});

test('create fills defaults and turns empty strings into null', () => {
  const out = validateMentorshipCreateInput({ person_ref: PERSON, kind: 'coaching', label: '  ', focus: '' });
  assert.deepEqual(out, {
    person_ref: PERSON, kind: 'coaching', label: null, organisation_ref: null, focus: null,
    started_on: null, completed_on: null, outcome: null, status: 'active', blocks: [], shared_blocks: []
  });
});

test('create keeps trimmed text, refs, dates and blocks', () => {
  const out = validateMentorshipCreateInput({
    person_ref: PERSON, kind: 'accreditation', label: ' Pathway ', organisation_ref: ORG,
    focus: 'Evidence for standard 3', started_on: '2026-03-02', blocks: [block], shared_blocks: [block]
  });
  assert.equal(out.label, 'Pathway');
  assert.equal(out.organisation_ref, ORG);
  assert.equal(out.started_on, '2026-03-02');
  assert.equal(out.blocks.length, 1);
  assert.equal(out.shared_blocks.length, 1);
});

test('create rejects bad input', () => {
  const ok = { person_ref: PERSON, kind: 'other' };
  const code = (input) => { try { validateMentorshipCreateInput(input); } catch (e) { return e.code; } return null; };
  assert.equal(code(null), 'invalid_input');
  assert.equal(code({ kind: 'other' }), 'invalid_person_ref');
  assert.equal(code({ ...ok, person_ref: 'shared:organisation:x' }), 'invalid_person_ref');
  assert.equal(code({ person_ref: PERSON, kind: 'friend' }), 'invalid_kind');
  assert.equal(code({ ...ok, label: 'x'.repeat(61) }), 'invalid_label');
  assert.equal(code({ ...ok, focus: 'x'.repeat(301) }), 'invalid_focus');
  assert.equal(code({ ...ok, outcome: 'x'.repeat(301) }), 'invalid_outcome');
  assert.equal(code({ ...ok, organisation_ref: 'shared:person:p' }), 'invalid_organisation_ref');
  assert.equal(code({ ...ok, started_on: '02/03/2026' }), 'invalid_started_on');
  assert.equal(code({ ...ok, status: 'done' }), 'invalid_status');
  assert.equal(code({ ...ok, blocks: [{ id: 1 }] }), 'invalid_blocks');
  assert.equal(code({ ...ok, extra: 1 }), 'unknown_field');
});

test('patch changes mutable fields only and never invents clears', () => {
  assert.deepEqual(validateMentorshipPatchInput({ status: 'active' }), { status: 'active' });
  assert.deepEqual(
    validateMentorshipPatchInput({ status: 'active', completed_on: null, outcome: null }),
    { status: 'active', completed_on: null, outcome: null }
  );
  assert.deepEqual(
    validateMentorshipPatchInput({ status: 'completed', completed_on: '2026-11-01', outcome: ' Done ' }),
    { status: 'completed', completed_on: '2026-11-01', outcome: 'Done' }
  );
  assert.deepEqual(validateMentorshipPatchInput({ focus: '' }), { focus: null });
});

test('patch refuses id, person_ref, created_at, unknown keys, nulls on required fields and empty bodies', () => {
  const code = (input) => { try { validateMentorshipPatchInput(input); } catch (e) { return e.code; } return null; };
  assert.equal(code({ id: 'x' }), 'unknown_field');
  assert.equal(code({ person_ref: PERSON }), 'unknown_field');
  assert.equal(code({ created_at: '2026-01-01' }), 'unknown_field');
  assert.equal(code({ nope: 1 }), 'unknown_field');
  assert.equal(code({ kind: null }), 'invalid_kind');
  assert.equal(code({ status: null }), 'invalid_status');
  assert.equal(code({ blocks: null }), 'invalid_blocks');
  assert.equal(code({}), 'empty_update');
  assert.equal(code([]), 'invalid_input');
});

test('stored records parse strictly and summaries drop both block arrays', () => {
  const record = {
    schema_version: 1, id: generateMentorshipId(), person_ref: PERSON, kind: 'halt_lead', label: null,
    organisation_ref: null, focus: null, status: 'active', started_on: null, completed_on: null, outcome: null,
    blocks: [block], shared_blocks: [], created_at: '2026-11-01T00:00:00.000Z', updated_at: '2026-11-01T00:00:00.000Z'
  };
  assert.ok(parseMentorshipRecord(record));
  assert.equal(parseMentorshipRecord({ ...record, extra: 1 }), null);
  assert.equal(parseMentorshipRecord({ ...record, kind: 'x' }), null);
  assert.equal(parseMentorshipRecord({ ...record, schema_version: 2 }), null);
  const summary = projectMentorshipSummary(record);
  assert.equal('blocks' in summary, false);
  assert.equal('shared_blocks' in summary, false);
  assert.equal(summary.kind, 'halt_lead');
});
