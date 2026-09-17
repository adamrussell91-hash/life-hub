import { describe, expect, it } from 'vitest';
import type { CurriculumResponse } from '@/teacher/nav';
import type { ScopeSequence, Subject, Unit, Year } from '@/schemas';
import {
  curriculumForScopeTimeline,
  enhanceScopeUnitPicker,
  pickerUnits
} from '@/teacher/sections/scope-unit-picker-context';

const ISO = '2026-01-01T00:00:00.000Z';

const year: Year = {
  id: 'year_12',
  type: 'year',
  title: 'Year 12',
  slug: 'year_12',
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1,
  year_level: 12,
  subject_ids: ['subject_eng']
};

const subject: Subject = {
  id: 'subject_eng',
  type: 'subject',
  title: 'English Advanced',
  display_title: 'Year 12 English Advanced',
  slug: 'english_advanced',
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1,
  scope_id: 'scope_eng',
  unit_ids: ['unit_live', 'unit_trashed', 'unit_archived', 'unit_placed'],
  outcome_ids: [],
  class_ids: []
};

function unit(id: string, title: string, status: Unit['status']): Unit {
  return {
    id,
    type: 'unit',
    title,
    slug: id,
    status,
    created_at: ISO,
    updated_at: ISO,
    schema_version: 1,
    year_id: year.id,
    subject_id: subject.id,
    lesson_ids: id === 'unit_live' ? ['lesson_1', 'lesson_2'] : [],
    primary_term: id === 'unit_live' ? 2 : undefined
  };
}

const live = unit('unit_live', 'Warlight', 'active');
const trashed = unit('unit_trashed', 'Deleted old unit', 'trashed');
const archived = unit('unit_archived', 'Archived old unit', 'archived');
const placed = unit('unit_placed', 'Already placed', 'trashed');

const scope: ScopeSequence = {
  id: 'scope_eng',
  type: 'scope_sequence',
  title: 'English Advanced 2026',
  slug: 'english_advanced_2026',
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1,
  subject_id: subject.id,
  academic_year: 2026,
  week_count: 40,
  terms: [],
  timeline_items: [
    {
      id: 'ti_placed',
      kind: 'unit',
      unit_id: placed.id,
      start_week: 1,
      end_week: 4,
      order: 1
    }
  ]
};

const curriculum: CurriculumResponse = {
  years: [year],
  subjects: [subject],
  units: [live, trashed, archived, placed],
  lessons: [],
  classes: [],
  scheduled_lessons: [],
  scope_sequences: [scope],
  media: [],
  schedule_anchor_date: '2026-09-17'
};

describe('scope unit picker context', () => {
  it('offers only active units not already on the timeline', () => {
    expect(pickerUnits(curriculum, subject.id).map((entry) => entry.id)).toEqual(['unit_live']);
  });

  it('keeps a deleted unit already on the timeline resolvable while hiding other inactive units', () => {
    const visible = curriculumForScopeTimeline(curriculum, subject.id);
    expect(visible.units.map((entry) => entry.id)).toContain('unit_placed');
    expect(visible.units.map((entry) => entry.id)).toContain('unit_live');
    expect(visible.units.map((entry) => entry.id)).not.toContain('unit_trashed');
    expect(visible.units.map((entry) => entry.id)).not.toContain('unit_archived');
  });

  it('adds year, subject, term and lesson context to picker rows', () => {
    const picker = document.createElement('div');
    picker.className = 'scope-timeline__picker';
    const button = document.createElement('button');
    button.className = 'scope-timeline__picker-unit';
    button.textContent = 'Warlight';
    picker.append(button);

    enhanceScopeUnitPicker(picker, curriculum, subject.id);

    expect(button.dataset.unitId).toBe('unit_live');
    expect(button.querySelector('.scope-timeline__picker-unit-title')?.textContent).toBe('Warlight');
    expect(button.querySelector('.scope-timeline__picker-unit-meta')?.textContent).toBe(
      'Year 12 · English Advanced · Term 2 · 2 lessons'
    );
  });
});
