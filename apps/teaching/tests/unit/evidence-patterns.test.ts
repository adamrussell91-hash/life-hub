import { describe, expect, it } from 'vitest';
import { byTag, compare, confidenceQuadrants, defaultKind, findFlags, focusFor, mixUps, studentBand, trend } from '@/evidence/patterns';
import type { Evidence } from '@/evidence/types';

const e = (student: string, item: string, tags: string[], share: number | null, confidence: Evidence['confidence'] = null, why: Evidence['why'] = [], source = 'quiz:a', date = '2026-10-01'): Evidence =>
  ({ student, item, tags, share, why, confidence, source, date });

// Juxtaposition: weak (2 questions). Simile: secure. Motif: one question.
const sample: Evidence[] = [
  e('s1', 'q1', ['tech:jux'], 0, 3, [{ type: 'named', as: 'tech:contrast', target: 'tech:jux' }]),
  e('s1', 'q2', ['tech:jux'], 0.5, 2),
  e('s2', 'q1', ['tech:jux'], 0, 3, [{ type: 'named', as: 'tech:contrast', target: 'tech:jux' }]),
  e('s2', 'q2', ['tech:jux'], 0, 1),
  e('s3', 'q1', ['tech:jux'], 1, 1),
  e('s3', 'q2', ['tech:jux'], 1, 1),
  e('s1', 'q3', ['tech:simile'], 1, 3),
  e('s1', 'q4', ['tech:simile'], 1, 3),
  e('s2', 'q3', ['tech:simile'], 1, 3),
  e('s2', 'q4', ['tech:simile'], 1, 3),
  e('s3', 'q3', ['tech:simile'], 0, 3),
  e('s3', 'q4', ['tech:simile'], 0, 3),
  e('s4', 'q3', ['tech:simile'], 1, 3),
  e('s4', 'q4', ['tech:simile'], 1, 3),
  e('s5', 'q3', ['tech:simile'], 1, 3),
  e('s5', 'q4', ['tech:simile'], 1, 3),
  e('s1', 'q5', ['tech:motif'], 1, 2)
];

describe('byTag', () => {
  it('bands, groups and sorts weakest first', () => {
    const rows = byTag(sample, 'tech');
    expect(rows.map((r) => r.tag)).toEqual(['tech:jux', 'tech:simile', 'tech:motif']);
    const jux = rows[0]!;
    expect(jux.mean).toBeCloseTo(2.5 / 6, 6);
    expect(jux.full).toBeCloseTo(2 / 6, 6);
    expect(jux.half).toBeCloseTo(1 / 6, 6);
    expect(jux.questions).toBe(2);
    expect(jux.band).toBe('weak');
    expect(jux.groups).toEqual({ weak: ['s1', 's2'], developing: [], secure: ['s3'] });
    expect(rows[2]!.band).toBe('thin');
  });
  it('counts spot targets of one question once', () => {
    const rows = byTag([e('s1', 'q9#0', ['tech:x'], 1), e('s1', 'q9#1', ['tech:x'], 1)], 'tech');
    expect(rows[0]!.questions).toBe(1);
  });
  it('defaultKind picks the most specific kind present', () => {
    expect(defaultKind(sample)).toBe('tech');
    expect(defaultKind([e('s1', 'q', ['out:X', 'skill:a.b'], 1)])).toBe('out');
    expect(defaultKind([])).toBe('out');
  });
});

describe('mixUps and confidence', () => {
  it('counts the same mistake across students', () => {
    const [top] = mixUps(sample, 'tech');
    expect(top).toMatchObject({ tag: 'tech:jux', key: 'named:tech:contrast', count: 2, students: ['s1', 's2'] });
  });
  it('quadrants count only sure (3) and unsure (1)', () => {
    const q = confidenceQuadrants(sample);
    expect(q).toMatchObject({ sureRight: 8, sureWrong: 4, unsureRight: 2, unsureWrong: 1, total: 15 });
    expect(q.sureWrongStudents).toEqual(['s1', 's2', 's3']);
  });
});

describe('flags', () => {
  it('sure-but-wrong, guessing, thin and outlier', () => {
    const flags = findFlags(sample, byTag(sample, 'tech'));
    const ids = flags.map((f) => f.id).sort();
    // Simile: only s3 was sure and wrong, so no sure-but-wrong flag there (needs 2).
    expect(ids).toEqual(['guessing:tech:jux', 'outlier:tech:simile', 'sure_wrong:tech:jux', 'thin:tech:motif'].sort());
    expect(flags.find((f) => f.id === 'outlier:tech:simile')!.students).toEqual(['s3']);
  });
  it('returns nothing for no evidence', () => {
    expect(findFlags([], [])).toEqual([]);
  });
});

describe('trend and compare', () => {
  it('trend gives each source a median of student means', () => {
    const points = trend(
      [e('s1', 'q', [], 0.2, null, [], 'quiz:a', '2026-10-01'), e('s2', 'q', [], 0.6, null, [], 'quiz:a', '2026-10-01'), e('s1', 'q', [], 0.8, null, [], 'quiz:b', '2026-10-09')],
      [{ source: 'quiz:b', title: 'B' }, { source: 'quiz:a', title: 'A' }]
    );
    expect(points.map((p) => p.title)).toEqual(['A', 'B']);
    expect(points[0]!.median).toBeCloseTo(0.4, 6);
    expect(points[1]!.n).toBe(1);
  });
  it('compare reports class change and band moves per tag', () => {
    const before = [e('s1', 'q', ['tech:x'], 0.2), e('s2', 'q', ['tech:x'], 0.9)];
    const after = [e('s1', 'q', ['tech:x'], 0.9), e('s2', 'q', ['tech:x'], 0.9)];
    const [row] = compare(before, after, 'tech');
    expect(row).toMatchObject({ tag: 'tech:x', up: 1, down: 0 });
    expect(row!.change).toBeCloseTo(0.35, 6);
    expect(studentBand(0.49)).toBe('weak');
  });
  it('counts a student who drops a band as down', () => {
    const [row] = compare([e('s1', 'q', ['tech:x'], 0.9)], [e('s1', 'q', ['tech:x'], 0.2)], 'tech');
    expect(row).toMatchObject({ up: 0, down: 1 });
  });
});

describe('focusFor', () => {
  it('weakest tags with enough items, plus pins, minus dismissals', () => {
    const ev = [
      ...[0, 0.2, 0.4].map((s, i) => e('s1', `a${i}`, ['tech:a'], s)),
      ...[0.5, 0.5, 0.5].map((s, i) => e('s1', `b${i}`, ['tech:b'], s)),
      ...[1, 1, 0.9].map((s, i) => e('s1', `c${i}`, ['tech:c'], s)),
      ...[0, 0].map((s, i) => e('s1', `d${i}`, ['tech:d'], s))
    ];
    const f = focusFor(ev, 's1', 'tech', { pinned: ['tech:c'], dismissed: ['tech:b'] });
    expect(f.focus.map((x) => x.tag)).toEqual(['tech:c', 'tech:a']);
    expect(f.focus[0]!.pinned).toBe(true);
    expect(f.secure.map((x) => x.tag)).toEqual(['tech:c']);
  });
  it('lists a duplicated pin once', () => {
    const ev = [0, 0.2, 0.4].map((s, i) => e('s1', `a${i}`, ['tech:a'], s));
    const f = focusFor(ev, 's1', 'tech', { pinned: ['tech:a', 'tech:a'], dismissed: [] });
    expect(f.focus.map((x) => x.tag)).toEqual(['tech:a']);
  });
});
