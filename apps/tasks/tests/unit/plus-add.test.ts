import { describe, expect, it, vi } from 'vitest';
import { createPlusAdd, createPlusButton, openPlusAdd } from '@/views/plus-add';

describe('plus add', () => {
  it('starts as a plus and reveals the panel on click', () => {
    const panel = document.createElement('form');
    panel.className = 'quick-add';
    const input = document.createElement('input');
    panel.append(input);
    const plus = createPlusAdd({ ariaLabel: 'Add a task', panel });
    expect(plus.root.querySelector('.plus-add__btn')?.getAttribute('aria-label')).toBe('Add a task');
    expect(plus.root.querySelector<HTMLElement>('.plus-add__panel')?.hidden).toBe(true);
    plus.root.querySelector<HTMLButtonElement>('.plus-add__btn')!.click();
    expect(plus.root.querySelector<HTMLElement>('.plus-add__panel')?.hidden).toBe(false);
    expect(plus.root.querySelector<HTMLButtonElement>('.plus-add__btn')?.hidden).toBe(true);
  });

  it('opens from a host so calendar day plus can focus the field', () => {
    const host = document.createElement('div');
    const panel = document.createElement('form');
    const input = document.createElement('input');
    panel.append(input);
    host.append(createPlusAdd({ ariaLabel: 'Add a task', panel }).root);
    const field = openPlusAdd(host);
    expect(field).toBe(input);
    expect(host.querySelector<HTMLElement>('.plus-add__panel')?.hidden).toBe(false);
  });

  it('builds a plus button for one-shot add actions', () => {
    const onClick = vi.fn();
    const btn = createPlusButton('Add a program', onClick);
    expect(btn.getAttribute('aria-label')).toBe('Add a program');
    expect(btn.textContent).not.toBe('Add');
    btn.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
