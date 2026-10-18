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

  it('imports a child listed twice once', () => {
    const plan = buildImportPlan(tree('u1', page('u1', 'Unit', { child_ids: ['l1', 'l1'] }), page('l1', 'Lesson')), ctx());
    expect(plan.entities).toHaveLength(2);
    expect(plan.entities[0].record.lesson_ids).toEqual([plan.entities[1].id]);
    expect(plan.warnings.some((w) => w.rule === 'skipped' && w.message.includes('more than once'))).toBe(true);
  });

  it('survives a cycle', () => {
    const plan = buildImportPlan(tree('a', page('a', 'Unit', { child_ids: ['b'] }), page('b', 'Lesson', { child_ids: ['a'] })), ctx());
    expect(plan.entities.map((e) => e.page_id)).toEqual(['a', 'b']);
  });

  it('imports a diamond once, under the first parent', () => {
    const plan = buildImportPlan(tree('c',
      page('c', 'Class', { child_ids: ['u1', 'u2'] }),
      page('u1', 'Unit', { child_ids: ['l'] }), page('u2', 'Unit', { child_ids: ['l'] }), page('l', 'Lesson')
    ), ctx());
    expect(plan.entities.filter((e) => e.page_id === 'l')).toHaveLength(1);
    const u1 = plan.entities.find((e) => e.page_id === 'u1')!;
    const u2 = plan.entities.find((e) => e.page_id === 'u2')!;
    expect(u1.record.lesson_ids).toHaveLength(1);
    expect(u2.record.lesson_ids).toEqual([]);
  });

  it('attaches nested lessons to the nearest unit in order', () => {
    const plan = buildImportPlan(tree('u',
      page('u', 'Unit', { child_ids: ['a', 'b'] }),
      page('a', 'Lesson', { child_ids: ['a1'] }), page('a1', 'Lesson'), page('b', 'Lesson')
    ), ctx());
    const byPage = Object.fromEntries(plan.entities.map((e) => [e.page_id, e]));
    expect(byPage.u.record.lesson_ids).toEqual([byPage.a.id, byPage.a1.id, byPage.b.id]);
    expect(byPage.a1.record).toMatchObject({ unit_id: byPage.u.id, sequence: 2 });
    expect(byPage.b.record.sequence).toBe(3);
    expect(byPage.a1.needs).toEqual([]);
  });

  it('warns when subject or year is inherited from the parent', () => {
    const plan = buildImportPlan(tree('c',
      page('c', 'Class', { child_ids: ['u'] }),
      page('u', 'Unit', { subjects: ['Made-up Subject'], years: ['Year 99'] })
    ), ctx());
    const msgs = plan.warnings.filter((w) => w.rule === 'limit').map((w) => w.message);
    expect(msgs).toContain("Subject “Made-up Subject” isn't in the Teaching Hub; using the parent's subject.");
    expect(msgs.some((m) => m.startsWith('Year “Year 99”'))).toBe(true);
  });

  it('warns about units inside a program', () => {
    const plan = buildImportPlan(tree('p',
      page('p', 'Enrichment Program', { child_ids: ['u'] }), page('u', 'Unit')), ctx());
    expect(plan.warnings.some((w) => w.rule === 'flattened' && w.message === 'Units inside a program import as separate units.')).toBe(true);
  });

  it('does not match outcomes on class or syllabus pages', () => {
    const plan = buildImportPlan(tree('s', page('s', 'Syllabus', { outcomes: ['EN4-URA-01'] })), ctx());
    expect(plan.entities[0].record.outcome_ids).toBeUndefined();
    expect(plan.warnings.filter((w) => w.rule === 'skipped' && w.message === 'Outcomes on Syllabus pages are not imported.')).toHaveLength(1);
  });

  it('titles skipped pages and does not reuse an id of the wrong kind', () => {
    const skipped = buildImportPlan(tree('u1', page('u1', 'Unit', { child_ids: ['m'] }), page('m', 'Curriculum Map', { title: '  ' })), ctx());
    expect(skipped.skipped[0].title).toBe('Untitled');
    const plan = buildImportPlan(tree('l1', page('l1', 'Lesson')), ctx({ source_map: { l1: 'unit_old' } }));
    expect(plan.entities[0]).toMatchObject({ id: 'lesson_n_l1', existing: false });
    expect(plan.warnings.some((w) => w.rule === 'limit' && w.message.includes('changed type'))).toBe(true);
  });
});

describe('unreadable sub-pages', () => {
  it('warns on the parent page', () => {
    const t = tree('p1', page('p1', 'Unit'));
    t.unreadable = [{ page_id: 'x', parent_id: 'p1', code: 'object_not_found' }];
    const plan = buildImportPlan(t, ctx());
    expect(plan.warnings).toContainEqual({
      page_id: 'p1', notion_block_id: null, rule: 'skipped',
      message: 'A sub-page could not be read from Notion (object_not_found); share it with the integration or import it separately.'
    });
  });
});
