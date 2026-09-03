// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { fakeStore } = vi.hoisted(() => {
  class FakeStore {
    private readonly data = new Map<string, unknown>();

    reset(): void {
      this.data.clear();
    }

    seed(key: string, value: unknown): void {
      this.data.set(key, value);
    }

    raw(key: string): unknown {
      return this.data.get(key);
    }

    async get(key: string, opts?: { type?: string }): Promise<unknown> {
      if (!this.data.has(key)) return null;
      const value = this.data.get(key);
      if (opts?.type === 'json') return value;
      return typeof value === 'string' ? value : JSON.stringify(value);
    }

    async setJSON(key: string, value: unknown): Promise<void> {
      this.data.set(key, value);
    }

    async delete(key: string): Promise<void> {
      this.data.delete(key);
    }

    async list({ prefix = '' }: { prefix?: string } = {}): Promise<{
      blobs: { key: string; etag: string }[];
      directories: string[];
    }> {
      const blobs = [...this.data.keys()]
        .filter((key) => key.startsWith(prefix))
        .map((key) => ({ key, etag: 'fake-etag' }));
      return { blobs, directories: [] };
    }
  }

  return { fakeStore: new FakeStore() };
});

vi.mock('../../netlify/functions/_shared/blobs.mts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../netlify/functions/_shared/blobs.mts')>();
  return { ...actual, getContentStore: () => fakeStore };
});

const {
  yearKey,
  subjectKey,
  unitKey,
  draftLessonKey,
  publishedLessonKey,
  classKey,
  scheduledLessonKey,
  scheduleAnchorKey,
  scopeSequenceKey,
  mediaKey
} = await import('../../netlify/functions/_shared/blobs.mts');
const { createSessionToken } = await import('../../netlify/functions/_shared/auth-security.mts');
const curriculumHandler = (await import('../../netlify/functions/curriculum.mts')).default;
const lessonHandler = (await import('../../netlify/functions/lesson.mts')).default;
const publishHandler = (await import('../../netlify/functions/publish.mts')).default;
const publishedLessonHandler = (await import('../../netlify/functions/published-lesson.mts')).default;
const publishedUnitHandler = (await import('../../netlify/functions/published-unit.mts')).default;
const publishedClassHandler = (await import('../../netlify/functions/published-class.mts')).default;
const scheduleUnitHandler = (await import('../../netlify/functions/schedule-unit.mts')).default;
const scheduledLessonHandler = (await import('../../netlify/functions/scheduled-lesson.mts')).default;
const classHandler = (await import('../../netlify/functions/class.mts')).default;
const scopeSequenceHandler = (await import('../../netlify/functions/scope-sequence.mts')).default;
const classesCreateHandler = (await import('../../netlify/functions/classes.mts')).default;
const unitsCreateHandler = (await import('../../netlify/functions/units.mts')).default;
const lessonsCreateHandler = (await import('../../netlify/functions/lessons.mts')).default;
const scopeSequencesCreateHandler = (await import('../../netlify/functions/scope-sequences.mts'))
  .default;

const SESSION_SECRET = 's'.repeat(32);
const FUNCTION_ORIGIN = 'https://api.example.netlify.app';

beforeEach(() => {
  fakeStore.reset();
  process.env.TEACHING_HUB_PASSPHRASE_HASH = 'scrypt$v1$16384$8$1$aaaaaaaaaaaaaaaaaaaaaa$bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  process.env.SESSION_SECRET = SESSION_SECRET;
  delete process.env.SITE_ORIGIN;
});

afterEach(() => {
  delete process.env.TEACHING_HUB_PASSPHRASE_HASH;
  delete process.env.SESSION_SECRET;
  delete process.env.SITE_ORIGIN;
});

function sessionCookieHeader(): string {
  const issued = createSessionToken({ now: Date.now() }, SESSION_SECRET);
  return `teaching_hub_session=${issued.token}`;
}

function request(path: string, init: RequestInit & { cookie?: string } = {}): Request {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set('cookie', init.cookie);
  return new Request(`${FUNCTION_ORIGIN}${path}`, { ...init, headers });
}

const timestamps = {
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z'
};

function block(overrides: Record<string, unknown>) {
  return {
    id: 'block_001',
    type: 'block' as const,
    variant: 'medium',
    visibility: 'student_teacher' as const,
    layout: {},
    print: {},
    settings: {},
    ...timestamps,
    schema_version: 1 as const,
    ...overrides
  };
}

function draftLesson(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lesson_aotfw_008',
    type: 'lesson' as const,
    title: 'Memory, Identity and Ono',
    slug: 'memory_identity_and_ono',
    unit_id: 'unit_aotfw',
    sequence: 8,
    blocks: [
      block({
        id: 'block_l008_001',
        block_type: 'heading',
        variant: 'page',
        content: { text: 'Memory, Identity and Ono' }
      }),
      block({
        id: 'block_l008_002',
        block_type: 'rich_text',
        content: { html: '<p>Safe text</p><script>alert(1)</script>' }
      }),
      block({
        id: 'block_l008_003',
        block_type: 'callout',
        visibility: 'teacher_only',
        content: { style: 'teacher', body: 'Teacher note — do not show students.' }
      })
    ],
    status: 'active' as const,
    ...timestamps,
    schema_version: 1 as const,
    ...overrides
  };
}

describe('GET /api/curriculum', () => {
  it('rejects unauthenticated requests', async () => {
    const response = await curriculumHandler(request('/api/curriculum'));
    expect(response.status).toBe(401);
  });

  it('returns empty lists without auto-seeding when the store is empty', async () => {
    const response = await curriculumHandler(request('/api/curriculum', { cookie: sessionCookieHeader() }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      ok: true,
      data: {
        years: [],
        subjects: [],
        units: [],
        lessons: [],
        classes: [],
        scheduled_lessons: [],
        scope_sequences: [],
        media: [],
        outcomes: [],
        schedule_anchor_date: '2026-08-12'
      }
    });
  });

  it('aggregates seeded content and flags published lessons', async () => {
    fakeStore.seed(yearKey('year_12'), { id: 'year_12', title: 'Year 12' });
    fakeStore.seed(subjectKey('subject_engadv'), { id: 'subject_engadv', title: 'English Advanced' });
    fakeStore.seed(unitKey('unit_aotfw'), { id: 'unit_aotfw', title: 'Artist of the Floating World' });
    fakeStore.seed(draftLessonKey('lesson_aotfw_008'), draftLesson());
    fakeStore.seed(publishedLessonKey('lesson_aotfw_008'), { lesson_id: 'lesson_aotfw_008' });
    fakeStore.seed(classKey('class_2026_12engadv1'), {
      id: 'class_2026_12engadv1',
      type: 'class',
      code: '12ENGADV1',
      title: 'Year 12 English Advanced',
      slug: '12engadv1',
      academic_year: 2026,
      year_id: 'year_12',
      subject_id: 'subject_engadv',
      active_unit_ids: ['unit_aotfw'],
      status: 'active',
      ...timestamps,
      schema_version: 1
    });
    fakeStore.seed(scheduledLessonKey('scheduled_aotfw_008'), {
      id: 'scheduled_aotfw_008',
      type: 'scheduled_lesson',
      class_id: 'class_2026_12engadv1',
      unit_id: 'unit_aotfw',
      lesson_id: 'lesson_aotfw_008',
      date: '2026-08-12',
      schedule_order: 1,
      delivery_status: 'current',
      ...timestamps,
      schema_version: 1
    });
    fakeStore.seed(scheduleAnchorKey(), { date: '2026-08-12' });
    fakeStore.seed(mediaKey('media_ono_extract'), {
      id: 'media_ono_extract',
      type: 'media',
      title: 'Ono Extract (PDF)',
      slug: 'ono_extract',
      provider: 'external',
      media_type: 'pdf',
      mime_type: 'application/pdf',
      file_name: 'ono-extract.pdf',
      preview_url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
      status: 'active',
      ...timestamps,
      schema_version: 1
    });
    fakeStore.seed(scopeSequenceKey('scope_y12_engadv_2026'), {
      id: 'scope_y12_engadv_2026',
      type: 'scope_sequence',
      title: 'Year 12 English Advanced 2026',
      slug: 'y12_engadv_2026',
      subject_id: 'subject_engadv',
      academic_year: 2026,
      week_count: 40,
      terms: [
        { id: 'term_t1', title: 'Term 1', term_number: 1, start_week: 1, end_week: 10 },
        { id: 'term_t2', title: 'Term 2', term_number: 2, start_week: 11, end_week: 20 },
        { id: 'term_t3', title: 'Term 3', term_number: 3, start_week: 21, end_week: 30 },
        { id: 'term_t4', title: 'Term 4', term_number: 4, start_week: 31, end_week: 40 }
      ],
      timeline_items: [
        {
          id: 'ti_unit_aotfw',
          kind: 'unit',
          unit_id: 'unit_aotfw',
          start_week: 12,
          end_week: 18,
          order: 1
        }
      ],
      status: 'active',
      ...timestamps,
      schema_version: 1
    });

    const response = await curriculumHandler(request('/api/curriculum', { cookie: sessionCookieHeader() }));
    const body = await response.json();

    expect(body.data.years).toHaveLength(1);
    expect(body.data.subjects).toHaveLength(1);
    expect(body.data.units).toHaveLength(1);
    expect(body.data.classes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'class_2026_12engadv1', code: '12ENGADV1' })
      ])
    );
    expect(body.data.scheduled_lessons.length).toBeGreaterThan(0);
    expect(body.data.scope_sequences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'scope_y12_engadv_2026', subject_id: 'subject_engadv' })
      ])
    );
    expect(body.data.schedule).toBeUndefined();
    expect(body.data.schedule_anchor_date).toBe('2026-08-12');
    expect(body.data.media).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'media_ono_extract', media_type: 'pdf' })
      ])
    );
    expect(body.data.lessons).toEqual([
      expect.objectContaining({
        id: 'lesson_aotfw_008',
        title: 'Memory, Identity and Ono',
        slug: 'memory_identity_and_ono',
        unit_id: 'unit_aotfw',
        sequence: 8,
        status: 'active',
        published: true,
        updated_at: '2026-01-01T00:00:00.000Z',
        created_at: '2026-01-01T00:00:00.000Z',
        attachment_count: 0
      })
    ]);
    const lesson = body.data.lessons.find((l: { id: string }) => l.id === 'lesson_aotfw_008');
    expect(lesson.updated_at).toBeTruthy();
  });

  it('includes published_at on lesson summaries when the draft has published_at', async () => {
    fakeStore.seed(
      draftLessonKey('lesson_aotfw_008'),
      draftLesson({ published_at: '2026-02-01T12:00:00.000Z' })
    );

    const response = await curriculumHandler(request('/api/curriculum', { cookie: sessionCookieHeader() }));
    const body = await response.json();

    expect(body.data.lessons).toEqual([
      expect.objectContaining({
        id: 'lesson_aotfw_008',
        published_at: '2026-02-01T12:00:00.000Z'
      })
    ]);
  });
});

describe('GET/PUT /api/lessons/:id', () => {
  it('rejects unauthenticated GET', async () => {
    const response = await lessonHandler(request('/api/lessons/lesson_aotfw_008'), {
      params: { id: 'lesson_aotfw_008' }
    });
    expect(response.status).toBe(401);
  });

  it('returns 404 for a missing draft', async () => {
    const response = await lessonHandler(
      request('/api/lessons/nope', { cookie: sessionCookieHeader() }),
      { params: { id: 'nope' } }
    );
    expect(response.status).toBe(404);
  });

  it('returns 404 when the route id param is missing', async () => {
    const response = await lessonHandler(request('/api/lessons/'), { params: {} });
    expect(response.status).toBe(404);
  });

  it('returns the stored draft on GET', async () => {
    fakeStore.seed(draftLessonKey('lesson_aotfw_008'), draftLesson());
    const response = await lessonHandler(
      request('/api/lessons/lesson_aotfw_008', { cookie: sessionCookieHeader() }),
      { params: { id: 'lesson_aotfw_008' } }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.title).toBe('Memory, Identity and Ono');
  });

  it('rejects PUT with a body that fails validation', async () => {
    const response = await lessonHandler(
      request('/api/lessons/lesson_aotfw_008', {
        method: 'PUT',
        cookie: sessionCookieHeader(),
        body: JSON.stringify({ title: '', blocks: [] })
      }),
      { params: { id: 'lesson_aotfw_008' } }
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('validation_error');
    expect(Array.isArray(body.error.details)).toBe(true);
  });

  it('saves a valid PUT, forcing the id from the route and refreshing updated_at', async () => {
    const draft = draftLesson({ title: 'Updated title', id: 'mismatched-id', updated_at: '2020-01-01T00:00:00.000Z' });
    const response = await lessonHandler(
      request('/api/lessons/lesson_aotfw_008', {
        method: 'PUT',
        cookie: sessionCookieHeader(),
        body: JSON.stringify(draft)
      }),
      { params: { id: 'lesson_aotfw_008' } }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.id).toBe('lesson_aotfw_008');
    expect(body.data.title).toBe('Updated title');
    expect(body.data.updated_at).not.toBe('2020-01-01T00:00:00.000Z');

    const stored = fakeStore.raw(draftLessonKey('lesson_aotfw_008'));
    expect(stored).toMatchObject({ id: 'lesson_aotfw_008', title: 'Updated title' });
  });

  it('rejects unsupported methods', async () => {
    // DELETE is supported (permanent delete when trashed); POST is not on this handler.
    const response = await lessonHandler(
      request('/api/lessons/lesson_aotfw_008', { method: 'POST', cookie: sessionCookieHeader() }),
      { params: { id: 'lesson_aotfw_008' } }
    );
    expect(response.status).toBe(405);
  });
});

describe('POST /api/lessons/:id/publish', () => {
  it('rejects unauthenticated requests', async () => {
    const response = await publishHandler(
      request('/api/lessons/lesson_aotfw_008/publish', { method: 'POST' }),
      { params: { id: 'lesson_aotfw_008' } }
    );
    expect(response.status).toBe(401);
  });

  it('returns 404 when the draft does not exist', async () => {
    const response = await publishHandler(
      request('/api/lessons/nope/publish', { method: 'POST', cookie: sessionCookieHeader() }),
      { params: { id: 'nope' } }
    );
    expect(response.status).toBe(404);
  });

  it('rejects an unpublishable draft (empty title)', async () => {
    fakeStore.seed(draftLessonKey('lesson_aotfw_008'), draftLesson({ title: '' }));
    const response = await publishHandler(
      request('/api/lessons/lesson_aotfw_008/publish', { method: 'POST', cookie: sessionCookieHeader() }),
      { params: { id: 'lesson_aotfw_008' } }
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('validation_error');
  });

  it('publishes a student snapshot: strips teacher_only blocks and sanitizes rich text', async () => {
    fakeStore.seed(draftLessonKey('lesson_aotfw_008'), draftLesson());

    const response = await publishHandler(
      request('/api/lessons/lesson_aotfw_008/publish', { method: 'POST', cookie: sessionCookieHeader() }),
      { params: { id: 'lesson_aotfw_008' } }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.student_path).toBe('/s/lessons/lesson_aotfw_008');

    const snapshot = fakeStore.raw(publishedLessonKey('lesson_aotfw_008')) as {
      blocks: Array<{ block_type: string; content: { html?: string } }>;
    };
    expect(snapshot.blocks).toHaveLength(2);
    expect(snapshot.blocks.some((b) => b.block_type === 'callout')).toBe(false);

    const richText = snapshot.blocks.find((b) => b.block_type === 'rich_text');
    expect(richText?.content.html).not.toContain('<script>');
    expect(richText?.content.html).toContain('Safe text');
  });

  it('sanitises html blocks on publish', async () => {
    fakeStore.seed(
      draftLessonKey('lesson_aotfw_008'),
      draftLesson({
        blocks: [
          block({
            id: 'block_l008_001',
            block_type: 'heading',
            variant: 'page',
            content: { text: 'Memory, Identity and Ono' }
          }),
          block({
            id: 'block_l008_html',
            block_type: 'html',
            content: { html: '<p>Safe html</p><script>alert(1)</script>' }
          })
        ]
      })
    );

    const response = await publishHandler(
      request('/api/lessons/lesson_aotfw_008/publish', { method: 'POST', cookie: sessionCookieHeader() }),
      { params: { id: 'lesson_aotfw_008' } }
    );
    expect(response.status).toBe(200);

    const snapshot = fakeStore.raw(publishedLessonKey('lesson_aotfw_008')) as {
      blocks: Array<{ block_type: string; content: { html?: string } }>;
    };
    const htmlBlock = snapshot.blocks.find((b) => b.block_type === 'html');
    expect(htmlBlock?.content.html).not.toContain('<script>');
    expect(htmlBlock?.content.html).toContain('Safe html');
  });
});

describe('GET /api/published/lessons/:id', () => {
  it('returns 404 when the lesson is not published', async () => {
    const response = await publishedLessonHandler(
      request('/api/published/lessons/lesson_aotfw_008'),
      { params: { id: 'lesson_aotfw_008' } }
    );
    expect(response.status).toBe(404);
  });

  it('is public: returns the published snapshot without a session cookie', async () => {
    fakeStore.seed(publishedLessonKey('lesson_aotfw_008'), { lesson_id: 'lesson_aotfw_008', title: 'Published' });
    const response = await publishedLessonHandler(
      request('/api/published/lessons/lesson_aotfw_008'),
      { params: { id: 'lesson_aotfw_008' } }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.title).toBe('Published');
  });
});

describe('GET /api/published/units/:id', () => {
  it('returns 404 when the unit blob is missing', async () => {
    const response = await publishedUnitHandler(
      request('/api/published/units/unit_missing'),
      { params: { id: 'unit_missing' } }
    );
    expect(response.status).toBe(404);
  });

  it('is public and returns only published lessons for that unit, in lesson_ids order', async () => {
    fakeStore.seed(unitKey('unit_aotfw'), {
      id: 'unit_aotfw',
      type: 'unit',
      title: 'AOTFW Unit',
      slug: 'aotfw',
      status: 'active',
      year_id: 'year_12',
      subject_id: 'subject_english',
      lesson_ids: ['lesson_aotfw_001', 'lesson_aotfw_008'],
      ...timestamps,
      schema_version: 1
    });
    fakeStore.seed(publishedLessonKey('lesson_aotfw_008'), {
      lesson_id: 'lesson_aotfw_008',
      title: 'Memory',
      unit_id: 'unit_aotfw',
      blocks: [],
      published_at: '2026-02-01T12:00:00.000Z',
      schema_version: 1
    });
    fakeStore.seed(publishedLessonKey('lesson_other'), {
      lesson_id: 'lesson_other',
      title: 'Other unit lesson',
      unit_id: 'unit_other',
      blocks: [],
      published_at: '2026-02-01T12:00:00.000Z',
      schema_version: 1
    });
    fakeStore.seed(draftLessonKey('lesson_aotfw_001'), {
      id: 'lesson_aotfw_001',
      title: 'Draft only — must not appear',
      unit_id: 'unit_aotfw'
    });

    const response = await publishedUnitHandler(
      request('/api/published/units/unit_aotfw'),
      { params: { id: 'unit_aotfw' } }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.unit_id).toBe('unit_aotfw');
    expect(body.data.title).toBe('AOTFW Unit');
    expect(body.data.lessons).toEqual([
      { lesson_id: 'lesson_aotfw_008', title: 'Memory' }
    ]);
  });

  it('returns empty lessons array when unit exists but nothing is published', async () => {
    fakeStore.seed(unitKey('unit_aotfw'), {
      id: 'unit_aotfw',
      type: 'unit',
      title: 'AOTFW Unit',
      slug: 'aotfw',
      status: 'active',
      year_id: 'year_12',
      subject_id: 'subject_english',
      lesson_ids: ['lesson_aotfw_001'],
      ...timestamps,
      schema_version: 1
    });
    const response = await publishedUnitHandler(
      request('/api/published/units/unit_aotfw'),
      { params: { id: 'unit_aotfw' } }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.lessons).toEqual([]);
  });
});

describe('GET /api/published/classes/:id', () => {
  it('returns 404 when the class blob is missing', async () => {
    const response = await publishedClassHandler(
      request('/api/published/classes/class_missing'),
      { params: { id: 'class_missing' } }
    );
    expect(response.status).toBe(404);
  });

  it('is public and returns schedule ordered with resolved titles', async () => {
    fakeStore.seed(classKey('class_2026_12engadv1'), {
      id: 'class_2026_12engadv1',
      type: 'class',
      code: '12ENGADV1',
      title: 'Year 12 English Advanced',
      slug: '12engadv1',
      display_name: '12ENGADV1',
      academic_year: 2026,
      year_id: 'year_12',
      subject_id: 'subject_y12_engadv',
      active_unit_ids: ['unit_aotfw'],
      current_unit_id: 'unit_aotfw',
      current_scheduled_lesson_id: 'scheduled_b',
      status: 'active',
      ...timestamps,
      schema_version: 1
    });
    fakeStore.seed(unitKey('unit_aotfw'), {
      id: 'unit_aotfw',
      type: 'unit',
      title: 'Artist of the Floating World',
      slug: 'aotfw',
      status: 'active',
      year_id: 'year_12',
      subject_id: 'subject_y12_engadv',
      lesson_ids: ['lesson_a', 'lesson_b'],
      ...timestamps,
      schema_version: 1
    });
    fakeStore.seed(draftLessonKey('lesson_a'), {
      id: 'lesson_a',
      type: 'lesson',
      title: 'Lesson A',
      slug: 'lesson-a',
      unit_id: 'unit_aotfw',
      sequence: 1,
      blocks: [],
      status: 'active',
      ...timestamps,
      schema_version: 1
    });
    fakeStore.seed(draftLessonKey('lesson_b'), {
      id: 'lesson_b',
      type: 'lesson',
      title: 'Lesson B',
      slug: 'lesson-b',
      unit_id: 'unit_aotfw',
      sequence: 2,
      blocks: [],
      status: 'active',
      ...timestamps,
      schema_version: 1
    });
    fakeStore.seed(scheduledLessonKey('scheduled_a'), {
      id: 'scheduled_a',
      type: 'scheduled_lesson',
      class_id: 'class_2026_12engadv1',
      unit_id: 'unit_aotfw',
      lesson_id: 'lesson_a',
      date: '2026-08-11',
      schedule_order: 1,
      delivery_status: 'planned',
      ...timestamps,
      schema_version: 1
    });
    fakeStore.seed(scheduledLessonKey('scheduled_b'), {
      id: 'scheduled_b',
      type: 'scheduled_lesson',
      class_id: 'class_2026_12engadv1',
      unit_id: 'unit_aotfw',
      lesson_id: 'lesson_b',
      date: '2026-08-12',
      schedule_order: 2,
      delivery_status: 'current',
      ...timestamps,
      schema_version: 1
    });
    fakeStore.seed(publishedLessonKey('lesson_a'), {
      lesson_id: 'lesson_a',
      title: 'Lesson A',
      unit_id: 'unit_aotfw',
      blocks: [],
      published_at: '2026-02-01T12:00:00.000Z',
      schema_version: 1
    });

    const response = await publishedClassHandler(
      request('/api/published/classes/class_2026_12engadv1'),
      { params: { id: 'class_2026_12engadv1' } }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.code).toBe('12ENGADV1');
    expect(body.data.homepage).toEqual({
      announcements: [],
      resources: [],
      custom: []
    });
    expect(body.data.current_lesson).toEqual({
      id: 'scheduled_b',
      title: 'Lesson B',
      lesson_id: 'lesson_b'
    });
    expect(body.data.schedule).toEqual([
      expect.objectContaining({
        id: 'scheduled_a',
        date: '2026-08-11',
        schedule_order: 1,
        lesson_id: 'lesson_a',
        title: 'Lesson A',
        published: true
      }),
      expect.objectContaining({
        id: 'scheduled_b',
        date: '2026-08-12',
        schedule_order: 2,
        lesson_id: 'lesson_b',
        title: 'Lesson B',
        published: false
      })
    ]);
  });
});

function seedClassAndUnit(overrides: {
  classSubject?: string;
  unitSubject?: string;
  lessonIds?: string[];
  existingScheduledLessonIds?: string[];
} = {}) {
  const classSubject = overrides.classSubject ?? 'subject_y12_engadv';
  const unitSubject = overrides.unitSubject ?? classSubject;
  const lessonIds = overrides.lessonIds ?? ['lesson_a', 'lesson_b'];

  fakeStore.seed(classKey('class_2026_12engadv1'), {
    id: 'class_2026_12engadv1',
    type: 'class',
    code: '12ENGADV1',
    title: 'Year 12 English Advanced',
    slug: '12engadv1',
    academic_year: 2026,
    year_id: 'year_12',
    subject_id: classSubject,
    active_unit_ids: [],
    status: 'active',
    ...timestamps,
    schema_version: 1
  });
  fakeStore.seed(unitKey('unit_schedule'), {
    id: 'unit_schedule',
    type: 'unit',
    title: 'Schedule Unit',
    slug: 'schedule-unit',
    year_id: 'year_12',
    subject_id: unitSubject,
    lesson_ids: lessonIds,
    status: 'active',
    ...timestamps,
    schema_version: 1
  });

  for (const lessonId of overrides.existingScheduledLessonIds ?? []) {
    fakeStore.seed(scheduledLessonKey(`scheduled_existing_${lessonId}`), {
      id: `scheduled_existing_${lessonId}`,
      type: 'scheduled_lesson',
      class_id: 'class_2026_12engadv1',
      unit_id: 'unit_schedule',
      lesson_id: lessonId,
      date: '2026-08-10',
      schedule_order: 1,
      delivery_status: 'planned',
      ...timestamps,
      schema_version: 1
    });
  }
}

describe('POST /api/classes/:classId/schedule-unit', () => {
  it('rejects unauthenticated requests', async () => {
    const response = await scheduleUnitHandler(
      request('/api/classes/class_2026_12engadv1/schedule-unit', {
        method: 'POST',
        body: JSON.stringify({ unit_id: 'unit_schedule', start_date: '2026-09-01' })
      }),
      { params: { classId: 'class_2026_12engadv1' } }
    );
    expect(response.status).toBe(401);
  });

  it('creates scheduled lessons and persists meeting_days', async () => {
    seedClassAndUnit();

    const response = await scheduleUnitHandler(
      request('/api/classes/class_2026_12engadv1/schedule-unit', {
        method: 'POST',
        cookie: sessionCookieHeader(),
        body: JSON.stringify({
          unit_id: 'unit_schedule',
          start_date: '2026-09-01',
          meeting_days: [2, 4]
        })
      }),
      { params: { classId: 'class_2026_12engadv1' } }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.scheduled_lessons).toHaveLength(2);
    expect(body.data.class.meeting_days).toEqual([2, 4]);
    expect(body.data.class.active_unit_ids).toContain('unit_schedule');

    const storedClass = fakeStore.raw(classKey('class_2026_12engadv1')) as {
      meeting_days: number[];
    };
    expect(storedClass.meeting_days).toEqual([2, 4]);
    expect(
      fakeStore.raw(scheduledLessonKey('scheduled_class_2026_12engadv1_lesson_a'))
    ).toMatchObject({ lesson_id: 'lesson_a', class_id: 'class_2026_12engadv1' });
  });

  it('returns already_scheduled when every lesson is already scheduled', async () => {
    seedClassAndUnit({
      lessonIds: ['lesson_a'],
      existingScheduledLessonIds: ['lesson_a']
    });

    const response = await scheduleUnitHandler(
      request('/api/classes/class_2026_12engadv1/schedule-unit', {
        method: 'POST',
        cookie: sessionCookieHeader(),
        body: JSON.stringify({ unit_id: 'unit_schedule', start_date: '2026-09-01' })
      }),
      { params: { classId: 'class_2026_12engadv1' } }
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('already_scheduled');
  });

  it('returns 400 when unit subject does not match class', async () => {
    seedClassAndUnit({
      classSubject: 'subject_y12_engadv',
      unitSubject: 'subject_y12_engstd'
    });

    const response = await scheduleUnitHandler(
      request('/api/classes/class_2026_12engadv1/schedule-unit', {
        method: 'POST',
        cookie: sessionCookieHeader(),
        body: JSON.stringify({ unit_id: 'unit_schedule', start_date: '2026-09-01' })
      }),
      { params: { classId: 'class_2026_12engadv1' } }
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('subject_mismatch');
  });

  it('returns no_lessons when the unit has an empty lesson list', async () => {
    seedClassAndUnit({ lessonIds: [] });

    const response = await scheduleUnitHandler(
      request('/api/classes/class_2026_12engadv1/schedule-unit', {
        method: 'POST',
        cookie: sessionCookieHeader(),
        body: JSON.stringify({ unit_id: 'unit_schedule', start_date: '2026-09-01' })
      }),
      { params: { classId: 'class_2026_12engadv1' } }
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('no_lessons');
  });
});

function seedScheduledLessonsForClass() {
  const rows = [
    {
      id: 'scheduled_a',
      lesson_id: 'lesson_a',
      date: '2026-08-10',
      schedule_order: 1
    },
    {
      id: 'scheduled_b',
      lesson_id: 'lesson_b',
      date: '2026-08-11',
      schedule_order: 2
    },
    {
      id: 'scheduled_c',
      lesson_id: 'lesson_c',
      date: '2026-08-12',
      schedule_order: 3
    }
  ];

  for (const row of rows) {
    fakeStore.seed(scheduledLessonKey(row.id), {
      id: row.id,
      type: 'scheduled_lesson',
      class_id: 'class_2026_12engadv1',
      unit_id: 'unit_schedule',
      lesson_id: row.lesson_id,
      date: row.date,
      schedule_order: row.schedule_order,
      delivery_status: 'planned',
      ...timestamps,
      schema_version: 1
    });
  }
}

describe('PATCH /api/scheduled-lessons/:id', () => {
  it('rejects unauthenticated requests', async () => {
    const response = await scheduledLessonHandler(
      request('/api/scheduled-lessons/scheduled_b', {
        method: 'PATCH',
        body: JSON.stringify({ date: '2026-09-01' })
      }),
      { params: { id: 'scheduled_b' } }
    );
    expect(response.status).toBe(401);
  });

  it('returns 404 for unknown scheduled lesson', async () => {
    const response = await scheduledLessonHandler(
      request('/api/scheduled-lessons/scheduled_missing', {
        method: 'PATCH',
        cookie: sessionCookieHeader(),
        body: JSON.stringify({ date: '2026-09-01' })
      }),
      { params: { id: 'scheduled_missing' } }
    );
    expect(response.status).toBe(404);
  });

  it('patches date and persists', async () => {
    seedScheduledLessonsForClass();

    const response = await scheduledLessonHandler(
      request('/api/scheduled-lessons/scheduled_b', {
        method: 'PATCH',
        cookie: sessionCookieHeader(),
        body: JSON.stringify({ date: '2026-09-15' })
      }),
      { params: { id: 'scheduled_b' } }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.date).toBe('2026-09-15');
    expect(body.data.schedule_order).toBe(2);

    expect(fakeStore.raw(scheduledLessonKey('scheduled_b'))).toMatchObject({
      date: '2026-09-15',
      schedule_order: 2
    });
  });

  it('reorders up and persists swapped schedule_order values', async () => {
    seedScheduledLessonsForClass();

    const response = await scheduledLessonHandler(
      request('/api/scheduled-lessons/scheduled_b', {
        method: 'PATCH',
        cookie: sessionCookieHeader(),
        body: JSON.stringify({ direction: 'up' })
      }),
      { params: { id: 'scheduled_b' } }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.schedule_order).toBe(1);

    expect(fakeStore.raw(scheduledLessonKey('scheduled_b'))).toMatchObject({
      schedule_order: 1
    });
    expect(fakeStore.raw(scheduledLessonKey('scheduled_a'))).toMatchObject({
      schedule_order: 2
    });
  });
});

function seedClassForPatch() {
  fakeStore.seed(classKey('class_2026_12engadv1'), {
    id: 'class_2026_12engadv1',
    type: 'class',
    code: '12ENGADV1',
    title: 'Year 12 English Advanced',
    slug: '12engadv1',
    academic_year: 2026,
    year_id: 'year_12',
    subject_id: 'subject_y12_engadv',
    active_unit_ids: ['unit_aotfw'],
    current_scheduled_lesson_id: 'scheduled_a',
    meeting_days: [1, 2, 3, 4, 5],
    status: 'active',
    ...timestamps,
    schema_version: 1
  });

  fakeStore.seed(scheduledLessonKey('scheduled_a'), {
    id: 'scheduled_a',
    type: 'scheduled_lesson',
    class_id: 'class_2026_12engadv1',
    unit_id: 'unit_schedule',
    lesson_id: 'lesson_a',
    date: '2026-08-10',
    schedule_order: 1,
    delivery_status: 'planned',
    ...timestamps,
    schema_version: 1
  });

  fakeStore.seed(scheduledLessonKey('scheduled_other'), {
    id: 'scheduled_other',
    type: 'scheduled_lesson',
    class_id: 'class_other',
    unit_id: 'unit_other',
    lesson_id: 'lesson_other',
    date: '2026-08-10',
    schedule_order: 1,
    delivery_status: 'planned',
    ...timestamps,
    schema_version: 1
  });
}

describe('PATCH /api/classes/:id', () => {
  it('rejects unauthenticated requests', async () => {
    const response = await classHandler(
      request('/api/classes/class_2026_12engadv1', {
        method: 'PATCH',
        body: JSON.stringify({ meeting_days: [1, 3, 5] })
      }),
      { params: { id: 'class_2026_12engadv1' } }
    );
    expect(response.status).toBe(401);
  });

  it('sets current_scheduled_lesson_id when the lesson belongs to this class', async () => {
    seedClassForPatch();

    const response = await classHandler(
      request('/api/classes/class_2026_12engadv1', {
        method: 'PATCH',
        cookie: sessionCookieHeader(),
        body: JSON.stringify({ current_scheduled_lesson_id: 'scheduled_a' })
      }),
      { params: { id: 'class_2026_12engadv1' } }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.current_scheduled_lesson_id).toBe('scheduled_a');

    expect(fakeStore.raw(classKey('class_2026_12engadv1'))).toMatchObject({
      current_scheduled_lesson_id: 'scheduled_a'
    });
  });

  it('rejects current_scheduled_lesson_id for a scheduled lesson in another class', async () => {
    seedClassForPatch();

    const response = await classHandler(
      request('/api/classes/class_2026_12engadv1', {
        method: 'PATCH',
        cookie: sessionCookieHeader(),
        body: JSON.stringify({ current_scheduled_lesson_id: 'scheduled_other' })
      }),
      { params: { id: 'class_2026_12engadv1' } }
    );
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe('not_found');
  });

  it('updates meeting_days and persists', async () => {
    seedClassForPatch();

    const response = await classHandler(
      request('/api/classes/class_2026_12engadv1', {
        method: 'PATCH',
        cookie: sessionCookieHeader(),
        body: JSON.stringify({ meeting_days: [2, 4] })
      }),
      { params: { id: 'class_2026_12engadv1' } }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.meeting_days).toEqual([2, 4]);

    expect(fakeStore.raw(classKey('class_2026_12engadv1'))).toMatchObject({
      meeting_days: [2, 4]
    });
  });
});

function seedScopeForPatch() {
  fakeStore.seed(scopeSequenceKey('scope_y12_engadv_2026'), {
    id: 'scope_y12_engadv_2026',
    type: 'scope_sequence',
    title: 'Year 12 English Advanced 2026',
    slug: 'y12_engadv_2026',
    subject_id: 'subject_engadv',
    academic_year: 2026,
    week_count: 40,
    terms: [
      { id: 'term_t1', title: 'Term 1', term_number: 1, start_week: 1, end_week: 10 },
      { id: 'term_t2', title: 'Term 2', term_number: 2, start_week: 11, end_week: 20 },
      { id: 'term_t3', title: 'Term 3', term_number: 3, start_week: 21, end_week: 30 },
      { id: 'term_t4', title: 'Term 4', term_number: 4, start_week: 31, end_week: 40 }
    ],
    timeline_items: [
      {
        id: 'ti_unit_aotfw',
        kind: 'unit',
        unit_id: 'unit_aotfw',
        start_week: 12,
        end_week: 18,
        order: 1
      }
    ],
    status: 'active',
    ...timestamps,
    schema_version: 1
  });
}

describe('PATCH /api/scope-sequences/:id', () => {
  it('rejects unauthenticated requests', async () => {
    seedScopeForPatch();

    const response = await scopeSequenceHandler(
      request('/api/scope-sequences/scope_y12_engadv_2026', {
        method: 'PATCH',
        body: JSON.stringify({ timeline_items: [] })
      }),
      { params: { id: 'scope_y12_engadv_2026' } }
    );
    expect(response.status).toBe(401);
  });

  it('returns 404 when the scope sequence is missing', async () => {
    const response = await scopeSequenceHandler(
      request('/api/scope-sequences/scope_missing', {
        method: 'PATCH',
        cookie: sessionCookieHeader(),
        body: JSON.stringify({ timeline_items: [] })
      }),
      { params: { id: 'scope_missing' } }
    );
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe('not_found');
  });

  it('replaces timeline_items and persists', async () => {
    seedScopeForPatch();

    const timeline_items = [
      {
        id: 'ti_note_1',
        kind: 'note',
        title: 'Week one',
        start_week: 1,
        end_week: 1,
        order: 1
      }
    ];

    const response = await scopeSequenceHandler(
      request('/api/scope-sequences/scope_y12_engadv_2026', {
        method: 'PATCH',
        cookie: sessionCookieHeader(),
        body: JSON.stringify({ timeline_items })
      }),
      { params: { id: 'scope_y12_engadv_2026' } }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.timeline_items).toEqual(timeline_items);
    expect(body.data.updated_at).not.toBe(timestamps.updated_at);

    expect(fakeStore.raw(scopeSequenceKey('scope_y12_engadv_2026'))).toMatchObject({
      timeline_items,
      updated_at: body.data.updated_at
    });
  });

  it('rejects duplicate unit_id among unit items', async () => {
    seedScopeForPatch();

    const response = await scopeSequenceHandler(
      request('/api/scope-sequences/scope_y12_engadv_2026', {
        method: 'PATCH',
        cookie: sessionCookieHeader(),
        body: JSON.stringify({
          timeline_items: [
            {
              id: 'ti_a',
              kind: 'unit',
              unit_id: 'unit_aotfw',
              start_week: 1,
              end_week: 2,
              order: 1
            },
            {
              id: 'ti_b',
              kind: 'unit',
              unit_id: 'unit_aotfw',
              start_week: 3,
              end_week: 4,
              order: 2
            }
          ]
        })
      }),
      { params: { id: 'scope_y12_engadv_2026' } }
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('validation_error');
  });

  it('rejects out-of-range weeks', async () => {
    seedScopeForPatch();

    const response = await scopeSequenceHandler(
      request('/api/scope-sequences/scope_y12_engadv_2026', {
        method: 'PATCH',
        cookie: sessionCookieHeader(),
        body: JSON.stringify({
          timeline_items: [
            {
              id: 'ti_bad',
              kind: 'note',
              title: 'Too late',
              start_week: 41,
              end_week: 41,
              order: 1
            }
          ]
        })
      }),
      { params: { id: 'scope_y12_engadv_2026' } }
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('validation_error');
  });
});

function seedCreateParents() {
  fakeStore.seed(yearKey('year_12'), {
    id: 'year_12',
    type: 'year',
    title: 'Year 12',
    slug: 'year_12',
    year_level: 12,
    subject_ids: ['subject_y12_engadv'],
    status: 'active',
    ...timestamps,
    schema_version: 1
  });
  fakeStore.seed(subjectKey('subject_y12_engadv'), {
    id: 'subject_y12_engadv',
    type: 'subject',
    title: 'English Advanced',
    slug: 'english_advanced',
    display_title: 'English Advanced',
    unit_ids: ['unit_aotfw'],
    outcome_ids: [],
    class_ids: [],
    status: 'active',
    ...timestamps,
    schema_version: 1
  });
  fakeStore.seed(subjectKey('subject_y12_engstd'), {
    id: 'subject_y12_engstd',
    type: 'subject',
    title: 'English Standard',
    slug: 'english_standard',
    display_title: 'English Standard',
    unit_ids: [],
    outcome_ids: [],
    class_ids: [],
    status: 'active',
    ...timestamps,
    schema_version: 1
  });
  fakeStore.seed(unitKey('unit_aotfw'), {
    id: 'unit_aotfw',
    type: 'unit',
    title: 'Artist of the Floating World',
    slug: 'aotfw',
    year_id: 'year_12',
    subject_id: 'subject_y12_engadv',
    lesson_ids: ['lesson_aotfw_001'],
    status: 'active',
    ...timestamps,
    schema_version: 1
  });
  fakeStore.seed(draftLessonKey('lesson_aotfw_001'), {
    id: 'lesson_aotfw_001',
    type: 'lesson',
    title: 'Existing Lesson',
    slug: 'existing_lesson',
    unit_id: 'unit_aotfw',
    sequence: 3,
    blocks: [],
    status: 'active',
    ...timestamps,
    schema_version: 1
  });
}

describe('POST create endpoints (Netlify)', () => {
  it('rejects unauthenticated POST /api/classes', async () => {
    const response = await classesCreateHandler(
      request('/api/classes', {
        method: 'POST',
        body: JSON.stringify({
          title: '12 Eng Std',
          code: '12ENGSTD1',
          academic_year: 2026,
          year_id: 'year_12',
          subject_id: 'subject_y12_engadv'
        })
      })
    );
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe('unauthorized');
  });

  it('POST /api/classes creates a class with empty homepage defaults', async () => {
    seedCreateParents();

    const response = await classesCreateHandler(
      request('/api/classes', {
        method: 'POST',
        cookie: sessionCookieHeader(),
        body: JSON.stringify({
          title: '12 Eng Std',
          code: '12ENGSTD1',
          academic_year: 2026,
          year_id: 'year_12',
          subject_id: 'subject_y12_engadv'
        })
      })
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.data.type).toBe('class');
    expect(body.data.code).toBe('12ENGSTD1');
    expect(body.data.title).toBe('12 Eng Std');
    expect(body.data.slug).toBeTruthy();
    expect(body.data.active_unit_ids).toEqual([]);
    expect(body.data.homepage).toEqual({
      announcements: [],
      resources: [],
      custom: []
    });
    expect(body.data.status).toBe('active');
    expect(body.data.schema_version).toBe(1);

    expect(fakeStore.raw(classKey(body.data.id))).toMatchObject({
      code: '12ENGSTD1',
      homepage: { announcements: [], resources: [], custom: [] }
    });
  });

  it('POST /api/units creates a unit and appends to subject', async () => {
    seedCreateParents();

    const response = await unitsCreateHandler(
      request('/api/units', {
        method: 'POST',
        cookie: sessionCookieHeader(),
        body: JSON.stringify({
          title: 'New Unit',
          year_id: 'year_12',
          subject_id: 'subject_y12_engadv'
        })
      })
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.data.type).toBe('unit');
    expect(body.data.lesson_ids).toEqual([]);
    expect(body.data.title).toBe('New Unit');
    expect(body.data.status).toBe('active');

    expect(fakeStore.raw(unitKey(body.data.id))).toMatchObject({
      title: 'New Unit',
      lesson_ids: []
    });
    expect(fakeStore.raw(subjectKey('subject_y12_engadv'))).toMatchObject({
      unit_ids: expect.arrayContaining(['unit_aotfw', body.data.id])
    });
  });

  it('POST /api/lessons creates a draft lesson and appends to unit', async () => {
    seedCreateParents();

    const response = await lessonsCreateHandler(
      request('/api/lessons', {
        method: 'POST',
        cookie: sessionCookieHeader(),
        body: JSON.stringify({ title: 'New Lesson', unit_id: 'unit_aotfw' })
      })
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.data.type).toBe('lesson');
    expect(body.data.blocks).toEqual([]);
    expect(body.data.unit_id).toBe('unit_aotfw');
    expect(body.data.sequence).toBe(4);
    expect(body.data.status).toBe('active');

    expect(fakeStore.raw(draftLessonKey(body.data.id))).toMatchObject({
      title: 'New Lesson',
      blocks: [],
      sequence: 4
    });
    expect(fakeStore.raw(unitKey('unit_aotfw'))).toMatchObject({
      lesson_ids: ['lesson_aotfw_001', body.data.id]
    });
  });

  it('POST /api/scope-sequences creates scope and links subject.scope_id', async () => {
    seedCreateParents();

    const response = await scopeSequencesCreateHandler(
      request('/api/scope-sequences', {
        method: 'POST',
        cookie: sessionCookieHeader(),
        body: JSON.stringify({
          title: 'Y12 Eng Std 2027',
          subject_id: 'subject_y12_engstd',
          academic_year: 2027
        })
      })
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.data.type).toBe('scope_sequence');
    expect(body.data.timeline_items).toEqual([]);
    expect(body.data.week_count).toBe(40);
    expect(body.data.terms).toHaveLength(4);
    expect(body.data.terms[0]).toMatchObject({
      term_number: 1,
      start_week: 1,
      end_week: 10
    });
    expect(body.data.terms[3]).toMatchObject({
      term_number: 4,
      start_week: 31,
      end_week: 40
    });

    expect(fakeStore.raw(scopeSequenceKey(body.data.id))).toMatchObject({
      week_count: 40,
      timeline_items: []
    });
    expect(fakeStore.raw(subjectKey('subject_y12_engstd'))).toMatchObject({
      scope_id: body.data.id
    });
  });

  it('keeps GET/PUT /api/lessons/:id working alongside POST /api/lessons', async () => {
    seedCreateParents();

    const getRes = await lessonHandler(
      request('/api/lessons/lesson_aotfw_001', { cookie: sessionCookieHeader() }),
      { params: { id: 'lesson_aotfw_001' } }
    );
    expect(getRes.status).toBe(200);

    const createRes = await lessonsCreateHandler(
      request('/api/lessons', {
        method: 'POST',
        cookie: sessionCookieHeader(),
        body: JSON.stringify({ title: 'Another Lesson', unit_id: 'unit_aotfw' })
      })
    );
    expect(createRes.status).toBe(201);
  });

  it('POST /api/subjects creates a global subject', async () => {
    seedCreateParents();
    const { default: subjectsCreateHandler } = await import(
      '../../netlify/functions/subjects.mts'
    );

    const response = await subjectsCreateHandler(
      request('/api/subjects', {
        method: 'POST',
        cookie: sessionCookieHeader(),
        body: JSON.stringify({ title: 'Psychology' })
      })
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.data.type).toBe('subject');
    expect(body.data.title).toBe('Psychology');
    expect(body.data.display_title).toBe('Psychology');
    expect(body.data.unit_ids).toEqual([]);
    expect(body.data.outcome_ids).toEqual([]);
    expect(body.data.class_ids).toEqual([]);
    expect(body.data).not.toHaveProperty('year_id');
    expect(fakeStore.raw(`subjects/${body.data.id}`)).toMatchObject({
      title: 'Psychology',
      display_title: 'Psychology'
    });
  });

  it('POST /api/subjects returns 409 for a duplicate title', async () => {
    seedCreateParents();
    const { default: subjectsCreateHandler } = await import(
      '../../netlify/functions/subjects.mts'
    );

    const response = await subjectsCreateHandler(
      request('/api/subjects', {
        method: 'POST',
        cookie: sessionCookieHeader(),
        body: JSON.stringify({ title: 'english advanced' })
      })
    );
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe('conflict');
  });

  it('POST /api/classes adds the subject to the year cache without duplicating', async () => {
    seedCreateParents();

    const first = await classesCreateHandler(
      request('/api/classes', {
        method: 'POST',
        cookie: sessionCookieHeader(),
        body: JSON.stringify({
          title: '12 Eng Std',
          code: '12ENGSTD1',
          academic_year: 2026,
          year_id: 'year_12',
          subject_id: 'subject_y12_engstd'
        })
      })
    );
    expect(first.status).toBe(201);
    expect(fakeStore.raw(yearKey('year_12'))).toMatchObject({
      subject_ids: ['subject_y12_engadv', 'subject_y12_engstd']
    });

    const second = await classesCreateHandler(
      request('/api/classes', {
        method: 'POST',
        cookie: sessionCookieHeader(),
        body: JSON.stringify({
          title: '12 Eng Std B',
          code: '12ENGSTD2',
          academic_year: 2026,
          year_id: 'year_12',
          subject_id: 'subject_y12_engstd'
        })
      })
    );
    expect(second.status).toBe(201);
    expect(fakeStore.raw(yearKey('year_12'))).toMatchObject({
      subject_ids: ['subject_y12_engadv', 'subject_y12_engstd']
    });
  });
});
