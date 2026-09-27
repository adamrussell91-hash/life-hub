import { describe, expect, it } from 'vitest';
import { threadsFor } from '@/components/miniworld/model';
import type { NetworkEcologyLink } from '@/domain/types';

function tie(a: string, b: string, extra: Partial<NetworkEcologyLink> = {}): NetworkEcologyLink {
  return {
    source_ref: a,
    target_ref: b,
    relationship_type: 'professional_relationship',
    role: 'colleague',
    valid_from: null,
    valid_to: null,
    status: 'current',
    ...extra
  };
}

const present = new Set(['shared:person:sam', 'shared:person:ollie', 'shared:person:lee']);

describe('threadsFor (Mycelium layer)', () => {
  it('gives one thread per person↔person tie between present people', () => {
    const threads = threadsFor(
      [tie('shared:person:sam', 'shared:person:ollie'), tie('shared:person:lee', 'shared:person:sam')],
      present
    );
    expect(threads).toHaveLength(2);
    expect(threads[0]).toEqual({ a: 'shared:person:ollie', b: 'shared:person:sam', role: 'colleague' });
  });

  it('collapses the same pair written both ways into one thread', () => {
    const threads = threadsFor(
      [tie('shared:person:sam', 'shared:person:ollie'), tie('shared:person:ollie', 'shared:person:sam')],
      present
    );
    expect(threads).toHaveLength(1);
  });

  it('ignores workplace links, self-links and people not on the map', () => {
    const threads = threadsFor(
      [
        tie('shared:person:sam', 'shared:organisation:school', { relationship_type: 'employee_at' }),
        tie('shared:person:sam', 'shared:person:sam'),
        tie('shared:person:sam', 'shared:person:absent')
      ],
      present
    );
    expect(threads).toEqual([]);
  });
});
