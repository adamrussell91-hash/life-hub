import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeCardMenu } from '@/views/card-menu';
import { mountProjectCard, mountTaskCard, renderTaskMicroCard } from '@/views/hub-cards';
import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';

function task(partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    schema_version: 1,
    description: 'A note',
    kind: 'task',
    bucket: 'active',
    step_order: 0,
    domain: 'teaching',
    framework_used: null,
    estimated_duration: 30,
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
    tags: ['brief'],
    recurrence_rule: null,
    due_time: null,
    remind_at: null,
    remind_dismissed_at: null,
    attachments: [],
    source: 'manual',
    ...partial
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
  current_end_date: '2026-08-29',
  review_summary: null,
  stall_flagged_at: null,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
  competition_or_event_type: null,
  key_dates: null,
  student_group_reference: null,
  generated_admin_tasks: [],
  drafted_documents: null
};

function reduceMotion(): void {
  vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches: true,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  } as unknown as MediaQueryList);
}

function openMenu(root: ParentNode): HTMLElement {
  const trigger = root.querySelector<HTMLButtonElement>('.card-menu');
  expect(trigger).not.toBeNull();
  trigger!.click();
  const menu = document.querySelector<HTMLElement>('.card-menu__panel');
  expect(menu).not.toBeNull();
  return menu!;
}

function menuLabels(menu: HTMLElement): string[] {
  return [...menu.querySelectorAll('.hub-menu__opt')].map((item) => item.textContent ?? '');
}

afterEach(() => {
  closeCardMenu();
  document.querySelectorAll('.morphing-popover__panel').forEach((node) => node.remove());
});

describe('hub cards', () => {
  it('renders a Cotton Glass micro task card and expands in place', () => {
    reduceMotion();
    const host = document.createElement('div');
    const slot = mountTaskCard(host, task({ id: 'task_lesson', title: 'Finish lesson pack' }), {});
    expect(slot.querySelector('.hub-row__title')?.textContent).toBe('Finish lesson pack');
    expect(slot.querySelector('.hub-row__title')?.getAttribute('data-hub-morph')).toBe('title');
    expect(slot.querySelector('.hub-chip')?.textContent).toBe('Teaching');
    expect(slot.querySelector('.priority-chip')?.textContent).toBe('high');
    expect(slot.dataset.state).toBe('compact');
    expect(slot.querySelector('.card-menu')).not.toBeNull();

    slot.querySelector('.hub-row')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(slot.dataset.state).toBe('expanded');
    expect(slot.querySelector('.hub-card__title')?.textContent).toBe('Finish lesson pack');
    expect(slot.querySelector('.hub-card__title')?.getAttribute('data-hub-morph')).toBe('title');
    expect(slot.querySelector('.card-menu')).not.toBeNull();
    expect([...slot.querySelectorAll('button')].some((btn) => btn.textContent === 'Open page')).toBe(false);
  });

  it('does not paint status move pills on board cards', () => {
    const list = document.createElement('ul');
    const slot = mountTaskCard(
      list,
      task({ id: 'task_move', title: 'Move me', status: 'open' }),
      { boardColumn: 'todo' },
      true
    );
    expect(slot.querySelector('.board-move-pills')).toBeNull();
    expect(slot.querySelector('.hub-pills')).toBeNull();
    slot.querySelector('.hub-row')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(slot.querySelector('.board-move-pills')).toBeNull();
    expect([...slot.querySelectorAll('button')].map((btn) => btn.textContent)).not.toContain('Doing');
  });

  it('shows a blocked note when the card sits in Blocked', () => {
    reduceMotion();
    const list = document.createElement('ul');
    const slot = mountTaskCard(
      list,
      task({ id: 'task_blocked', title: 'Waiting on prep' }),
      { boardColumn: 'blocked' },
      true
    );
    slot.querySelector('.hub-row')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(slot.querySelector('.board-move-note')?.textContent).toContain('Blocked by unfinished');
    expect(slot.querySelector('.board-move-pills')).toBeNull();
  });

  it('keeps the sprint-board card contract on list items', () => {
    const list = document.createElement('ul');
    const slot = mountTaskCard(list, task({ id: 'task_a', title: 'Alpha' }), {}, true);
    expect(slot.classList.contains('card')).toBe(true);
    expect(slot.dataset.id).toBe('task_a');
    expect(slot.querySelector('.card-title')?.textContent).toBe('Alpha');
    expect(slot.querySelector('.card-menu')).not.toBeNull();
  });

  it('puts edit, delete, expand, and full page in the card menu — not as icons', () => {
    const host = document.createElement('div');
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const current = task({ id: 'task_menu', title: 'Outline MindWorks units' });
    const slot = mountTaskCard(host, current, { onEdit, onDelete });

    expect(slot.querySelector('[aria-label="Edit task"]')).toBeNull();
    expect(slot.querySelector('[aria-label="Delete task"]')).toBeNull();
    expect(slot.querySelector('.hub-icon-btn--danger')).toBeNull();

    const menu = openMenu(slot);
    expect(menuLabels(menu)).toEqual(['Expand', 'Full page', 'Edit', 'Delete']);

    menu.querySelector<HTMLButtonElement>('[data-card-menu-item="delete"]')?.click();
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'task_menu' }));
    expect(onEdit).not.toHaveBeenCalled();
    expect(host.querySelector('.confirm-card')).toBeNull();
    expect(document.body.textContent).not.toContain('Proposed write');
  });

  it('expands from the card menu and offers collapse plus full page', () => {
    reduceMotion();
    const host = document.createElement('div');
    const slot = mountTaskCard(host, task({ id: 'task_expand', title: 'Finish lesson pack' }), {});

    openMenu(slot).querySelector<HTMLButtonElement>('[data-card-menu-item="expand"]')?.click();
    expect(slot.dataset.state).toBe('expanded');

    const menu = openMenu(slot);
    expect(menuLabels(menu)).toEqual(['Collapse', 'Full page']);
    expect(slot.querySelector('.hub-row__actions')).toBeNull();
  });

  it('opens the full page from the menu', () => {
    const host = document.createElement('div');
    const onOpenPage = vi.fn();
    const current = task({ id: 'task_page', title: 'Open me' });
    const slot = mountTaskCard(host, current, { onOpenPage });
    openMenu(slot).querySelector<HTMLButtonElement>('[data-card-menu-item="page"]')?.click();
    expect(onOpenPage).toHaveBeenCalledWith(expect.objectContaining({ id: 'task_page' }));
  });

  it('shows the same overflow menu on standalone micro cards', () => {
    const card = renderTaskMicroCard(task({ id: 'task_gantt', title: 'Moon' }), {
      onEdit: vi.fn()
    });
    expect(card.querySelector('.card-menu')).not.toBeNull();
    expect(card.querySelector('[aria-label="Edit task"]')).toBeNull();
    expect(menuLabels(openMenu(card))).toEqual(['Full page', 'Edit']);
  });

  it('expands a project card to the progress checklist', () => {
    reduceMotion();
    const host = document.createElement('div');
    const slot = mountProjectCard(host, project, [
      task({ id: 'a', title: 'Lock brief', status: 'done' }),
      task({ id: 'b', title: 'Write case study', due_date: '2026-08-17' })
    ]);
    expect(slot.querySelector('.card-menu')).not.toBeNull();
    slot.querySelector('.proj-row')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(slot.dataset.state).toBe('expanded');
    expect(slot.querySelector('.hub-hero-metric')?.textContent).toContain('50');
    expect(slot.querySelectorAll('.task-item')).toHaveLength(2);
    expect(slot.querySelector('.card-menu')).not.toBeNull();
    expect(slot.textContent).not.toContain('Open page');
    expect(menuLabels(openMenu(slot))).toEqual(['Collapse', 'Full page']);
  });

  it('puts delete in the project card menu — not as a button', () => {
    const host = document.createElement('div');
    const onDelete = vi.fn();
    const slot = mountProjectCard(host, project, [], { onDelete });

    expect([...slot.querySelectorAll('button')].some((btn) => btn.textContent === 'Delete')).toBe(false);

    const menu = openMenu(slot);
    expect(menuLabels(menu)).toEqual(['Expand', 'Full page', 'Delete']);
    expect(menu.querySelector('[data-card-menu-item="delete"]')?.classList.contains('hub-menu__opt--danger')).toBe(
      true
    );

    menu.querySelector<HTMLButtonElement>('[data-card-menu-item="delete"]')?.click();
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'proj_mw' }));
    expect(host.querySelector('.confirm-card')).toBeNull();
    expect(document.body.textContent).not.toContain('Proposed write');
  });

  it('opens a closed-field chip from the card without expanding, then Save patches', () => {
    reduceMotion();
    const host = document.createElement('div');
    const onPatch = vi.fn();
    const current = task({ id: 'task_chip', title: 'Chip edit', priority: 'high' });
    const slot = mountTaskCard(host, current, { onPatch });

    const chip = slot.querySelector<HTMLButtonElement>('.priority-chip');
    expect(chip?.tagName).toBe('BUTTON');
    chip!.click();
    expect(slot.dataset.state).toBe('compact');

    const panel = document.querySelector<HTMLElement>('.morphing-popover__panel:not([hidden])');
    expect(panel).not.toBeNull();
    expect(panel?.querySelector('.morphing-popover__title')?.textContent).toBe('Priority');
    expect([...panel!.querySelectorAll('.hub-pills__btn')].map((btn) => btn.textContent)).toEqual([
      'urgent',
      'high',
      'medium',
      'low'
    ]);

    [...panel!.querySelectorAll('.hub-pills__btn')].find((btn) => btn.textContent === 'urgent')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
    [...panel!.querySelectorAll('button')].find((btn) => btn.textContent === 'Save')?.click();
    expect(onPatch).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'task_chip' }),
      { priority: 'urgent' }
    );

    const domain = slot.querySelector<HTMLButtonElement>('.hub-chip');
    domain!.click();
    const domainPanel = document.querySelector<HTMLElement>('.morphing-popover__panel:not([hidden])');
    expect(domainPanel?.querySelector('.morphing-popover__title')?.textContent).toBe('Domain');
    [...domainPanel!.querySelectorAll('.hub-pills__btn')].find((btn) => btn.textContent === 'Wedding')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
    [...domainPanel!.querySelectorAll('button')].find((btn) => btn.textContent === 'Save')?.click();
    expect(onPatch).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'task_chip' }),
      { domain: 'wedding' }
    );
  });

  it('leaves chips as display spans when onPatch is missing', () => {
    const host = document.createElement('div');
    const slot = mountTaskCard(host, task({ id: 'task_plain', title: 'Read only chips' }), {});
    expect(slot.querySelector('.priority-chip')?.tagName).toBe('SPAN');
    expect(slot.querySelector('.hub-chip')?.tagName).toBe('SPAN');
    expect(slot.querySelector('.morphing-popover')).toBeNull();
  });

  it('opens via onActivate instead of expanding when that handler is set', () => {
    const host = document.createElement('div');
    const onActivate = vi.fn();
    const slot = mountProjectCard(host, { ...project, type: 'excursion' }, [], { onActivate });
    slot.querySelector('.proj-row')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({ id: 'proj_mw' }));
    expect(slot.dataset.state).toBe('compact');
  });
});
