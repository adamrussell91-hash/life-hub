import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  absolutePublicUrl,
  mountPublicLinkControl,
  publicStudentPath
} from '@/teacher/public-link';

describe('public link helpers', () => {
  it('builds ID-based student paths', () => {
    expect(publicStudentPath('lesson', 'lesson_1')).toBe('/s/lessons/lesson_1');
    expect(publicStudentPath('unit', 'unit_1')).toBe('/s/units/unit_1');
    expect(publicStudentPath('class', 'class_1')).toBe('/s/classes/class_1');
    expect(absolutePublicUrl('lesson', 'lesson_1', 'https://hub.example')).toBe(
      'https://hub.example/s/lessons/lesson_1'
    );
  });
});

describe('mountPublicLinkControl', () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
  });

  afterEach(() => {
    host.remove();
  });

  it('does not paint a publish nag for unpublished lessons', () => {
    const handle = mountPublicLinkControl(host, {
      kind: 'lesson',
      id: 'lesson_1',
      published: false
    });
    const popover = host.querySelector<HTMLElement>('.public-link__popover');
    expect(popover?.hidden).toBe(true);
    expect(host.textContent).not.toMatch(/Publish this lesson/i);
    host.querySelector('button')?.click();
    expect(popover?.hidden).toBe(true);
    expect(host.textContent).not.toMatch(/Publish this lesson/i);
    expect(host.querySelector('.public-link__actions')).toBeNull();
    handle.dispose();
  });

  it('keeps the popover hidden until the trigger is clicked', () => {
    const handle = mountPublicLinkControl(host, {
      kind: 'lesson',
      id: 'lesson_1',
      published: true
    });
    const popover = host.querySelector<HTMLElement>('.public-link__popover');
    expect(popover?.hidden).toBe(true);
    expect(host.querySelector('.public-link__url')).toBeNull();
    host.querySelector('button')!.click();
    expect(popover?.hidden).toBe(false);
    expect(host.classList.contains('public-link--open')).toBe(true);
    handle.dispose();
  });

  it('closes the open popover when another public-link opens', () => {
    const other = document.createElement('div');
    document.body.append(other);
    const first = mountPublicLinkControl(host, {
      kind: 'lesson',
      id: 'lesson_1',
      published: true
    });
    const second = mountPublicLinkControl(other, {
      kind: 'lesson',
      id: 'lesson_2',
      published: true
    });

    host.querySelector('button')!.click();
    expect(host.querySelector<HTMLElement>('.public-link__popover')?.hidden).toBe(false);

    other.querySelector('button')!.click();
    expect(host.querySelector<HTMLElement>('.public-link__popover')?.hidden).toBe(true);
    expect(host.classList.contains('public-link--open')).toBe(false);
    expect(other.querySelector<HTMLElement>('.public-link__popover')?.hidden).toBe(false);
    expect(other.querySelector('.public-link__url')?.textContent).toContain('/s/lessons/lesson_2');

    first.dispose();
    second.dispose();
    other.remove();
  });

  it('closes on Escape', () => {
    const handle = mountPublicLinkControl(host, {
      kind: 'lesson',
      id: 'lesson_1',
      published: true
    });
    host.querySelector('button')!.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(host.querySelector<HTMLElement>('.public-link__popover')?.hidden).toBe(true);
    handle.dispose();
  });

  it('shows copy and open for published lessons', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    });

    const handle = mountPublicLinkControl(host, {
      kind: 'lesson',
      id: 'lesson_1',
      published: true
    });
    host.querySelector('button')!.click();
    expect(host.querySelector('.public-link__url')?.textContent).toContain('/s/lessons/lesson_1');
    const copy = [...host.querySelectorAll('button')].find((btn) => btn.textContent === 'Copy');
    expect(copy).toBeTruthy();
    copy!.click();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalled();
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/s/lessons/lesson_1');
    handle.dispose();
  });
});
