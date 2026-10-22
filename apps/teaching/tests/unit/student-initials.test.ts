import { describe, expect, it } from 'vitest';
import { assignInitials, deriveInitials, initialsProblems, normaliseInitials, studentIdFor } from '@/schemas/student-initials';
import { ClassStudentSchema } from '@/schemas';

describe('student initials', () => {
  it('normalises what a student types', () => {
    expect(normaliseInitials(' b.b ')).toBe('BB');
    expect(normaliseInitials('bb2')).toBe('BB2');
    expect(normaliseInitials('')).toBe('');
  });

  it('derives initials from a name, up to four letters', () => {
    expect(deriveInitials('Bob Brown')).toBe('BB');
    expect(deriveInitials('Mary-Jane Ann Smith Lee')).toBe('MJAS');
    expect(deriveInitials('Ava')).toBe('A');
    expect(deriveInitials('  ')).toBe('S');
    expect(deriveInitials('Émile Zoë')).toBe('EZ');
    expect(normaliseInitials('É')).toBe('E');
  });

  it('gives a stable id from the name when one is missing', () => {
    expect(studentIdFor('Bob Brown')).toBe(studentIdFor(' bob brown '));
    expect(studentIdFor('Bob Brown')).not.toBe(studentIdFor('Tom Tills'));
    expect(studentIdFor('Bob Brown')).toMatch(/^st_[a-z0-9]+$/);
  });

  it('fills in ids and initials, numbering a clash and keeping set values', () => {
    const out = assignInitials([
      { name: 'Bob Brown', skip_picker: false },
      { name: 'Ben Bates', skip_picker: false },
      { name: 'Tom Tills', skip_picker: true, id: 'st_keep', initials: 'TOM' }
    ]);
    expect(out.map((s) => s.initials)).toEqual(['BB', 'BB2', 'TOM']);
    expect(out[2]).toEqual({ name: 'Tom Tills', skip_picker: true, id: 'st_keep', initials: 'TOM' });
    expect(new Set(out.map((s) => s.id)).size).toBe(3);
  });

  it('never hands a derived set of initials to someone when a later student already holds it', () => {
    const out = assignInitials([
      { name: 'Bob Brown', skip_picker: false },
      { name: 'Ben Bates', skip_picker: false, initials: 'BB' }
    ]);
    expect(out.map((s) => s.initials)).toEqual(['BB2', 'BB']);
  });

  it('renumbers a duplicate that was typed in, and is stable when run twice', () => {
    const once = assignInitials([
      { name: 'Bob Brown', skip_picker: false, initials: 'BB' },
      { name: 'Ben Bates', skip_picker: false, initials: 'BB' }
    ]);
    expect(once.map((s) => s.initials)).toEqual(['BB', 'BB2']);
    expect(assignInitials(once)).toEqual(once);
  });

  it('never takes a saved id from its owner', () => {
    const out = assignInitials([{ name: 'Bob' }, { name: 'Robert', id: studentIdFor('Bob') }]);
    expect(out[1]!.id).toBe(studentIdFor('Bob'));
    expect(out[0]!.id).not.toBe(out[1]!.id);
  });

  it('gives a repeated explicit id to the first holder only, and stays stable', () => {
    const once = assignInitials([
      { name: 'Bob Brown', id: 'st_same' },
      { name: 'Ben Bates', id: 'st_same' },
      { name: 'Tom Tills' }
    ]);
    expect(once[0]!.id).toBe('st_same');
    expect(new Set(once.map((s) => s.id)).size).toBe(3);
    expect(assignInitials(once)).toEqual(once);
  });

  it('lists problems beside each student', () => {
    const problems = initialsProblems([
      { name: 'Bob Brown', initials: 'BB' },
      { name: 'Ben Bates', initials: 'bb' },
      { name: 'Tom Tills', initials: 'T1T' }
    ]);
    expect(problems.get(0)).toBeUndefined();
    expect(problems.get(1)).toBe('BB is already used by Bob Brown.');
    expect(problems.get(2)).toBe('Use 1–4 letters, then a number if needed, like BB or BB2.');
  });

  it('the class list schema accepts the new fields and refuses bad initials', () => {
    expect(ClassStudentSchema.parse({ name: 'Bob Brown', id: 'st_abc', initials: 'BB2' }).initials).toBe('BB2');
    expect(ClassStudentSchema.safeParse({ name: 'Bob Brown', initials: 'bb' }).success).toBe(false);
    expect(ClassStudentSchema.parse({ name: 'Bob Brown' }).id).toBeUndefined();
  });
});
