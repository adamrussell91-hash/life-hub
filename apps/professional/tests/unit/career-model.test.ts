import { describe, expect, it } from 'vitest';
import {
  applicationMatchPercent,
  buildCareerModel,
  criterionCoverage,
  isSteppingStoneDone,
  readinessPercent,
  roughTermLabel
} from '@/domain/career-model';

const CRIT_A = 'fcrit_00000000-0000-4000-8000-000000000001';
const CRIT_B = 'fcrit_00000000-0000-4000-8000-000000000002';
const FUTURE_ID = 'future_00000000-0000-4000-8000-000000000010';
const STONE_ID = 'stone_00000000-0000-4000-8000-000000000020';
const APP_ID = 'application_00000000-0000-4000-8000-000000000030';
const ACH_ID = 'achievement_00000000-0000-4000-8000-000000000040';

describe('career-model formulas', () => {
  it('pins criterion coverage 1 / 0.5 / 0', () => {
    expect(criterionCoverage('strong')).toBe(1);
    expect(criterionCoverage('some')).toBe(0.5);
    expect(criterionCoverage(null)).toBe(0);
  });

  it('readiness is null with no criteria, else mean × 100', () => {
    expect(readinessPercent([], [])).toBeNull();
    expect(
      readinessPercent(
        [{ id: CRIT_A }, { id: CRIT_B }],
        [{ criterion_ids: [CRIT_A], strength: 'strong' }]
      )
    ).toBe(50);
    expect(
      readinessPercent(
        [{ id: CRIT_A }, { id: CRIT_B }],
        [
          { criterion_ids: [CRIT_A], strength: 'strong' },
          { criterion_ids: [CRIT_B], strength: 'some' }
        ]
      )
    ).toBe(75);
  });

  it('application match uses the same coverage rule', () => {
    expect(applicationMatchPercent([{ id: 'acrit_1' }], [])).toBe(0);
    expect(
      applicationMatchPercent(
        [{ id: 'acrit_1' }, { id: 'acrit_2' }],
        [{ criterion_id: 'acrit_1', strength: 'strong' }]
      )
    ).toBe(50);
  });

  it('stone done derives from override or completed action endpoints', () => {
    expect(isSteppingStoneDone({ status_override: 'done' }, [])).toBe(true);
    expect(isSteppingStoneDone({ status_override: null }, [{ kind: 'task', lifecycle_status: 'done' }])).toBe(
      true
    );
    expect(
      isSteppingStoneDone({ status_override: null }, [{ kind: 'project', lifecycle_status: 'completed' }])
    ).toBe(true);
    expect(isSteppingStoneDone({ status_override: null }, [{ kind: 'task', lifecycle_status: 'open' }])).toBe(
      false
    );
  });

  it('roughTermLabel marks estimates with a tilde', () => {
    expect(roughTermLabel('2030-02-01', { estimated: true })).toBe('~T1 2030');
    expect(roughTermLabel('2026-09-01', { estimated: false })).toBe('T3 2026');
  });
});

describe('buildCareerModel (V4 single source)', () => {
  const overview = {
    achievements: [
      {
        id: ACH_ID,
        title: 'Gifted policy',
        occurred_on: '2026-09-15',
        date_precision: 'day',
        lifecycle_status: 'active'
      }
    ],
    futures: [
      {
        id: FUTURE_ID,
        title: 'Head of Gifted Education',
        where: 'Independent school',
        status: 'active',
        lane_order: 0,
        colour_slot: 1,
        criteria: [
          { id: CRIT_A, text: 'Whole-school policy', order: 0, source: 'ad' },
          { id: CRIT_B, text: 'Staff PL', order: 1, source: 'ad' }
        ],
        target_date: '2030-01-01',
        aliases: ['Head of Gifted'],
        created_at: '2026-01-01T00:00:00.000Z'
      }
    ],
    stones: [
      {
        id: STONE_ID,
        label: 'Publish the gifted policy',
        target_term_start: '2027-07-01',
        origin: 'gap',
        status_override: null
      }
    ],
    applications: [
      {
        id: APP_ID,
        position_title: 'Head of Gifted',
        pipeline_status: 'drafting',
        closing_date: '2026-10-01',
        selection_criteria: [{ id: 'acrit_1' }, { id: 'acrit_2' }]
      }
    ],
    supports_future: [
      {
        future_id: FUTURE_ID,
        criterion_ids: [CRIT_A],
        strength: 'strong',
        updated_at: '2026-09-20T00:00:00.000Z'
      }
    ],
    answers_criterion: [{ application_id: APP_ID, criterion_id: 'acrit_1', strength: 'some' }],
    stone_for: [{ stone_id: STONE_ID, future_id: FUTURE_ID }],
    stone_actions: [],
    employment: [{ valid_from: '2015-01-26', role: 'English/HSIE Teacher' }]
  };

  it('feeds legend %, panel ring, river label, match % from one model', () => {
    const model = buildCareerModel(overview, { now: '2026-09-26T00:00:00.000Z' });
    const future = model.futures[0];
    expect(future.readiness).toBe(50);
    expect(future.readiness_label).toBe('50%');
    expect(model.applications[0].match_percent).toBe(25);
    expect(model.applications[0].match_label).toBe('25%');
    expect(model.stats.skill_cards).toBe(1);
    expect(model.stats_line).toContain('1 skill cards');
    expect(model.stats_line).toContain('1 futures ahead');
    // legend / ring / river all read the same readiness
    expect(future.readiness).toBe(model.futures[0].readiness);
  });

  it('What-if deltas compare with vs without moves on the same model function', () => {
    const withMoves = buildCareerModel(overview, {
      now: '2026-09-26T00:00:00.000Z',
      moves: [
        {
          status: 'suggested',
          coverages: [{ future_id: FUTURE_ID, criterion_ids: [CRIT_B], strength: 'strong' }]
        }
      ]
    });
    expect(withMoves.futures[0].readiness).toBe(100);
    expect(withMoves.what_if_deltas[0].readiness_delta).toBe(50);
  });
});
