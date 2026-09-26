import { describe, expect, it } from 'vitest';
import { groupRoom } from '@/lib/room';

const row = (ref: string, name: string, org: string | null, warmth: 'warm' | 'cooling' | 'cold', created = '2025-01-01T00:00:00.000Z') => ({
  ref, display_name: name, initials: name.slice(0, 2).toUpperCase(),
  organisation: org ? { ref: `shared:organisation:${org}`, display_name: org, monogram: org[0]!, logo_key: null, current: true } : null,
  warmth_band: warmth, created_at: created
});

describe('groupRoom', () => {
  const directory = [
    row('shared:person:vicki', 'Vicki Sheehan', 'HALT NSW', 'warm'),
    row('shared:person:greg', 'Greg R.', 'HALT NSW', 'cooling'),
    row('shared:person:jo', 'Jo T.', 'Barker College', 'cold'),
    row('shared:person:sam', 'Sam O.', null, 'cold', '2026-09-20T00:00:00.000Z')
  ];
  const attendees = [
    { ref: 'shared:person:greg', role: 'treasurer' },
    { ref: 'shared:person:vicki', role: 'chair' },
    { ref: 'shared:person:jo', role: null },
    { ref: 'shared:person:sam', role: null }
  ];

  it('clusters by organisation, biggest first; no organisation goes last', () => {
    const room = groupRoom(attendees, directory, new Date('2026-09-24T08:00:00.000Z'));
    expect(room.map((cluster) => [cluster.organisation, cluster.people.map((person) => person.name)])).toEqual([
      ['HALT NSW', ['Vicki Sheehan', 'Greg R.']],
      ['Barker College', ['Jo T.']],
      [null, ['Sam O.']]
    ]);
  });

  it('warmth becomes 3/2/1 dots; people added in the last 14 days are new', () => {
    const room = groupRoom(attendees, directory, new Date('2026-09-24T08:00:00.000Z'));
    const people = room.flatMap((cluster) => cluster.people);
    expect(people.find((person) => person.name === 'Vicki Sheehan')!.warmthDots).toBe(3);
    expect(people.find((person) => person.name === 'Greg R.')!.warmthDots).toBe(2);
    expect(people.find((person) => person.name === 'Jo T.')!.warmthDots).toBe(1);
    expect(people.find((person) => person.name === 'Sam O.')!.isNew).toBe(true);
    expect(people.find((person) => person.name === 'Vicki Sheehan')!.role).toBe('chair');
  });
});
