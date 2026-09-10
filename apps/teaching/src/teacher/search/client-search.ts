import type { CurriculumLessonSummary, CurriculumResponse } from '@/teacher/nav';
import {
  buildHubEntityIndex,
  searchHubEntities
} from '../../../design-kit/js/hub-entity-search.js';
import type { SearchHit } from './types';

export interface CompositionSummary {
  id: string;
  title: string;
}

function includesQuery(text: string | undefined, query: string): boolean {
  return text?.toLowerCase().includes(query) ?? false;
}

/** Prefix/fuzzy match via shared MiniSearch helper (falls back to substring). */
function fuzzyIncludes(text: string | undefined, query: string, cache: Map<string, boolean>): boolean {
  if (!text) return false;
  if (includesQuery(text, query)) return true;
  const key = text;
  const hit = cache.get(key);
  if (hit != null) return hit;
  const index = buildHubEntityIndex([{ id: '1', label: text }]);
  const matched = searchHubEntities(index, query, { limit: 1 }).length > 0;
  cache.set(key, matched);
  return matched;
}

function unitHierarchy(
  curriculum: CurriculumResponse,
  unitId: string
): { yearTitle?: string; subjectTitle?: string; unitTitle?: string } {
  const unit = curriculum.units.find((u) => u.id === unitId);
  if (!unit) return {};
  const subject = curriculum.subjects.find((s) => s.id === unit.subject_id);
  const year = curriculum.years.find((y) => y.id === unit.year_id);
  return {
    yearTitle: year?.title,
    subjectTitle: subject?.title,
    unitTitle: unit.title
  };
}

function formatHierarchy(parts: Array<string | undefined>): string | undefined {
  const labels = parts.filter((part): part is string => Boolean(part));
  return labels.length > 0 ? labels.join(' › ') : undefined;
}

export function lessonHierarchy(
  curriculum: CurriculumResponse,
  lesson: CurriculumLessonSummary
): string | undefined {
  const { yearTitle, subjectTitle, unitTitle } = unitHierarchy(curriculum, lesson.unit_id);
  return formatHierarchy([yearTitle, subjectTitle, unitTitle]);
}

export function unitSearchHierarchy(curriculum: CurriculumResponse, unitId: string): string | undefined {
  const { yearTitle, subjectTitle, unitTitle } = unitHierarchy(curriculum, unitId);
  return formatHierarchy([yearTitle, subjectTitle, unitTitle]);
}

function scopeSequenceHref(subjectId: string): string {
  return `/scope-sequences/${subjectId}`;
}

export function searchCurriculumTitles(
  curriculum: CurriculumResponse,
  query: string,
  compositions: CompositionSummary[]
): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const hits: SearchHit[] = [];
  const fuzzyCache = new Map<string, boolean>();
  const match = (text: string | undefined) => fuzzyIncludes(text, q, fuzzyCache);

  for (const lesson of curriculum.lessons) {
    const hierarchy = lessonHierarchy(curriculum, lesson);
    const titleMatch = match(lesson.title);
    const hierarchyMatch = !titleMatch && match(hierarchy);
    if (titleMatch || hierarchyMatch) {
      hits.push({
        type: 'lesson',
        id: lesson.id,
        title: lesson.title,
        hierarchy,
        match: titleMatch ? 'title' : 'hierarchy',
        href: `/lessons/${lesson.id}`
      });
    }
  }

  for (const unit of curriculum.units) {
    const hierarchy = unitSearchHierarchy(curriculum, unit.id);
    const titleMatch = match(unit.title);
    const hierarchyMatch = !titleMatch && match(hierarchy);
    if (titleMatch || hierarchyMatch) {
      hits.push({
        type: 'unit',
        id: unit.id,
        title: unit.title,
        hierarchy,
        match: titleMatch ? 'title' : 'hierarchy',
        href: `/units/${unit.id}`
      });
    }
  }

  for (const cls of curriculum.classes) {
    const titleMatch = match(cls.title);
    const codeMatch = match(cls.code);
    if (titleMatch || codeMatch) {
      hits.push({
        type: 'class',
        id: cls.id,
        title: cls.title,
        match: titleMatch ? 'title' : 'code',
        href: `/classes/${cls.id}`
      });
    }
  }

  for (const subject of curriculum.subjects) {
    if (match(subject.title) || match(subject.display_title)) {
      hits.push({
        type: 'subject',
        id: subject.id,
        title: subject.title,
        match: 'title',
        href: `/scope-sequences/${subject.id}`
      });
    }
  }

  for (const year of curriculum.years) {
    if (match(year.title)) {
      hits.push({
        type: 'year',
        id: year.id,
        title: year.title,
        match: 'title',
        href: '/'
      });
    }
  }

  for (const scope of curriculum.scope_sequences) {
    if (match(scope.title)) {
      hits.push({
        type: 'scope_sequence',
        id: scope.id,
        title: scope.title,
        match: 'title',
        href: scopeSequenceHref(scope.subject_id)
      });
    }

    for (const item of scope.timeline_items) {
      if (item.kind === 'note' && match(item.title)) {
        hits.push({
          type: 'scope_note',
          id: item.id,
          title: item.title,
          match: 'title',
          href: `${scopeSequenceHref(scope.subject_id)}?selectNote=${encodeURIComponent(item.id)}`
        });
      }
    }
  }

  for (const media of curriculum.media) {
    const titleMatch = match(media.title);
    const fileMatch = match(media.file_name);
    if (titleMatch || fileMatch) {
      hits.push({
        type: 'resource',
        id: media.id,
        title: media.title,
        match: titleMatch ? 'title' : 'code',
        href: '/resources'
      });
    }
  }

  for (const composition of compositions) {
    if (match(composition.title)) {
      hits.push({
        type: 'composition',
        id: composition.id,
        title: composition.title,
        match: 'title',
        href: '/templates'
      });
    }
  }

  return hits;
}
