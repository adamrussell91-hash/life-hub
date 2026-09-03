import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mountStudentUnitView } from '@/student/unit-view';

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

describe('mountStudentUnitView', () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
    document.body.replaceChildren();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('renders unit title and published lesson links', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      unit_id: 'unit_aotfw',
      title: 'AOTFW Unit',
      lessons: [
        { lesson_id: 'lesson_aotfw_008', title: 'Memory' },
        { lesson_id: 'lesson_aotfw_001', title: 'Intro' }
      ]
    });

    const root = document.createElement('div');
    document.body.append(root);
    mountStudentUnitView({ root, unitId: 'unit_aotfw' });

    await vi.waitFor(() => {
      expect(root.querySelector('.student-hero__title')?.textContent).toBe('AOTFW Unit');
      const links = [...root.querySelectorAll('a.student-unit__lesson-link')];
      expect(links).toHaveLength(2);
      expect(links[0].getAttribute('href')).toBe('/s/lessons/lesson_aotfw_008');
      expect(links[0].textContent).toContain('Memory');
    });
  });

  it('shows empty copy when no published lessons', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      unit_id: 'unit_aotfw',
      title: 'AOTFW Unit',
      lessons: []
    });
    const root = document.createElement('div');
    document.body.append(root);
    mountStudentUnitView({ root, unitId: 'unit_aotfw' });

    await vi.waitFor(() => {
      expect(root.textContent).toContain(
        'No published lessons in this unit yet.'
      );
    });
  });

  it('shows unit not found on 404', async () => {
    vi.mocked(apiGet).mockRejectedValue(
      new ApiClientError({ code: 'not_found', message: 'missing' })
    );
    const root = document.createElement('div');
    document.body.append(root);
    mountStudentUnitView({ root, unitId: 'missing' });

    await vi.waitFor(() => {
      expect(root.textContent).toContain('Unit not found');
    });
  });
});
