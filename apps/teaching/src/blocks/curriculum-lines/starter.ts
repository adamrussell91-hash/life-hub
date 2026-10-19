import type { LinesContent } from './model';

/** A small map to edit from: three strands, a checkpoint and the task. */
export function starterCurriculumLinesContent(): LinesContent {
  return {
    weeks: 6,
    strands: [
      { id: 'strand_a', name: 'Texts', colour: 'wave' },
      { id: 'strand_b', name: 'Concepts', colour: 'green' },
      { id: 'strand_c', name: 'Writing', colour: 'amber' }
    ],
    stations: [
      { id: 'station_a1', strand_id: 'strand_a', week: 1, level: 'introduced', label: 'First read' },
      { id: 'station_a3', strand_id: 'strand_a', week: 3, level: 'reinforced', label: 'Close reading' },
      { id: 'station_a5', strand_id: 'strand_a', week: 5, level: 'mastered', label: 'Critical readings' },
      { id: 'station_b1', strand_id: 'strand_b', week: 1, level: 'introduced', label: 'Big question' },
      { id: 'station_b4', strand_id: 'strand_b', week: 4, level: 'mastered', label: 'Concept in the text' },
      { id: 'station_c3', strand_id: 'strand_c', week: 3, level: 'introduced', label: 'Thesis drafting' },
      { id: 'station_c6', strand_id: 'strand_c', week: 6, level: 'mastered', label: 'Full draft' }
    ],
    checkpoints: [{ id: 'checkpoint_1', week: 3, label: 'Thesis workshop', strand_ids: ['strand_a', 'strand_c'] }],
    terminus: { label: 'Assessment task', when: 'Task' }
  };
}
