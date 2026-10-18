// apps/teaching/tests/unit/notion-import-map-entities.test.ts
import { describe, expect, it } from 'vitest';
import { buildImportPlan } from '@/notion-import/map-entities';
import { EMPTY_CHOICES, type MapContext, type NotionPage, type NotionTree } from '@/notion-import/types';
import { p } from './notion-import-fixtures';

const now = '2026-10-18T00:00:00.000Z';
function page(id: string, category: string | null, extra: Partial<NotionPage> = {}): NotionPage {
  return {
    id, url: `https://www.notion.so/${id}`, last_edited_time: now, title: `Page ${id}`, category,
    subjects: ['Philosophy and Ethics'], years: ['Year 8', 'Year 7'], outcomes: [],
    date_start: null, date_end: null, files: [], cover: null, blocks: [p('body')], child_ids: [], ...extra
  };
}
function tree(rootId: string, ...pages: NotionPage[]): NotionTree {
  return { root_id: rootId, pages: Object.fromEntries(pages.map((pg) => [pg.id, pg])) };
}
const ctx = (over: Partial<MapContext> = {}): MapContext => ({
  now,
  years: [{ id: 'year_7', year_level: 7 }, { id: 'year_8', year_level: 8 }],
  subjects: [{ id: 'subject_phil', title: 'Philosophy and Ethics' }],
  outcomes: [{ id: 'outcome_a', code: 'EN4-URA-01' }],
  source_map: {},
  choices: EMPTY_CHOICES,
  ...over
});

describe('buildImportPlan', () => {
  it('imports a program with its sessions as a program unit and lessons', () => {
    const plan = buildImportPlan(tree('p1',
      page('p1', 'Enrichment Program', { child_ids: ['s1', 's2'] }),
      page('s1', 'Session'),
      page('s2', 'Workshop')
    ), ctx());
    const [program, l1, l2] = plan.entities;
    expect(program).toMatchObject({ kind: 'unit', label: 'Program', needs: [] });
    expect(program.record).toMatchObject({ type: 'unit', kind: 'program', year_id: 'year_7', subject_id: 'subject_phil' });
    expect(program.record.lesson_ids).toEqual([l1.id, l2.id]);
    expect(l1.record).toMatchObject({ type: 'lesson', unit_id: program.id, sequence: 1, pedagogical_mode: 'lesson', review_status: 'needs_review' });
    expect(l2.record).toMatchObject({ sequence: 2, pedagogical_mode: 'workshop' });
    expect(l1.record.source).toMatchObject({ system: 'notion', page_id: 's1' });
  });

  it('uses deterministic ids, and the existing id from the source map', () => {
    const t = tree('u1', page('u1', 'Unit'));
    expect(buildImportPlan(t, ctx()).entities[0].id).toBe('unit_n_u1');
    const again = buildImportPlan(t, ctx({ source_map: { u1: 'unit_existing' } })).entities[0];
    expect(again).toMatchObject({ id: 'unit_existing', existing: true });
  });

  it('skips Curriculum Map and Scope and Sequence pages', () => {
    const plan = buildImportPlan(tree('u1',
      page('u1', 'Unit', { child_ids: ['m1', 'q1'] }),
      page('m1', 'Curriculum Map'),
      page('q1', 'Scope and Sequence')
    ), ctx());
    expect(plan.entities).toHaveLength(1);
    expect(plan.skipped.map((s) => s.page_id)).toEqual(['m1', 'q1']);
  });

  it('honours excluded pages and their descendants', () => {
    const plan = buildImportPlan(tree('u1',
      page('u1', 'Unit', { child_ids: ['l1', 'l2'] }), page('l1', 'Lesson'), page('l2', 'Lesson')
    ), ctx({ choices: { ...EMPTY_CHOICES, excluded_page_ids: ['l2'] } }));
    expect(plan.entities.map((e) => e.page_id)).toEqual(['u1', 'l1']);
    expect(plan.entities[0].record.lesson_ids).toEqual([plan.entities[1].id]);
  });

  it('asks for a unit when a lesson is imported on its own, and accepts one', () => {
    expect(buildImportPlan(tree('l1', page('l1', 'Lesson')), ctx()).entities[0].needs).toEqual(['unit']);
    const chosen = buildImportPlan(tree('l1', page('l1', 'Lesson')),
      ctx({ choices: { ...EMPTY_CHOICES, overrides: { l1: { unit_id: 'unit_hub' } } } })).entities[0];
    expect(chosen).toMatchObject({ needs: [] });
    expect(chosen.record.unit_id).toBe('unit_hub');
  });

  it('needs a subject when nothing matches, and can create one', () => {
    const t = tree('u1', page('u1', 'Unit', { subjects: ['Made-up Subject'] }));
    const plan = buildImportPlan(t, ctx());
    expect(plan.entities[0].needs).toEqual(['subject']);
    expect(plan.entities[0].suggested.subject_title).toBe('Made-up Subject');
    const created = buildImportPlan(t, ctx({ choices: { ...EMPTY_CHOICES, overrides: { u1: { create_subject_title: 'Made-up Subject' } } } }));
    expect(created.new_subjects).toEqual([{ id: 'subject_n_made-up-subject', title: 'Made-up Subject' }]);
    expect(created.entities[0].record.subject_id).toBe('subject_n_made-up-subject');
  });

  it('maps outcomes by code and warns on unknown codes', () => {
    const plan = buildImportPlan(tree('l1', page('l1', 'Unit', { outcomes: ['EN4-URA-01', 'XX-99'] })), ctx());
    expect(plan.entities[0].record.outcome_ids).toEqual(['outcome_a']);
    expect(plan.warnings.some((w) => w.rule === 'outcome_unmatched' && w.message.includes('XX-99'))).toBe(true);
  });

  it('maps a class with its units as active units', () => {
    const plan = buildImportPlan(tree('c1',
      page('c1', 'Class', { title: 'Year 12 Advanced', child_ids: ['u1'], date_start: '2027-01-30' }),
      page('u1', 'Unit')
    ), ctx());
    const [cls, unit] = plan.entities;
    expect(cls.record).toMatchObject({
      type: 'class', code: 'year-12-advanced', display_name: 'Year 12 Advanced', academic_year: 2027,
      active_unit_ids: [unit.id]
    });
    expect((cls.record.homepage as any).custom[0].block_type).toBe('rich_text');
  });

  it('maps a syllabus to a document', () => {
    const plan = buildImportPlan(tree('s1', page('s1', 'Syllabus')), ctx());
    expect(plan.entities[0]).toMatchObject({ kind: 'document', label: 'Syllabus' });
    expect(plan.entities[0].record).toMatchObject({ type: 'document', kind: 'syllabus', subject_id: 'subject_phil' });
  });

  it('adds Files as attachments and the cover as a placeholder', () => {
    const plan = buildImportPlan(tree('u1', page('u1', 'Unit', {
      files: [{ name: 'brief.pdf', url: 'https://files.example/brief.pdf', source: 'file' }],
      cover: { name: 'cover.png', url: 'https://files.example/cover.png', source: 'file' }
    })), ctx());
    const rec: any = plan.entities[0].record;
    expect(rec.cover).toEqual({ url: 'notion-media:cover:u1' });
    expect(rec.blocks.at(-1)).toMatchObject({ block_type: 'attachment', content: { title: 'brief.pdf' } });
    expect(plan.media.map((m) => m.purpose).sort()).toEqual(['attachment', 'cover']);
  });

  it('sets unit dates from Date/s', () => {
    const plan = buildImportPlan(tree('u1', page('u1', 'Unit', { date_start: '2027-02-01', date_end: '2027-03-15T00:00:00.000+11:00' })), ctx());
    expect(plan.entities[0].record).toMatchObject({ start_date: '2027-02-01', end_date: '2027-03-15' });
  });
});
