import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mountStudentClassView } from '@/student/class-view';
import type { PublishedClass } from '@/student/published-class';

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

import { apiGet, ApiClientError } from '@/api/client';

const CLASS_ID = 'class_2026_12engadv1';

function sampleClass(overrides: Partial<PublishedClass> = {}): PublishedClass {
  return {
    id: CLASS_ID,
    code: '12ENGADV1',
    title: 'Year 12 English Advanced',
    display_name: '12ENGADV1',
    homepage: {
      announcements: [
        {
          id: 'block_ann_001',
          type: 'block',
          block_type: 'heading',
          variant: 'section',
          visibility: 'student_teacher',
          content: { text: 'Welcome back' },
          layout: {},
          print: {},
          settings: {},
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          schema_version: 1
        }
      ],
      resources: [],
      custom: []
    },
    current_unit: {
      id: 'unit_aotfw',
      title: 'Artist of the Floating World',
      lessons: []
    },
    current_lesson: {
      id: 'scheduled_aotfw_008',
      title: 'Memory, Identity and Ono',
      lesson_id: 'lesson_aotfw_008'
    },
    schedule: [
      {
        id: 'scheduled_aotfw_001',
        date: '2026-08-11',
        schedule_order: 1,
        lesson_id: 'lesson_aotfw_001',
        unit_id: 'unit_aotfw',
        title: 'Intro',
        published: true
      },
      {
        id: 'scheduled_aotfw_008',
        date: '2026-08-12',
        schedule_order: 2,
        lesson_id: 'lesson_aotfw_008',
        unit_id: 'unit_aotfw',
        title: 'Memory, Identity and Ono',
        published: false
      }
    ],
    active_units: [{ id: 'unit_aotfw', title: 'Artist of the Floating World' }],
    ...overrides
  };
}

describe('mountStudentClassView', () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
    document.body.replaceChildren();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('renders student hero, continue card, units, published links, and homepage blocks', async () => {
    vi.mocked(apiGet).mockResolvedValue(sampleClass());

    const root = document.createElement('div');
    document.body.append(root);
    mountStudentClassView({ root, classId: CLASS_ID });

    await vi.waitFor(() => {
      expect(root.querySelector('.student-hero__title')?.textContent).toBe(
        'Year 12 English Advanced'
      );
      expect(root.querySelector('.student-hero__eyebrow')?.textContent).toBe('12ENGADV1');
      expect(root.textContent).toContain('Artist of the Floating World');
      expect(root.textContent).toContain('Welcome back');
    });

    expect(apiGet).toHaveBeenCalledWith(`/api/published/classes/${CLASS_ID}`);
    expect(root.querySelector('.class-calendar')).toBeNull();
    expect(root.querySelector('.unit-sequence')).toBeNull();
    expect(root.querySelector('.entity-banner')).toBeNull();
    expect(root.querySelector('.class-page')).toBeNull();
    expect(root.querySelector('[data-class-section="current-unit"]')).toBeNull();
    expect(root.querySelector('[data-class-section="current-lesson"]')).toBeNull();

    const unitLink = root.querySelector('a.student-unit-card');
    expect(unitLink?.getAttribute('href')).toBe('/s/units/unit_aotfw');

    const currentOpen = root.querySelector(
      `.student-schedule__link[href="/s/classes/${CLASS_ID}/lessons/lesson_aotfw_008"]`
    );
    expect(currentOpen).toBeNull();

    const publishedOpen = root.querySelector(
      `.student-schedule__link[href="/s/classes/${CLASS_ID}/lessons/lesson_aotfw_001"]`
    );
    expect(publishedOpen).not.toBeNull();
    expect(publishedOpen?.textContent).toContain('Intro');

    expect(root.querySelector('.student-continue')).toBeTruthy();
    expect(root.querySelector('[data-homepage-region="announcements"]')).toBeTruthy();
    expect(root.querySelector('[data-homepage-region="resources"]')).toBeNull();
    expect(root.querySelector('[data-homepage-region="custom"]')).toBeNull();
  });

  it('shows Open on current lesson when that lesson is published', async () => {
    vi.mocked(apiGet).mockResolvedValue(
      sampleClass({
        schedule: [
          {
            id: 'scheduled_aotfw_008',
            date: '2026-08-12',
            schedule_order: 1,
            lesson_id: 'lesson_aotfw_008',
            unit_id: 'unit_aotfw',
            title: 'Memory, Identity and Ono',
            published: true
          }
        ]
      })
    );

    const root = document.createElement('div');
    document.body.append(root);
    mountStudentClassView({ root, classId: CLASS_ID });

    await vi.waitFor(() => {
      const open = root.querySelector(
        `a[href="/s/classes/${CLASS_ID}/lessons/lesson_aotfw_008"]`
      );
      expect(open).not.toBeNull();
    });
  });

  it('renders resolved collection links on homepage regions', async () => {
    const collection = {
      id: 'block_coll_001',
      type: 'block' as const,
      block_type: 'collection' as const,
      variant: 'medium',
      visibility: 'student_teacher' as const,
      content: { source: 'unit_lessons' as const, title: 'Unit lessons' },
      layout: {},
      print: {},
      settings: {},
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      schema_version: 1 as const
    };

    vi.mocked(apiGet).mockResolvedValue(
      sampleClass({
        homepage: {
          announcements: [],
          resources: [],
          custom: [collection]
        },
        current_unit: {
          id: 'unit_aotfw',
          title: 'Artist of the Floating World',
          lessons: [
            { id: 'lesson_aotfw_001', title: 'Intro' },
            { id: 'lesson_aotfw_008', title: 'Memory, Identity and Ono' }
          ]
        }
      })
    );

    const root = document.createElement('div');
    document.body.append(root);
    mountStudentClassView({ root, classId: CLASS_ID });

    await vi.waitFor(() => {
      expect(root.querySelector('[data-homepage-region="custom"]')).toBeTruthy();
      expect(root.textContent).toContain('Unit lessons');
      expect(root.textContent).toContain('Intro');
      expect(root.textContent).toContain('Memory, Identity and Ono');
    });

    const links = [
      ...root.querySelectorAll('[data-homepage-region="custom"] a.block-collection__link')
    ];
    expect(links).toHaveLength(2);
    expect(links[0]?.getAttribute('href')).toBe('/s/lessons/lesson_aotfw_001');
    expect(links[1]?.getAttribute('href')).toBe('/s/lessons/lesson_aotfw_008');
  });

  it('shows class not found on 404', async () => {
    vi.mocked(apiGet).mockRejectedValue(
      new ApiClientError({ code: 'not_found', message: 'missing' })
    );
    const root = document.createElement('div');
    document.body.append(root);
    mountStudentClassView({ root, classId: 'missing' });

    await vi.waitFor(() => {
      expect(root.textContent).toContain('Class not found');
    });
  });

  it('shows error copy on non-404 failures', async () => {
    vi.mocked(apiGet).mockRejectedValue(
      new ApiClientError({ code: 'server_error', message: 'boom' })
    );
    const root = document.createElement('div');
    document.body.append(root);
    mountStudentClassView({ root, classId: CLASS_ID });

    await vi.waitFor(() => {
      expect(root.textContent).toContain('Unable to load');
    });
  });
});
