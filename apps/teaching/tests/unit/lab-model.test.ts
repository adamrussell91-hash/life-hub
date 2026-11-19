import { describe, expect, it } from 'vitest';
import {
  applyEdits, biggestShift, changeLabel, deal, dealLate, describeEdits, formatShift, hasChange, levelGroups, markEdits, pairFindings, pickResult, predictionWord, sanitiseEdit, setHeadline, setResult, shift, stepsFor, tokenise, verdict,
  type Deal, type ReadingItem
} from '@/lab/model';
import { LAB_DEFAULT_FEATURES } from '@/lab/schema';

// An invented stanza and an invented class of 17 in eight pairs.
const POEM = 'I meant to tell you — once\nthe kettle stopped, once the light\nhad settled on the bench,\nbut the words, I think,\nwere somewhere else. Perhaps\ntomorrow. Would tomorrow do?';
const tokens = tokenise(POEM);
const CLASS = Array.from({ length: 17 }, (_, i) => `st_${String(i + 1).padStart(2, '0')}`);
const PAIRS = Array.from({ length: 8 }, (_, i) => ({ id: `p${i + 1}`, students: CLASS.slice(i * 2, i === 7 ? 17 : i * 2 + 2) }));
const pairOf = Object.fromEntries(PAIRS.flatMap((p) => p.students.map((s) => [s, p.id])));
const index = (word: string, nth = 0) => tokens.map((t, i) => [t.w, i] as const).filter(([w]) => w === word)[nth]![1];

const countsOf = (dealt: Deal, key: (item: ReadingItem) => string | null) => {
  const counts = new Map<string, number>();
  for (const items of Object.values(dealt)) for (const item of items) {
    const k = key(item);
    if (k !== null) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
};
const spreadOf = (counts: Map<string, number>) => Math.max(...counts.values()) - Math.min(...counts.values());

describe('steps', () => {
  it('each level runs its own steps in order', () => {
    expect(stepsFor('supplied')).toEqual(['Question', 'Predict', 'Test', 'Result', 'Explain']);
    expect(stepsFor('students')).toEqual(['Question', 'Predict', 'Make', 'Test', 'Result', 'Explain']);
    expect(stepsFor('pairs')).toEqual(['Question', 'Design', 'Predict', 'Test', 'Result', 'Name it', 'Explain']);
  });
});

describe('the control as tokens', () => {
  it('splits on spaces and keeps line breaks on the last word of a line', () => {
    expect(tokens).toHaveLength(31);
    expect(tokens[6]).toEqual({ w: 'once', line: 1, br: true });
    expect(tokens[tokens.length - 1]).toEqual({ w: 'do?', line: 6, br: false });
    expect(tokens.filter((t) => t.br)).toHaveLength(5);
  });

  it('round-trips: no edits gives the text back', () => {
    expect(applyEdits(tokens, {}).text).toBe(POEM);
    expect(applyEdits(tokenise('  One   two \n\n three  '), {}).lines).toEqual(['One two', 'three']);
    expect(hasChange(tokens, {})).toBe(false);
  });

  it('a cut is applied and described; two adjacent cuts read as one change', () => {
    const edit = { cut: [index('I', 1), index('think,')] };
    expect(applyEdits(tokens, edit).lines[3]).toBe('but the words,');
    expect(describeEdits(tokens, edit)).toEqual(['cut "I think,"']);
    expect(hasChange(tokens, edit)).toBe(true);
  });

  it('a replaced word is applied and described', () => {
    const edit = { rep: { [index('meant')]: 'wanted' } };
    expect(applyEdits(tokens, edit).lines[0]).toBe('I wanted to tell you — once');
    expect(describeEdits(tokens, edit)).toEqual(['changed "meant" to "wanted"']);
    // The same word typed back is no change.
    expect(describeEdits(tokens, { rep: { [index('meant')]: 'meant' } })).toEqual([]);
  });

  it('a joined line and a new break are applied and described', () => {
    const join = { join: [index('Perhaps')] };
    expect(applyEdits(tokens, join).lines).toHaveLength(5);
    expect(applyEdits(tokens, join).lines[4]).toBe('were somewhere else. Perhaps tomorrow. Would tomorrow do?');
    expect(describeEdits(tokens, join)).toEqual(['joined lines 5 and 6']);
    const brk = { brk: [index('settled')] };
    expect(applyEdits(tokens, brk).lines).toHaveLength(7);
    expect(describeEdits(tokens, brk)).toEqual(['broke line 3 after "settled"']);
  });

  it('two changes apart are two phrases, and marks say what moved', () => {
    const edit = { cut: [index('—')], brk: [index('settled')] };
    expect(describeEdits(tokens, edit)).toEqual(['cut "—"', 'broke line 3 after "settled"']);
    const marked = markEdits(tokens, edit);
    expect(marked.filter((t) => t.changed)).toHaveLength(2);
    expect(marked[index('settled')]).toMatchObject({ moved: true, breakAfter: true, cut: false });
    expect(marked[index('—')]).toMatchObject({ cut: true, moved: false });
  });
});

describe('who reads what', () => {
  it('pairs: 17 students in eight pairs each get two controls and four other pairs’ versions, evenly', () => {
    const dealt = deal({ kind: 'pairs', students: CLASS, pairOf, versions: PAIRS.map((p) => p.id) }, 'seed-a');
    for (const s of CLASS) {
      const items = dealt[s]!;
      expect(items).toHaveLength(6);
      expect(items.filter((i) => i.kind === 'control')).toHaveLength(2);
      const versions = items.flatMap((i) => (i.kind === 'version' ? [i.pair] : []));
      expect(new Set(versions).size).toBe(4);
      expect(versions).not.toContain(pairOf[s]);
    }
    const counts = countsOf(dealt, (i) => (i.kind === 'version' ? i.pair : null));
    expect(counts.size).toBe(8);
    expect(spreadOf(counts)).toBeLessThanOrEqual(1);
  });

  it('the same seed gives the same deal; another seed gives another', () => {
    const input = { kind: 'pairs' as const, students: CLASS, pairOf, versions: PAIRS.map((p) => p.id) };
    expect(deal(input, 'seed-a')).toEqual(deal(input, 'seed-a'));
    expect(deal(input, 'seed-b')).not.toEqual(deal(input, 'seed-a'));
  });

  it('one pair alone reads two controls and nothing of its own', () => {
    const dealt = deal({ kind: 'pairs', students: ['st_01', 'st_02'], pairOf: { st_01: 'p1', st_02: 'p1' }, versions: ['p1'] }, 'seed');
    expect(dealt.st_01).toEqual([{ kind: 'control' }, { kind: 'control' }]);
    expect(dealt.st_02).toEqual([{ kind: 'control' }, { kind: 'control' }]);
  });

  it('pick one: a class of 5 each read the four other writers, never themselves, each with all options together', () => {
    const five = CLASS.slice(0, 5);
    const dealt = deal({ kind: 'writers', students: five, writers: five, options: 3 }, 'seed');
    for (const s of five) {
      const writers = dealt[s]!.map((i) => (i.kind === 'writer' ? i.writer : ''));
      expect(new Set(writers).size).toBe(4);
      expect(writers).not.toContain(s);
      for (const item of dealt[s]!) expect(item.kind === 'writer' ? [...item.order].sort() : []).toEqual([0, 1, 2]);
    }
    expect(spreadOf(countsOf(dealt, (i) => (i.kind === 'writer' ? i.writer : null)))).toBe(0);
  });

  it('pick one: 17 writers get six readers each, within one', () => {
    const dealt = deal({ kind: 'writers', students: CLASS, writers: CLASS, options: 3 }, 'seed');
    for (const s of CLASS) {
      expect(dealt[s]).toHaveLength(6);
      expect(dealt[s]!.some((i) => i.kind === 'writer' && i.writer === s)).toBe(false);
    }
    expect(spreadOf(countsOf(dealt, (i) => (i.kind === 'writer' ? i.writer : null)))).toBeLessThanOrEqual(1);
  });

  it('supplied and rated: the class is split into groups that differ by at most one', () => {
    for (const versions of [2, 3]) {
      const dealt = deal({ kind: 'split', students: CLASS, versions }, `seed-${versions}`);
      const counts = countsOf(dealt, (i) => (i.kind === 'text' ? String(i.version) : null));
      expect(counts.size).toBe(versions);
      expect(spreadOf(counts)).toBeLessThanOrEqual(1);
      for (const s of CLASS) expect(dealt[s]).toHaveLength(1);
    }
  });

  it('a late reader joins the smaller group', () => {
    const input = { kind: 'split' as const, students: CLASS, versions: 2 };
    const dealt = deal(input, 'seed');
    const counts = countsOf(dealt, (i) => (i.kind === 'text' ? String(i.version) : null));
    const smaller = [...counts.entries()].sort((a, b) => a[1] - b[1])[0]![0];
    expect(dealLate(input, dealt, 'st_late', 'seed')).toEqual([{ kind: 'text', version: Number(smaller) }]);
  });
});

describe('what the readings show', () => {
  it('shift is the difference of the two averages, to one decimal place', () => {
    expect(shift([6, 7, 7], [5, 5, 4])).toBe(-2);
    expect(shift([6, 6, 7], [7, 7, 7])).toBe(0.7);
    expect(shift([], [])).toBe(0);
  });

  it('the verdict turns at the threshold', () => {
    expect(verdict(-1, 1)).toBe(-1);
    expect(verdict(-0.9, 1)).toBe(0);
    expect(verdict(0.9, 1)).toBe(0);
    expect(verdict(1, 1)).toBe(1);
    expect(verdict(1.4, 1)).toBe(1);
  });

  it('pick result: order, lead and whether the lead counts', () => {
    expect(pickResult([20, 45, 31], 8)).toEqual({ order: [1, 2, 0], top: 1, lead: 14, win: true });
    expect(pickResult([20, 38, 31], 8)).toMatchObject({ top: 1, lead: 7, win: false });
    expect(pickResult([7.9, 5.1], 1)).toMatchObject({ top: 0, lead: 2.8, win: true });
    expect(pickResult([5, 5], 0)).toMatchObject({ lead: 0, win: false });
  });

  it('the headline names the winner, or says it is too close to call', () => {
    const options = ['Active', 'Passive'];
    const won = setResult({ judge: 'rate', options: 2, picks: [], ratings: [[8, 8, 7], [5, 5, 6]], predictions: [2, 4], readers: 6, threshold: 1 });
    expect(won.values).toEqual([7.7, 5.3]);
    expect(setHeadline({ options, judge: 'rate', result: won })).toBe('The active version scored highest. Most of us predicted passive.');
    expect(setHeadline({ options, judge: 'rate', result: won, mine: 0 })).toBe('The active version scored highest. You called it.');
    const close = setResult({ judge: 'rate', options: 2, picks: [], ratings: [[6, 6], [6, 5]], predictions: [4, 2], readers: 4, threshold: 1 });
    expect(setHeadline({ options, judge: 'rate', result: close })).toBe('Too close to call. Most of us predicted active.');
    // Nobody's prediction is marked as held when it is too close to call.
    expect(setHeadline({ options, judge: 'rate', result: close, mine: 0 })).toBe('Too close to call. You predicted active.');
  });

  it('levels of language: average shift per level, a thin trial left out', () => {
    const groups = levelGroups([
      { feature: 0, shift: -0.4, readers: 8 },
      { feature: 1, shift: -1.8, readers: 8 },
      { feature: 2, shift: -2.2, readers: 8 },
      { feature: 5, shift: 0.3, readers: 8 },
      { feature: 5, shift: 3, readers: 3 },
      { feature: null, shift: 5, readers: 8 }
    ], LAB_DEFAULT_FEATURES);
    expect(groups).toEqual([
      { level: 'Sentence', trials: 2, meanAbsShift: 2 },
      { level: 'Form', trials: 1, meanAbsShift: 0.4 },
      { level: 'Word', trials: 1, meanAbsShift: 0.3 }
    ]);
  });
});

describe('pairs design it: a saved edit and the class findings', () => {
  // By word: 0 I, 1 meant, 2 to, 3 tell, 4 you / 5 but, 6 the, 7 words, 8 I, 9 think, / 10 were, 11 somewhere, 12 else.
  const control = tokenise('I meant to tell you\nbut the words, I think,\nwere somewhere else.');

  it('an edit is cleaned before it is kept: indexes inside the text, real breaks, trimmed words', () => {
    expect(sanitiseEdit(control, { cut: [9, 8, 8, 40, -1, 1.5, '2'], rep: { 1: '  wanted  ', 2: 'to', 99: 'x', 3: '', 4: 5 }, join: [4, 6], brk: [6, 4, 12] }))
      .toEqual({ cut: [8, 9], rep: { 1: 'wanted' }, join: [4], brk: [6] });
    expect(sanitiseEdit(control, null)).toEqual({});
    expect(sanitiseEdit(control, { cut: 'all', rep: ['x'] })).toEqual({});
    expect(sanitiseEdit(control, { rep: { 1: 'w'.repeat(60) } }).rep?.[1]).toHaveLength(40);
  });

  it('each trial is set against the control: shift, verdict, whether the prediction held, and thin data', () => {
    const found = pairFindings({
      tokens: control, threshold: 1, control: [6, 6, 7, 7],
      trials: [
        { id: 'p1', edit: { cut: [8, 9] }, ratings: [4, 5, 5, 5], pred: -1, feature: 1 },
        { id: 'p2', edit: { join: [4] }, ratings: [6, 7, 6, 7], pred: -1, feature: 0 },
        { id: 'p3', edit: { brk: [6] }, ratings: [9, 9], pred: 1, feature: null },
        { id: 'p4', edit: { rep: { 1: 'wanted' } }, ratings: [], pred: null, feature: null }
      ]
    });
    expect(found.control).toEqual({ mean: 6.5, n: 4 });
    expect(found.trials.map((t) => [t.id, t.desc[0], t.mean, t.n, t.shift, t.verdict, t.held, t.thin])).toEqual([
      ['p1', 'cut "I think,"', 4.8, 4, -1.7, -1, true, false],
      ['p2', 'joined lines 1 and 2', 6.5, 4, 0, 0, false, false],
      ['p3', 'broke line 2 after "the"', 9, 2, 2.5, 1, true, true],
      ['p4', 'changed "meant" to "wanted"', 0, 0, 0, 0, false, true]
    ]);
    // The biggest shift is taken from trials with enough readers when there are any.
    expect(biggestShift(found.trials)?.id).toBe('p1');
    expect(biggestShift(found.trials.filter((t) => t.thin))?.id).toBe('p3');
    expect(biggestShift([])).toBeNull();
  });

  it('a shift, a prediction and a change in words', () => {
    expect([formatShift(1.2), formatShift(-0.8), formatShift(0)]).toEqual(['+1.2', '−0.8', '0.0']);
    expect([-1, 0, 1].map(predictionWord)).toEqual(['lower', 'about the same', 'higher']);
    expect(changeLabel(['cut "I think,"', 'joined lines 1 and 2'])).toBe('Cut "I think,", joined lines 1 and 2');
  });
});
