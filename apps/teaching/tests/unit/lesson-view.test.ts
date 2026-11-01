import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mountStudentLessonView } from '@/student/lesson-view';

vi.mock('@/api/client', () => ({
  apiGet: vi.fn(),
  ApiClientError: class ApiClientError extends Error {
    code: string;
    constructor(opts: { code: string; message: string }) {
      super(opts.message);
      this.code = opts.code;
    }
  }
}));

vi.mock('@/app/router', async () => {
  const actual = await vi.importActual<typeof import('@/app/router')>('@/app/router');
  return { ...actual, navigate: vi.fn() };
});

import { apiGet, ApiClientError } from '@/api/client';
import { navigate } from '@/app/router';

const CLASS_ID = 'class_2026_12engadv1';

function publishedLesson() {
  return {
    lesson_id: 'lesson_lkeep_008',
    title: 'Memory',
    unit_id: 'unit_lkeep',
    blocks: [] as Array<Record<string, unknown>>,
    published_at: '2026-02-01T12:00:00.000Z',
    schema_version: 1
  };
}

function publishedLessonWithLead() {
  return {
    ...publishedLesson(),
    blocks: [
      {
        id: 'block_001',
        type: 'block',
        variant: 'medium',
        visibility: 'student_teacher',
        layout: {},
        print: {},
        settings: {},
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        schema_version: 1,
        block_type: 'rich_text',
        content: { html: '<p>Lead copy here</p>' }
      }
    ]
  };
}

function publishedClass() {
  return {
    id: CLASS_ID,
    code: '12ENGADV1',
    title: 'Year 12 English Advanced',
    homepage: { announcements: [], resources: [], custom: [] },
    schedule: [
      {
        id: 's1',
        date: '2026-08-11',
        schedule_order: 1,
        lesson_id: 'lesson_lkeep_007',
        title: 'Earlier',
        published: true
      },
      {
        id: 's2',
        date: '2026-08-12',
        schedule_order: 2,
        lesson_id: 'lesson_lkeep_008',
        title: 'Memory',
        published: true
      },
      {
        id: 's3',
        date: '2026-08-13',
        schedule_order: 3,
        lesson_id: 'lesson_lkeep_009',
        title: 'Later',
        published: true
      }
    ],
    active_units: []
  };
}

describe('mountStudentLessonView', () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
    vi.mocked(navigate).mockReset();
    document.body.replaceChildren();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it('does not expose unit navigation from a direct student lesson', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      lesson_id: 'lesson_lkeep_008',
      title: 'Memory',
      unit_id: 'unit_lkeep',
      blocks: [],
      published_at: '2026-02-01T12:00:00.000Z',
      schema_version: 1
    });

    const root = document.createElement('div');
    document.body.append(root);
    mountStudentLessonView({ root, lessonId: 'lesson_lkeep_008' });

    await vi.waitFor(() => {
      const link = root.querySelector(
        'a.student-surface__back'
      ) as HTMLAnchorElement | null;
      expect(root.textContent).toContain('Memory');
      expect(link).toBeNull();
      expect(root.querySelector('a[href*="/s/units/"]')).toBeNull();
      expect(root.textContent).not.toContain('Back to unit');
    });
  });

  it('shows not-found without a back link when lesson missing', async () => {
    vi.mocked(apiGet).mockRejectedValue(
      new ApiClientError({ code: 'not_found', message: 'missing' })
    );
    const root = document.createElement('div');
    document.body.append(root);
    mountStudentLessonView({ root, lessonId: 'missing' });

    await vi.waitFor(() => {
      expect(root.textContent).toContain('Lesson not found');
    });
    expect(root.querySelector('a.student-surface__back')).toBeNull();
  });

  it('bare mount has no unit link or footer nav', async () => {
    vi.mocked(apiGet).mockResolvedValue(publishedLesson());
    const root = document.createElement('div');
    document.body.append(root);
    mountStudentLessonView({ root, lessonId: 'lesson_lkeep_008' });

    await vi.waitFor(() => {
      expect(root.textContent).toContain('Memory');
      expect(root.querySelector('a.student-surface__back')).toBeNull();
    });
    expect(root.querySelector('.lf')).toBeNull();
    expect(root.querySelector('a.student-surface__back-class')).toBeNull();
  });

  it('class-scoped mount keeps class and neighbor navigation without a unit link', async () => {
    vi.stubGlobal('location', new URL('https://class.adam-russell.com/s/lessons/lesson_lkeep_008'));
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path.includes('/published/classes/')) return publishedClass();
      if (path.includes('/published/lessons/')) return publishedLesson();
      throw new Error(path);
    });

    const root = document.createElement('div');
    document.body.append(root);
    mountStudentLessonView({
      root,
      lessonId: 'lesson_lkeep_008',
      classId: CLASS_ID
    });

    await vi.waitFor(() => {
      expect(root.querySelector('a.student-surface__back-class')?.getAttribute('href')).toBe(
        `https://class.adam-russell.com/s/classes/${CLASS_ID}`
      );
      expect(root.querySelector('a.student-surface__back-unit')).toBeNull();
      expect(root.querySelector('a[href*="/s/units/"]')).toBeNull();
      expect(root.textContent).not.toContain('Back to unit');
    });

    const prev = root.querySelector('a.lf__link--prev') as HTMLAnchorElement;
    const next = root.querySelector('a.lf__link--next') as HTMLAnchorElement;
    expect(prev.getAttribute('href')).toBe(
      `https://class.adam-russell.com/s/classes/${CLASS_ID}/lessons/lesson_lkeep_007`
    );
    expect(next.getAttribute('href')).toBe(
      `https://class.adam-russell.com/s/classes/${CLASS_ID}/lessons/lesson_lkeep_009`
    );

    prev.click();
    expect(navigate).toHaveBeenCalledWith(
      `/s/classes/${CLASS_ID}/lessons/lesson_lkeep_007`
    );
  });

  it('class-scoped shows not found when lesson not on schedule', async () => {
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path.includes('/published/classes/')) {
        return { ...publishedClass(), schedule: [] };
      }
      if (path.includes('/published/lessons/')) return publishedLesson();
      throw new Error(path);
    });

    const root = document.createElement('div');
    document.body.append(root);
    mountStudentLessonView({
      root,
      lessonId: 'lesson_lkeep_008',
      classId: CLASS_ID
    });

    await vi.waitFor(() => {
      expect(root.textContent).toContain('Lesson not found');
    });
  });

  it('class-scoped shows not found when schedule row is unpublished', async () => {
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path.includes('/published/classes/')) {
        return {
          ...publishedClass(),
          schedule: [
            {
              id: 's2',
              date: '2026-08-12',
              schedule_order: 2,
              lesson_id: 'lesson_lkeep_008',
              title: 'Memory',
              published: false
            }
          ]
        };
      }
      if (path.includes('/published/lessons/')) return publishedLesson();
      throw new Error(path);
    });

    const root = document.createElement('div');
    document.body.append(root);
    mountStudentLessonView({
      root,
      lessonId: 'lesson_lkeep_008',
      classId: CLASS_ID
    });

    await vi.waitFor(() => {
      expect(root.textContent).toContain('Lesson not found');
    });
  });

  it('class-scoped shows Class not found when class API returns not_found', async () => {
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path.includes('/published/classes/')) {
        throw new ApiClientError({ code: 'not_found', message: 'missing class' });
      }
      if (path.includes('/published/lessons/')) return publishedLesson();
      throw new Error(path);
    });

    const root = document.createElement('div');
    document.body.append(root);
    mountStudentLessonView({
      root,
      lessonId: 'lesson_lkeep_008',
      classId: CLASS_ID
    });

    await vi.waitFor(() => {
      expect(root.textContent).toContain('Class not found');
    });
  });

  it('class-scoped shows Lesson not found when lesson API returns not_found', async () => {
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path.includes('/published/classes/')) return publishedClass();
      if (path.includes('/published/lessons/')) {
        throw new ApiClientError({ code: 'not_found', message: 'missing lesson' });
      }
      throw new Error(path);
    });

    const root = document.createElement('div');
    document.body.append(root);
    mountStudentLessonView({
      root,
      lessonId: 'lesson_lkeep_008',
      classId: CLASS_ID
    });

    await vi.waitFor(() => {
      expect(root.textContent).toContain('Lesson not found');
    });
  });

  it('class-scoped shows Unable to load class on non-404 class failure', async () => {
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path.includes('/published/classes/')) {
        throw new ApiClientError({ code: 'server_error', message: 'boom' });
      }
      if (path.includes('/published/lessons/')) return publishedLesson();
      throw new Error(path);
    });

    const root = document.createElement('div');
    document.body.append(root);
    mountStudentLessonView({
      root,
      lessonId: 'lesson_lkeep_008',
      classId: CLASS_ID
    });

    await vi.waitFor(() => {
      expect(root.textContent).toContain('Unable to load');
    });
  });

  it('class-scoped mount renders the shared cover title, content once, and meta', async () => {
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path.includes('/published/classes/')) return publishedClass();
      if (path.includes('/published/lessons/')) return publishedLessonWithLead();
      throw new Error(path);
    });

    const root = document.createElement('div');
    document.body.append(root);
    mountStudentLessonView({
      root,
      lessonId: 'lesson_lkeep_008',
      classId: CLASS_ID
    });

    await vi.waitFor(() => {
      expect(root.querySelector('.lesson-hero__title')?.textContent).toBe('Memory');
    });
    expect(root.querySelectorAll('h1')).toHaveLength(1);
    expect(root.querySelector('.lesson-hero__lead')).toBeNull();
    expect(root.querySelector('.lesson-blocks')?.textContent).toContain('Lead copy');
    const meta = root.querySelector('.lesson-hero__meta');
    expect(meta).toBeTruthy();
    expect(meta?.textContent).toContain('Year 12 English Advanced');
    expect(meta?.textContent).toContain('12/08/26');
  });

  it('bare mount uses Lesson eyebrow and omits meta', async () => {
    vi.mocked(apiGet).mockResolvedValue(publishedLessonWithLead());
    const root = document.createElement('div');
    document.body.append(root);
    mountStudentLessonView({ root, lessonId: 'lesson_lkeep_008' });

    await vi.waitFor(() => {
      expect(root.querySelector('.lesson-hero__title')?.textContent).toBe('Memory');
    });
    expect(root.querySelector('.lesson-hero__eyebrow')?.textContent).toBe('Lesson');
    expect(root.querySelector('.lesson-hero__lead')).toBeNull();
    expect(root.querySelector('.lesson-blocks')?.textContent).toContain('Lead copy');
    expect(root.querySelector('.lesson-hero__meta')).toBeNull();
  });
  it.each([true, false])('uses the planner cover and title overlay, cover present: %s', async (hasCover) => {
    const lesson = {
      ...publishedLessonWithLead(),
      ...(hasCover ? { cover: { url: 'https://example.com/art.jpg', alt_text: 'Lesson artwork' } } : {})
    };
    vi.mocked(apiGet).mockResolvedValue(lesson);
    const root = document.createElement('div');
    document.body.append(root);
    const handle = mountStudentLessonView({ root, lessonId: lesson.lesson_id });
    await vi.waitFor(() => {
      const cover = root.querySelector('.lesson-hero .lesson-page__cover');
      expect(cover?.querySelector('.entity-banner--hero .entity-banner__scrim')).not.toBeNull();
      const heading = cover?.querySelector('h1.entity-page-title__text');
      expect(heading?.textContent).toBe(lesson.title);
      expect(heading?.closest('.entity-page-title')).not.toBeNull();
      expect(heading?.getAttribute('aria-hidden')).not.toBe('true');
    });
    expect(root.querySelectorAll('h1')).toHaveLength(1);
    expect(root.querySelector('.student-hero__copy')).toBeNull();
    expect(root.querySelector('.entity-banner__edit')).toBeNull();
    expect(root.querySelector('.lesson-hero input, .lesson-hero textarea')).toBeNull();
    if (hasCover) {
      const image = root.querySelector<HTMLImageElement>('.entity-banner__image')!;
      expect(image.src).toBe('https://example.com/art.jpg');
      expect(image.alt).toBe('Lesson artwork');
    } else {
      expect(root.querySelector('.entity-banner__fallback')?.getAttribute('style')).toContain('var(--marine)');
    }
    handle.dispose();
  });

  it('plays a lecture lesson in the lecture player, with the hero on its title card', async () => {
    const lesson = publishedLessonWithLead();
    vi.mocked(apiGet).mockResolvedValue({ ...lesson, pedagogical_mode: 'lecture' });
    const root = document.createElement('div');
    document.body.append(root);
    const handle = mountStudentLessonView({ root, lessonId: 'lesson_lkeep_008' });

    await vi.waitFor(() => {
      expect(root.querySelector('.lecture .lecture-title .lesson-hero__title')?.textContent).toBe('Memory');
    });
    expect(root.querySelector('.lesson-blocks')).toBeNull();
    root.querySelector<HTMLButtonElement>('.lecture-title__start')!.click();
    expect(root.querySelector('.lecture-stage')?.textContent).toContain('Lead copy here');
    // No class link: nothing to send hand-ups to.
    expect(root.querySelector<HTMLElement>('.lecture-strip__hand')?.hidden).toBe(true);
    handle.dispose();
  });

  it('routes a tutorial lesson to the tutorial player', async () => {
    const lesson = publishedLessonWithLead();
    vi.mocked(apiGet).mockResolvedValue({ ...lesson, pedagogical_mode: 'tutorial' });
    const root = document.createElement('div');
    document.body.append(root);
    const handle = mountStudentLessonView({ root, lessonId: 'lesson_lkeep_008' });

    // Opened without a class, so there is no one to fetch a group tab for.
    await vi.waitFor(() => {
      expect(root.querySelector('.tut')?.textContent).toContain('Open this tutorial from your class page.');
    });
    expect(root.querySelector('.lesson-blocks')).toBeNull();
    expect(root.textContent).toContain('Tutorial');
    handle.dispose();
  });

  it('leaves a side path out of an ordinary lesson page', async () => {
    const lesson = publishedLessonWithLead();
    const lead = lesson.blocks[0]!;
    const sidePath = {
      ...lead,
      id: 'side_1',
      block_type: 'section',
      content: { title: 'Second look', side_path: true, blocks: [{ ...lead, id: 'side_text', content: { html: '<p>Hidden detour</p>' } }] }
    };
    vi.mocked(apiGet).mockResolvedValue({ ...lesson, blocks: [lead, sidePath] });
    const root = document.createElement('div');
    document.body.append(root);
    const handle = mountStudentLessonView({ root, lessonId: 'lesson_lkeep_008' });

    await vi.waitFor(() => {
      expect(root.textContent).toContain('Lead copy here');
    });
    expect(root.querySelector('[data-block-id="side_1"]')).toBeNull();
    expect(root.textContent).not.toContain('Hidden detour');
    handle.dispose();
  });
});
