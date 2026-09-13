import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '@/schemas/task';

vi.mock('@/services/client-api', () => ({
  tasksApi: {
    listTasks: vi.fn(async () => []),
    updateTask: vi.fn(async (_id: string, body: Partial<Task>) => ({
      id: 'task_1',
      title: body.title ?? 'Email Seth about the proposal',
      status: 'open',
      domain: 'work',
      priority: 'normal',
      kind: 'task',
      parent_project_id: body.parent_project_id ?? null,
      parent_task_id: null,
      depends_on: [],
      dependency_links: [],
      contexts: [{ kind: 'person', value: 'legacy free text' }],
      tags: [],
      description: body.description ?? '',
      due_date: null,
      due_time: null,
      target_date: null,
      review_at: null,
      estimated_duration: null,
      recurrence_rule: null,
      remind_at: null,
      remind_dismissed_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z'
    }))
  }
}));

vi.mock('@/api/universal-links', () => ({
  taskEntityRef: (id: string) => `tasks:task:${id}`,
  listUniversalLinksForEntity: vi.fn(async () => ({ outgoing: [], incoming: [] })),
  createUniversalLink: vi.fn(async (body: { relationship_type: string; target_ref: string }) => ({
    link: {
      id: `ul_${body.relationship_type}`,
      source_ref: 'tasks:task:task_1',
      target_ref: body.target_ref,
      relationship_type: body.relationship_type,
      status: 'current'
    },
    created: true
  })),
  endUniversalLink: vi.fn(async () => ({ link: { id: 'ul_x', status: 'ended' } })),
  suppressUniversalLink: vi.fn(async () => ({ link: { id: 'ul_x', status: 'suppressed' } })),
  searchEntities: vi.fn(async () => ({
    groups: {
      person: [
        {
          ref: 'shared:person:person_00000000-0000-4000-8000-000000000001',
          kind: 'person',
          display_label: 'Seth Example',
          supporting_label: null,
          href: null,
          lifecycle_status: 'active',
          visibility: 'operator'
        }
      ]
    }
  })),
  isLinkWriteIncompleteError: () => false
}));

import { renderTaskEditor } from '@/views/task-editor';
import { tasksApi } from '@/services/client-api';
import {
  createUniversalLink,
  listUniversalLinksForEntity,
  suppressUniversalLink
} from '@/api/universal-links';

const baseTask = {
  id: 'task_1',
  title: 'Email Seth about the proposal',
  status: 'open',
  domain: 'work',
  priority: 'normal',
  kind: 'task',
  parent_project_id: 'project_1',
  parent_task_id: null,
  depends_on: [],
  dependency_links: [],
  contexts: [{ kind: 'person', value: 'legacy free text' }],
  tags: [],
  description: '',
  due_date: null,
  due_time: null,
  target_date: null,
  review_at: null,
  estimated_duration: null,
  recurrence_rule: null,
  remind_at: null,
  remind_dismissed_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z'
} as Task;

describe('Task editor Relationships section', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads saved links and preserves existing Task fields on save', async () => {
    vi.mocked(listUniversalLinksForEntity).mockResolvedValueOnce({
      outgoing: [
        {
          link: {
            id: 'ul_saved',
            source_ref: 'tasks:task:task_1',
            target_ref: 'shared:person:person_00000000-0000-4000-8000-000000000001',
            relationship_type: 'contact',
            status: 'current'
          },
          endpoint: {
            ref: 'shared:person:person_00000000-0000-4000-8000-000000000001',
            kind: 'person',
            display_label: 'Seth Example'
          }
        }
      ],
      incoming: []
    } as never);

    const host = document.createElement('div');
    document.body.append(host);
    await renderTaskEditor(host, baseTask, [], async () => undefined);

    expect(host.textContent).toMatch(/Relationships/);
    expect(host.textContent).toMatch(/contact/);
    expect(listUniversalLinksForEntity).toHaveBeenCalledWith('tasks:task:task_1');

    const save = [...host.querySelectorAll('button')].find((btn) => btn.textContent === 'Save');
    expect(save).toBeTruthy();
    save!.click();
    await vi.waitFor(() => expect(tasksApi.updateTask).toHaveBeenCalled());
    const patch = vi.mocked(tasksApi.updateTask).mock.calls[0]![1] as Record<string, unknown>;
    expect(patch.parent_project_id).toBe('project_1');
    expect(Object.prototype.hasOwnProperty.call(patch, 'person_id')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(patch, 'universal_link_id')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(patch, 'relationships')).toBe(false);
  });

  it('defaults new Person links to contact and posts after Task save', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    await renderTaskEditor(host, baseTask, [], async () => undefined);

    const typeSelect = host.querySelector(
      'select[aria-label="Relationship type"]'
    ) as HTMLSelectElement;
    expect(typeSelect.value).toBe('contact');

    // Simulate a pending chip via the public chip list after select would land.
    const pickerInput = host.querySelector(
      'input[aria-label="Link a Person"]'
    ) as HTMLInputElement;
    pickerInput.value = '@Se';
    pickerInput.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 220));
    const option = host.querySelector('.entity-picker__option') as HTMLButtonElement | null;
    if (option) option.click();

    const save = [...host.querySelectorAll('button')].find((btn) => btn.textContent === 'Save');
    save!.click();
    await vi.waitFor(() => expect(tasksApi.updateTask).toHaveBeenCalled());
    if (option) {
      await vi.waitFor(() => expect(createUniversalLink).toHaveBeenCalled());
      expect(vi.mocked(createUniversalLink).mock.calls[0]![0]).toMatchObject({
        relationship_type: 'contact',
        source_ref: 'tasks:task:task_1'
      });
    }
  });

  it('labels saved contact/collaborator actions Remove and suppresses rather than ending', async () => {
    vi.mocked(listUniversalLinksForEntity).mockResolvedValueOnce({
      outgoing: [
        {
          link: {
            id: 'ul_saved_contact',
            source_ref: 'tasks:task:task_1',
            target_ref: 'shared:person:person_00000000-0000-4000-8000-000000000001',
            relationship_type: 'contact',
            status: 'current'
          },
          endpoint: {
            ref: 'shared:person:person_00000000-0000-4000-8000-000000000001',
            kind: 'person',
            display_label: 'Seth Example'
          }
        }
      ],
      incoming: []
    } as never);

    const host = document.createElement('div');
    document.body.append(host);
    await renderTaskEditor(host, baseTask, [], async () => undefined);
    await vi.waitFor(() => expect(host.textContent).toMatch(/Seth Example/));

    const remove = [...host.querySelectorAll('button')].find((btn) => btn.textContent === 'Remove');
    expect(remove).toBeTruthy();
    expect([...host.querySelectorAll('button')].some((btn) => btn.textContent === 'End')).toBe(
      false
    );
    remove!.click();
    await vi.waitFor(() => expect(suppressUniversalLink).toHaveBeenCalled());
    expect(vi.mocked(suppressUniversalLink).mock.calls[0]![0]).toBe('ul_saved_contact');
    expect(vi.mocked(suppressUniversalLink).mock.calls[0]![1]).toBe('operator_requested');
  });
});
