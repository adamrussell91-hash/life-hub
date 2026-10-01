import { createEntityPicker } from '../../design-kit/js/entity-picker.js';
import { createEntityChipList } from '../../design-kit/js/entity-chips.js';
import { searchEntities } from '@/api/entities';
import {
  listUniversalLinksForEntity,
  type UniversalLinkEntry
} from '@/api/universal-links';
import { ApiClientError } from '@/api/client';
import { createAutoRetry } from '@/lib/auto-retry';
import { createPillGroup } from '@/lib/pills';

/** Matches `MAX_TASK_LINKS_PER_TARGET` in professional-task-link-operation.mjs. */
export const MAX_MEETING_TASK_LINKS = 10;

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

export type LinkedTaskOperation = {
  operation_id: string;
  status: string;
  task_id: string | null;
  title?: string | null;
};

function taskIdFromRef(ref: string): string {
  return ref.replace(/^tasks:task:/, '');
}

function linkedTaskChips(linked: LinkedTaskOperation[], relationshipType: string) {
  return linked.map((op) => ({
    id: op.operation_id,
    ref: op.task_id ? `tasks:task:${op.task_id}` : op.operation_id,
    label: op.title || op.task_id || 'Task',
    relationshipType,
    state: op.status === 'incomplete' ? 'pending' : 'saved',
    readonly: true,
    href: op.task_id ? `/tasks/#/task/${encodeURIComponent(op.task_id)}` : null
  }));
}

/**
 * Panel to select an existing Task or create a new one, then link it.
 * Linked list can hold up to MAX_MEETING_TASK_LINKS tasks of this relationship.
 */
export function mountTaskLinkPanel(options: {
  host: HTMLElement;
  heading: string;
  relationshipType: string;
  onSubmit: (input: { task_id?: string; title?: string }) => Promise<void>;
  onRetry?: (operationId: string) => Promise<void>;
  incompleteOperationId?: string | null;
  statusMessage?: string | null;
  linkedOperations?: LinkedTaskOperation[];
  maxLinks?: number;
  suggestTitle?: () => Promise<string>;
}): { root: HTMLElement } {
  const maxLinks = options.maxLinks ?? MAX_MEETING_TASK_LINKS;
  const linked = Array.isArray(options.linkedOperations) ? options.linkedOperations : [];
  const atCap = linked.length >= maxLinks;

  const root = el('section', 'task-link-panel');
  root.dataset.part = `task-link-${options.relationshipType}`;
  root.append(el('h3', undefined, options.heading));

  const countLine = el(
    'p',
    'task-link-panel__count muted',
    linked.length ? `${linked.length} of ${maxLinks} linked` : `Up to ${maxLinks} tasks`
  );
  root.append(countLine);

  const linkedHost = el('div', 'task-link-panel__linked');
  if (linked.length) {
    createEntityChipList({
      container: linkedHost,
      chips: linkedTaskChips(linked, options.relationshipType)
    });
  }
  root.append(linkedHost);

  const title = document.createElement('input');
  title.type = 'text';
  title.placeholder = 'Task title';
  title.setAttribute('aria-label', `${options.heading} title`);

  if (options.suggestTitle) {
    title.placeholder = 'Clare is suggesting a title…';
    options.suggestTitle().then(
      (suggested) => {
        if (!title.value) title.value = suggested;
        title.placeholder = 'Task title';
      },
      () => {
        title.placeholder = 'Task title';
      }
    );
  }

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

  const linkedTaskIds = new Set(
    linked.map((op) => op.task_id).filter((id): id is string => Boolean(id))
  );

  const picker = createEntityPicker({
    input: taskInput,
    allowedKinds: ['task'],
    emptyText: 'No matching tasks.',
    search: async (query, signal) => {
      const result = await searchEntities(query, 'task', { signal });
      const tasks = (result.groups.task ?? []).filter(
        (item) => !linkedTaskIds.has(taskIdFromRef(item.ref))
      );
      return { groups: { task: tasks } };
    },
    onSelect: (item) => {
      selectedTaskId = taskIdFromRef(item.ref);
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

  picker.root.hidden = true;
  chipsHost.hidden = true;
  const mode = createPillGroup({
    label: `${options.heading} mode`,
    choices: [
      ['create', 'New task'],
      ['select', 'Existing task']
    ],
    value: 'create',
    onChange: (value) => {
      const select = value === 'select';
      title.hidden = select;
      taskInput.hidden = !select;
      picker.root.hidden = !select;
      chipsHost.hidden = !select;
      submit.textContent = select ? 'Link task' : 'Create task';
    }
  });

  const status = el('p', 'meeting-form__status');
  status.hidden = !options.statusMessage;
  if (options.statusMessage) status.textContent = options.statusMessage;

  const submit = el('button', 'btn btn--secondary', 'Create task') as HTMLButtonElement;
  submit.type = 'button';
  submit.dataset.taskLinkSubmit = options.relationshipType;
  submit.addEventListener('click', async () => {
    status.hidden = true;
    submit.disabled = true;
    try {
      if (mode.get() === 'select') {
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

  const row = el('div', 'task-link-panel__row');
  row.append(title, taskInput, submit);
  const addBlock = el('div', 'task-link-panel__add');
  addBlock.append(mode.root, row, picker.root, chipsHost, status);
  if (atCap) {
    addBlock.hidden = true;
    root.append(
      el('p', 'muted task-link-panel__full', `Full — max ${maxLinks} tasks on this list.`)
    );
  }
  root.append(addBlock);

  if (options.incompleteOperationId && options.onRetry) {
    const operationId = options.incompleteOperationId;
    const onRetry = options.onRetry;
    submit.disabled = true;
    for (const button of mode.root.querySelectorAll('button')) button.disabled = true;
    title.disabled = true;

    const linkState = el('p', 'task-link-panel__state', 'Linking…');
    linkState.dataset.linkState = 'linking';
    const tryNowBtn = el('button', 'btn btn--ghost task-link-panel__try', 'Try now') as HTMLButtonElement;
    tryNowBtn.type = 'button';
    tryNowBtn.hidden = true;

    const retry = createAutoRetry({
      run: async () => {
        if (!root.isConnected) {
          retry.stop();
          return;
        }
        await onRetry(operationId);
      },
      onState: (state, error) => {
        linkState.dataset.linkState = state;
        tryNowBtn.hidden = state !== 'stuck';
        if (state === 'linked') linkState.textContent = '✓ linked';
        else if (state === 'stuck') {
          const reason = error instanceof Error && error.message ? error.message : 'Tasks did not answer.';
          linkState.textContent = `● Still linking. ${reason} It keeps trying.`;
        } else linkState.textContent = 'Linking…';
      }
    });
    tryNowBtn.addEventListener('click', () => void retry.tryNow());
    root.append(linkState, tryNowBtn);
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
