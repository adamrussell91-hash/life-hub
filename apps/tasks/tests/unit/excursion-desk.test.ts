import { describe, expect, it } from 'vitest';
import type { Program } from '@/schemas/program';
import type { Project } from '@/schemas/project';
import { NSW_2026_TERMS } from '@/domain/hub-prefs';
import {
  closedExcursions,
  openFolderNames,
  tightestNotice,
  usualCalls
} from '@/domain/excursion-desk';

const terms = NSW_2026_TERMS.map((term) => ({ ...term }));

function program(id: string, name: string, month: string): Program {
  return { id, name, month } as Program;
}

function trip(partial: Partial<Project> & Pick<Project, 'id' | 'title' | 'status'>): Project {
  return {
    schema_version: 1,
    type: 'excursion',
    current_end_date: null,
    updated_at: '2026-01-01T00:00:00.000Z',
    ...partial
  } as Project;
}

describe('usualCalls', () => {
  it('places a passed September program on the next term start', () => {
    const [call] = usualCalls(
      [program('prog_tom', 'Tournament of Minds', 'September')],
      [],
      terms,
      '2026-09-26'
    );
    expect(call).toMatchObject({
      name: 'Tournament of Minds',
      usualMonth: 'September',
      monthPassed: true,
      suggestedDate: '2026-10-13',
      term: 4
    });
  });

  it('keeps the 15th when that day is still inside a term', () => {
    const [call] = usualCalls(
      [program('prog_towns', 'Tournament of Towns', 'October')],
      [],
      terms,
      '2026-09-26'
    );
    expect(call).toMatchObject({ monthPassed: false, suggestedDate: '2026-10-15', term: 4 });
  });

  it('ignores programs outside last month, this month, and next month', () => {
    expect(
      usualCalls([program('prog_march', 'Ethics Olympiad', 'March')], [], terms, '2026-09-26')
    ).toEqual([]);
  });

  it('skips a program that already has a linked trip in its usual month', () => {
    const linked = trip({
      id: 'proj_linked',
      title: 'Forum',
      status: 'active',
      current_end_date: '2026-09-18',
      linked_program_id: 'prog_forum'
    });
    expect(
      usualCalls([program('prog_forum', 'Human Rights Forum', 'September')], [linked], terms, '2026-09-26')
    ).toEqual([]);
  });
});

describe('closed excursions and folder carry', () => {
  it('lists archived trips newest event date first and reads unfinished folder names', () => {
    const older = trip({
      id: 'older',
      title: 'Older',
      status: 'completed',
      current_end_date: '2026-03-01'
    });
    const newer = trip({
      id: 'newer',
      title: 'Newer',
      status: 'completed',
      current_end_date: '2026-08-12',
      folder_items: [
        { id: 'folder_0', name: 'Medical Notes', on: false },
        { id: 'folder_1', name: 'Permission Forms', on: true }
      ]
    });
    const live = trip({ id: 'live', title: 'Live', status: 'active', current_end_date: '2026-10-10' });
    expect(closedExcursions([older, live, newer]).map((project) => project.id)).toEqual(['newer', 'older']);
    expect(openFolderNames(newer)).toEqual(['Medical Notes']);
    expect(openFolderNames(null)).toEqual([]);
  });

  it('names the notice that was shorter than the template lead', () => {
    const project = trip({
      id: 'proj_short',
      title: 'Short notice',
      status: 'completed',
      current_end_date: '2026-10-10',
      key_dates: {
        permission_note_due: '2026-10-05',
        staff_notification_due: '2026-09-19',
        risk_assessment_due: '2026-08-29',
        payment_due: '2026-09-12'
      }
    });
    expect(
      tightestNotice(project, {
        permission_note_days: 21,
        staff_email_days: 21,
        risk_assessment_days: 42,
        payment_days: 28
      })
    ).toEqual({ label: 'Permission notes', had: 5, need: 21 });
  });
});
