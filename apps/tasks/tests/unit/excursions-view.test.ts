import { describe, expect, it, vi } from 'vitest';
import { renderExcursionsView, renderNewExcursionPage } from '@/views/excursions';
import { tasksApi } from '@/services/client-api';
import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import type { ExcursionTemplate } from '@/schemas/templates';

vi.mock('@/services/client-api', () => ({
  tasksApi: {
    listProjects: vi.fn(),
    listTasks: vi.fn(),
    listTemplates: vi.fn(),
    createExcursionFromTemplate: vi.fn()
  }
}));

const template: ExcursionTemplate = {
  schema_version: 1,
  id: 'ext_excursion',
  name: 'excursion template',
  default_lead_times: {
    permission_note_days: 21,
    staff_email_days: 21,
    risk_assessment_days: 42,
    payment_days: 28
  },
  checklist_items: ['Permission note drafted and sent']
};

const excursion: Project = {
  schema_version: 1,
  id: 'proj_ex_ethics_seed',
  title: 'Ethics Olympiad heat',
  description: 'Seed excursion',
  parent_goal_id: null,
  tags: [],
  arc_summary: 'Regional heat in October.',
  type: 'excursion',
  milestones: [],
  status: 'active',
  baseline_end_date: '2026-10-10',
  current_end_date: '2026-10-10',
  review_summary: null,
  stall_flagged_at: null,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
  competition_or_event_type: 'ext_excursion',
  key_dates: null,
  student_group_reference: 'Year 10 Ethics',
  generated_admin_tasks: [],
  drafted_documents: null
};

const task: Task = {
  schema_version: 1,
  id: 'task_permission',
  title: 'Draft permission note',
  description: '',
  kind: 'task',
  bucket: 'active',
  step_order: 0,
  domain: 'teaching',
  framework_used: null,
  estimated_duration: 30,
  actual_duration: null,
  due_date: '2026-09-24',
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
  completed_at: null,
  status: 'open',
  blocked_since: null,
  priority: 'high',
  parent_project_id: 'proj_ex_ethics_seed',
  parent_task_id: null,
  depends_on: [],
  tags: ['excursion'],
  recurrence_rule: null,
  due_time: null,
  remind_at: null,
  remind_dismissed_at: null,
  attachments: [],
  source: 'auto_generated_from_excursion'
};

function mockList() {
  vi.mocked(tasksApi.listProjects).mockResolvedValue([excursion]);
  vi.mocked(tasksApi.listTasks).mockResolvedValue([task]);
  vi.mocked(tasksApi.listTemplates).mockResolvedValue({
    frameworks: [],
    excursion_templates: [template],
    task_templates: [],
    project_templates: []
  });
}

async function mount(): Promise<HTMLElement> {
  mockList();
  const canvas = document.createElement('main');
  await renderExcursionsView(canvas);
  return canvas;
}

describe('excursions list', () => {
  it('lists templates and cards without a create form', async () => {
    location.hash = '#/excursions';
    const canvas = await mount();

    expect(canvas.querySelector('form')).toBeNull();
    expect(canvas.textContent).not.toContain('Review & create');
    expect(canvas.querySelector('.task-row__title')?.textContent).toBe('excursion template');
    expect(canvas.querySelector('.btn--primary')?.textContent).toBe('Use');

    const card = canvas.querySelector<HTMLElement>('.proj-row');
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain('Ethics Olympiad heat');
    expect(card?.textContent).toContain('Excursion');

    card?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(location.hash).toBe('#/project/proj_ex_ethics_seed');
  });

  it('confirms a template then creates and opens the page', async () => {
    location.hash = '#/excursions';
    const created = { ...excursion, id: 'proj_new', title: 'Excursion' };
    vi.mocked(tasksApi.createExcursionFromTemplate).mockResolvedValue({
      project: created,
      tasks: [task]
    });
    const canvas = await mount();

    canvas.querySelector<HTMLButtonElement>('.btn--primary')!.click();
    expect(canvas.querySelector('.confirm-card')).not.toBeNull();
    expect(tasksApi.createExcursionFromTemplate).not.toHaveBeenCalled();

    canvas.querySelector<HTMLButtonElement>('.btn--ghost')!.click();
    expect(canvas.querySelector('.confirm-card')).toBeNull();

    canvas.querySelector<HTMLButtonElement>('.btn--primary')!.click();
    canvas.querySelector<HTMLButtonElement>('.confirm-card .btn--primary')!.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(tasksApi.createExcursionFromTemplate).toHaveBeenCalledWith({
      excursion_template_id: 'ext_excursion',
      title: 'Excursion',
      event_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)
    });
    expect(location.hash).toBe('#/project/proj_new');
  });

  it('uses a plus button instead of an inline create form', async () => {
    mockList();
    location.hash = '#/excursions';
    const canvas = document.createElement('main');
    await renderExcursionsView(canvas);

    const add = canvas.querySelector<HTMLButtonElement>('.excursions-add');
    expect(add?.getAttribute('aria-label')).toBe('New excursion');
    expect(canvas.querySelector('.excursion-form')).toBeNull();
    expect(canvas.textContent).not.toContain('Active excursions');
    expect(canvas.textContent).not.toContain('Excursions are projects');
    expect(canvas.textContent).not.toContain('Review & create');

    add?.click();
    expect(location.hash).toBe('#/excursions/new');
  });

  it('sends a template query to the new excursion page', async () => {
    mockList();
    location.hash = '#/excursions?template=ext_excursion';
    const canvas = document.createElement('main');
    await renderExcursionsView(canvas);
    expect(location.hash).toBe('#/excursions/new?template=ext_excursion');
    expect(canvas.querySelector('.proj-row')).toBeNull();
  });
});

describe('new excursion page', () => {
  it('confirms a prefilled template then creates', async () => {
    mockList();
    vi.mocked(tasksApi.createExcursionFromTemplate).mockResolvedValue({
      project: excursion,
      tasks: [task]
    });
    location.hash = '#/excursions/new?template=ext_excursion';
    const canvas = document.createElement('main');
    await renderNewExcursionPage(canvas);

    expect(canvas.querySelector('.excursion-page')).not.toBeNull();
    expect(canvas.querySelector('form')).toBeNull();
    expect(canvas.textContent).not.toContain('Review & create');
    expect(canvas.querySelector('.confirm-card .page-header__title')?.textContent).toBe(
      'Create “Excursion”'
    );

    canvas.querySelector<HTMLButtonElement>('.confirm-card .btn--primary')?.click();
    await vi.waitFor(() => {
      expect(tasksApi.createExcursionFromTemplate).toHaveBeenCalledWith({
        excursion_template_id: 'ext_excursion',
        title: 'Excursion',
        event_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)
      });
      expect(location.hash).toBe('#/project/proj_ex_ethics_seed');
    });
  });

  it('returns to the list from Back to Excursions', async () => {
    mockList();
    location.hash = '#/excursions/new';
    const canvas = document.createElement('main');
    await renderNewExcursionPage(canvas);
    const back = [...canvas.querySelectorAll('button')].find((btn) =>
      btn.textContent?.includes('Back to Excursions')
    );
    back?.click();
    expect(location.hash).toBe('#/excursions');
  });
});
