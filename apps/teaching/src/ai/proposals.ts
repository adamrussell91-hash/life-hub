import { z } from 'zod';
import { BlockSchema } from '@/schemas/block';
import { CoverSchema } from '@/schemas/cover';
import { IsoDateSchema } from '@/schemas/common';
import { countBlocksInTree } from '@/teacher/lesson-canvas/drop';
import { CaseSettingsSchema } from '@/case-study/schema';

export const AiScopeSchema = z.enum(['block', 'section', 'lesson']).default('lesson');
export type AiScope = z.infer<typeof AiScopeSchema>;

export const AiChatRequestSchema = z.object({
  lesson_id: z.string().min(1),
  agent: z.enum(['ann', 'clementine', 'hammond', 'clare']),
  scope: AiScopeSchema,
  selected_block_id: z.string().min(1).optional(),
  lesson_snapshot_at: IsoDateSchema.optional(),
  message: z.string().min(1).max(8000),
  protocol_id: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/).optional(),
  action: z.string().min(1).max(80).optional(),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(16000)
      })
    )
    .max(20)
    .optional()
});

export type AiChatRequest = z.infer<typeof AiChatRequestSchema>;

export const ProposeReplaceBlockSchema = z.object({
  block_id: z.string().min(1),
  block: BlockSchema
});

export const ProposeReplaceSectionSchema = z.object({
  section_id: z.string().min(1),
  section: BlockSchema
});

/** Accepting the proposal also switches the lesson to this type (quiz questions need a Quiz lesson). */
export const ProposalSetModeSchema = z.literal('quiz');
export type ProposalSetMode = z.infer<typeof ProposalSetModeSchema>;

export const ProposeReplaceLessonSchema = z.object({
  title: z.string().min(1).optional(),
  cover: CoverSchema.optional(),
  blocks: z.array(BlockSchema),
  set_mode: ProposalSetModeSchema.optional()
});

export const ProposeInsertBlocksSchema = z.object({
  anchor_block_id: z.string().min(1).optional(),
  position: z.enum(['above', 'below']),
  blocks: z.array(BlockSchema).min(1).max(48),
  set_mode: ProposalSetModeSchema.optional()
});

/** Several existing blocks swapped in one Accept, each matched by its own id. */
export const ProposeReplaceBlocksSchema = z.object({
  blocks: z.array(BlockSchema).min(1).max(30)
});

export const ProposeDeleteBlocksSchema = z.object({
  ids: z.array(z.string().min(1)).min(1)
});

export const DropParentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('root') }),
  z.object({ kind: z.literal('section'), id: z.string().min(1) }),
  z.object({
    kind: z.literal('column'),
    id: z.string().min(1),
    columnIndex: z.number().int()
  }),
  z.object({
    kind: z.literal('tab'),
    id: z.string().min(1),
    tabIndex: z.number().int()
  })
]);

export const ProposeReorderBlocksSchema = z.object({
  parent: DropParentSchema,
  ordered_ids: z.array(z.string().min(1)).min(1)
});

/**
 * A case study's settings, written key by key: each key sent replaces that key whole
 * (parts, options and objections go as complete arrays). The class and flow are the teacher's.
 */
export const ProposeUpdateCaseSchema = z.object({
  case: CaseSettingsSchema.omit({ class_id: true, flow: true }).partial().refine((patch) => Object.keys(patch).length > 0, 'Send at least one setting')
});

/** Every id in a case (parts, documents, options) is unique, so the player and board can tell them apart. */
export function caseIdIssue(patch: z.infer<typeof ProposeUpdateCaseSchema>['case']): string | null {
  const seen = new Set<string>();
  const ids = [
    ...(patch.parts ?? []).flatMap((part) => [part.id, ...part.docs.map((doc) => doc.id)]),
    ...(patch.transfer?.docs ?? []).map((doc) => doc.id),
    ...(patch.decision?.options ?? []).map((option) => option.id)
  ];
  for (const id of ids) {
    if (seen.has(id)) return `The id "${id}" is used twice. Give every part, document and option its own id (p1, d1, o1…).`;
    seen.add(id);
  }
  return null;
}

export const ReviewOnlySchema = z.object({
  summary: z.string().min(1).max(4000)
});

export type AiProposal =
  | { kind: 'replace_block'; block_id: string; block: z.infer<typeof BlockSchema> }
  | { kind: 'replace_blocks'; blocks: z.infer<typeof BlockSchema>[] }
  | { kind: 'replace_section'; section_id: string; section: z.infer<typeof BlockSchema> }
  | {
      kind: 'replace_lesson';
      title?: string;
      cover?: z.infer<typeof CoverSchema>;
      blocks: z.infer<typeof BlockSchema>[];
      set_mode?: ProposalSetMode;
    }
  | {
      kind: 'insert_blocks';
      anchor_block_id?: string;
      position: 'above' | 'below';
      blocks: z.infer<typeof BlockSchema>[];
      set_mode?: ProposalSetMode;
    }
  | { kind: 'delete_blocks'; ids: string[] }
  | {
      kind: 'reorder_blocks';
      parent: z.infer<typeof DropParentSchema>;
      ordered_ids: string[];
    }
  | { kind: 'update_case'; case: z.infer<typeof ProposeUpdateCaseSchema>['case'] }
  | { kind: 'review_only'; summary: string };

/**
 * The agent's note shown with the proposal card. Sonnet 5.5 returns text it
 * writes beside a tool call as hidden thinking, so the note travels in the call.
 */
const MESSAGE_PROPERTY = {
  type: 'string',
  description:
    'Your note to the teacher, shown with the proposal: what you built and why, anything to check before accepting, and a "Sources:" list when you researched.'
} as const;

export const AI_TOOLS = [
  {
    name: 'propose_replace_block',
    description:
      'Propose replacing the selected block with a schema-valid block. Preserve the same block id.',
    input_schema: {
      type: 'object',
      properties: {
        message: MESSAGE_PROPERTY,
        block_id: { type: 'string' },
        block: { type: 'object', description: 'Full block object matching Teaching Hub schema' }
      },
      required: ['block_id', 'block']
    }
  },
  {
    name: 'propose_replace_blocks',
    description:
      'Propose replacing several existing blocks at once, such as rewriting or converting a few quiz questions. Each block keeps the id of the block it replaces; blocks you leave out stay as they are.',
    input_schema: {
      type: 'object',
      properties: {
        message: MESSAGE_PROPERTY,
        blocks: { type: 'array', items: { type: 'object' }, description: 'Full replacement blocks, each with the id of an existing block.' }
      },
      required: ['blocks']
    }
  },
  {
    name: 'propose_replace_section',
    description: 'Propose replacing a section block (including children) with a schema-valid section.',
    input_schema: {
      type: 'object',
      properties: {
        message: MESSAGE_PROPERTY,
        section_id: { type: 'string' },
        section: { type: 'object' }
      },
      required: ['section_id', 'section']
    }
  },
  {
    name: 'propose_replace_lesson',
    description:
      'Propose replacing the whole lesson title, optional cover, and blocks. At most 48 blocks in the tree.',
    input_schema: {
      type: 'object',
      properties: {
        message: MESSAGE_PROPERTY,
        title: { type: 'string' },
        cover: { type: 'object' },
        blocks: { type: 'array', items: { type: 'object' } },
        set_mode: {
          type: 'string',
          enum: ['quiz'],
          description: 'Only for an empty lesson the teacher wants as a quiz: accepting turns the whole lesson into a Quiz. Leave it out when adding quiz_question blocks to a lesson that already has content; they run there as it is.'
        }
      },
      required: ['blocks']
    }
  },
  {
    name: 'propose_insert_blocks',
    description:
      'Propose inserting one or more schema-valid blocks above or below an anchor block. To add to the end of the lesson, anchor below its last top-level block. Leave the anchor out only when the lesson is empty.',
    input_schema: {
      type: 'object',
      properties: {
        message: MESSAGE_PROPERTY,
        anchor_block_id: { type: 'string' },
        position: { type: 'string', enum: ['above', 'below'] },
        blocks: { type: 'array', items: { type: 'object' } },
        set_mode: {
          type: 'string',
          enum: ['quiz'],
          description: 'Only for an empty lesson the teacher wants as a quiz: accepting turns the whole lesson into a Quiz. Leave it out when adding quiz_question blocks to a lesson that already has content; they run there as it is.'
        }
      },
      required: ['position', 'blocks']
    }
  },
  {
    name: 'propose_delete_blocks',
    description: 'Propose deleting one or more blocks by id, including nested matches.',
    input_schema: {
      type: 'object',
      properties: {
        message: MESSAGE_PROPERTY,
        ids: { type: 'array', items: { type: 'string' } }
      },
      required: ['ids']
    }
  },
  {
    name: 'propose_reorder_blocks',
    description: 'Propose reordering sibling blocks under a parent (root, section, column, or tab).',
    input_schema: {
      type: 'object',
      properties: {
        message: MESSAGE_PROPERTY,
        parent: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: ['root', 'section', 'column', 'tab'] },
            id: { type: 'string' },
            columnIndex: { type: 'number' },
            tabIndex: { type: 'number' }
          },
          required: ['kind']
        },
        ordered_ids: { type: 'array', items: { type: 'string' } }
      },
      required: ['parent', 'ordered_ids']
    }
  },
  {
    name: 'propose_update_case',
    description:
      'Propose changes to a case study lesson\'s settings (lesson.case). Send only the keys you change; each key you send replaces that key whole, so send parts, options and objections as complete arrays. Keys: purpose, outcomes, pace, support, release, parts [{ id, title, docs: [{ id, kind: memo|data|news|transcript|update, title, source, text }], question }], decision { prompt, options: [{ id, label, detail }] }, outcome { text, source, hold_until }, objections [string], transfer { title, docs, question }, help. Every part, document and option needs its own id. Never write an outcome or a source you were not given.',
    input_schema: {
      type: 'object',
      properties: {
        message: MESSAGE_PROPERTY,
        case: { type: 'object', description: 'The settings to change, as described.' }
      },
      required: ['case']
    }
  },
  {
    name: 'review_only',
    description: 'Provide structured feedback without mutating lesson content.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string' }
      },
      required: ['summary']
    }
  }
] as const;

export function parseToolProposal(name: string, input: unknown): AiProposal | { error: string } {
  if (name === 'propose_replace_block') {
    const parsed = ProposeReplaceBlockSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.message };
    const block = { ...parsed.data.block, id: parsed.data.block_id };
    return { kind: 'replace_block', block_id: parsed.data.block_id, block };
  }
  if (name === 'propose_replace_blocks') {
    const parsed = ProposeReplaceBlocksSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.message };
    const ids = parsed.data.blocks.map((block) => block.id);
    if (new Set(ids).size !== ids.length) return { error: 'Each replacement needs a different block id.' };
    return { kind: 'replace_blocks', blocks: parsed.data.blocks };
  }
  if (name === 'propose_replace_section') {
    const parsed = ProposeReplaceSectionSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.message };
    if (parsed.data.section.block_type !== 'section') {
      return { error: 'section must be a section block' };
    }
    const section = { ...parsed.data.section, id: parsed.data.section_id };
    return { kind: 'replace_section', section_id: parsed.data.section_id, section };
  }
  if (name === 'propose_replace_lesson') {
    const parsed = ProposeReplaceLessonSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.message };
    if (countBlocksInTree(parsed.data.blocks) > 48) {
      return { error: 'replace_lesson exceeds 48 blocks' };
    }
    return {
      kind: 'replace_lesson',
      title: parsed.data.title,
      cover: parsed.data.cover,
      blocks: parsed.data.blocks,
      ...(parsed.data.set_mode ? { set_mode: parsed.data.set_mode } : {})
    };
  }
  if (name === 'propose_insert_blocks') {
    const parsed = ProposeInsertBlocksSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.message };
    if (countBlocksInTree(parsed.data.blocks) > 48) {
      return { error: 'insert_blocks exceeds 48 blocks' };
    }
    return {
      kind: 'insert_blocks',
      anchor_block_id: parsed.data.anchor_block_id,
      position: parsed.data.position,
      blocks: parsed.data.blocks,
      ...(parsed.data.set_mode ? { set_mode: parsed.data.set_mode } : {})
    };
  }
  if (name === 'propose_delete_blocks') {
    const parsed = ProposeDeleteBlocksSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.message };
    return { kind: 'delete_blocks', ids: parsed.data.ids };
  }
  if (name === 'propose_reorder_blocks') {
    const parsed = ProposeReorderBlocksSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.message };
    return {
      kind: 'reorder_blocks',
      parent: parsed.data.parent,
      ordered_ids: parsed.data.ordered_ids
    };
  }
  if (name === 'propose_update_case') {
    const parsed = ProposeUpdateCaseSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.message };
    const issue = caseIdIssue(parsed.data.case);
    if (issue) return { error: issue };
    return { kind: 'update_case', case: parsed.data.case };
  }
  if (name === 'review_only') {
    const parsed = ReviewOnlySchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.message };
    return { kind: 'review_only', summary: parsed.data.summary };
  }
  return { error: `Unknown tool: ${name}` };
}
