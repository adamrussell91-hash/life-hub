/**
 * Ported from apps/tasks/src/domain/excursion.ts (buildExcursionPlan and its
 * dependencies) so the live create_excursion_from_template action in
 * templates.mjs produces the same key dates, admin tasks, and drafted
 * documents as the TypeScript store/tests — not a stripped-down duplicate.
 *
 * Keep in sync with apps/tasks/src/domain/excursion.ts by hand: Netlify
 * Functions in this repo do not import TypeScript app source (see AGENTS.md
 * precedent — design-kit JS is imported directly, domain logic is ported).
 */
import { formatDisplayDate } from '../../../packages/design-kit/js/format-display-date.js';

export const DEFAULT_EXCURSION_TEMPLATE_ID = 'ext_excursion';
export const DEFAULT_EXCURSION_TITLE = 'Excursion';

/** Single generic excursion template — matches excursion-catalog.ts. */
export const DEFAULT_EXCURSION_TEMPLATE = {
  schema_version: 1,
  id: DEFAULT_EXCURSION_TEMPLATE_ID,
  name: 'excursion template',
  default_lead_times: {
    permission_note_days: 21,
    staff_email_days: 21,
    risk_assessment_days: 42,
    payment_days: 28
  },
  checklist_items: [
    'Permission note drafted and sent',
    'Staff absence email sent',
    'Risk assessment lodged',
    'Payment confirmed',
    'Student list finalised'
  ]
};

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function toDateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDue(due) {
  if (!due) return null;
  const dateOnly = DATE_ONLY.exec(due);
  if (dateOnly) {
    const local = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
    return Number.isNaN(local.getTime()) ? null : local;
  }
  const d = new Date(due);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dueBeforeEvent(eventDay, leadDays) {
  return toDateKey(addDays(startOfDay(eventDay), -leadDays));
}

function isCoveredByAdminTask(item) {
  const lower = item.toLowerCase();
  return (
    lower.includes('permission') ||
    lower.includes('staff absence') ||
    lower.includes('staff email') ||
    lower.includes('risk assessment') ||
    lower.includes('payment')
  );
}

function planAdminTaskForKind(kind, project, dueDate) {
  const label = (project.title || '').trim() || 'Excursion';
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
    default:
      throw new Error(`Unknown admin task kind: ${kind}`);
  }
}

function draftPermissionNote({ title, eventDateLabel, studentGroup, competitionName }) {
  const group = studentGroup || '[student group]';
  return [
    `Permission note — ${competitionName}`,
    '',
    'Dear Parent/Carer,',
    '',
    `We are writing to seek permission for ${group} to take part in ${title} (${competitionName}) on ${eventDateLabel}.`,
    '',
    'Please return this note by the deadline shown in the Tasks Hub checklist so we can finalise logistics and staffing.',
    '',
    'Kind regards,',
    'Adam Russell'
  ].join('\n');
}

function draftStaffAbsenceEmail({ title, eventDateLabel, studentGroup, competitionName }) {
  const group = studentGroup || '[student group]';
  return [
    `Subject: Staff absence — ${competitionName} (${eventDateLabel})`,
    '',
    'Hi team,',
    '',
    `I will be off-site with ${group} for ${title} (${competitionName}) on ${eventDateLabel}.`,
    '',
    'Please note any cover implications and reply if clashes need resolving.',
    '',
    'Thanks,',
    'Adam'
  ].join('\n');
}

/**
 * Build key dates, milestones, scheduled admin tasks, and draft documents
 * for an excursion template + event date. Mirrors buildExcursionPlan in
 * apps/tasks/src/domain/excursion.ts exactly.
 */
export function buildExcursionPlan(template, input) {
  const event = parseDue(input.event_date);
  if (!event) throw new Error(`Invalid event_date: ${input.event_date}`);
  const eventDay = startOfDay(event);
  const eventKey = toDateKey(eventDay);
  const weekday = eventDay.toLocaleDateString('en-AU', { weekday: 'long' });
  const eventLabel = `${weekday} ${formatDisplayDate(eventDay)}`;
  const group = (input.student_group_reference || '').trim();
  const leads = template.default_lead_times;

  const key_dates = {
    permission_note_due: dueBeforeEvent(eventDay, leads.permission_note_days),
    staff_notification_due: dueBeforeEvent(eventDay, leads.staff_email_days),
    risk_assessment_due: dueBeforeEvent(eventDay, leads.risk_assessment_days),
    payment_due:
      leads.payment_days !== undefined ? dueBeforeEvent(eventDay, leads.payment_days) : null
  };

  const label = (input.title || '').trim() || template.name;
  const draftProject = { title: label };
  const admin_tasks = [
    planAdminTaskForKind('permission_note', draftProject, key_dates.permission_note_due),
    planAdminTaskForKind('staff_email', draftProject, key_dates.staff_notification_due),
    planAdminTaskForKind('risk_assessment', draftProject, key_dates.risk_assessment_due)
  ];
  admin_tasks[0].description = `Lead time ${leads.permission_note_days} days before event. Review drafted_documents.permission_note_draft on the excursion.`;
  admin_tasks[1].description = `Lead time ${leads.staff_email_days} days before event. Review drafted_documents.staff_absence_email_draft on the excursion.`;
  admin_tasks[2].description = `Lead time ${leads.risk_assessment_days} days before event.`;

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
      description: 'Checklist item from excursion template.',
      due_date: eventKey,
      estimated_duration: 30,
      priority: 'medium',
      tags: ['excursion', 'checklist']
    });
  }

  admin_tasks.push(planAdminTaskForKind('event', draftProject, eventKey));

  const milestones = [
    ...template.checklist_items.map((title) => ({ title, due_date: eventKey, status: 'open' })),
    { title: 'Event day', due_date: eventKey, status: 'open' }
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
