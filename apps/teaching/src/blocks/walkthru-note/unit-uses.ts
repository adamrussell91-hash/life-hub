import { visitBlocks } from '@/blocks/walk-blocks';
import { evidenceSteps, piecesTaught, targetPieces } from '@/deep/block-tags';
import type { DeepUnderstanding } from '@/deep/schema';
import type { Block } from '@/schemas/block';
import type { WalkthruTie } from '@/schemas/unit';
import { techniqueById } from '../../../../../packages/walkthrus/catalogue.mjs';
import type { Rep, RepState } from './api';
import { attachedTechniques, stepNotes } from './attach';

/**
 * What each WalkThru is doing in a unit, worked out from the lessons (a block that chose it), the rep
 * log (whether it ran) and the unit's own ties. Only techniques in use get a row.
 */

export type UnitLesson = { id: string; title?: string; blocks?: Block[] };

/** One place a technique is used: a block in a lesson, or a tie on the unit. */
export type WalkthruUse = {
  tie: Pick<WalkthruTie, 'kind' | 'ref'>;
  where: string;
  sub: string;
  how: string;
  note: string;
  state: RepState | null;
  lesson_id?: string;
};

export type WalkthruChip = { kind: 'lesson' | 'du' | 'organiser'; label: string };

export type WalkthruRow = {
  technique: string;
  name: string;
  set: number;
  chips: WalkthruChip[];
  count: string;
  uses: WalkthruUse[];
};

export const ORGANISER_TIES: ReadonlyArray<{ ref: string; label: string }> = [
  { ref: 'all', label: 'Organiser' },
  { ref: 'vocab', label: 'Organiser: Vocabulary' },
  { ref: 'facts', label: 'Organiser: Context' }
];

const STATE_RANK: Record<RepState, number> = { planned: 0, skipped: 1, partly: 2, ran: 3 };

const lessonCode = (lessons: readonly UnitLesson[], id: string): string => `L${lessons.findIndex((l) => l.id === id) + 1}`;

function blockName(block: Block): string {
  const c = block.content as Record<string, unknown> | undefined;
  const raw = [c?.title, c?.heading, c?.prompt].find((v) => typeof v === 'string' && v.trim()) as string | undefined;
  const text = raw?.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return block.block_type.replace(/_/g, ' ').replace(/^./, (x) => x.toUpperCase());
  return text.length > 70 ? `${text.slice(0, 69).trimEnd()}…` : text;
}

/** The WalkThru a block carries: chosen in its menu, or written as a teacher note. */
function techniqueOf(block: Block): string | null {
  const attached = attachedTechniques(block)[0];
  if (attached) return attached;
  const note = (block.content as { walkthru?: { id?: unknown } } | undefined)?.walkthru?.id;
  return typeof note === 'string' && techniqueById(note)?.kind === 'technique' ? note : null;
}

function notesOf(block: Block): string {
  const jots = (block.content as { walkthru?: { jots?: Record<string, unknown> } } | undefined)?.walkthru?.jots ?? {};
  const written = [...Object.values(stepNotes(block)), ...Object.values(jots)];
  return written.filter((v): v is string => typeof v === 'string' && !!v.trim()).join(' · ');
}

/** The deep understandings a block (or anything inside it) teaches or gives evidence for, as 1-based numbers. */
function deepNumbersOf(block: Block, deep: readonly DeepUnderstanding[]): number[] {
  const numbers = new Set<number>();
  const ofPiece = (id: string): void => {
    const at = deep.findIndex((d) => d.pieces.some((p) => p.id === id));
    if (at !== -1) numbers.add(at + 1);
  };
  visitBlocks([block], (inner) => {
    for (const id of [...piecesTaught(inner), ...targetPieces(inner)]) ofPiece(id);
    for (const id of (inner.content as { question?: { pieces?: string[] } } | undefined)?.question?.pieces ?? []) ofPiece(id);
    for (const step of evidenceSteps(inner)) {
      const at = deep.findIndex((d) => d.id === step.du);
      if (at !== -1) numbers.add(at + 1);
    }
  });
  return [...numbers].sort((a, b) => a - b);
}

function bestState(reps: readonly Rep[], technique: string, lessonId: string): RepState | null {
  let best: RepState | null = null;
  for (const rep of reps) {
    if (rep.technique_id !== technique || rep.lesson_id !== lessonId) continue;
    if (!best || STATE_RANK[rep.state] > STATE_RANK[best]) best = rep.state;
  }
  return best;
}

export const blockTieRef = (lessonId: string, blockId: string): string => `${lessonId}/${blockId}`;

export function walkthruRows(
  lessons: readonly UnitLesson[],
  deep: readonly DeepUnderstanding[],
  ties: readonly WalkthruTie[],
  reps: readonly Rep[]
): WalkthruRow[] {
  const howOf = (technique: string, ref: string): string => ties.find((t) => t.technique === technique && t.kind === 'block' && t.ref === ref)?.how ?? '';
  const rows = new Map<string, { uses: WalkthruUse[]; deepNumbers: Set<number> }>();
  const rowOf = (technique: string) => {
    const held = rows.get(technique);
    if (held) return held;
    const made = { uses: [] as WalkthruUse[], deepNumbers: new Set<number>() };
    rows.set(technique, made);
    return made;
  };

  for (const lesson of lessons) {
    visitBlocks(lesson.blocks ?? [], (block) => {
      const technique = techniqueOf(block);
      if (!technique) return;
      const row = rowOf(technique);
      const ref = blockTieRef(lesson.id, block.id);
      for (const n of deepNumbersOf(block, deep)) row.deepNumbers.add(n);
      row.uses.push({
        tie: { kind: 'block', ref },
        where: `${lessonCode(lessons, lesson.id)} ${lesson.title ?? 'Untitled lesson'}`,
        sub: blockName(block),
        how: howOf(technique, ref),
        note: notesOf(block),
        state: bestState(reps, technique, lesson.id),
        lesson_id: lesson.id
      });
    });
  }

  for (const tie of ties) {
    if (tie.kind === 'block' || techniqueById(tie.technique)?.kind !== 'technique') continue;
    const at = tie.kind === 'du' ? deep.findIndex((d) => d.id === tie.ref) : -1;
    const label = tie.kind === 'du' ? (at === -1 ? null : `Deep understanding ${at + 1}`) : ORGANISER_TIES.find((o) => o.ref === tie.ref)?.label;
    if (!label) continue;
    const row = rowOf(tie.technique);
    if (tie.kind === 'du') row.deepNumbers.add(at + 1);
    row.uses.push({ tie: { kind: tie.kind, ref: tie.ref }, where: label, sub: '', how: tie.how ?? '', note: '', state: null });
  }

  const firstLesson = (uses: readonly WalkthruUse[]): number => {
    const at = uses.map((u) => lessons.findIndex((l) => l.id === u.lesson_id)).filter((i) => i !== -1);
    return at.length ? Math.min(...at) : Number.MAX_SAFE_INTEGER;
  };

  return [...rows.entries()]
    .sort(([, a], [, b]) => firstLesson(a.uses) - firstLesson(b.uses))
    .map(([technique, { uses, deepNumbers }]) => {
      const entry = techniqueById(technique);
      const lessonIds = [...new Set(uses.flatMap((u) => (u.lesson_id ? [u.lesson_id] : [])))];
      const chips: WalkthruChip[] = [
        ...lessonIds.map((id): WalkthruChip => ({ kind: 'lesson', label: lessonCode(lessons, id) })),
        ...[...deepNumbers].sort((a, b) => a - b).map((n): WalkthruChip => ({ kind: 'du', label: `Deep understanding ${n}` })),
        ...uses.filter((u) => u.tie.kind === 'organiser').map((u): WalkthruChip => ({ kind: 'organiser', label: u.where }))
      ];
      // A lesson counts once, however many of its blocks use the technique.
      const ran = lessonIds.filter((id) => {
        const state = bestState(reps, technique, id);
        return state === 'ran' || state === 'partly';
      }).length;
      const count = lessonIds.length ? `${lessonIds.length} lesson${lessonIds.length === 1 ? '' : 's'}${ran ? ` · ran ${ran}` : ''}` : '';
      return { technique, name: entry?.name ?? technique, set: entry?.set ?? 1, chips, count, uses };
    });
}

/** The ties with this how line. A blank line on a block use takes its tie away, so blocks leave nothing behind. */
export function withHow(ties: readonly WalkthruTie[], technique: string, tie: Pick<WalkthruTie, 'kind' | 'ref'>, how: string): WalkthruTie[] {
  const words = how.trim();
  const same = (t: WalkthruTie): boolean => t.technique === technique && t.kind === tie.kind && t.ref === tie.ref;
  if (tie.kind === 'block' && !words) return ties.filter((t) => !same(t));
  if (!ties.some(same)) return [...ties, { technique, ...tie, how: words }];
  return ties.map((t) => {
    if (!same(t)) return t;
    const { how: _old, ...rest } = t;
    return words ? { ...rest, how: words } : rest;
  });
}
