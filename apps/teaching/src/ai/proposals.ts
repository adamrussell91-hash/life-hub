import { z } from 'zod';
import { BlockSchema } from '@/schemas/block';
import { CoverSchema } from '@/schemas/cover';
import { IsoDateSchema } from '@/schemas/common';
import { countBlocksInTree } from '@/teacher/lesson-canvas/drop';

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

export const ProposeReplaceLessonSchema = z.object({
  title: z.string().min(1).optional(),
  cover: CoverSchema.optional(),
  blocks: z.array(BlockSchema)
});

export const ProposeInsertBlocksSchema = z.object({
  anchor_block_id: z.string().min(1).optional(),
  position: z.enum(['above', 'below']),
  blocks: z.array(BlockSchema).min(1).max(48)
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

export const ReviewOnlySchema = z.object({
  summary: z.string().min(1).max(4000)
});

export type AiProposal =
  | { kind: 'replace_block'; block_id: string; block: z.infer<typeof BlockSchema> }
  | { kind: 'replace_section'; section_id: string; section: z.infer<typeof BlockSchema> }
  | {
      kind: 'replace_lesson';
      title?: string;
      cover?: z.infer<typeof CoverSchema>;
      blocks: z.infer<typeof BlockSchema>[];
    }
  | {
      kind: 'insert_blocks';
      anchor_block_id?: string;
      position: 'above' | 'below';
      blocks: z.infer<typeof BlockSchema>[];
    }
  | { kind: 'delete_blocks'; ids: string[] }
  | {
      kind: 'reorder_blocks';
      parent: z.infer<typeof DropParentSchema>;
      ordered_ids: string[];
    }
  | { kind: 'review_only'; summary: string };

export const AI_TOOLS = [
  {
    name: 'propose_replace_block',
    description:
      'Propose replacing the selected block with a schema-valid block. Preserve the same block id.',
    input_schema: {
      type: 'object',
      properties: {
        block_id: { type: 'string' },
        block: { type: 'object', description: 'Full block object matching Teaching Hub schema' }
      },
      required: ['block_id', 'block']
    }
  },
  {
    name: 'propose_replace_section',
    description: 'Propose replacing a section block (including children) with a schema-valid section.',
    input_schema: {
      type: 'object',
      properties: {
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
        title: { type: 'string' },
        cover: { type: 'object' },
        blocks: { type: 'array', items: { type: 'object' } }
      },
      required: ['blocks']
    }
  },
  {
    name: 'propose_insert_blocks',
    description:
      'Propose inserting one or more schema-valid blocks above or below an optional anchor. Without an anchor, append to the lesson root.',
    input_schema: {
      type: 'object',
      properties: {
        anchor_block_id: { type: 'string' },
        position: { type: 'string', enum: ['above', 'below'] },
        blocks: { type: 'array', items: { type: 'object' } }
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
      blocks: parsed.data.blocks
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
      blocks: parsed.data.blocks
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
  if (name === 'review_only') {
    const parsed = ReviewOnlySchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.message };
    return { kind: 'review_only', summary: parsed.data.summary };
  }
  return { error: `Unknown tool: ${name}` };
}
