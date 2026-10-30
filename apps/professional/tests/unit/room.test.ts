import { describe, expect, it } from 'vitest';
import { groupRoom } from '@/lib/room';

const row = (ref: string, name: string, org: string | null, warmth: 'warm' | 'cooling' | 'cold', created = '2025-01-01T00:00:00.000Z') => ({
  ref, display_name: name, initials: name.slice(0, 2).toUpperCase(),
  organisation: org ? { ref: `shared:organisation:${org}`, display_name: org, monogram: org[0]!, logo_key: null, current: true } : null,
  warmth_band: warmth, created_at: created
});

describe('groupRoom', () => {
  const directory = [
    row('shared:person:rachel', 'Rachel Ford', 'HALT NSW', 'warm'),
    row('shared:person:ben', 'Ben C.', 'HALT NSW', 'cooling'),
    row('shared:person:jo', 'Jo T.', 'Barker College', 'cold'),
    row('shared:person:sam', 'Sam O.', null, 'cold', '2026-09-20T00:00:00.000Z')
  ];
  const attendees = [
    { ref: 'shared:person:ben', role: 'treasurer' },
    { ref: 'shared:person:rachel', role: 'chair' },
    { ref: 'shared:person:jo', role: null },
    { ref: 'shared:person:sam', role: null }
  ];

  it('clusters by organisation, biggest first; no organisation goes last', () => {
    const room = groupRoom(attendees, directory, new Date('2026-09-24T08:00:00.000Z'));
    expect(room.map((cluster) => [cluster.organisation, cluster.people.map((person) => person.name)])).toEqual([
      ['HALT NSW', ['Rachel Ford', 'Ben C.']],
      ['Barker College', ['Jo T.']],
      [null, ['Sam O.']]
    ]);
  });

  it('warmth becomes 3/2/1 dots; people added in the last 14 days are new', () => {
    const room = groupRoom(attendees, directory, new Date('2026-09-24T08:00:00.000Z'));
    const people = room.flatMap((cluster) => cluster.people);
    expect(people.find((person) => person.name === 'Rachel Ford')!.warmthDots).toBe(3);
    expect(people.find((person) => person.name === 'Ben C.')!.warmthDots).toBe(2);
    expect(people.find((person) => person.name === 'Jo T.')!.warmthDots).toBe(1);
    expect(people.find((person) => person.name === 'Sam O.')!.isNew).toBe(true);
    expect(people.find((person) => person.name === 'Rachel Ford')!.role).toBe('chair');
  });

  it('keeps the name on the link when the directory does not know the ref, and never calls them new', () => {
    const room = groupRoom([{ ref: 'shared:person:blob-copy', role: null, name: 'Mia Chen' }], directory, new Date('2026-09-24T08:00:00.000Z'));
    const person = room[0]!.people[0]!;
    expect(person.name).toBe('Mia Chen');
    expect(person.initials).toBe('MC');
    expect(person.isNew).toBe(false);
    expect(person.known).toBe(false);
  });

  it('matches a duplicate copy to its directory row by name when exactly one row has it', () => {
    const students = [...directory, row('shared:person:student-rohan', 'Rohan Examplar', null, 'warm')];
    const room = groupRoom([{ ref: 'shared:person:blob-twin', role: null, name: 'Rohan Examplar' }], students, new Date('2026-09-24T08:00:00.000Z'));
    expect(room[0]!.people[0]).toMatchObject({ name: 'Rohan Examplar', warmthDots: 3, known: true });
  });

  it('marks students so the room can colour their initials apart from colleagues', () => {
    const withStudent = [...directory, { ...row('shared:person:student-rohan', 'Rohan Examplar', null, 'warm'), person_type: 'student' as const }];
    const room = groupRoom(
      [
        { ref: 'shared:person:student-rohan', role: null },
        { ref: directory[0]!.ref, role: null }
      ],
      withStudent,
      new Date('2026-09-24T08:00:00.000Z')
    );
    const people = room.flatMap((cluster) => cluster.people);
    expect(people.find((p) => p.ref === 'shared:person:student-rohan')?.student).toBe(true);
    expect(people.find((p) => p.ref === directory[0]!.ref)?.student).toBe(false);
  });

  it('puts someone with several jobs under the organisation others in the room share', () => {
    const halt = { ref: 'shared:organisation:HALT NSW', display_name: 'HALT NSW', monogram: 'H', logo_key: null, current: true };
    const club = { ref: 'shared:organisation:Greyhounds', display_name: 'Greyhounds', monogram: 'G', logo_key: null, current: true };
    const twoJobs = { ...row('shared:person:bea', 'Bea D.', null, 'warm'), organisation: club, organisations: [club, halt] };
    const people = [...directory, twoJobs];
    const room = groupRoom([{ ref: 'shared:person:bea', role: null }, { ref: 'shared:person:rachel', role: 'chair' }], people, new Date('2026-09-24T08:00:00.000Z'));
    expect(room.map((cluster) => cluster.organisation)).toEqual(['HALT NSW']);
    const bea = room[0]!.people.find((person) => person.name === 'Bea D.')!;
    expect(bea.organisationRef).toBe(halt.ref);
    expect(bea.organisationChoices.map((org) => org.display_name)).toEqual(['Greyhounds', 'HALT NSW']);

    const alone = groupRoom([{ ref: 'shared:person:bea', role: null }], people, new Date('2026-09-24T08:00:00.000Z'));
    expect(alone[0]!.organisation).toBe('Greyhounds');

    const picked = groupRoom(
      [{ ref: 'shared:person:bea', role: null, organisationRef: club.ref }, { ref: 'shared:person:rachel', role: 'chair' }],
      people,
      new Date('2026-09-24T08:00:00.000Z')
    );
    expect(picked.map((cluster) => cluster.organisation).sort()).toEqual(['Greyhounds', 'HALT NSW']);
  });

  it('never lists you, by ref or by a copy with your name, yet your workplace still pulls a two-job colleague', () => {
    const halt = { ref: 'shared:organisation:HALT NSW', display_name: 'HALT NSW', monogram: 'H', logo_key: null, current: true };
    const club = { ref: 'shared:organisation:Greyhounds', display_name: 'Greyhounds', monogram: 'G', logo_key: null, current: true };
    const twoJobs = { ...row('shared:person:bea', 'Bea D.', null, 'warm'), organisation: club, organisations: [club, halt] };
    const me = { ...row('shared:person:me', 'Sam Writer', null, 'warm'), organisation: halt, is_self: true };
    const room = groupRoom(
      [{ ref: 'shared:person:bea', role: null }, { ref: 'shared:person:me', role: 'chair' }, { ref: 'shared:person:me-copy', role: null, name: 'Sam Writer' }],
      [...directory, twoJobs],
      new Date('2026-09-24T08:00:00.000Z'),
      me
    );
    const names = room.flatMap((cluster) => cluster.people.map((person) => person.name));
    expect(names).toEqual(['Bea D.']);
    expect(room[0]!.organisation).toBe('HALT NSW');
  });
});
