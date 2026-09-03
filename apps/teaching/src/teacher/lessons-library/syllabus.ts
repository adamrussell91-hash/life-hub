import type { LessonLibraryRow } from './types';

export interface SyllabusOutcome {
  id: string;
  module: string;
  label: string;
}

/** Compact HSC English Advanced outcome set for coverage reporting. */
export const HSC_ENGLISH_ADVANCED_OUTCOMES: SyllabusOutcome[] = [
  { id: 'EA12-1', module: 'Common Module', label: 'Independent, insightful, creative texts' },
  { id: 'EA12-2', module: 'Common Module', label: 'Language forms and features for purpose' },
  { id: 'EA12-3', module: 'Common Module', label: 'Complex ideas through considered composition' },
  { id: 'EA12-4', module: 'Module A', label: 'Textual conversations — context and value' },
  { id: 'EA12-5', module: 'Module A', label: 'How texts influence and are influenced' },
  { id: 'EA12-6', module: 'Module B', label: 'Critical study — literary value' },
  { id: 'EA12-7', module: 'Module B', label: 'Informed personal response to a text' },
  { id: 'EA12-8', module: 'Module C', label: 'Craft of writing — imaginative' },
  { id: 'EA12-9', module: 'Module C', label: 'Craft of writing — discursive / persuasive' }
];

export interface CoverageGap {
  id: string;
  module: string;
  label: string;
  count: number;
}

export function coverageGaps(
  lessons: LessonLibraryRow[],
  catalog = HSC_ENGLISH_ADVANCED_OUTCOMES
): CoverageGap[] {
  const counts = new Map<string, number>();
  for (const lesson of lessons) {
    if (lesson.status === 'trashed') continue;
    for (const outcome of lesson.outcome_ids ?? lesson.syllabus_outcomes ?? []) {
      counts.set(outcome, (counts.get(outcome) ?? 0) + 1);
    }
  }
  return catalog
    .map((outcome) => ({
      id: outcome.id,
      module: outcome.module,
      label: outcome.label,
      count: counts.get(outcome.id) ?? 0
    }))
    .filter((row) => row.count === 0);
}
