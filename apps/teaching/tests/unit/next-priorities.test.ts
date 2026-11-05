import { describe, expect, it } from 'vitest';
import { notYetOnMany, priorities, priorityMove, priorityNotes, studentCalls } from '@/evidence/priorities';
import type { Evidence } from '@/evidence/types';

const ev = (student: string, tag: string, share: number, item: string, source = 'quiz:l1', date = '2026-10-01', extra: string[] = []): Evidence => ({ item, tags: [tag, ...extra], share, why: [], student, source, date, confidence: null });
const two = (student: string, tag: string, share: number, source = 'quiz:l1', date = '2026-10-01', extra: string[] = []): Evidence[] => [ev(student, tag, share, 'q1', source, date, extra), ev(student, tag, share, 'q2', source, date, extra)];
const sources = [{ source: 'quiz:l1', title: 'First' }, { source: 'quiz:l2', title: 'Second' }] as never[];
const opts = { today: '2026-11-05' };
const noPins = () => ({ pinned: [], dismissed: [] });
const label = (t: string) => t.replace('fam:', '');

const wide = ['a', 'b', 'c', 'd'].flatMap((s) => two(s, 'fam:structural', 0.2));
const narrow = [...two('a', 'fam:sound', 0.2), ...['b', 'c', 'd'].flatMap((s) => two(s, 'fam:sound', 0.9))];

describe('priorities', () => {
  it('ranks what most of the class is behind on first', () => {
    const list = priorities([...narrow, ...wide], sources, 'fam', opts);
    expect(list.map((p) => p.tag)).toEqual(['fam:structural', 'fam:sound']);
    expect(list[0]!.wholeClass).toBe(true);
    expect(list[1]!.wholeClass).toBe(false);
  });

  it('shows at most three', () => {
    const many = ['w', 'x', 'y', 'z'].flatMap((t) => ['a', 'b', 'c'].flatMap((s) => two(s, `fam:${t}`, 0.2)));
    expect(priorities(many, sources, 'fam', opts)).toHaveLength(3);
  });

  it('skips a tag on one question, and one everyone is secure on', () => {
    const one = ['a', 'b', 'c'].map((s) => ev(s, 'fam:one', 0, 'q1'));
    const fine = ['a', 'b', 'c'].flatMap((s) => two(s, 'fam:fine', 1));
    expect(priorities([...one, ...fine], sources, 'fam', opts)).toEqual([]);
  });

  it('lifts a tag whose dot point comes up soon, and says so', () => {
    const soon = ['a', 'b', 'c', 'd'].flatMap((s) => two(s, 'fam:soon', 0.6, 'quiz:l1', '2026-10-01', ['dp:x']));
    const upcoming = [{ id: 'l9', title: 'Next poem', date: '2026-11-06', assessment: false }];
    const plain = priorities([...wide, ...soon], sources, 'fam', opts);
    expect(plain[0]!.tag).toBe('fam:structural');
    const lifted = priorities([...narrow, ...soon], sources, 'fam', { ...opts, upcoming, lessonPoints: new Map([['l9', ['dp:x']]]) });
    expect(lifted[0]!.tag).toBe('fam:soon');
    expect(priorityNotes(lifted[0]!, (d) => d)).toContain('Comes up in Next poem, 2026-11-06');
    expect(priorityNotes(lifted[0]!, (d) => d, upcoming[0])).toEqual([]);
  });

  it('ignores a lesson past or too far off', () => {
    const soon = ['a', 'b', 'c'].flatMap((s) => two(s, 'fam:soon', 0.6, 'quiz:l1', '2026-10-01', ['dp:x']));
    const upcoming = [{ id: 'old', title: 'Old', date: '2026-11-01', assessment: false }, { id: 'far', title: 'Far', date: '2027-01-01', assessment: false }];
    const [p] = priorities(soon, sources, 'fam', { ...opts, upcoming, lessonPoints: new Map([['old', ['dp:x']], ['far', ['dp:x']]]) });
    expect(p!.next).toBeNull();
  });

  it('says what to do: thin evidence is checked first, then the class or a small group', () => {
    const falling = ['a', 'b', 'c'].flatMap((s) => [...two(s, 'fam:f', 0.9, 'quiz:l1', '2026-10-01'), ...two(s, 'fam:f', 0.3, 'quiz:l2', '2026-10-20')]);
    const [p] = priorities(falling, sources, 'fam', opts);
    expect(priorityNotes(p!, (d) => d).join(' ')).toContain('Down 60 points');
    expect(priorityMove(p!)).toEqual({ kind: 'check', text: 'Check first: only 2 questions so far' });
    const deep = { ...p!, few: false };
    expect(priorityMove({ ...deep, wholeClass: true }).kind).toBe('reteach');
    expect(priorityMove({ ...deep, wholeClass: false, weak: ['a'], developing: ['b'], secure: [] }).kind).toBe('reteach');
    expect(priorityMove({ ...deep, wholeClass: false, weak: ['a'], developing: ['b'], secure: ['c'] }).text).toBe('Teach on, pull a small group');
    expect(priorityMove({ ...deep, wholeClass: false, weak: [], developing: ['b'], secure: ['c'] }).kind).toBe('revisit');
  });

  it('keeps each band of students as its own group', () => {
    const mixed = [...two('a', 'fam:m', 0.2), ...two('b', 'fam:m', 0.6), ...two('c', 'fam:m', 1)];
    const [p] = priorities(mixed, sources, 'fam', opts);
    expect([p!.weak, p!.developing, p!.secure]).toEqual([['a'], ['b'], ['c']]);
  });

  it('finds students Not yet on two or more, and the priority most of them share', () => {
    const base = { mean: 0.5, wholeClass: false, developing: [], secure: [], belowSecure: 0, assessed: 3, questions: 5, change: null, next: null, few: false };
    const list = [{ ...base, tag: 'x', weak: ['a'] }, { ...base, tag: 'y', weak: ['a', 'b', 'c'] }, { ...base, tag: 'z', weak: ['b'] }];
    expect(notYetOnMany(list)).toEqual({ students: ['a', 'b'], tags: ['x', 'y', 'z'], first: 'y' });
    expect(notYetOnMany([list[0]!, list[2]!])).toBeNull();
  });
});

describe('student calls', () => {
  it('puts a low student in support with their weakest tags, and a high one in extend on their strongest', () => {
    const marks = [...two('low', 'fam:d', 0), ...two('low', 'fam:s', 0.3), ...two('low', 'fam:c', 0.5), ...two('top', 'fam:d', 1), ...two('top', 'fam:s', 0.8), ...two('mid', 'fam:d', 0.7)];
    const { support, extend } = studentCalls(marks, sources, ['low', 'top', 'mid'], 'fam', noPins, label);
    expect(support.map((c) => c.student)).toEqual(['low']);
    expect(support[0]!.tags.map((t) => t.tag)).toEqual(['fam:d', 'fam:s']);
    expect(support[0]!.why).toContain('d 0% on 2 questions.');
    expect(extend.map((c) => c.student)).toEqual(['top']);
    expect(extend[0]!.tags[0]!.tag).toBe('fam:d');
  });

  it('flags a real fall even with a fair average, and never lists a student twice', () => {
    const marks = [...two('slip', 'fam:d', 1, 'quiz:l1', '2026-10-01'), ...two('slip', 'fam:s', 0.4, 'quiz:l2', '2026-10-20')];
    const { support, extend } = studentCalls(marks, sources, ['slip'], 'fam', noPins, label);
    expect(support[0]!.why).toContain('down 60 points since their first');
    expect(extend).toEqual([]);
  });

  it('leaves out students with no marks and a high average with nothing secure', () => {
    const marks = two('steady', 'fam:d', 0.78);
    const { support, extend } = studentCalls(marks, sources, ['steady', 'none'], 'fam', noPins, label);
    expect(support).toEqual([]);
    expect(extend).toEqual([]);
  });
});
