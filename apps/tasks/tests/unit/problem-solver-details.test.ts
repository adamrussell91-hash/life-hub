import { describe, expect, it } from 'vitest';
import { createDisclosureGroup, detailsCard } from '../../../../packages/problem-solver/render/details';
import type { PsNode } from '../../../../packages/problem-solver/types';

const node: PsNode = { id: 'n', slot: 'cause:1', text: 'Full answer text.', state: 'contested', objection: 'Too vague.', skills: ['analysis'], turnId: 't' };

describe('details card', () => {
  it('shows text, skill chips and the coach objection', () => {
    const card = detailsCard(document, node, 'blue', 'd1');
    expect(card.id).toBe('d1');
    expect(card.querySelector('.ps-details__card--blue')).not.toBeNull();
    expect(card.querySelector('.ps-details__text')!.textContent).toBe('Full answer text.');
    expect(card.querySelectorAll('.ps-details__skills .ps-skill').length).toBe(1);
    expect(card.querySelector('.ps-details__note')!.textContent).toContain('Too vague.');
  });
});

describe('disclosure group', () => {
  it('opens one item at a time and syncs aria-expanded', () => {
    const group = createDisclosureGroup();
    const make = () => {
      const item = document.createElement('div');
      const button = document.createElement('button');
      item.append(button);
      group.register(item, button);
      return { item, button };
    };
    const a = make();
    const b = make();
    a.button.click();
    expect(a.item.classList.contains('is-open')).toBe(true);
    expect(a.button.getAttribute('aria-expanded')).toBe('true');
    b.button.click();
    expect(a.item.classList.contains('is-open')).toBe(false);
    expect(a.button.getAttribute('aria-expanded')).toBe('false');
    b.button.click();
    expect(b.item.classList.contains('is-open')).toBe(false);
  });
});
