import { describe, expect, it } from 'vitest';
import { sanitizeApstFocus as netlifySanitizeApstFocus } from '../../../../netlify/functions/_shared/apst-focus.mjs';
import { sanitizeProjectPatch, sanitizeTaskPatch } from '@/domain/agent-mutations';
import { APST_FOCUS_AREAS, sanitizeApstFocus, standardsRibbonAlert } from '@/domain/apst';
import { buildTimelineRows, type TlModel } from '@/domain/timeline-rows';
import { TL } from '@/domain/timeline-geometry';
import { ProjectSchema } from '@/schemas/project';
import { TaskSchema } from '@/schemas/task';

const coverage = {
  1: 'evidenced',
  2: 'evidenced',
  3: 'evidenced',
  4: 'evidenced',
  5: 'none',
  6: 'some',
  7: 'some'
} as const;

function task(extra: Record<string, unknown> = {}) {
  return TaskSchema.parse({
    schema_version: 1,
    id: 'r1',
    title: 'Observation 1',
    domain: 'professional',
    created_at: '2026-09-22T00:00:00.000Z',
    updated_at: '2026-09-22T00:00:00.000Z',
    ...extra
  });
}

describe('standards ribbon writes', () => {
  it('drops unknown focus codes at the schema boundary', () => {
    expect(task({ apst_focus: ['3.2', '4.9', '6.4', 'nope'] }).apst_focus).toEqual(['3.2', '6.4']);
    expect(task().apst_focus).toBeUndefined();
  });

  it('uses the same focus-area list on the Netlify write boundary', () => {
    const raw = [...APST_FOCUS_AREAS.map((area) => area.code), '4.9', 'nope'];
    expect(netlifySanitizeApstFocus(raw)).toEqual(sanitizeApstFocus(raw));
  });

  it('drops unknown focus codes in sanitizeTaskPatch', () => {
    expect(sanitizeTaskPatch({ apst_focus: ['7.4', '4.9', '3.2'], id: 'nope' })).toEqual({
      apst_focus: ['3.2', '7.4']
    });
  });

  it('stores the project toggle and submission date', () => {
    const bare = ProjectSchema.parse({
      schema_version: 1,
      id: 'p-mentor',
      title: 'Accreditation mentoring',
      created_at: '2026-09-07T00:00:00.000Z',
      updated_at: '2026-09-22T00:00:00.000Z'
    });
    expect(bare.standards_ribbon).toBe(false);
    expect(bare.submission_date).toBeNull();
    expect(
      sanitizeProjectPatch({ standards_ribbon: true, submission_date: '2026-12-11', title: 'Accreditation mentoring' })
    ).toEqual({
      standards_ribbon: true,
      submission_date: '2026-12-11',
      title: 'Accreditation mentoring'
    });
  });
});

describe('standards ribbon warning', () => {
  it('flags uncovered standards inside four school weeks and the week before submission', () => {
    expect(
      standardsRibbonAlert({
        today: '2026-09-22',
        submission: '2026-10-16',
        terms: [],
        coverage
      })
    ).toEqual({ standards: [5], loadWeek: '2026-10-05' });
  });

  it('stays quiet when submission is further than four school weeks', () => {
    expect(
      standardsRibbonAlert({
        today: '2026-09-22',
        submission: '2026-12-11',
        terms: [],
        coverage
      })
    ).toEqual({ standards: [], loadWeek: null });
  });

  it('does not count holiday weeks as school weeks', () => {
    const terms = [{ term: 4 as const, starts_on: '2026-10-12', ends_on: '2026-12-18' }];
    expect(
      standardsRibbonAlert({
        today: '2026-09-01',
        submission: '2026-10-16',
        terms,
        coverage
      }).standards
    ).toEqual([5]);
    expect(
      standardsRibbonAlert({
        today: '2026-09-01',
        submission: '2026-10-16',
        terms: [],
        coverage
      }).standards
    ).toEqual([]);
  });
});

describe('standards ribbon row', () => {
  it('adds the ribbon height under a project bar', () => {
    const model: TlModel = {
      dreams: [],
      goals: [],
      projects: [
        {
          id: 'p-mentor',
          title: 'Accreditation mentoring',
          goal: null,
          domain: 'professional',
          start: '2026-09-07',
          end: '2026-12-11',
          baselineEnd: null,
          shade: false,
          colour: '#376fb7',
          ribbon: true
        }
      ],
      milestones: [],
      tasks: []
    };
    const row = buildTimelineRows(model, { zoom: 2, expanded: new Map([['p-mentor', false]]), today: '2026-09-22' }).find(
      (item) => item.ref === 'p-mentor'
    );
    expect(row?.h).toBe(TL.row.project + TL.row.ribbon);
  });
});
