import {
  addDays,
  detectPinchPoints,
  formatDisplayDate,
  isBoardTask,
  overdueTasks,
  parseDue,
  startOfDay,
  tasksForDay,
  toDateKey,
  weekDays
} from './clare-dates.mjs';

const MS_DAY = 24 * 60 * 60 * 1000;

function ageDays(iso, now) {
  const stamp = new Date(iso);
  if (Number.isNaN(stamp.getTime())) return 0;
  return (startOfDay(now).getTime() - startOfDay(stamp).getTime()) / MS_DAY;
}

function daysUntilDue(task, now) {
  const due = parseDue(task.due_date);
  if (!due) return null;
  return Math.round((startOfDay(due).getTime() - startOfDay(now).getTime()) / MS_DAY);
}

function formatTaskLine(task, now) {
  const due = task.due_date ? formatDisplayDate(task.due_date) : 'no date';
  const until = daysUntilDue(task, now);
  const when = until == null
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

function openBoard(tasks) {
  return tasks.filter(task => isBoardTask(task) && task.status !== 'done' && task.status !== 'dead');
}

export function findHighStakesTasks(tasks, now = new Date()) {
  const start = startOfDay(now);
  const horizon = addDays(start, 7);
  return openBoard(tasks)
    .filter(task => {
      if (task.priority !== 'high' && task.priority !== 'urgent') return false;
      const dueRaw = parseDue(task.due_date);
      if (!dueRaw) return false;
      const due = startOfDay(dueRaw);
      const overdue = due.getTime() < start.getTime();
      const withinWeek = due.getTime() <= horizon.getTime();
      if (!overdue && !withinWeek) return false;
      return overdue || ageDays(task.created_at, now) >= 14 || ageDays(task.updated_at, now) >= 5;
    })
    .sort((a, b) => (daysUntilDue(a, now) ?? 99) - (daysUntilDue(b, now) ?? 99));
}

function wordCount(briefing) {
  const text = [
    briefing.lead,
    ...briefing.sections.flatMap(section => [section.heading, ...section.lines]),
    ...briefing.flags.map(flag => flag.text),
    briefing.closer
  ].join(' ');
  return text.split(/\s+/).filter(Boolean).length;
}

function trimSections(sections, maxLines) {
  let left = maxLines;
  const out = [];
  for (const section of sections) {
    if (left <= 0) break;
    const lines = section.lines.slice(0, left);
    if (!lines.length) continue;
    out.push({ heading: section.heading, lines });
    left -= lines.length;
  }
  return out;
}

function morningLead(highStakes, overdue, today, now) {
  const top = highStakes[0];
  if (top) {
    const until = daysUntilDue(top, now);
    const when = until == null
      ? formatDisplayDate(top.due_date)
      : until < 0
        ? `was due ${formatDisplayDate(top.due_date)}`
        : until === 0
          ? 'is due today'
          : `is due ${formatDisplayDate(top.due_date)}`;
    const distance = until == null
      ? ''
      : until < 0
        ? ` That is ${Math.abs(until)} days late.`
        : ` That is ${until} days away.`;
    return `One thing before we start: ${top.title} ${when} and has not moved.${distance}`;
  }
  if (overdue[0]) return `So ${overdue[0].title} was due ${formatDisplayDate(overdue[0].due_date)}. Moving on.`;
  if (today[0]) return `${today[0].title} is the one that actually needs you today. Everything else can wait its turn.`;
  return 'Nothing is on fire. That is either a miracle or a trap.';
}

export function buildMorningSweep(tasks, now = new Date()) {
  const highStakes = findHighStakesTasks(tasks, now);
  const overdue = overdueTasks(tasks, now);
  const today = tasksForDay(tasks, now);
  const pinches = detectPinchPoints(tasks, now, { days: 3 });
  const comms = today.filter(task =>
    (Array.isArray(task.tags) && task.tags.includes('comms')) ||
    /email|call|meeting|parent/i.test(task.title)
  );
  const doing = today.filter(task => !comms.includes(task));
  const flags = [];
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
  const briefing = {
    protocol_id: 'morning-sweep',
    lead: morningLead(highStakes, overdue, today, now),
    closer: 'That is your day. Dump away.',
    sections: trimSections(
      [
        comms.length ? { heading: 'Appointments', lines: comms.slice(0, 3).map(task => formatTaskLine(task, now)) } : null,
        doing.length
          ? { heading: 'Tasks', lines: doing.slice(0, 4).map(task => formatTaskLine(task, now)) }
          : overdue.length
            ? { heading: 'Overdue', lines: overdue.slice(0, 4).map(task => formatTaskLine(task, now)) }
            : null
      ].filter(Boolean),
      6
    ),
    flags
  };
  if (wordCount(briefing) > 300) {
    briefing.sections = trimSections(briefing.sections, 3);
    briefing.flags = briefing.flags.slice(0, 1);
  }
  return briefing;
}

export function buildTomorrowSetup(tasks, now = new Date()) {
  const tomorrow = addDays(startOfDay(now), 1);
  const upcoming = tasksForDay(tasks, tomorrow);
  const leftover = [...tasksForDay(tasks, now), ...overdueTasks(tasks, now)].slice(0, 4);
  return {
    protocol_id: 'tomorrow-setup',
    lead: upcoming[0]
      ? `Tomorrow starts with ${upcoming[0].title}. Get tonight’s leftovers out of its way.`
      : 'Tomorrow is empty unless we carry something forward. That can be a gift or a lie.',
    closer: 'Reschedule, carry forward, or close — your call before bed.',
    sections: trimSections(
      [
        upcoming.length
          ? { heading: 'Tomorrow', lines: upcoming.slice(0, 4).map(task => formatTaskLine(task, now)) }
          : { heading: 'Tomorrow', lines: ['Quiet on paper. Today’s leftovers are the real work.'] },
        leftover.length
          ? { heading: 'Still live from today', lines: leftover.map(task => formatTaskLine(task, now)) }
          : null
      ].filter(Boolean),
      6
    ),
    flags: []
  };
}

export function buildWeeklyReset(tasks, now = new Date()) {
  const days = weekDays(now);
  const overdue = overdueTasks(tasks, now);
  const pinches = detectPinchPoints(tasks, days[0] ?? now, { days: 7 });
  const crunch = pinches.filter(pinch => pinch.severity === 'overloaded');
  const weekLines = [];
  for (const day of days) {
    const items = tasksForDay(tasks, day);
    if (!items.length) continue;
    const label = toDateKey(day) === toDateKey(now) ? 'Today' : formatDisplayDate(day);
    weekLines.push(`${label}: ${items.length} open (${items[0]?.title ?? 'work'}).`);
  }
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
          ? { heading: 'Decide these', lines: overdue.slice(0, 4).map(task => `${task.title} — reschedule, close, or keep.`) }
          : null
      ].filter(Boolean),
      7
    ),
    flags: crunch.slice(0, 2).map(pinch => ({
      kind: 'pinch',
      text: pinch.date_key === toDateKey(now)
        ? `Today looks like a crunch day — ${pinch.task_count} tasks.`
        : `${formatDisplayDate(pinch.date)} looks like a crunch day — ${pinch.task_count} tasks.`,
      task_id: pinch.tasks[0]?.id
    }))
  };
}

export function buildHighStakesBrief(tasks, now = new Date()) {
  const stakes = findHighStakesTasks(tasks, now);
  const top = stakes[0];
  return {
    protocol_id: 'high-stakes',
    lead: top
      ? `One thing before we start: ${top.title} is due ${formatDisplayDate(top.due_date)} and has not moved.`
      : 'Nothing high-stakes is currently sitting untouched. Enjoy it while it lasts.',
    closer: top ? 'Want me to break this into daily steps?' : 'Dump something if you want a second opinion.',
    sections: stakes.length
      ? [{ heading: 'Not moving', lines: stakes.slice(0, 4).map(task => formatTaskLine(task, now)) }]
      : [],
    flags: top ? [{ kind: 'high-stakes', text: `${top.title} is the one that matters.`, task_id: top.id }] : []
  };
}

export function buildClareBriefing(tasks, protocolId, now = new Date()) {
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

function firstVerbCue(title) {
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

export function buildShatterToolkit(item) {
  return {
    title: 'Task paralysis shatterer',
    body: `Do not start “${item.title}”. Start sixty seconds of the first move. ${firstVerbCue(item.title)}`,
    steps: [
      `Sit down with the materials for “${item.title}” in reach.`,
      'Write the next physical action in one line.',
      'Start a 60-second timer and do only that line.',
      'Stop when the timer ends. Decide then if a second minute is allowed.'
    ]
  };
}

export function buildTimeMapToolkit(item, proposedMinutes) {
  const budget = Math.max(25, Math.round((proposedMinutes * 2.4) / 5) * 5);
  return {
    title: 'Time blindness auditor',
    body: `You will not do “${item.title}” in a tidy ${proposedMinutes} minutes. Budget ${budget}m and protect a finish line.`,
    steps: [
      'Find the files, login, or pile you always forget exists',
      'The first messy five minutes of actually looking at it',
      'The wrap — save, send, or put it back so future-you can find it'
    ]
  };
}

export function sortOpenLoops(items) {
  const now = [];
  const later = [];
  const trash = [];
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

export function buildOpenLoopsToolkit(items) {
  const loops = sortOpenLoops(items);
  return {
    title: 'Open loops',
    body: 'Now gets a next action. Later and Trash stay lists — no extra commentary.',
    steps: [
      `Now: ${loops.now.length ? loops.now.map(item => item.title).join('; ') : 'nothing that actually needs you'}`,
      `Later: ${loops.later.length ? loops.later.map(item => item.title).join('; ') : 'clear'}`,
      `Trash: ${loops.trash.length ? loops.trash.map(item => item.title).join('; ') : 'clear'}`
    ]
  };
}

export function briefingToMarkdown(briefing) {
  const parts = [briefing.lead];
  for (const section of briefing.sections) {
    parts.push(`**${section.heading}**`);
    for (const line of section.lines) parts.push(`- ${line}`);
  }
  for (const flag of briefing.flags) parts.push(flag.text);
  parts.push(briefing.closer);
  return parts.filter(line => line.trim()).join('\n');
}

/** Interactive triage for Later items — Tasks renders as choice card. */
export function buildOpenLoopsChoice(items) {
  const loops = sortOpenLoops(Array.isArray(items) ? items : []);
  const later = loops.later.filter(item => typeof item?.title === 'string' && item.title.trim());
  if (!later.length) return null;
  return {
    type: 'choice',
    title: 'Pull anything into Now?',
    hint: 'Clare parked these as Later. Pick any that need a next action today.',
    multi: true,
    confirmLabel: 'Move to Now',
    choices: later.slice(0, 8).map((item, index) => ({
      id: `later-${index}`,
      label: item.title.trim(),
      detail: 'Later'
    }))
  };
}
