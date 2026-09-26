import { describe, expect, it } from 'vitest';
import { buildPersonModel } from '@/domain/person-model';
import type { EntityOverview, PersonBrief } from '@/domain/types';

const PERSON_ID = 'person_00000000-0000-4000-8000-000000000001';
const ORG_ID = 'organisation_00000000-0000-4000-8000-000000000002';

function overviewFixture(overrides: Partial<EntityOverview> = {}): EntityOverview {
  return {
    entity: {
      schema_version: 1,
      id: PERSON_ID,
      kind: 'person',
      display_name: 'Henry McLennan',
      sort_name: 'McLennan, Henry',
      aliases: [],
      lifecycle_status: 'active',
      is_self: false,
      retention_reason: null,
      retention_review_at: null,
      created_at: '2026-09-01T00:00:00.000Z',
      updated_at: '2026-09-20T00:00:00.000Z',
      ref: `shared:person:${PERSON_ID}`
    },
    current_relationships: [
      {
        direction: 'outgoing',
        link: {
          id: 'link_mentor',
          relationship_type: 'professional_relationship',
          role: 'mentee',
          status: 'current',
          temporal_mode: 'period',
          valid_from: '2026-09-17',
          valid_to: null,
          occurred_at: null,
          metadata: { human_label: 'Accreditation Mentor' },
          source_ref: `shared:person:person_self`,
          target_ref: `shared:person:${PERSON_ID}`,
          context_key: null
        },
        endpoint: {
          ref: `shared:person:person_self`,
          kind: 'person',
          display_label: 'Adam',
          supporting_label: null,
          href: null,
          lifecycle_status: 'active',
          visibility: 'visible'
        }
      },
      {
        direction: 'outgoing',
        link: {
          id: 'link_org',
          relationship_type: 'employee_at',
          role: 'Teacher',
          status: 'current',
          temporal_mode: 'period',
          valid_from: '2024-01-01',
          valid_to: null,
          occurred_at: null,
          metadata: {},
          source_ref: `shared:person:${PERSON_ID}`,
          target_ref: `shared:organisation:${ORG_ID}`,
          context_key: null
        },
        endpoint: {
          ref: `shared:organisation:${ORG_ID}`,
          kind: 'organisation',
          display_label: 'St. Aloysius College',
          supporting_label: null,
          href: null,
          lifecycle_status: 'active',
          visibility: 'visible'
        }
      }
    ],
    historical_relationships: [],
    linked_records: { tasks: [], communications: [], meetings: [], events: [], applications: [] },
    timeline: [
      {
        id: 't1',
        kind: 'point',
        date: '2026-09-17',
        end_date: null,
        label: 'Connected',
        context_key: null,
        source_ref: `shared:person:${PERSON_ID}`,
        target_ref: `shared:organisation:${ORG_ID}`,
        href: null,
        context_href: null
      }
    ],
    ...overrides
  } as EntityOverview;
}

function briefFixture(): PersonBrief {
  return {
    header: {
      person: { ref: `shared:person:${PERSON_ID}`, display_name: 'Henry McLennan', href: null },
      role: 'Mentee',
      organisation: {
        ref: `shared:organisation:${ORG_ID}`,
        display_name: 'St. Aloysius College',
        href: null
      },
      next_interaction: null
    },
    who_they_are: 'Colleague and mentee.',
    open_loops: [
      {
        ref: 'tasks:task:task_1',
        label: 'Set up mentoring meeting',
        href: null,
        status: 'open'
      }
    ],
    current_shared_work: [],
    mutual_connections: []
  };
}

describe('buildPersonModel', () => {
  it('keeps directory open-item count and ledger you-owe count equal (V4)', () => {
    const model = buildPersonModel({ overview: overviewFixture(), brief: briefFixture() });
    expect(model.openItemCount).toBe(1);
    expect(model.youOweCount).toBe(1);
    expect(model.ledgerYouOwe).toHaveLength(1);
    expect(model.ledgerYouOwe[0]?.text).toBe('Set up mentoring meeting');
    expect(model.chips.some((c) => /mentee/i.test(c.label))).toBe(true);
    expect(model.organisation?.displayName).toBe('St. Aloysius College');
  });

  it('handles missing brief with empty ledger', () => {
    const model = buildPersonModel({ overview: overviewFixture(), brief: null });
    expect(model.openItemCount).toBe(0);
    expect(model.ledgerYouOwe).toEqual([]);
  });
});
