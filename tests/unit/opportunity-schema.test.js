import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareOpportunitiesByCloses,
  formatOpportunityClosesLabel,
  parseOpportunityRecord,
  projectOpportunity,
  validateOpportunityCreateInput,
  buildAppliesToApplicationIntent,
  buildProviderEventIntent
} from '../../netlify/functions/_shared/opportunity-schema.mjs';

const OPP_ID = 'opportunity_00000000-0000-4000-8000-000000000001';
const ORG_REF = 'shared:organisation:organisation_00000000-0000-4000-8000-0000000000aa';

function baseRecord(overrides = {}) {
  return {
    schema_version: 1,
    id: OPP_ID,
    organisation_ref: ORG_REF,
    kind: 'scholarship',
    title: 'HALT scholarship',
    summary: 'For accredited teachers',
    closes_on: '2026-10-01',
    closes_precision: 'month',
    url: 'https://example.com/schol',
    sources: [],
    found_by: 'adam',
    status: 'open',
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    ...overrides
  };
}

test('D1: month-only close renders "closes Oct 2026"', () => {
  const label = formatOpportunityClosesLabel(
    baseRecord({ closes_on: '2026-10-01', closes_precision: 'month' })
  );
  assert.equal(label, 'closes Oct 2026');
  const fromMonth = formatOpportunityClosesLabel(
    baseRecord({ closes_on: '2026-10', closes_precision: 'month' })
  );
  assert.equal(fromMonth, 'closes Oct 2026');
  assert.equal(
    formatOpportunityClosesLabel(baseRecord({ closes_on: null, closes_precision: 'none' })),
    null
  );
  assert.equal(
    formatOpportunityClosesLabel(
      baseRecord({ closes_on: '2026-10-15', closes_precision: 'day' })
    ),
    'closes 15/10/26'
  );
});

test('D2: sort order is closes_on ascending, undated last', () => {
  const datedEarly = baseRecord({
    id: 'opportunity_00000000-0000-4000-8000-000000000001',
    closes_on: '2026-09-01',
    closes_precision: 'day'
  });
  const datedLate = baseRecord({
    id: 'opportunity_00000000-0000-4000-8000-000000000002',
    closes_on: '2026-11-01',
    closes_precision: 'month'
  });
  const undated = baseRecord({
    id: 'opportunity_00000000-0000-4000-8000-000000000003',
    closes_on: null,
    closes_precision: 'none'
  });
  const sorted = [undated, datedLate, datedEarly].sort(compareOpportunitiesByCloses);
  assert.deepEqual(
    sorted.map((r) => r.id),
    [datedEarly.id, datedLate.id, undated.id]
  );
});

test('create validation and parse reject unknown fields', () => {
  const validated = validateOpportunityCreateInput({
    organisation_ref: ORG_REF,
    kind: 'pd',
    title: 'Conference',
    closes_precision: 'none'
  });
  assert.equal(validated.title, 'Conference');
  assert.throws(
    () =>
      validateOpportunityCreateInput({
        organisation_ref: ORG_REF,
        kind: 'pd',
        title: 'x',
        organisation_id: 'organisation_x'
      }),
    (error) => error.code === 'unknown_field'
  );
  assert.ok(parseOpportunityRecord(baseRecord()));
  assert.equal(parseOpportunityRecord({ ...baseRecord(), extra: 1 }), null);
});

test('projectOpportunity expires past close dates on read', () => {
  const past = projectOpportunity(
    baseRecord({ closes_on: '2020-01-01', closes_precision: 'day', status: 'open' }),
    '2026-09-27T00:00:00.000Z'
  );
  assert.equal(past.status, 'expired');
  assert.equal(past.closes_label, 'closes 01/01/20');
});

test('buildAppliesToApplicationIntent carries applies_to link', () => {
  const intent = buildAppliesToApplicationIntent(baseRecord());
  assert.equal(intent.position_title, 'HALT scholarship');
  assert.equal(intent.links[0].relationship_type, 'applies_to');
  assert.equal(intent.links[0].target_ref, ORG_REF);
  assert.equal(intent.links[0].metadata.from_opportunity_id, OPP_ID);
});

test('buildProviderEventIntent carries provider link', () => {
  const intent = buildProviderEventIntent(baseRecord());
  assert.equal(intent.links[0].relationship_type, 'provider');
  assert.equal(intent.links[0].target_ref, ORG_REF);
  assert.ok(intent.title);
});
