import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assembleOrganisationsDirectory,
  deriveOrganisationChips
} from '../../netlify/functions/_shared/organisations-directory.mjs';

const now = '2026-09-26T12:00:00.000Z';
const nowMs = Date.parse(now);
const selfRef = 'shared:person:person_adam';
const orgRef = 'shared:organisation:organisation_sac';

test('deriveOrganisationChips: workplace + event venue with years (D5)', () => {
  const chips = deriveOrganisationChips(
    [
      {
        link: {
          id: 'l1',
          relationship_type: 'employee_at',
          status: 'current',
          valid_from: '2025-01-01',
          valid_to: null,
          role: null
        },
        endpoint: { kind: 'person', ref: selfRef, display_label: 'Adam' },
        direction: 'incoming'
      },
      {
        link: {
          id: 'l2',
          relationship_type: 'venue',
          status: 'current',
          occurred_at: '2024-06-01'
        },
        endpoint: { kind: 'event', ref: 'professional:event:e1', display_label: 'PD day' },
        direction: 'incoming'
      },
      {
        link: {
          id: 'l3',
          relationship_type: 'venue',
          status: 'current',
          occurred_at: '2025-03-01'
        },
        endpoint: { kind: 'event', ref: 'professional:event:e2', display_label: 'Forum' },
        direction: 'incoming'
      }
    ],
    { selfPersonRef: selfRef, nowMs }
  );
  assert.equal(chips.find((c) => c.kind === 'workplace')?.detail, '25–now');
  assert.equal(chips.find((c) => c.kind === 'event_venue')?.detail, '2 events');
});

test('assembleOrganisationsDirectory de-duplicates Adam across memberships (V4)', () => {
  const data = assembleOrganisationsDirectory(
    [
      {
        organisation: {
          id: 'organisation_sac',
          display_name: 'St. Aloysius College',
          legal_name: null,
          logo_key: null,
          lifecycle_status: 'active',
          created_at: '2019-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          ref: orgRef
        },
        relationships: [
          {
            link: {
              id: 'm1',
              relationship_type: 'employee_at',
              status: 'current',
              valid_from: '2025-01-01',
              role: 'English teacher'
            },
            endpoint: { kind: 'person', ref: selfRef, display_label: 'Adam' },
            direction: 'incoming'
          },
          {
            link: {
              id: 'm2',
              relationship_type: 'member_of',
              status: 'current',
              valid_from: '2025-02-01',
              role: 'gifted education teacher'
            },
            endpoint: { kind: 'person', ref: selfRef, display_label: 'Adam' },
            direction: 'incoming'
          },
          {
            link: {
              id: 'm3',
              relationship_type: 'member_of',
              status: 'current',
              valid_from: '2025-03-01',
              role: 'accreditation mentor'
            },
            endpoint: { kind: 'person', ref: selfRef, display_label: 'Adam' },
            direction: 'incoming'
          }
        ]
      }
    ],
    {
      now,
      selfPerson: { id: 'person_adam', ref: selfRef, is_self: true }
    }
  );
  assert.equal(data.organisations.length, 1);
  assert.equal(data.organisations[0].people_count, 1);
  assert.equal(data.counts.people, 1);
  assert.ok(data.organisations[0].chips.some((c) => c.kind === 'workplace'));
  assert.ok(data.organisations[0].is_current_workplace);
});
