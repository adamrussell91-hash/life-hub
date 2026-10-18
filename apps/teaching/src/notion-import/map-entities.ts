// apps/teaching/src/notion-import/map-entities.ts
import type { PedagogicalMode } from '../curriculum/pedagogical-mode';
import { makeBlock } from './block-factory';
import { createBlockState, mapBlocks, mediaUrl, type BlockState } from './map-blocks';
import type {
  EntityKind, ImportPlan, MapContext, NotionPage, NotionTree, PlannedEntity
} from './types';

type CategoryRule =
  | { kind: 'unit'; label: string; program?: true }
  | { kind: 'lesson'; label: string; mode: PedagogicalMode }
  | { kind: 'class'; label: string }
  | { kind: 'document'; label: string }
  | { skip: string };

const MODE_CATEGORIES: Record<string, PedagogicalMode> = {
  Lesson: 'lesson', Session: 'lesson', Lab: 'lab', Workshop: 'workshop', Lecture: 'lecture',
  Tutorial: 'tutorial', Seminar: 'seminar', Project: 'project', 'Case Study': 'case_study',
  Game: 'game', 'Station Rotation': 'station_rotation', 'Design Sprint': 'design_sprint',
  Assessment: 'assessment'
};

export function categoryRule(category: string | null): CategoryRule {
  if (category === 'Unit') return { kind: 'unit', label: 'Unit' };
  if (category === 'Program' || category === 'Enrichment Program') return { kind: 'unit', label: 'Program', program: true };
  if (category === 'Class') return { kind: 'class', label: 'Class' };
  if (category === 'Syllabus') return { kind: 'document', label: 'Syllabus' };
  if (category === 'Curriculum Map' || category === 'Scope and Sequence') return { skip: `${category} pages are not imported.` };
  if (category && MODE_CATEGORIES[category]) return { kind: 'lesson', label: category, mode: MODE_CATEGORIES[category] };
  return { kind: 'lesson', label: 'Lesson', mode: 'lesson' };
}

const ID_PREFIX: Record<EntityKind, string> = { unit: 'unit', lesson: 'lesson', class: 'class', document: 'document' };

function slug(title: string): string {
  return title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'item';
}

function day(value: string | null): string | undefined {
  return value ? value.slice(0, 10) : undefined;
}

export function buildImportPlan(tree: NotionTree, ctx: MapContext): ImportPlan {
  const plan: ImportPlan = {
    root_page_id: tree.root_id, entities: [], skipped: [], new_subjects: [], media: [], warnings: [], html_apps: []
  };
  for (const u of tree.unreadable ?? []) {
    plan.warnings.push({ page_id: u.parent_id, notion_block_id: null, rule: 'skipped', message: `A sub-page could not be read from Notion (${u.code}); share it with the integration or import it separately.` });
  }
  const excluded = new Set(ctx.choices.excluded_page_ids);
  const byPage = new Map<string, PlannedEntity>();

  const resolveYear = (pg: NotionPage): string | undefined => {
    const levels = pg.years.map((y) => Number(y.match(/\d+/)?.[0])).filter(Number.isFinite).sort((a, b) => a - b);
    for (const level of levels) {
      const hit = ctx.years.find((y) => y.year_level === level);
      if (hit) return hit.id;
    }
    return undefined;
  };
  const resolveSubject = (pg: NotionPage): { id?: string; title?: string } => {
    const wanted = pg.subjects[0];
    if (!wanted) return {};
    const hit = ctx.subjects.find((s) => s.title.trim().toLowerCase() === wanted.trim().toLowerCase());
    return hit ? { id: hit.id, title: hit.title } : { title: wanted };
  };
  const subjectFromCreate = (title: string): string => {
    const id = `subject_n_${slug(title)}`;
    if (!plan.new_subjects.some((s) => s.id === id)) plan.new_subjects.push({ id, title });
    return id;
  };

  const visit = (pageId: string, parent: PlannedEntity | null, nearestUnit: PlannedEntity | null): void => {
    const pg = tree.pages[pageId];
    if (!pg || excluded.has(pageId)) return;
    const displayTitle = pg.title.trim() || 'Untitled';
    if (byPage.has(pageId)) {
      plan.warnings.push({ page_id: pageId, notion_block_id: null, rule: 'skipped', message: `“${displayTitle}” appears more than once; imported only under its first parent.` });
      return;
    }
    const rule = categoryRule(pg.category);
    if ('skip' in rule) {
      plan.skipped.push({ page_id: pageId, parent_page_id: parent?.page_id ?? null, title: displayTitle, reason: rule.skip });
      return;
    }

    const st: BlockState = createBlockState(pageId, ctx.now, ctx.choices.html_as_code);
    const blocks = mapBlocks(pg.blocks, 'top', st);
    pg.files.forEach((f, k) => {
      const ref = `file:${pageId}:${k}`;
      const url = mediaUrl(st, ref, null, f.url, f.source === 'file', f.name, 'attachment');
      blocks.push(makeBlock('attachment', st.ids.from(`${pageId}-file-${k}`), { url, title: f.name, filename: f.name }, ctx.now));
    });
    const cover = pg.cover
      ? { url: mediaUrl(st, `cover:${pageId}`, null, pg.cover.url, pg.cover.source === 'file', pg.cover.name, 'cover') }
      : undefined;

    const override = ctx.choices.overrides[pageId] ?? {};
    let existingId: string | undefined = ctx.source_map[pageId];
    if (existingId && !existingId.startsWith(`${ID_PREFIX[rule.kind]}_`)) {
      plan.warnings.push({ page_id: pageId, notion_block_id: null, rule: 'limit', message: 'This page changed type since it was last imported; it will import as a new item.' });
      existingId = undefined;
    }
    const id = existingId ?? `${ID_PREFIX[rule.kind]}_n_${pageId.replace(/-/g, '')}`;
    const title = displayTitle;
    const needs: PlannedEntity['needs'] = [];

    const inheritedYear = parent?.record.year_id as string | undefined;
    const inheritedSubject = parent?.record.subject_id as string | undefined;
    const year_id = override.year_id ?? resolveYear(pg) ?? inheritedYear;
    const subject = resolveSubject(pg);
    const subject_id = override.subject_id
      ?? (override.create_subject_title ? subjectFromCreate(override.create_subject_title) : undefined)
      ?? subject.id
      ?? inheritedSubject;

    if (subject_id && !override.subject_id && !override.create_subject_title && !subject.id && subject.title && subject_id === inheritedSubject) {
      plan.warnings.push({ page_id: pageId, notion_block_id: null, rule: 'limit', message: `Subject “${subject.title}” isn't in the Teaching Hub; using the parent's subject.` });
    }
    if (pg.years.length && !override.year_id && !resolveYear(pg) && year_id && year_id === inheritedYear) {
      plan.warnings.push({ page_id: pageId, notion_block_id: null, rule: 'limit', message: `Year “${pg.years.join(', ')}” isn't in the Teaching Hub; using the parent's year.` });
    }
    if (rule.kind === 'unit' && parent?.record.kind === 'program') {
      plan.warnings.push({ page_id: pageId, notion_block_id: null, rule: 'flattened', message: 'Units inside a program import as separate units.' });
    }

    const outcome_ids: string[] = [];
    const matchOutcomes = rule.kind === 'unit' || rule.kind === 'lesson';
    if (!matchOutcomes && pg.outcomes.length) {
      plan.warnings.push({ page_id: pageId, notion_block_id: null, rule: 'skipped', message: `Outcomes on ${rule.label} pages are not imported.` });
    }
    for (const code of matchOutcomes ? pg.outcomes : []) {
      const hit = ctx.outcomes.find((o) => o.code.toLowerCase() === code.toLowerCase());
      if (hit) outcome_ids.push(hit.id);
      else plan.warnings.push({ page_id: pageId, notion_block_id: null, rule: 'outcome_unmatched', message: `Outcome ${code} is not in the outcome catalogue.` });
    }
    if (outcome_ids.length > 24) {
      plan.warnings.push({ page_id: pageId, notion_block_id: null, rule: 'limit', message: 'Only the first 24 outcomes were kept.' });
      outcome_ids.length = 24;
    }

    const common = {
      id, title, slug: slug(title), status: 'active', created_at: ctx.now, updated_at: ctx.now, schema_version: 1,
      ...(cover ? { cover } : {}),
      source: { system: 'notion', page_id: pageId, imported_at: ctx.now, last_edited_at: pg.last_edited_time }
    };

    let record: Record<string, unknown>;
    if (rule.kind === 'lesson') {
      const unit_id = nearestUnit?.id ?? override.unit_id;
      if (!unit_id) needs.push('unit');
      const siblings = nearestUnit ? (nearestUnit.record.lesson_ids as string[]) : null;
      siblings?.push(id);
      record = {
        ...common, type: 'lesson', unit_id: unit_id ?? '', sequence: siblings ? siblings.length : 1, blocks,
        pedagogical_mode: rule.mode, review_status: 'needs_review',
        ...(outcome_ids.length ? { outcome_ids } : {})
      };
    } else {
      if (!subject_id) needs.push('subject');
      if (rule.kind !== 'document' && !year_id) needs.push('year');
      if (rule.kind === 'unit') {
        record = {
          ...common, type: 'unit', year_id: year_id ?? '', subject_id: subject_id ?? '', lesson_ids: [],
          blocks, ...(rule.program ? { kind: 'program' } : {}),
          ...(day(pg.date_start) ? { start_date: day(pg.date_start) } : {}),
          ...(day(pg.date_end) ? { end_date: day(pg.date_end) } : {}),
          ...(outcome_ids.length ? { outcome_ids } : {})
        };
      } else if (rule.kind === 'class') {
        record = {
          ...common, type: 'class', code: slug(title), display_name: title,
          academic_year: pg.date_start ? Number(pg.date_start.slice(0, 4)) : Number(ctx.now.slice(0, 4)),
          year_id: year_id ?? '', subject_id: subject_id ?? '', active_unit_ids: [],
          homepage: { announcements: [], resources: [], custom: blocks }
        };
      } else {
        record = { ...common, type: 'document', kind: 'syllabus', subject_id: subject_id ?? '', blocks };
      }
    }

    const entity: PlannedEntity = {
      page_id: pageId, parent_page_id: parent?.page_id ?? null, kind: rule.kind, label: rule.label,
      id, title, existing: Boolean(existingId), needs,
      suggested: { year_id: resolveYear(pg), subject_id: subject.id, subject_title: subject.title },
      record
    };
    plan.entities.push(entity);
    byPage.set(pageId, entity);
    plan.media.push(...st.media);
    plan.warnings.push(...st.warnings);
    plan.html_apps.push(...st.html_apps);
    for (const need of needs) {
      plan.warnings.push({ page_id: pageId, notion_block_id: null, rule: 'needs_choice', message: `Choose a ${need} for “${title}”.` });
    }

    const childUnit = rule.kind === 'unit' ? entity : rule.kind === 'lesson' ? nearestUnit : null;
    for (const childId of pg.child_ids) {
      const before = plan.entities.length;
      visit(childId, entity, childUnit);
      const child = plan.entities[before];
      if (!child || child.parent_page_id !== pageId) continue;
      if (entity.kind === 'class' && child.kind === 'unit' && !child.record.kind) (record.active_unit_ids as string[]).push(child.id);
    }
  };

  visit(tree.root_id, null, null);
  return plan;
}
