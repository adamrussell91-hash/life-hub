import { describe, expect, it } from 'vitest';
import { pickThreadForComm, type ThreadCandidate } from '@/lib/thread-match';

const at = '2026-10-14T00:50:00.000Z';
const cand = (over: Partial<ThreadCandidate>): ThreadCandidate => ({
  id: 'thread_a',
  status: 'open',
  purpose_tag: 'feedback',
  personRefs: ['shared:person:declan'],
  lastAt: '2026-09-25T02:00:00.000Z',
  ...over
});

describe('pickThreadForComm', () => {
  it('joins the one open thread with the same purpose, a shared person, active in 90 days', () => {
    expect(
      pickThreadForComm({ personRefs: ['shared:person:declan'], purposeTag: 'feedback', at }, [cand({})])
    ).toEqual({ join: 'thread_a', candidates: ['thread_a'] });
  });
  it('proposes instead of joining when two threads match', () => {
    const result = pickThreadForComm(
      { personRefs: ['shared:person:declan'], purposeTag: 'feedback', at },
      [cand({}), cand({ id: 'thread_b' })]
    );
    expect(result).toEqual({ join: null, candidates: ['thread_a', 'thread_b'] });
  });
  it('skips closed, other-purpose, stranger and stale threads', () => {
    const threads = [
      cand({ id: 'closed', status: 'closed' }),
      cand({ id: 'other', purpose_tag: 'case management' }),
      cand({ id: 'stranger', personRefs: ['shared:person:amy'] }),
      cand({ id: 'stale', lastAt: '2026-06-01T00:00:00.000Z' })
    ];
    expect(
      pickThreadForComm({ personRefs: ['shared:person:declan'], purposeTag: 'feedback', at }, threads)
    ).toEqual({ join: null, candidates: [] });
  });
  it('no purpose tag means no auto-join', () => {
    expect(
      pickThreadForComm({ personRefs: ['shared:person:declan'], purposeTag: null, at }, [cand({})]).join
    ).toBeNull();
  });
});
