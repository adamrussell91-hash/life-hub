import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assembleOrganisationsDirectory,
  buildPersonWarmthById,
  deriveOrganisationChips,
  realFirstLinkAt
} from '../../netlify/functions/_shared/organisations-directory.mjs';
import { assemblePeopleDirectory } from '../../netlify/functions/_shared/people-directory.mjs';

const now = '2026-09-26T12:00:00.000Z';
const nowMs = Date.parse(now);
const selfRef = 'shared:person:person_adam';
const orgRef = 'shared:organisation:organisation_sac';
const IMPORT_STAMP = '2026-09-15T00:00:00.000Z';

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
  assert.equal(chips.find((c) => c.kind === 'workplace')?.detail, '2025–now');
  assert.equal(chips.find((c) => c.kind === 'event_venue')?.detail, '2 events');
});

test('A7: St. Aloysius real links — Workplace only, no invented Event venue (D4)', () => {
  const chips = deriveOrganisationChips(
    [
      {
        link: {
          id: 'adam_sac',
          relationship_type: 'employee_at',
          status: 'current',
          valid_from: '2025-01-22',
          valid_to: null,
          role: 'Gifted Education Teacher',
          created_at: IMPORT_STAMP
        },
        endpoint: { kind: 'person', ref: selfRef, display_label: 'Adam Russell' },
        direction: 'incoming'
      },
      {
        link: {
          id: 'colleague',
          relationship_type: 'employee_at',
          status: 'current',
          valid_from: null,
          valid_to: null,
          created_at: IMPORT_STAMP
        },
        endpoint: { kind: 'person', ref: 'shared:person:person_colleague', display_label: 'Colleague' },
        direction: 'incoming'
      }
    ],
    { selfPersonRef: selfRef, nowMs }
  );
  assert.equal(chips.length, 1);
  assert.equal(chips[0].kind, 'workplace');
  assert.match(chips[0].detail, /Gifted Education Teacher/);
  assert.equal(chips.find((c) => c.kind === 'event_venue'), undefined);
});

test('realFirstLinkAt never uses import created_at (A1 / D1)', () => {
  assert.equal(
    realFirstLinkAt({ valid_from: '2025-01-22', created_at: IMPORT_STAMP }),
    '2025-01-22'
  );
  assert.equal(realFirstLinkAt({ created_at: IMPORT_STAMP }), null);
  assert.equal(
    realFirstLinkAt({ occurred_at: '2024-06-01', created_at: IMPORT_STAMP }),
    '2024-06-01'
  );
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

test('A1: undated import-stamp people excluded from arc; aria count tracked', () => {
  const data = assembleOrganisationsDirectory(
    [
      {
        organisation: {
          id: 'organisation_sac',
          display_name: 'St. Aloysius College',
          lifecycle_status: 'active',
          created_at: '2019-01-01T00:00:00.000Z',
          updated_at: now,
          ref: orgRef
        },
        relationships: [
          {
            link: {
              id: 'adam',
              relationship_type: 'employee_at',
              status: 'current',
              valid_from: '2025-01-22',
              valid_to: null,
              created_at: IMPORT_STAMP,
              role: 'Gifted Education Teacher'
            },
            endpoint: { kind: 'person', ref: selfRef, display_label: 'Adam' },
            direction: 'incoming'
          },
          {
            link: {
              id: 'undated',
              relationship_type: 'employee_at',
              status: 'current',
              created_at: IMPORT_STAMP
            },
            endpoint: {
              kind: 'person',
              ref: 'shared:person:person_undated',
              display_label: 'Undated'
            },
            direction: 'incoming'
          }
        ]
      }
    ],
    { now, selfPerson: { id: 'person_adam', ref: selfRef, is_self: true } }
  );
  const org = data.organisations[0];
  assert.equal(org.people_count, 2);
  assert.equal(org.undated_people_count, 1);
  assert.equal(org.arc_points.length, 1);
  assert.equal(org.arc_points[0].at, '2025-01-22');
  assert.equal(org.arc_points[0].label, undefined);
  assert.equal(org.first_touch_kind, 'you_started');
  assert.equal(org.first_touch_at, '2025-01-22');
  assert.equal(org.timeline_lanes[0].end, null);
});

test('A2: org warmth bands match People warmthFor for the same ids (V4)', () => {
  const peopleWithRelationships = [
    {
      person: {
        id: 'person_henry',
        display_name: 'Henry',
        is_self: false,
        lifecycle_status: 'active',
        created_at: '2020-01-01T00:00:00.000Z',
        ref: 'shared:person:person_henry'
      },
      relationships: [
        {
          link: {
            id: 'rh',
            relationship_type: 'professional_relationship',
            status: 'current',
            role: 'mentor',
            created_at: '2026-09-20T00:00:00.000Z',
            valid_from: '2026-09-20'
          },
          endpoint: { kind: 'person', ref: selfRef, display_label: 'Adam' },
          direction: 'outgoing'
        },
        {
          link: {
            id: 'oh',
            relationship_type: 'employee_at',
            status: 'current',
            valid_from: '2024-01-01',
            created_at: IMPORT_STAMP
          },
          endpoint: { kind: 'organisation', ref: orgRef, display_label: 'SAC' },
          direction: 'outgoing'
        }
      ]
    },
    {
      person: {
        id: 'person_cold',
        display_name: 'Cold',
        is_self: false,
        lifecycle_status: 'active',
        created_at: '2018-01-01T00:00:00.000Z',
        ref: 'shared:person:person_cold'
      },
      relationships: [
        {
          link: {
            id: 'oc',
            relationship_type: 'employee_at',
            status: 'ended',
            valid_from: '2019-01-01',
            valid_to: '2020-01-01',
            created_at: IMPORT_STAMP
          },
          endpoint: { kind: 'organisation', ref: orgRef, display_label: 'SAC' },
          direction: 'outgoing'
        }
      ]
    }
  ];

  const peopleDir = assemblePeopleDirectory(peopleWithRelationships, { now });
  const warmthMap = buildPersonWarmthById(peopleWithRelationships, now);

  const orgData = assembleOrganisationsDirectory(
    [
      {
        organisation: {
          id: 'organisation_sac',
          display_name: 'St. Aloysius College',
          lifecycle_status: 'active',
          created_at: '2019-01-01T00:00:00.000Z',
          updated_at: now,
          ref: orgRef
        },
        relationships: [
          {
            link: {
              id: 'oh',
              relationship_type: 'employee_at',
              status: 'current',
              valid_from: '2024-01-01',
              created_at: IMPORT_STAMP
            },
            endpoint: {
              kind: 'person',
              ref: 'shared:person:person_henry',
              display_label: 'Henry'
            },
            direction: 'incoming'
          },
          {
            link: {
              id: 'oc',
              relationship_type: 'employee_at',
              status: 'ended',
              valid_from: '2019-01-01',
              valid_to: '2020-01-01',
              created_at: IMPORT_STAMP
            },
            endpoint: {
              kind: 'person',
              ref: 'shared:person:person_cold',
              display_label: 'Cold'
            },
            direction: 'incoming'
          }
        ]
      }
    ],
    {
      now,
      selfPerson: { id: 'person_adam', ref: selfRef, is_self: true },
      personWarmthById: warmthMap
    }
  );

  const orgPeople = Object.fromEntries(
    orgData.organisations[0].people.map((p) => [p.id, p.warmth_band])
  );
  for (const p of peopleDir.people) {
    if (orgPeople[p.id]) {
      assert.equal(
        orgPeople[p.id],
        p.warmth_band,
        `${p.id} org band ${orgPeople[p.id]} !== people band ${p.warmth_band}`
      );
    }
  }
});
