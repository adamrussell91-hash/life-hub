import type { Task, TaskPriority } from '@/schemas/task';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import {
  addDays,
  overdueTasks,
  parseDue,
  startOfDay,
  tasksForDay,
  toDateKey,
  weekDays
} from '@/domain/queries';
import { detectPinchPoints } from '@/domain/pinch';
import { isBoardTask } from '@/domain/hierarchy';
import type { ClareProtocolId } from '@/domain/clare-protocols';
import type { DumpItem, DumpKind } from '@/domain/clare-dump';

/** Common shape shared by parser DumpItems and LLM-judged rows — the toolkits only need this much. */
type SortableDumpLike = {
  title: string;
  kind: DumpKind;
  due_date: string | null;
  priority: TaskPriority;
};

export type ClareBriefingFlag = {
  kind: 'high-stakes' | 'pinch' | 'overdue' | 'stale';
  text: string;
  task_id?: string;
};

export type ClareBriefingSection = {
  heading: string;
  lines: string[];
};

export type ClareBriefing = {
  protocol_id: ClareProtocolId;
  lead: string;
  closer: string;
  sections: ClareBriefingSection[];
  flags: ClareBriefingFlag[];
};

export type ClareToolkitResult = {
  title: string;
  body: string;
  steps: string[];
};

const MS_DAY = 24 * 60 * 60 * 1000;

function ageDays(iso: string, now: Date): number {
  const stamp = new Date(iso);
  if (Number.isNaN(stamp.getTime())) return 0;
  return (startOfDay(now).getTime() - startOfDay(stamp).getTime()) / MS_DAY;
}

function daysUntilDue(task: Task, now: Date): number | null {
  const due = parseDue(task.due_date);
  if (!due) return null;
  return Math.round((startOfDay(due).getTime() - startOfDay(now).getTime()) / MS_DAY);
}

function formatTaskLine(task: Task, now: Date): string {
  const due = task.due_date ? formatDisplayDate(task.due_date) : 'no date';
  const until = daysUntilDue(task, now);
  const when =
    until == null
      ? due
      : until < 0
        ? `was due ${due}`
        : until === 0
          ? 'due today'
          : until === 1
            ? 'due tomorrow'
            : `due ${due}`;
  return `${task.title} — ${when}, ${task.priority}.`;
}

function openBoard(tasks: Task[]): Task[] {
  return tasks.filter(
    (t) => isBoardTask(t) && t.status !== 'done' && t.status !== 'dead'
  );
}

/** High/urgent work due within a week (or already late) that has gone stale. */
export function findHighStakesTasks(tasks: Task[], now: Date = new Date()): Task[] {
  const start = startOfDay(now);
  const horizon = addDays(start, 7);
  return openBoard(tasks)
    .filter((task) => {
      if (task.priority !== 'high' && task.priority !== 'urgent') return false;
      const dueRaw = parseDue(task.due_date);
      if (!dueRaw) return false;
      const due = startOfDay(dueRaw);
      const overdue = due.getTime() < start.getTime();
      const withinWeek = due.getTime() <= horizon.getTime();
      if (!overdue && !withinWeek) return false;
      const old = ageDays(task.created_at, now) >= 14;
      const stale = ageDays(task.updated_at, now) >= 5;
      return overdue || old || stale;
    })
    .sort((a, b) => {
      const ad = daysUntilDue(a, now) ?? 99;
      const bd = daysUntilDue(b, now) ?? 99;
      return ad - bd;
    });
}

function wordCount(briefing: ClareBriefing): number {
  const text = [
    briefing.lead,
    ...briefing.sections.flatMap((s) => [s.heading, ...s.lines]),
    ...briefing.flags.map((f) => f.text),
    briefing.closer
  ].join(' ');
  return text.split(/\s+/).filter(Boolean).length;
}

function trimSections(sections: ClareBriefingSection[], maxLines: number): ClareBriefingSection[] {
  let left = maxLines;
  const out: ClareBriefingSection[] = [];
  for (const section of sections) {
    if (left <= 0) break;
    const lines = section.lines.slice(0, left);
    if (!lines.length) continue;
    out.push({ heading: section.heading, lines });
    left -= lines.length;
  }
  return out;
}

function morningLead(highStakes: Task[], overdue: Task[], today: Task[], now: Date): string {
  const top = highStakes[0];
  if (top) {
    const until = daysUntilDue(top, now);
    const when =
      until == null
        ? formatDisplayDate(top.due_date)
        : until < 0
          ? `was due ${formatDisplayDate(top.due_date)}`
          : until === 0
            ? 'is due today'
            : `is due ${formatDisplayDate(top.due_date)}`;
    const distance =
      until == null ? '' : until < 0 ? ` That is ${Math.abs(until)} days late.` : ` That is ${until} days away.`;
    return `One thing before we start: ${top.title} ${when} and has not moved.${distance}`;
  }
  const late = overdue[0];
  if (late) {
    return `So ${late.title} was due ${formatDisplayDate(late.due_date)}. Moving on.`;
  }
  const first = today[0];
  if (first) {
    return `${first.title} is the one that actually needs you today. Everything else can wait its turn.`;
  }
  return 'Nothing is on fire. That is either a miracle or a trap.';
}

export function buildMorningSweep(tasks: Task[], now: Date = new Date()): ClareBriefing {
  const highStakes = findHighStakesTasks(tasks, now);
  const overdue = overdueTasks(tasks, now);
  const today = tasksForDay(tasks, now);
  const pinches = detectPinchPoints(tasks, now, { days: 3 });
  const comms = today.filter(
    (t) =>
      t.tags.includes('comms') ||
      /email|call|meeting|parent/i.test(t.title)
  );
  const doing = today.filter((t) => !comms.includes(t));

  const flags: ClareBriefingFlag[] = [];
  if (highStakes[0]) {
    flags.push({
      kind: 'high-stakes',
      text: `${highStakes[0].title} is the deadline that keeps sitting there.`,
      task_id: highStakes[0].id
    });
  }
  if (pinches[0]) {
    flags.push({
      kind: 'pinch',
      text: pinches[0].summary,
      task_id: pinches[0].tasks[0]?.id
    });
  }

  const sections = trimSections(
    [
      comms.length
        ? { heading: 'Appointments', lines: comms.slice(0, 3).map((t) => formatTaskLine(t, now)) }
        : null,
      doing.length
        ? { heading: 'Tasks', lines: doing.slice(0, 4).map((t) => formatTaskLine(t, now)) }
        : overdue.length
          ? {
              heading: 'Overdue',
              lines: overdue.slice(0, 4).map((t) => formatTaskLine(t, now))
            }
          : null
    ].filter((s): s is ClareBriefingSection => Boolean(s)),
    6
  );

  const briefing: ClareBriefing = {
    protocol_id: 'morning-sweep',
    lead: morningLead(highStakes, overdue, today, now),
    closer: 'That is your day. Dump away.',
    sections,
    flags
  };
  if (wordCount(briefing) > 300) {
    briefing.sections = trimSections(briefing.sections, 3);
    briefing.flags = briefing.flags.slice(0, 1);
  }
  return briefing;
}

export function buildTomorrowSetup(tasks: Task[], now: Date = new Date()): ClareBriefing {
  const tomorrow = addDays(startOfDay(now), 1);
  const upcoming = tasksForDay(tasks, tomorrow);
  const leftover = [...tasksForDay(tasks, now), ...overdueTasks(tasks, now)].slice(0, 4);
  const sections = trimSections(
    [
      upcoming.length
        ? {
            heading: 'Tomorrow',
            lines: upcoming.slice(0, 4).map((t) => formatTaskLine(t, now))
          }
        : { heading: 'Tomorrow', lines: ['Quiet on paper. Today’s leftovers are the real work.'] },
      leftover.length
        ? {
            heading: 'Still live from today',
            lines: leftover.map((t) => formatTaskLine(t, now))
          }
        : null
    ].filter((s): s is ClareBriefingSection => Boolean(s)),
    6
  );
  return {
    protocol_id: 'tomorrow-setup',
    lead: upcoming[0]
      ? `Tomorrow starts with ${upcoming[0].title}. Get tonight’s leftovers out of its way.`
      : 'Tomorrow is empty unless we carry something forward. That can be a gift or a lie.',
    closer: 'Reschedule, carry forward, or close — your call before bed.',
    sections,
    flags: []
  };
}

export function buildWeeklyReset(tasks: Task[], now: Date = new Date()): ClareBriefing {
  const days = weekDays(now);
  const overdue = overdueTasks(tasks, now);
  const pinches = detectPinchPoints(tasks, days[0] ?? now, { days: 7 });
  const crunch = pinches.filter((p) => p.severity === 'overloaded');
  const weekLines: string[] = [];
  for (const day of days) {
    const items = tasksForDay(tasks, day);
    if (!items.length) continue;
    const label = toDateKey(day) === toDateKey(now) ? 'Today' : formatDisplayDate(day);
    weekLines.push(`${label}: ${items.length} open (${items[0]?.title ?? 'work'}).`);
  }
  const flags: ClareBriefingFlag[] = crunch.slice(0, 2).map((p) => ({
    kind: 'pinch' as const,
    text:
      p.date_key === toDateKey(now)
        ? `Today looks like a crunch day — ${p.task_count} tasks.`
        : `${formatDisplayDate(p.date)} looks like a crunch day — ${p.task_count} tasks.`,
    task_id: p.tasks[0]?.id
  }));
  return {
    protocol_id: 'weekly-reset',
    lead: crunch[0]
      ? `${formatDisplayDate(crunch[0].date)} is the day to protect.`
      : overdue[0]
        ? `The week is fine. The overdue list is not — start with ${overdue[0].title}.`
        : 'The week is actually holding. Protect that.',
    closer: 'That is the shape of the week. Dump the rest and I will sort it.',
    sections: trimSections(
      [
        weekLines.length ? { heading: 'Week ahead', lines: weekLines.slice(0, 5) } : null,
        overdue.length
          ? {
              heading: 'Decide these',
              lines: overdue.slice(0, 4).map((t) => `${t.title} — reschedule, close, or keep.`)
            }
          : null
      ].filter((s): s is ClareBriefingSection => Boolean(s)),
      7
    ),
    flags
  };
}

export function buildHighStakesBrief(tasks: Task[], now: Date = new Date()): ClareBriefing {
  const stakes = findHighStakesTasks(tasks, now);
  const top = stakes[0];
  return {
    protocol_id: 'high-stakes',
    lead: top
      ? `One thing before we start: ${top.title} is due ${formatDisplayDate(top.due_date)} and has not moved.`
      : 'Nothing high-stakes is currently sitting untouched. Enjoy it while it lasts.',
    closer: top ? 'Want me to break this into daily steps?' : 'Dump something if you want a second opinion.',
    sections: stakes.length
      ? [
          {
            heading: 'Not moving',
            lines: stakes.slice(0, 4).map((t) => formatTaskLine(t, now))
          }
        ]
      : [],
    flags: top
      ? [{ kind: 'high-stakes', text: `${top.title} is the one that matters.`, task_id: top.id }]
      : []
  };
}

export function buildClareBriefing(
  tasks: Task[],
  protocolId: ClareProtocolId | undefined,
  now: Date = new Date()
): ClareBriefing {
  switch (protocolId) {
    case 'tomorrow-setup':
      return buildTomorrowSetup(tasks, now);
    case 'weekly-reset':
      return buildWeeklyReset(tasks, now);
    case 'high-stakes':
      return buildHighStakesBrief(tasks, now);
    default:
      return buildMorningSweep(tasks, now);
  }
}

function firstVerbCue(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes('email') || lower.includes('reply')) {
    return 'Hands on the keyboard. Open the draft, not the inbox.';
  }
  if (lower.includes('mark')) {
    return 'Open the first script. Pen or cursor on the first line — not the whole pile.';
  }
  if (lower.includes('call') || lower.includes('phone')) {
    return 'Phone in hand. Name on screen. Do not open a second app.';
  }
  return `Put both hands on the thing that starts “${title}”. One object. No extra tabs.`;
}

export function buildShatterToolkit(item: Pick<DumpItem, 'title'>): ClareToolkitResult {
  const steps = [
    `Sit down with the materials for “${item.title}” in reach.`,
    'Write the next physical action in one line.',
    'Start a 60-second timer and do only that line.',
    'Stop when the timer ends. Decide then if a second minute is allowed.'
  ];
  return {
    title: 'Task paralysis shatterer',
    body: `Do not start “${item.title}”. Start sixty seconds of the first move. ${firstVerbCue(item.title)}`,
    steps
  };
}

export function buildTimeMapToolkit(item: Pick<DumpItem, 'title'>, proposedMinutes: number): ClareToolkitResult {
  const hidden = [
    'Find the files, login, or pile you always forget exists',
    'The first messy five minutes of actually looking at it',
    'The wrap — save, send, or put it back so future-you can find it'
  ];
  const budget = Math.max(25, Math.round((proposedMinutes * 2.4) / 5) * 5);
  return {
    title: 'Time blindness auditor',
    body: `You will not do “${item.title}” in a tidy ${proposedMinutes} minutes. Budget ${budget}m and protect a finish line.`,
    steps: hidden
  };
}

export function sortOpenLoops<T extends SortableDumpLike>(items: T[]): {
  now: T[];
  later: T[];
  trash: T[];
} {
  const now: T[] = [];
  const later: T[] = [];
  const trash: T[] = [];
  for (const item of items) {
    if (item.kind === 'note' && !item.due_date && item.priority === 'low') {
      trash.push(item);
      continue;
    }
    if (item.kind === 'note' || item.priority === 'low') {
      later.push(item);
      continue;
    }
    if (item.kind === 'communication' || item.due_date || item.priority === 'high' || item.priority === 'urgent') {
      now.push(item);
      continue;
    }
    later.push(item);
  }
  return { now, later, trash };
}

export function buildOpenLoopsToolkit<T extends SortableDumpLike>(items: T[]): ClareToolkitResult {
  const { now, later, trash } = sortOpenLoops(items);
  const lines = [
    `Now: ${now.length ? now.map((i) => i.title).join('; ') : 'nothing that actually needs you'}`,
    `Later: ${later.length ? later.map((i) => i.title).join('; ') : 'clear'}`,
    `Trash: ${trash.length ? trash.map((i) => i.title).join('; ') : 'clear'}`
  ];
  return {
    title: 'Open loops',
    body: 'Now gets a next action. Later and Trash stay lists — no extra commentary.',
    steps: lines
  };
}

/** Flatten a briefing into safe markdown for a chat bubble. */
export function briefingToMarkdown(briefing: ClareBriefing): string {
  const parts = [briefing.lead];
  for (const section of briefing.sections) {
    parts.push(`**${section.heading}**`);
    for (const line of section.lines) {
      parts.push(`- ${line}`);
    }
  }
  for (const flag of briefing.flags) {
    parts.push(flag.text);
  }
  parts.push(briefing.closer);
  return parts.filter((line) => line.trim()).join('\n');
}

export function toolkitToMarkdown(toolkit: ClareToolkitResult): string {
  return [`**${toolkit.title}**`, toolkit.body, ...toolkit.steps.map((step) => `- ${step}`)].join('\n');
}
