import { describe, expect, it } from 'vitest';
import { codeTrend, duLadder, latestOnly, overTime, rangeStart, type TermSpan } from '@/evidence/over-time';
import type { Evidence } from '@/evidence/types';

// Invented students only: s1 is the student, s2–s3 classmates, gone has left the class.
const e = (student: string, item: string, tags: string[], share: number, date: string, source = 'quiz:a', why: Evidence['why'] = []): Evidence =>
  ({ student, item, tags, share, why, confidence: null, source, date });

const terms: TermSpan[] = [
  { number: 3, start: '2026-07-20', end: '2026-09-25' },
  { number: 4, start: '2026-10-12', end: '2026-12-18' }
];
const today = '2026-11-04';
const base = { range: 'year' as const, today, terms };

describe('weeks', () => {
  it('buckets by school week and leaves a gap for the holidays', () => {
    const t = overTime([e('s1', 'q1', ['tech:a'], 0.5, '2026-09-22'), e('s1', 'q2', ['tech:a'], 1, '2026-10-14')], 's1', base);
    const labels = t.weeks.map((w) => w.label);
    expect(labels[0]).toBe('T3 W10');
    expect(labels[1]).toBe('T4 W1');
    expect(labels.at(-1)).toBe('T4 W4');
    expect(t.weeks[1]!.gapBefore).toBe(true);
    expect(t.weeks[2]!.gapBefore).toBe(false);
    expect(t.me).toEqual([50, 100, null, null, null]);
  });

  it('puts holiday work in the last school week before it', () => {
    const t = overTime([e('s1', 'q1', ['tech:a'], 0.4, '2026-09-22'), e('s1', 'q2', ['tech:a'], 0.8, '2026-09-30', 'quiz:b')], 's1', base);
    expect(t.me[0]).toBe(60);
  });

  it('shows nothing when the student has no tagged evidence', () => {
    const t = overTime([e('s2', 'q1', ['tech:a'], 1, '2026-10-14')], 's1', base);
    expect(t.weeks).toEqual([]);
    expect(t.tags).toEqual([]);
  });
});

describe('latest attempt', () => {
  it('keeps only the newest attempt at each item', () => {
    const list = [e('s1', 'q1', ['tech:a'], 0, '2026-10-13'), e('s1', 'q1', ['tech:a'], 1, '2026-10-20')];
    expect(latestOnly(list)).toHaveLength(1);
    const t = overTime(list, 's1', base);
    const row = t.tags.find((r) => r.tag === 'tech:a')!;
    expect(row.now).toBe(100);
    expect(row.pieces).toBe(1);
    expect(t.me.filter((x) => x !== null)).toEqual([100]);
  });
});

describe('class line', () => {
  it('averages students, and leaves out students who have left', () => {
    const list = [e('s1', 'q1', ['tech:a'], 1, '2026-10-13'), e('s2', 'q1', ['tech:a'], 0.5, '2026-10-13'), e('gone', 'q1', ['tech:a'], 0, '2026-10-13')];
    const t = overTime(list, 's1', { ...base, active: new Set(['s1', 's2']) });
    expect(t.cls[0]).toBe(75);
    expect(t.tags[0]!.cls).toBe(75);
  });
});

describe('bands', () => {
  it('one piece is New', () => {
    const t = overTime([e('s1', 'q1', ['tech:a'], 0.9, '2026-10-13'), e('s1', 'q2', ['tech:a'], 0.9, '2026-10-13')], 's1', base);
    expect(t.tags[0]!.band).toBe('new');
    expect(t.tags[0]!.change).toBeNull();
  });

  it('Secure, Growing and Needs work', () => {
    const t = overTime(
      [
        e('s1', 'q1', ['tech:hi'], 0.6, '2026-10-13'), e('s1', 'q2', ['tech:hi'], 0.8, '2026-10-20', 'quiz:b'),
        e('s1', 'q3', ['tech:mid'], 0.6, '2026-10-13'), e('s1', 'q4', ['tech:mid'], 0.65, '2026-10-20', 'quiz:b'),
        e('s1', 'q5', ['tech:fall'], 0.9, '2026-10-13'), e('s1', 'q6', ['tech:fall'], 0.7, '2026-10-20', 'quiz:b')
      ],
      's1',
      base
    );
    const band = (tag: string) => t.tags.find((r) => r.tag === tag)!.band;
    expect(band('tech:hi')).toBe('secure');
    expect(band('tech:mid')).toBe('growing');
    expect(band('tech:fall')).toBe('gap');
  });

  it('kp tags sit with deep understandings; evidence is newest first with parts', () => {
    const t = overTime([e('s1', 'q1', ['kp:kp_aaaa'], 1, '2026-10-13'), e('s1', 'q2', ['kp:kp_aaaa'], 0, '2026-10-20', 'quiz:b')], 's1', {
      ...base,
      sources: [{ source: 'quiz:a', title: 'Week 1 quiz' }, { source: 'quiz:b', title: 'Week 2 quiz' }],
      partOf: (_s, item) => item.toUpperCase()
    });
    const row = t.tags[0]!;
    expect(row.kind).toBe('du');
    expect(row.evidence.map((x) => [x.title, x.part, x.mark])).toEqual([['Week 2 quiz', 'Q2', '0%'], ['Week 1 quiz', 'Q1', '100%']]);
  });
});

describe('moves', () => {
  it('never pads a card when nothing qualifies', () => {
    const t = overTime([e('s1', 'q1', ['tech:a'], 0.7, '2026-10-13'), e('s1', 'q2', ['tech:a'], 0.72, '2026-10-20', 'quiz:b')], 's1', base);
    expect(t.moves).toEqual({});
  });

  it('finds rising and slipping tags with plain reasons', () => {
    const t = overTime(
      [
        e('s1', 'q1', ['skill:inf'], 0.5, '2026-10-13', 'quiz:a'), e('s1', 'q2', ['skill:inf'], 0.9, '2026-10-27', 'quiz:c'),
        e('s1', 'q3', ['dp:x:y'], 0.8, '2026-10-13', 'quiz:a'), e('s1', 'q4', ['dp:x:y'], 0.6, '2026-10-20', 'quiz:b'), e('s1', 'q5', ['dp:x:y'], 0.4, '2026-10-27', 'quiz:c'),
        e('s2', 'q5', ['dp:x:y'], 0.6, '2026-10-27', 'quiz:c')
      ],
      's1',
      { ...base, sources: [{ source: 'quiz:a', title: 'Week 1 quiz' }] }
    );
    expect(t.moves.rising).toMatchObject({ tag: 'skill:inf', from: 50, to: 90 });
    expect(t.moves.rising!.reason).toContain('Since Week 1 quiz');
    expect(t.moves.slipping).toMatchObject({ tag: 'dp:x:y', from: 80, to: 40 });
    expect(t.moves.slipping!.reason).toBe('Fell each of the last 3 weeks it came up. Class sits at 50%.');
  });

  it('a named mix-up three times is Stuck', () => {
    const mix = [{ type: 'named' as const, as: 'tech:contrast', target: 'tech:jux' }];
    const t = overTime(
      [
        e('s1', 'q1', ['tech:jux'], 0, '2026-10-13', 'quiz:a', mix),
        e('s1', 'q2', ['tech:jux'], 0.5, '2026-10-20', 'quiz:b', mix),
        e('s1', 'q3', ['tech:jux'], 0, '2026-10-27', 'quiz:c', mix)
      ],
      's1',
      { ...base, label: (tag) => (tag === 'tech:contrast' ? 'Contrast' : tag), sources: [{ source: 'quiz:a', title: 'Week 1 quiz' }] }
    );
    expect(t.moves.stuck).toMatchObject({ tag: 'tech:jux', lo: 0, hi: 50 });
    expect(t.moves.stuck!.reason).toBe('Named it “Contrast” 3 times. Same mix-up since Week 1 quiz.');
  });

  it('a mix-up the student is now Secure on is not Stuck', () => {
    const mix = [{ type: 'named' as const, as: 'tech:contrast', target: 'tech:jux' }];
    const t = overTime(
      [
        e('s1', 'q1', ['tech:jux'], 0, '2026-10-13', 'quiz:a', mix),
        e('s1', 'q2', ['tech:jux'], 0, '2026-10-20', 'quiz:b', mix),
        e('s1', 'q3', ['tech:jux'], 0, '2026-10-27', 'quiz:c', mix),
        e('s1', 'q4', ['tech:jux'], 1, '2026-11-03', 'quiz:d')
      ],
      's1',
      base
    );
    expect(t.moves.stuck).toBeUndefined();
  });

  it('three low pieces in a narrow band is Stuck', () => {
    const t = overTime(
      [e('s1', 'q1', ['tech:a'], 0.4, '2026-10-13', 'quiz:a'), e('s1', 'q2', ['tech:a'], 0.45, '2026-10-20', 'quiz:b'), e('s1', 'q3', ['tech:a'], 0.42, '2026-10-27', 'quiz:c')],
      's1',
      base
    );
    expect(t.moves.stuck).toMatchObject({ tag: 'tech:a', lo: 40, hi: 45 });
  });
});

describe('range', () => {
  const list = [e('s1', 'q1', ['tech:a'], 1, '2026-08-03', 'quiz:a'), e('s1', 'q2', ['tech:a'], 0.5, '2026-10-20', 'quiz:b')];
  it('starts the year at the first term, the term at today’s term, the unit at its first lesson', () => {
    expect(rangeStart('year', today, terms)).toBe('2026-07-20');
    expect(rangeStart('term', today, terms)).toBe('2026-10-12');
    expect(rangeStart('unit', today, terms, '2026-10-19')).toBe('2026-10-19');
    expect(rangeStart('unit', today, terms, null)).toBe('2026-10-12');
  });
  it('cuts evidence before the range', () => {
    expect(overTime(list, 's1', base).tags[0]!.pieces).toBe(2);
    const term = overTime(list, 's1', { ...base, range: 'term' });
    expect(term.tags[0]!.pieces).toBe(1);
    expect(term.weeks[0]!.label).toBe('T4 W1');
    expect(overTime(list, 's1', { ...base, range: 'unit', unitStart: '2026-10-26' }).tags).toEqual([]);
  });
});

describe('vocabulary', () => {
  it('turns organiser weeks into a row', () => {
    const t = overTime([], 's1', { ...base, range: 'term', vocab: [{ week_start: '2026-10-12', right: 6, seen: 10 }, { week_start: '2026-10-19', right: 9, seen: 10 }] });
    const row = t.tags.find((r) => r.tag === 'vocab:organiser')!;
    expect(row.history.slice(0, 2)).toEqual([60, 90]);
    expect(row.change).toBe(30);
  });
});

describe('deep understandings and codes', () => {
  it('reads the best tier now and where it started', () => {
    const deep = [{ id: 'du_aaaa', claim: 'Place holds memory', why: '', dot_points: [], concept_bullets: [], shared_piece_ids: [], steps: [], pieces: [{ id: 'kp_ess1', text: 'E', tier: 'essential' as const }, { id: 'kp_str1', text: 'S', tier: 'strong' as const }] }, { id: 'du_bbbb', claim: 'Untested', why: '', dot_points: [], concept_bullets: [], shared_piece_ids: [], steps: [], pieces: [] }];
    const rows = duLadder([e('s1', 'q1', ['kp:kp_ess1'], 1, '2026-10-13'), e('s1', 'q2', ['kp:kp_str1'], 1, '2026-10-20', 'quiz:b')], 's1', deep as never, [{ source: 'quiz:a', title: 'Week 1 quiz' }, { source: 'quiz:b', title: 'Week 2 quiz' }]);
    expect(rows[0]).toMatchObject({ now: 'strong', was: 'essential', sources: ['Week 1 quiz', 'Week 2 quiz'] });
    expect(rows[1]).toMatchObject({ now: null, was: null, sources: [] });
  });

  it('a code that turns up less often is fewer', () => {
    expect(codeTrend([2, 1, 0, 0])).toBe('fewer');
    expect(codeTrend([0, null, 1])).toBe('more');
    expect(codeTrend([1])).toBeNull();
  });
});
