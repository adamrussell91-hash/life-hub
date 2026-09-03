import { describe, it, expect } from 'vitest';
import { ScopeSequenceSchema, TimelineItemSchema } from '@/schemas/scope-sequence';

const base = {
  id: 'scope_y12_engadv_2026',
  type: 'scope_sequence' as const,
  title: 'Year 12 English Advanced 2026',
  slug: 'y12_engadv_2026',
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
      kind: 'unit' as const,
      unit_id: 'unit_aotfw',
      start_week: 12,
      end_week: 18,
      order: 1
    },
    {
      id: 'ti_note_1',
      kind: 'note' as const,
      title: 'Assessment week',
      start_week: 19,
      end_week: 19,
      order: 2
    }
  ],
  status: 'active' as const,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  schema_version: 1 as const
};

describe('ScopeSequenceSchema', () => {
  it('accepts a valid scope with unit and note items', () => {
    expect(ScopeSequenceSchema.parse(base).timeline_items).toHaveLength(2);
  });

  it('rejects end_week before start_week via refine on items', () => {
    expect(() =>
      TimelineItemSchema.parse({
        id: 'x',
        kind: 'note',
        title: 'Bad',
        start_week: 5,
        end_week: 4,
        order: 1
      })
    ).toThrow();
  });

  it('accepts calendar dates on terms and timeline items', () => {
    const withDates = {
      ...base,
      terms: base.terms.map((term, index) => ({
        ...term,
        start_date: `2026-0${index + 1}-01`,
        end_date: `2026-0${index + 1}-20`
      })),
      timeline_items: [
        { ...base.timeline_items[0]!, start_date: '2026-04-27', end_date: '2026-06-12' }
      ]
    };
    expect(ScopeSequenceSchema.parse(withDates).terms[0]?.start_date).toBe('2026-01-01');
  });

  it('rejects invalid kind', () => {
    expect(() =>
      TimelineItemSchema.parse({
        id: 'x',
        kind: 'milestone',
        title: 'Nope',
        start_week: 1,
        end_week: 1,
        order: 1
      })
    ).toThrow();
  });
});
