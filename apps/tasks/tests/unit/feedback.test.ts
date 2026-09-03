import { describe, expect, it, vi } from 'vitest';
import { showConfirmWrite } from '@/views/feedback';

describe('showConfirmWrite', () => {
  it('opens a compact overlay instead of a page-header banner', () => {
    const host = document.createElement('div');
    showConfirmWrite(host, 'Delete “Publish Year 12 pack”', 'This removes the task from the hub.', async () => undefined, 'Delete');

    const overlay = host.querySelector('.confirm-overlay');
    const card = host.querySelector('.confirm-card');
    const title = host.querySelector<HTMLElement>('.page-header__title');
    expect(overlay).not.toBeNull();
    expect(overlay?.contains(card)).toBe(true);
    expect(host.querySelector('.page-header__eyebrow')?.textContent).toBe('Delete');
    expect(title?.textContent).toBe('Delete “Publish Year 12 pack”');
    expect(title?.style.fontSize).toBe('var(--text-lg)');
    expect(host.querySelector('.page-header__supporting')?.textContent).toBe(
      'This removes the task from the hub.'
    );
    expect(host.querySelector('.btn--decisive')?.textContent).toBe('Delete');
  });

  it('closes the overlay without writing when Discard is clicked', async () => {
    const host = document.createElement('div');
    const onConfirm = vi.fn();
    showConfirmWrite(host, 'Delete “Tester”', 'This removes the task from the hub.', onConfirm, 'Delete');
    host.querySelector<HTMLButtonElement>('.btn--ghost')?.click();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(host.querySelector('.confirm-card')).toBeNull();
  });
});
