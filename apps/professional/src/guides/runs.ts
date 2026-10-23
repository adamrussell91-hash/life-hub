import type { MeetingRecord } from '@/domain/types';
import { nameKey } from '@/lib/room';
import { guideById } from './registry';
import type { GuideRun, Values } from './types';

export type PlacedRun = { run: GuideRun; meetingId: string; meetingTitle: string };

const newest = (a: { run: GuideRun }, b: { run: GuideRun }) => Date.parse(b.run.created_at) - Date.parse(a.run.created_at);

export function newRun(input: { guide: string; personRef: string; personName: string; context: string; now: string; id: string }): GuideRun {
  return {
    id: input.id,
    guide: input.guide,
    person_ref: input.personRef,
    person_name: input.personName,
    context: input.context.trim(),
    taps: {},
    quotes: [],
    checks: {},
    values: {},
    profile: '',
    moves: [],
    created_at: input.now,
    updated_at: input.now
  };
}

export function sameContext(a: string, b: string): boolean {
  return nameKey(a) === nameKey(b);
}

/** Every run on every meeting, newest first. */
export function placeRuns(meetings: MeetingRecord[]): PlacedRun[] {
  return meetings
    .flatMap((meeting) => (meeting.guide_runs ?? []).map((run) => ({ run, meetingId: meeting.id, meetingTitle: meeting.title })))
    .sort(newest);
}

/** Runs about one person: by ref, or by name (an imported student's Blob copy has its own ref). */
export function runsFor(placed: PlacedRun[], ref: string, name: string | null): PlacedRun[] {
  const key = name ? nameKey(name) : '';
  return placed.filter(({ run }) => run.person_ref === ref || (key !== '' && nameKey(run.person_name) === key));
}

/** Earlier runs of the same guide and context, newest first: what the card overlays. */
export function historyFor(placed: PlacedRun[], run: GuideRun, count = 2): Array<{ at: string; values: Values }> {
  const at = Date.parse(run.created_at);
  return runsFor(placed, run.person_ref, run.person_name)
    .filter(({ run: other }) => other.id !== run.id && other.guide === run.guide && sameContext(other.context, run.context) && Date.parse(other.created_at) < at)
    .slice(0, count)
    .map(({ run: other }) => ({ at: other.created_at, values: other.values }));
}

export function recentContexts(placed: PlacedRun[], count = 5): string[] {
  const out: string[] = [];
  for (const { run } of [...placed].sort(newest)) {
    if (!out.some((context) => sameContext(context, run.context))) out.push(run.context);
    if (out.length === count) break;
  }
  return out;
}

export function noteLine(run: GuideRun): string {
  return `${guideById(run.guide)?.name ?? 'Guide'} guide · ${run.context} · see card`;
}

/** What Clare may see: who, which guide, the context and the moves. Never the profile or values. */
export function guideDigest(runs: GuideRun[]): Array<{ about: string; guide: string; context: string; moves: string[] }> {
  return runs.map((run) => ({ about: run.person_name, guide: guideById(run.guide)?.name ?? 'Guide', context: run.context, moves: run.moves }));
}
