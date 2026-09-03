import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHubFilter } from '../../design-kit/js/hub-filter-menu.js';

afterEach(() => {
  document.body.replaceChildren();
  document.querySelectorAll('.hub-menu').forEach((node) => node.remove());
});

describe('createHubFilter', () => {
  it('shows the selected label and is not set at the default', () => {
    const filter = createHubFilter({
      key: 'Subject',
      defaultValue: '',
      options: [
        { value: '', label: 'All subjects' },
        { value: 'eng', label: 'English' }
      ],
      value: ''
    });
    document.body.append(filter.el);

    expect(filter.el.querySelector('[data-hub-value]')?.textContent).toBe('All subjects');
    expect(filter.el.classList.contains('is-set')).toBe(false);
    expect(filter.getValue()).toBe('');
  });

  it('marks the trigger set when the value is not the default', () => {
    const filter = createHubFilter({
      key: 'Subject',
      defaultValue: '',
      options: [
        { value: '', label: 'All subjects' },
        { value: 'eng', label: 'English' }
      ],
      value: 'eng'
    });

    expect(filter.el.querySelector('[data-hub-value]')?.textContent).toBe('English');
    expect(filter.el.classList.contains('is-set')).toBe(true);
    expect(filter.getValue()).toBe('eng');
  });

  it('opens a menu and emits the chosen value', () => {
    const onChange = vi.fn();
    const filter = createHubFilter({
      key: 'Subject',
      defaultValue: '',
      options: [
        { value: '', label: 'All subjects' },
        { value: 'eng', label: 'English' }
      ],
      value: '',
      onChange
    });
    document.body.append(filter.el);

    filter.el.click();
    const option = document.querySelector<HTMLButtonElement>('.hub-menu__opt[data-hub-option="eng"]');
    expect(option).toBeTruthy();
    option?.click();

    expect(onChange).toHaveBeenCalledWith('eng');
    expect(filter.getValue()).toBe('eng');
    expect(filter.el.classList.contains('is-set')).toBe(true);
    expect(document.querySelector('.hub-menu')).toBeNull();
  });
});
