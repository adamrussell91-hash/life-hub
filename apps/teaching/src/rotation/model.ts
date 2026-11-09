import type { Block } from '@/schemas/block';
import { QuizQuestionSchema } from '@/quiz/core';
import {
  PRESET_INFO,
  ROTATION_KIND_INFO,
  ROTATION_ROLES,
  ROTATION_ROLE_ORDER,
  WrittenGateSchema,
  type RotationLevel,
  type RotationPreset,
  type RotationRole,
  type RotationSettings,
  type Station
} from './schema';
import { unlockProblems } from './rules';

type RotationLesson = { rotation?: RotationSettings | undefined; blocks: Block[] };

export const MAX_STATIONS = 8;
export const PRETEST_PER_STATION = 3;
export const MAX_HINTS = 3;

// ---------------------------------------------------------------- sections and roles

/** The station a top-level section holds blocks for, if it is a station section. */
export const rotationStationOf = (b: Block): string | undefined =>
  b.block_type === 'section' && typeof b.content.rotation_station === 'string' ? b.content.rotation_station : undefined;

/** The top-level section that holds the finale's own blocks. */
export const isRotationFinale = (b: Block): boolean => b.block_type === 'section' && b.content.rotation_finale === true;

export const findStationSection = (blocks: Block[], stationId: string): Block | undefined => blocks.find((b) => rotationStationOf(b) === stationId);

export const sectionBlocks = (section: Block | undefined): Block[] => (section?.block_type === 'section' ? (section.content.blocks as Block[]) : []);

const settingOf = (b: Block, key: string): unknown => (b.settings as Record<string, unknown> | undefined)?.[key];

/** A block's role on the station card. Absent or unknown is a step. */
export function roleOf(b: Block): RotationRole {
  const role = settingOf(b, 'rotation_role');
  return typeof role === 'string' && (ROTATION_ROLES as readonly string[]).includes(role) ? (role as RotationRole) : 'step';
}

/** The level a block is for; absent means every level. */
export function levelOf(b: Block): RotationLevel | undefined {
  const level = settingOf(b, 'level');
  return level === 'support' || level === 'core' || level === 'extend' ? level : undefined;
}

/** How a block after the gate shows before it opens. Blurred unless set to hidden. */
export const gateViewOf = (b: Block): 'blurred' | 'hidden' => (settingOf(b, 'gate_view') === 'hidden' ? 'hidden' : 'blurred');

/** Arrival recall: which station it draws from. 'previous' is whichever the student did last. */
export const arrivalFromOf = (b: Block): string => {
  const from = settingOf(b, 'arrival_from');
  return typeof from === 'string' && from ? from : 'previous';
};

export function withSettings(b: Block, change: Record<string, unknown>): Block {
  const settings = { ...((b.settings as Record<string, unknown>) ?? {}) };
  for (const [k, v] of Object.entries(change)) {
    if (v === undefined || v === null || v === '') delete settings[k];
    else settings[k] = v;
  }
  return { ...b, settings } as Block;
}

/** A station's blocks in card order, by role; a block keeps its section order within its role. */
export function cardOrder(blocks: Block[]): Block[] {
  return ROTATION_ROLE_ORDER.flatMap((role) => blocks.filter((b) => roleOf(b) === role));
}

/** Blocks for one level: untagged blocks show at every level. */
export const forLevel = (blocks: Block[], level: RotationLevel): Block[] => blocks.filter((b) => {
  const l = levelOf(b);
  return !l || l === level;
});

export const isHingeGate = (b: Block): boolean => b.block_type === 'hinge_question' && roleOf(b) === 'gate';

// ---------------------------------------------------------------- new things

/** A preset only sets path, dial and evidence. */
export function applyPreset(r: RotationSettings, preset: RotationPreset): RotationSettings {
  const p = PRESET_INFO[preset];
  return { ...r, path: p.path, dial: p.dial, evidence: p.evidence };
}

export function presetOf(r: Pick<RotationSettings, 'path' | 'dial' | 'evidence'>): RotationPreset | null {
  for (const [key, p] of Object.entries(PRESET_INFO)) if (p.path === r.path && p.dial === r.dial && p.evidence === r.evidence) return key as RotationPreset;
  return null;
}

export const suggestionFor = (kind: Station['kind']): string => `Suggests: ${ROTATION_KIND_INFO[kind].mode}`;

// ---------------------------------------------------------------- publish checks

const filled = (s: string | undefined): boolean => !!s && s.trim().length > 0;
const textOf = (b: Block): string => {
  if (b.block_type === 'rich_text') return String(b.content.html ?? '').replace(/<[^>]+>/g, ' ').trim();
  return 'x';
};
const name = (s: Station): string => s.title.trim() || 'A station';

/** Publish blockers, in the teacher's words. */
export function rotationIssues(lesson: RotationLesson): string[] {
  const r = lesson.rotation;
  if (!r) return ['Set up the rotation: add stations, a pretest and a class.'];
  const out: string[] = [];
  const learning = r.stations.filter((s) => s.kind !== 'teacher');
  const teachers = r.stations.filter((s) => s.kind === 'teacher');
  if (!filled(r.class_id)) out.push('Pick the class this rotation is for.');
  if (learning.length < 2) out.push('Add at least 2 stations.');
  if (learning.length > MAX_STATIONS) out.push(`A rotation can have at most ${MAX_STATIONS} stations, plus one teacher station.`);
  if (teachers.length > 1) out.push('Keep to one teacher station.');
  for (const s of r.stations) {
    if (!filled(s.title)) out.push('Every station needs a title.');
    const section = findStationSection(lesson.blocks, s.id);
    if (!section) { out.push(`${name(s)} has no content yet. Open it with Edit.`); continue; }
    if (s.kind === 'teacher') continue;
    const blocks = sectionBlocks(section);
    const goal = blocks.find((b) => roleOf(b) === 'goal');
    if (!goal || !textOf(goal)) out.push(`${name(s)} needs a goal.`);
    const exits = blocks.filter((b) => roleOf(b) === 'exit' && b.block_type === 'quiz_question');
    if (exits.length === 0) out.push(`${name(s)} needs an exit check question.`);
    if (exits.length > 2) out.push(`${name(s)} has more than two exit check questions.`);
    if (blocks.filter((b) => roleOf(b) === 'hint').length > MAX_HINTS) out.push(`${name(s)} has more than ${MAX_HINTS} hints.`);
    for (const b of blocks) {
      if (b.block_type !== 'quiz_question') continue;
      if (!QuizQuestionSchema.safeParse(b.content.question).success) { out.push(`A question at ${name(s)} isn’t finished.`); break; }
    }
    const hinges = blocks.filter(isHingeGate);
    const gates = hinges.length + (s.written_gate ? 1 : 0);
    if (gates > 1) out.push(`${name(s)} has more than one gate. Keep one.`);
    if (gates === 0 && blocks.some((b) => roleOf(b) === 'after')) out.push(`${name(s)} has steps after a gate, but no gate.`);
    for (const h of hinges) {
      if (h.block_type !== 'hinge_question') continue;
      const c = h.content;
      if (!filled(c.prompt) || c.options.length < 2 || !c.options.some((o) => o.id === c.correct_id)) out.push(`The gate at ${name(s)} needs a question, options and a right answer.`);
    }
    if (blocks.some((b) => b.block_type === 'quiz_question' && roleOf(b) === 'gate')) out.push(`A gate at ${name(s)} must be a hinge question or a written answer.`);
    const g = s.written_gate ? WrittenGateSchema.parse(s.written_gate) : null;
    if (g) {
      if (!filled(g.passage)) out.push(`The written gate at ${name(s)} needs a passage.`);
      if (!filled(g.prompt)) out.push(`The written gate at ${name(s)} needs a question.`);
      if (!filled(g.idea)) out.push(`The written gate at ${name(s)} needs the idea each point links to.`);
      if (g.checks.length === 0) out.push(`The written gate at ${name(s)} needs at least one check.`);
      if (g.pass_at > g.marks || (g.pass_at_support ?? 0) > g.marks) out.push(`The written gate at ${name(s)} can’t pass at more marks than it has.`);
    }
    const asked = r.pretest.filter((p) => p.station === s.id);
    if (asked.length !== PRETEST_PER_STATION) out.push(`${name(s)} needs exactly ${PRETEST_PER_STATION} pretest questions (it has ${asked.length}).`);
    else if (asked.some((p) => !QuizQuestionSchema.safeParse(p.question).success)) out.push(`A pretest question for ${name(s)} isn’t finished.`);
  }
  const orphans = r.pretest.filter((p) => !learning.some((s) => s.id === p.station));
  if (orphans.length) out.push('Some pretest questions belong to a station that is no longer in the lesson.');
  if (r.path === 'choose_n' && (!r.choose_n || r.choose_n >= learning.length)) out.push('“Choose some” needs a number smaller than the number of stations.');
  if (r.path === 'must_may' && !learning.some((s) => s.must_do)) out.push('Tick at least one must-do station.');
  if (r.path === 'unlocks') out.push(...unlockProblems(r.stations));
  if (r.stations.some((s) => filled(s.token))) {
    const lock = r.finale.lock;
    if (!lock || !filled(lock.prompt) || lock.options.length < 2 || !lock.options.some((o) => o.id === lock.correct_id)) out.push('A breakout with letters needs a lock question with a right answer (Finale).');
  }
  return [...new Set(out)];
}
