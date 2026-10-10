/**
 * Grove plan: completed-task history → trees, clearings and ground cover.
 *
 * Pure and deterministic. The same history and clock always give the same forest, so
 * nothing is stored: no game state, no daily job. Rules (apps/life/assets/grove/README.md):
 * - Every completed task plants one tree on the Sydney day it was completed.
 * - Species follows the task's domain; unknown domains grow `other`.
 * - A task finished after its due date grows a gnarled `late` tree. Not a penalty.
 * - Trees grow from sapling to mature over GROWTH_DAYS of real time.
 * - Deleted tasks are gone. Reopened tasks lose their tree (their completed_at is cleared).
 * - Done tasks with no completion timestamp are counted, never given an invented date.
 * - Placement is stable: a tree's spot depends only on earlier completions that day,
 *   so finishing another task later never moves the trees already standing.
 */
import { isDeletedRecord } from '../../../design-kit/js/record-liveness.js';
import { toHubDateKey } from '@/domain/queries';
import { GROVE_SPECIES, HUB_SPECIES, PROP_VARIANTS, TREE_VARIANTS, type GrovePropKind, type GroveSpecies } from './assets';
import { addDays, daysBetween, isDateKey, mondayOf, weekdayIndex } from './dates';
import { hashString, seededRandom } from './random';

export const GROWTH_DAYS = 3;
/** Minimum distance between two trunks, in metres. A mature canopy is about 2.5 m across. */
export const TREE_SPACING = 2.6;
/** Distance between neighbouring day clearings, in metres. */
export const DAY_CELL = 30;
/** Smallest a tree is drawn, as a fraction of its mature height (about a 0.7 m sapling). */
export const SAPLING_SCALE = 0.13;
/** Each species' patch sits this far from the clearing centre, so species grow in their own patches. */
const PATCH_OFFSET = 4.2;
const MIN_RADIUS = 5;
const EPOCH_MONDAY = '2024-01-01';
const DAY_MS = 86_400_000;

export type GroveView = 'day' | 'week';
export type GroveStage = 'sapling' | 'young' | 'mature';

/** The fields Grove reads from a task. Everything else is ignored. */
export type GroveTaskInput = {
  id: string;
  title?: string | null;
  domain?: string | null;
  status?: string | null;
  bucket?: string | null;
  completed_at?: string | null;
  due_date?: string | null;
};

export type GroveCompletion = {
  id: string;
  title: string;
  domain: string;
  species: GroveSpecies;
  late: boolean;
  dayKey: string;
  completedAt: string;
  completedMs: number;
};

export type GroveTree = GroveCompletion & {
  variant: number;
  growth: number;
  stage: GroveStage;
  /** Fraction of mature size. */
  scale: number;
  x: number;
  z: number;
  rotation: number;
};

export type GroveProp = {
  id: string;
  kind: GrovePropKind;
  variant: number;
  x: number;
  z: number;
  scale: number;
  rotation: number;
};

export type GroveDay = {
  key: string;
  /** Monday = 0. */
  weekday: number;
  weekend: boolean;
  future: boolean;
  today: boolean;
  /** Clearing centre in world metres. Stable for a date whatever the view. */
  cx: number;
  cz: number;
  radius: number;
  trees: GroveTree[];
  props: GroveProp[];
};

export type GrovePlan = {
  view: GroveView;
  anchor: string;
  today: string;
  from: string;
  to: string;
  days: GroveDay[];
  trees: GroveTree[];
  counts: Record<GroveSpecies, number>;
  /** Done tasks with no usable completion time. Shown as a note, never planted. */
  undated: number;
};

function isDone(task: GroveTaskInput): boolean {
  return task.status === 'done' || task.bucket === 'done';
}

function speciesFor(domain: string, late: boolean): GroveSpecies {
  if (late) return 'late';
  return HUB_SPECIES.has(domain) ? (domain as GroveSpecies) : 'other';
}

/** Completed, live tasks with a real completion time, oldest first. */
export function groveCompletions(
  tasks: readonly GroveTaskInput[],
  timeZone?: string
): { completions: GroveCompletion[]; undated: number } {
  const completions: GroveCompletion[] = [];
  let undated = 0;
  for (const task of tasks) {
    if (!task || typeof task !== 'object' || typeof task.id !== 'string' || !task.id) continue;
    if (isDeletedRecord(task)) continue;
    if (!isDone(task)) continue;
    const completedMs = typeof task.completed_at === 'string' ? Date.parse(task.completed_at) : NaN;
    if (!Number.isFinite(completedMs)) {
      undated += 1;
      continue;
    }
    const dayKey = toHubDateKey(new Date(completedMs), timeZone);
    const due = typeof task.due_date === 'string' ? task.due_date.slice(0, 10) : '';
    const late = isDateKey(due) && dayKey > due;
    const domain = typeof task.domain === 'string' && task.domain ? task.domain : 'other';
    completions.push({
      id: task.id,
      title: typeof task.title === 'string' && task.title.trim() ? task.title.trim() : 'Untitled task',
      domain,
      species: speciesFor(domain, late),
      late,
      dayKey,
      completedAt: new Date(completedMs).toISOString(),
      completedMs
    });
  }
  completions.sort((a, b) => a.completedMs - b.completedMs || a.id.localeCompare(b.id));
  return { completions, undated };
}

export function growthAt(completedMs: number, nowMs: number): number {
  return Math.min(1, Math.max(0, (nowMs - completedMs) / (GROWTH_DAYS * DAY_MS)));
}

export function stageFor(growth: number): GroveStage {
  if (growth >= 1) return 'mature';
  return growth < 1 / 3 ? 'sapling' : 'young';
}

/** Ease out so a new sapling visibly shoots up on day one, then settles. */
export function scaleFor(growth: number): number {
  const eased = 1 - (1 - growth) ** 3;
  return SAPLING_SCALE + (1 - SAPLING_SCALE) * eased;
}

export function groveWindow(view: GroveView, anchor: string): string[] {
  if (view === 'day') return [anchor];
  const monday = mondayOf(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Clearing centre for a date: a weekly row, nudged so the forest never reads as a grid. */
export function dayCentre(key: string): { x: number; z: number } {
  const week = Math.floor(daysBetween(EPOCH_MONDAY, mondayOf(key)) / 7);
  const rand = seededRandom(`centre:${key}`);
  return {
    x: weekdayIndex(key) * DAY_CELL + (rand() - 0.5) * 6,
    z: week * DAY_CELL + (rand() - 0.5) * 6
  };
}

/** Where a species' patch sits in a clearing. The wheel turns a little each day. */
function patchCentre(dayKey: string, species: GroveSpecies, alone: boolean): { x: number; z: number } {
  if (alone) return { x: 0, z: 0 };
  const turn = seededRandom(`wheel:${dayKey}`)() * Math.PI * 2;
  const angle = turn + (GROVE_SPECIES.indexOf(species) / GROVE_SPECIES.length) * Math.PI * 2;
  return { x: Math.cos(angle) * PATCH_OFFSET, z: Math.sin(angle) * PATCH_OFFSET };
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function placeTrees(dayKey: string, completions: GroveCompletion[], nowMs: number): GroveTree[] {
  const alone = new Set(completions.map((c) => c.species)).size <= 1;
  const placed: GroveTree[] = [];
  for (const completion of completions) {
    const rand = seededRandom(`tree:${completion.id}`);
    const patch = patchCentre(dayKey, completion.species, alone);
    const spin = rand() * Math.PI * 2;
    let x = patch.x;
    let z = patch.z;
    // Sunflower spiral out from the patch centre; first spot clear of every earlier trunk wins.
    for (let k = 0; k < 400; k += 1) {
      const r = k === 0 ? 0 : TREE_SPACING * 0.62 * Math.sqrt(k);
      const a = spin + k * GOLDEN_ANGLE;
      const cx = patch.x + Math.cos(a) * r + (rand() - 0.5) * 0.6;
      const cz = patch.z + Math.sin(a) * r + (rand() - 0.5) * 0.6;
      if (placed.every((t) => Math.hypot(t.x - cx, t.z - cz) >= TREE_SPACING)) {
        x = cx;
        z = cz;
        break;
      }
    }
    const growth = growthAt(completion.completedMs, nowMs);
    placed.push({
      ...completion,
      variant: 1 + (hashString(`variant:${completion.id}`) % TREE_VARIANTS[completion.species]),
      growth,
      stage: stageFor(growth),
      scale: scaleFor(growth),
      x: round(x),
      z: round(z),
      rotation: round(rand() * Math.PI * 2)
    });
  }
  return placed;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Grass everywhere, flowers that thicken with the day's work, softer meadows at weekends. */
function placeProps(day: { key: string; weekend: boolean; radius: number }, trees: GroveTree[]): GroveProp[] {
  const rand = seededRandom(`props:${day.key}`);
  const props: GroveProp[] = [];
  const clear = (x: number, z: number, gap: number) =>
    trees.every((t) => Math.hypot(t.x - x, t.z - z) >= gap) &&
    props.every((p) => Math.hypot(p.x - x, p.z - z) >= 0.45);
  const scatter = (kind: GrovePropKind, count: number, inner: number, outer: number, gap: number, size: [number, number]) => {
    for (let i = 0, tries = 0; i < count && tries < count * 12; tries += 1) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(inner * inner + rand() * (outer * outer - inner * inner));
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (!clear(x, z, gap)) continue;
      props.push({
        id: `${day.key}:${kind}:${i}`,
        kind,
        variant: 1 + Math.floor(rand() * PROP_VARIANTS[kind]),
        x: round(x),
        z: round(z),
        scale: round(size[0] + rand() * (size[1] - size[0])),
        rotation: round(rand() * Math.PI * 2)
      });
      i += 1;
    }
  };
  const n = trees.length;
  const reach = day.radius + 2.5;
  scatter('grass', 16 + n * 2 + (day.weekend ? 8 : 0), 0, reach, 0.7, [0.8, 1.5]);
  scatter('flower', 4 + n * 2 + (day.weekend ? 10 : 0), 0, reach, 0.8, [0.8, 1.3]);
  scatter('bush', 3 + Math.min(4, Math.floor(n / 3)), day.radius - 0.5, reach + 1.5, 1.6, [0.8, 1.4]);
  scatter('rock', 1 + Math.floor(rand() * 2), day.radius * 0.5, reach + 1, 1.4, [0.6, 1.1]);
  if (n > 0) scatter('mushroom', 1 + Math.floor(rand() * 3), 0, day.radius, 0.6, [0.9, 1.4]);
  return props;
}

export function buildGrovePlan(input: {
  tasks: readonly GroveTaskInput[];
  view: GroveView;
  anchor: string;
  now: Date;
  timeZone?: string;
}): GrovePlan {
  const nowMs = input.now.getTime();
  const today = toHubDateKey(input.now, input.timeZone);
  const keys = groveWindow(input.view, input.anchor);
  const { completions, undated } = groveCompletions(input.tasks, input.timeZone);
  const byDay = new Map<string, GroveCompletion[]>();
  for (const completion of completions) {
    const list = byDay.get(completion.dayKey);
    if (list) list.push(completion);
    else byDay.set(completion.dayKey, [completion]);
  }
  const counts = Object.fromEntries(GROVE_SPECIES.map((s) => [s, 0])) as Record<GroveSpecies, number>;
  const days: GroveDay[] = keys.map((key) => {
    const trees = placeTrees(key, byDay.get(key) ?? [], nowMs);
    for (const tree of trees) counts[tree.species] += 1;
    const reach = trees.reduce((max, t) => Math.max(max, Math.hypot(t.x, t.z) + 2.2), 0);
    const radius = round(Math.max(MIN_RADIUS, reach));
    const weekday = weekdayIndex(key);
    const weekend = weekday >= 5;
    const centre = dayCentre(key);
    return {
      key,
      weekday,
      weekend,
      future: key > today,
      today: key === today,
      cx: round(centre.x),
      cz: round(centre.z),
      radius,
      trees,
      props: placeProps({ key, weekend, radius }, trees)
    };
  });
  return {
    view: input.view,
    anchor: input.anchor,
    today,
    from: keys[0]!,
    to: keys[keys.length - 1]!,
    days,
    trees: days.flatMap((d) => d.trees),
    counts,
    undated
  };
}
