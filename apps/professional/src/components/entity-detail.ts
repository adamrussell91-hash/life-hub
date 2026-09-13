import { fetchEntityOverview } from '@/api/entities';
import { changeUniversalLinkRole } from '@/api/universal-links';
import { ApiClientError } from '@/api/client';
import { renderLoadError, showViewLoading } from '@/views/feedback';
import { renderRelationshipTimeline } from '@/components/relationship-timeline';
import type { EntityOverview, RelationshipEntry } from '@/domain/types';

export interface EntityDetailConfig {
  ref: string;
  backHref: string;
  backLabel: string;
  onTitleReady?: (title: string) => void;
  isCurrent?: () => boolean;
  /** Person-only: sort name + a quiet "Self" indicator. Organisation-only: legal name. */
  renderExtraFields?: (overview: EntityOverview, host: HTMLElement) => void;
}

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

/**
 * Accessible role editing for a current, period relationship: a real
 * `<button>` (keyboard operable, labelled) reveals an inline `<label>` +
 * `<input>` + Save/Cancel pair — never a `window.prompt`. Saving calls the
 * registry-controlled `change_role` action, which ends the current period
 * and opens the next one with the new role (server-side `changeRole`), so
 * the prior role stays queryable history rather than being overwritten.
 */
function renderRoleEditor(item: HTMLElement, entry: RelationshipEntry, onChanged: () => void): void {
  const roleLine = el('span', 'entity-detail__relationship-role', entry.link.role ?? 'No role set');

  const editButton = document.createElement('button');
  editButton.type = 'button';
  editButton.className = 'btn btn--ghost entity-detail__role-edit';
  editButton.textContent = 'Edit role';
  editButton.setAttribute('aria-label', `Edit role for ${entry.endpoint.display_label}`);

  const form = document.createElement('form');
  form.className = 'entity-detail__role-form';
  form.hidden = true;

  const labelId = `role-input-${entry.link.id}`;
  const label = document.createElement('label');
  label.className = 'entity-detail__role-form-label';
  label.htmlFor = labelId;
  label.textContent = `Role for ${entry.endpoint.display_label}`;

  const input = document.createElement('input');
  input.type = 'text';
  input.id = labelId;
  input.value = entry.link.role ?? '';

  const save = document.createElement('button');
  save.type = 'submit';
  save.className = 'btn btn--primary';
  save.textContent = 'Save';

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn btn--ghost';
  cancel.textContent = 'Cancel';

  const status = el('p', 'entity-detail__role-form-status');
  status.hidden = true;

  function openForm(): void {
    editButton.hidden = true;
    form.hidden = false;
    input.focus();
  }

  function closeForm(): void {
    form.hidden = true;
    editButton.hidden = false;
    status.hidden = true;
  }

  editButton.addEventListener('click', openForm);
  cancel.addEventListener('click', closeForm);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const nextRole = input.value.trim() || null;
    save.disabled = true;
    changeUniversalLinkRole(entry.link.id, { role: nextRole, changed_at: new Date().toISOString() })
      .then(() => {
        onChanged();
      })
      .catch((err: unknown) => {
        save.disabled = false;
        status.hidden = false;
        status.textContent = err instanceof ApiClientError ? err.message : 'Could not update role.';
      });
  });

  form.append(label, input, save, cancel, status);
  item.append(roleLine, editButton, form);
}

function renderRelationshipList(
  host: HTMLElement,
  entries: RelationshipEntry[],
  emptyMessage: string,
  options: { editableRoles?: boolean; onRoleChanged?: () => void } = {}
): void {
  host.replaceChildren();
  if (!entries.length) {
    host.append(el('p', 'empty-state', emptyMessage));
    return;
  }
  const list = document.createElement('ul');
  list.className = 'entity-detail__relationship-list';
  for (const entry of entries) {
    const item = document.createElement('li');
    const label = el('span', 'entity-detail__relationship-label', entry.link.relationship_type);
    const endpoint = el('span', 'entity-detail__relationship-endpoint', entry.endpoint.display_label);
    item.append(label, document.createTextNode(' · '), endpoint);
    // Role editing only makes sense for a period relationship that is
    // still current — a point-in-time or timeless link, or an already-
    // ended period, has no "current role" to change.
    if (options.editableRoles && entry.link.temporal_mode === 'period' && entry.link.status === 'current') {
      renderRoleEditor(item, entry, () => options.onRoleChanged?.());
    }
    list.append(item);
  }
  host.append(list);
}

export async function renderEntityDetail(canvas: HTMLElement, config: EntityDetailConfig): Promise<void> {
  showViewLoading(canvas, 'Loading…');

  async function load(): Promise<void> {
    showViewLoading(canvas, 'Loading…');
    try {
      const overview = await fetchEntityOverview(config.ref);
      if (config.isCurrent && !config.isCurrent()) return;
      renderLoaded(overview);
    } catch (err) {
      if (config.isCurrent && !config.isCurrent()) return;
      renderLoadError(canvas, err, () => void load());
    }
  }

  function renderLoaded(overview: EntityOverview): void {
    canvas.replaceChildren();
    config.onTitleReady?.(overview.entity.display_name);

    const back = el('a', 'btn btn--ghost entity-detail__back', config.backLabel);
    back.href = config.backHref;

    const summary = el('div', 'entity-detail__summary');
    const kindLine = el(
      'p',
      'entity-detail__kind',
      `${overview.entity.kind === 'person' ? 'Person' : 'Organisation'} · ${overview.entity.lifecycle_status}`
    );
    summary.append(kindLine);
    if (config.renderExtraFields) config.renderExtraFields(overview, summary);

    const currentSection = el('section', 'entity-detail__section');
    currentSection.append(el('h2', 'entity-detail__heading', 'Current relationships'));
    const currentHost = el('div');
    currentSection.append(currentHost);
    renderRelationshipList(currentHost, overview.current_relationships, 'No current relationships.', {
      editableRoles: true,
      onRoleChanged: () => void load()
    });

    const activitySection = el('section', 'entity-detail__section');
    activitySection.append(el('h2', 'entity-detail__heading', 'Linked activity'));
    const activityHost = el('div');
    activitySection.append(activityHost);
    const activityBits: Array<{ label: string; href: string | null }> = [];
    for (const item of overview.linked_records.communications) {
      activityBits.push({ label: `Communication · ${item.display_label}`, href: item.href });
    }
    for (const item of overview.linked_records.tasks) {
      activityBits.push({ label: `Task · ${item.display_label}`, href: item.href });
    }
    for (const item of overview.linked_records.meetings ?? []) {
      activityBits.push({ label: `Meeting · ${item.display_label}`, href: item.href });
    }
    for (const item of overview.linked_records.events ?? []) {
      activityBits.push({ label: `Event · ${item.display_label}`, href: item.href });
    }
    for (const item of overview.linked_records.applications ?? []) {
      activityBits.push({ label: `Application · ${item.display_label}`, href: item.href });
    }
    if (!activityBits.length) {
      activityHost.append(
        el(
          'p',
          'empty-state',
          'No linked communications, tasks, meetings, events, or applications.'
        )
      );
    } else {
      const list = document.createElement('ul');
      list.className = 'entity-detail__relationship-list';
      for (const bit of activityBits) {
        const item = document.createElement('li');
        if (bit.href) {
          const link = document.createElement('a');
          link.href = bit.href;
          link.textContent = bit.label;
          item.append(link);
        } else {
          item.textContent = bit.label;
        }
        list.append(item);
      }
      activityHost.append(list);
    }

    const timelineSection = el('section', 'entity-detail__section');
    timelineSection.append(el('h2', 'entity-detail__heading', 'Relationship timeline'));
    const timelineHost = el('div');
    timelineSection.append(timelineHost);
    renderRelationshipTimeline(timelineHost, overview.timeline);

    const historicalSection = el('section', 'entity-detail__section');
    historicalSection.append(el('h2', 'entity-detail__heading', 'Historical relationships'));
    const historicalHost = el('div');
    historicalSection.append(historicalHost);
    renderRelationshipList(historicalHost, overview.historical_relationships, 'No historical relationships.');

    canvas.append(back, summary, currentSection, activitySection, timelineSection, historicalSection);
  }

  await load();
}
