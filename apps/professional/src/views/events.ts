import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { createEntityPicker } from '../../design-kit/js/entity-picker.js';
import { createEntityChipList } from '../../design-kit/js/entity-chips.js';
import {
  createEvent,
  eventStateAction,
  getEvent,
  isEventIncompleteLinksError,
  listEvents,
  rescheduleEvent,
  retryEventLinks,
  updateEvent
} from '@/api/events';
import { searchEntities } from '@/api/entities';
import { ApiClientError } from '@/api/client';
import { eventRoute } from '@/app/router';
import type { EventRecord } from '@/domain/types';
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

function toLocalInput(iso: string): string {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export async function renderEventsView(canvas: HTMLElement): Promise<void> {
  showViewLoading(canvas, 'Loading events…');

  async function load(): Promise<void> {
    showViewLoading(canvas, 'Loading events…');
    try {
      const { events } = await listEvents();
      paint(events);
    } catch (err) {
      renderLoadError(canvas, err, () => void load());
    }
  }

  function paint(events: EventRecord[]): void {
    canvas.replaceChildren();
    const actions = el('div', 'events__actions');
    const compose = el('a', 'btn btn--primary', 'Add event');
    compose.href = '#/event/new';
    actions.append(compose);
    canvas.append(actions);

    if (!events.length) {
      canvas.append(el('p', 'empty-state', 'No events yet.'));
      return;
    }

    const list = document.createElement('ul');
    list.className = 'events__list';
    for (const record of events) {
      const item = document.createElement('li');
      item.className = 'events__item';
      const link = el('a', 'events__link', record.title);
      link.href = eventRoute(record.id);
      const meta = el(
        'p',
        'events__meta',
        [
          record.event_type.replace(/_/g, ' '),
          record.occurrence_state,
          formatDisplayDate(record.start) ?? record.start.slice(0, 16),
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

export async function renderEventNewView(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren();
  const form = document.createElement('form');
  form.className = 'event-form';
  form.noValidate = true;

  const title = document.createElement('input');
  title.type = 'text';
  title.required = true;
  title.placeholder = 'Title';
  title.setAttribute('aria-label', 'Title');

  const start = document.createElement('input');
  start.type = 'datetime-local';
  start.required = true;
  start.setAttribute('aria-label', 'Starts');
  const end = document.createElement('input');
  end.type = 'datetime-local';
  end.required = true;
  end.setAttribute('aria-label', 'Ends');
  const now = new Date();
  start.value = toLocalInput(now.toISOString());
  end.value = toLocalInput(new Date(now.getTime() + 2 * 60 * 60_000).toISOString());

  const timeZone = document.createElement('input');
  timeZone.type = 'text';
  timeZone.value = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Australia/Sydney';
  timeZone.setAttribute('aria-label', 'Time zone');

  const hours = document.createElement('input');
  hours.type = 'number';
  hours.min = '0';
  hours.step = '0.5';
  hours.placeholder = 'Hours';
  hours.setAttribute('aria-label', 'Hours');

  const accreditation = document.createElement('input');
  accreditation.type = 'text';
  accreditation.placeholder = 'Accreditation category';
  accreditation.setAttribute('aria-label', 'Accreditation category');

  const orgInput = document.createElement('input');
  orgInput.type = 'text';
  orgInput.placeholder = 'Type @ to add provider or venue';
  orgInput.setAttribute('aria-label', 'Organisation link');

  const orgRel = document.createElement('select');
  orgRel.setAttribute('aria-label', 'Organisation relationship');
  for (const value of ['provider', 'venue'] as const) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    orgRel.append(option);
  }

  const knowledgeRef = document.createElement('input');
  knowledgeRef.type = 'text';
  knowledgeRef.placeholder = 'knowledge:page:… (optional note)';
  knowledgeRef.setAttribute('aria-label', 'Related knowledge page ref');

  const chipsHost = el('div', 'event-form__chips');
  const chipList = createEntityChipList({
    container: chipsHost,
    chips: [],
    onRemovePending: () => undefined
  });

  const picker = createEntityPicker({
    input: orgInput,
    allowedKinds: ['organisation'],
    emptyText: 'No matching organisations.',
    search: async (query, signal) => {
      const result = await searchEntities(query, 'organisation', { signal });
      return {
        groups: {
          person: result.groups.person,
          organisation: result.groups.organisation,
          task: result.groups.task
        }
      };
    },
    onSelect: (item) => {
      const relationshipType = orgRel.value as 'provider' | 'venue';
      chipList.addPending({
        id: `pending:${item.ref}:${relationshipType}`,
        ref: item.ref,
        label: `${item.display_label} (${relationshipType})`,
        relationshipType,
        state: 'pending',
        supportingLabel: relationshipType
      });
    }
  });

  const status = el('p', 'event-form__status');
  status.hidden = true;
  const save = el('button', 'btn btn--primary', 'Save') as HTMLButtonElement;
  save.type = 'submit';
  const cancel = el('a', 'btn btn--ghost', 'Cancel');
  cancel.href = '#/events';

  form.append(
    el('label', undefined, 'Title'),
    title,
    el('label', undefined, 'Starts'),
    start,
    el('label', undefined, 'Ends'),
    end,
    el('label', undefined, 'Time zone'),
    timeZone,
    el('label', undefined, 'Hours'),
    hours,
    el('label', undefined, 'Accreditation'),
    accreditation,
    el('label', undefined, 'Organisation relationship'),
    orgRel,
    el('label', undefined, 'Provider / venue'),
    orgInput,
    picker.root,
    chipsHost,
    el('label', undefined, 'Related Knowledge page'),
    knowledgeRef,
    status,
    save,
    cancel
  );

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    status.hidden = true;
    save.disabled = true;
    const pending = chipList.getChips().filter((chip) => chip.state === 'pending');
    const links: Array<{
      target_ref: string;
      relationship_type: 'provider' | 'venue' | 'related_to';
    }> = pending.map((chip) => ({
      target_ref: chip.ref,
      relationship_type: (chip.supportingLabel === 'venue' ? 'venue' : 'provider') as
        | 'provider'
        | 'venue'
    }));
    const knowledge = knowledgeRef.value.trim();
    if (knowledge) {
      links.push({ target_ref: knowledge, relationship_type: 'related_to' });
    }
    try {
      const result = await createEvent({
        title: title.value,
        event_type: 'professional_development',
        start: new Date(start.value).toISOString(),
        end: new Date(end.value).toISOString(),
        time_zone: timeZone.value,
        hours: hours.value ? Number(hours.value) : null,
        accreditation_category: accreditation.value || null,
        attendance_state: 'registered',
        links
      });
      location.hash = eventRoute(result.event.id);
    } catch (err) {
      if (isEventIncompleteLinksError(err)) {
        location.hash = eventRoute(err.data.event_id);
        return;
      }
      status.hidden = false;
      status.textContent = err instanceof ApiClientError ? err.message : 'Save failed.';
      save.disabled = false;
    }
  });

  canvas.append(form);
}

export async function renderEventDetailView(
  canvas: HTMLElement,
  id: string,
  options: { onTitleReady?: (title: string) => void; isCurrent?: () => boolean } = {}
): Promise<void> {
  showViewLoading(canvas, 'Loading…');

  async function load(): Promise<void> {
    showViewLoading(canvas, 'Loading…');
    try {
      const { event } = await getEvent(id);
      if (options.isCurrent && !options.isCurrent()) return;
      paint(event);
    } catch (err) {
      if (options.isCurrent && !options.isCurrent()) return;
      renderLoadError(canvas, err, () => void load());
    }
  }

  function paint(record: EventRecord): void {
    canvas.replaceChildren();
    options.onTitleReady?.(record.title);

    const back = el('a', 'btn btn--ghost', 'Back to Events');
    back.href = '#/events';

    const facts = el('div', 'event-detail__facts');
    facts.append(
      el('p', undefined, `${record.event_type.replace(/_/g, ' ')} · ${record.occurrence_state}`),
      el(
        'p',
        undefined,
        `${formatDisplayDate(record.start) ?? record.start} → ${formatDisplayDate(record.end) ?? record.end}`
      ),
      el('p', undefined, `Hours: ${record.hours ?? '—'} · Attendance: ${record.attendance_state ?? '—'}`),
      el('p', undefined, record.accreditation_category || 'No accreditation category'),
      el('p', undefined, record.location_text || 'No location')
    );

    const actions = el('div', 'event-detail__actions');
    const actionStatus = el('p', 'event-form__status');
    actionStatus.hidden = true;

    async function runAction(label: string, fn: () => Promise<{ event: EventRecord }>): Promise<void> {
      actionStatus.hidden = true;
      try {
        const result = await fn();
        paint(result.event);
      } catch (err) {
        actionStatus.hidden = false;
        actionStatus.textContent = err instanceof ApiClientError ? err.message : `${label} failed.`;
      }
    }

    if (record.occurrence_state === 'scheduled' || record.occurrence_state === 'rescheduled') {
      for (const [action, label] of [
        ['complete', 'Complete'],
        ['cancel', 'Cancel']
      ] as const) {
        const button = el('button', 'btn btn--secondary', label) as HTMLButtonElement;
        button.type = 'button';
        button.addEventListener('click', () => void runAction(label, () => eventStateAction(record.id, action)));
        actions.append(button);
      }
    }

    const rescheduleForm = document.createElement('form');
    rescheduleForm.className = 'event-detail__reschedule';
    const newStart = document.createElement('input');
    newStart.type = 'datetime-local';
    newStart.value = toLocalInput(record.start);
    newStart.setAttribute('aria-label', 'New start');
    const newEnd = document.createElement('input');
    newEnd.type = 'datetime-local';
    newEnd.value = toLocalInput(record.end);
    newEnd.setAttribute('aria-label', 'New end');
    const rescheduleBtn = el('button', 'btn btn--primary', 'Reschedule') as HTMLButtonElement;
    rescheduleBtn.type = 'submit';
    rescheduleForm.append(newStart, newEnd, rescheduleBtn);
    rescheduleForm.addEventListener('submit', (event) => {
      event.preventDefault();
      void runAction('Reschedule', () =>
        rescheduleEvent(record.id, {
          start: new Date(newStart.value).toISOString(),
          end: new Date(newEnd.value).toISOString(),
          time_zone: record.time_zone,
          all_day: record.all_day
        })
      );
    });

    const edit = document.createElement('form');
    edit.className = 'event-detail__edit';
    const title = document.createElement('input');
    title.type = 'text';
    title.value = record.title;
    title.setAttribute('aria-label', 'Title');
    const attendance = document.createElement('select');
    attendance.setAttribute('aria-label', 'Attendance');
    for (const value of ['', 'registered', 'attended', 'partial', 'absent']) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value || 'None';
      if ((record.attendance_state ?? '') === value) option.selected = true;
      attendance.append(option);
    }
    const save = el('button', 'btn btn--secondary', 'Update') as HTMLButtonElement;
    save.type = 'submit';
    edit.append(title, attendance, save);
    edit.addEventListener('submit', async (event) => {
      event.preventDefault();
      await runAction('Update', () =>
        updateEvent(record.id, {
          title: title.value,
          attendance_state: attendance.value || null
        })
      );
    });

    canvas.append(back, facts, actions, actionStatus, rescheduleForm, edit);

    if (record.incomplete_links) {
      const incomplete = el('section', 'event-detail__incomplete');
      incomplete.append(
        el('p', undefined, `Incomplete links (operation ${record.incomplete_links.operation_id}).`)
      );
      const retry = el('button', 'btn btn--primary', 'Retry links') as HTMLButtonElement;
      retry.type = 'button';
      retry.addEventListener('click', async () => {
        retry.disabled = true;
        try {
          const result = await retryEventLinks(record.id);
          paint(result.event);
        } catch (err) {
          if (isEventIncompleteLinksError(err)) {
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
