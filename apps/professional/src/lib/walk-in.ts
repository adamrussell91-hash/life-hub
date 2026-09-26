import { extractInlinePromises } from '@/lib/inline-promises';

export type WalkInItem = { kind: 'comm' | 'meeting'; id: string; title: string; start: string; href: string };

/** The card shows from 10 minutes before until 15 minutes in. minutes < 0 means it has started. */
export function nextWalkIn(items: WalkInItem[], now: Date): (WalkInItem & { minutes: number }) | null {
  const t = now.getTime();
  const open = items
    .map((item) => ({ ...item, minutes: Math.round((Date.parse(item.start) - t) / 60_000) }))
    .filter((item) => item.minutes <= 10 && item.minutes > -15)
    .sort((a, b) => a.minutes - b.minutes);
  return open.find((item) => item.minutes >= 0) ?? open.at(-1) ?? null;
}

export function homeNudges(input: {
  late: Array<{ text: string; days_late: number; href: string }>;
  wrapUps: Array<{ title: string; href: string }>;
  quiet: Array<{ title: string; days: number; href: string }>;
}): Array<{ text: string; href: string; tone: 'late' | 'wrap' | 'quiet' }> {
  return [
    ...input.late.map((item) => ({ text: `${item.text} · ${item.days_late} day${item.days_late === 1 ? '' : 's'} late`, href: item.href, tone: 'late' as const })),
    ...input.wrapUps.map((item) => ({ text: `Wrap up ${item.title}`, href: item.href, tone: 'wrap' as const })),
    ...input.quiet.map((item) => ({ text: `${item.title} has been quiet for ${item.days} days`, href: item.href, tone: 'quiet' as const }))
  ].slice(0, 5);
}

function sydneyParts(at: Date): { weekday: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(at);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '0';
  return { weekday: get('weekday'), minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

/** At school on a weekday (8:00–15:30), a quick log is most likely in person; otherwise a text. */
export function guessChannel(at: Date): 'in_person' | 'message' {
  const { weekday, minutes } = sydneyParts(at);
  const weekdayOk = !['Sat', 'Sun'].includes(weekday);
  return weekdayOk && minutes >= 8 * 60 && minutes <= 15 * 60 + 30 ? 'in_person' : 'message';
}

export function quickLogBody(input: { personRef: string; channel: string; line: string; at: Date }): {
  communication: {
    direction: 'outbound'; channel: string; occurred_at: string; subject: string; summary: string;
    links: Array<{ relationship_type: 'recipient'; target_ref: string }>;
  };
  promises: Array<{ direction: 'you_owe' | 'they_owe'; person_ref: string; text: string }>;
} {
  const line = input.line.trim();
  const beforePromise = line.split('»')[0]!.trim();
  const firstSentence = (beforePromise.match(/^.*?[.!?](\s|$)/)?.[0] ?? beforePromise).trim();
  const promises = extractInlinePromises(line.replace(/\s*»/g, '\n»'))
    .map((promise) => ({
      direction: (promise.owner.toLowerCase() === 'me' ? 'you_owe' : 'they_owe') as 'you_owe' | 'they_owe',
      person_ref: input.personRef,
      text: promise.text
    }));
  return {
    communication: {
      direction: 'outbound',
      channel: input.channel,
      occurred_at: input.at.toISOString(),
      subject: firstSentence.slice(0, 120),
      summary: line,
      links: [{ relationship_type: 'recipient', target_ref: input.personRef }]
    },
    promises
  };
}
