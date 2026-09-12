import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { createEntityPicker } from '../../design-kit/js/entity-picker.js';
import { createEntityChipList } from '../../design-kit/js/entity-chips.js';
import {
  createMeeting,
  getMeeting,
  isMeetingIncompleteLinksError,
  listMeetings,
  meetingStateAction,
  rescheduleMeeting,
  retryMeetingLinks,
  updateMeeting
} from '@/api/meetings';
import { searchEntities } from '@/api/entities';
import { ApiClientError } from '@/api/client';
import { meetingRoute } from '@/app/router';
import type { MeetingRecord } from '@/domain/types';
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

export async function renderMeetingsView(canvas: HTMLElement): Promise<void> {
  showViewLoading(canvas, 'Loading meetings…');

  async function load(): Promise<void> {
    showViewLoading(canvas, 'Loading meetings…');
    try {
      const { meetings } = await listMeetings();
      paint(meetings);
    } catch (err) {
      renderLoadError(canvas, err, () => void load());
    }
  }

  function paint(meetings: MeetingRecord[]): void {
    canvas.replaceChildren();
    const actions = el('div', 'meetings__actions');
    const compose = el('a', 'btn btn--primary', 'Schedule');
    compose.href = '#/meeting/new';
    actions.append(compose);
    canvas.append(actions);

    if (!meetings.length) {
      canvas.append(el('p', 'empty-state', 'No meetings yet.'));
      return;
    }

    const list = document.createElement('ul');
    list.className = 'meetings__list';
    for (const record of meetings) {
      const item = document.createElement('li');
      item.className = 'meetings__item';
      const link = el('a', 'meetings__link', record.title);
      link.href = meetingRoute(record.id);
      const meta = el(
        'p',
        'meetings__meta',
        [
          record.state,
          formatDisplayDate(record.scheduled_start) ?? record.scheduled_start.slice(0, 16),
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

export async function renderMeetingNewView(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren();
  const form = document.createElement('form');
  form.className = 'meeting-form';
  form.noValidate = true;

  const title = document.createElement('input');
  title.type = 'text';
  title.name = 'title';
  title.required = true;
  title.placeholder = 'Title';
  title.setAttribute('aria-label', 'Title');

  const start = document.createElement('input');
  start.type = 'datetime-local';
  start.name = 'scheduled_start';
  start.required = true;
  start.setAttribute('aria-label', 'Starts');
  const end = document.createElement('input');
  end.type = 'datetime-local';
  end.name = 'scheduled_end';
  end.required = true;
  end.setAttribute('aria-label', 'Ends');
  const now = new Date();
  start.value = toLocalInput(now.toISOString());
  end.value = toLocalInput(new Date(now.getTime() + 60 * 60_000).toISOString());

  const timeZone = document.createElement('input');
  timeZone.type = 'text';
  timeZone.name = 'time_zone';
  timeZone.value = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Australia/Sydney';
  timeZone.setAttribute('aria-label', 'Time zone');

  const locationField = document.createElement('input');
  locationField.type = 'text';
  locationField.placeholder = 'Location';
  locationField.setAttribute('aria-label', 'Location');

  const agenda = document.createElement('textarea');
  agenda.rows = 3;
  agenda.placeholder = 'Agenda';
  agenda.setAttribute('aria-label', 'Agenda');

  const attendeeInput = document.createElement('input');
  attendeeInput.type = 'text';
  attendeeInput.placeholder = 'Type @ to add an attendee';
  attendeeInput.setAttribute('aria-label', 'Attendee');

  const roleSelect = document.createElement('select');
  roleSelect.setAttribute('aria-label', 'Attendee role');
  for (const [value, label] of [
    ['', 'No role'],
    ['chair', 'Chair'],
    ['minute_taker', 'Minute taker']
  ] as const) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    roleSelect.append(option);
  }

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
      const role = roleSelect.value || null;
      chipList.addPending({
        id: `pending:${item.ref}:attendee:${role ?? ''}`,
        ref: item.ref,
        label: role ? `${item.display_label} (${role})` : item.display_label,
        relationshipType: 'attendee',
        state: 'pending',
        supportingLabel: role
      });
    }
  });

  const status = el('p', 'meeting-form__status');
  status.hidden = true;
  const save = el('button', 'btn btn--primary', 'Save') as HTMLButtonElement;
  save.type = 'submit';
  const cancel = el('a', 'btn btn--ghost', 'Cancel');
  cancel.href = '#/meetings';

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
    el('label', undefined, 'Agenda'),
    agenda,
    el('label', undefined, 'Attendee role for next pick'),
    roleSelect,
    el('label', undefined, 'Attendees'),
    attendeeInput,
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
    const scheduledStart = new Date(start.value).toISOString();
    const pending = chipList.getChips().filter((chip) => chip.state === 'pending');
    const links = pending.map((chip) => ({
      target_ref: chip.ref,
      relationship_type: 'attendee' as const,
      occurred_at: scheduledStart,
      role: chip.supportingLabel || null
    }));
    try {
      const result = await createMeeting({
        title: title.value,
        scheduled_start: scheduledStart,
        scheduled_end: new Date(end.value).toISOString(),
        time_zone: timeZone.value,
        location_text: locationField.value || null,
        agenda: agenda.value || null,
        links
      });
      window.location.hash = meetingRoute(result.meeting.id);
    } catch (err) {
      if (isMeetingIncompleteLinksError(err)) {
        window.location.hash = meetingRoute(err.data.meeting_id);
        return;
      }
      status.hidden = false;
      status.textContent = err instanceof ApiClientError ? err.message : 'Save failed.';
      save.disabled = false;
    }
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
    newStart.value = toLocalInput(record.scheduled_start);
    newStart.setAttribute('aria-label', 'New start');
    const newEnd = document.createElement('input');
    newEnd.type = 'datetime-local';
    newEnd.value = toLocalInput(record.scheduled_end);
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
          scheduled_start: new Date(newStart.value).toISOString(),
          scheduled_end: new Date(newEnd.value).toISOString(),
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

    canvas.append(back, facts, actions, actionStatus, rescheduleForm, edit);

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
