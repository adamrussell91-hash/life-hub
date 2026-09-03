import { afterEach, describe, expect, it } from 'vitest';
import {
  createCollapsibleFilters,
  resetCollapsibleFiltersForTests
} from '@/views/collapsible-filters';
import { createHubFilter, createHubSearch, domainFilterOptions, el } from '@/views/hub-kit';

describe('createCollapsibleFilters', () => {
  afterEach(() => {
    resetCollapsibleFiltersForTests();
    document.body.replaceChildren();
  });

  it('hides the filter controls behind an icon until it is clicked', () => {
    const search = createHubSearch({ placeholder: 'Filter…', ariaLabel: 'Filter items' });
    const domain = createHubFilter({
      key: 'Domain',
      label: 'Domain',
      defaultValue: 'all',
      options: domainFilterOptions(),
      value: 'all'
    });
    const filters = createCollapsibleFilters({ id: 'spec', ariaLabel: 'Filters' });
    filters.panel.append(search.el, domain.el);
    document.body.append(filters.root);

    expect(filters.toggle.getAttribute('aria-label')).toBe('Filters');
    expect(filters.toggle.getAttribute('aria-expanded')).toBe('false');
    expect(filters.panel.hidden).toBe(true);
    expect(filters.root.querySelector('.hub-search')).not.toBeNull();
    expect(filters.root.querySelector('.hub-filter')).not.toBeNull();

    filters.toggle.click();
    expect(filters.toggle.getAttribute('aria-expanded')).toBe('true');
    expect(filters.panel.hidden).toBe(false);
    expect(document.activeElement).toBe(search.input);
  });

  it('keeps the bar open across remounts and marks an active filter', () => {
    const first = createCollapsibleFilters({ id: 'remount', active: true });
    first.panel.append(el('span', undefined, 'Domain'));
    first.toggle.click();
    expect(first.panel.hidden).toBe(false);
    expect(first.toggle.classList.contains('is-set')).toBe(true);

    const second = createCollapsibleFilters({ id: 'remount', active: true });
    expect(second.panel.hidden).toBe(false);
    expect(second.toggle.getAttribute('aria-expanded')).toBe('true');

    second.panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(second.panel.hidden).toBe(true);
    expect(second.toggle.getAttribute('aria-expanded')).toBe('false');
  });
});
