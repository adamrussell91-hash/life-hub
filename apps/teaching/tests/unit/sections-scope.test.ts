import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/app/router', () => ({ navigate: vi.fn() }));

import { navigate } from '@/app/router';
import { pastelFromId } from '@/design/pastel';
import {
  renderScopeSequencesIndex,
  renderScopeTimelineEditor
} from '@/teacher/sections/scope-sequences';
import type { CurriculumResponse } from '@/teacher/nav';
import type { ScopeSequence, Subject, Unit, Year } from '@/schemas';

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
  subject_ids: ['subject_y12_engadv', 'subject_y12_engstd']
};

const engAdv: Subject = {
  id: 'subject_y12_engadv',
  type: 'subject',
  title: 'English Advanced',
  display_title: 'Year 12 English Advanced',
  slug: 'english_advanced',
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1,
  scope_id: 'scope_y12_engadv_2026',
  unit_ids: ['unit_aotfw'],
  outcome_ids: [],
  class_ids: []
};

const engStd: Subject = {
  ...engAdv,
  id: 'subject_y12_engstd',
  title: 'English Standard',
  display_title: 'Year 12 English Standard',
  slug: 'english_standard',
  scope_id: undefined,
  unit_ids: []
};

const unit: Unit = {
  id: 'unit_aotfw',
  type: 'unit',
  title: 'Artist of the Floating World',
  slug: 'artist_of_the_floating_world',
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1,
  year_id: 'year_12',
  subject_id: 'subject_y12_engadv',
  lesson_ids: []
};

const scope: ScopeSequence = {
  id: 'scope_y12_engadv_2026',
  type: 'scope_sequence',
  title: 'Year 12 English Advanced 2026',
  slug: 'y12_engadv_2026',
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1,
  subject_id: 'subject_y12_engadv',
  academic_year: 2026,
  week_count: 40,
  terms: [
    { id: 'term_t1', title: 'Term 1', term_number: 1, start_week: 1, end_week: 10 },
    { id: 'term_t2', title: 'Term 2', term_number: 2, start_week: 11, end_week: 20 },
    { id: 'term_t3', title: 'Term 3', term_number: 3, start_week: 21, end_week: 30 },
    { id: 'term_t4', title: 'Term 4', term_number: 4, start_week: 31, end_week: 40 }
  ],
  timeline_items: [
    {
      id: 'ti_unit_aotfw',
      kind: 'unit',
      unit_id: 'unit_aotfw',
      start_week: 12,
      end_week: 18,
      order: 1
    },
    {
      id: 'ti_note_mid',
      kind: 'note',
      title: 'Mid-year note',
      start_week: 20,
      end_week: 20,
      order: 2
    }
  ]
};

const curriculum: CurriculumResponse = {
  years: [year],
  subjects: [engAdv, engStd],
  units: [unit],
  lessons: [],
  classes: [],
  scheduled_lessons: [],
  scope_sequences: [scope],
  media: [],
  schedule_anchor_date: '2026-08-12'
};

describe('scope & sequences', () => {
  let canvas: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    canvas = document.createElement('div');
  });

  it('renders overall timeline with subject rows and clickable unit bars', () => {
    renderScopeSequencesIndex(canvas, curriculum);
    expect(canvas.querySelector('.scope-overview')).not.toBeNull();
    expect(canvas.querySelector('.page-header__title')?.textContent).toMatch(/Overall Scope/i);

    const rows = canvas.querySelectorAll('.scope-overview__row');
    expect(rows).toHaveLength(1);
    expect(canvas.textContent).toContain('English Advanced');
    expect(canvas.textContent).not.toContain('English Standard');

    const label = canvas.querySelector<HTMLAnchorElement>('.scope-overview__label');
    expect(label?.getAttribute('href')).toBe('/scope-sequences/subject_y12_engadv');

    const bar = canvas.querySelector<HTMLAnchorElement>('[data-scope-bar-kind="unit"]');
    expect(bar).not.toBeNull();
    expect(bar!.getAttribute('href')).toContain('/units/unit_aotfw');
    expect(bar!.dataset.tint).toBe(pastelFromId(bar!.dataset.unitId!));

    const noteBar = canvas.querySelector<HTMLAnchorElement>('[data-scope-bar-kind="note"]');
    expect(noteBar?.getAttribute('href')).toBe(
      '/scope-sequences/subject_y12_engadv?selectNote=ti_note_mid'
    );
  });

  it('navigates from overview row label and unit bar', () => {
    renderScopeSequencesIndex(canvas, curriculum);

    canvas
      .querySelector<HTMLAnchorElement>('.scope-overview__label')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(navigate).toHaveBeenCalledWith('/scope-sequences/subject_y12_engadv');

    canvas
      .querySelector<HTMLAnchorElement>('[data-scope-bar-kind="unit"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(navigate).toHaveBeenCalledWith('/units/unit_aotfw');
  });

  it('renders the timeline editor for a known subject with a scope', () => {
    renderScopeTimelineEditor(canvas, curriculum, 'subject_y12_engadv');
    expect(canvas.querySelector('.page-header__title')?.textContent).toBe('English Advanced');
    expect(canvas.querySelector('.scope-timeline')).toBeTruthy();
    expect(canvas.textContent).not.toMatch(/coming next/i);
  });

  it('selects a note when selectedNoteId is provided', () => {
    renderScopeTimelineEditor(canvas, curriculum, 'subject_y12_engadv', {
      selectedNoteId: 'ti_note_mid'
    });
    const selected = canvas.querySelector('.scope-timeline__item--selected');
    expect(selected?.getAttribute('data-item-id')).toBe('ti_note_mid');
    expect(canvas.querySelector('.scope-timeline__note-title')).toBeTruthy();
  });

  it('renders not-found for an unknown subject', () => {
    renderScopeTimelineEditor(canvas, curriculum, 'subject_missing');
    expect(canvas.textContent).toMatch(/not found/i);
  });
});
