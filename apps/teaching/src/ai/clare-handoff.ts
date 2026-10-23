/**
 * Clare in Teaching only has lesson tools. Meetings, calendar and reminders live
 * with Clare in Tasks, so those requests are handed to her chat there and sent.
 */

const TASKS_CLARE_PATTERNS: RegExp[] = [
  /\bmeetings?\b/,
  /\b(re)?schedul(e|ed|ing)\b/,
  /\bcalendar\b/,
  /\bdiary\b/,
  /\bappointments?\b/,
  /\bremind(er|ers)?\b/,
  /\bcatch[- ]?up\b/,
  /\b(call|chat|coffee) with\b/,
  /\binvite\b/,
  /\bbook (a|an|in|me|us|some|time|it|that)\b/,
  /\bblock (out|off|in)\b/,
  /\b(add|make|create) (a |an )?(task|to-?do)\b/,
  /\bto-?do list\b/,
  /\bmy tasks\b/
];

export function isTasksClareRequest(message: string): boolean {
  const text = message.toLowerCase();
  return TASKS_CLARE_PATTERNS.some((pattern) => pattern.test(text));
}

/** Umbrella path to Clare's chat in Tasks; `send=1` sends the message on arrival. */
export function tasksClareHref(message: string): string {
  return `/tasks/#/clare?agent=clare&send=1&prompt=${encodeURIComponent(message.trim())}`;
}

export const CLARE_HANDOFF_LINE = 'Meetings and the calendar live with me in Tasks. Taking this over there now.';
