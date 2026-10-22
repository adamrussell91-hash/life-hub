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

function schemaDetail(question: unknown): string {
  const parsed = QuizQuestionSchema.safeParse(question);
  if (parsed.success) return '';
  const issue = parsed.error.issues[0];
  return issue ? ` (${issue.path.join('.') || 'question'}: ${issue.message})` : '';
}

/**
 * Problems with the quiz questions in a proposal, in words the agent can fix:
 * each question must pass the quiz engine's own check, images must already be
 * in the lesson, and quiz questions need a Quiz lesson (or set_mode: quiz).
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

  if (setMode && questions.length === 0) {
    issues.push('Only set set_mode to quiz when the proposal adds quiz_question blocks.');
  }
  if (questions.length === 0) return issues;

  if (questions.length > MAX_QUIZ_QUESTIONS_PER_PROPOSAL) {
    issues.push(
      `At most ${MAX_QUIZ_QUESTIONS_PER_PROPOSAL} quiz questions fit in one proposal. Propose the first ${MAX_QUIZ_QUESTIONS_PER_PROPOSAL} and tell the teacher to ask for the rest.`
    );
  }

  if (lesson.pedagogical_mode !== 'quiz' && setMode !== 'quiz') {
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
    const url = checked.question.image?.url;
    if (url && !images.has(url)) {
      issues.push(`${label}: its image must be one already in the lesson. Use one of the lesson's images or a different question kind.`);
    }
  });
  return issues;
}
