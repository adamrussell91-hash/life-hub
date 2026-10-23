import { meetingRoute } from '@/app/router';
import type { TimelinePoint } from '@/domain/person-timeline';
import { shortDate } from '@/guides/continuum-chart';
import { guideById } from '@/guides/registry';
import { sameContext, type PlacedRun } from '@/guides/runs';

/** Newest run per context (input newest first or not), with how many runs that context has. */
export function latestPerContext(placed: PlacedRun[]): Array<{ latest: PlacedRun; count: number }> {
  const sorted = [...placed].sort((a, b) => Date.parse(b.run.created_at) - Date.parse(a.run.created_at));
  const out: Array<{ latest: PlacedRun; count: number }> = [];
  for (const entry of sorted) {
    const hit = out.find((o) => sameContext(o.latest.run.context, entry.run.context));
    if (hit) hit.count += 1;
    else out.push({ latest: entry, count: 1 });
  }
  return out;
}

export function renderMotivationStrip(host: HTMLElement, placed: PlacedRun[]): void {
  host.replaceChildren();
  const strip = document.createElement('div');
  strip.className = 'guide-mstrip guide';
  for (const { latest, count } of latestPerContext(placed.filter((p) => p.run.guide === 'motivation_sdt'))) {
    const guide = guideById(latest.run.guide)!;
    const card = document.createElement('a');
    card.className = 'guide-mini';
    card.href = meetingRoute(latest.meetingId);
    const title = document.createElement('b');
    title.textContent = latest.run.context;
    const when = document.createElement('div');
    when.className = 'guide-mini__when';
    when.textContent = `${shortDate(latest.run.created_at)} · ${count} run${count === 1 ? '' : 's'}`;
    const spark = document.createElement('div');
    spark.className = 'guide-mini__spark';
    for (const scale of guide.scales) {
      const bar = document.createElement('i');
      bar.className = `guide-mini__bar guide-tone--${scale.tone}`;
      bar.style.height = `${Math.max(4, (latest.run.values[scale.id] ?? 0) * 10)}%`;
      spark.append(bar);
    }
    const track = document.createElement('div');
    track.className = 'guide-lean__track guide-lean__track--mini';
    const pin = document.createElement('span');
    pin.className = 'guide-lean__pin';
    pin.style.left = `${Math.round(guide.lean(latest.run.values) * 100)}%`;
    track.append(pin);
    card.append(title, when, spark, track);
    strip.append(card);
  }
  host.append(strip);
}

export function guideTimelinePoints(placed: PlacedRun[]): TimelinePoint[] {
  return placed.map(({ run }) => ({
    id: `guide_${run.id}`,
    at: run.created_at,
    label: `◐ ${guideById(run.guide)?.name ?? 'Guide'} guide · ${run.context}`
  }));
}
