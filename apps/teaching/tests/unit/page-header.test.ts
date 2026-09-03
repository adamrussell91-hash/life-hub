import { describe, it, expect } from 'vitest';
import { renderPageHeader } from '@/teacher/page-header';

describe('renderPageHeader', () => {
  it('renders eyebrow, title, supporting line, and action hosts', () => {
    const host = document.createElement('div');
    const save = document.createElement('button');
    save.type = 'button';
    save.textContent = 'Publish';
    renderPageHeader(host, {
      eyebrow: 'Year 10 English',
      title: 'Class home',
      supporting: 'Today’s lesson, the month, and the unit sequence.',
      actions: [save]
    });
    expect(host.querySelector('.page-header__eyebrow')?.textContent).toBe('Year 10 English');
    expect(host.querySelector('.page-header__title')?.textContent).toBe('Class home');
    expect(host.querySelector('.page-header__supporting')?.textContent).toContain('unit sequence');
    expect(host.querySelector('.page-header__actions')?.contains(save)).toBe(true);
    expect(host.querySelector('.hub-mark')).toBeNull();
  });

  it('omits supporting when not provided', () => {
    const host = document.createElement('div');
    renderPageHeader(host, { eyebrow: 'Library', title: 'Lessons' });
    expect(host.querySelector('.page-header__supporting')).toBeNull();
  });

  it('can render actions only when the banner already names the page', () => {
    const host = document.createElement('div');
    const more = document.createElement('button');
    more.type = 'button';
    more.textContent = 'More';
    renderPageHeader(host, { actions: [more] });
    expect(host.querySelector('.page-header__title')).toBeNull();
    expect(host.querySelector('.page-header__eyebrow')).toBeNull();
    expect(host.querySelector('.page-header')?.classList.contains('page-header--actions-only')).toBe(
      true
    );
    expect(host.querySelector('.page-header__actions')?.contains(more)).toBe(true);
  });
});
