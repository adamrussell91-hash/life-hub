import { button, el, icon } from '@/journal/story/dom';

const SPARK = ['M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.900z', 'M19 16l.8 2.200L22 19l-2.200.800L19 22l-.800-2.200L16 19l2.200-.800z'];

/** "3 things noticed today". Drawn only when there is something unseen: no cards, no pill. */
export function renderNoticePill(count: number, onOpen: () => void): HTMLElement | null {
  if (count <= 0) return null;
  const wrap = el('div', 'notice-pill-row');
  const pill = button('notice-pill');
  pill.setAttribute('data-notice-pill', '');
  pill.append(icon(SPARK, 'story-icon notice-pill__icon'), el('span', 'num', count === 1 ? '1 thing noticed today' : `${count} things noticed today`));
  pill.addEventListener('click', onOpen);
  wrap.append(pill);
  return wrap;
}
