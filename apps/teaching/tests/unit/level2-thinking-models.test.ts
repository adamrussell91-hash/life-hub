import { describe, expect, it } from 'vitest';
import {
  cleanSlots, consensus, consensusSlots, contested, criterionShift, isComplete, movement, needsWhy, outliers,
  placeCard, roundGaps, rowSlots, slotRow
} from '@/blocks/diamond-nine/model';
import { depthCounts, pointGaps, regionLabel, regionsFor, shouldNudge, type VennPoint } from '@/blocks/venn/model';
import { canAdd, choicePattern, pickCounts, ruleApplies, ruleStatus, ruleText } from '@/blocks/choice-board/model';
import { fadeStages, frameFor, itemStage, limitStatus, usesJoiningWord, wordCount } from '@/blocks/formats/sentence-model';

const CARDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];

describe('Diamond 9 model', () => {
  it('maps slots to rows 1-2-3-2-1', () => {
    expect(Array.from({ length: 9 }, (_, i) => slotRow(i))).toEqual([0, 1, 1, 2, 2, 2, 3, 3, 4]);
    expect(rowSlots(2)).toEqual([3, 4, 5]);
    expect(rowSlots(4)).toEqual([8]);
  });

  it('places from the tray, swaps on the diamond and cleans bad data', () => {
    let slots = cleanSlots(null);
    slots = placeCard(slots, 'a', 0);
    slots = placeCard(slots, 'b', 1);
    expect(placeCard(slots, 'a', 1).slice(0, 2)).toEqual(['b', 'a']);
    expect(placeCard(slots, 'c', 0)[0]).toBe('c');
    expect(placeCard(slots, 'c', 0).includes('a')).toBe(false);
    expect(cleanSlots(['a', 'a', 7, 'b'])).toEqual(['a', null, null, 'b', null, null, null, null, null]);
    expect(isComplete(CARDS)).toBe(true);
    expect(isComplete(['a', ...CARDS.slice(1, 8), 'a'])).toBe(false);
  });

  it('works out mean row and spread per card', () => {
    const layouts = [CARDS, CARDS, [...CARDS].reverse()];
    const stats = consensus(layouts, CARDS);
    const a = stats.find((s) => s.id === 'a')!;
    expect(a.rows).toEqual([0, 0, 4]);
    expect(a.mean).toBeCloseTo(4 / 3);
    expect(a.spread).toBeCloseTo(Math.sqrt(((4 / 3) ** 2 * 2 + (8 / 3) ** 2) / 3));
    const e = stats.find((s) => s.id === 'e')!;
    expect(e.spread).toBe(0);
    expect(consensusSlots(stats)[0]).toBe('a');
  });

  it('picks out the most contested cards and their outliers', () => {
    const agree = CARDS;
    const layouts = [agree, agree, agree, ['i', ...CARDS.slice(1, 8), 'a']];
    const stats = consensus(layouts, CARDS);
    const top = contested(stats, { min: 3, count: 2 });
    expect(top.map((s) => s.id).sort()).toEqual(['a', 'i']);
    const students = layouts.map((slots, i) => ({ initials: `S${i}`, slots, reasons: i === 3 ? { a: 'It only matters at the end' } : {} }));
    const out = outliers(students, stats.find((s) => s.id === 'a')!);
    expect(out).toEqual([{ initials: 'S3', row: 4, gap: 3, reason: 'It only matters at the end' }]);
    expect(contested(consensus([agree, agree], CARDS), { min: 3 })).toEqual([]);
  });

  it('measures movement between rounds and asks why for two rows or more', () => {
    const after = ['e', 'b', 'c', 'd', 'a', 'f', 'g', 'h', 'i'];
    const moved = movement(CARDS, after);
    expect(moved.a).toBe(-2);
    expect(moved.e).toBe(2);
    expect(moved.b).toBe(0);
    expect(needsWhy(moved).sort()).toEqual(['a', 'e']);
    expect(roundGaps(after as never, { e: 'x', i: 'y' }, { moved, why: { a: 'The ending' } })).toEqual(['Say what changed your mind for 1 card']);
  });

  it('lists what a round still needs', () => {
    const half = cleanSlots(['a', 'b', 'c']);
    expect(roundGaps(half, { a: 'Because' })).toEqual(['Place 6 more cards']);
    expect(roundGaps(cleanSlots(CARDS), { a: 'why' })).toEqual(['Say why your bottom card is at the bottom']);
    expect(roundGaps(cleanSlots(CARDS), { a: 'why', i: 'why' })).toEqual([]);
  });

  it('finds the cards that shift most between criteria', () => {
    const first = consensus([CARDS], CARDS);
    const second = consensus([[...CARDS].reverse()], CARDS);
    const shifts = criterionShift(first, second);
    expect(Math.abs(shifts[0]!.shift)).toBe(4);
  });
});

const point = (over: Partial<VennPoint>): VennPoint => ({ id: 'p', text: 'Storms', region: 'a', depth: 'surface', quotes: {}, differs: {}, ...over });

describe('Two-text Venn model', () => {
  it('lists regions for two and three texts', () => {
    expect(regionsFor(2)).toEqual(['a', 'ab', 'b']);
    expect(regionsFor(3)).toHaveLength(7);
    expect(regionLabel('ab', ['Poem', 'Film'], 2)).toBe('Both');
    expect(regionLabel('a', ['Poem', 'Film'], 2)).toBe('Poem only');
    expect(regionLabel('ac', ['Poem', 'Film', 'Novel'], 3)).toBe('Poem and Novel');
  });

  it('asks shared points how each text treats them', () => {
    expect(pointGaps(point({ region: 'ab', depth: 'deep', differs: { a: 'as threat' } }))).toEqual(['Say how text B treats it']);
    expect(pointGaps(point({ region: 'ab', depth: 'deep', differs: { a: 'x', b: 'y' } }))).toEqual([]);
    expect(pointGaps(point({ region: null, depth: null, text: '' }))).toEqual(['Write the point', 'Place it in the Venn', 'Tag it surface or deep']);
  });

  it('nudges towards deep points when surface ones outnumber them', () => {
    const pts = [point({ id: '1' }), point({ id: '2' }), point({ id: '3', depth: 'deep' })];
    expect(depthCounts(pts)).toEqual({ surface: 2, deep: 1, untagged: 0 });
    expect(shouldNudge(pts)).toBe(true);
    expect(shouldNudge(pts, false)).toBe(false);
    expect(shouldNudge([...pts, point({ id: '4', depth: 'deep' })])).toBe(false);
    expect(shouldNudge([point({ id: '1' })])).toBe(false);
  });
});

describe('Choice board rules', () => {
  const each = { pick: 3, columns: 3, rule: 'each_column' as const };
  const line = { pick: 3, columns: 3, rule: 'line' as const };

  it('counts picks against the target', () => {
    const none = { pick: 2, columns: 3, rule: 'none' as const };
    expect(ruleStatus([0], 9, none)).toEqual({ met: false, need: 'Pick 1 more.' });
    expect(ruleStatus([0, 1], 9, none).met).toBe(true);
    expect(canAdd([0, 1], none)).toBe(false);
    expect(ruleText(none, 9)).toBe('Pick 2 tasks.');
  });

  it('needs one from each column', () => {
    expect(ruleStatus([0, 3], 9, each)).toEqual({ met: false, need: 'Swap a pick so every column has one: columns 2 and 3 still need one.' });
    expect(ruleStatus([0, 1], 9, each)).toEqual({ met: false, need: 'Pick from column 3.' });
    expect(ruleStatus([0], 9, each)).toEqual({ met: false, need: 'Pick from columns 2 and 3.' });
    expect(ruleStatus([], 9, each)).toEqual({ met: false, need: 'Pick from columns 1, 2 and 3.' });
    expect(ruleStatus([0, 4, 8], 9, each).met).toBe(true);
  });

  it('needs a noughts-and-crosses line on a 3 × 3 board', () => {
    expect(ruleStatus([0, 4, 8], 9, line).met).toBe(true);
    expect(ruleStatus([2, 5, 8], 9, line).met).toBe(true);
    expect(ruleStatus([0, 1, 5], 9, line)).toEqual({ met: false, need: 'Make your picks a line: a row, a column or a diagonal.' });
    expect(ruleApplies(line, 6)).toBe(false);
    expect(ruleStatus([0, 1, 5], 6, line).met).toBe(true);
  });

  it('spots a student who always takes the lowest or highest level', () => {
    expect(choicePattern([1, 1, 1], [1, 2, 3])).toBe('lowest');
    expect(choicePattern([3, 3], [1, 2, 3])).toBe('highest');
    expect(choicePattern([1, 3], [1, 2, 3])).toBe('mixed');
    expect(choicePattern([1], [1, 2, 3])).toBeNull();
    expect(choicePattern([1, 1], [1])).toBeNull();
    expect(pickCounts([[0, 1], [1, 1, 2]], 3)).toEqual([1, 2, 1]);
  });
});

describe('Sentence-level fading', () => {
  it('fades from a worked model to independent', () => {
    expect(fadeStages(1)).toEqual(['independent']);
    expect(fadeStages(2)).toEqual(['model', 'independent']);
    expect(fadeStages(3)).toEqual(['model', 'frame', 'independent']);
    expect(fadeStages(5)).toEqual(['model', 'frame', 'frame', 'independent', 'independent']);
    expect(fadeStages(4, false)).toEqual(['independent', 'independent', 'independent', 'independent']);
  });

  it('drops a stage its item cannot support', () => {
    expect(itemStage('model', {})).toBe('independent');
    expect(itemStage('model', { frame: 'Although …' })).toBe('frame');
    expect(itemStage('frame', { model_answer: 'The storm returns because grief returns.' })).toBe('frame');
    expect(itemStage('independent', { model_answer: 'x' })).toBe('independent');
  });

  it('cuts a frame from the model when the teacher writes none', () => {
    expect(frameFor({ model_answer: 'The storm returns at the end because the speaker’s grief has not passed.' })).toBe('The storm returns at the …');
    expect(frameFor({ frame: 'Although the storm …', model_answer: 'x y z' })).toBe('Although the storm …');
    expect(frameFor({ model_answer: 'Too short' })).toBe('');
  });

  it('counts words and checks the joining word', () => {
    expect(wordCount('  The tide turns.  ')).toBe(3);
    expect(limitStatus('one two three', 2)).toEqual({ words: 3, over: true });
    expect(limitStatus('one two', undefined).over).toBe(false);
    expect(usesJoiningWord('Although the sea is calm, the speaker waits.', 'although')).toBe(true);
    expect(usesJoiningWord('The sea is calm, which unsettles her.', 'which')).toBe(true);
    expect(usesJoiningWord('Sowing seeds', 'so')).toBe(false);
    expect(usesJoiningWord('She waits even though it is late.', 'even though')).toBe(true);
  });
});
