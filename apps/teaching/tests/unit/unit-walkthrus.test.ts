import { describe, expect, it } from 'vitest';
import { walkthruRows, withHow } from '@/blocks/walkthru-note/unit-uses';
import { pieceLines } from '@/organiser/editor-model';

const piece = (id: string) => ({ id, text: 'A piece.', tier: 'essential' as const });
const deep = [
  { id: 'du_one', claim: 'One', pieces: [piece('kp_aa11bb')] },
  { id: 'du_two', claim: 'Two', pieces: [piece('kp_cc22dd')] }
] as never;
const leaf = { id: 'b_leaf', block_type: 'rich_text', content: { html: '' }, settings: { deep_taught: ['kp_cc22dd'] } };
const section = { id: 'b_sec', block_type: 'section', content: { title: 'Reading the columns', blocks: [leaf] }, settings: { walkthru: 'w1-cold-calling', walkthru_notes: { 1: 'Quiet students first.' } } };
const lessons = [
  { id: 'l1', title: 'First', blocks: [] },
  { id: 'l2', title: 'Second', blocks: [section] }
] as never;
const rep = (lesson_id: string, state: string, class_id: string | null = null) => ({ technique_id: 'w1-cold-calling', lesson_id, class_id, goal_id: null, state, note: '', lesson_end: null, at: '' }) as never;

describe('WalkThrus in this unit', () => {
  it('leaves out every technique that is not in use', () => {
    expect(walkthruRows([{ id: 'l1', blocks: [] }], deep, [], [])).toEqual([]);
  });

  it('finds a block’s technique and ties it to the lesson and the deep understanding of what sits inside it', () => {
    const [row] = walkthruRows(lessons, deep, [], [rep('l2', 'planned'), rep('l2', 'ran', 'c1')]);
    expect(row!.name).toBe('Cold calling');
    expect(row!.chips).toEqual([{ kind: 'lesson', label: 'L2' }, { kind: 'du', label: 'Deep understanding 2' }]);
    expect(row!.count).toBe('1 lesson · ran 1');
    expect(row!.uses[0]).toMatchObject({ where: 'L2 Second', sub: 'Reading the columns', state: 'ran', note: 'Quiet students first.', lesson_id: 'l2' });
  });

  it('shows ties on the unit, with no lesson to count, and drops one whose deep understanding has gone', () => {
    const ties = [
      { technique: 'w1-using-a-knowledge-organiser', kind: 'organiser' as const, ref: 'facts', how: 'Daily check.' },
      { technique: 'w1-sequence-concepts-in-small-steps', kind: 'du' as const, ref: 'du_gone' }
    ];
    const rows = walkthruRows([], deep, ties, []);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.chips).toEqual([{ kind: 'organiser', label: 'Organiser: Context' }]);
    expect(rows[0]!.count).toBe('');
    expect(rows[0]!.uses[0]!.how).toBe('Daily check.');
  });

  it('keeps a how line for a block, and takes the tie away again when the line is cleared', () => {
    const tie = { kind: 'block' as const, ref: 'l2/b_sec' };
    const once = withHow([], 'w1-cold-calling', tie, ' After the silent read. ');
    expect(once).toEqual([{ technique: 'w1-cold-calling', ...tie, how: 'After the silent read.' }]);
    expect(walkthruRows(lessons, deep, once, [])[0]!.uses[0]!.how).toBe('After the silent read.');
    expect(withHow(once, 'w1-cold-calling', tie, '')).toEqual([]);
  });

  it('clearing the how line on a unit tie keeps the tie', () => {
    const tie = { technique: 'w1-cold-calling', kind: 'du' as const, ref: 'du_one', how: 'Words.' };
    expect(withHow([tie], 'w1-cold-calling', tie, '')).toEqual([{ technique: 'w1-cold-calling', kind: 'du', ref: 'du_one' }]);
  });
});

describe('a piece’s line on the organiser', () => {
  it('reads the prompt and the words from the section’s columns, first line winning', () => {
    const columns = [{ id: 'a', label: 'Prompt', hide: false }, { id: 'b', label: 'What to know', hide: true }, { id: 'c', label: 'Example', hide: false }];
    const lines = pieceLines({ sections: [{ id: 's', name: 'Style', kind: 'table', role: 'concept', columns, lines: [
      { id: 'ol_1', cells: ['Why?', 'Because.', ''], piece_id: 'kp_aa11bb' },
      { id: 'ol_2', cells: ['Again?', 'Later.', ''], piece_id: 'kp_aa11bb' },
      { id: 'ol_3', cells: ['Loose', 'Not tracked.', ''] }
    ] }] } as never);
    expect([...lines.keys()]).toEqual(['kp_aa11bb']);
    expect(lines.get('kp_aa11bb')).toEqual({ line_id: 'ol_1', prompt: 'Why?', text: 'Because.' });
  });
});
