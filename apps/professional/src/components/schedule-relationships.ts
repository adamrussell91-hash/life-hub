import { createEntityPicker } from '../../design-kit/js/entity-picker.js';
import { createEntityChipList } from '../../design-kit/js/entity-chips.js';
import { searchEntities } from '@/api/entities';
import {
  listUniversalLinksForEntity,
  type UniversalLinkEntry
} from '@/api/universal-links';
import { ApiClientError } from '@/api/client';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function renderRelationshipSection(
  host: HTMLElement,
  entries: UniversalLinkEntry[],
  emptyLabel: string
): void {
  host.replaceChildren();
  host.append(el('h2', undefined, 'Relationships'));
  if (!entries.length) {
    host.append(el('p', 'empty-state', emptyLabel));
    return;
  }
  const list = document.createElement('ul');
  list.className = 'entity-detail__relationship-list';
  for (const entry of entries) {
    const item = document.createElement('li');
    const type = entry.link.relationship_type;
    const label = entry.endpoint?.display_label ?? entry.link.target_ref ?? entry.link.source_ref;
    const role =
      typeof (entry.link as { role?: string }).role === 'string'
        ? (entry.link as { role?: string }).role
        : null;
    const text = role ? `${type} · ${label} (${role})` : `${type} · ${label}`;
    // Render the resolved endpoint as a clickable link when the server
    // supplied one — never invent a href client-side.
    const href = entry.endpoint?.href;
    if (href) {
      const link = document.createElement('a');
      link.href = href;
      link.textContent = text;
      item.append(link);
    } else {
      item.textContent = text;
    }
    list.append(item);
  }
  host.append(list);
}

export async function loadEntityRelationships(
  entityRef: string
): Promise<UniversalLinkEntry[]> {
  const { outgoing, incoming } = await listUniversalLinksForEntity(entityRef);
  return [
    ...outgoing.filter((entry) => entry.link.status === 'current'),
    ...incoming.filter((entry) => entry.link.status === 'current')
  ];
}

/**
 * Panel to select an existing Task or create a new one, then link it.
 */
export function mountTaskLinkPanel(options: {
  host: HTMLElement;
  heading: string;
  relationshipType: string;
  onSubmit: (input: { task_id?: string; title?: string }) => Promise<void>;
  onRetry?: (operationId: string) => Promise<void>;
  incompleteOperationId?: string | null;
  statusMessage?: string | null;
}): { root: HTMLElement } {
  const root = el('section', 'task-link-panel');
  root.append(el('h2', undefined, options.heading));

  const mode = document.createElement('select');
  mode.setAttribute('aria-label', `${options.heading} mode`);
  for (const [value, label] of [
    ['create', 'Create new Task'],
    ['select', 'Select existing Task']
  ] as const) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    mode.append(option);
  }

  const title = document.createElement('input');
  title.type = 'text';
  title.placeholder = 'Task title';
  title.setAttribute('aria-label', `${options.heading} title`);

  const taskInput = document.createElement('input');
  taskInput.type = 'text';
  taskInput.placeholder = 'Type @ to pick a Task';
  taskInput.setAttribute('aria-label', `${options.heading} task`);
  taskInput.hidden = true;

  const chipsHost = el('div', 'task-link-panel__chips');
  let selectedTaskId: string | null = null;
  const chipList = createEntityChipList({
    container: chipsHost,
    chips: [],
    onRemovePending: () => {
      selectedTaskId = null;
    }
  });

  const picker = createEntityPicker({
    input: taskInput,
    allowedKinds: ['task'],
    emptyText: 'No matching tasks.',
    search: async (query, signal) => {
      const result = await searchEntities(query, 'task', { signal });
      return { groups: { task: result.groups.task ?? [] } };
    },
    onSelect: (item) => {
      selectedTaskId = item.ref.replace(/^tasks:task:/, '');
      chipList.setChips([
        {
          id: `pending:${item.ref}`,
          ref: item.ref,
          label: item.display_label,
          relationshipType: options.relationshipType,
          state: 'pending',
          href: item.href ?? null
        }
      ]);
    }
  });

  mode.addEventListener('change', () => {
    const select = mode.value === 'select';
    title.hidden = select;
    taskInput.hidden = !select;
    picker.root.hidden = !select;
    chipsHost.hidden = !select;
  });

  const status = el('p', 'meeting-form__status');
  status.hidden = !options.statusMessage;
  if (options.statusMessage) status.textContent = options.statusMessage;

  const submit = el('button', 'btn btn--secondary', 'Save link') as HTMLButtonElement;
  submit.type = 'button';
  submit.dataset.taskLinkSubmit = options.relationshipType;
  submit.addEventListener('click', async () => {
    status.hidden = true;
    submit.disabled = true;
    try {
      if (mode.value === 'select') {
        if (!selectedTaskId) throw new Error('Select a Task first.');
        await options.onSubmit({ task_id: selectedTaskId });
      } else {
        if (!title.value.trim()) throw new Error('Task title is required.');
        await options.onSubmit({ title: title.value.trim() });
      }
    } catch (err) {
      status.hidden = false;
      status.textContent = err instanceof ApiClientError || err instanceof Error ? err.message : 'Link failed.';
      submit.disabled = false;
    }
  });

  root.append(mode, title, taskInput, picker.root, chipsHost, submit, status);

  if (options.incompleteOperationId && options.onRetry) {
    const retry = el('button', 'btn btn--primary', 'Retry incomplete Task link') as HTMLButtonElement;
    retry.type = 'button';
    retry.addEventListener('click', async () => {
      if (!options.incompleteOperationId || !options.onRetry) return;
      retry.disabled = true;
      try {
        await options.onRetry(options.incompleteOperationId);
      } catch (err) {
        status.hidden = false;
        status.textContent = err instanceof Error ? err.message : 'Retry failed.';
        retry.disabled = false;
      }
    });
    root.append(retry);
  }
  options.host.append(root);
  return { root };
}

/** Knowledge page picker using local Knowledge API when available, else free-text avoided. */
export function mountKnowledgePagePicker(options: {
  input: HTMLInputElement;
  onSelect: (item: { ref: string; display_label: string; href?: string | null }) => void;
}): { root: HTMLElement } {
  const picker = createEntityPicker({
    input: options.input,
    allowedKinds: ['page'],
    emptyText: 'No matching Knowledge pages.',
    search: async (query, signal) => {
      const params = new URLSearchParams({ q: query });
      const response = await fetch(`/api/knowledge/search?${params.toString()}`, {
        credentials: 'include',
        signal
      });
      if (!response.ok) return { groups: { page: [] } };
      const payload = await response.json();
      const hits = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload?.hits)
          ? payload.hits
          : Array.isArray(payload)
            ? payload
            : [];
      return {
        groups: {
          page: hits.slice(0, 20).map((hit: { id?: string; title?: string }) => ({
            ref: `knowledge:page:${hit.id}`,
            kind: 'page',
            display_label: hit.title || hit.id || 'Page',
            supporting_label: hit.id ?? null,
            href: hit.id ? `/knowledge/#page/${encodeURIComponent(hit.id)}` : null
          }))
        }
      };
    },
    onSelect: options.onSelect
  });
  return { root: picker.root };
}
