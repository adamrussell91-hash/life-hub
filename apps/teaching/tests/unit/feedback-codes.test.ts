import { describe, expect, it } from 'vitest';
import {
  codeForKey,
  descriptorFor,
  resolveTyped,
  summariseByCriterion,
  summaryLineText,
  type FeedbackCode
} from '@/blocks/feedback-codes';

const code = (id: string, letters: string, extra: Partial<FeedbackCode> = {}): FeedbackCode => ({
  id,
  code: letters,
  label: letters,
  group: 'composition',
  criterion: 1,
  colour: 'blue',
  descriptor: `${letters} descriptor`,
  ...extra
});

const codes: FeedbackCode[] = [
  code('t', 'T', { criterion: 2 }),
  code('ts', 'TS'),
  code('ar', 'AR'),
  code('e', 'E', { criterion: 2 }),
  code('fw', 'FW', { group: 'speaking', criterion: null, key: '1' }),
  code('old', 'OLD', { hidden: true })
];

describe('typed code entry', () => {
  it('waits on a prefix, then Space confirms the shorter code', () => {
    expect(resolveTyped('t', codes)).toEqual({ kind: 'partial', matches: [codes[0], codes[1]] });
    expect(resolveTyped('t', codes, true)).toEqual({ kind: 'match', code: codes[0] });
    expect(resolveTyped('ts', codes)).toEqual({ kind: 'match', code: codes[1] });
  });
  it('matches a unique code straight away and ignores hidden ones', () => {
    expect(resolveTyped('ar', codes)).toEqual({ kind: 'match', code: codes[2] });
    expect(resolveTyped('a', codes)).toEqual({ kind: 'partial', matches: [codes[2]] });
    expect(resolveTyped('old', codes)).toEqual({ kind: 'none' });
    expect(resolveTyped('zz', codes)).toEqual({ kind: 'none' });
  });
  it('finds speaking codes by number key', () => {
    expect(codeForKey('1', codes)?.id).toBe('fw');
    expect(codeForKey('2', codes)).toBeUndefined();
  });
});

describe('summary', () => {
  it('groups by criterion, strengths first, with counts', () => {
    const lines = summariseByCriterion(
      [
        { code_id: 'ar', positive: false },
        { code_id: 'ar', positive: false },
        { code_id: 'ts', positive: true },
        { code_id: 'e', positive: true },
        { code_id: 'fw', positive: false },
        { code_id: 'gone', positive: false }
      ],
      codes
    );
    expect(lines.map((l) => l.heading)).toEqual(['Criterion 1 · Ideas', 'Criterion 2 · Evidence', 'Speaking']);
    expect(summaryLineText(lines[0]!)).toBe('TS+ · AR ×2');
    expect(summaryLineText(lines[2]!)).toBe('FW');
  });
  it('falls back to a generic strength line', () => {
    expect(descriptorFor(codes[2]!, true)).toBe('Strength: ar.');
    expect(descriptorFor(codes[2]!, false)).toBe('AR descriptor');
  });
});
