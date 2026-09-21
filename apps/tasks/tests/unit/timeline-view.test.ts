import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tasksApi } from '@/services/client-api';
import { setFocus } from '@/domain/focus';
import { resetCollapsibleFiltersForTests } from '@/views/collapsible-filters';
import { renderTimelineView, resetTimelineSession } from '@/views/timeline';
import type { SeedData } from '@/services/types';
import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';

vi.mock('@/services/client-api', () => ({
  tasksApi: {
    listTasks: vi.fn(),
    listProjects: vi.fn(),
    listPrograms: vi.fn()
  }
}));

const seed = JSON.parse(readFileSync(resolve(process.cwd(), 'fixtures/seed.json'), 'utf8')) as SeedData;

function datedProject(partial: Partial<Project> & Pick<Project, 'id' | 'title'>): Project {
  const base = seed.projects.find((entry) => entry.id === 'proj_mindworks') ?? seed.projects[0]!;
  return {
    ...structuredClone(base),
    status: 'active',
    type: 'standard',
    current_end_date: '2026-09-25',
    baseline_end_date: '2026-09-25',
    linked_program_id: null,
    ...partial
  };
}

describe('timeline view', () => {
  beforeEach(() => {
    resetTimelineSession();
    resetCollapsibleFiltersForTests();
    setFocus(null, { persistUrl: false });
    vi.mocked(tasksApi.listTasks).mockReset();
    vi.mocked(tasksApi.listProjects).mockReset();
    vi.mocked(tasksApi.listPrograms).mockReset();
    vi.mocked(tasksApi.listTasks).mockResolvedValue([]);
    vi.mocked(tasksApi.listPrograms).mockResolvedValue([]);
  });

  it('renders full-width project bars with status, not crushed task chips', async () => {
    vi.mocked(tasksApi.listProjects).mockResolvedValue([
      datedProject({
        id: 'proj_camp',
        title: 'Spring camp',
        type: 'excursion',
        status: 'active',
        created_at: '2026-08-01T00:00:00.000Z',
        current_end_date: '2026-09-10'
      }),
      datedProject({
        id: 'proj_unit',
        title: 'Artist of the Floating World',
        type: 'standard',
        status: 'stalled',
        created_at: '2026-01-01T00:00:00.000Z',
        current_end_date: '2026-09-25'
      }),
      datedProject({
        id: 'proj_mw',
        title: 'MindWorks',
        type: 'academic_program',
        status: 'active',
        created_at: '2026-07-01T00:00:00.000Z',
        current_end_date: '2026-11-15'
      })
    ]);
    vi.mocked(tasksApi.listTasks).mockResolvedValue([
      {
        ...(seed.tasks[0] as Task),
        id: 't_noise',
        title: 'File excursion permission slips',
        due_date: '2026-09-03',
        parent_project_id: 'proj_camp'
      }
    ]);

    const canvas = document.createElement('main');
    await renderTimelineView(canvas);

    expect(canvas.querySelector('.chronology__track')).not.toBeNull();
    const bars = [...canvas.querySelectorAll<HTMLAnchorElement>('.chronology__bar')];
    expect(bars.map((bar) => bar.querySelector('.chronology__bar-title')?.textContent)).toEqual([
      'Artist of the Floating World',
      'MindWorks',
      'Spring camp'
    ]);
    expect(bars.every((bar) => bar.getAttribute('href')?.startsWith('#/project/'))).toBe(true);
    expect(bars.find((bar) => bar.dataset.source === 'excursion')?.getAttribute('href')).toBe(
      '#/project/proj_camp'
    );
    expect(canvas.textContent).toMatch(/active/i);
    expect(canvas.textContent).toMatch(/stalled/i);
    expect(bars[0]?.style.width).toMatch(/%$/);
    expect(bars[0]?.style.left).toMatch(/%$/);
    expect(canvas.textContent).not.toContain('File excursion permission slips');

    const list = canvas.querySelector('.chronology__list');
    expect(list).not.toBeNull();
    expect(list?.getAttribute('aria-label')).toMatch(/target date/i);
    const titles = [...canvas.querySelectorAll('.chronology__item-title')].map((node) => node.textContent);
    expect(titles).toEqual(['Spring camp', 'Artist of the Floating World', 'MindWorks']);
    expect(canvas.querySelector('.chronology__item .status-badge')?.textContent).toMatch(/active|stalled/i);
    expect(canvas.querySelector<HTMLAnchorElement>('.chronology__item')?.getAttribute('href')).toMatch(
      /^#\/project\//
    );
  });

  it('wires a list row to the full page, not a side preview', async () => {
    vi.mocked(tasksApi.listProjects).mockResolvedValue([
      datedProject({ id: 'proj_open', title: 'Open from list', current_end_date: '2026-09-10' })
    ]);

    const canvas = document.createElement('main');
    await renderTimelineView(canvas);

    expect(canvas.querySelector('.chronology__preview')).toBeNull();
    expect(canvas.querySelector<HTMLAnchorElement>('.chronology__item')?.href).toContain(
      '#/project/proj_open'
    );
  });

  it('zooms and filters without remounting', async () => {
    vi.mocked(tasksApi.listProjects).mockResolvedValue([
      datedProject({
        id: 'proj_camp',
        title: 'Spring camp',
        type: 'excursion',
        created_at: '2026-08-01T00:00:00.000Z',
        current_end_date: '2026-09-10'
      }),
      datedProject({
        id: 'proj_unit',
        title: 'Artist of the Floating World',
        type: 'standard',
        created_at: '2026-01-01T00:00:00.000Z',
        current_end_date: '2026-09-25'
      }),
      datedProject({
        id: 'proj_mw',
        title: 'MindWorks',
        type: 'academic_program',
        created_at: '2026-07-01T00:00:00.000Z',
        current_end_date: '2026-11-15'
      })
    ]);

    const canvas = document.createElement('main');
    await renderTimelineView(canvas);

    const zoom = canvas.querySelector('[aria-label="Zoom"]');
    expect(zoom).not.toBeNull();
    expect([...zoom!.querySelectorAll('.hub-pills__btn')].map((btn) => btn.textContent)).toEqual([
      'Week',
      'Month',
      'Term',
      'All'
    ]);
    expect(canvas.querySelector('.hub-filters__toggle')?.getAttribute('aria-label')).toBe('Filters');

    const week = [...canvas.querySelectorAll<HTMLButtonElement>('.hub-pills__btn')].find(
      (btn) => btn.textContent === 'Week'
    );
    week?.click();
    expect(tasksApi.listProjects).toHaveBeenCalledTimes(1);
    expect(canvas.querySelector('[aria-label="Zoom"] [aria-pressed="true"]')?.textContent).toBe('Week');

    const all = [...canvas.querySelectorAll<HTMLButtonElement>('.hub-pills__btn')].find(
      (btn) => btn.textContent === 'All'
    );
    all?.click();

    canvas.querySelector<HTMLButtonElement>('.hub-filters__toggle')?.click();
    const kind = [...canvas.querySelectorAll<HTMLButtonElement>('.hub-filter')].find((btn) =>
      btn.getAttribute('aria-label') === 'Kind'
    );
    kind?.click();
    const excursion = [...document.querySelectorAll<HTMLButtonElement>('.hub-menu__opt')].find(
      (btn) => btn.textContent?.trim() === 'Excursion'
    );
    excursion?.click();

    const titles = [...canvas.querySelectorAll('.chronology__bar-title')].map((node) => node.textContent);
    expect(titles).toEqual(['Spring camp']);
  });
});
