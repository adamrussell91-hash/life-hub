import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { createEntityPicker } from '../../design-kit/js/entity-picker.js';
import { createEntityChipList } from '../../design-kit/js/entity-chips.js';
import {
  createEvent,
  eventStateAction,
  getEvent,
  isEventIncompleteLinksError,
  isEventTaskLinkIncompleteError,
  linkEventTask,
  listEvents,
  rescheduleEvent,
  retryEventLinks,
  retryEventTaskLink,
  updateEvent
} from '@/api/events';
import { searchEntities } from '@/api/entities';
import { ApiClientError } from '@/api/client';
import { eventRoute } from '@/app/router';
import type { EventCertificate, EventRecord } from '@/domain/types';
import { renderLoadError, showViewLoading } from '@/views/feedback';
import { utcIsoToWallLocal, wallLocalToUtcIso, isValidTimeZone } from '@/lib/wall-time';
import {
  loadEntityRelationships,
  mountKnowledgePagePicker,
  mountTaskLinkPanel,
  renderRelationshipSection
} from '@/components/schedule-relationships';
import { mountTagAnythingSection } from '@/views/entity-tagger';

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

function defaultZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Australia/Sydney';
}

function certificateFromFields(
  name: string,
  reference: string,
  issuedAt: string
): EventCertificate | null {
  const trimmedName = name.trim();
  const trimmedRef = reference.trim();
  const trimmedIssued = issuedAt.trim();
  if (!trimmedName && !trimmedRef && !trimmedIssued) return null;
  return {
    ...(trimmedName ? { name: trimmedName } : {}),
    ...(trimmedRef ? { reference: trimmedRef } : {}),
    issued_at: trimmedIssued ? new Date(`${trimmedIssued}T00:00:00.000Z`).toISOString() : null
  };
}

function issuedAtDateValue(certificate: EventCertificate | null | undefined): string {
  if (!certificate?.issued_at) return '';
  return certificate.issued_at.slice(0, 10);
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
  const zone = defaultZone();
  start.value = utcIsoToWallLocal(now.toISOString(), zone);
  end.value = utcIsoToWallLocal(new Date(now.getTime() + 2 * 60 * 60_000).toISOString(), zone);

  const timeZone = document.createElement('input');
  timeZone.type = 'text';
  timeZone.value = zone;
  timeZone.setAttribute('aria-label', 'Time zone');

  const locationField = document.createElement('input');
  locationField.type = 'text';
  locationField.placeholder = 'Location';
  locationField.setAttribute('aria-label', 'Location');

  const allDay = document.createElement('input');
  allDay.type = 'checkbox';
  allDay.setAttribute('aria-label', 'All day');

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

  const certName = document.createElement('input');
  certName.type = 'text';
  certName.placeholder = 'Certificate name';
  certName.setAttribute('aria-label', 'Certificate name');

  const certReference = document.createElement('input');
  certReference.type = 'text';
  certReference.placeholder = 'Certificate reference';
  certReference.setAttribute('aria-label', 'Certificate reference');

  const certIssuedAt = document.createElement('input');
  certIssuedAt.type = 'date';
  certIssuedAt.setAttribute('aria-label', 'Certificate issued at');

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

  const presenterInput = document.createElement('input');
  presenterInput.type = 'text';
  presenterInput.placeholder = 'Type @ to add a presenter';
  presenterInput.setAttribute('aria-label', 'Presenter');

  const knowledgeInput = document.createElement('input');
  knowledgeInput.type = 'text';
  knowledgeInput.placeholder = 'Type @ to link a Knowledge page';
  knowledgeInput.setAttribute('aria-label', 'Related knowledge page');

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
        supportingLabel: relationshipType,
        href: item.href ?? null
      });
    }
  });

  const presenterPicker = createEntityPicker({
    input: presenterInput,
    allowedKinds: ['person'],
    emptyText: 'No matching people.',
    search: async (query, signal) => {
      const result = await searchEntities(query, 'person', { signal });
      return { groups: { person: result.groups.person } };
    },
    onSelect: (item) => {
      chipList.addPending({
        id: `pending:${item.ref}:presenter`,
        ref: item.ref,
        label: `${item.display_label} (presenter)`,
        relationshipType: 'presenter',
        state: 'pending',
        supportingLabel: 'presenter',
        href: item.href ?? null
      });
    }
  });

  const knowledgePicker = mountKnowledgePagePicker({
    input: knowledgeInput,
    onSelect: (item) => {
      chipList.addPending({
        id: `pending:${item.ref}:related_to`,
        ref: item.ref,
        label: item.display_label,
        relationshipType: 'related_to',
        state: 'pending',
        supportingLabel: 'related_to',
        href: item.href
      });
    }
  });

  const status = el('p', 'event-form__status');
  status.hidden = true;
  const save = el('button', 'btn btn--primary', 'Save') as HTMLButtonElement;
  save.type = 'submit';
  const cancel = el('a', 'btn btn--ghost', 'Cancel');
  cancel.href = '#/events';

  const allDayLabel = el('label');
  allDayLabel.append(allDay, document.createTextNode(' All day'));

  form.append(
    el('label', undefined, 'Title'),
    title,
    el('label', undefined, 'Starts'),
    start,
    el('label', undefined, 'Ends'),
    end,
    el('label', undefined, 'Time zone'),
    timeZone,
    el('label', undefined, 'Location'),
    locationField,
    allDayLabel,
    el('label', undefined, 'Hours'),
    hours,
    el('label', undefined, 'Accreditation'),
    accreditation,
    el('label', undefined, 'Certificate name'),
    certName,
    el('label', undefined, 'Certificate reference'),
    certReference,
    el('label', undefined, 'Certificate issued at'),
    certIssuedAt,
    el('label', undefined, 'Organisation relationship'),
    orgRel,
    el('label', undefined, 'Provider / venue'),
    orgInput,
    picker.root,
    el('label', undefined, 'Presenter'),
    presenterInput,
    presenterPicker.root,
    chipsHost,
    el('label', undefined, 'Related Knowledge page'),
    knowledgeInput,
    knowledgePicker.root,
    status,
    save,
    cancel
  );

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    status.hidden = true;
    save.disabled = true;
    if (!isValidTimeZone(timeZone.value)) {
      status.hidden = false;
      status.textContent = 'Enter a valid IANA time zone.';
      save.disabled = false;
      return;
    }
    let startIso: string;
    let endIso: string;
    try {
      startIso = wallLocalToUtcIso(start.value, timeZone.value);
      endIso = wallLocalToUtcIso(end.value, timeZone.value);
    } catch (err) {
      status.hidden = false;
      status.textContent = err instanceof Error ? err.message : 'Invalid date.';
      save.disabled = false;
      return;
    }
    const pending = chipList.getChips().filter((chip) => chip.state === 'pending');
    const links: Array<{
      target_ref: string;
      relationship_type: 'provider' | 'venue' | 'related_to' | 'presenter';
    }> = pending.map((chip) => ({
      target_ref: chip.ref,
      relationship_type: (chip.relationshipType === 'venue'
        ? 'venue'
        : chip.relationshipType === 'related_to'
          ? 'related_to'
          : chip.relationshipType === 'presenter'
            ? 'presenter'
            : 'provider') as 'provider' | 'venue' | 'related_to' | 'presenter'
    }));
    try {
      const result = await createEvent({
        title: title.value,
        event_type: 'professional_development',
        start: startIso,
        end: endIso,
        time_zone: timeZone.value,
        all_day: allDay.checked,
        location_text: locationField.value || null,
        hours: hours.value ? Number(hours.value) : null,
        accreditation_category: accreditation.value || null,
        attendance_state: 'registered',
        certificate: certificateFromFields(certName.value, certReference.value, certIssuedAt.value),
        links
      });
      window.location.hash = eventRoute(result.event.id);
    } catch (err) {
      if (isEventIncompleteLinksError(err)) {
        window.location.hash = eventRoute(err.data.event_id);
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
        `${formatDisplayDate(record.start) ?? record.start} → ${formatDisplayDate(record.end) ?? record.end} (${record.time_zone})${
          record.all_day ? ' · all day' : ''
        }`
      ),
      el('p', undefined, `Hours: ${record.hours ?? '—'} · Attendance: ${record.attendance_state ?? '—'}`),
      el('p', undefined, record.accreditation_category || 'No accreditation category'),
      el('p', undefined, record.location_text || 'No location'),
      el(
        'p',
        undefined,
        record.certificate
          ? `Certificate: ${record.certificate.name ?? '—'} · ${record.certificate.reference ?? '—'} · ${
              record.certificate.issued_at ?? '—'
            }`
          : 'No certificate'
      )
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
    newStart.value = utcIsoToWallLocal(record.start, record.time_zone);
    newStart.setAttribute('aria-label', 'New start');
    const newEnd = document.createElement('input');
    newEnd.type = 'datetime-local';
    newEnd.value = utcIsoToWallLocal(record.end, record.time_zone);
    newEnd.setAttribute('aria-label', 'New end');
    const rescheduleAllDay = document.createElement('input');
    rescheduleAllDay.type = 'checkbox';
    rescheduleAllDay.checked = record.all_day;
    rescheduleAllDay.setAttribute('aria-label', 'All day');
    const rescheduleAllDayLabel = el('label');
    rescheduleAllDayLabel.append(rescheduleAllDay, document.createTextNode(' All day'));
    const rescheduleBtn = el('button', 'btn btn--primary', 'Reschedule') as HTMLButtonElement;
    rescheduleBtn.type = 'submit';
    rescheduleForm.append(newStart, newEnd, rescheduleAllDayLabel, rescheduleBtn);
    rescheduleForm.addEventListener('submit', (event) => {
      event.preventDefault();
      void runAction('Reschedule', () =>
        rescheduleEvent(record.id, {
          start: wallLocalToUtcIso(newStart.value, record.time_zone),
          end: wallLocalToUtcIso(newEnd.value, record.time_zone),
          time_zone: record.time_zone,
          all_day: rescheduleAllDay.checked
        })
      );
    });

    const edit = document.createElement('form');
    edit.className = 'event-detail__edit';
    const title = document.createElement('input');
    title.type = 'text';
    title.value = record.title;
    title.setAttribute('aria-label', 'Title');
    const locationField = document.createElement('input');
    locationField.type = 'text';
    locationField.value = record.location_text ?? '';
    locationField.placeholder = 'Location';
    locationField.setAttribute('aria-label', 'Location');
    const allDay = document.createElement('input');
    allDay.type = 'checkbox';
    allDay.checked = record.all_day;
    allDay.setAttribute('aria-label', 'All day');
    const allDayLabel = el('label');
    allDayLabel.append(allDay, document.createTextNode(' All day'));
    const hours = document.createElement('input');
    hours.type = 'number';
    hours.min = '0';
    hours.step = '0.5';
    hours.value = record.hours != null ? String(record.hours) : '';
    hours.setAttribute('aria-label', 'Hours');
    const accreditation = document.createElement('input');
    accreditation.type = 'text';
    accreditation.value = record.accreditation_category ?? '';
    accreditation.setAttribute('aria-label', 'Accreditation category');
    const attendance = document.createElement('select');
    attendance.setAttribute('aria-label', 'Attendance');
    for (const value of ['', 'registered', 'attended', 'partial', 'absent']) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value || 'None';
      if ((record.attendance_state ?? '') === value) option.selected = true;
      attendance.append(option);
    }
    const certName = document.createElement('input');
    certName.type = 'text';
    certName.value = record.certificate?.name ?? '';
    certName.setAttribute('aria-label', 'Certificate name');
    const certReference = document.createElement('input');
    certReference.type = 'text';
    certReference.value = record.certificate?.reference ?? '';
    certReference.setAttribute('aria-label', 'Certificate reference');
    const certIssuedAt = document.createElement('input');
    certIssuedAt.type = 'date';
    certIssuedAt.value = issuedAtDateValue(record.certificate);
    certIssuedAt.setAttribute('aria-label', 'Certificate issued at');
    const save = el('button', 'btn btn--secondary', 'Update') as HTMLButtonElement;
    save.type = 'submit';
    edit.append(
      title,
      locationField,
      allDayLabel,
      hours,
      accreditation,
      attendance,
      certName,
      certReference,
      certIssuedAt,
      save
    );
    edit.addEventListener('submit', async (event) => {
      event.preventDefault();
      const nextCertificate = certificateFromFields(
        certName.value,
        certReference.value,
        certIssuedAt.value
      );
      await runAction('Update', () =>
        updateEvent(record.id, {
          title: title.value,
          location_text: locationField.value || null,
          all_day: allDay.checked,
          hours: hours.value ? Number(hours.value) : null,
          accreditation_category: accreditation.value || null,
          attendance_state: attendance.value || null,
          // Preserve existing certificate when the form still carries its values;
          // only clear when the operator empties every certificate field.
          certificate: nextCertificate ?? null
        })
      );
    });

    const relationships = el('section', 'event-detail__relationships');
    relationships.append(el('p', undefined, 'Loading relationships…'));

    const addPanel = el('div', 'event-detail__add-relationship');
    mountTagAnythingSection(addPanel, `professional:event:${record.id}`);

    function reloadRelationships(): void {
      void loadEntityRelationships(`professional:event:${record.id}`)
        .then((entries) => {
          renderRelationshipSection(
            relationships,
            entries,
            'No provider, venue, presenter, knowledge, or learning task links yet.'
          );
        })
        .catch((err) => {
          relationships.replaceChildren(
            el('h2', undefined, 'Relationships'),
            el(
              'p',
              'empty-state',
              err instanceof ApiClientError ? err.message : 'Relationships unavailable.'
            )
          );
        });
    }

    const taskPanels = el('div', 'event-detail__task-panels');
    mountTaskLinkPanel({
      host: taskPanels,
      heading: 'Learning Task',
      relationshipType: 'learning_for',
      incompleteOperationId:
        record.learning_operation?.status === 'incomplete'
          ? record.learning_operation.operation_id
          : null,
      statusMessage:
        record.learning_operation?.status === 'committed'
          ? `Learning Task ${record.learning_operation.task_id}`
          : record.learning_operation?.status === 'incomplete'
            ? 'Learning link incomplete.'
            : null,
      onSubmit: async (input) => {
        try {
          const result = await linkEventTask(record.id, {
            relationship_type: 'learning_for',
            ...input
          });
          paint(result.event);
        } catch (err) {
          if (isEventTaskLinkIncompleteError(err)) {
            await load();
            return;
          }
          throw err;
        }
      },
      onRetry: async (operationId) => {
        const result = await retryEventTaskLink(record.id, operationId);
        paint(result.event);
      }
    });

    canvas.append(
      back,
      facts,
      actions,
      actionStatus,
      rescheduleForm,
      edit,
      relationships,
      addPanel,
      taskPanels
    );

    reloadRelationships();

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
