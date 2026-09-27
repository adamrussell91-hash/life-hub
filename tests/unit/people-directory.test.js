import test from 'node:test';
import assert from 'node:assert/strict';
import { assemblePeopleDirectory } from '../../netlify/functions/_shared/people-directory.mjs';
import { parseOrgCrestSignRequest, MAX_CREST_BYTES } from '../../netlify/functions/_shared/org-crest-sign.mjs';

const PERSON_ID = 'person_00000000-0000-4000-8000-000000000001';
const ORG_ID = 'organisation_00000000-0000-4000-8000-000000000002';

test('assemblePeopleDirectory skips self and builds org groups', () => {
  const data = assemblePeopleDirectory(
    [
      {
        person: {
          id: PERSON_ID,
          display_name: 'Henry McLennan',
          is_self: false,
          lifecycle_status: 'active',
          created_at: '2026-09-01T00:00:00.000Z',
          updated_at: '2026-09-20T00:00:00.000Z',
          ref: `shared:person:${PERSON_ID}`
        },
        relationships: [
          {
            link: {
              id: 'l1',
              relationship_type: 'employee_at',
              status: 'current',
              role: 'Teacher',
              valid_to: null,
              occurred_at: null,
              valid_from: '2024-01-01',
              created_at: '2024-01-01T00:00:00.000Z'
            },
            endpoint: {
              ref: `shared:organisation:${ORG_ID}`,
              kind: 'organisation',
              display_label: 'St. Aloysius College'
            },
            direction: 'outgoing'
          }
        ]
      },
      {
        person: {
          id: 'person_00000000-0000-4000-8000-000000000099',
          display_name: 'Adam',
          is_self: true,
          lifecycle_status: 'active',
          created_at: '2020-01-01T00:00:00.000Z',
          updated_at: '2020-01-01T00:00:00.000Z',
          ref: 'shared:person:person_00000000-0000-4000-8000-000000000099'
        },
        relationships: []
      }
    ],
    { now: '2026-09-26T00:00:00.000Z' }
  );
  assert.equal(data.counts.people, 1);
  assert.equal(data.people[0].display_name, 'Henry McLennan');
  assert.equal(data.people[0].organisation.display_name, 'St. Aloysius College');
  assert.equal(data.organisations.length, 1);
});

test('assemblePeopleDirectory collapses hermit name twins', () => {
  const data = assemblePeopleDirectory(
    [
      {
        person: {
          id: 'person_a',
          display_name: 'Edward Lenzner and Ethan Lum',
          is_self: false,
          lifecycle_status: 'active',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          ref: 'shared:person:person_a'
        },
        relationships: []
      },
      {
        person: {
          id: 'person_b',
          display_name: 'Edward Lenzner and Ethan Lum',
          is_self: false,
          lifecycle_status: 'active',
          created_at: '2026-01-02T00:00:00.000Z',
          updated_at: '2026-01-02T00:00:00.000Z',
          ref: 'shared:person:person_b'
        },
        relationships: []
      },
      {
        person: {
          id: 'person_c',
          display_name: 'p/Carmel Cordaro',
          is_self: false,
          lifecycle_status: 'active',
          created_at: '2026-01-03T00:00:00.000Z',
          updated_at: '2026-01-03T00:00:00.000Z',
          ref: 'shared:person:person_c'
        },
        relationships: []
      }
    ],
    { now: '2026-09-26T00:00:00.000Z' }
  );
  assert.equal(data.counts.people, 2);
  assert.equal(
    data.people.filter((p) => p.display_name === 'Edward Lenzner and Ethan Lum').length,
    1
  );
  assert.equal(data.people.find((p) => p.id === 'person_c').display_name, 'Carmel Cordaro');
  assert.equal(data.people.find((p) => p.id === 'person_c').initials, 'CC');
});

test('parseOrgCrestSignRequest accepts PNG under 512KB and rejects oversized', () => {
  const orgId = ORG_ID;
  const ok = parseOrgCrestSignRequest({
    organisation_id: orgId,
    filename: 'crest.png',
    content_type: 'image/png',
    byte_size: 1024
  });
  assert.ok(ok.value);
  assert.match(ok.value.attachment.r2_key, /^org-crests\//);

  const big = parseOrgCrestSignRequest({
    organisation_id: orgId,
    filename: 'crest.png',
    content_type: 'image/png',
    byte_size: MAX_CREST_BYTES + 1
  });
  assert.equal(big.error, 'File exceeds 512KB');

  const svg = parseOrgCrestSignRequest({
    organisation_id: orgId,
    filename: 'crest.svg',
    content_type: 'image/svg+xml',
    byte_size: 200
  });
  assert.ok(svg.value);
});

test('assemblePeopleDirectory hides Communications students even if collection leaked one', async () => {
  const studentId = 'person_00000000-0000-4000-8000-000000000099';
  const data = assemblePeopleDirectory(
    [
      {
        person: {
          id: PERSON_ID,
          display_name: 'Henry McLennan',
          is_self: false,
          lifecycle_status: 'active',
          created_at: '2026-09-01T00:00:00.000Z',
          updated_at: '2026-09-20T00:00:00.000Z',
          original_category: 'People (Professional Relationship Management)',
          ref: `shared:person:${PERSON_ID}`
        },
        relationships: []
      },
      {
        person: {
          id: studentId,
          display_name: 'Year 10 Student',
          is_self: false,
          lifecycle_status: 'active',
          created_at: '2026-09-01T00:00:00.000Z',
          updated_at: '2026-09-20T00:00:00.000Z',
          original_category: 'Student (Communications database)',
          ref: `shared:person:${studentId}`
        },
        relationships: []
      }
    ],
    { now: '2026-09-26T12:00:00.000Z' }
  );
  assert.equal(data.people.length, 1);
  assert.equal(data.people[0].display_name, 'Henry McLennan');
  assert.ok(!data.people.some((p) => p.display_name === 'Year 10 Student'));
});
