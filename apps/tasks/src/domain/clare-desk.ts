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


function isAppointmentTask(task: Task): boolean {
  return (
    task.tags.includes('appointment') ||
    task.tags.includes('comms') ||
    /appointment|gp|specialist|dentist|interview|meeting/i.test(task.title)
  );
}

function isFollowUpTask(task: Task): boolean {
  return (
    task.tags.includes('follow-up') ||
    task.tags.includes('comms') ||
    /follow[- ]?up|chase|reply|email|call back/i.test(task.title)
  );
}

export function buildAppointmentPrep(tasks: Task[], now: Date = new Date()): ClareBriefing {
  const start = startOfDay(now);
  const horizon = addDays(start, 1);
  const open = openBoard(tasks);
  const upcoming = open
    .filter((task) => {
      if (!isAppointmentTask(task)) return false;
      const due = parseDue(task.due_date);
      if (!due) return false;
      const day = startOfDay(due);
      return day.getTime() >= start.getTime() && day.getTime() <= horizon.getTime();
    })
    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));
  const top = upcoming[0];
  const related = top
    ? open
        .filter((task) => task.id !== top.id && (task.parent_task_id === top.id || task.title.split(' ')[0] === top.title.split(' ')[0]))
        .slice(0, 4)
    : [];
  return {
    protocol_id: 'appointment-prep',
    lead: top
      ? `${top.title} is within 24 hours. Prep now, not in the car park.`
      : 'No appointment in the next 24 hours is sitting on the board. Dump one if you want prep tasks built.',
    closer: top ? 'Want me to create prep tasks from this?' : 'When an appointment lands, run this sprint again.',
    sections: top
      ? trimSections(
          [
            { heading: 'Appointment', lines: [formatTaskLine(top, now)] },
            related.length
              ? { heading: 'Related open items', lines: related.map((t) => formatTaskLine(t, now)) }
              : { heading: 'Related open items', lines: ['Nothing linked yet — dump prep notes and I will card them.'] }
          ].filter((s): s is ClareBriefingSection => Boolean(s)),
          6
        )
      : [],
    flags: top
      ? [{ kind: 'high-stakes', text: `${top.title} needs prep before you walk in.`, task_id: top.id }]
      : []
  };
}

export function buildCommsFollowup(tasks: Task[], now: Date = new Date()): ClareBriefing {
  const start = startOfDay(now);
  const open = openBoard(tasks);
  const followups = open
    .filter((task) => {
      if (!isFollowUpTask(task)) return false;
      const due = parseDue(task.due_date);
      if (!due) return true;
      return startOfDay(due).getTime() <= start.getTime();
    })
    .sort((a, b) => String(a.due_date ?? '').localeCompare(String(b.due_date ?? '')));
  const stale = followups.filter((task) => {
    const due = parseDue(task.due_date);
    if (!due) return ageDays(task.updated_at, now) >= 7;
    return (start.getTime() - startOfDay(due).getTime()) / MS_DAY >= 7;
  });
  return {
    protocol_id: 'comms-followup',
    lead: followups[0]
      ? `Comms sweep: ${followups.length} follow-up${followups.length === 1 ? '' : 's'} at or past due.`
      : 'Comms sweep is clear — nothing tagged follow-up is overdue.',
    closer: followups[0]
      ? 'Want me to create, update, or resolve these one by one?'
      : 'Dump outstanding chases whenever they appear.',
    sections: followups.length
      ? trimSections(
          [
            {
              heading: 'Follow-ups',
              lines: followups.slice(0, 6).map((t) => formatTaskLine(t, now))
            },
            stale.length
              ? {
                  heading: '7+ days overdue',
                  lines: stale.slice(0, 3).map((t) => `${t.title} — flag explicitly.`)
                }
              : null
          ].filter((s): s is ClareBriefingSection => Boolean(s)),
          8
        )
      : [],
    flags: stale[0]
      ? [{ kind: 'overdue', text: `${stale[0].title} is 7+ days overdue.`, task_id: stale[0].id }]
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
    case 'appointment-prep':
      return buildAppointmentPrep(tasks, now);
    case 'comms-followup':
      return buildCommsFollowup(tasks, now);
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
    'Write the next physical action in one line (under a minute).',
    'Start a 60-second timer and do only that line.',
    'Stop when the timer ends. Decide then if a second minute is allowed.'
  ];
  return {
    title: 'Task paralysis shatterer',
    body: `Trigger: “I am staring at ${item.title} and cannot start.” Do not start the whole thing — start sixty seconds of the first move. ${firstVerbCue(item.title)}`,
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
    body: `Trigger: “I think ${item.title} takes ${proposedMinutes} minutes but it usually blows out.” Budget ${budget}m and protect a finish line.`,
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
    body: 'Trigger: “Brain full of open loops, dumping below.” Now gets a one-sentence next action. Later and Trash stay lists — no extra commentary.',
    steps: lines
  };
}


export function buildDopamineMenuToolkit(item?: Pick<DumpItem, 'title'>): ClareToolkitResult {
  const focus = item?.title ? ` for “${item.title}”` : '';
  return {
    title: 'Dopamine menu architect',
    body: `Trigger: “I am under-stimulated${focus}.” Pick one appetizer, one entree, or one side — not all three.`,
    steps: [
      'Appetizers (5 min): stand outside, cold water on face, one song standing up, tidy one surface, text one safe person',
      'Entrees (20 min): short walk without podcast, shower + change clothes, cook a real snack, stretch/mobility block, one competitive game level',
      'Sides (10 min): inbox zero for starred only, water plants, make tomorrow’s bag, sketch the stuck task’s first box, put laundry on'
    ]
  };
}

export function buildBodyDoubleToolkit(item: Pick<DumpItem, 'title'>): ClareToolkitResult {
  return {
    title: 'Body doubling simulator',
    body: `Trigger: “Act as my virtual body double for 30 minutes on ${item.title}.” Say what done looks like, then we run three 10-minute check-ins.`,
    steps: [
      'Minute 0: write one sentence for done. Start timer.',
      'Minute 10: still on the same object? Yes/no. If no, return to it.',
      'Minute 20: name the next physical move in five words.',
      'Minute 30: stop. Mark done / parked / needs a second block.'
    ]
  };
}

export function buildContextSwitchToolkit(item: Pick<DumpItem, 'title'>, fromTitle?: string): ClareToolkitResult {
  const from = fromTitle ? `“${fromTitle}”` : 'what you just finished';
  return {
    title: 'Context switching guide',
    body: `Trigger: “I just finished ${from}, need to start ${item.title}.” Three-minute palate-cleanser, then the first step of B only.`,
    steps: [
      'End cue: close the A tab/document and stand up.',
      'Palate-cleanser (3 min): water, stretch, or look out a window — no new inputs.',
      `Start cue: open only what “${item.title}” needs.`,
      `First step of B: ${firstVerbCue(item.title)}`
    ]
  };
}

export function buildInterestFilterToolkit(
  item: Pick<DumpItem, 'title'>,
  hyperfixation = 'the current hyperfixation'
): ClareToolkitResult {
  return {
    title: 'Interest-based filter',
    body: `Trigger: “Boring task: ${item.title}. Hyperfixation: ${hyperfixation}.” Gamify the chore as a quest — stages with visible checks.`,
    steps: [
      `Stage 1 — Setup: assemble materials for “${item.title}” as if packing for the quest`,
      'Stage 2 — Scout: two-minute recon, no finishing allowed',
      'Stage 3 — Boss attempt: one focused 10-minute raid on the real work',
      'Stage 4 — Loot: write what moved; choose Stage 5 or stop',
      'Stage 5 — Side quest (optional): reward from the hyperfixation, timed'
    ]
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
