/**
 * Small DOM helpers and shared wording for the classroom observation workspace (planning, observing,
 * reflecting, export). The NESA template wording lives here so every view and the export page use the
 * same text. Template: NESA Observation Report (June 2026).
 */
import { descriptorByCode } from './descriptors';
import type { Decision, LogKind, Observation } from './types';

type Child = Node | string | null | undefined | false;
type Attrs = Record<string, string | number | boolean | null | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (name === 'class') node.className = String(value);
    else node.setAttribute(name, value === true ? '' : String(value));
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'string' ? doc.createTextNode(child) : child);
  }
  return node;
}

/** What each view gets from the workspace: the live record, a way to change it, and the clock. */
export interface ObsCtx {
  doc: Document;
  obs(): Observation;
  /** Apply a change. 'later' waits ~600ms before saving (typing); 'now' saves at once. */
  change(fn: (o: Observation) => Observation, when: 'later' | 'now'): void;
  now(): Date;
}

export interface ObsView {
  el: HTMLElement;
  destroy(): void;
}

/** Slot colour class for the descriptor at `index` (0-based): obs-c1 … obs-c4. */
export const slotClass = (index: number): string => `obs-c${Math.min(Math.max(index, 0), 3) + 1}`;

export function slotOf(obs: Observation, code: string | null): string {
  const i = code ? obs.descriptors.findIndex((d) => d.code === code) : -1;
  return i < 0 ? '' : slotClass(i);
}

export const focusOf = (code: string): string => descriptorByCode(code)?.focus ?? code;
export const textOf = (code: string): string => descriptorByCode(code)?.text ?? '';

export const KINDS: Array<{ kind: LogKind; key: string; label: string; short: string; cls: string }> = [
  { kind: 'strength', key: '+', label: 'Strength', short: '+', cls: 'obs-kind--str' },
  { kind: 'next', key: '>', label: 'Next step', short: '> Next', cls: 'obs-kind--next' },
  { kind: 'ask', key: '?', label: 'Ask about', short: '?', cls: 'obs-kind--ask' },
  { kind: 'said', key: '"', label: 'Student said', short: '"', cls: 'obs-kind--said' }
];
export const KIND_KEYS: Record<string, LogKind> = { '+': 'strength', '=': 'strength', '>': 'next', '.': 'next', '?': 'ask', '/': 'ask', '"': 'said', "'": 'said' };
export const kindMeta = (kind: LogKind) =>
  KINDS.find((k) => k.kind === kind) ?? { kind, key: '', label: '⏱ Transition', short: '⏱', cls: 'obs-kind--said' };

export const DECISIONS: Array<{ value: Decision; label: string; full: string; cls: string }> = [
  { value: 'observed', label: 'Observed', full: 'Observed', cls: 'is-o' },
  { value: 'partial', label: 'Partially', full: 'Partially observed', cls: 'is-p' },
  { value: 'not', label: 'Not', full: 'Not observed', cls: 'is-x' }
];

/** "Mon 16 Nov" for an instant, in `timeZone` (the browser's own when omitted or unknown). */
export function formatDay(t: number, timeZone?: string): string {
  const opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' };
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-AU', { ...opts, timeZone: timeZone || undefined }).formatToParts(t);
  } catch {
    parts = new Intl.DateTimeFormat('en-AU', opts).formatToParts(t);
  }
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('weekday')} ${part('day')} ${part('month')}`.trim();
}

/** "Mon 16 Nov" from YYYY-MM-DD. */
export function dayLabel(ymd: string): string {
  const t = Date.parse(`${ymd.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(t) ? formatDay(t, 'UTC') : ymd;
}

/** A labelled textarea (or input) whose label is a template question. Calls onInput with each change. */
export function field(
  doc: Document,
  opts: { label: string; hint?: string; value: string; onInput: (v: string) => void; rows?: number; input?: boolean; name?: string; cls?: string }
): { wrap: HTMLElement; control: HTMLTextAreaElement | HTMLInputElement } {
  const control = opts.input
    ? h(doc, 'input', { type: 'text', class: 'obs-input', name: opts.name })
    : h(doc, 'textarea', { class: 'obs-input obs-textarea', rows: opts.rows ?? 3, name: opts.name });
  control.value = opts.value;
  control.addEventListener('input', () => opts.onInput(control.value));
  const label = h(doc, 'label', { class: `obs-field ${opts.cls ?? ''}`.trim() },
    h(doc, 'span', { class: 'obs-ask' }, opts.label, opts.hint ? h(doc, 'i', {}, ` · ${opts.hint}`) : null),
    control);
  return { wrap: label, control };
}

/** Set a control's value unless Adam is typing in it. */
export function syncValue(control: HTMLTextAreaElement | HTMLInputElement, value: string): void {
  if (control.ownerDocument.activeElement === control) return;
  if (control.value !== value) control.value = value;
}

// ---------------------------------------------------------------- NESA template wording

export const NESA = {
  title: 'Observation Report',
  intro: 'Teachers must submit a report on an observation of their teaching practice to finalise their accreditation at Proficient Teacher.',
  phases: {
    planning: { name: 'Phase 1 – Planning', about: 'The Accreditation Supervisor and teacher meet to discuss, plan and agree on the lesson/teaching and learning experience and the two to four Standard Descriptors to be observed.' },
    observing: { name: 'Phase 2 – Observing', about: 'The Accreditation Supervisor observes the teacher, notes whether the agreed Standard Descriptors have been observed and records any feedback to provide to the teacher about their practice.' },
    reflecting: { name: 'Phase 3 – Reflecting', about: 'The Accreditation Supervisor and teacher meet to discuss the teacher’s reflection on their practice and the Accreditation Supervisor’s feedback on the observation.' }
  },
  teacherDetails: 'Teacher’s details',
  supervisorDetails: 'Accreditation Supervisor’s details',
  fullName: 'Full name',
  nesaNumber: 'NESA account number',
  email: 'Email address',
  school: 'Main school/service',
  source: 'Based on the NESA Observation Report template (June 2026)',
  p1: {
    descriptors: {
      head: 'Standard Descriptors',
      which: 'Which 2-4 Standard Descriptors will be observed during the lesson/teaching and learning experience?',
      why: 'Why have you selected these?',
      practice: 'What teaching practice is described by the Standard Descriptors?'
    },
    strategies: {
      head: 'Teaching and learning strategies',
      demonstrate: 'What will you do to demonstrate the Standard Descriptors?',
      allStudents: 'How will you ensure you have planned for all students/children?',
      lesson: 'What specific lessons/teaching and learning experiences will be observed?',
      syllabus: 'How does this link to the syllabus/program/sequence of learning/Early Years Learning Framework?'
    },
    impact: {
      head: 'Impact of practice',
      planned: 'What is the planned impact on student/child engagement and learning?',
      howKnow: 'How will you know your teaching practice has been effective?',
      measure: 'What specific assessment/feedback/measurement will you use to determine this?'
    }
  },
  p2: {
    descriptor: 'Standard Descriptor',
    practiceHead: 'Teaching practice',
    practiceQs: [
      'What teaching and learning strategies did you observe aligned to the agreed Standard Descriptors?',
      'What teaching practice did you observe? How did this demonstrate the agreed Standard Descriptors?'
    ],
    strengthsHead: 'Observation Strengths',
    strengthsQ: 'Evaluate how well the teacher’s practice demonstrated the agreed Standard Descriptors.',
    decisionHead: 'Record of decision against the Standard Descriptor',
    decisionQ: 'Observed / Partially observed / Not observed (select one)',
    comments: 'Other comments'
  },
  p3: {
    descriptor: 'Standard Descriptor',
    teacherHead: 'Teacher’s reflection',
    teacherQs: [
      'What are your key reflections on your teaching practice?',
      'How did you demonstrate the agreed Standard Descriptors?'
    ],
    feedbackHead: 'Accreditation Supervisor’s feedback',
    feedbackShown: 'Comment/feedback on the agreed Standard Descriptors that were successfully demonstrated and observed.',
    feedbackAdvice: 'What advice would you give to assist the further development of the agreed Standard Descriptors that were partially observed or not observed to improve teaching practice?',
    teacherSig: 'Teacher’s signature:',
    supervisorSig: 'Accreditation Supervisor’s signature:',
    date: 'Date:'
  }
} as const;
