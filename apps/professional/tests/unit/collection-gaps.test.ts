import { describe, expect, it } from 'vitest';
import { computeCollectionGaps, type CollectionGap } from '@/domain/collection-gaps';
import type { EntityOverview, ObservationRecord, RelationshipEntry } from '@/domain/types';

const NOW = '2026-09-17T00:00:00.000Z';
const DAY_MS = 86_400_000;

function daysAgo(days: number): string {
  return new Date(Date.parse(NOW) - days * DAY_MS).toISOString();
}

function relationshipEntry(overrides: { link?: Record<string, unknown> } = {}): RelationshipEntry {
  return {
    link: {
      id: 'l1',
      relationship_type: 'professional_relationship',
      status: 'current',
      temporal_mode: 'period',
      role: 'mentor',
      context_key: null,
      occurred_at: null,
      valid_from: daysAgo(10),
      valid_to: null,
      source_ref: 'shared:person:person_1',
      target_ref: 'shared:person:person_2',
      metadata: {},
      ...overrides.link
    },
    endpoint: {
      ref: 'shared:person:person_2',
      kind: 'person',
      display_label: 'Counterpart',
      supporting_label: null,
      href: null,
      lifecycle_status: 'active',
      visibility: 'operator'
    },
    direction: 'outgoing'
  } as unknown as RelationshipEntry;
}

function overview(overrides: Partial<EntityOverview> = {}): EntityOverview {
  return {
    entity: {
      schema_version: 1,
      id: 'person_1',
      kind: 'person',
      display_name: 'Seth Example',
      sort_name: null,
      aliases: [],
      lifecycle_status: 'active',
      is_self: false,
      retention_reason: null,
      retention_review_at: null,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
      ref: 'shared:person:person_1'
    },
    current_relationships: [],
    historical_relationships: [],
    timeline: [],
    linked_records: { tasks: [], communications: [], organisations: [], people: [] },
    ...overrides
  };
}

function observation(overrides: Partial<ObservationRecord> = {}): ObservationRecord {
  return {
    schema_version: 1,
    id: 'observation_1',
    about_ref: 'shared:person:person_1',
    text: 'Noted something.',
    occurred_at: daysAgo(5),
    source: 'manual',
    linked_ref: null,
    created_at: daysAgo(5),
    updated_at: daysAgo(5),
    ...overrides
  };
}

function gapIds(gaps: CollectionGap[]): string[] {
  return gaps.map((g) => g.id);
}

describe('computeCollectionGaps', () => {
  it('no gaps when a human-labeled current professional_relationship exists and a recent interaction exists', () => {
    const entry = relationshipEntry({
      link: { valid_from: daysAgo(10), metadata: { human_label: 'Mentor to Counterpart' } }
    });
    const result = computeCollectionGaps(overview({ current_relationships: [entry] }), [], NOW);
    expect(gapIds(result)).toEqual([]);
  });

  it('missing_human_label present when a professional_relationship exists with no human label anywhere', () => {
    const entry = relationshipEntry({ link: { valid_from: daysAgo(10), metadata: {} } });
    const result = computeCollectionGaps(overview({ current_relationships: [entry] }), [], NOW);
    expect(gapIds(result)).toContain('missing_human_label');
  });

  it('missing_human_label present when metadata is entirely absent on the link', () => {
    const entry = relationshipEntry({ link: { valid_from: daysAgo(10), metadata: undefined } });
    const result = computeCollectionGaps(overview({ current_relationships: [entry] }), [], NOW);
    expect(gapIds(result)).toContain('missing_human_label');
  });

  it('missing_human_label ABSENT when there are zero professional_relationship links at all', () => {
    const entry = relationshipEntry({
      link: { relationship_type: 'works_at', valid_from: daysAgo(10), metadata: {} }
    });
    const result = computeCollectionGaps(overview({ current_relationships: [entry] }), [], NOW);
    expect(gapIds(result)).not.toContain('missing_human_label');
  });

  it('missing_human_label ABSENT when at least one of several current professional_relationship links has a human label', () => {
    const labeled = relationshipEntry({
      link: { id: 'l1', valid_from: daysAgo(10), metadata: { human_label: 'Mentor' } }
    });
    const unlabeled = relationshipEntry({
      link: { id: 'l2', valid_from: daysAgo(20), metadata: {} }
    });
    const result = computeCollectionGaps(overview({ current_relationships: [labeled, unlabeled] }), [], NOW);
    expect(gapIds(result)).not.toContain('missing_human_label');
  });

  it('missing_human_label only checks CURRENT relationships, not historical ones', () => {
    const historicalOnly = relationshipEntry({
      link: { valid_from: daysAgo(10), metadata: {} }
    });
    const result = computeCollectionGaps(overview({ historical_relationships: [historicalOnly] }), [], NOW);
    expect(gapIds(result)).not.toContain('missing_human_label');
  });

  it('stale_interaction present when the most recent date across all sources is more than 365 days old', () => {
    const entry = relationshipEntry({ link: { valid_from: daysAgo(400), metadata: { human_label: 'Mentor' } } });
    const result = computeCollectionGaps(overview({ current_relationships: [entry] }), [], NOW);
    expect(gapIds(result)).toContain('stale_interaction');
  });

  it('stale_interaction ABSENT when the most recent date is exactly 365 days old', () => {
    const entry = relationshipEntry({ link: { valid_from: daysAgo(365), metadata: { human_label: 'Mentor' } } });
    const result = computeCollectionGaps(overview({ current_relationships: [entry] }), [], NOW);
    expect(gapIds(result)).not.toContain('stale_interaction');
  });

  it('stale_interaction present when there is no date data at all', () => {
    const result = computeCollectionGaps(overview(), [], NOW);
    expect(gapIds(result)).toContain('stale_interaction');
  });

  it('stale_interaction ABSENT when a recent Observation exists even if all relationship dates are old', () => {
    const entry = relationshipEntry({ link: { valid_from: daysAgo(1000), metadata: { human_label: 'Mentor' } } });
    const recentObservation = observation({ occurred_at: daysAgo(3) });
    const result = computeCollectionGaps(
      overview({ current_relationships: [entry] }),
      [recentObservation],
      NOW
    );
    expect(gapIds(result)).not.toContain('stale_interaction');
  });

  it('stale_interaction present when observations exist but are all old too', () => {
    const oldObservation = observation({ occurred_at: daysAgo(400) });
    const result = computeCollectionGaps(overview(), [oldObservation], NOW);
    expect(gapIds(result)).toContain('stale_interaction');
  });

  it('defaults `now` to the current time when omitted', () => {
    const entry = relationshipEntry({
      link: { valid_from: new Date().toISOString(), metadata: { human_label: 'Mentor' } }
    });
    const result = computeCollectionGaps(overview({ current_relationships: [entry] }), []);
    expect(gapIds(result)).toEqual([]);
  });
});
