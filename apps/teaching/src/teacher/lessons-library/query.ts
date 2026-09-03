import type { Unit } from '@/schemas';
import type { CurriculumResponse } from '@/teacher/nav';
import { resolvePedagogicalMode } from '@/curriculum/pedagogical-mode';
import { expandQueryTokens, semanticScore } from './semantic';
import {
  DEFAULT_LESSONS_STATE,
  type LessonLibraryRow,
  type LessonPublishBadge,
  type LessonsListState,
  type LessonSortKey,
  type LessonUnitGroup
} from './types';

export interface LessonsQueryResult {
  state: LessonsListState;
  rows: LessonLibraryRow[];
  shown: number;
  totalInLibrary: number;
  filtered: boolean;
}

function asRow(lesson: CurriculumResponse['lessons'][number]): LessonLibraryRow {
  return lesson;
}

export function lessonBadge(lesson: LessonLibraryRow): LessonPublishBadge {
  if (lesson.status === 'archived') return 'archived';
  if (lesson.review_status === 'needs_review') return 'needs_review';
  if (lesson.published) return 'published';
  return 'draft';
}

export function searchHaystack(lesson: LessonLibraryRow, unitTitle?: string): string {
  return [
    lesson.title,
    unitTitle ?? '',
    ...(lesson.tags ?? []),
    ...(lesson.syllabus_outcomes ?? []),
    ...(lesson.outcome_ids ?? []),
    lesson.excerpt ?? '',
    lesson.author_name ?? '',
    lesson.author_id ?? ''
  ]
    .join(' ')
    .toLowerCase();
}

function matchesQuery(haystack: string, query: string, lesson: LessonLibraryRow): boolean {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return true;
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const literal = tokens.every((token) => haystack.includes(token));
  if (literal) return true;
  return semanticScore(lesson, haystack, trimmed) >= 0.28;
}

function matchesStatus(lesson: LessonLibraryRow, statuses: LessonsListState['statuses']): boolean {
  if (statuses.length === 0) return lesson.status === 'active';
  const badge = lessonBadge(lesson);
  return statuses.some((status) => {
    if (status === 'archived') return lesson.status === 'archived' || badge === 'archived';
    if (status === 'needs_review') return badge === 'needs_review';
    if (status === 'published') return lesson.status === 'active' && lesson.published;
    return lesson.status === 'active' && !lesson.published && badge !== 'needs_review';
  });
}

function compareLessons(a: LessonLibraryRow, b: LessonLibraryRow, sort: LessonSortKey): number {
  switch (sort) {
    case 'title_asc':
      return a.title.localeCompare(b.title);
    case 'title_desc':
      return b.title.localeCompare(a.title);
    case 'created_desc':
      return (b.created_at ?? '').localeCompare(a.created_at ?? '');
    case 'created_asc':
      return (a.created_at ?? '').localeCompare(b.created_at ?? '');
    case 'status':
      return lessonBadge(a).localeCompare(lessonBadge(b)) || a.title.localeCompare(b.title);
    case 'edited_asc':
      return a.updated_at.localeCompare(b.updated_at);
    case 'edited_desc':
    default:
      return b.updated_at.localeCompare(a.updated_at);
  }
}

export function countActiveFilters(state: LessonsListState): number {
  return (
    (state.q.trim() ? 1 : 0) +
    state.units.length +
    state.subjects.length +
    state.modes.length +
    state.statuses.length +
    state.tags.length +
    state.authors.length +
    state.outcomes.length +
    (state.smart ? 1 : 0)
  );
}

export function groupLessonsByUnit(rows: LessonLibraryRow[], units: Unit[]): LessonUnitGroup[] {
  const titles = new Map(units.map((unit) => [unit.id, unit.title]));
  const order: string[] = [];
  const buckets = new Map<string, LessonLibraryRow[]>();

  for (const row of rows) {
    if (!buckets.has(row.unit_id)) {
      buckets.set(row.unit_id, []);
      order.push(row.unit_id);
    }
    buckets.get(row.unit_id)!.push(row);
  }

  return order.map((unitId) => {
    const lessons = buckets.get(unitId) ?? [];
    return {
      unitId,
      unitTitle: titles.get(unitId) ?? unitId,
      lessons,
      published: lessons.filter((lesson) => lessonBadge(lesson) === 'published').length,
      draft: lessons.filter((lesson) => lessonBadge(lesson) === 'draft').length,
      archived: lessons.filter((lesson) => lessonBadge(lesson) === 'archived').length,
      needsReview: lessons.filter((lesson) => lessonBadge(lesson) === 'needs_review').length
    };
  });
}

export function applyLessonsQuery(
  curriculum: CurriculumResponse,
  state: LessonsListState = DEFAULT_LESSONS_STATE,
  extra?: {
    healthIds?: Set<string>;
    duplicateIds?: Set<string>;
    todayIds?: Set<string>;
    bodyMatchIds?: Set<string>;
  }
): LessonsQueryResult {
  const unitsById = new Map(curriculum.units.map((unit) => [unit.id, unit]));
  const library = curriculum.lessons.map(asRow);
  const activeLibrary = library.filter((lesson) => lesson.status === 'active');

  let rows = library.filter((lesson) => matchesStatus(lesson, state.statuses));

  if (state.subjects.length > 0) {
    const allowedSubjects = new Set(state.subjects);
    rows = rows.filter((lesson) => {
      const unit = unitsById.get(lesson.unit_id);
      return unit ? allowedSubjects.has(unit.subject_id) : false;
    });
  }

  if (state.units.length > 0) {
    const allowed = new Set(state.units);
    rows = rows.filter((lesson) => allowed.has(lesson.unit_id));
  }

  if (state.modes.length > 0) {
    const allowed = new Set(state.modes);
    rows = rows.filter((lesson) => allowed.has(resolvePedagogicalMode(lesson.pedagogical_mode)));
  }

  if (state.tags.length > 0) {
    rows = rows.filter((lesson) => {
      const tags = new Set(lesson.tags ?? []);
      return state.tags.every((tag) => tags.has(tag));
    });
  }

  if (state.authors.length > 0) {
    const allowed = new Set(state.authors);
    rows = rows.filter((lesson) => lesson.author_id && allowed.has(lesson.author_id));
  }

  if (state.outcomes.length > 0) {
    rows = rows.filter((lesson) => {
      const outcomes = new Set([
        ...(lesson.syllabus_outcomes ?? []),
        ...(lesson.outcome_ids ?? [])
      ]);
      return state.outcomes.every((outcome) => outcomes.has(outcome));
    });
  }

  if (state.smart === 'health' && extra?.healthIds) {
    rows = rows.filter((lesson) => extra.healthIds!.has(lesson.id));
  }
  if (state.smart === 'duplicates' && extra?.duplicateIds) {
    rows = rows.filter((lesson) => extra.duplicateIds!.has(lesson.id));
  }
  if (state.smart === 'today' && extra?.todayIds) {
    rows = rows.filter((lesson) => extra.todayIds!.has(lesson.id));
  }

  const query = state.q.trim();
  if (query) {
    rows = rows.filter((lesson) => {
      if (extra?.bodyMatchIds?.has(lesson.id)) return true;
      const unitTitle = unitsById.get(lesson.unit_id)?.title;
      return matchesQuery(searchHaystack(lesson, unitTitle), query, lesson);
    });
    const expanded = expandQueryTokens(query);
    rows = [...rows].sort((a, b) => {
      const unitA = unitsById.get(a.unit_id)?.title;
      const unitB = unitsById.get(b.unit_id)?.title;
      const score =
        semanticScore(b, searchHaystack(b, unitB), query, expanded) -
        semanticScore(a, searchHaystack(a, unitA), query, expanded);
      if (score !== 0) return score;
      return compareLessons(a, b, state.sort);
    });
  } else {
    rows = [...rows].sort((a, b) => compareLessons(a, b, state.sort));
  }

  const filtered = countActiveFilters(state) > 0;
  return {
    state,
    rows,
    shown: rows.length,
    totalInLibrary: activeLibrary.length,
    filtered
  };
}
