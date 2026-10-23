// apps/teaching/src/tutorial/model.ts
import type { Block } from '@/schemas/block';
import { visitBlocks } from '@/blocks/walk-blocks';
import type { TutorialGroup, TutorialSettings } from './schema';

/**
 * A tutorial is one block tree:
 * - top-level blocks that aren't group sections are Common (everyone);
 * - a top-level section with `tutorial_group` is that group's tab;
 * - the same with `tutorial_exit: true` is that group's exit check.
 * A tab stops at its `with_teacher` block until the teacher has sat with the group.
 */

export type SectionBlock = Extract<Block, { block_type: 'section' }>;
export type WithTeacherBlock = Extract<Block, { block_type: 'with_teacher' }>;

const groupId = (block: Block): string | null =>
  block.block_type === 'section' && typeof block.content.tutorial_group === 'string' ? block.content.tutorial_group : null;

export const isGroupTab = (block: Block): block is SectionBlock => groupId(block) !== null && !(block as SectionBlock).content.tutorial_exit;
export const isExitCheck = (block: Block): block is SectionBlock => groupId(block) !== null && (block as SectionBlock).content.tutorial_exit === true;

export type TutorialParts = { common: Block[]; tabs: Map<string, SectionBlock>; exits: Map<string, SectionBlock> };

export function tutorialParts(blocks: readonly Block[]): TutorialParts {
  const parts: TutorialParts = { common: [], tabs: new Map(), exits: new Map() };
  for (const block of blocks) {
    const id = groupId(block);
    if (id === null) parts.common.push(block);
    else if (isExitCheck(block)) parts.exits.set(id, block);
    else parts.tabs.set(id, block as SectionBlock);
  }
  return parts;
}

export const tutorialCommon = (blocks: readonly Block[]): Block[] => tutorialParts(blocks).common;

export function splitAtTeacher(blocks: readonly Block[]): { before: Block[]; withTeacher: WithTeacherBlock | null; after: Block[] } {
  const at = blocks.findIndex((block) => block.block_type === 'with_teacher');
  if (at === -1) return { before: [...blocks], withTeacher: null, after: [] };
  return { before: blocks.slice(0, at), withTeacher: blocks[at] as WithTeacherBlock, after: blocks.slice(at + 1) };
}

export function groupOf(settings: TutorialSettings | undefined, studentId: string): TutorialGroup | null {
  return settings?.groups.find((group) => group.students.includes(studentId)) ?? null;
}

const shell = (id: string, block_type: Block['block_type'], content: Record<string, unknown>): Block =>
  ({ id, type: 'block', block_type, variant: 'medium', visibility: 'student_teacher', content }) as Block;

/** A new tutorial: a Common demo heading, then per group a tab (goal, With teacher) and an empty exit check. */
export function tutorialSkeleton(groups: readonly TutorialGroup[], newId: () => string): Block[] {
  const blocks: Block[] = [shell(newId(), 'heading', { text: 'Demo' })];
  for (const group of groups) {
    blocks.push(
      shell(newId(), 'section', {
        title: group.name,
        tutorial_group: group.id,
        blocks: [shell(newId(), 'heading', { text: group.goal }), shell(newId(), 'with_teacher', { talking_points: [] })]
      }),
      shell(newId(), 'section', { title: `Exit check: ${group.name}`, tutorial_group: group.id, tutorial_exit: true, blocks: [] })
    );
  }
  return blocks;
}

/** What stops a tutorial publishing, in the teacher's words. */
export function tutorialIssues(lesson: { tutorial?: TutorialSettings; blocks: readonly Block[] }): string[] {
  const settings = lesson.tutorial;
  if (!settings || settings.groups.length === 0) return ['Plan the groups first: open the markbook and press Plan a tutorial.'];
  const issues: string[] = [];
  const parts = tutorialParts(lesson.blocks);
  for (const group of settings.groups) {
    const tab = parts.tabs.get(group.id);
    if (!tab) {
      issues.push(`Group “${group.name}” has no tab.`);
      continue;
    }
    const inner = tab.content.blocks as Block[];
    if (!splitAtTeacher(inner).withTeacher) issues.push(`Group “${group.name}” has no With teacher step.`);
    let hinge = false;
    visitBlocks(inner, (block) => {
      if (block.block_type === 'hinge_question') hinge = true;
    });
    if (hinge) issues.push(`Group “${group.name}” has a hinge question. In a group tab, use a faded example, cloze or self-check instead.`);
    let questions = 0;
    visitBlocks((parts.exits.get(group.id)?.content.blocks as Block[]) ?? [], (block) => {
      if (block.block_type === 'quiz_question') questions += 1;
    });
    if (questions === 0) issues.push(`Group “${group.name}” has no exit check questions.`);
  }
  let stray = false;
  visitBlocks([...parts.common, ...[...parts.tabs.values()].flatMap((tab) => tab.content.blocks as Block[])], (block) => {
    if (block.block_type === 'quiz_question') stray = true;
  });
  if (stray) issues.push('Quiz questions in a tutorial go in a group’s exit check.');
  return issues;
}
