import { describe, it, expect } from 'vitest';
import { renderLockedLesson } from '@/student/share-lesson';
import type { PublishedLesson } from '@/schemas/published-lesson';

const rich = (id: string, html: string) => ({ id, type: 'block', block_type: 'rich_text', variant: 'medium', visibility: 'student_teacher', content: { html }, settings: {} });
const lesson = {
  lesson_id: 'l1',
  title: 'Ghost poem',
  unit_id: 'unit1',
  blocks: [rich('b1', '<p>Read the poem.</p>')]
} as unknown as PublishedLesson;

describe('renderLockedLesson', () => {
  const root = renderLockedLesson(lesson, { backHref: '/s/share/Abc123_-Abc123_-Abc123_-' });
  it('says it is view only, with a way back', () => {
    expect(root.textContent).toContain('Viewing only. Nothing here can be changed.');
    expect(root.querySelector<HTMLAnchorElement>('a.share-locked__back')?.getAttribute('href')).toContain('/s/share/Abc123_-Abc123_-Abc123_-');
  });
  it('shows the lesson and makes its content inert', () => {
    expect(root.textContent).toContain('Read the poem.');
    expect(root.textContent).toContain('Ghost poem');
    expect(root.querySelector<HTMLElement>('.lesson-blocks')?.hasAttribute('inert')).toBe(true);
  });
  it('opens every details', () => {
    const withFold = { ...lesson, blocks: [{ ...rich('b2', '<details><summary>More</summary><p>Hidden</p></details>') }] } as unknown as PublishedLesson;
    const out = renderLockedLesson(withFold, { backHref: '/x' });
    for (const d of out.querySelectorAll('details')) expect(d.open).toBe(true);
  });
  it('shows a plain note when there is nothing to read', () => {
    const empty = renderLockedLesson({ ...lesson, blocks: [] } as unknown as PublishedLesson, { backHref: '/x' });
    expect(empty.textContent).toContain('This lesson runs as an activity in class');
  });
});
