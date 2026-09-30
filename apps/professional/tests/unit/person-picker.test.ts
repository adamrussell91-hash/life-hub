import { describe, expect, it } from 'vitest';
import { labelPeopleHits } from '@/lib/person-picker';
import type { DirectoryPersonRow } from '@/api/people-directory';

function person(ref: string, name: string, extra: Partial<DirectoryPersonRow> = {}): DirectoryPersonRow {
  return {
    id: ref.split(':').pop()!,
    ref,
    display_name: name,
    initials: '',
    role_line: '',
    relationship_roles: [],
    organisation: null,
    organisations: [],
    warmth: 0,
    warmth_band: 'cold',
    relationship_state: '',
    relationship_reasons: [],
    open_item_count: 0,
    you_owe_count: 0,
    they_owe_count: 0,
    next_label: null,
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
    ...extra
  };
}

const hit = (ref: string, display_label: string) => ({ ref, display_label, supporting_label: null, href: null });

describe('labelPeopleHits', () => {
  it('collapses copies of one person and says who each remaining row is', () => {
    const directory = [person('shared:person:student-rohan-a', 'Rohan Arianayagam', { person_type: 'student' })];
    const rows = labelPeopleHits(
      [hit('shared:person:blob-1', 'Rohan'), hit('shared:person:blob-2', 'Rohan'), hit('shared:person:blob-3', 'Rohan Arianayagam'), hit('shared:person:blob-4', 'Rohan Arianayagam')],
      directory
    );
    expect(rows.map((row) => [row.display_label, row.supporting_label])).toEqual([
      ['Rohan', 'Not in People yet'],
      ['Rohan Arianayagam', 'Student']
    ]);
  });

  it('keeps two different people who share a name, labelled by workplace', () => {
    const org = (name: string) => ({ ref: `shared:organisation:${name}`, display_name: name, monogram: name[0]!, logo_key: null, current: true });
    const directory = [
      person('shared:person:sam-1', 'Sam Lee', { organisation: org('Barker College'), job_title: 'Head of English' }),
      person('shared:person:sam-2', 'Sam Lee', { organisation: org('HALT NSW') })
    ];
    const rows = labelPeopleHits([hit('shared:person:sam-1', 'Sam Lee'), hit('shared:person:sam-2', 'Sam Lee')], directory);
    expect(rows.map((row) => row.supporting_label)).toEqual(['Head of English · Barker College', 'HALT NSW']);
  });

  it('prefers the ref the directory knows when collapsing copies', () => {
    const directory = [person('shared:person:real', 'Jo Tan')];
    const rows = labelPeopleHits([hit('shared:person:copy', 'Jo Tan'), hit('shared:person:real', 'Jo Tan')], directory);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.ref).toBe('shared:person:real');
  });
});
