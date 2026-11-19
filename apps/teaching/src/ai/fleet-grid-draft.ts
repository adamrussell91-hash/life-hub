import { z } from 'zod';
import { QUIZ_LIMITS } from '@/quiz/core';
import { FLEET_SIZE, GAME_LIMITS } from '@/games/core/schema';
import type { Lesson } from '@/schemas/lesson';

/**
 * Ann's Fleet week grid draft (spec 2026-11-19, Out of scope and §5): five
 * column labels, five row labels, two short-answer variants for each of the
 * 25 squares (row-major, A1 to E5) and four recall lines. It is drafted only
 * from the unit pack in the teacher's brief, always behind a priced plan the
 * teacher confirms, and the editor puts it into blank slots only.
 *
 * Pure and server-safe: the job runner bundles it into the Netlify runtime.
 */

/** The first line of the brief the editor sends; the runner keys the plan gate and the unit-only rule on it. */
export const FLEET_BRIEF_HEAD = 'Fleet week grid draft';

const Label = z.string().trim().min(1).max(GAME_LIMITS.fleetLabel);

export const FleetDraftQuestionSchema = z.object({
  prompt: z.string().trim().min(1).max(QUIZ_LIMITS.prompt),
  accepted: z.array(z.string().trim().min(1).max(QUIZ_LIMITS.answer)).min(1).max(10)
});
export type FleetDraftQuestion = z.infer<typeof FleetDraftQuestionSchema>;

export const ProposeFleetGridDraftSchema = z.object({
  game_id: z.string().min(1).max(64),
  columns: z.array(Label).length(FLEET_SIZE),
  rows: z.array(Label).length(FLEET_SIZE),
  squares: z
    .array(z.object({ variants: z.array(FleetDraftQuestionSchema).length(2) }))
    .length(FLEET_SIZE * FLEET_SIZE),
  recall: z.array(FleetDraftQuestionSchema).length(4)
});
export type FleetGridDraft = z.infer<typeof ProposeFleetGridDraftSchema>;

export const FLEET_GRID_DRAFT_TOOL = {
  name: 'propose_fleet_grid_draft',
  description:
    'Fleet week games only, and only after the teacher has confirmed your priced "Plan to confirm". Propose the whole grid for one fleet_week game in lesson.game: five column labels and five row labels (each at most 40 characters), 25 squares row by row (A1 to A5, then B1 to B5 … E5), each with exactly two short-answer variants on the same idea ({ prompt, accepted: 1 to 10 short answers }), and four recall lines (a key quote or term to complete, for ships of 3, 2, 2 and 1). Draft only from the unit material in the brief. The editor fills blank slots only; anything the teacher wrote stays.',
  input_schema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'Your note to the teacher, shown with the proposal: what you drew on and anything to check.'
      },
      game_id: { type: 'string', description: 'The id of the fleet_week game in lesson.game.games.' },
      columns: { type: 'array', items: { type: 'string' }, description: 'Five column labels.' },
      rows: { type: 'array', items: { type: 'string' }, description: 'Five row labels.' },
      squares: {
        type: 'array',
        description: '25 squares, row-major.',
        items: {
          type: 'object',
          properties: {
            variants: {
              type: 'array',
              items: {
                type: 'object',
                properties: { prompt: { type: 'string' }, accepted: { type: 'array', items: { type: 'string' } } },
                required: ['prompt', 'accepted']
              }
            }
          },
          required: ['variants']
        }
      },
      recall: {
        type: 'array',
        description: 'Four recall lines.',
        items: {
          type: 'object',
          properties: { prompt: { type: 'string' }, accepted: { type: 'array', items: { type: 'string' } } },
          required: ['prompt', 'accepted']
        }
      }
    },
    required: ['game_id', 'columns', 'rows', 'squares', 'recall']
  }
} as const;

/** The draft must name a Fleet week game in this lesson. */
export function fleetDraftGameIssue(gameId: string, lesson: Pick<Lesson, 'game'>): string | null {
  const game = lesson.game?.games.find((g) => g.id === gameId);
  if (!game) return `game_id "${gameId}" is not a game in this lesson. Use the id of the fleet_week game in lesson.game.games.`;
  if (game.kind !== 'fleet_week') return `game_id "${gameId}" is a ${game.kind} game, not fleet_week.`;
  return null;
}

type Turn = { role: 'user' | 'assistant'; content: string };

const isBrief = (text: string) => text.trimStart().startsWith(FLEET_BRIEF_HEAD);

/**
 * Where a job stands in a Fleet week draft: `brief` when this message is the
 * editor's brief, `answer` when the latest turn is Ann's plan for that brief
 * and this message answers it, null when the job is not a fleet draft.
 * "Go ahead" never skips the plan here: a draft is always priced first.
 */
export function fleetDraftStage(job: { message: string; history?: Turn[] }): 'brief' | 'answer' | null {
  if (isBrief(job.message)) return 'brief';
  const history = job.history ?? [];
  const last = history[history.length - 1];
  if (!last || last.role !== 'assistant' || !last.content.includes('Plan to confirm')) return null;
  return history.some((turn) => turn.role === 'user' && isBrief(turn.content)) ? 'answer' : null;
}
