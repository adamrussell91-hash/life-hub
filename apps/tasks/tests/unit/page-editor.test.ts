import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeCardMenu } from '@/views/card-menu';
import { tasksApi } from '@/services/client-api';
import { renderPageEditor } from '@/views/page-editor';
import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';

vi.mock('@/services/client-api', () => ({
  tasksApi: {
    getTask: vi.fn(),
    listProjects: vi.fn(),
    updateTask: vi.fn(),
    getProject: vi.fn(),
    listTasks: vi.fn(),
    createTask: vi.fn(),
    updateProject: vi.fn(),
    listTemplates: vi.fn()
  }
}));

function task(): Task {
  return {
    schema_version: 1,
    id: 'task_lesson',
    title: 'Finish lesson pack',
    description: '',
    kind: 'task',
    bucket: 'active',
    step_order: 0,
    domain: 'teaching',
    framework_used: null,
    estimated_duration: 45,
    actual_duration: null,
    due_date: '2026-08-17',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    completed_at: null,
    status: 'open',
    blocked_since: null,
    priority: 'high',
    parent_project_id: 'proj_mw',
    parent_task_id: null,
    depends_on: [],
    tags: [],
    recurrence_rule: null,
    due_time: null,
    remind_at: null,
    remind_dismissed_at: null,
    attachments: [],
    source: 'manual',
    page_blocks: []
  };
}

const project: Project = {
  schema_version: 1,
  id: 'proj_mw',
  title: 'MindWorks',
  description: '',
  parent_goal_id: null,
  tags: [],
  arc_summary: '',
  type: 'academic_program',
  milestones: [],
  status: 'active',
  baseline_end_date: null,
  current_end_date: null,
  review_summary: null,
  stall_flagged_at: null,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
  competition_or_event_type: null,
  key_dates: null,
  student_group_reference: null,
  generated_admin_tasks: [],
  drafted_documents: null,
  page_blocks: []
};

function pageHeader(title: string): HTMLElement {
  const header = document.createElement('header');
  header.className = 'page-header';
  const heading = document.createElement('h1');
  heading.className = 'page-header__title';
  heading.textContent = title;
  header.append(heading);
  return header;
}

describe('page editor', () => {
  afterEach(() => {
    closeCardMenu();
    vi.useRealTimers();
  });

  it('edits the title and task fields, and inserts blocks from the plus menu', async () => {
    vi.useFakeTimers();
    vi.mocked(tasksApi.getTask).mockResolvedValue(task());
    vi.mocked(tasksApi.listProjects).mockResolvedValue([project]);
    vi.mocked(tasksApi.updateTask).mockResolvedValue(task());

    const canvas = document.createElement('main');
    const header = pageHeader('Finish lesson pack');
    await renderPageEditor(canvas, { kind: 'task', id: 'task_lesson' }, { header });

    expect(canvas.querySelector('.lesson-palette')).toBeNull();
    expect(canvas.querySelector('.page-card__back')?.textContent).toBe('← Dashboard');
    expect(canvas.querySelector('.task-card__foot .btn')).toBeNull();
    expect(canvas.querySelector('.page-card__title-input')).toBeNull();

    expect(canvas.querySelector('select')).toBeNull();
    expect(canvas.querySelector('.page-card__domain')?.tagName).toBe('BUTTON');
    expect(canvas.querySelector('.page-card__status')?.classList.contains('hub-filter')).toBe(true);
    expect(canvas.querySelector('.page-card__notes')?.tagName).toBe('TEXTAREA');

    const title = header.querySelector<HTMLInputElement>('.page-header__title-input')!;
    expect(title.value).toBe('Finish lesson pack');
    title.value = 'Term brief rewrite';
    title.dispatchEvent(new Event('input', { bubbles: true }));

    canvas.querySelector<HTMLButtonElement>('.page-card__domain')!.click();
    document.querySelector<HTMLButtonElement>('[data-hub-option="life"]')!.click();

    await vi.advanceTimersByTimeAsync(400);
    expect(tasksApi.updateTask).toHaveBeenCalled();
    const fields = vi.mocked(tasksApi.updateTask).mock.calls.at(-1)?.[1] as {
      title: string;
      domain: string;
    };
    expect(fields.title).toBe('Term brief rewrite');
    expect(fields.domain).toBe('life');

    canvas.querySelector<HTMLButtonElement>('.page-editor__add-btn')!.click();
    expect(canvas.querySelector('[data-block-type="heading"]')).not.toBeNull();
    expect(canvas.querySelector('[data-block-type="flashcards"]')).not.toBeNull();
    expect(canvas.querySelector('[data-block-type="equation"]')).not.toBeNull();

    canvas.querySelector<HTMLButtonElement>('[data-block-type="heading"]')!.click();
    expect(canvas.querySelector('select')).toBeNull();
    expect(canvas.querySelector('.block-editor__heading-variant')?.tagName).toBe('BUTTON');
    expect(canvas.querySelector('.block-editor__heading-text')).not.toBeNull();
    const field = canvas.querySelector<HTMLInputElement>('.block-editor__heading-text')!;
    field.value = 'Term brief';
    field.dispatchEvent(new Event('input', { bubbles: true }));

    await vi.advanceTimersByTimeAsync(400);
    const patch = vi.mocked(tasksApi.updateTask).mock.calls.at(-1)?.[1] as {
      page_blocks: Array<{ block_type: string; content: { text?: string } }>;
    };
    expect(patch.page_blocks[0]?.block_type).toBe('heading');
    expect(patch.page_blocks[0]?.content.text).toBe('Term brief');
  });

  it('lists every Teaching Hub family in the plus menu', async () => {
    vi.mocked(tasksApi.getTask).mockResolvedValue(task());
    vi.mocked(tasksApi.listProjects).mockResolvedValue([project]);

    const canvas = document.createElement('main');
    await renderPageEditor(canvas, { kind: 'task', id: 'task_lesson' });
    canvas.querySelector<HTMLButtonElement>('.page-editor__add-btn')!.click();

    const labels = [...canvas.querySelectorAll('.page-editor__insert-label')].map((node) => node.textContent);
    expect(labels).toEqual(['Basic', 'Media', 'Teaching', 'Learning', 'Visualisation', 'Layout']);
  });

  it('opens an excursion as a task page with progress, date, tracker, and joined timeline', async () => {
    const excursion: Project = {
      ...project,
      id: 'proj_ex_ethics_seed',
      title: 'Ethics Olympiad heat',
      type: 'excursion',
      student_group_reference: 'Year 10 Ethics',
      current_end_date: '2026-10-10',
      competition_or_event_type: 'ext_ethics_olympiad',
      key_dates: {
        permission_note_due: '2026-09-24',
        staff_notification_due: '2026-09-24',
        risk_assessment_due: '2026-09-03',
        payment_due: '2026-09-17'
      },
      drafted_documents: {
        permission_note_draft: 'Permission note for Year 10 Ethics',
        staff_absence_email_draft: 'Staff absence: Ethics Olympiad'
      }
    };
    vi.mocked(tasksApi.getProject).mockResolvedValue(excursion);
    vi.mocked(tasksApi.updateProject).mockResolvedValue({
      ...excursion,
      updated_at: '2026-08-28T00:00:00.000Z'
    });
    vi.mocked(tasksApi.listTasks).mockResolvedValue([
      {
        ...task(),
        id: 'task_permission',
        title: 'Draft permission note',
        parent_project_id: excursion.id,
        due_date: '2026-09-24',
        source: 'auto_generated_from_excursion'
      }
    ]);
    vi.mocked(tasksApi.listTemplates).mockResolvedValue({
      frameworks: [],
      excursion_templates: [
        {
          schema_version: 1,
          id: 'ext_ethics_olympiad',
          name: 'Ethics Olympiad',
          default_lead_times: {
            permission_note_days: 21,
            staff_email_days: 21,
            risk_assessment_days: 42,
            payment_days: 28
          },
          checklist_items: []
        }
      ],
      task_templates: [],
      project_templates: []
    });

    const canvas = document.createElement('main');
    const header = pageHeader('Ethics Olympiad heat');
    await renderPageEditor(canvas, { kind: 'project', id: excursion.id }, { header });

    expect(header.classList.contains('page-header--cover')).toBe(true);
    expect(canvas.querySelector<HTMLInputElement>('.lesson-page__title')?.value).toBe(
      'Ethics Olympiad heat'
    );
    expect(canvas.querySelector('.entity-banner .lesson-page__title')).not.toBeNull();
    expect(canvas.querySelector('.entity-banner')).not.toBeNull();
    expect(canvas.querySelector('.page-card__title-input')).toBeNull();
    expect(canvas.querySelector('.page-card__due')).toBeNull();
    expect(canvas.querySelector('.page-card__group')).toBeNull();
    expect(canvas.querySelector('.page-card__notes')).toBeNull();
    expect(canvas.querySelector('textarea[aria-label="Permission note draft"]')).toBeNull();
    expect(canvas.querySelector('.hub-chip')?.textContent).not.toBe('excursion');
    expect(canvas.textContent).not.toMatch(/Ethics Olympiad heat on 2026-10-10/);
    expect(canvas.querySelector('.page-card__back')?.textContent).toBe('← Excursions');
    expect(canvas.querySelector('.excursion-progress .hub-track')).not.toBeNull();
    expect(canvas.querySelector('.excursion-tracker .task-list')).not.toBeNull();
    expect(canvas.querySelector('.excursion-timeline')).not.toBeNull();
    expect(canvas.querySelector('.excursion-timeline__line')).toBeNull();
    const stops = canvas.querySelectorAll('.excursion-timeline__stop');
    expect(stops.length).toBeGreaterThan(1);
    expect(canvas.querySelectorAll('.excursion-timeline__joiner').length).toBe(
      Math.max(0, (stops.length - 1) * 2)
    );
    const titles = [...canvas.querySelectorAll('.excursion-timeline__card .hub-row__title')].map(
      (node) => node.textContent
    );
    expect(titles).toContain('Draft permission note');
    expect(titles).toContain('Event');
    expect(canvas.textContent).toContain('Event');

    expect(canvas.querySelector('.page-card__back')?.getAttribute('href')).toBe('#/excursions');
    expect(canvas.querySelector('.excursion-timeline__event')).toBeNull();
    const eventCard = [...canvas.querySelectorAll<HTMLElement>('.excursion-timeline__card .hub-row')].find(
      (row) => row.querySelector('.hub-row__title')?.textContent === 'Event'
    );
    expect(eventCard?.getAttribute('role')).toBe('button');
    expect(eventCard?.getAttribute('aria-label')).toBe('Edit Event');
  });

  it('turns a timeline key date into a task and opens the editor', async () => {
    const excursion: Project = {
      ...project,
      id: 'proj_ex_ethics_seed',
      title: 'Ethics Olympiad heat',
      type: 'excursion',
      current_end_date: '2026-10-10',
      key_dates: {
        permission_note_due: '2026-09-24',
        staff_notification_due: '2026-09-24',
        risk_assessment_due: '2026-09-03',
        payment_due: '2026-09-17'
      }
    };
    const created: Task = {
      ...task(),
      id: 'task_event',
      title: 'Event day — Ethics Olympiad heat',
      parent_project_id: excursion.id,
      due_date: '2026-10-10',
      tags: ['excursion', 'event'],
      source: 'auto_generated_from_excursion'
    };
    vi.mocked(tasksApi.getProject).mockResolvedValue(excursion);
    vi.mocked(tasksApi.listTasks).mockResolvedValue([]);
    vi.mocked(tasksApi.listTemplates).mockResolvedValue({
      frameworks: [],
      excursion_templates: [],
      task_templates: [],
      project_templates: []
    });
    vi.mocked(tasksApi.createTask).mockResolvedValue(created);
    vi.mocked(tasksApi.updateProject).mockResolvedValue({
      ...excursion,
      generated_admin_tasks: [created.id]
    });

    const canvas = document.createElement('main');
    await renderPageEditor(canvas, { kind: 'project', id: excursion.id });

    const eventCard = [...canvas.querySelectorAll<HTMLElement>('.excursion-timeline__card .hub-row')].find(
      (row) => row.querySelector('.hub-row__title')?.textContent === 'Event'
    );
    expect(eventCard).not.toBeNull();
    eventCard!.click();
    await vi.waitFor(() => {
      expect(tasksApi.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Event day — Ethics Olympiad heat',
          due_date: '2026-10-10',
          parent_project_id: excursion.id,
          source: 'auto_generated_from_excursion'
        })
      );
      expect(canvas.querySelector('.task-editor [aria-label="Due date"]')).not.toBeNull();
    });
  });

  it('edits an existing timeline task from the card menu', async () => {
    const excursion: Project = {
      ...project,
      id: 'proj_ex_ethics_seed',
      title: 'Ethics Olympiad heat',
      type: 'excursion',
      current_end_date: '2026-10-10'
    };
    const existing: Task = {
      ...task(),
      id: 'task_event',
      title: 'Event day — Ethics Olympiad heat',
      parent_project_id: excursion.id,
      due_date: '2026-10-10',
      tags: ['excursion', 'event'],
      source: 'auto_generated_from_excursion'
    };
    vi.mocked(tasksApi.getProject).mockResolvedValue(excursion);
    vi.mocked(tasksApi.listTasks).mockResolvedValue([existing]);
    vi.mocked(tasksApi.listTemplates).mockResolvedValue({
      frameworks: [],
      excursion_templates: [],
      task_templates: [],
      project_templates: []
    });
    vi.mocked(tasksApi.updateProject).mockResolvedValue(excursion);

    const canvas = document.createElement('main');
    await renderPageEditor(canvas, { kind: 'project', id: excursion.id });

    const trigger = canvas.querySelector<HTMLButtonElement>('.card-menu');
    expect(trigger).not.toBeNull();
    trigger!.click();
    document.querySelector<HTMLButtonElement>('[data-card-menu-item="edit"]')!.click();
    await vi.waitFor(() => {
      expect(canvas.querySelector('.task-editor [aria-label="Due date"]')).not.toBeNull();
    });
  });

  it('shifts sibling dates when the event task due date changes', async () => {
    const excursion: Project = {
      ...project,
      id: 'proj_ex_ethics_seed',
      title: 'Ethics Olympiad heat',
      type: 'excursion',
      current_end_date: '2026-10-10',
      key_dates: {
        permission_note_due: '2026-09-24',
        staff_notification_due: '2026-09-24',
        risk_assessment_due: '2026-09-03',
        payment_due: '2026-09-17'
      }
    };
    const existing: Task = {
      ...task(),
      id: 'task_event',
      title: 'Event day — Ethics Olympiad heat',
      parent_project_id: excursion.id,
      due_date: '2026-10-10',
      tags: ['excursion', 'event'],
      source: 'auto_generated_from_excursion'
    };
    const permission: Task = {
      ...task(),
      id: 'task_permission',
      title: 'Draft permission note',
      parent_project_id: excursion.id,
      due_date: '2026-09-24',
      tags: ['excursion', 'admin', 'permission'],
      source: 'auto_generated_from_excursion'
    };
    vi.mocked(tasksApi.getProject).mockResolvedValue(excursion);
    vi.mocked(tasksApi.listTasks).mockResolvedValue([existing, permission]);
    vi.mocked(tasksApi.listTemplates).mockResolvedValue({
      frameworks: [],
      excursion_templates: [],
      task_templates: [],
      project_templates: []
    });
    vi.mocked(tasksApi.updateProject).mockResolvedValue({
      ...excursion,
      current_end_date: '2026-10-17'
    });
    vi.mocked(tasksApi.updateTask).mockImplementation(async (id, patch) => ({
      ...(id === existing.id ? existing : permission),
      ...(patch as Partial<Task>)
    }));

    const canvas = document.createElement('main');
    await renderPageEditor(canvas, { kind: 'project', id: excursion.id });

    const eventSlot = [...canvas.querySelectorAll<HTMLElement>('.hub-card-slot')].find((slot) =>
      slot.textContent?.includes('Event day — Ethics Olympiad heat')
    );
    expect(eventSlot).not.toBeNull();
    eventSlot!.querySelector<HTMLButtonElement>('.card-menu')!.click();
    document.querySelector<HTMLButtonElement>('[data-card-menu-item="edit"]')!.click();
    await vi.waitFor(() => {
      expect(canvas.querySelector('.task-editor [aria-label="Due date"]')).not.toBeNull();
    });
    const due = canvas.querySelector<HTMLInputElement>('.task-editor [aria-label="Due date"]')!;
    due.value = '2026-10-17';
    due.dispatchEvent(new Event('input', { bubbles: true }));
    canvas.querySelector<HTMLButtonElement>('.task-editor .btn--primary')!.click();
    await vi.waitFor(() => {
      expect(tasksApi.updateTask).toHaveBeenCalledWith('task_permission', { due_date: '2026-10-01' });
    });
    expect(tasksApi.updateProject).toHaveBeenCalledWith(
      excursion.id,
      expect.objectContaining({ current_end_date: '2026-10-17' })
    );
  });

  it('tracks permission notes on the excursion page', async () => {
    vi.useFakeTimers();
    const excursion: Project = {
      ...project,
      id: 'proj_ex_ethics_seed',
      title: 'Ethics Olympiad heat',
      type: 'excursion',
      current_end_date: '2026-10-10',
      competition_or_event_type: 'ext_ethics_olympiad',
      permission_notes: []
    };
    vi.mocked(tasksApi.getProject).mockResolvedValue(excursion);
    vi.mocked(tasksApi.listTasks).mockResolvedValue([]);
    vi.mocked(tasksApi.listTemplates).mockResolvedValue({
      frameworks: [],
      excursion_templates: [],
      task_templates: [],
      project_templates: []
    });
    vi.mocked(tasksApi.updateProject).mockResolvedValue({
      ...excursion,
      permission_notes: [{ id: 'pn_1', name: 'Samira', returned: false }],
      updated_at: '2026-08-28T00:00:00.000Z'
    });

    const canvas = document.createElement('main');
    await renderPageEditor(canvas, { kind: 'project', id: excursion.id });

    const add = canvas.querySelector<HTMLInputElement>('[aria-label="Student name"]')!;
    add.value = 'Samira';
    add.dispatchEvent(new Event('input', { bubbles: true }));
    canvas.querySelector<HTMLButtonElement>('.excursion-tracker .btn')!.click();

    expect(canvas.querySelector('.excursion-tracker .task-name')?.textContent).toBe('Samira');
    await vi.advanceTimersByTimeAsync(400);
    expect(tasksApi.updateProject).toHaveBeenCalled();
    const patch = vi.mocked(tasksApi.updateProject).mock.calls.at(-1)?.[1] as {
      permission_notes: Array<{ name: string; returned: boolean }>;
    };
    expect(patch.permission_notes).toEqual([
      expect.objectContaining({ name: 'Samira', returned: false })
    ]);
  });
});
