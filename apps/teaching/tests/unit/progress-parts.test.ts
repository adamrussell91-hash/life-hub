import { describe, expect, it } from 'vitest';
import { storyText, BANNED } from '@/progress/story-text';
import { stepChart } from '@/progress/step-chart';
import { skillPath } from '@/progress/skill-path';
import { feedbackCard } from '@/progress/code-grid';
import { skillRow } from '@/progress/skill-row';
import type { SkillRow } from '@/progress/types';

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

describe('skill row', () => {
  const base: SkillRow = { key: 'skill:reading.infer', name: 'Inferring', counts: { below: 0, capable: 2, skilled: 1, accomplished: 0, excellent: 0 }, now: 'skilled', story: { kind: 'now', step: 'skilled' }, i_can: 'I can infer a feeling.', next_move: 'Add what they believe.', next_rung: 'accomplished', rungs: { capable: 'I can say what happens.', skilled: 'I can infer a feeling.', accomplished: 'I can infer a belief.', excellent: 'I can read the silences.' } };
  it('shows where the student is on one line, the next move, and opens one step at a time', () => {
    const row = skillRow(base);
    expect(row.querySelector('.pg-sk__now')!.textContent).toBe('Skilled · 1 piece');
    expect([...row.querySelectorAll('.pg-sk__dot')].map((d) => d.getAttribute('aria-label'))).toEqual(['Capable', 'Skilled (you are here)', 'Accomplished (next step)', 'Excellent']);
    expect(row.querySelector('.pg-sk__next')!.textContent).toBe('Next, for Accomplished: Add what they believe.');
    const look = row.querySelector<HTMLElement>('.pg-sk__look')!;
    expect(look.hidden).toBe(true);
    const dots = row.querySelectorAll<HTMLButtonElement>('.pg-sk__dot');
    dots[1]!.click();
    expect(look.textContent).toBe('You are here, Skilled: I can infer a feeling.');
    dots[2]!.click();
    expect(look.textContent).toBe('Next, Accomplished: I can infer a belief.');
    expect(row.querySelectorAll('[aria-pressed="true"]').length).toBe(1);
    dots[2]!.click();
    expect(look.hidden).toBe(true);
  });
  it('says the first step below Capable and the top step at Excellent', () => {
    expect(skillRow({ ...base, now: 'below', next_rung: 'capable' }).querySelector('.pg-sk__now')!.textContent).toBe('First step: Capable');
    const top = skillRow({ ...base, now: 'excellent', counts: { ...base.counts, excellent: 2 }, next_move: null, next_rung: null, refine: 'Vary your pace.' });
    expect(top.querySelector('.pg-sk__next')!.textContent).toBe('Top step. To keep sharpening: Vary your pace.');
  });
});

describe('feedback card', () => {
  const six = [...pieces, ...pieces].map((p, i) => ({ ...p, id: `w:l${i}:b`, label: `Piece ${i + 1}` }));
  const feedback = {
    pieces: six,
    rows: [
      { code_id: 'ts', code: 'TS', label: 'Topic sentence', colour: 'peach', positive: false, cells: [0, null, 0, 1, 0, 1], hit: 2, of: 5, total: 2, trend: 'more' as const, hits: [{ piece_id: 'w:l5:b', title: 'Piece 6', date: '3 Nov', words: 'the road is dark', note: 'Say what the road means.' }, { piece_id: 'a:col1', title: 'Task', date: '1 Nov', words: null, note: null }], do: 'Open with your claim.' },
      { code_id: 'ev', code: 'E', label: 'Evidence', colour: 'sage', positive: true, cells: [0, 0, 0, 0, 1, 0], hit: 1, of: 6, total: 1, trend: 'new' as const, hits: [], do: 'Keep quotes short.' }
    ]
  };
  it('groups rows, shows the strip and trend, and opens to the marked words and what to do', () => {
    const opened: string[] = [];
    const card = feedbackCard(feedback, { onOpen: (id) => opened.push(id) });
    expect([...card.querySelectorAll('.pg-fb__group')].map((g) => g.textContent)).toEqual(['Working on', 'Doing well']);
    const [first, second] = [...card.querySelectorAll<HTMLButtonElement>('.pg-fb__head')];
    expect(first!.querySelectorAll('.pg-fb__strip i.is-work').length).toBe(2);
    expect(first!.querySelector('.pg-fb__strip i.is-na')).toBeTruthy();
    expect(first!.querySelector('.pg-fb__count')!.textContent).toBe('2 of last 6 · more often');
    expect(first!.querySelector('em')!.className).toBe('is-watch');
    expect(second!.querySelector('em')!.className).toBe('is-good');
    first!.click();
    expect(first!.getAttribute('aria-expanded')).toBe('true');
    const detail = first!.nextElementSibling as HTMLElement;
    expect(detail.hidden).toBe(false);
    expect(detail.querySelector('q')!.textContent).toBe('the road is dark');
    expect(detail.textContent).toContain('Your teacher: Say what the road means.');
    expect(detail.querySelector('.pg-fb__do')!.textContent).toBe('Do this next: Open with your claim.');
    const buttons = detail.querySelectorAll<HTMLButtonElement>('.pg-fb__open');
    expect(buttons.length).toBe(1);
    buttons[0]!.click();
    expect(opened).toEqual(['w:l5:b']);
    expect(card.textContent).toContain('Older pieces are under Returned work.');
    expect(card.querySelector('.pg-fb__hint')).toBeTruthy();
  });
});
