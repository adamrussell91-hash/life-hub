import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProfessionalNetworkHealthReport } from '../../scripts/lib/professional-network-health.mjs';

const PEOPLE = [
  {
    legacy_id: 'p-self',
    display_name: 'Adam Russell',
    is_self: true,
    professional_profile: {
      last_contacted: null,
      current_workplace: []
    }
  },
  {
    legacy_id: 'p-linked',
    display_name: 'Linked Person',
    is_self: false,
    professional_profile: {
      last_contacted: '2025-02-21',
      current_workplace: ['St. Aloysius College']
    }
  },
  {
    legacy_id: 'p-text-only',
    display_name: 'Text Only',
    is_self: false,
    professional_profile: {
      last_contacted: '21 February 2025',
      current_workplace: ['St. Aloysius College']
    }
  },
  {
    legacy_id: 'p-orphan',
    display_name: 'Orphan Person',
    is_self: false,
    professional_profile: {
      last_contacted: 'not a date',
      current_workplace: ['Unknown School']
    }
  }
];

const ORGANISATIONS = [
  { legacy_id: 'o-aloysius', display_name: 'St. Aloysius College', aliases: [] }
];

const RELATIONSHIPS = [
  {
    person_legacy_id: 'p-linked',
    organisation_legacy_id: 'o-aloysius',
    relationship_type: 'employee_at',
    role: null,
    valid_from: null,
    valid_to: null
  },
  {
    person_legacy_id: 'p-linked',
    organisation_legacy_id: 'missing-org',
    relationship_type: 'employee_at',
    role: null,
    valid_from: null,
    valid_to: null
  },
  {
    person_legacy_id: 'p-self',
    other_person_legacy_id: 'p-linked',
    relationship_type: 'professional_relationship',
    role: null,
    valid_from: null,
    valid_to: null
  },
  {
    person_legacy_id: 'p-linked',
    organisation_legacy_id: 'o-aloysius',
    relationship_type: 'mentors',
    role: null,
    valid_from: null,
    valid_to: null
  }
];

test('health report counts, zero-link people, workplaces, drops, self, last_contacted', () => {
  const report = buildProfessionalNetworkHealthReport({
    people: PEOPLE,
    organisations: ORGANISATIONS,
    relationships: RELATIONSHIPS
  });

  assert.equal(report.counts.people, 4);
  assert.equal(report.counts.organisations, 1);
  assert.equal(report.counts.relationships, 4);
  assert.equal(report.counts.relationships_by_type.employee_at, 2);
  assert.equal(report.counts.relationships_by_type.professional_relationship, 1);
  assert.equal(report.counts.relationships_by_type.mentors, 1);

  assert.equal(report.people_with_zero_relationships.count, 2);
  assert.deepEqual(report.people_with_zero_relationships.sample_display_names.sort(), [
    'Orphan Person',
    'Text Only'
  ]);

  assert.equal(report.workplace_text_without_org_link.count, 2);
  const matching = report.workplace_text_without_org_link.matching_existing_organisation;
  assert.ok(matching.some((row) => row.workplace === 'St. Aloysius College' && row.matched_organisation === 'St. Aloysius College'));
  const none = report.workplace_text_without_org_link.matching_none;
  assert.ok(none.some((row) => row.workplace === 'Unknown School'));

  assert.ok(report.relationships_bridge_would_drop.count >= 2);
  const reasons = report.relationships_bridge_would_drop.rows.map((r) => r.reason);
  assert.ok(reasons.includes('unknown_organisation_legacy_id'));
  assert.ok(reasons.includes('unknown_type'));
  // Valid professional_relationship rows are kept by the bridge.
  assert.ok(!reasons.includes('person_person_not_yet_accepted_by_bridge'));
  assert.equal(
    report.relationships_bridge_would_drop.rows.filter((r) => r.relationship_type === 'professional_relationship')
      .length,
    0
  );
  assert.equal(report.is_self.count, 1);
  assert.equal(report.is_self.name, 'Adam Russell');

  assert.equal(report.last_contacted.empty, 1);
  assert.equal(report.last_contacted.parse_as_date, 2);
  assert.equal(report.last_contacted.unparseable, 1);
  assert.equal(report.last_contacted.unparseable_examples[0].last_contacted, 'not a date');
});

test('empty arrays produce zeroed report without throwing', () => {
  const report = buildProfessionalNetworkHealthReport({
    people: [],
    organisations: [],
    relationships: []
  });
  assert.equal(report.counts.people, 0);
  assert.equal(report.is_self.count, 0);
  assert.equal(report.is_self.name, null);
});
