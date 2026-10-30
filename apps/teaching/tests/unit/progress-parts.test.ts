import { describe, expect, it } from 'vitest';
import { storyText, BANNED } from '@/progress/story-text';
import { stepChart } from '@/progress/step-chart';
import { skillPath } from '@/progress/skill-path';
import { codeGrid } from '@/progress/code-grid';

const pieces = [
  { id: 'p1', label: 'Road imagery', date: '6 Oct', kind: 'written' as const },
  { id: 'p2', label: 'Viva practice', date: '13 Oct', kind: 'viva' as const },
  { id: 'p3', label: 'Tension', date: '20 Oct', kind: 'written' as const }
];

describe('story text', () => {
  it('words each story kind without deficit words', () => {
    const texts = [
      storyText({ kind: 'holding', step: 'building', count: 5, code_id: 'ts' }, 'TS', false),
      storyText({ kind: 'moved_up', from: 'starting', to: 'building', piece_id: 'p3' }, null, false, pieces),
      storyText({ kind: 'few', count: 2 }, null, false),
      storyText({ kind: 'now', step: 'secure' }, null, false),
      storyText({ kind: 'holding', step: 'skilled', count: 3, code_id: null }, null, true)
    ];
    expect(texts[0]).toBe('Holding at Building for your last 5 pieces. Next step to Secure: see TS.');
    expect(texts[1]).toBe('Moved up from Starting to Building on Tension (20 Oct).');
    expect(texts[2]).toBe('2 pieces so far. More pieces will show the pattern.');
    expect(texts[3]).toBe('Now at Secure.');
    expect(texts[4]).toBe('Holding at Skilled for your last 3 pieces. Next step: Accomplished.');
    for (const t of texts) for (const word of BANNED) expect(t.toLowerCase()).not.toMatch(new RegExp(`\\b${word}\\b`));
  });
});

describe('step chart', () => {
  it('labels steps and pieces, fills up to the step, and dashes unassessed pieces', () => {
    const chart = stepChart(['starting', null, 'building'], pieces);
    expect([...chart.querySelectorAll('.pg-chart__y')].map((n) => n.textContent)).toEqual(['Extending', 'Secure', 'Building', 'Starting']);
    expect([...chart.querySelectorAll('.pg-chart__x b')].map((n) => n.textContent)).toEqual(['Road imagery', 'Viva practice', 'Tension']);
    const cols = chart.querySelectorAll('.pg-chart__col');
    expect(cols[0]!.querySelectorAll('.is-filled').length).toBe(1);
    expect(cols[1]!.classList.contains('is-none')).toBe(true);
    expect(cols[2]!.classList.contains('is-latest')).toBe(true);
    expect(chart.getAttribute('aria-label')).toBe('Road imagery: Starting. Viva practice: not marked on this. Tension: Building.');
  });
});

describe('skill path', () => {
  it('shows where the student is, the next rung, and piece counts', () => {
    const path = skillPath({ key: 'skill:composing.para', name: 'Paragraph control', counts: { below: 0, capable: 2, skilled: 3, accomplished: 0, excellent: 0 }, now: 'skilled', story: { kind: 'holding', step: 'skilled', count: 3, code_id: null }, i_can: 'I can build a paragraph.', next_move: 'End each paragraph by linking back.', next_rung: 'accomplished' });
    expect(path.querySelector('.pg-rung.is-now .pg-rung__name')!.textContent).toBe('Skilled');
    expect(path.querySelector('.pg-rung.is-next')!.textContent).toContain('Next');
    expect([...path.querySelectorAll('.pg-rung__count')].map((n) => n.textContent)).toEqual(['2 pieces', '3 pieces', '', '']);
  });
});

describe('code grid', () => {
  it('shows counts, n/a and the summary', () => {
    const grid = codeGrid([{ code_id: 'ts', code: 'TS', label: 'Topic sentence', colour: 'peach', positive: false, cells: [0, null, 2], hit: 1, of: 2, total: 2, dropped: false }], pieces);
    const cells = [...grid.querySelectorAll('tbody tr:not(.pg-codes__group) td')].map((n) => n.textContent);
    expect(cells.slice(1, 4)).toEqual(['', 'n/a', '2']);
    expect(grid.textContent).toContain('1 of 2 pieces · 2 in all');
  });
});
