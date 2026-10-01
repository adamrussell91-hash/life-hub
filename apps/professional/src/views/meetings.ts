import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { createEntityPicker } from '../../design-kit/js/entity-picker.js';
import { createEntityChipList } from '../../design-kit/js/entity-chips.js';
import {
  createMeeting,
  getMeeting,
  isMeetingIncompleteLinksError,
  isMeetingTaskLinkIncompleteError,
  linkMeetingTask,
  listMeetings,
  meetingStateAction,
  rescheduleMeeting,
  retryMeetingLinks,
  retryMeetingTaskLink,
  updateMeeting
} from '@/api/meetings';
import { ApiClientError } from '@/api/client';
import { meetingRoute } from '@/app/router';
import type { MeetingRecord } from '@/domain/types';
import { renderScheduleDbPage, type ScheduleDbRow } from '@/components/schedule-db-page';
import { renderLoadError, showViewLoading } from '@/views/feedback';
import { utcIsoToWallLocal, wallLocalToUtcIso, isValidTimeZone } from '@/lib/wall-time';
import { createPillGroup } from '@/lib/pills';
import { searchPickerPeople } from '@/lib/person-picker';
import { mountComposeWhen } from '@/components/compose-when';
import {
  loadEntityRelationships,
  mountTaskLinkPanel,
  renderRelationshipSection
} from '@/components/schedule-relationships';

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

function meetingTaskOps(
  record: MeetingRecord,
  key: 'preparation' | 'follow_up'
): NonNullable<MeetingRecord['preparation_operations']> {
  const plural = key === 'preparation' ? record.preparation_operations : record.follow_up_operations;
  if (Array.isArray(plural) && plural.length) return plural;
  const singular = key === 'preparation' ? record.preparation_operation : record.follow_up_operation;
  return singular ? [singular] : [];
}

/** Preparation and follow-up Task link panels (up to 10 each), with Plan 1's auto-retry. */
export function buildMeetingTaskLinks(record: MeetingRecord, reload: () => Promise<void>): HTMLElement {
  const taskPanels = el('div', 'meeting-detail__task-panels');
  for (const kind of ['preparation', 'follow_up'] as const) {
    const ops = meetingTaskOps(record, kind);
    const incomplete = ops.find((op) => op.status === 'incomplete');
    mountTaskLinkPanel({
      host: taskPanels,
      heading: kind === 'preparation' ? 'Preparation tasks' : 'Follow-up tasks',
      relationshipType: kind,
      linkedOperations: ops,
      incompleteOperationId: incomplete?.operation_id ?? null,
      statusMessage: incomplete ? `${kind === 'preparation' ? 'Preparation' : 'Follow-up'} link incomplete.` : null,
      onSubmit: async (input) => {
        try {
          await linkMeetingTask(record.id, {
            relationship_type: kind,
            ...input
          });
          await reload();
        } catch (err) {
          if (isMeetingTaskLinkIncompleteError(err)) {
            await reload();
            return;
          }
          throw err;
        }
      },
      onRetry: async (operationId) => {
        await retryMeetingTaskLink(record.id, operationId);
        await reload();
      }
    });
  }
  return taskPanels;
}

function notionPageHref(id: string): string | null {
  const match = /^notion_([0-9a-f]{32})$/i.exec(id);
  return match ? `https://www.notion.so/${match[1]}` : null;
}

function toMeetingRow(record: MeetingRecord): ScheduleDbRow {
  const notionHref = notionPageHref(record.id);
  const when =
    record.scheduled_start && !String(record.scheduled_start).startsWith('1970-01-01')
      ? record.scheduled_start
      : '';
  return {
    id: record.id,
    title: record.title,
    href: notionHref ?? meetingRoute(record.id),
    when,
    meta: [record.state.replace(/_/g, ' '), record.location_text ?? ''].filter(Boolean),
    filterTokens: [record.state],
    facetKey: record.state,
    facetLabel: record.state.replace(/_/g, ' ')
  };
}

export async function renderMeetingsView(
  canvas: HTMLElement,
  options: { isCurrent?: () => boolean } = {}
): Promise<void> {
  await renderScheduleDbPage(canvas, {
    kind: 'meetings',
    title: 'Meetings',
    searchPlaceholder: 'Search title or place',
    searchAriaLabel: 'Search meetings',
    emptyMessage: 'No meetings yet.',
    primaryAction: { label: 'New meeting', href: '#/meeting/new' },
    listHash: '#/meetings',
    isCurrent: options.isCurrent,
    loadRows: async () => {
      const { meetings } = await listMeetings();
      return meetings.map(toMeetingRow);
    }
  });
}

function nextHalfHour(now: Date): Date {
  const next = new Date(now.getTime());
  next.setSeconds(0, 0);
  next.setMinutes(next.getMinutes() < 30 ? 30 : 60);
  return next;
}

const ATTENDEE_ROLES = [
  ['', 'No role'],
  ['chair', 'Chair'],
  ['minute_taker', 'Minute taker']
] as const;

export function roleLabel(role: string | null | undefined): string | null {
  return ATTENDEE_ROLES.find(([value]) => value && value === role)?.[1] ?? role ?? null;
}

export async function renderMeetingNewView(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren();
  const form = document.createElement('form');
  form.className = 'event-form event-compose meeting-compose';
  form.noValidate = true;

  const title = document.createElement('input');
  title.type = 'text';
  title.name = 'title';
  title.required = true;
  title.className = 'event-compose__title';
  title.placeholder = 'Name this meeting';
  title.setAttribute('aria-label', 'Title');

  const purpose = document.createElement('textarea');
  purpose.rows = 2;
  purpose.placeholder = 'What you want out of it';
  purpose.setAttribute('aria-label', 'Why you’re there');

  const agenda = document.createElement('textarea');
  agenda.rows = 4;
  agenda.placeholder = 'One item per line';
  agenda.setAttribute('aria-label', 'Agenda');

  const zone = defaultZone();
  const startAt = nextHalfHour(new Date());
  const when = mountComposeWhen({
    start: utcIsoToWallLocal(startAt.toISOString(), zone),
    end: utcIsoToWallLocal(new Date(startAt.getTime() + 60 * 60_000).toISOString(), zone)
  });

  const timeZone = document.createElement('input');
  timeZone.type = 'text';
  timeZone.name = 'time_zone';
  timeZone.value = zone;
  timeZone.setAttribute('aria-label', 'Time zone');

  const locationField = document.createElement('input');
  locationField.type = 'text';
  locationField.placeholder = 'Room, school or link';
  locationField.setAttribute('aria-label', 'Location');

  function field(label: string, control: HTMLElement, hint?: string): HTMLElement {
    const wrap = el('div', 'event-compose__field');
    wrap.append(el('span', 'event-compose__label', label));
    if (hint) wrap.append(el('p', 'event-compose__hint', hint));
    wrap.append(control);
    return wrap;
  }
  when.times.append(field('Where', locationField), field('Time zone', timeZone));

  const role = createPillGroup({ label: 'Attendee role', choices: ATTENDEE_ROLES, value: '' });

  const attendeeInput = document.createElement('input');
  attendeeInput.type = 'text';
  attendeeInput.placeholder = 'Type a name';
  attendeeInput.setAttribute('aria-label', 'Attendee');

  const chipsHost = el('div', 'meeting-form__chips');
  const chipList = createEntityChipList({
    container: chipsHost,
    chips: [],
    onRemovePending: () => undefined
  });

  const picker = createEntityPicker({
    input: attendeeInput,
    allowedKinds: ['person'],
    emptyText: 'No matching people.',
    mode: 'field',
      search: (query, signal) => searchPickerPeople(query, signal),
    onSelect: (item) => {
      const picked = role.get() || null;
      const label = roleLabel(picked);
      chipList.addPending({
        id: `pending:${item.ref}:attendee:${picked ?? ''}`,
        ref: item.ref,
        label: label ? `${item.display_label} (${label})` : item.display_label,
        relationshipType: 'attendee',
        state: 'pending',
        supportingLabel: picked,
        href: item.href ?? null
      });
      attendeeInput.value = '';
    }
  });

  const status = el('p', 'meeting-form__status');
  status.hidden = true;
  const save = el('button', 'btn btn--primary', 'Create meeting') as HTMLButtonElement;
  save.type = 'submit';
  const cancel = el('a', 'btn btn--ghost', 'Cancel');
  cancel.href = '#/meetings';

  function section(heading: string, ...nodes: HTMLElement[]): HTMLElement {
    const card = el('section', 'event-detail__card event-compose__section');
    card.append(el('h2', 'event-detail__section-title', heading), ...nodes);
    return card;
  }

  const roleField = el('div', 'event-compose__field');
  roleField.append(el('span', 'event-compose__label', 'Role for the next person you add'), role.root);
  const actions = el('div', 'event-compose__actions');
  actions.append(save);
  const footer = el('div', 'event-compose__footer');
  footer.append(cancel, status, actions);

  form.append(
    section(
      'Meeting',
      field('Title', title),
      field('Why you’re there', purpose, 'Clare checks the outcome against this afterwards.'),
      field('Agenda', agenda, 'Each line becomes a heading in your notes.')
    ),
    section('When', when.root),
    section('People', roleField, field('Who’s coming', attendeeInput), picker.root, chipsHost),
    footer
  );

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    status.hidden = true;
    const fail = (message: string) => {
      status.hidden = false;
      status.textContent = message;
      save.disabled = false;
    };
    save.disabled = true;
    if (!title.value.trim()) return fail('Give the meeting a title.');
    if (!isValidTimeZone(timeZone.value)) return fail('Enter a valid IANA time zone.');
    let scheduledStart: string;
    let scheduledEnd: string;
    try {
      const wall = when.value();
      scheduledStart = wallLocalToUtcIso(wall.start, timeZone.value);
      scheduledEnd = wallLocalToUtcIso(wall.end, timeZone.value);
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'Invalid date.');
    }
    if (Date.parse(scheduledEnd) <= Date.parse(scheduledStart)) return fail('The meeting has to end after it starts.');
    const pending = chipList.getChips().filter((chip) => chip.state === 'pending');
    const links = pending.map((chip) => ({
      target_ref: chip.ref,
      relationship_type: 'attendee' as const,
      occurred_at: scheduledStart,
      role: chip.supportingLabel || null
    }));
    let meetingId: string;
    try {
      const result = await createMeeting({
        title: title.value.trim(),
        scheduled_start: scheduledStart,
        scheduled_end: scheduledEnd,
        time_zone: timeZone.value,
        location_text: locationField.value.trim() || null,
        agenda: agenda.value.trim() || null,
        links
      });
      meetingId = result.meeting.id;
    } catch (err) {
      if (!isMeetingIncompleteLinksError(err)) {
        return fail(err instanceof ApiClientError ? err.message : 'Save failed.');
      }
      meetingId = err.data.meeting_id;
    }
    if (purpose.value.trim()) {
      await updateMeeting(meetingId, { purpose: purpose.value.trim() }).catch(() => undefined);
    }
    window.location.hash = meetingRoute(meetingId);
  });

  canvas.append(form);
}

export async function renderMeetingDetailView(
  canvas: HTMLElement,
  id: string,
  options: { onTitleReady?: (title: string) => void; isCurrent?: () => boolean } = {}
): Promise<void> {
  showViewLoading(canvas, 'Loading…');

  async function load(): Promise<void> {
    showViewLoading(canvas, 'Loading…');
    try {
      const { meeting } = await getMeeting(id);
      if (options.isCurrent && !options.isCurrent()) return;
      paint(meeting);
    } catch (err) {
      if (options.isCurrent && !options.isCurrent()) return;
      renderLoadError(canvas, err, () => void load());
    }
  }

  function paint(record: MeetingRecord): void {
    canvas.replaceChildren();
    options.onTitleReady?.(record.title);

    const back = el('a', 'btn btn--ghost', 'Back to Meetings');
    back.href = '#/meetings';

    const facts = el('div', 'meeting-detail__facts');
    facts.append(
      el('p', undefined, `State · ${record.state}`),
      el(
        'p',
        undefined,
        `${formatDisplayDate(record.scheduled_start) ?? record.scheduled_start} → ${
          formatDisplayDate(record.scheduled_end) ?? record.scheduled_end
        } (${record.time_zone})`
      ),
      el('p', undefined, record.location_text || 'No location'),
      el('p', undefined, record.agenda || 'No agenda'),
      el('p', undefined, record.notes || 'No notes')
    );

    if (record.occurrence_history?.length) {
      const history = el('section', 'meeting-detail__history');
      history.append(el('h2', undefined, 'Occurrence history'));
      for (const entry of record.occurrence_history) {
        history.append(
          el(
            'p',
            undefined,
            `${entry.scheduled_start} → ${entry.scheduled_end} · changed ${entry.changed_at}${
              entry.reason ? ` · ${entry.reason}` : ''
            }`
          )
        );
      }
      facts.append(history);
    }

    const actions = el('div', 'meeting-detail__actions');
    const actionStatus = el('p', 'meeting-form__status');
    actionStatus.hidden = true;

    async function runAction(label: string, fn: () => Promise<{ meeting: MeetingRecord }>): Promise<void> {
      actionStatus.hidden = true;
      try {
        const result = await fn();
        paint(result.meeting);
      } catch (err) {
        actionStatus.hidden = false;
        actionStatus.textContent = err instanceof ApiClientError ? err.message : `${label} failed.`;
      }
    }

    if (record.state === 'scheduled' || record.state === 'rescheduled') {
      for (const [action, label] of [
        ['complete', 'Complete'],
        ['cancel', 'Cancel'],
        ['no-show', 'No show']
      ] as const) {
        const button = el('button', 'btn btn--secondary', label) as HTMLButtonElement;
        button.type = 'button';
        button.addEventListener('click', () => void runAction(label, () => meetingStateAction(record.id, action)));
        actions.append(button);
      }
    }

    const rescheduleForm = document.createElement('form');
    rescheduleForm.className = 'meeting-detail__reschedule';
    const newStart = document.createElement('input');
    newStart.type = 'datetime-local';
    newStart.value = utcIsoToWallLocal(record.scheduled_start, record.time_zone);
    newStart.setAttribute('aria-label', 'New start');
    const newEnd = document.createElement('input');
    newEnd.type = 'datetime-local';
    newEnd.value = utcIsoToWallLocal(record.scheduled_end, record.time_zone);
    newEnd.setAttribute('aria-label', 'New end');
    const reason = document.createElement('input');
    reason.type = 'text';
    reason.placeholder = 'Reason';
    reason.setAttribute('aria-label', 'Reschedule reason');
    const rescheduleBtn = el('button', 'btn btn--primary', 'Reschedule') as HTMLButtonElement;
    rescheduleBtn.type = 'submit';
    rescheduleForm.append(newStart, newEnd, reason, rescheduleBtn);
    rescheduleForm.addEventListener('submit', (event) => {
      event.preventDefault();
      void runAction('Reschedule', () =>
        rescheduleMeeting(record.id, {
          scheduled_start: wallLocalToUtcIso(newStart.value, record.time_zone),
          scheduled_end: wallLocalToUtcIso(newEnd.value, record.time_zone),
          time_zone: record.time_zone,
          reason: reason.value || null
        })
      );
    });

    const edit = document.createElement('form');
    edit.className = 'meeting-detail__edit';
    const title = document.createElement('input');
    title.type = 'text';
    title.value = record.title;
    title.setAttribute('aria-label', 'Title');
    const notes = document.createElement('textarea');
    notes.rows = 3;
    notes.value = record.notes ?? '';
    notes.setAttribute('aria-label', 'Notes');
    const save = el('button', 'btn btn--secondary', 'Update') as HTMLButtonElement;
    save.type = 'submit';
    edit.append(title, notes, save);
    edit.addEventListener('submit', async (event) => {
      event.preventDefault();
      await runAction('Update', () =>
        updateMeeting(record.id, { title: title.value, notes: notes.value || null })
      );
    });

    const relationships = el('section', 'meeting-detail__relationships');
    relationships.append(el('p', undefined, 'Loading relationships…'));

    const taskPanels = buildMeetingTaskLinks(record, load);

    canvas.append(back, facts, actions, actionStatus, rescheduleForm, edit, relationships, taskPanels);

    void loadEntityRelationships(`professional:meeting:${record.id}`)
      .then((entries) => {
        renderRelationshipSection(
          relationships,
          entries,
          'No attendees, preparation, or follow-up links yet.'
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

    if (record.incomplete_links) {
      const incomplete = el('section', 'meeting-detail__incomplete');
      incomplete.append(
        el(
          'p',
          undefined,
          `Incomplete links (operation ${record.incomplete_links.operation_id}).`
        )
      );
      const retry = el('button', 'btn btn--primary', 'Retry links') as HTMLButtonElement;
      retry.type = 'button';
      retry.addEventListener('click', async () => {
        retry.disabled = true;
        try {
          const result = await retryMeetingLinks(record.id);
          paint(result.meeting);
        } catch (err) {
          if (isMeetingIncompleteLinksError(err)) {
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
