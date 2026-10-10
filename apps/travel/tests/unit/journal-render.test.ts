import { describe, expect, it } from 'vitest';
import { renderJournal } from '@/journal/render-journal';
import { klIstanbulFixture } from '@/journal/fixtures/kl-istanbul';

describe('renderJournal', () => {
  it('renders toolbar, two leg headings, and a transition', () => {
    const root = document.createElement('div');
    renderJournal(root, { fixture: klIstanbulFixture() });
    expect(root.querySelector('[data-journal-toolbar]')).toBeTruthy();
    expect(root.querySelectorAll('[data-journal-leg]')).toHaveLength(2);
    expect(root.querySelector('[data-journal-transition]')).toBeTruthy();
    expect(root.querySelector('[data-journal-timeline]')).toBeTruthy();
  });
});
