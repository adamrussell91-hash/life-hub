import type { Block } from '@/schemas/block';
import type { PedagogicalMode } from '@/curriculum/pedagogical-mode';

/** Minimal lesson shape so Teaching Hub's `mountLessonPage` still type-checks. Unused by Tasks pages. */
export type Lesson = {
  id: string;
  title: string;
  blocks: Block[];
  pedagogical_mode?: PedagogicalMode;
  cover?: unknown;
  outcome_ids?: string[];
  syllabus_outcomes?: string[];
};
