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
    lesson_id: 'lesson_aotfw_008',
    title: 'Memory',
    unit_id: 'unit_aotfw',
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
        lesson_id: 'lesson_aotfw_007',
        title: 'Earlier',
        published: true
      },
      {
        id: 's2',
        date: '2026-08-12',
        schedule_order: 2,
        lesson_id: 'lesson_aotfw_008',
        title: 'Memory',
        published: true
      },
      {
        id: 's3',
        date: '2026-08-13',
        schedule_order: 3,
        lesson_id: 'lesson_aotfw_009',
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
    document.body.replaceChildren();
  });

  it('renders Back to unit linking to /s/units/{unit_id}', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      lesson_id: 'lesson_aotfw_008',
      title: 'Memory',
      unit_id: 'unit_aotfw',
      blocks: [],
      published_at: '2026-02-01T12:00:00.000Z',
      schema_version: 1
    });

    const root = document.createElement('div');
    document.body.append(root);
    mountStudentLessonView({ root, lessonId: 'lesson_aotfw_008' });

    await vi.waitFor(() => {
      const link = root.querySelector(
        'a.student-surface__back'
      ) as HTMLAnchorElement | null;
      expect(link).toBeTruthy();
      expect(link?.textContent).toBe('Back to unit');
      expect(link?.getAttribute('href')).toBe('/s/units/unit_aotfw');
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

  it('bare mount still has only Back to unit and no footer nav', async () => {
    vi.mocked(apiGet).mockResolvedValue(publishedLesson());
    const root = document.createElement('div');
    document.body.append(root);
    mountStudentLessonView({ root, lessonId: 'lesson_aotfw_008' });

    await vi.waitFor(() => {
      expect(root.querySelector('a.student-surface__back')?.textContent).toBe('Back to unit');
    });
    expect(root.querySelector('.student-lesson__nav')).toBeNull();
    expect(root.querySelector('a.student-surface__back-class')).toBeNull();
  });

  it('class-scoped mount shows Back to class, Back to unit, and footer neighbors', async () => {
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path.includes('/published/classes/')) return publishedClass();
      if (path.includes('/published/lessons/')) return publishedLesson();
      throw new Error(path);
    });

    const root = document.createElement('div');
    document.body.append(root);
    mountStudentLessonView({
      root,
      lessonId: 'lesson_aotfw_008',
      classId: CLASS_ID
    });

    await vi.waitFor(() => {
      expect(root.querySelector('a.student-surface__back-class')?.getAttribute('href')).toBe(
        `/s/classes/${CLASS_ID}`
      );
      expect(root.querySelector('a.student-surface__back-unit')?.getAttribute('href')).toBe(
        '/s/units/unit_aotfw'
      );
    });

    const prev = root.querySelector('a.student-lesson__nav-prev') as HTMLAnchorElement;
    const next = root.querySelector('a.student-lesson__nav-next') as HTMLAnchorElement;
    expect(prev.getAttribute('href')).toBe(
      `/s/classes/${CLASS_ID}/lessons/lesson_aotfw_007`
    );
    expect(next.getAttribute('href')).toBe(
      `/s/classes/${CLASS_ID}/lessons/lesson_aotfw_009`
    );

    prev.click();
    expect(navigate).toHaveBeenCalledWith(
      `/s/classes/${CLASS_ID}/lessons/lesson_aotfw_007`
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
      lessonId: 'lesson_aotfw_008',
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
              lesson_id: 'lesson_aotfw_008',
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
      lessonId: 'lesson_aotfw_008',
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
      lessonId: 'lesson_aotfw_008',
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
      lessonId: 'lesson_aotfw_008',
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
      lessonId: 'lesson_aotfw_008',
      classId: CLASS_ID
    });

    await vi.waitFor(() => {
      expect(root.textContent).toContain('Unable to load');
    });
  });

  it('class-scoped mount renders hero title, lead, and meta', async () => {
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path.includes('/published/classes/')) return publishedClass();
      if (path.includes('/published/lessons/')) return publishedLessonWithLead();
      throw new Error(path);
    });

    const root = document.createElement('div');
    document.body.append(root);
    mountStudentLessonView({
      root,
      lessonId: 'lesson_aotfw_008',
      classId: CLASS_ID
    });

    await vi.waitFor(() => {
      expect(root.querySelector('.lesson-hero__title')?.textContent).toBe('Memory');
    });
    expect(root.querySelectorAll('h1')).toHaveLength(1);
    expect(root.querySelector('.lesson-hero__lead')?.textContent).toContain('Lead copy');
    const meta = root.querySelector('.lesson-hero__meta');
    expect(meta).toBeTruthy();
    expect(meta?.textContent).toContain('Year 12 English Advanced');
    expect(meta?.textContent).toContain('12/08/26');
  });

  it('bare mount uses Lesson eyebrow and omits meta', async () => {
    vi.mocked(apiGet).mockResolvedValue(publishedLessonWithLead());
    const root = document.createElement('div');
    document.body.append(root);
    mountStudentLessonView({ root, lessonId: 'lesson_aotfw_008' });

    await vi.waitFor(() => {
      expect(root.querySelector('.lesson-hero__title')?.textContent).toBe('Memory');
    });
    expect(root.querySelector('.lesson-hero__eyebrow')?.textContent).toBe('Lesson');
    expect(root.querySelector('.lesson-hero__lead')?.textContent).toContain('Lead copy');
    expect(root.querySelector('.lesson-hero__meta')).toBeNull();
  });
});
