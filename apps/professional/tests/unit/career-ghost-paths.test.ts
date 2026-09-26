import { describe, expect, it } from 'vitest';
import {
  normalizeRoleText,
  roleMatchesFuture,
  selectGhostPaths
} from '@/domain/career-ghost-paths';

describe('career-ghost-paths', () => {
  it('normalises & and punctuation', () => {
    expect(normalizeRoleText('Head of Teaching & Learning')).toBe('head of teaching and learning');
  });

  it('matches aliases case-insensitively', () => {
    expect(
      roleMatchesFuture('Deputy Principal', {
        title: 'Deputy Principal',
        aliases: ['DP']
      })
    ).toBe(true);
    expect(
      roleMatchesFuture('dp', {
        title: 'Deputy Principal',
        aliases: ['DP']
      })
    ).toBe(true);
  });

  it('selects at most three people', () => {
    const people = [1, 2, 3, 4].map((n) => ({
      id: `p${n}`,
      display_name: `Person ${n}`,
      current_role: 'Head of Gifted Education'
    }));
    const hits = selectGhostPaths(people, { title: 'Head of Gifted Education', aliases: [] });
    expect(hits).toHaveLength(3);
  });
});
