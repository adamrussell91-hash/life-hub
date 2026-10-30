import { describe, expect, it } from 'vitest';
import { analysisPanel } from '@/markbook/analysis-panel';

describe('analysis panel', () => {
  it('writes what the data says for the teacher and lists class patterns', () => {
    let grouped: string[] = [];
    const panel = analysisPanel(
      {
        student: {
          pieces: [{ id: 'p1', label: 'Imagery', date: '6 Oct', kind: 'written' }],
          outcomes: [{ key: 'out:a', name: 'Analysis', sub: '', cells: ['building'], now: 'building', story: { kind: 'holding', step: 'building', count: 5, code_id: 'ts' }, looks: null }],
          concepts: [],
          skills: [],
          codes: [{ code_id: 'ts', code: 'TS', label: 'Topic sentence', colour: 'peach', positive: false, cells: [1], hit: 1, of: 1, total: 1, dropped: false }],
          next: [],
          unseen: 0
        },
        class_patterns: [{ key: 'out:a', step: 'building', students: ['a', 'b', 'c'], names: ['Ava Nguyen', 'Noah Patel', 'Ella Chen'], code_id: 'ts' }]
      },
      { outcomeName: () => 'Analysis', onGroup: (ids) => (grouped = ids) }
    );
    expect(panel.querySelector('.an-says')!.textContent).toContain('Holding at Building on Analysis for 5 pieces. TS each time.');
    expect(panel.querySelector('.an-class')!.textContent).toContain('3 students holding at Building on Analysis; top code TS');
    panel.querySelector<HTMLButtonElement>('[data-action="group"]')!.click();
    expect(grouped).toEqual(['a', 'b', 'c']);
  });
});
