/* Fixture for the Timeline reference. Identical data lives in fixture.json. Clock: 2026-09-22 09:00 Sydney. */

export type Dom = 'teaching' | 'professional' | 'life';
export const DOMAIN_COLOUR: Record<Dom, string> = {
  teaching: '#376fb7',
  professional: '#5d4e70',
  life: '#2f7a4f'
};

export type FxTask = {
  id: string;
  title: string;
  project: string | null;
  parent?: string;
  domain: Dom;
  due: string | null;
  est: number | null; // minutes
  status: 'done' | 'open' | 'in_progress';
  blocked?: boolean;
  deps?: string[];
  step?: number;
  apst?: string[];
  marking?: { cls: string; scripts: number; marked: number; rate: number; collected: string; returnBy: string; learned: boolean };
};

export type FxMilestone = { id: string; project: string; title: string; due: string; deps?: string[] };
export type FxProject = {
  id: string;
  title: string;
  goal: string | null;
  domain: Dom;
  start: string;
  end: string;
  baselineEnd?: string;
  ribbon?: boolean;
  submission?: string;
  shade?: number;
};
export type FxGoal = { id: string; title: string; dream: string | null };
export type FxDream = { id: string; title: string; target: string; origin: string | null };
export type FxWall = { id: string; label: string; start: string; end: string; source: string };

export const TODAY = '2026-09-22';

export const TERMS = [
  { term: 3, start: '2026-07-21', end: '2026-09-25' },
  { term: 4, start: '2026-10-13', end: '2026-12-17' }
];

export const RANGE = { start: '2026-07-20', end: '2027-01-31' };

/** Planning profile work windows, minutes per weekday (Mon..Sun). Sets the load capacity. */
export const WINDOW_MINUTES = [120, 120, 120, 120, 120, 120, 0];

export const DREAMS: FxDream[] = [
  { id: 'd-publish', title: 'Publish HPGE research', target: '2027-03-01', origin: '2025-11-01' }
];

export const GOALS: FxGoal[] = [
  { id: 'g-gifted', title: 'Gifted programs', dream: null },
  { id: 'g-lead', title: 'Leadership', dream: 'd-publish' }
];

export const PROJECTS: FxProject[] = [
  { id: 'p-tom', title: 'Tournament of Minds', goal: 'g-gifted', domain: 'teaching', start: '2026-09-01', end: '2026-10-03' },
  { id: 'p-un', title: 'UN Voice Competition 2026', goal: 'g-gifted', domain: 'teaching', start: '2026-09-14', end: '2026-11-06', shade: 1 },
  { id: 'p-hpge', title: 'HPGE policy', goal: 'g-lead', domain: 'professional', start: '2026-07-20', end: '2026-11-20', baselineEnd: '2026-11-06' },
  { id: 'p-mentor', title: 'Accreditation mentoring', goal: 'g-lead', domain: 'professional', start: '2026-09-07', end: '2026-12-11', ribbon: true, submission: '2026-12-11', shade: 1 },
  { id: 'p-seat', title: 'Seating change', goal: null, domain: 'teaching', start: '2026-09-14', end: '2026-10-14' }
];

export const MILESTONES: FxMilestone[] = [
  { id: 'm-finals', project: 'p-tom', title: 'Finals', due: '2026-10-03', deps: ['t6'] },
  { id: 'm-heat', project: 'p-un', title: 'School heat', due: '2026-10-28', deps: ['u3'] },
  { id: 'm-regional', project: 'p-un', title: 'Regional final', due: '2026-11-06', deps: ['m-heat'] },
  { id: 'm-board', project: 'p-hpge', title: 'Board', due: '2026-11-20', deps: ['h4'] },
  { id: 'm-submit', project: 'p-mentor', title: 'Submission', due: '2026-12-11', deps: ['r5'] },
  { id: 'm-room', project: 'p-seat', title: 'Room swap', due: '2026-10-14' }
];

export const TASKS: FxTask[] = [
  { id: 't1', title: 'Register team', project: 'p-tom', domain: 'teaching', due: '2026-09-03', est: 30, status: 'done', step: 1 },
  { id: 't2', title: 'Student list', project: 'p-tom', domain: 'teaching', due: '2026-09-10', est: 60, status: 'done', step: 2, deps: ['t1'] },
  { id: 't3', title: 'Permission notes', project: 'p-tom', domain: 'teaching', due: '2026-09-24', est: 90, status: 'in_progress', step: 3, deps: ['t2'] },
  { id: 't3a', title: 'Risk form', project: 'p-tom', parent: 't3', domain: 'teaching', due: '2026-09-26', est: 30, status: 'open', deps: ['t3'] },
  { id: 't3b', title: 'Medical forms', project: 'p-tom', parent: 't3', domain: 'teaching', due: null, est: null, status: 'open' },
  { id: 't4', title: 'Get bus quote', project: 'p-tom', domain: 'teaching', due: '2026-09-23', est: 15, status: 'open', step: 4 },
  { id: 't5', title: 'Book bus', project: 'p-tom', domain: 'teaching', due: '2026-09-25', est: 30, status: 'open', blocked: true, step: 5, deps: ['t4'] },
  { id: 't6', title: 'Excursion form', project: 'p-tom', domain: 'teaching', due: '2026-09-29', est: 60, status: 'open', step: 6, deps: ['t5', 't3a'] },

  { id: 'u1', title: 'Heats schedule', project: 'p-un', domain: 'teaching', due: '2026-09-18', est: 60, status: 'done', step: 1 },
  { id: 'u2', title: 'Speech drafts', project: 'p-un', domain: 'teaching', due: '2026-10-16', est: 180, status: 'open', step: 2, deps: ['u1'] },
  { id: 'u3', title: 'Coaching sessions', project: 'p-un', domain: 'teaching', due: '2026-10-23', est: 240, status: 'open', step: 3, deps: ['u2'] },
  { id: 'u4', title: 'Book room', project: 'p-un', domain: 'teaching', due: null, est: 10, status: 'open', step: 4 },
  { id: 'u5', title: 'Confirm judges', project: 'p-un', domain: 'teaching', due: null, est: 20, status: 'open', step: 5 },

  { id: 'h1', title: 'Review findings', project: 'p-hpge', domain: 'professional', due: '2026-08-20', est: 120, status: 'done', step: 1 },
  { id: 'h2', title: 'Collate data', project: 'p-hpge', domain: 'professional', due: '2026-09-10', est: 180, status: 'done', step: 2, deps: ['h1'] },
  { id: 'h3', title: 'Draft procedures', project: 'p-hpge', domain: 'professional', due: '2026-10-23', est: 240, status: 'in_progress', step: 3, deps: ['h2'] },
  { id: 'h4', title: 'Exec feedback', project: 'p-hpge', domain: 'professional', due: '2026-11-06', est: 60, status: 'open', step: 4, deps: ['h3'] },

  { id: 'r1', title: 'Observation 1', project: 'p-mentor', domain: 'professional', due: '2026-09-11', est: 90, status: 'done', step: 1, apst: ['3.2', '4.1'] },
  { id: 'r2', title: 'Annotate evidence', project: 'p-mentor', domain: 'professional', due: '2026-09-18', est: 120, status: 'done', step: 2, apst: ['1.2', '2.1'] },
  { id: 'r3', title: 'Observation debrief', project: 'p-mentor', domain: 'professional', due: '2026-09-25', est: 45, status: 'open', step: 3, apst: ['6.4'] },
  { id: 'r4', title: 'Referee statements', project: 'p-mentor', domain: 'professional', due: '2026-11-13', est: 90, status: 'open', step: 4, apst: ['7.4'] },
  { id: 'r5', title: 'Evidence map', project: 'p-mentor', domain: 'professional', due: '2026-11-27', est: 180, status: 'open', step: 5, deps: ['r4'] },

  { id: 's1', title: 'Email Simone', project: 'p-seat', domain: 'teaching', due: null, est: 5, status: 'open', step: 1 },
  { id: 's2', title: 'Book maintenance', project: 'p-seat', domain: 'teaching', due: null, est: null, status: 'open', step: 2 },
  { id: 's3', title: 'Confirm room', project: 'p-seat', domain: 'teaching', due: null, est: null, status: 'open', step: 3 },

  { id: 'k1', title: '9B essays', project: null, domain: 'teaching', due: '2026-10-02', est: 168, status: 'in_progress',
    marking: { cls: '9B', scripts: 28, marked: 18, rate: 6, collected: '2026-09-21', returnBy: '2026-10-02', learned: true } },
  { id: 'k2', title: '10ENG2 essays', project: null, domain: 'teaching', due: '2026-10-19', est: 252, status: 'open',
    marking: { cls: '10ENG2', scripts: 28, marked: 0, rate: 9, collected: '2026-10-16', returnBy: '2026-10-19', learned: true } },

  { id: 'x1', title: 'Year 10 reports', project: null, domain: 'teaching', due: '2026-10-20', est: 240, status: 'open' },
  { id: 'x2', title: 'NESA assessor report', project: null, domain: 'professional', due: '2026-09-30', est: 180, status: 'open' },
  { id: 'x3', title: 'Term 4 unit plan', project: null, domain: 'teaching', due: '2026-10-12', est: 240, status: 'open' },
  { id: 'x4', title: 'HALT advisory prep', project: null, domain: 'professional', due: '2026-10-22', est: 90, status: 'open' }
];

export const WALLS: FxWall[] = [
  { id: 'w-trip', label: 'Overseas trip', start: '2026-12-12', end: '2027-01-06', source: 'p-trip' }
];

/** Critical path over the Tournament of Minds chain (the app computes this with criticalPath()). */
export const CRITICAL = new Set(['t4', 't5', 't6', 'm-finals', 't4>t5', 't5>t6', 't6>m-finals']);

/** Hammond's proposal for the reference "Ask Hammond" state. */
export const HAMMOND = {
  headline: 'Hammond suggests 3 changes',
  detail: 'clears T4 W2 · nothing moves into a wall · no hard deadlines move',
  changes: [
    { id: 'h3', due: '2026-10-30', why: 'Draft procedures after marking is back' },
    { id: 'u3', due: '2026-10-27', why: 'Coaching still lands before the heat' },
    { id: 'x4', due: '2026-10-29', why: 'Advisory prep after the heat' }
  ]
};
