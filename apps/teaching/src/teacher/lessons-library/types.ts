import type { PedagogicalMode } from '@/curriculum/pedagogical-mode';
import type { CurriculumLessonSummary } from '@/teacher/nav';

export type LessonPublishBadge = 'published' | 'draft' | 'needs_review' | 'archived';

export type LessonSortKey =
  | 'edited_desc'
  | 'edited_asc'
  | 'title_asc'
  | 'title_desc'
  | 'created_desc'
  | 'created_asc'
  | 'status';

export type LessonsViewMode = 'library' | 'table' | 'map' | 'mine';

export type LessonsDensity = 'cards' | 'compact';

export type LessonStatusFilter = 'draft' | 'published' | 'archived' | 'needs_review';

export type LessonsSmartFilter = 'health' | 'duplicates' | 'today' | null;

export interface LessonsListState {
  q: string;
  units: string[];
  subjects: string[];
  modes: PedagogicalMode[];
  statuses: LessonStatusFilter[];
  tags: string[];
  authors: string[];
  outcomes: string[];
  sort: LessonSortKey;
  view: LessonsViewMode;
  density: LessonsDensity;
  smart: LessonsSmartFilter;
  savedViewId: string | null;
}

export interface LessonLibraryRow extends CurriculumLessonSummary {
  created_at?: string;
  tags?: string[];
  author_id?: string;
  author_name?: string;
  review_status?: 'needs_review' | 'none';
  syllabus_outcomes?: string[];
  excerpt?: string;
  attachment_count?: number;
}

export interface LessonUnitGroup {
  unitId: string;
  unitTitle: string;
  lessons: LessonLibraryRow[];
  published: number;
  draft: number;
  archived: number;
  needsReview: number;
}

export interface SavedLessonView {
  id: string;
  name: string;
  state: Omit<LessonsListState, 'savedViewId'>;
}

export const DEFAULT_LESSONS_STATE: LessonsListState = {
  q: '',
  units: [],
  subjects: [],
  modes: [],
  statuses: [],
  tags: [],
  authors: [],
  outcomes: [],
  sort: 'edited_desc',
  view: 'library',
  density: 'cards',
  smart: null,
  savedViewId: null
};
