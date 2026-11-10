import type { Block } from '@/schemas/block';

type QuestionSet = Extract<Block, { block_type: 'question_set' }>;
type Mode = 'student' | 'teacher' | 'print';
type Ctx = { lessonId?: string; saveScope?: string; display?: boolean };

/** STUB: replaced by the sentence-level formats view. */
export function renderSentenceFormat(block: QuestionSet, _mode: Mode, _ctx: Ctx = {}): HTMLElement {
  const root = document.createElement('div');
  root.className = 'block-question-set block-question-set--sentence';
  root.textContent = block.content.format ?? '';
  return root;
}
