import { describe, it, expect } from 'vitest';
import { match } from '@/app/router';
import {
  anthologyItems,
  bringLine,
  deepItems,
  firstTeachingLesson,
  freshItems,
  planItems
} from '@/organiser/bring-in';
import {
  columnSlots,
  createSerialQueue,
  firstHidden,
  lessonCodes,
  lineWords,
  makesCard,
  parsePaste,
  recentLessonIds
} from '@/organiser/editor-model';
import { runLines, clock } from '@/organiser/run-view';
import type { Organiser, Sheet } from '@/organiser/types';

const cols = (...hides: boolean[]) => hides.map((hide, i) => ({ id: `oc_${i}`, label: `Col ${i + 1}`, hide }));

describe('parsePaste', () => {
  it('splits rows on new lines and cells on tabs', () => {
    expect(parsePaste('Mist\tHides the road\nStorm\tBreaks the calm', 2)).toEqual([
      ['Mist', 'Hides the road'],
      ['Storm', 'Breaks the calm']
    ]);
  });

  it('ignores extra columns, pads short rows and drops blank rows', () => {
    expect(parsePaste('a\tb\tc\td\n\n  \nonly', 2)).toEqual([
      ['a', 'b'],
      ['only', '']
    ]);
  });

  it('handles Windows line endings and a single-cell section', () => {
    expect(parsePaste('one\r\ntwo\tignored\r\n', 1)).toEqual([['one'], ['two']]);
  });

  it('returns nothing for empty text', () => {
    expect(parsePaste('   \n\t\n', 3)).toEqual([]);
  });
});

describe('columnSlots, lineWords and makesCard', () => {
  const idea = { kind: 'table' as const, role: 'concept' as const, columns: [{ id: 'a', label: 'Prompt', hide: false }, { id: 'b', label: 'What to know', hide: true }, { id: 'c', label: 'Example', hide: false }] };
  it('finds the prompt, the answer and the rest', () => {
    expect(columnSlots(idea)).toEqual({ cue: 0, answer: 1, rest: [2] });
    expect(columnSlots({ kind: 'list' })).toEqual({ cue: -1, answer: 0, rest: [] });
  });
  it('shows a key idea as what to know, and a word as both sides', () => {
    expect(lineWords(idea, { cells: ['P', 'Know', 'E'] })).toEqual({ head: '', body: 'Know' });
    expect(lineWords({ ...idea, role: 'vocab' }, { cells: ['Word', 'Means', ''] })).toEqual({ head: 'Word', body: 'Means' });
    expect(lineWords({ kind: 'sequence' }, { cells: ['A step'] })).toEqual({ head: '', body: 'A step' });
  });
  it('needs both sides to make a card', () => {
    const section = { ...idea, id: 's', name: 'S', lines: [] };
    expect(makesCard(section, { cells: ['P', 'Know', ''] })).toBe(true);
    expect(makesCard(section, { cells: ['', 'Know', ''] })).toBe(false);
    expect(makesCard({ ...section, kind: 'list', columns: undefined }, { cells: ['x'] })).toBe(false);
  });
});

describe('bring-in', () => {
  const lessons = [
    { id: 'lesson_a', blocks: [{ id: 'b1', block_type: 'callout', settings: { deep_taught: ['kp_mist01'] } }] },
    { id: 'lesson_b', blocks: [{ id: 'b2', block_type: 'callout', settings: { deep_taught: ['kp_mist01', 'kp_calm02'] } }] }
  ] as never;
  const deep = [
    {
      id: 'du_one001',
      claim: 'Weather mirrors the mood of a story',
      why: '',
      dot_points: [],
      concept_bullets: [],
      shared_piece_ids: [],
      steps: [],
      pieces: [
        { id: 'kp_mist01', text: 'Mist hides what characters cannot face', tier: 'essential' },
        { id: 'kp_calm02', text: 'Calm before a storm builds dread', tier: 'strong' },
        { id: 'kp_none03', text: 'A piece no lesson teaches yet', tier: 'essential' }
      ]
    }
  ] as never;

  it('takes the first teaching lesson in the unit order', () => {
    expect(firstTeachingLesson(['lesson_b', 'lesson_a'], ['lesson_a', 'lesson_b'])).toBe('lesson_a');
    expect(firstTeachingLesson(['lesson_b'], ['lesson_a', 'lesson_b'])).toBe('lesson_b');
    expect(firstTeachingLesson(undefined, ['lesson_a'])).toBeUndefined();
    expect(firstTeachingLesson(['lesson_x'], ['lesson_a'])).toBe('lesson_x');
  });

  it('copies pieces with their link and first teaching lesson', () => {
    const items = deepItems(deep, lessons, ['lesson_a', 'lesson_b']);
    expect(items.map((i) => [i.piece_id, i.lesson_id])).toEqual([
      ['kp_mist01', 'lesson_a'],
      ['kp_calm02', 'lesson_b'],
      ['kp_none03', undefined]
    ]);
  });

  it('skips text and pieces already on the sheet', () => {
    const items = deepItems(deep, lessons, ['lesson_a', 'lesson_b']);
    const organiser: Organiser = {
      sections: [
        {
          id: 'os_1',
          name: 'Key ideas',
          kind: 'table',
          columns: cols(false, true),
          lines: [
            { id: 'ol_1', cells: ['Weather', '  mist hides what characters cannot FACE '] },
            { id: 'ol_2', cells: ['Dread', 'typed by hand'], piece_id: 'kp_calm02' }
          ]
        }
      ]
    };
    expect(freshItems(items, organiser).map((i) => i.piece_id)).toEqual(['kp_none03']);
  });

  it('skips a quote already written and a word already listed', () => {
    const quotes = anthologyItems([
      { lesson_id: 'lesson_a', lesson_title: 'Opening', block_id: 'b', annotation_id: 'an_1', quote: 'The fog came down', note: 'Sets a threat', line_number: 1, layer_name: 'x', themes: [], concepts: [] },
      { lesson_id: 'lesson_b', lesson_title: 'Middle', block_id: 'b', annotation_id: 'an_2', quote: 'A bell rang twice', note: '', line_number: 2, layer_name: 'x', themes: [], concepts: [] }
    ]);
    const words = planItems(
      { unit_id: 'u', big_idea: '', already: [], must: [{ id: 'ki_aaaa1', text: 'Fog is a warning' }], words: ['omen', 'dread'], skills: [], assessed_by: '', leads_on: '', weeks: [] } as never,
      [],
      []
    );
    const organiser: Organiser = {
      sections: [
        { id: 'os_1', name: 'Lines', kind: 'list', lines: [{ id: 'ol_1', cells: ['the fog came down'] }] },
        { id: 'os_2', name: 'Words', kind: 'list', lines: [{ id: 'ol_2', cells: ['Omen'] }] }
      ]
    };
    expect(freshItems(quotes, organiser).map((i) => i.cue)).toEqual(['A bell rang twice']);
    expect(freshItems(words, organiser).map((i) => i.label)).toEqual(['Fog is a warning', 'dread']);
  });

  it('puts the thing to know in a covered column and the cue in a shown one', () => {
    const [piece] = deepItems(deep, lessons, ['lesson_a']);
    expect(bringLine(piece, { kind: 'table', columns: cols(false, true, false) })).toEqual({
      cells: ['', 'Mist hides what characters cannot face', ''],
      lesson_id: 'lesson_a',
      piece_id: 'kp_mist01'
    });
    const [quote] = anthologyItems([
      { lesson_id: 'lesson_a', lesson_title: 'Opening', block_id: 'b', annotation_id: 'an_1', quote: 'The fog came down', note: 'Sets a threat', line_number: 1, layer_name: 'x', themes: [], concepts: [] }
    ]);
    expect(bringLine(quote, { kind: 'table', columns: cols(false, true, false) }).cells).toEqual(['The fog came down', 'Sets a threat', '']);
    expect(bringLine(quote, { kind: 'list' }).cells).toEqual(['The fog came down']);
  });
});

describe('last two lessons', () => {
  const line = (id: string, lesson_id?: string, released_on?: string) => ({ id, cells: [id], fresh: false, ...(lesson_id ? { lesson_id } : {}), ...(released_on ? { released_on } : {}) });
  const sheet: Sheet = {
    unit_id: 'unit_x',
    title: 'Weather in Stories',
    current: true,
    sections: [
      { id: 's1', name: 'Key ideas', kind: 'table', columns: cols(false, true) as never, lines: [line('a', 'l1', '2026-10-01'), line('b', 'l2', '2026-10-08'), line('c', 'l3', '2026-10-15'), line('d'), line('e', 'l3', '2026-10-15')] },
      { id: 's2', name: 'Words', kind: 'list', lines: [line('f', 'l2', '2026-10-08'), line('g', 'l4', '2026-10-22')] }
    ]
  };

  it('takes the two most recent release days across the sheet', () => {
    expect([...recentLessonIds(sheet)].sort()).toEqual(['l3', 'l4']);
  });

  it('shows only those lessons under Last two lessons and everything under Everything so far', () => {
    expect(runLines(sheet, sheet.sections[0], 'last').map((l) => l.id)).toEqual(['c', 'e']);
    expect(runLines(sheet, sheet.sections[1], 'last').map((l) => l.id)).toEqual(['g']);
    expect(runLines(sheet, sheet.sections[0], 'all').map((l) => l.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('never counts lines with no lesson, and breaks a same-day tie by sheet order', () => {
    const tied: Sheet = { ...sheet, sections: [{ id: 's', name: 'x', kind: 'list', lines: [line('p', 'l1', '2026-10-01'), line('q', 'l2', '2026-10-01'), line('r', 'l3', '2026-10-01'), line('s')] }] };
    expect([...recentLessonIds(tied)].sort()).toEqual(['l2', 'l3']);
    expect(runLines(tied, tied.sections[0], 'last').map((l) => l.id)).toEqual(['q', 'r']);
  });
});

describe('small helpers', () => {
  it('codes lessons L1, L2 in the unit order', () => {
    expect([...lessonCodes(['x', 'y'])]).toEqual([['x', 'L1'], ['y', 'L2']]);
  });

  it('runs jobs one at a time in the order they were added', async () => {
    const queue = createSerialQueue();
    const log: string[] = [];
    const slow = queue.add(async () => { await new Promise((r) => setTimeout(r, 20)); log.push('first'); });
    const failing = queue.add(async () => { log.push('second'); throw new Error('no'); });
    const last = queue.add(async () => { log.push('third'); return 3; });
    await slow;
    await expect(failing).rejects.toThrow('no');
    expect(await last).toBe(3);
    expect(log).toEqual(['first', 'second', 'third']);
  });

  it('formats the run timer', () => {
    expect(clock(180)).toBe('3:00');
    expect(clock(65)).toBe('1:05');
    expect(clock(0)).toBe('0:00');
  });

  it('routes the run view', () => {
    expect(match('/units/unit_x/organiser/run')).toEqual({ name: 'teacher-organiser-run', params: { unitId: 'unit_x' }, requiresAuth: true, path: '/units/unit_x/organiser/run' });
    expect(match('/units/unit_x')?.name).toBe('teacher-unit');
  });
});
