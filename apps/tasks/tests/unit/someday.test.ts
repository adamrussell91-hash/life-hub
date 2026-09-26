import { describe, expect, it } from 'vitest';
import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import {
  addOdysseyChild,
  computeLifeCoverage,
  countOdysseyNodes,
  findOdysseyPath,
  LIFE_AREAS,
  LIFE_COVERAGE_LABEL_CLEARANCE,
  LIFE_COVERAGE_SEATS,
  lifeCoverageHeadline,
  lifeCoverageStarRadius,
  matchesSomedayKind,
  maturityWeight,
  newOdysseyNode,
  removeOdysseyNode,
  somedayLinkedProjectIds,
  stalledLinkedProjects,
  suggestFirstMilestone,
  suggestIfThen
} from '@/domain/someday';
import { groupSomedayForReview } from '@/views/someday';

const task = (partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task => ({
  schema_version: 1,
  description: '',
  kind: 'task',
  bucket: 'someday',
  step_order: 0,
  domain: 'life',
  framework_used: null,
  estimated_duration: null,
  actual_duration: null,
  due_date: null,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
  completed_at: null,
  status: 'deferred',
  blocked_since: null,
  priority: 'medium',
  parent_project_id: null,
  parent_task_id: null,
  depends_on: [],
  tags: [],
  recurrence_rule: null,
  due_time: null,
  remind_at: null,
  remind_dismissed_at: null,
  attachments: [],
  source: 'manual',
  target_date: null,
  review_at: null,
  waiting_on: null,
  waiting_since: null,
  follow_up_at: null,
  waiting_status: null,
  contexts: [],
  cognitive_load: null,
  depth: null,
  ...partial
});

const project = (partial: Partial<Project> & Pick<Project, 'id' | 'title'>): Project => ({
  schema_version: 1,
  description: '',
  parent_goal_id: null,
  tags: [],
  arc_summary: '',
  purpose: '',
  desired_outcome: '',
  quality_bar: null,
  review_at: null,
  type: 'standard',
  milestones: [],
  status: 'active',
  baseline_end_date: null,
  current_end_date: null,
  review_summary: null,
  stall_flagged_at: null,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
  competition_or_event_type: null,
  key_dates: null,
  student_group_reference: null,
  generated_admin_tasks: [],
  drafted_documents: null,
  linked_program_id: null,
  ...partial
});

describe('maturityWeight', () => {
  it('weights Set highest and treats missing maturity like New', () => {
    expect(maturityWeight('set')).toBe(1);
    expect(maturityWeight('developing')).toBeCloseTo(0.65);
    expect(maturityWeight('new')).toBeCloseTo(0.32);
    expect(maturityWeight(null)).toBeCloseTo(0.32);
    expect(maturityWeight(undefined)).toBeCloseTo(0.32);
  });
});

describe('computeLifeCoverage', () => {
  it('returns every fixed life area, including zero-count ones, in a stable order', () => {
    const items = [
      task({ id: '1', title: 'Sail around Ireland', life_area: 'explore', maturity: 'set' }),
      task({ id: '2', title: 'Learn Portuguese', life_area: 'explore', maturity: 'new' })
    ];
    const coverage = computeLifeCoverage(items, [
      { status: 'active', sphere: 'life', life_area: 'explore' },
      { status: 'active', sphere: 'life', life_area: 'health' },
      { status: 'parked', sphere: 'life', life_area: 'explore' }
    ]);
    expect(coverage.map((row) => row.id)).toEqual(LIFE_AREAS.map((area) => area.id));

    const explore = coverage.find((row) => row.id === 'explore')!;
    expect(explore.count).toBe(2);
    expect(explore.goalCount).toBe(1);
    expect(explore.avgMaturity).toBeCloseTo((1 + 0.32) / 2);

    const health = coverage.find((row) => row.id === 'health')!;
    expect(health.count).toBe(0);
    expect(health.goalCount).toBe(1);
    expect(health.avgMaturity).toBe(0);
  });

  it('ignores items with no life area set', () => {
    const coverage = computeLifeCoverage([task({ id: '1', title: 'Untagged dream' })]);
    expect(coverage.every((row) => row.count === 0)).toBe(true);
  });
});

describe('life coverage constellation seats', () => {
  it('keeps every pair of stars far enough apart that cores and labels cannot overlap', () => {
    const seats = LIFE_AREAS.map((area) => {
      const seat = LIFE_COVERAGE_SEATS[area.id];
      if (!seat) throw new Error(`missing constellation seat for ${area.id}`);
      return { id: area.id, ...seat };
    });
    const minGap = lifeCoverageStarRadius(99) + lifeCoverageStarRadius(99) + LIFE_COVERAGE_LABEL_CLEARANCE;
    for (let i = 0; i < seats.length; i += 1) {
      for (let j = i + 1; j < seats.length; j += 1) {
        const left = seats[i];
        const right = seats[j];
        const gap = Math.hypot(left.x - right.x, left.y - right.y);
        expect(gap, `${left.id}–${right.id}`).toBeGreaterThanOrEqual(minGap);
      }
    }
  });
});

describe('suggestFirstMilestone', () => {
  it('names the idea in a research-shaped first step', () => {
    expect(suggestFirstMilestone(task({ id: '1', title: 'Study at Cambridge' }))).toBe(
      'Find out what "Study at Cambridge" would actually take'
    );
  });
});

describe('suggestIfThen', () => {
  it('names the idea in a tiny implementation-intention nudge', () => {
    expect(suggestIfThen(task({ id: '1', title: 'Study at Cambridge' }))).toBe(
      'If it\'s a free evening → spend 10 min on "Study at Cambridge"'
    );
  });
});

describe('lifeCoverageHeadline', () => {
  it('names the stacked area and the gap', () => {
    const coverage = computeLifeCoverage([
      task({ id: '1', title: 'a', life_area: 'explore' }),
      task({ id: '2', title: 'b', life_area: 'explore' })
    ]);
    expect(lifeCoverageHeadline(coverage)).toBe('Explore is stacked. Career has nothing.');
  });

  it('handles no dreams tagged yet', () => {
    expect(lifeCoverageHeadline(computeLifeCoverage([]))).toBe('No dreams tagged with a life area yet.');
  });

  it('keeps career out of the origin-date categories and matches the someday filter', () => {
    const bucket = task({ id: 'b', title: 'Aurora', someday_kind: 'bucket_list' });
    const dream = task({ id: 'd', title: 'Sea', someday_kind: 'dreams_jar' });
    const career = task({ id: 'c', title: 'Studio', someday_kind: 'career' });
    const plain = task({ id: 'p', title: 'Loose idea' });
    expect(matchesSomedayKind(bucket, 'bucket_list')).toBe(true);
    expect(matchesSomedayKind(career, 'bucket_list')).toBe(false);
    expect(matchesSomedayKind(career, 'career')).toBe(true);
    expect(matchesSomedayKind(plain, 'uncategorised')).toBe(true);
    expect(matchesSomedayKind(dream, 'uncategorised')).toBe(false);
    expect(matchesSomedayKind(career, 'all')).toBe(true);
  });
});

describe('stalledLinkedProjects', () => {
  it('flags a linked project flagged stalled, and ignores unlinked or archived ones', () => {
    const dream = task({ id: 't1', title: 'Retrain as a sailing instructor', linked_project_ids: ['p1', 'p2'] });
    const stalled = project({ id: 'p1', title: 'Get certified', status: 'stalled' });
    const unrelated = project({ id: 'other', title: 'Not linked', status: 'stalled' });
    const archived = project({ id: 'p2', title: 'Old attempt', status: 'archived_dead' });
    const result = stalledLinkedProjects(dream, [stalled, unrelated, archived], []);
    expect(result.map((p) => p.id)).toEqual(['p1']);
  });

  it('treats an empty linked_project_ids as no linked projects', () => {
    const dream = task({ id: 't1', title: 'No links yet' });
    expect(somedayLinkedProjectIds(dream)).toEqual([]);
    expect(stalledLinkedProjects(dream, [project({ id: 'p1', title: 'x', status: 'stalled' })], [])).toEqual([]);
  });
});

describe('Odyssey tree helpers', () => {
  it('adds root and nested children, finds paths, counts and removes nodes', () => {
    const a = newOdysseyNode({ id: 'a', title: 'Climb where I am' });
    let tree = addOdysseyChild([], null, a);
    expect(tree).toHaveLength(1);

    const a1 = newOdysseyNode({ id: 'a1', title: 'Get certified' });
    tree = addOdysseyChild(tree, 'a', a1);
    expect(tree[0].children).toHaveLength(1);
    expect(countOdysseyNodes(tree)).toBe(2);

    const path = findOdysseyPath(tree, 'a1');
    expect(path?.map((node) => node.id)).toEqual(['a', 'a1']);
    expect(findOdysseyPath(tree, 'missing')).toBeNull();

    tree = removeOdysseyNode(tree, 'a1');
    expect(countOdysseyNodes(tree)).toBe(1);
  });
});

describe('groupSomedayForReview (existing behaviour unaffected)', () => {
  it('still separates review-now from parked items', () => {
    const due = task({ id: '1', title: 'Due', review_at: '2026-01-01' });
    const noDate = task({ id: '2', title: 'No date' });
    const future = task({ id: '3', title: 'Future', review_at: '2099-01-01' });
    const { reviewNow, parked } = groupSomedayForReview([due, noDate, future], '2026-06-01');
    expect(reviewNow.map((t) => t.id).sort()).toEqual(['1', '2']);
    expect(parked.map((t) => t.id)).toEqual(['3']);
  });
});
