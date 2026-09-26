import type { Program } from '@/schemas/program';
import { isProjectArchived, type Project } from '@/schemas/project';
import type { ExcursionTemplate } from '@/schemas/templates';
import { addDaysKey, termAt, type SchoolTerm } from '@/domain/school-time';
import { DEFAULT_HUB_PREFS, type HubPrefs } from '@/domain/hub-prefs';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
] as const;

const NOTICE = [
  ['permission_note_due', 'permission_note_days', 'Permission notes'],
  ['staff_notification_due', 'staff_email_days', 'Staff email'],
  ['risk_assessment_due', 'risk_assessment_days', 'Risk assessment'],
  ['payment_due', 'payment_days', 'Payment']
] as const;

export type UsualCall = {
  programId: string;
  name: string;
  usualMonth: string;
  monthPassed: boolean;
  suggestedDate: string;
  term: 1 | 2 | 3 | 4 | null;
};

export type TightNotice = { label: string; had: number; need: number };

export function monthNumber(name: string | null | undefined): number | null {
  if (!name) return null;
  const index = MONTHS.findIndex((month) => month.toLowerCase() === name.toLowerCase());
  return index < 0 ? null : index + 1;
}

export function termsForYear(prefs: HubPrefs | null | undefined, year: number): SchoolTerm[] {
  const source = prefs?.school_terms?.length ? prefs : DEFAULT_HUB_PREFS;
  return source.school_terms.find((row) => row.year === year)?.terms ?? [];
}

export function closedExcursions(projects: Project[]): Project[] {
  return projects
    .filter((project) => project.type === 'excursion' && isProjectArchived(project.status))
    .sort((a, b) => (b.current_end_date ?? b.updated_at).localeCompare(a.current_end_date ?? a.updated_at));
}

export function openFolderNames(project: Project | null): string[] {
  if (!project) return [];
  return (project.folder_items ?? []).filter((item) => !item.on).map((item) => item.name);
}

function ymd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function ranThisMonth(excursions: Project[], programId: string, year: number, month: number): boolean {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  return excursions.some(
    (project) => project.linked_program_id === programId && (project.current_end_date ?? '').startsWith(prefix)
  );
}

function suggestDate(fifteenth: string, monthPassed: boolean, terms: SchoolTerm[], today: string): string {
  if (!monthPassed && termAt(fifteenth, terms)) return fifteenth;
  const next = terms.find((term) => term.ends_on >= today);
  if (!next) return fifteenth;
  if (today < next.starts_on) return next.starts_on;
  const ahead = addDaysKey(today, 21);
  return ahead <= next.ends_on ? ahead : next.ends_on;
}

/** Programs whose usual month is this month, last month, or next month, with no linked trip in that month. */
export function usualCalls(
  programs: Program[],
  excursions: Project[],
  terms: SchoolTerm[],
  today: string
): UsualCall[] {
  const year = Number(today.slice(0, 4));
  const todayMonth = Number(today.slice(5, 7));
  const calls: UsualCall[] = [];
  for (const program of programs) {
    const month = monthNumber(program.month);
    if (!month) continue;
    const delta = month - todayMonth;
    if (delta < -1 || delta > 1) continue;
    if (ranThisMonth(excursions, program.id, year, month)) continue;
    const fifteenth = ymd(year, month, 15);
    const monthPassed = fifteenth < today;
    const suggestedDate = suggestDate(fifteenth, monthPassed, terms, today);
    calls.push({
      programId: program.id,
      name: program.name,
      usualMonth: MONTHS[month - 1],
      monthPassed,
      suggestedDate,
      term: termAt(suggestedDate, terms)?.term ?? null
    });
  }
  return calls.sort((a, b) => Number(b.monthPassed) - Number(a.monthPassed) || a.suggestedDate.localeCompare(b.suggestedDate));
}

/** The notice that was shorter than the template lead, if the trip stored that key date. */
export function tightestNotice(
  project: Project,
  leads: ExcursionTemplate['default_lead_times']
): TightNotice | null {
  const event = project.current_end_date;
  const dates = project.key_dates;
  if (!event || !dates) return null;
  let worst: (TightNotice & { short: number }) | null = null;
  for (const [field, leadKey, label] of NOTICE) {
    const due = dates[field];
    const need = leads[leadKey];
    if (!due || need == null) continue;
    const had = Math.round((Date.parse(`${event}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`)) / 86_400_000);
    const short = need - had;
    if (short > 0 && (!worst || short > worst.short)) worst = { label, had, need, short };
  }
  return worst ? { label: worst.label, had: worst.had, need: worst.need } : null;
}
