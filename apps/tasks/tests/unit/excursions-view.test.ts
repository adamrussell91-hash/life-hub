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
    createExcursionFromTemplate: vi.fn(),
    deleteProject: vi.fn()
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

describe('excursions dashboard', () => {
  it('has one New excursion button and no template picker, since there is only one template', async () => {
    location.hash = '#/excursions';
    const canvas = await mount();

    expect(canvas.querySelector('form')).toBeNull();
    expect(canvas.querySelector('.task-row')).toBeNull();
    expect(canvas.textContent).not.toContain('Templates');

    const add = canvas.querySelector<HTMLButtonElement>('.excursions-add');
    expect(add).not.toBeNull();
    expect(add?.classList.contains('btn--primary')).toBe(true);
    expect(add?.textContent).toContain('New excursion');
  });

  it('routes New excursion straight to the confirm flow for the single template', async () => {
    location.hash = '#/excursions';
    const canvas = await mount();

    canvas.querySelector<HTMLButtonElement>('.excursions-add')!.click();
    expect(location.hash).toBe('#/excursions/new?template=ext_excursion');
  });

  it('shows a Clearance Gate pill, countdown, task progress, and the next outstanding action', async () => {
    location.hash = '#/excursions';
    const canvas = await mount();

    const card = canvas.querySelector<HTMLElement>('.excursion-card');
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain('Ethics Olympiad heat');

    const pill = card?.querySelector<HTMLElement>('.excursion-card__pill');
    expect(pill).not.toBeNull();
    expect(pill?.classList.contains('is-warn')).toBe(true);
    expect(pill?.textContent).toContain('Not cleared');

    expect(card?.querySelector('.excursion-card__countdown')?.textContent).not.toBe('');
    expect(card?.querySelector('.excursion-card__row-value')?.textContent).toContain('done');
    expect(card?.querySelector('.excursion-card__next')?.textContent).toContain('Draft permission note');

    card?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(location.hash).toBe('#/project/proj_ex_ethics_seed');
  });

  it('does not navigate when the click lands on the card menu, and deletes via its Delete option', async () => {
    vi.mocked(tasksApi.deleteProject).mockResolvedValue({ deleted: true });
    location.hash = '#/excursions';
    const canvas = await mount();

    const menuBtn = canvas.querySelector<HTMLButtonElement>('.excursion-card .card-menu');
    expect(menuBtn).not.toBeNull();
    menuBtn!.click();
    expect(location.hash).toBe('#/excursions');

    const deleteOpt = document.querySelector<HTMLButtonElement>('[data-card-menu-item="delete"]');
    expect(deleteOpt).not.toBeNull();
    deleteOpt!.click();

    await vi.waitFor(() => {
      expect(tasksApi.deleteProject).toHaveBeenCalledWith(
        'proj_ex_ethics_seed',
        expect.objectContaining({ reason: expect.any(String) })
      );
    });
  });

  it('sends a template query straight through to the new excursion page', async () => {
    mockList();
    location.hash = '#/excursions?template=ext_excursion';
    const canvas = document.createElement('main');
    await renderExcursionsView(canvas);
    expect(location.hash).toBe('#/excursions/new?template=ext_excursion');
    expect(canvas.querySelector('.proj-row')).toBeNull();
  });

  it('shows an empty state and no meta strip when there are no excursions yet', async () => {
    vi.mocked(tasksApi.listProjects).mockResolvedValue([]);
    vi.mocked(tasksApi.listTasks).mockResolvedValue([]);
    vi.mocked(tasksApi.listTemplates).mockResolvedValue({
      frameworks: [],
      excursion_templates: [template],
      task_templates: [],
      project_templates: []
    });
    location.hash = '#/excursions';
    const canvas = document.createElement('main');
    await renderExcursionsView(canvas);

    expect(canvas.textContent).toContain('No excursions yet. Create one above.');
    expect(canvas.querySelector('.excursion-list-meta')).toBeNull();
  });
});

describe('new excursion page', () => {
  it('confirms the single template immediately — no picker step', async () => {
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
    expect(canvas.querySelector('.task-row')).toBeNull();
    expect(canvas.querySelector('.confirm-card .page-header__title')?.textContent).toBe(
      'Create “Excursion”'
    );

    canvas.querySelector<HTMLButtonElement>('.confirm-card .btn--primary')?.click();
    await vi.waitFor(() => {
      expect(tasksApi.createExcursionFromTemplate).toHaveBeenCalledWith({
        excursion_template_id: 'ext_excursion',
        title: 'Excursion',
        event_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        compliance_modules: expect.any(Array)
      });
      expect(location.hash).toBe('#/project/proj_ex_ethics_seed');
    });
  });

  it('also auto-confirms when the page is opened with no template query at all', async () => {
    mockList();
    vi.mocked(tasksApi.createExcursionFromTemplate).mockResolvedValue({
      project: excursion,
      tasks: [task]
    });
    location.hash = '#/excursions/new';
    const canvas = document.createElement('main');
    await renderNewExcursionPage(canvas);

    expect(canvas.querySelector('.confirm-card .page-header__title')?.textContent).toBe(
      'Create “Excursion”'
    );
  });

  it('shows the compliance bundle on the confirm card and lets you untoggle an item before creating', async () => {
    mockList();
    vi.mocked(tasksApi.createExcursionFromTemplate).mockResolvedValue({
      project: { ...excursion, id: 'proj_new' },
      tasks: [task]
    });
    location.hash = '#/excursions/new?template=ext_excursion';
    const canvas = document.createElement('main');
    await renderNewExcursionPage(canvas);

    const complianceBox = canvas.querySelector<HTMLElement>('.excursion-compliance');
    expect(complianceBox).not.toBeNull();
    expect(complianceBox?.textContent).toContain('WWCC verified');
    expect(complianceBox?.querySelectorAll('.excursion-compliance__critical').length).toBeGreaterThan(0);

    const wwccBox = [...complianceBox!.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find(
      (input) => input.getAttribute('aria-label')?.includes('WWCC')
    )!;
    expect(wwccBox.checked).toBe(true);
    wwccBox.checked = false;
    wwccBox.dispatchEvent(new Event('change'));

    canvas.querySelector<HTMLButtonElement>('.confirm-card .btn--primary')!.click();
    await Promise.resolve();
    await Promise.resolve();

    const call = vi.mocked(tasksApi.createExcursionFromTemplate).mock.calls.at(-1)![0];
    const wwccModule = call.compliance_modules!.find((m) => m.id === 'wwcc')!;
    expect(wwccModule.on).toBe(false);
  });

  it('renders compliance items as toggle switches, not checkmarks', async () => {
    mockList();
    location.hash = '#/excursions/new?template=ext_excursion';
    const canvas = document.createElement('main');
    await renderNewExcursionPage(canvas);

    const complianceBox = canvas.querySelector<HTMLElement>('.excursion-compliance');
    expect(complianceBox?.querySelector('.toggle-switch')).not.toBeNull();
    expect(complianceBox?.querySelector('.task-check')).toBeNull();
  });

  it('lets you edit the title before creating', async () => {
    mockList();
    vi.mocked(tasksApi.createExcursionFromTemplate).mockResolvedValue({
      project: { ...excursion, id: 'proj_new' },
      tasks: [task]
    });
    location.hash = '#/excursions/new?template=ext_excursion';
    const canvas = document.createElement('main');
    await renderNewExcursionPage(canvas);

    const titleInput = canvas.querySelector<HTMLInputElement>('.excursion-confirm__title');
    expect(titleInput).not.toBeNull();
    titleInput!.value = 'Year 10 Ski Trip';
    titleInput!.dispatchEvent(new Event('input'));

    expect(canvas.querySelector('.confirm-card .page-header__title')?.textContent).toBe(
      'Create “Year 10 Ski Trip”'
    );

    canvas.querySelector<HTMLButtonElement>('.confirm-card .btn--primary')!.click();
    await vi.waitFor(() => {
      const call = vi.mocked(tasksApi.createExcursionFromTemplate).mock.calls.at(-1)![0];
      expect(call.title).toBe('Year 10 Ski Trip');
    });
  });

  it('lets you edit a lead time before creating, sending it as a lead_time_overrides day count', async () => {
    mockList();
    vi.mocked(tasksApi.createExcursionFromTemplate).mockResolvedValue({
      project: { ...excursion, id: 'proj_new' },
      tasks: [task]
    });
    location.hash = '#/excursions/new?template=ext_excursion';
    const canvas = document.createElement('main');
    await renderNewExcursionPage(canvas);

    const riskDays = [...canvas.querySelectorAll<HTMLInputElement>('.excursion-confirm__slack-days')].find(
      (input) => input.closest('li')?.textContent?.includes('Risk assessment')
    );
    expect(riskDays).not.toBeUndefined();
    riskDays!.value = '30';
    riskDays!.dispatchEvent(new Event('change'));

    canvas.querySelector<HTMLButtonElement>('.confirm-card .btn--primary')!.click();
    await vi.waitFor(() => {
      const call = vi.mocked(tasksApi.createExcursionFromTemplate).mock.calls.at(-1)![0];
      expect(call.lead_time_overrides).toEqual(expect.objectContaining({ risk_assessment_days: 30 }));
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

  it('shows an empty state when there are no templates at all', async () => {
    vi.mocked(tasksApi.listTemplates).mockResolvedValue({
      frameworks: [],
      excursion_templates: [],
      task_templates: [],
      project_templates: []
    });
    location.hash = '#/excursions/new';
    const canvas = document.createElement('main');
    await renderNewExcursionPage(canvas);
    expect(canvas.textContent).toContain('No excursion templates yet.');
  });
});
