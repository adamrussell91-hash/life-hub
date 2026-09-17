import { createEntityPicker } from '../../design-kit/js/entity-picker.js';
import { createEntityChipList } from '../../design-kit/js/entity-chips.js';
import {
  createUniversalLink,
  listUniversalLinksForEntity,
  searchEntities,
  suppressUniversalLink,
  taskEntityRef,
  type UniversalLinkEntry
} from '@/api/universal-links';
import { ApiClientError } from '@/api/client';
import { el } from '@/views/hub-kit';

export interface TaskRelationshipsHandle {
  section: HTMLElement;
  /** Persist pending contact/collaborator links after the Task itself has been saved. */
  savePendingLinks: (taskId: string) => Promise<{ incomplete: boolean; message?: string }>;
  refresh: () => Promise<void>;
}

export interface ProjectRelationshipsHandle {
  section: HTMLElement;
  refresh: () => Promise<void>;
}

function projectEntityRef(projectId: string): string {
  return `tasks:project:${projectId}`;
}

/**
 * "Who's involved" section for the Project page — a Person is tagged as
 * `collaborator` directly (no pending/save step, unlike the Task version)
 * because a Project page has no separate "Save" action to piggyback on.
 */
export function renderProjectRelationshipsSection(projectId: string): ProjectRelationshipsHandle {
  const section = el('section', 'task-editor__relationships');
  section.append(el('h3', 'task-editor__relationships-heading', 'People'));

  const pickerInput = document.createElement('input');
  pickerInput.type = 'text';
  pickerInput.className = 'task-editor__relationship-picker';
  pickerInput.placeholder = 'Type @ to tag a Person on this project';
  pickerInput.setAttribute('aria-label', 'Tag a Person on this project');

  const chipsHost = el('div', 'task-editor__relationship-chips');
  const status = el('p', 'task-editor__relationship-status');
  status.hidden = true;

  const chipList = createEntityChipList({
    container: chipsHost,
    chips: [],
    onRemovePending: () => undefined,
    onEndSaved: async (chip: { id: string; label: string }) => {
      try {
        await suppressUniversalLink(chip.id, 'operator_requested');
        await refresh();
      } catch (err) {
        status.hidden = false;
        status.textContent =
          err instanceof ApiClientError ? err.message : 'Could not remove relationship.';
      }
    },
    endLabel: 'Remove'
  });

  const picker = createEntityPicker({
    input: pickerInput,
    allowedKinds: ['person'],
    emptyText: 'No matching people.',
    search: async (query, signal) => {
      const result = await searchEntities(query, 'person', { signal });
      return { groups: result.groups };
    },
    onSelect: (item) => {
      pickerInput.value = '';
      void (async () => {
        try {
          await createUniversalLink({
            source_ref: projectEntityRef(projectId),
            target_ref: item.ref,
            relationship_type: 'collaborator'
          });
          await refresh();
        } catch (err) {
          status.hidden = false;
          status.textContent =
            err instanceof ApiClientError ? err.message : 'Could not save relationship.';
        }
      })();
    }
  });

  section.append(pickerInput, picker.root, chipsHost, status);

  async function refresh(): Promise<void> {
    try {
      const { outgoing } = await listUniversalLinksForEntity(projectEntityRef(projectId));
      const saved = outgoing
        .filter(
          (entry) => entry.link.status === 'current' && entry.link.relationship_type === 'collaborator'
        )
        .map((entry: UniversalLinkEntry) => ({
          id: entry.link.id,
          ref: entry.endpoint.ref,
          label: entry.endpoint.display_label,
          relationshipType: entry.link.relationship_type,
          state: 'saved' as const,
          supportingLabel: entry.link.relationship_type,
          href: entry.endpoint.href ?? null
        }));
      chipList.setChips(saved);
    } catch (err) {
      status.hidden = false;
      status.textContent =
        err instanceof ApiClientError ? err.message : 'Could not load relationships.';
    }
  }

  void refresh();

  return { section, refresh };
}

/**
 * Relationships section for the full Task editor only.
 * Task JSON never receives Person or Universal Link IDs — every relationship
 * is stored through the canonical Universal Link API.
 *
 * contact and collaborator are timeless: saved chips use Remove → suppress,
 * never endLink.
 */
export function renderTaskRelationshipsSection(taskId: string): TaskRelationshipsHandle {
  const section = el('section', 'task-editor__relationships');
  section.append(el('h3', 'task-editor__relationships-heading', 'Relationships'));
  section.append(
    el(
      'p',
      'task-editor__relationships-copy',
      'Use contact when this Task is directed at a Person. Use collaborator only when a Person helps perform the Task.'
    )
  );

  const relationshipType = document.createElement('select');
  relationshipType.setAttribute('aria-label', 'Relationship type');
  relationshipType.className = 'task-editor__relationship-type';
  for (const value of [
    { value: 'contact', label: 'contact — action directed at this Person' },
    { value: 'collaborator', label: 'collaborator — Person helps perform the Task' }
  ]) {
    const option = document.createElement('option');
    option.value = value.value;
    option.textContent = value.label;
    relationshipType.append(option);
  }
  relationshipType.value = 'contact';

  const pickerInput = document.createElement('input');
  pickerInput.type = 'text';
  pickerInput.className = 'task-editor__relationship-picker';
  pickerInput.placeholder = 'Type @ to link a Person';
  pickerInput.setAttribute('aria-label', 'Link a Person');

  const chipsHost = el('div', 'task-editor__relationship-chips');
  const status = el('p', 'task-editor__relationship-status');
  status.hidden = true;

  const chipList = createEntityChipList({
    container: chipsHost,
    chips: [],
    onRemovePending: () => undefined,
    onEndSaved: async (chip: { id: string; label: string }) => {
      try {
        await suppressUniversalLink(chip.id, 'operator_requested');
        await refresh();
      } catch (err) {
        status.hidden = false;
        status.textContent =
          err instanceof ApiClientError ? err.message : 'Could not remove relationship.';
      }
    },
    endLabel: 'Remove'
  });

  const picker = createEntityPicker({
    input: pickerInput,
    allowedKinds: ['person'],
    emptyText: 'No matching people.',
    search: async (query, signal) => {
      const result = await searchEntities(query, 'person', { signal });
      return { groups: result.groups };
    },
    onSelect: (item) => {
      const type = relationshipType.value === 'collaborator' ? 'collaborator' : 'contact';
      chipList.addPending({
        id: `pending:${item.ref}:${type}`,
        ref: item.ref,
        label: item.display_label,
        relationshipType: type,
        state: 'pending',
        supportingLabel: type
      });
    }
  });

  const retry = el('button', 'btn btn--secondary', 'Retry incomplete links') as HTMLButtonElement;
  retry.type = 'button';
  retry.hidden = true;
  retry.addEventListener('click', async () => {
    const result = await savePendingLinks(taskId);
    status.hidden = false;
    status.textContent = result.incomplete
      ? result.message ?? 'Some links remain incomplete.'
      : 'Relationships saved.';
    retry.hidden = !result.incomplete;
    await refresh();
  });

  section.append(relationshipType, pickerInput, picker.root, chipsHost, status, retry);

  async function refresh(): Promise<void> {
    try {
      const { outgoing } = await listUniversalLinksForEntity(taskEntityRef(taskId));
      const pending = chipList.getChips().filter((chip) => chip.state === 'pending');
      const saved = outgoing
        .filter(
          (entry) =>
            entry.link.status === 'current' &&
            (entry.link.relationship_type === 'contact' ||
              entry.link.relationship_type === 'collaborator')
        )
        .map((entry: UniversalLinkEntry) => ({
          id: entry.link.id,
          ref: entry.endpoint.ref,
          label: entry.endpoint.display_label,
          relationshipType: entry.link.relationship_type,
          state: 'saved' as const,
          supportingLabel: entry.link.relationship_type,
          href: entry.endpoint.href ?? null
        }));
      chipList.setChips([...saved, ...pending]);
    } catch (err) {
      status.hidden = false;
      status.textContent =
        err instanceof ApiClientError ? err.message : 'Could not load relationships.';
    }
  }

  async function savePendingLinks(
    id: string
  ): Promise<{ incomplete: boolean; message?: string }> {
    const pending = chipList.getChips().filter((chip) => chip.state === 'pending');
    if (!pending.length) return { incomplete: false };
    const failed: string[] = [];
    const sourceRef = taskEntityRef(id);
    for (const chip of pending) {
      try {
        await createUniversalLink({
          source_ref: sourceRef,
          target_ref: chip.ref,
          relationship_type: chip.relationshipType === 'collaborator' ? 'collaborator' : 'contact'
        });
        chipList.removeById(chip.id);
      } catch (err) {
        failed.push(chip.label);
        status.hidden = false;
        status.textContent =
          err instanceof ApiClientError
            ? `Task saved. Incomplete link for ${chip.label}: ${err.message}`
            : `Task saved. Incomplete link for ${chip.label}.`;
      }
    }
    retry.hidden = failed.length === 0;
    if (failed.length) {
      return {
        incomplete: true,
        message: `Incomplete links: ${failed.join(', ')}. Use Retry.`
      };
    }
    return { incomplete: false };
  }

  void refresh();

  return { section, savePendingLinks, refresh };
}
