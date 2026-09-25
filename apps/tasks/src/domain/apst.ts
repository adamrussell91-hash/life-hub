import { addDaysKey, mondayOf, termAt, type SchoolTerm } from '@/domain/school-time';

/**
 * Australian Professional Standards for Teachers: the 7 standards and 37 focus areas.
 * Titles are exactly as published by AITSL in "Australian Professional Standards for Teachers"
 * (aitsl.edu.au/docs/default-source/national-policy-framework/australian-professional-standards-for-teachers.pdf).
 * Titles only. Career-stage descriptors are not stored here.
 *
 * This list is the only source for the task editor's focus-area picker, apst_focus validation
 * and the standards ribbon's hover detail. Do not validate codes with a pattern.
 */

export type ApstStandard = { number: 1 | 2 | 3 | 4 | 5 | 6 | 7; title: string; domain: ApstDomain };
export type ApstDomain = 'Professional Knowledge' | 'Professional Practice' | 'Professional Engagement';
export type ApstFocusArea = { code: string; standard: ApstStandard['number']; title: string };

export const APST_STANDARDS: readonly ApstStandard[] = [
  { number: 1, title: 'Know students and how they learn', domain: 'Professional Knowledge' },
  { number: 2, title: 'Know the content and how to teach it', domain: 'Professional Knowledge' },
  { number: 3, title: 'Plan for and implement effective teaching and learning', domain: 'Professional Practice' },
  { number: 4, title: 'Create and maintain supportive and safe learning environments', domain: 'Professional Practice' },
  { number: 5, title: 'Assess, provide feedback and report on student learning', domain: 'Professional Practice' },
  { number: 6, title: 'Engage in professional learning', domain: 'Professional Engagement' },
  { number: 7, title: 'Engage professionally with colleagues, parents/carers and the community', domain: 'Professional Engagement' }
];

export const APST_FOCUS_AREAS: readonly ApstFocusArea[] = [
  { code: '1.1', standard: 1, title: 'Physical, social and intellectual development and characteristics of students' },
  { code: '1.2', standard: 1, title: 'Understand how students learn' },
  { code: '1.3', standard: 1, title: 'Students with diverse linguistic, cultural, religious and socioeconomic backgrounds' },
  { code: '1.4', standard: 1, title: 'Strategies for teaching Aboriginal and Torres Strait Islander students' },
  { code: '1.5', standard: 1, title: 'Differentiate teaching to meet the specific learning needs of students across the full range of abilities' },
  { code: '1.6', standard: 1, title: 'Strategies to support full participation of students with disability' },
  { code: '2.1', standard: 2, title: 'Content and teaching strategies of the teaching area' },
  { code: '2.2', standard: 2, title: 'Content selection and organisation' },
  { code: '2.3', standard: 2, title: 'Curriculum, assessment and reporting' },
  { code: '2.4', standard: 2, title: 'Understand and respect Aboriginal and Torres Strait Islander people to promote reconciliation between Indigenous and non-Indigenous Australians' },
  { code: '2.5', standard: 2, title: 'Literacy and numeracy strategies' },
  { code: '2.6', standard: 2, title: 'Information and Communication Technology (ICT)' },
  { code: '3.1', standard: 3, title: 'Establish challenging learning goals' },
  { code: '3.2', standard: 3, title: 'Plan, structure and sequence learning programs' },
  { code: '3.3', standard: 3, title: 'Use teaching strategies' },
  { code: '3.4', standard: 3, title: 'Select and use resources' },
  { code: '3.5', standard: 3, title: 'Use effective classroom communication' },
  { code: '3.6', standard: 3, title: 'Evaluate and improve teaching programs' },
  { code: '3.7', standard: 3, title: 'Engage parents/carers in the educative process' },
  { code: '4.1', standard: 4, title: 'Support student participation' },
  { code: '4.2', standard: 4, title: 'Manage classroom activities' },
  { code: '4.3', standard: 4, title: 'Manage challenging behaviour' },
  { code: '4.4', standard: 4, title: 'Maintain student safety' },
  { code: '4.5', standard: 4, title: 'Use ICT safely, responsibly and ethically' },
  { code: '5.1', standard: 5, title: 'Assess student learning' },
  { code: '5.2', standard: 5, title: 'Provide feedback to students on their learning' },
  { code: '5.3', standard: 5, title: 'Make consistent and comparable judgements' },
  { code: '5.4', standard: 5, title: 'Interpret student data' },
  { code: '5.5', standard: 5, title: 'Report on student achievement' },
  { code: '6.1', standard: 6, title: 'Identify and plan professional learning needs' },
  { code: '6.2', standard: 6, title: 'Engage in professional learning and improve practice' },
  { code: '6.3', standard: 6, title: 'Engage with colleagues and improve practice' },
  { code: '6.4', standard: 6, title: 'Apply professional learning and improve student learning' },
  { code: '7.1', standard: 7, title: 'Meet professional ethics and responsibilities' },
  { code: '7.2', standard: 7, title: 'Comply with legislative, administrative and organisational requirements' },
  { code: '7.3', standard: 7, title: 'Engage with the parents/carers' },
  { code: '7.4', standard: 7, title: 'Engage with professional teaching networks and broader communities' }
];

const BY_CODE = new Map(APST_FOCUS_AREAS.map((f) => [f.code, f]));

export function isFocusArea(code: string): boolean {
  return BY_CODE.has(code);
}

export function focusArea(code: string): ApstFocusArea | undefined {
  return BY_CODE.get(code);
}

/** "3.2 Plan, structure and sequence learning programs" for chips, tooltips and aria labels. */
export function focusAreaLabel(code: string): string {
  const f = BY_CODE.get(code);
  return f ? `${f.code} ${f.title}` : code;
}

/** Picker groups, in document order. */
export function focusAreasByStandard(): Array<{ standard: ApstStandard; areas: ApstFocusArea[] }> {
  return APST_STANDARDS.map((standard) => ({
    standard,
    areas: APST_FOCUS_AREAS.filter((f) => f.standard === standard.number)
  }));
}

/** Keep valid codes only, de-duplicated, in document order. Use at every write boundary. */
export function sanitizeApstFocus(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const wanted = new Set(raw.map((v) => String(v).trim()));
  return APST_FOCUS_AREAS.filter((f) => wanted.has(f.code)).map((f) => f.code);
}

export type StandardCoverage = 'none' | 'some' | 'evidenced';

/**
 * Ribbon state per standard: evidenced when a done task covers any of its focus areas,
 * some when only open tasks do, none otherwise.
 */
export function standardsCoverage(
  tasks: ReadonlyArray<{ status: string; apst_focus?: readonly string[] | null }>
): Record<ApstStandard['number'], StandardCoverage> {
  const out = { 1: 'none', 2: 'none', 3: 'none', 4: 'none', 5: 'none', 6: 'none', 7: 'none' } as Record<ApstStandard['number'], StandardCoverage>;
  for (const t of tasks) {
    for (const code of t.apst_focus ?? []) {
      const f = BY_CODE.get(code);
      if (!f) continue;
      if (t.status === 'done') out[f.standard] = 'evidenced';
      else if (out[f.standard] === 'none') out[f.standard] = 'some';
    }
  }
  return out;
}

/** School weeks from today through the submission week. Holiday weeks do not count. Past dates are 0. */
export function schoolWeeksUntil(today: string, target: string, terms: readonly SchoolTerm[]): number {
  if (target < today) return 0;
  let count = 0;
  for (let monday = mondayOf(today); monday <= mondayOf(target); monday = addDaysKey(monday, 7)) {
    const school =
      terms.length === 0 ||
      [0, 1, 2, 3, 4].some((offset) => termAt(addDaysKey(monday, offset), terms as SchoolTerm[]) !== null);
    if (school) count += 1;
  }
  return count;
}

/**
 * Uncovered standards inside four school weeks of submission.
 * `loadWeek` is the Monday of the week before submission, and only when a warning is due.
 */
export function standardsRibbonAlert(input: {
  today: string;
  submission: string | null;
  terms: readonly SchoolTerm[];
  coverage: Record<ApstStandard['number'], StandardCoverage>;
}): { standards: ApstStandard['number'][]; loadWeek: string | null } {
  if (!input.submission || schoolWeeksUntil(input.today, input.submission, input.terms) > 4) {
    return { standards: [], loadWeek: null };
  }
  const standards = APST_STANDARDS.map((standard) => standard.number).filter(
    (number) => input.coverage[number] === 'none'
  );
  if (!standards.length) return { standards: [], loadWeek: null };
  return { standards, loadWeek: mondayOf(addDaysKey(input.submission, -7)) };
}

/** Hover and aria copy for one ribbon segment. Titles come from APST_STANDARDS. */
export function ribbonSegmentText(
  standard: ApstStandard['number'],
  state: StandardCoverage,
  lines: readonly string[]
): { aria: string; title: string } {
  const meta = APST_STANDARDS.find((item) => item.number === standard);
  const aria = `Standard ${standard}, ${meta?.title ?? ''}: ${state}`;
  return { aria, title: lines.length ? `${aria}\n${lines.join('\n')}` : aria };
}
