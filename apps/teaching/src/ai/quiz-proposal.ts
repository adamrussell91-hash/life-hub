import type { AiProposal } from '@/ai/proposals';
import { visitBlocks } from '@/blocks/walk-blocks';
import { lessonImages } from '@/quiz/images';
import { checkQuestion, QuizQuestionSchema } from '@/quiz/core';
import type { Block } from '@/schemas/block';
import type { Lesson } from '@/schemas/lesson';

/** One proposal stays well under the 48-block cap, with room for a heading. */
export const MAX_QUIZ_QUESTIONS_PER_PROPOSAL = 30;

function proposalBlocks(proposal: AiProposal): Block[] {
  switch (proposal.kind) {
    case 'replace_block':
      return [proposal.block];
    case 'replace_section':
      return [proposal.section];
    case 'replace_lesson':
    case 'insert_blocks':
    case 'replace_blocks':
      return proposal.blocks;
    default:
      return [];
  }
}

/** Ids of every block that sits inside a tutorial exit-check section (not the section itself). */
function idsInsideExits(blocks: readonly Block[]): Set<string> {
  const ids = new Set<string>();
  const walk = (list: readonly Block[], inExit: boolean) => {
    for (const block of list) {
      if (inExit) ids.add(block.id);
      for (const children of childLists(block)) walk(children, inExit || isExitSection(block));
    }
  };
  walk(blocks, false);
  return ids;
}

const isExitSection = (block: Block): boolean => block.block_type === 'section' && block.content.tutorial_exit === true;

function childLists(block: Block): Block[][] {
  if (block.block_type === 'section') return [block.content.blocks as Block[]];
  if (block.block_type === 'columns') return block.content.columns.map((column) => column.blocks as Block[]);
  if (block.block_type === 'tabs') return block.content.tabs.map((tab) => tab.blocks as Block[]);
  return [];
}

/** Quiz questions in a proposal that won't sit inside an exit-check section once accepted. */
function questionsOutsideExit(proposal: AiProposal, lesson: Lesson): number {
  const inside = idsInsideExits(lesson.blocks);
  // Accept keeps an exit check's markers when a redraft drops them, so it still counts as one.
  const exitIds = new Set<string>();
  visitBlocks(lesson.blocks as Block[], (block) => {
    if (isExitSection(block)) exitIds.add(block.id);
  });
  const startsInside = (block: Block): boolean => {
    switch (proposal.kind) {
      case 'replace_block':
        return inside.has(proposal.block_id);
      case 'replace_section':
        return inside.has(proposal.section_id) || exitIds.has(proposal.section_id);
      case 'replace_blocks':
        return inside.has(block.id) || exitIds.has(block.id);
      case 'insert_blocks':
        return !!proposal.anchor_block_id && inside.has(proposal.anchor_block_id);
      default:
        return false;
    }
  };
  let outside = 0;
  const walk = (blocks: readonly Block[], inExit: boolean) => {
    for (const block of blocks) {
      if (block.block_type === 'quiz_question' && !inExit) outside += 1;
      for (const children of childLists(block)) walk(children, inExit || isExitSection(block));
    }
  };
  for (const block of proposalBlocks(proposal)) walk([block], startsInside(block));
  return outside;
}

function schemaDetail(question: unknown): string {
  const parsed = QuizQuestionSchema.safeParse(question);
  if (parsed.success) return '';
  const issue = parsed.error.issues[0];
  return issue ? ` (${issue.path.join('.') || 'question'}: ${issue.message})` : '';
}

const ABSOLUTE = /\b(all|only|never|always|none|nothing|every|entirely|completely|totally|line for line)\b/i;

/**
 * Giveaways a test-wise student would use without knowing the content: a
 * right answer far longer than every wrong one, wrong answers that are the
 * extreme ones, and matching with so few pairs the last one is free.
 */
export function questionGiveaways(question: Record<string, unknown>): string[] {
  const issues: string[] = [];
  if (question.kind === 'multiple_choice') {
    const options = (question.options as Array<{ id: string; text: string }> | undefined) ?? [];
    const correct = new Set((question.correct as string[] | undefined) ?? []);
    const key = options.find((option) => correct.has(option.id));
    const wrong = options.filter((option) => !correct.has(option.id));
    if (key && wrong.length) {
      const longestWrong = Math.max(...wrong.map((option) => option.text.trim().length));
      const keyLength = key.text.trim().length;
      if (keyLength > longestWrong * 1.5 && keyLength - longestWrong >= 15) {
        issues.push('the right answer is much longer than every wrong one, so students can pick it by length. Make the options match in length and detail.');
      }
      const extreme = wrong.filter((option) => ABSOLUTE.test(option.text)).length;
      if (extreme >= 2 && !ABSOLUTE.test(key.text)) {
        issues.push('the wrong answers are the extreme ones ("all", "only", "never"…) and the right one is not, so students can rule them out without knowing the content. Write wrong answers a student who half-knows the content would choose.');
      }
    }
  }
  if (question.kind === 'matching') {
    const pairs = (question.pairs as unknown[] | undefined) ?? [];
    if (pairs.length < 4) issues.push(`matching needs at least 4 pairs (it has ${pairs.length}); with fewer, the last match is free. Add pairs from the same category or use another kind.`);
  }
  return issues;
}

/**
 * Problems with the quiz questions in a proposal, in words the agent can fix:
 * each question must pass the quiz engine's own check, images must already be
<<<<<<< HEAD
 * in the lesson, and quiz questions need a Quiz lesson (or set_mode: quiz), or
 * in a tutorial, a group's exit-check section.
=======
 * in the lesson, quiz questions need a Quiz lesson (or set_mode: quiz), and
 * none may give its answer away (questionGiveaways).
>>>>>>> origin/main
 * The block schema only checks a question's id and kind, so this is the real gate.
 */
export function quizProposalIssues(
  proposal: AiProposal,
  lesson: Lesson,
  { questions: checkQuestions = true }: { questions?: boolean } = {}
): string[] {
  const questions: Extract<Block, { block_type: 'quiz_question' }>[] = [];
  visitBlocks(proposalBlocks(proposal), (block) => {
    if (block.block_type === 'quiz_question') questions.push(block);
  });
  const setMode = 'set_mode' in proposal ? proposal.set_mode : undefined;
  const issues: string[] = [];

  const tutorial = lesson.pedagogical_mode === 'tutorial';
  if (setMode && tutorial) {
    issues.push('This lesson is a tutorial and stays one: leave set_mode out. Quiz questions go in a group’s exit check section.');
  } else if (setMode && questions.length === 0) {
    issues.push('Only set set_mode to quiz when the proposal adds quiz_question blocks.');
  }
  if (questions.length === 0) return issues;

  if (questions.length > MAX_QUIZ_QUESTIONS_PER_PROPOSAL) {
    issues.push(
      `At most ${MAX_QUIZ_QUESTIONS_PER_PROPOSAL} quiz questions fit in one proposal. Propose the first ${MAX_QUIZ_QUESTIONS_PER_PROPOSAL} and tell the teacher to ask for the rest.`
    );
  }

  if (tutorial) {
    if (questionsOutsideExit(proposal, lesson) > 0) {
      issues.push(
        'In a tutorial, quiz questions only go in a group’s exit check section (tutorial_exit: true). Replace that group’s exit check section (propose_replace_blocks or propose_replace_section), keeping its id, title, tutorial_group and tutorial_exit.'
      );
    }
  } else if (lesson.pedagogical_mode !== 'quiz' && setMode !== 'quiz') {
    issues.push(
      proposal.kind === 'insert_blocks' || proposal.kind === 'replace_lesson'
        ? 'This lesson is not a quiz, and quiz_question blocks only work in a Quiz lesson. Add set_mode: "quiz" so Accept switches the lesson type, and say so in your message. If the teacher wants questions without a quiz, use question_set instead.'
        : 'This lesson is not a quiz, and quiz_question blocks only work in a Quiz lesson. Use propose_insert_blocks with set_mode: "quiz", or use question_set instead.'
    );
  }

  const images = new Set(lessonImages(lesson.blocks).map((image) => image.url));
  if (!checkQuestions) return issues;
  questions.forEach((block, index) => {
    const question = { ...block.content.question, id: block.id };
    const label = `Question ${index + 1} (${block.id})`;
    const checked = checkQuestion(question);
    if (!checked.ok) {
      issues.push(`${label}: ${checked.message}${schemaDetail(question)}`);
      return;
    }
    for (const giveaway of questionGiveaways(question as Record<string, unknown>)) issues.push(`${label}: ${giveaway}`);
    const url = checked.question.image?.url;
    if (url && !images.has(url)) {
      issues.push(`${label}: its image must be one already in the lesson. Use one of the lesson's images or a different question kind.`);
    }
  });
  return issues;
}
