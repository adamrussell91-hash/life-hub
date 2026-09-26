type EventLike = { id: string; start: string; hours: number | null; occurrence_state: string; attendance_state: string | null; time_zone: string };

function ddmm(iso: string, zone: string): string {
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone: zone, day: '2-digit', month: '2-digit' }).formatToParts(new Date(iso));
  return `${parts.find((p) => p.type === 'day')?.value}/${parts.find((p) => p.type === 'month')?.value}`;
}

function gapLabel(ms: number): string {
  const days = Math.round(ms / 86_400_000);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'}`;
  const weeks = Math.round(days / 7);
  return `${weeks} wk${weeks === 1 ? '' : 's'}`;
}

/** Hours done (completed, attended or partial) and in total, plus sessions in date order with gaps between them. */
export function groupTotals(events: EventLike[]): {
  hoursDone: number;
  hoursTotal: number;
  sessions: Array<{ id: string; label: string; hours: number | null; done: boolean; gapAfter: string | null }>;
} {
  const ordered = [...events].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  let hoursDone = 0;
  let hoursTotal = 0;
  const sessions = ordered.map((event, index) => {
    const done = event.occurrence_state === 'completed' && (event.attendance_state === 'attended' || event.attendance_state === 'partial');
    if (event.hours != null) {
      hoursTotal += event.hours;
      if (done) hoursDone += event.hours;
    }
    const next = ordered[index + 1];
    return {
      id: event.id,
      label: ddmm(event.start, event.time_zone),
      hours: event.hours,
      done,
      gapAfter: next ? gapLabel(Date.parse(next.start) - Date.parse(event.start)) : null
    };
  });
  return { hoursDone, hoursTotal, sessions };
}

/** A gentle note when the talks' hours don't add up to the event's hours. */
export function talkHoursNote(talks: Array<{ hours: number | null }>, eventHours: number | null): string | null {
  const counted = talks.filter((talk) => talk.hours != null);
  if (!counted.length || eventHours == null) return null;
  const sum = counted.reduce((total, talk) => total + (talk.hours ?? 0), 0);
  if (Math.abs(sum - eventHours) < 0.01) return null;
  return `Talks add up to ${Number(sum.toFixed(2))} h of ${eventHours} h.`;
}
