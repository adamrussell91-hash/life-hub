import { describe, expect, it } from 'vitest';
import { GUIDES, guideById } from '@/guides/registry';
import { guideDigest, historyFor, newRun, noteLine, placeRuns, recentContexts, runsFor } from '@/guides/runs';
import type { GuideRun } from '@/guides/types';
import type { MeetingRecord } from '@/domain/types';

const run = (over: Partial<GuideRun>): GuideRun => ({
  id: 'g1', guide: 'motivation_sdt', person_ref: 'shared:person:p_jonah', person_name: 'Jonah Pereira', context: 'English · essays',
  taps: {}, quotes: [], checks: {}, values: { introjected: 7 }, profile: 'control', moves: ['Offer a choice of how, or in what order, to do it.'],
  created_at: '2026-10-27T01:00:00.000Z', updated_at: '2026-10-27T01:00:00.000Z', ...over
});
const meeting = (id: string, title: string, runs: GuideRun[]) => ({ id, title, guide_runs: runs }) as unknown as MeetingRecord;

describe('guide runs', () => {
  it('the shelf starts with the motivation guide', () => {
    expect(GUIDES.map((g) => g.id)).toEqual(['motivation_sdt']);
    expect(guideById('motivation_sdt')?.name).toBe('Motivation');
    expect(guideById('nope')).toBeNull();
  });

  it('newRun starts empty for one person and context', () => {
    const r = newRun({ guide: 'motivation_sdt', personRef: 'shared:person:p_sam', personName: 'Sam Lee', context: ' Maths ', now: '2026-10-27T00:00:00.000Z', id: 'g9' });
    expect(r).toMatchObject({ id: 'g9', context: 'Maths', taps: {}, values: {}, quotes: [], created_at: '2026-10-27T00:00:00.000Z' });
  });

  it('places runs on their meetings and finds a person by ref or by name', () => {
    const placed = placeRuns([
      meeting('m1', 'Check-in', [run({ id: 'a' })]),
      meeting('m2', 'Debate catch-up', [run({ id: 'b', person_ref: 'shared:person:blob-copy', context: 'Debating', created_at: '2026-08-12T00:00:00.000Z' })]),
      meeting('m3', 'Other', [run({ id: 'c', person_ref: 'shared:person:p_sam', person_name: 'Sam Lee' })])
    ]);
    const mine = runsFor(placed, 'shared:person:p_jonah', 'Jonah Pereira');
    expect(mine.map((p) => [p.run.id, p.meetingId])).toEqual([['a', 'm1'], ['b', 'm2']]);
  });

  it('history: same guide and context, older than this run, newest first, two at most', () => {
    const placed = placeRuns([meeting('m', 'x', [
      run({ id: 'now', created_at: '2026-10-27T00:00:00.000Z' }),
      run({ id: 'aug', created_at: '2026-08-04T00:00:00.000Z', values: { introjected: 6 } }),
      run({ id: 'jun', created_at: '2026-06-01T00:00:00.000Z' }),
      run({ id: 'may', created_at: '2026-05-01T00:00:00.000Z' }),
      run({ id: 'other', context: 'maths', created_at: '2026-09-01T00:00:00.000Z' })
    ])]);
    const current = placed[0]!.run;
    expect(historyFor(placed, current).map((h) => h.at)).toEqual(['2026-08-04T00:00:00.000Z', '2026-06-01T00:00:00.000Z']);
    expect(historyFor(placed, run({ id: 'x', context: 'ENGLISH · ESSAYS', created_at: '2026-12-01T00:00:00.000Z' }))[0]!.values).toEqual({ introjected: 7 });
  });

  it('recent contexts: unique, newest first, five at most', () => {
    const placed = placeRuns([meeting('m', 'x', [
      run({ id: '1', context: 'English', created_at: '2026-10-01T00:00:00.000Z' }),
      run({ id: '2', context: 'english', created_at: '2026-09-01T00:00:00.000Z' }),
      run({ id: '3', context: 'Maths', created_at: '2026-10-05T00:00:00.000Z' })
    ])]);
    expect(recentContexts(placed)).toEqual(['Maths', 'English']);
  });

  it('note line and Clare digest carry context and moves, never the profile or values', () => {
    const r = run({});
    expect(noteLine(r)).toBe('Motivation guide · English · essays · see card');
    const digest = guideDigest([r]);
    expect(digest).toEqual([{ about: 'Jonah Pereira', guide: 'Motivation', context: 'English · essays', moves: r.moves }]);
    expect(JSON.stringify(digest)).not.toMatch(/control|introjected|7/);
  });
});
