import { describe, expect, it, vi } from 'vitest';
import type { ClassStudent } from '@/schemas';
import { ClassSchema, type Class } from '@/schemas';
import { parseStudentList } from '@/blocks/classroom-tools/logic';
import { mountClassStudents } from '@/teacher/sections/class-students';
import { assignInitials } from '@/schemas/student-initials';

function classRecord(id: string, code: string, students: Array<{ name: string; skip_picker?: boolean }>): Class {
  return ClassSchema.parse({
    id,
    type: 'class',
    title: code,
    slug: code.toLowerCase(),
    schema_version: 1,
    code,
    academic_year: 2026,
    year_id: 'year_9',
    subject_id: 'english',
    active_unit_ids: [],
    status: 'active',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    students
  });
}

const fakeClaims = (initial: Record<string, string> = {}) => {
  let claims = { ...initial };
  return {
    list: vi.fn(async () => claims),
    release: vi.fn(async (_c: string, id: string) => {
      const { [id]: _gone, ...rest } = claims;
      claims = rest;
      return claims;
    })
  };
};

describe('class list initials', () => {
  it('parseStudentList keeps a student\u2019s id and initials when the list is pasted again', () => {
    const before = assignInitials([{ name: 'Bob Brown', skip_picker: false, initials: 'BOB' }]);
    const after = parseStudentList('Bob Brown\nTom Tills', before);
    expect(after[0]).toEqual(before[0]);
    expect(after[1]).toEqual({ name: 'Tom Tills', skip_picker: false });
  });

  it('shows initials, saves an edit, and refuses a duplicate', async () => {
    const cls = classRecord('c1', '9ENG2', [{ name: 'Bob Brown' }, { name: 'Tom Tills' }]);
    const save = vi.fn(async (_id: string, _s: ClassStudent[]) => undefined);
    const host = document.createElement('div');
    mountClassStudents(host, cls, { save, claims: fakeClaims() });
    const inputs = () => [...host.querySelectorAll<HTMLInputElement>('.class-students__initials')];
    expect(inputs().map((i) => i.value)).toEqual(['BB', 'TT']);

    inputs()[1]!.value = 'bb';
    inputs()[1]!.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(host.querySelector('.class-students__status')?.textContent).toBe('BB is already used by Bob Brown.'));
    expect(save).not.toHaveBeenCalled();
    expect(inputs()[1]!.value).toBe('TT');

    inputs()[1]!.value = 'tom';
    inputs()[1]!.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0]![1][1]).toMatchObject({ name: 'Tom Tills', initials: 'TOM' });
  });

  it('shows who has claimed their initials and releases a claim', async () => {
    const cls = classRecord('c1', '9ENG2', [{ name: 'Bob Brown' }, { name: 'Tom Tills' }]);
    const [bob] = assignInitials(cls.students ?? []);
    const claims = fakeClaims({ [bob!.id]: '2026-10-22T01:00:00.000Z' });
    const host = document.createElement('div');
    mountClassStudents(host, cls, { save: async () => undefined, claims });
    await vi.waitFor(() => expect(host.querySelectorAll('.class-students__claim.is-claimed').length).toBe(1));
    host.querySelector<HTMLButtonElement>('.class-students__release')!.click();
    await vi.waitFor(() => expect(claims.release).toHaveBeenCalledWith('c1', bob!.id));
    await vi.waitFor(() => expect(host.querySelectorAll('.class-students__claim.is-claimed').length).toBe(0));
    expect(host.querySelector('.class-students__status')?.textContent).toBe('BB can be claimed again.');
  });
});
