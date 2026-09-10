import { describe, expect, it } from 'vitest';
import { applyHubPillsThumb } from '../../design-kit/js/hub-motion.js';
import { createHubPills } from '@/views/hub-kit';
import { universeViewToolsHtml } from '@/views/universe-chrome';

function size(el: HTMLElement, left: number, width: number): void {
  Object.defineProperty(el, 'offsetLeft', { configurable: true, value: left });
  Object.defineProperty(el, 'offsetTop', { configurable: true, value: 2 });
  Object.defineProperty(el, 'offsetWidth', { configurable: true, value: width });
  Object.defineProperty(el, 'offsetHeight', { configurable: true, value: 32 });
}

describe('hub pills sliding thumb', () => {
  it('slides the thumb from the first option to the next', () => {
    const pills = createHubPills({
      label: 'Range',
      role: 'tablist',
      items: [
        { id: 'day', label: 'Day' },
        { id: 'week', label: 'Week' },
        { id: 'month', label: 'Month' }
      ],
      value: 'day',
      onSelect: () => undefined
    });
    const buttons = [...pills.querySelectorAll<HTMLButtonElement>('.hub-pills__btn')];
    size(buttons[0]!, 2, 64);
    size(buttons[1]!, 66, 72);
    size(buttons[2]!, 138, 80);

    const first = applyHubPillsThumb(pills, { animate: false, reduced: true });
    expect(first).toEqual({ x: '2px', y: '2px', w: '64px', h: '32px' });
    expect(pills.querySelector('.hub-pills__thumb')).not.toBeNull();

    buttons[0]!.classList.remove('is-active');
    buttons[0]!.setAttribute('aria-selected', 'false');
    buttons[1]!.classList.add('is-active');
    buttons[1]!.setAttribute('aria-selected', 'true');

    const next = applyHubPillsThumb(pills, { animate: true, reduced: true });
    expect(next).toEqual({ x: '66px', y: '2px', w: '72px', h: '32px' });
    expect(pills.style.getPropertyValue('--hub-pill-x')).toBe('66px');
  });

  it('does not mount a thumb on independent universe toggles', () => {
    document.body.innerHTML = universeViewToolsHtml(true, false);
    const group = document.querySelector('.hub-pills')!;
    expect(group.classList.contains('hub-pills--loose')).toBe(true);
    expect(applyHubPillsThumb(group, { reduced: true })).toBeNull();
    expect(group.querySelector('.hub-pills__thumb')).toBeNull();
  });
});
