import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { createEntityPicker } from '../../design-kit/js/entity-picker.js';
import { createEntityChipList } from '../../design-kit/js/entity-chips.js';
import {
  createCommunication,
  getCommunication,
  isIncompleteLinksError,
  listCommunications,
  retryCommunicationLinks,
  updateCommunication
} from '@/api/communications';
import { searchEntities } from '@/api/entities';
import { ApiClientError } from '@/api/client';
import { communicationRoute } from '@/app/router';
import type { CommunicationRecord } from '@/domain/types';
import { renderLoadError, showViewLoading } from '@/views/feedback';

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

function labelFor(record: CommunicationRecord): string {
  const subject = record.subject.trim();
  if (subject) return subject;
  return `${record.direction} ${record.channel.replace(/_/g, ' ')}`;
}

export async function renderCommunicationsView(canvas: HTMLElement): Promise<void> {
  showViewLoading(canvas, 'Loading communications…');

  async function load(): Promise<void> {
    showViewLoading(canvas, 'Loading communications…');
    try {
      const { communications } = await listCommunications();
      paint(communications);
    } catch (err) {
      renderLoadError(canvas, err, () => void load());
    }
  }

  function paint(communications: CommunicationRecord[]): void {
    canvas.replaceChildren();
    const actions = el('div', 'communications__actions');
    const compose = el('a', 'btn btn--primary', 'Compose');
    compose.href = '#/communication/new';
    actions.append(compose);
    canvas.append(actions);

    if (!communications.length) {
      canvas.append(el('p', 'empty-state', 'No communications yet.'));
      return;
    }

    const list = document.createElement('ul');
    list.className = 'communications__list';
    for (const record of communications) {
      const item = document.createElement('li');
      item.className = 'communications__item';
      const link = el('a', 'communications__link', labelFor(record));
      link.href = communicationRoute(record.id);
      const meta = el(
        'p',
        'communications__meta',
        [
          record.direction,
          record.channel.replace(/_/g, ' '),
          formatDisplayDate(record.occurred_at) ?? record.occurred_at.slice(0, 10),
          record.incomplete_links ? 'incomplete links' : null
        ]
          .filter(Boolean)
          .join(' · ')
      );
      item.append(link, meta);
      list.append(item);
    }
    canvas.append(list);
  }

  await load();
}

export async function renderCommunicationNewView(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren();

  const form = document.createElement('form');
  form.className = 'communication-form';
  form.noValidate = true;

  const direction = document.createElement('select');
  direction.name = 'direction';
  direction.setAttribute('aria-label', 'Direction');
  for (const value of ['outbound', 'inbound'] as const) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    direction.append(option);
  }

  const channel = document.createElement('select');
  channel.name = 'channel';
  channel.setAttribute('aria-label', 'Channel');
  for (const value of ['email', 'phone', 'message', 'in_person', 'video', 'other'] as const) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value.replace(/_/g, ' ');
    channel.append(option);
  }

  const occurred = document.createElement('input');
  occurred.type = 'datetime-local';
  occurred.name = 'occurred_at';
  occurred.required = true;
  occurred.setAttribute('aria-label', 'Occurred at');
  const now = new Date();
  occurred.value = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);

  const subject = document.createElement('input');
  subject.type = 'text';
  subject.name = 'subject';
  subject.placeholder = 'Subject';
  subject.setAttribute('aria-label', 'Subject');

  const summary = document.createElement('textarea');
  summary.name = 'summary';
  summary.rows = 5;
  summary.placeholder = 'Summary';
  summary.setAttribute('aria-label', 'Summary');

  const recipientInput = document.createElement('input');
  recipientInput.type = 'text';
  recipientInput.placeholder = 'Type @ to add a recipient';
  recipientInput.setAttribute('aria-label', 'Recipient');

  const chipsHost = el('div', 'communication-form__chips');
  const chipList = createEntityChipList({
    container: chipsHost,
    chips: [],
    onRemovePending: () => undefined
  });

  const picker = createEntityPicker({
    input: recipientInput,
    allowedKinds: ['person'],
    emptyText: 'No matching people.',
    search: async (query, signal) => {
      const result = await searchEntities(query, 'person', { signal });
      return {
        groups: {
          person: result.groups.person,
          organisation: result.groups.organisation,
          task: result.groups.task
        }
      };
    },
    onSelect: (item) => {
      chipList.addPending({
        id: `pending:${item.ref}:recipient`,
        ref: item.ref,
        label: item.display_label,
        relationshipType: 'recipient',
        state: 'pending',
        supportingLabel: item.supporting_label ?? null
      });
    }
  });

  const status = el('p', 'communication-form__status');
  status.hidden = true;

  const save = el('button', 'btn btn--primary', 'Save') as HTMLButtonElement;
  save.type = 'submit';

  const cancel = el('a', 'btn btn--ghost', 'Cancel');
  cancel.href = '#/communications';

  form.append(
    el('label', undefined, 'Direction'),
    direction,
    el('label', undefined, 'Channel'),
    channel,
    el('label', undefined, 'Occurred'),
    occurred,
    el('label', undefined, 'Subject'),
    subject,
    el('label', undefined, 'Summary'),
    summary,
    el('label', undefined, 'Recipient'),
    recipientInput,
    picker.root,
    chipsHost,
    status,
    save,
    cancel
  );

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    status.hidden = true;
    save.disabled = true;
    const occurredAt = new Date(occurred.value).toISOString();
    const pending = chipList.getChips().filter((chip) => chip.state === 'pending');
    const links = pending.map((chip) => ({
      target_ref: chip.ref,
      relationship_type: 'recipient' as const,
      occurred_at: occurredAt
    }));
    try {
      const result = await createCommunication({
        direction: direction.value as 'outbound' | 'inbound',
        channel: channel.value,
        occurred_at: occurredAt,
        subject: subject.value,
        summary: summary.value,
        links
      });
      location.hash = communicationRoute(result.communication.id);
    } catch (err) {
      if (isIncompleteLinksError(err)) {
        status.hidden = false;
        status.textContent =
          'Communication saved, but one or more links are incomplete. Opening detail for retry.';
        location.hash = communicationRoute(err.data.communication_id);
        return;
      }
      status.hidden = false;
      status.textContent = err instanceof ApiClientError ? err.message : 'Save failed.';
      save.disabled = false;
    }
  });

  canvas.append(form);
}

export async function renderCommunicationDetailView(
  canvas: HTMLElement,
  id: string,
  options: { onTitleReady?: (title: string) => void; isCurrent?: () => boolean } = {}
): Promise<void> {
  showViewLoading(canvas, 'Loading…');

  async function load(): Promise<void> {
    showViewLoading(canvas, 'Loading…');
    try {
      const { communication } = await getCommunication(id);
      if (options.isCurrent && !options.isCurrent()) return;
      paint(communication);
    } catch (err) {
      if (options.isCurrent && !options.isCurrent()) return;
      renderLoadError(canvas, err, () => void load());
    }
  }

  function paint(record: CommunicationRecord): void {
    canvas.replaceChildren();
    options.onTitleReady?.(labelFor(record));

    const back = el('a', 'btn btn--ghost', 'Back to Communications');
    back.href = '#/communications';

    const facts = el('div', 'communication-detail__facts');
    facts.append(
      el('p', undefined, `${record.direction} · ${record.channel.replace(/_/g, ' ')} · ${record.status}`),
      el('p', undefined, formatDisplayDate(record.occurred_at) ?? record.occurred_at),
      el('p', undefined, record.subject || '(no subject)'),
      el('p', undefined, record.summary || '(no summary)')
    );

    const edit = document.createElement('form');
    edit.className = 'communication-detail__edit';
    const subject = document.createElement('input');
    subject.type = 'text';
    subject.value = record.subject;
    subject.setAttribute('aria-label', 'Subject');
    const summary = document.createElement('textarea');
    summary.rows = 4;
    summary.value = record.summary;
    summary.setAttribute('aria-label', 'Summary');
    const save = el('button', 'btn btn--secondary', 'Update subject and summary') as HTMLButtonElement;
    save.type = 'submit';
    const editStatus = el('p', 'communication-form__status');
    editStatus.hidden = true;
    edit.append(subject, summary, save, editStatus);
    edit.addEventListener('submit', async (event) => {
      event.preventDefault();
      save.disabled = true;
      try {
        const updated = await updateCommunication(record.id, {
          subject: subject.value,
          summary: summary.value
        });
        paint(updated.communication);
      } catch (err) {
        editStatus.hidden = false;
        editStatus.textContent = err instanceof ApiClientError ? err.message : 'Update failed.';
        save.disabled = false;
      }
    });

    canvas.append(back, facts, edit);

    if (record.incomplete_links) {
      const incomplete = el('section', 'communication-detail__incomplete');
      incomplete.append(
        el(
          'p',
          undefined,
          `Incomplete links (operation ${record.incomplete_links.operation_id}). Failed intents: ${
            record.incomplete_links.failed_intent_ids.join(', ') || 'none listed'
          }.`
        )
      );
      const retry = el('button', 'btn btn--primary', 'Retry links') as HTMLButtonElement;
      retry.type = 'button';
      retry.addEventListener('click', async () => {
        retry.disabled = true;
        try {
          const result = await retryCommunicationLinks(record.id);
          paint(result.communication);
        } catch (err) {
          if (isIncompleteLinksError(err)) {
            await load();
            return;
          }
          incomplete.append(
            el('p', undefined, err instanceof ApiClientError ? err.message : 'Retry failed.')
          );
          retry.disabled = false;
        }
      });
      incomplete.append(retry);
      canvas.append(incomplete);
    }
  }

  await load();
}
