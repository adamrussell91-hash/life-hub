import type { CurriculumLinesV2Content } from '@/schemas/block';

/** A new map: the lines and stations come from the subject and its lessons. */
export function starterCurriculumLinesContent(): CurriculumLinesV2Content {
  return {
    version: 2,
    rail_stops: [],
    gates: [],
    nudges: {},
    terminus: { label: 'Assessment task', when: 'Task' }
  };
}
