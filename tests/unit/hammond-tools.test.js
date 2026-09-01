import test from 'node:test';
import assert from 'node:assert/strict';
import {
  proposeCentralNodePatchSchema,
  appendGovernanceLogSchema,
  validateCentralNodePatchInput,
  validateGovernanceLogAppendInput,
  classifyCentralNodePatchRisk,
  applyCentralNodePatch
} from '../../netlify/functions/_shared/hammond-tools.mjs';
import { GOVERNANCE_ENTRY_TYPES } from '../../apps/life/js/core/governance-log.js';

test('schemas expose expected names', () => {
  assert.equal(proposeCentralNodePatchSchema().name, 'propose_central_node_patch');
  assert.equal(appendGovernanceLogSchema().name, 'append_governance_log');
});

test('propose schema requires section op and payload', () => {
  const schema = proposeCentralNodePatchSchema();
  assert.deepEqual(schema.input_schema.required, ['section', 'op', 'payload']);
  assert.ok(schema.input_schema.properties.section.enum.includes('cross_agent'));
  assert.ok(schema.input_schema.properties.op.enum.includes('append_line'));
  assert.deepEqual(schema.input_schema.properties.payload.required, ['summary']);
});

test('append schema requires entry_type and body', () => {
  const schema = appendGovernanceLogSchema();
  assert.deepEqual(schema.input_schema.required, ['entry_type', 'body']);
  assert.deepEqual(schema.input_schema.properties.entry_type.enum, [...GOVERNANCE_ENTRY_TYPES]);
});

test('validateCentralNodePatchInput requires section op payload.summary', () => {
  assert.equal(validateCentralNodePatchInput({}), null);
  assert.equal(validateCentralNodePatchInput({
    section: 'cross_agent',
    op: 'append_line',
    payload: { text: '- Hammond→Brisket: hold' }
  }), null);
  assert.equal(validateCentralNodePatchInput({
    section: 'unknown',
    op: 'append_line',
    payload: { text: '- x', summary: 's' }
  }), null);

  const patch = validateCentralNodePatchInput({
    section: 'cross_agent',
    op: 'append_line',
    payload: { text: '- Hammond→Brisket: hold', summary: 'Direct Brisket to hold surplus' }
  });
  assert.ok(patch);
  assert.equal(patch.section, 'cross_agent');
  assert.equal(patch.op, 'append_line');
  assert.equal(patch.payload.text, '- Hammond→Brisket: hold');
  assert.equal(patch.payload.summary, 'Direct Brisket to hold surplus');
});

test('validateCentralNodePatchInput requires payload fields by op', () => {
  assert.equal(validateCentralNodePatchInput({
    section: 'todays_status',
    op: 'upsert_field',
    payload: { text: '**Flags:** Watch', summary: 'Update flags' }
  }), null);
  assert.ok(validateCentralNodePatchInput({
    section: 'todays_status',
    op: 'upsert_field',
    payload: { field: 'Flags', text: '**Flags:** Watch', summary: 'Update flags' }
  }));

  assert.equal(validateCentralNodePatchInput({
    section: 'constraints',
    op: 'delete_lines',
    payload: { summary: 'Remove taper note' }
  }), null);
  assert.ok(validateCentralNodePatchInput({
    section: 'constraints',
    op: 'delete_lines',
    payload: { match: 'Steroid taper', summary: 'Remove taper note' }
  }));

  assert.equal(validateCentralNodePatchInput({
    section: 'this_month',
    op: 'replace_section',
    payload: { summary: 'Rewrite month' }
  }), null);
  assert.ok(validateCentralNodePatchInput({
    section: 'this_month',
    op: 'replace_section',
    payload: { text: '### Active Goals\n- Sleep', summary: 'Rewrite month' }
  }));

  assert.equal(validateCentralNodePatchInput({
    section: 'this_week',
    op: 'append_line',
    payload: { text: '   ', summary: 'Add bullet' }
  }), null);
});

test('validateGovernanceLogAppendInput requires entry_type and body', () => {
  assert.equal(validateGovernanceLogAppendInput({}), null);
  assert.equal(validateGovernanceLogAppendInput({
    entry_type: 'Not A Real Type',
    body: 'Nope'
  }), null);
  assert.equal(validateGovernanceLogAppendInput({
    entry_type: "Coach's Notes",
    body: '   '
  }), null);

  const entry = validateGovernanceLogAppendInput({
    entry_type: 'Drift Detection',
    body: 'Stalled sleep goal.',
    status: 'Still Active',
    title: 'Sleep'
  });
  assert.ok(entry);
  assert.equal(entry.entryType, 'Drift Detection');
  assert.equal(entry.body, 'Stalled sleep goal.');
  assert.equal(entry.status, 'Still Active');
  assert.equal(entry.title, 'Sleep');
  assert.equal(entry.dateKey, undefined);
});

test('validateGovernanceLogAppendInput keeps optional dateKey when provided', () => {
  const entry = validateGovernanceLogAppendInput({
    entry_type: "Coach's Notes",
    body: 'Note.',
    dateKey: '2026-08-09'
  });
  assert.equal(entry.dateKey, '2026-08-09');
});

test('re-exports classify and apply for chat wiring', () => {
  assert.equal(typeof classifyCentralNodePatchRisk, 'function');
  assert.equal(typeof applyCentralNodePatch, 'function');
  assert.equal(
    classifyCentralNodePatchRisk({
      section: 'cross_agent',
      op: 'append_line',
      payload: { text: '- x', summary: 's' }
    }),
    'auto'
  );
});
