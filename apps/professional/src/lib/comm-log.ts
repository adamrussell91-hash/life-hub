/**
 * Log a conversation: the pure parts. A verb chip is a direction and a
 * channel in plain words, a when chip is a time, the notes' first line is
 * the subject, and ticked lines plus the follow-up become ledger to-dos.
 */
import type { CreateCommunicationInput } from '@/api/communications';

export interface CommVerb {
  key: string;
  label: string;
  /** Lower-case for the sentence: "I called Dana just now". */
  phrase: string;
  icon: string;
  direction: 'outbound' | 'inbound';
  channel: 'phone' | 'email' | 'message' | 'in_person' | 'video';
}

export const COMM_VERBS: readonly CommVerb[] = [
  { key: 'i_called', label: 'I called', phrase: 'I called', icon: '☏', direction: 'outbound', channel: 'phone' },
  { key: 'they_called', label: 'They called', phrase: 'Call from', icon: '☎', direction: 'inbound', channel: 'phone' },
  { key: 'i_emailed', label: 'I emailed', phrase: 'I emailed', icon: '✉', direction: 'outbound', channel: 'email' },
  { key: 'they_emailed', label: 'They emailed', phrase: 'Email from', icon: '✉', direction: 'inbound', channel: 'email' },
  { key: 'we_met', label: 'We met', phrase: 'I met', icon: '☺', direction: 'outbound', channel: 'in_person' },
  { key: 'video', label: 'Video', phrase: 'Video call with', icon: '▶', direction: 'outbound', channel: 'video' },
  { key: 'text', label: 'Text', phrase: 'I texted', icon: '✆', direction: 'outbound', channel: 'message' }
];

export type WhenChoice = 'now' | 'earlier' | 'yesterday' | 'pick';
export type FollowUpChoice = 'none' | 'tomorrow' | 'friday' | 'next_week' | 'pick';

export const WHEN_CHOICES: ReadonlyArray<[WhenChoice, string]> = [
  ['now', 'Just now'],
  ['earlier', 'Earlier today'],
  ['yesterday', 'Yesterday'],
  ['pick', 'Pick a time…']
];

export const FOLLOW_UP_CHOICES: ReadonlyArray<[FollowUpChoice, string]> = [
  ['none', 'No need'],
  ['tomorrow', 'Tomorrow'],
  ['friday', 'Friday'],
  ['next_week', 'Next week'],
  ['pick', 'Pick a date…']
];

export function verbByKey(key: string): CommVerb {
  return COMM_VERBS.find((verb) => verb.key === key) ?? COMM_VERBS[0]!;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Local `YYYY-MM-DD`. */
export function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local `HH:MM`. */
export function localTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * The moment the conversation happened. `time` is `HH:MM` for earlier /
 * yesterday, `YYYY-MM-DDTHH:MM` for pick; a blank or bad value falls back
 * to now (earlier) or the same clock time (yesterday).
 */
export function occurredAt(choice: WhenChoice, now: Date, time = ''): Date {
  if (choice === 'now') return new Date(now);
  if (choice === 'pick') {
    const picked = new Date(time);
    return Number.isNaN(picked.getTime()) ? new Date(now) : picked;
  }
  const day = new Date(now);
  if (choice === 'yesterday') day.setDate(day.getDate() - 1);
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (match) day.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return day;
}

/** "just now", "earlier today, 2:10 pm", "yesterday, 9:05 am", "Tue 27 Oct, 4:10 pm". */
export function whenPhrase(choice: WhenChoice, at: Date): string {
  if (choice === 'now') return 'just now';
  const clock = `${at.getHours() % 12 || 12}:${pad(at.getMinutes())} ${at.getHours() < 12 ? 'am' : 'pm'}`;
  if (choice === 'earlier') return `earlier today, ${clock}`;
  if (choice === 'yesterday') return `yesterday, ${clock}`;
  return `${dayLabel(at)}, ${clock}`;
}

/** Due date (`YYYY-MM-DD`) for a follow-up chip, or null for "No need". */
export function followUpDue(choice: FollowUpChoice, now: Date, picked = ''): string | null {
  const day = new Date(now);
  if (choice === 'none') return null;
  if (choice === 'pick') return /^\d{4}-\d{2}-\d{2}$/.test(picked) ? picked : null;
  if (choice === 'tomorrow') day.setDate(day.getDate() + 1);
  if (choice === 'friday') {
    // The coming Friday; on a Friday that means next week's.
    const ahead = (5 - day.getDay() + 7) % 7 || 7;
    day.setDate(day.getDate() + ahead);
  }
  if (choice === 'next_week') {
    const ahead = (1 - day.getDay() + 7) % 7 || 7;
    day.setDate(day.getDate() + ahead);
  }
  return localDate(day);
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Fri 30 Oct". */
function dayLabel(d: Date): string {
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "Fri 30 Oct" for a `YYYY-MM-DD`. */
export function dueLabel(due: string): string {
  const [y, m, d] = due.split('-').map(Number);
  return dayLabel(new Date(y!, m! - 1, d!));
}

/** Each non-blank notes line without its bullet. */
export function noteLines(notes: string): string[] {
  return notes
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);
}

/** "@Theo Example" reads as "Theo Example" once the link holds the person; emails keep their @. */
export function dropAts(text: string): string {
  return text.replace(/(^|\s)@(?=\S)/g, '$1');
}

/** The first line, @ signs dropped, trimmed to a readable length. */
export function subjectFrom(notes: string): string {
  const first = noteLines(notes)[0] ?? '';
  const plain = dropAts(first).replace(/\s+/g, ' ').trim();
  if (plain.length <= 80) return plain;
  const cut = plain.slice(0, 80);
  const space = cut.lastIndexOf(' ');
  return `${(space > 40 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** Notes as the stored summary: one "- " bullet per line. */
export function summaryFrom(notes: string): string {
  return noteLines(notes).map((line) => `- ${dropAts(line)}`).join('\n');
}

export interface Mention {
  ref: string;
  name: string;
}

/** Mentions whose `@Name` is still in the notes, one per person. */
export function liveMentions(notes: string, mentions: readonly Mention[]): Mention[] {
  const seen = new Set<string>();
  return mentions.filter((mention) => {
    if (seen.has(mention.ref) || !notes.includes(`@${mention.name}`)) return false;
    seen.add(mention.ref);
    return true;
  });
}

export interface CommLogDraft {
  verbKey: string;
  personRef: string;
  at: Date;
  notes: string;
  subject: string;
  /** People the conversation was about: @mentions, the linked child, extra links. */
  aboutRefs: string[];
}

export function commLogBody(draft: CommLogDraft): CreateCommunicationInput {
  const verb = verbByKey(draft.verbKey);
  const about = [...new Set(draft.aboutRefs)].filter((ref) => ref !== draft.personRef);
  return {
    direction: verb.direction,
    channel: verb.channel,
    occurred_at: draft.at.toISOString(),
    subject: draft.subject.trim() || subjectFrom(draft.notes) || `${verb.label}`,
    summary: summaryFrom(draft.notes),
    links: [
      { relationship_type: 'recipient', target_ref: draft.personRef },
      ...about.map((ref) => ({ relationship_type: 'about_person' as const, target_ref: ref }))
    ]
  };
}

/** "Saves the call, 2 to-dos and a follow-up on Fri 30 Oct." */
export function saveSummary(input: { verbKey: string; todoCount: number; followUpDue: string | null }): string {
  const noun = { phone: 'call', email: 'email', message: 'text', in_person: 'meeting', video: 'video call' }[
    verbByKey(input.verbKey).channel
  ];
  const parts = [`the ${noun}`];
  if (input.todoCount) parts.push(input.todoCount === 1 ? '1 to-do' : `${input.todoCount} to-dos`);
  if (input.followUpDue) parts.push(`a follow-up on ${dueLabel(input.followUpDue)}`);
  const last = parts.pop()!;
  return `Saves ${parts.length ? `${parts.join(', ')} and ${last}` : last}.`;
}
