/**
 * The Tideline reference week: T3 W10, Mon 21 – Sun 27 September 2026.
 * Clock frozen at Thu 24/09/26 18:05 Sydney. Mirrors ../fixture.json (generated from this file).
 *
 * Real entries come from Adam's Life calendar screenshot of 24/09/26. Classes, evenings and
 * the timetable are illustrative and marked `sample: true`, so the golden images are
 * reproducible without private data.
 */

export type LogEvent = { record: Record<string, any>; body?: string };
export type Kind = 'teaching' | 'professional' | 'task' | 'health' | 'fitness' | 'corey' | 'study';
export type TimedItem = {
  id: string;
  date: string;
  start: string; // HH:MM
  end: string;
  kind: Kind;
  title: string;
  meta: string;
  isClass?: boolean;
  protected?: boolean;
  sample?: boolean;
  mergedRecords?: number; // duplicates collapsed into this item
};
export type Ghost = {
  id: string;
  agent: 'sara' | 'hammond' | 'clare' | 'chadwick';
  kind: 'skip_workout' | 'bedtime' | 'protect_block' | 'move_task';
  date?: string;
  start?: string;
  end?: string;
  time?: string;
  title?: string;
  with?: 'corey';
  reason?: string;
  workoutPath?: string;
  taskId?: string;
  from?: string;
  to?: string;
  /** What the chip says (the ghost-writes receipt says what Accept writes). */
  label: string;
  meta: string;
  /** Where the chip sits. move_task ghosts sit on the task's all-day chip. */
  chip?: { date: string; start: string; end: string; kind: Kind };
  /** The item this ghost is a proposal about. The ghost sits on top of it; Accept changes it. */
  overItem?: string;
};
export type DueItem = { id: string; date: string; title: string; kind: 'task'; ghostId?: string };
export type Wall = { date: string; label: string };

export const NOW = { date: '2026-09-24', time: '18:05' };
export const WEEK = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27'];
export const SCHOOL_DAYS = new Set(['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25']);
export const HOLIDAY_FROM = '2026-09-26';
export const WEEK_LABEL = { title: 'T3 W10 · last week of term', range: '21/09/26 – 27/09/26' };
export const DAY_TAGS: Record<string, { text: string; tone: 'term' | 'holiday' }> = {
  '2026-09-25': { text: 'Last day T3', tone: 'term' },
  '2026-09-26': { text: 'Holidays', tone: 'holiday' },
  '2026-09-27': { text: 'Holidays', tone: 'holiday' }
};

/** Logs. Capacity is computed from these by apps/life/js/app/capacity-model.js; never typed in. */
export const LOGS: LogEvent[] = [
  { record: { type: 'sleep', date: '2026-09-21', duration_h: 6.9 } },
  { record: { type: 'meal', date: '2026-09-21', meal: 'breakfast', time: '07:30' } },
  { record: { type: 'meal', date: '2026-09-21', meal: 'lunch', time: '12:43' } },
  { record: { type: 'sleep', date: '2026-09-22', duration_h: 6.2 } },
  { record: { type: 'meal', date: '2026-09-22', meal: 'breakfast', time: '07:00' } },
  { record: { type: 'diary', date: '2026-09-22', mood: 'low', energy: 'low', mood_score: 3 }, body: '' },
  { record: { type: 'sleep', date: '2026-09-23', duration_h: 5.9 } },
  { record: { type: 'meal', date: '2026-09-23', meal: 'snack', time: '10:30', protein_g: 17, calories: 452 } },
  { record: { type: 'diary', date: '2026-09-23', time: '08:00' }, body: 'Feeling run down, possible viral illness' },
  { record: { type: 'sleep', date: '2026-09-24', duration_h: 5.4 } },
  { record: { type: 'meal', date: '2026-09-24', meal: 'breakfast', time: '07:10' } },
  { record: { type: 'diary', date: '2026-09-24', time: '07:40' }, body: 'Sore throat, sniffles, poor sleep' }
];

const P: Record<number, [string, string]> = {
  1: ['08:40', '09:35'], 2: ['09:35', '10:30'], 3: ['10:50', '11:45'],
  4: ['11:45', '12:40'], 5: ['13:20', '14:15'], 6: ['14:15', '15:10']
};
function cls(date: string, p: number, title: string, focus: string): TimedItem {
  return { id: `class-${date}-p${p}`, date, start: P[p][0], end: P[p][1], kind: 'teaching', title, meta: `P${p} · ${focus}`, isClass: true, sample: true };
}

export const ITEMS: TimedItem[] = [
  cls('2026-09-21', 1, 'Y12 English Adv', 'Common Module revision'),
  cls('2026-09-21', 2, 'Y11 English Adv', 'Module C drafts'),
  { id: 'resource-day', date: '2026-09-21', start: '10:51', end: '14:50', kind: 'professional', title: 'Focus Area: Texts and human experience · resource day', meta: '10:51 am – 2:50 pm' },
  { id: 'mon-corey', date: '2026-09-21', start: '19:30', end: '21:30', kind: 'corey', title: 'Tea + TV', meta: '7:30 – 9:30 pm', protected: true, sample: true },

  cls('2026-09-22', 1, 'Y11 English Adv', 'Module C'),
  cls('2026-09-22', 3, 'Y12 English Adv', 'HSC practice paper'),
  cls('2026-09-22', 5, 'HPGE planning', 'with Leader of Learning'),
  { id: 'tue-workout', date: '2026-09-22', start: '17:45', end: '18:15', kind: 'fitness', title: 'Workout · 30 min', meta: '5:45 pm', sample: true },
  { id: 'tue-corey', date: '2026-09-22', start: '19:15', end: '21:15', kind: 'corey', title: 'Dinner at home', meta: '7:15 – 9:15 pm', protected: true, sample: true },

  cls('2026-09-23', 2, 'Y12 English Adv', 'Paper 1 timing'),
  cls('2026-09-23', 4, 'Y11 English Adv', 'peer feedback'),
  cls('2026-09-23', 6, 'MindWorks', 'UN Voice coaching'),
  { id: 'wed-marking', date: '2026-09-23', start: '15:40', end: '17:20', kind: 'teaching', title: 'Mark Y11 Module C drafts', meta: '3:40 – 5:20 pm', sample: true },
  { id: 'wed-corey', date: '2026-09-23', start: '19:30', end: '21:30', kind: 'corey', title: 'Tea + TV', meta: '7:30 – 9:30 pm', protected: true, sample: true },

  cls('2026-09-24', 1, 'Y12 English Adv', 'last full lesson'),
  cls('2026-09-24', 3, 'Y11 English Adv', 'drafts returned'),
  { id: 'gastro', date: '2026-09-24', start: '13:15', end: '14:15', kind: 'health', title: 'Gastroenterologist follow-up · Dr Chris Keily', meta: '1:15 pm · 2 records merged', mergedRecords: 2 },
  { id: 'thu-workout', date: '2026-09-24', start: '18:15', end: '19:25', kind: 'fitness', title: 'Workout · upper body', meta: 'Chadwick’s plan', sample: true },
  { id: 'thu-corey', date: '2026-09-24', start: '19:30', end: '21:30', kind: 'corey', title: 'Tea + TV with Corey', meta: 'Protected · 7:30 – 9:30 pm', protected: true, sample: true },

  { id: 'pd-hard-conversations', date: '2026-09-25', start: '08:30', end: '10:30', kind: 'professional', title: 'Courageously Navigating Hard Conversations', meta: '8:30 – 10:30 am · PD' },
  cls('2026-09-25', 3, 'Y11 English Adv', 'end of term'),
  cls('2026-09-25', 5, 'Y12 English Adv', 'farewell lesson'),

  { id: 'sat-gym', date: '2026-09-26', start: '09:00', end: '10:00', kind: 'fitness', title: 'Gym · lower body', meta: '9 – 10 am · Chadwick', sample: true }
];

export const DUE: DueItem[] = [
  { id: 'task-josh-y10', date: '2026-09-25', title: 'Find out about Year 10 leadership opportunities for Josh Lizzio', kind: 'task', ghostId: 'g-move' }
];

export const WALLS: Wall[] = [{ date: '2026-09-27', label: 'Your day · protected' }];

/** Free evenings the view names instead of leaving blank. */
export const FREE = [{ date: '2026-09-25', start: '17:30', end: '22:00', title: '4½ h free', sub: 'End of term. Nothing booked. Keep it that way?' }];

export const GHOSTS: Ghost[] = [
  {
    id: 'g-skip', agent: 'sara', kind: 'skip_workout', date: '2026-09-24', reason: 'capacity 34%, sore throat',
    workoutPath: 'records/2026/09/24/workout-1815.md', label: 'Skip workout', meta: 'Sara · you’re at 34%', overItem: 'thu-workout',
    chip: { date: '2026-09-24', start: '18:15', end: '19:25', kind: 'fitness' }
  },
  {
    id: 'g-bed', agent: 'sara', kind: 'bedtime', date: '2026-09-24', time: '22:00', reason: '5.4 h last night',
    label: 'Lights out 10:00', meta: 'Sara', chip: { date: '2026-09-24', start: '21:30', end: '22:00', kind: 'health' }
  },
  {
    id: 'g-good', agent: 'hammond', kind: 'protect_block', date: '2026-09-26', start: '18:00', end: '22:00',
    title: 'Dinner out + a show', with: 'corey', label: 'Good night: dinner out + a show', meta: 'Hammond · your definition of a good night',
    chip: { date: '2026-09-26', start: '18:00', end: '22:00', kind: 'corey' }
  },
  {
    id: 'g-move', agent: 'hammond', kind: 'move_task', taskId: 'task-josh-y10', title: 'Year 10 leadership opportunities for Josh Lizzio',
    from: '2026-09-25', to: '2026-10-13', label: '→ T4 W1', meta: 'Hammond'
  }
];

export const TRAY = {
  agent: 'hammond',
  headline: '4 changes for the rest of this week',
  detail: 'protects tonight · moves 1 task into T4 W1 · books your good night · nothing crosses a wall'
};

export const SOURCES = [
  { id: 'teaching', label: 'Teaching', count: 11 },
  { id: 'professional', label: 'Professional', count: 3 },
  { id: 'task', label: 'Tasks', count: 1 },
  { id: 'health', label: 'Health', count: 2 },
  { id: 'corey', label: 'Corey', count: 4 }
];
export const AMBIENT = '9 meals · 3 diary · 2 symptoms · 12 notes touched';
