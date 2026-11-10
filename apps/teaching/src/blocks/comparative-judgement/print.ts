import { el } from '@/quiz/dom';
import { answerCard, criterionOf, pairRow, type CjBlock } from './shared';

/**
 * Paper version (D22): the criterion, the chips, and each practice pair side
 * by side with "Which is better? Why?" lines. No student answers, and never
 * the teacher's pick or reason.
 */
export function renderPrint(block: CjBlock): HTMLElement {
  const sheet = el('div', 'cj-print pf-print');
  sheet.append(el('p', 'cj-criterion block-subtitle', criterionOf(block.content)));
  const chips = block.content.chips.filter((c) => c.trim());
  if (chips.length) {
    const row = el('p', 'cj-print__chips block-secondary');
    row.append(el('span', 'pf-print__label', 'Look for: '), document.createTextNode(chips.join(' · ')));
    sheet.append(row);
  }
  const pairs = block.content.calibration.filter((c) => c.left.trim() || c.right.trim());
  if (!pairs.length) {
    sheet.append(el('p', 'pf-note block-secondary', 'Pairs of answers to judge are on screen in the lesson.'));
    return sheet;
  }
  pairs.forEach((pair, i) => {
    const part = el('section', 'cj-print__pair');
    part.append(el('p', 'pf-print__label', `Pair ${i + 1}`), pairRow(answerCard('left', pair.left), answerCard('right', pair.right)));
    part.append(el('p', 'pf-print__label', 'Which is better? Why?'), el('div', 'pf-print__lines'));
    sheet.append(part);
  });
  return sheet;
}
