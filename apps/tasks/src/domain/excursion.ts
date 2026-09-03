import type { ExcursionTemplate } from '@/schemas/templates';
import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { addDays, parseDue, startOfDay, toDateKey } from '@/domain/queries';

export type AdminTaskKind =
  | 'permission_note'
  | 'staff_email'
  | 'risk_assessment'
  | 'payment'
  | 'checklist'
  | 'event';

export type KeyDateKind = Exclude<AdminTaskKind, 'checklist'>;

export type PlannedAdminTask = {
  kind: AdminTaskKind;
  title: string;
  description: string;
  due_date: string;
  estimated_duration: number;
  priority: Task['priority'];
  tags: string[];
};

export type KeyDateDef = {
  kind: KeyDateKind;
  label: string;
  read: (project: Project) => string | null | undefined;
};

export const KEY_DATE_DEFS: KeyDateDef[] = [
  {
    kind: 'permission_note',
    label: 'Permission note',
    read: (project) => project.key_dates?.permission_note_due
  },
  {
    kind: 'staff_email',
    label: 'Staff notification',
    read: (project) => project.key_dates?.staff_notification_due
  },
  {
    kind: 'risk_assessment',
    label: 'Risk assessment',
    read: (project) => project.key_dates?.risk_assessment_due
  },
  {
    kind: 'payment',
    label: 'Payment',
    read: (project) => project.key_dates?.payment_due
  },
  {
    kind: 'event',
    label: 'Event',
    read: (project) => project.current_end_date
  }
];

const KIND_TAG: Record<KeyDateKind, string> = {
  permission_note: 'permission',
  staff_email: 'staff',
  risk_assessment: 'risk',
  payment: 'payment',
  event: 'event'
};

const TITLE_MATCH: Array<[KeyDateKind, (title: string) => boolean]> = [
  ['permission_note', (title) => title.includes('permission')],
  ['staff_email', (title) => title.includes('staff absence') || title.includes('staff notification')],
  ['risk_assessment', (title) => title.includes('risk assessment')],
  ['payment', (title) => /\bpayment\b/.test(title)],
  ['event', (title) => title === 'event' || title.startsWith('event day')]
];

/** Which admin key-date a task is — tags first, then title. */
export function adminTaskKind(task: Task): AdminTaskKind | null {
  for (const kind of Object.keys(KIND_TAG) as KeyDateKind[]) {
    if (task.tags.includes(KIND_TAG[kind])) return kind;
  }
  if (task.tags.includes('checklist')) return 'checklist';
  const title = task.title.toLowerCase();
  for (const [kind, match] of TITLE_MATCH) {
    if (match(title)) return kind;
  }
  return null;
}

export function matchAdminTask(tasks: Task[], kind: KeyDateKind): Task | undefined {
  return tasks.find((task) => adminTaskKind(task) === kind);
}

export function keyDateKindFromLabel(label: string): KeyDateKind | null {
  const found = KEY_DATE_DEFS.find((row) => row.label === label);
  return found?.kind ?? null;
}

/** Build one admin task for a key date or event that is not yet a task. */
export function planAdminTaskForKind(
  kind: KeyDateKind,
  project: Project,
  dueDate: string
): PlannedAdminTask {
  const label = project.title.trim() || 'Excursion';
  switch (kind) {
    case 'permission_note':
      return {
        kind,
        title: `Draft & send permission note — ${label}`,
        description: 'Review drafted_documents.permission_note_draft on the excursion.',
        due_date: dueDate,
        estimated_duration: 45,
        priority: 'high',
        tags: ['excursion', 'admin', 'permission']
      };
    case 'staff_email':
      return {
        kind,
        title: `Send staff absence notification — ${label}`,
        description: 'Review drafted_documents.staff_absence_email_draft on the excursion.',
        due_date: dueDate,
        estimated_duration: 20,
        priority: 'high',
        tags: ['excursion', 'admin', 'staff']
      };
    case 'risk_assessment':
      return {
        kind,
        title: `Lodge risk assessment — ${label}`,
        description: 'Lodge the risk assessment before the event.',
        due_date: dueDate,
        estimated_duration: 60,
        priority: 'urgent',
        tags: ['excursion', 'admin', 'risk']
      };
    case 'payment':
      return {
        kind,
        title: `Confirm payment — ${label}`,
        description: 'Confirm payment before the event.',
        due_date: dueDate,
        estimated_duration: 30,
        priority: 'high',
        tags: ['excursion', 'admin', 'payment']
      };
    case 'event':
      return {
        kind,
        title: `Event day — ${label}`,
        description: `${label} event.`,
        due_date: dueDate,
        estimated_duration: 480,
        priority: 'urgent',
        tags: ['excursion', 'event']
      };
  }
}

/** Keep project key dates / event day aligned when an admin task date changes. */
export function excursionDatesFromAdminTask(
  project: Project,
  task: Task
): Partial<Pick<Project, 'key_dates' | 'current_end_date'>> | null {
  if (project.type !== 'excursion') return null;
  const kind = adminTaskKind(task);
  if (!kind || kind === 'checklist') return null;
  const date = task.due_date;
  if (kind === 'event') {
    if (project.current_end_date === date) return null;
    return { current_end_date: date };
  }
  const field =
    kind === 'permission_note'
      ? 'permission_note_due'
      : kind === 'staff_email'
        ? 'staff_notification_due'
        : kind === 'risk_assessment'
          ? 'risk_assessment_due'
          : 'payment_due';
  if ((project.key_dates?.[field] ?? null) === date) return null;
  return { key_dates: { ...project.key_dates, [field]: date } };
}

export type ExcursionKeyDates = NonNullable<Project['key_dates']>;

export type ExcursionPlan = {
  key_dates: ExcursionKeyDates;
  event_date: string;
  milestones: Array<{ title: string; due_date: string; status: 'open' }>;
  admin_tasks: PlannedAdminTask[];
  drafted_documents: {
    permission_note_draft: string;
    staff_absence_email_draft: string;
  };
};

export type CreateExcursionInput = {
  title: string;
  event_date: string;
  student_group_reference?: string | null;
  description?: string;
};

function dueBeforeEvent(eventDate: Date, leadDays: number): string {
  return toDateKey(addDays(startOfDay(eventDate), -leadDays));
}

/** Map checklist lines that are covered by the four standard admin tasks. */
function isCoveredByAdminTask(item: string): boolean {
  const lower = item.toLowerCase();
  return (
    lower.includes('permission') ||
    lower.includes('staff absence') ||
    lower.includes('staff email') ||
    lower.includes('risk assessment') ||
    lower.includes('payment')
  );
}

export function draftPermissionNote(input: {
  title: string;
  eventDateLabel: string;
  studentGroup: string;
  competitionName: string;
}): string {
  const group = input.studentGroup || '[student group]';
  return [
    `Permission note — ${input.competitionName}`,
    '',
    `Dear Parent/Carer,`,
    '',
    `We are writing to seek permission for ${group} to take part in ${input.title} (${input.competitionName}) on ${input.eventDateLabel}.`,
    '',
    `Please return this note by the deadline shown in the Tasks Hub checklist so we can finalise logistics and staffing.`,
    '',
    `Kind regards,`,
    `Adam Russell`
  ].join('\n');
}

export function draftStaffAbsenceEmail(input: {
  title: string;
  eventDateLabel: string;
  studentGroup: string;
  competitionName: string;
}): string {
  const group = input.studentGroup || '[student group]';
  return [
    `Subject: Staff absence — ${input.competitionName} (${input.eventDateLabel})`,
    '',
    `Hi team,`,
    '',
    `I will be off-site with ${group} for ${input.title} (${input.competitionName}) on ${input.eventDateLabel}.`,
    '',
    `Please note any cover implications and reply if clashes need resolving.`,
    '',
    `Thanks,`,
    `Adam`
  ].join('\n');
}

/**
 * Build key dates, milestones, scheduled admin tasks, and draft documents
 * for an excursion template + event date (spec §5.6–5.7 / steps 5–6).
 */
export function buildExcursionPlan(
  template: ExcursionTemplate,
  input: CreateExcursionInput
): ExcursionPlan {
  const event = parseDue(input.event_date);
  if (!event) throw new Error(`Invalid event_date: ${input.event_date}`);
  const eventDay = startOfDay(event);
  const eventKey = toDateKey(eventDay);
  const weekday = eventDay.toLocaleDateString('en-AU', { weekday: 'long' });
  const eventLabel = `${weekday} ${formatDisplayDate(eventDay)}`;
  const group = input.student_group_reference?.trim() || '';
  const leads = template.default_lead_times;

  const key_dates: ExcursionKeyDates = {
    permission_note_due: dueBeforeEvent(eventDay, leads.permission_note_days),
    staff_notification_due: dueBeforeEvent(eventDay, leads.staff_email_days),
    risk_assessment_due: dueBeforeEvent(eventDay, leads.risk_assessment_days),
    payment_due:
      leads.payment_days !== undefined ? dueBeforeEvent(eventDay, leads.payment_days) : null
  };

  const label = input.title.trim() || template.name;
  const draftProject = {
    title: label,
    type: 'excursion',
    drafted_documents: null,
    key_dates
  } as Project;
  const admin_tasks: PlannedAdminTask[] = [
    planAdminTaskForKind('permission_note', draftProject, key_dates.permission_note_due!),
    planAdminTaskForKind('staff_email', draftProject, key_dates.staff_notification_due!),
    planAdminTaskForKind('risk_assessment', draftProject, key_dates.risk_assessment_due!)
  ];
  admin_tasks[0]!.description = `Lead time ${leads.permission_note_days} days before event. Review drafted_documents.permission_note_draft on the excursion.`;
  admin_tasks[1]!.description = `Lead time ${leads.staff_email_days} days before event. Review drafted_documents.staff_absence_email_draft on the excursion.`;
  admin_tasks[2]!.description = `Lead time ${leads.risk_assessment_days} days before event.`;

  if (key_dates.payment_due) {
    const payment = planAdminTaskForKind('payment', draftProject, key_dates.payment_due);
    payment.description = `Lead time ${leads.payment_days} days before event.`;
    admin_tasks.push(payment);
  }

  for (const item of template.checklist_items) {
    if (isCoveredByAdminTask(item)) continue;
    admin_tasks.push({
      kind: 'checklist',
      title: `${item} — ${label}`,
      description: `Checklist item from excursion template.`,
      due_date: eventKey,
      estimated_duration: 30,
      priority: 'medium',
      tags: ['excursion', 'checklist']
    });
  }

  admin_tasks.push(planAdminTaskForKind('event', draftProject, eventKey));

  const milestones = [
    ...template.checklist_items.map((title) => ({
      title,
      due_date: eventKey,
      status: 'open' as const
    })),
    {
      title: 'Event day',
      due_date: eventKey,
      status: 'open' as const
    }
  ];

  return {
    key_dates,
    event_date: eventKey,
    milestones,
    admin_tasks,
    drafted_documents: {
      permission_note_draft: draftPermissionNote({
        title: input.title,
        eventDateLabel: eventLabel,
        studentGroup: group,
        competitionName: label
      }),
      staff_absence_email_draft: draftStaffAbsenceEmail({
        title: input.title,
        eventDateLabel: eventLabel,
        studentGroup: group,
        competitionName: label
      })
    }
  };
}

function shiftDateKey(value: string | null | undefined, deltaDays: number): string | null {
  const date = parseDue(value ?? null);
  return date ? toDateKey(addDays(date, deltaDays)) : value ?? null;
}

/**
 * Move the event day and every dated child / key date with it.
 * The toolbar date field used to write `current_end_date` only.
 */
export function shiftExcursionDates(
  project: Project,
  tasks: Task[],
  nextEventDate: string
): {
  project: Pick<Project, 'current_end_date' | 'key_dates' | 'milestones'>;
  tasks: Array<{ id: string; due_date: string }>;
} {
  const next = parseDue(nextEventDate);
  if (!next) throw new Error(`Invalid event_date: ${nextEventDate}`);
  const nextKey = toDateKey(startOfDay(next));
  const current = parseDue(project.current_end_date);
  const delta = current
    ? Math.round((startOfDay(next).getTime() - startOfDay(current).getTime()) / 86_400_000)
    : 0;

  const keys = project.key_dates;
  const key_dates = keys
    ? {
        permission_note_due: shiftDateKey(keys.permission_note_due, delta),
        staff_notification_due: shiftDateKey(keys.staff_notification_due, delta),
        risk_assessment_due: shiftDateKey(keys.risk_assessment_due, delta),
        payment_due: shiftDateKey(keys.payment_due, delta)
      }
    : null;

  return {
    project: {
      current_end_date: nextKey,
      key_dates,
      milestones: project.milestones.map((item) => ({
        ...item,
        due_date: item.due_date ? shiftDateKey(item.due_date, delta) : item.due_date
      }))
    },
    tasks: tasks
      .filter((task) => task.parent_project_id === project.id && task.due_date)
      .map((task) => ({
        id: task.id,
        due_date: delta === 0 ? task.due_date! : shiftDateKey(task.due_date, delta)!
      }))
  };
}

/** Default event day when creating from a template — no extra form step. */
export function defaultExcursionEventDate(now = new Date()): string {
  return toDateKey(addDays(now, 45));
}

/** Summarise lead-time offsets for UI preview. */
export function formatLeadTimes(template: ExcursionTemplate): string {
  const l = template.default_lead_times;
  const parts = [
    `permission −${l.permission_note_days}d`,
    `staff −${l.staff_email_days}d`,
    `risk −${l.risk_assessment_days}d`
  ];
  if (l.payment_days !== undefined) parts.push(`payment −${l.payment_days}d`);
  return parts.join(' · ');
}
