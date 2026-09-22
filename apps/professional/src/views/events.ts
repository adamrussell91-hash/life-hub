import { formatDisplayDate, formatDisplayDateRange } from '../../design-kit/js/format-display-date.js';
import { createEntityPicker } from '../../design-kit/js/entity-picker.js';
import { createEntityChipList } from '../../design-kit/js/entity-chips.js';
import { createViewOnMap } from '../../design-kit/js/view-on-map.js';
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
  updateEvent,
  type EventLinkInput
} from '@/api/events';
import { searchEntities } from '@/api/entities';
import type { UniversalLinkEntry } from '@/api/universal-links';
import { ApiClientError } from '@/api/client';
import { eventRoute } from '@/app/router';
import type { EventCertificate, EventOccurrenceState, EventRecord } from '@/domain/types';
import { renderLoadError, showViewLoading } from '@/views/feedback';
import { utcIsoToWallLocal, wallLocalToUtcIso, isValidTimeZone } from '@/lib/wall-time';
import { loadEntityRelationships, mountKnowledgePagePicker, mountTaskLinkPanel } from '@/components/schedule-relationships';
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

const EVENT_KINDS = [
  { id: 'course', label: 'Course', hint: 'Structured learning' },
  { id: 'workshop', label: 'Workshop', hint: 'Facilitated session' },
  { id: 'mentoring', label: 'Mentoring', hint: 'Coaching or observation' },
  { id: 'conference', label: 'Conference', hint: 'Talks and panels' },
  { id: 'on_country', label: 'On Country', hint: 'Place-based learning' },
  { id: 'other', label: 'Other', hint: 'Anything else' }
] as const;

const PRIORITY_AREAS = [
  'Curriculum & assessment',
  'Students with disability',
  'Aboriginal education',
  'Wellbeing'
] as const;

function splitWallLocal(value: string): { date: string; time: string } {
  const [date = '', time = ''] = value.split('T');
  return { date, time: time.slice(0, 5) };
}

function monthTitle(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleString('en-AU', { month: 'long', year: 'numeric' });
}

export async function renderEventNewView(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren();
  const form = document.createElement('form');
  form.className = 'event-form event-compose';
  form.noValidate = true;

  const title = document.createElement('input');
  title.type = 'text';
  title.required = true;
  title.className = 'event-compose__title';
  title.placeholder = 'Name this event';
  title.setAttribute('aria-label', 'Title');

  const start = document.createElement('input');
  start.type = 'datetime-local';
  start.required = true;
  start.className = 'event-compose__sr';
  start.setAttribute('aria-label', 'Starts');
  const end = document.createElement('input');
  end.type = 'datetime-local';
  end.required = true;
  end.className = 'event-compose__sr';
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

  const attendeeInput = document.createElement('input');
  attendeeInput.type = 'text';
  attendeeInput.placeholder = 'Type @ to add a person';
  attendeeInput.setAttribute('aria-label', 'Attendee');

  const attendeeRole = document.createElement('select');
  attendeeRole.setAttribute('aria-label', 'Attendee role');
  for (const [value, label] of [
    ['', 'No role'],
    ['facilitator', 'Facilitator'],
    ['presenter', 'Presenter']
  ] as const) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    attendeeRole.append(option);
  }

  const attendeePicker = createEntityPicker({
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
      const role = attendeeRole.value || null;
      chipList.addPending({
        id: `pending:${item.ref}:attendee:${role ?? ''}`,
        ref: item.ref,
        label: role ? `${item.display_label} (${role})` : item.display_label,
        relationshipType: 'attendee',
        state: 'pending',
        supportingLabel: role,
        href: item.href ?? null
      });
    }
  });

  const status = el('p', 'event-form__status');
  status.hidden = true;
  const save = el('button', 'btn btn--primary', 'Save') as HTMLButtonElement;
  save.type = 'submit';
  const cancel = el('a', 'btn btn--ghost', 'Cancel');
  cancel.href = '#/events';

  const allDayLabel = el('label', 'event-compose__switch');
  allDayLabel.append(allDay, document.createTextNode(' All day'));

  const startTime = document.createElement('input');
  startTime.type = 'time';
  startTime.setAttribute('aria-label', 'Start time');
  const endTime = document.createElement('input');
  endTime.type = 'time';
  endTime.setAttribute('aria-label', 'End time');

  function field(label: string, control: HTMLElement, extra?: HTMLElement): HTMLElement {
    const wrap = el('div', 'event-compose__field');
    wrap.append(el('label', 'event-compose__label', label), control);
    if (extra) wrap.append(extra);
    return wrap;
  }

  const calHost = el('div', 'event-compose__cal');
  const monthTitleEl = el('h2', 'event-compose__month-title');
  let view = splitWallLocal(start.value);
  let viewYear = Number(view.date.slice(0, 4));
  let viewMonth = Number(view.date.slice(5, 7)) - 1;

  function selectedDate(): string {
    return splitWallLocal(start.value).date;
  }

  function syncTimesFromWall(): void {
    const nextStart = splitWallLocal(start.value);
    const nextEnd = splitWallLocal(end.value);
    startTime.value = nextStart.time;
    endTime.value = nextEnd.time;
  }

  function writeWall(date: string, startClock: string, endClock: string): void {
    start.value = `${date}T${startClock}`;
    end.value = `${date}T${endClock}`;
  }

  function paintCalendar(): void {
    monthTitleEl.textContent = monthTitle(viewYear, viewMonth);
    calHost.replaceChildren();
    for (const day of ['M', 'T', 'W', 'T', 'F', 'S', 'S']) {
      calHost.append(el('span', 'event-compose__cal-head', day));
    }
    const first = new Date(viewYear, viewMonth, 1);
    const startPad = (first.getDay() + 6) % 7;
    const days = new Date(viewYear, viewMonth + 1, 0).getDate();
    const selected = selectedDate();
    for (let i = 0; i < startPad; i += 1) {
      const cell = el('span', 'event-compose__cal-day is-muted');
      cell.textContent = '';
      calHost.append(cell);
    }
    for (let day = 1; day <= days; day += 1) {
      const ymd = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'event-compose__cal-day';
      if (ymd === selected) cell.classList.add('is-on');
      cell.textContent = String(day);
      cell.addEventListener('click', () => {
        writeWall(ymd, startTime.value || '09:00', endTime.value || '11:00');
        paintCalendar();
      });
      calHost.append(cell);
    }
  }

  const prevMonth = el('button', 'btn btn--ghost', '‹') as HTMLButtonElement;
  prevMonth.type = 'button';
  prevMonth.setAttribute('aria-label', 'Previous month');
  const nextMonth = el('button', 'btn btn--ghost', '›') as HTMLButtonElement;
  nextMonth.type = 'button';
  nextMonth.setAttribute('aria-label', 'Next month');
  prevMonth.addEventListener('click', () => {
    viewMonth -= 1;
    if (viewMonth < 0) {
      viewMonth = 11;
      viewYear -= 1;
    }
    paintCalendar();
  });
  nextMonth.addEventListener('click', () => {
    viewMonth += 1;
    if (viewMonth > 11) {
      viewMonth = 0;
      viewYear += 1;
    }
    paintCalendar();
  });

  startTime.addEventListener('input', () => {
    writeWall(selectedDate() || splitWallLocal(start.value).date, startTime.value, endTime.value);
  });
  endTime.addEventListener('input', () => {
    writeWall(selectedDate() || splitWallLocal(end.value).date, startTime.value, endTime.value);
  });
  allDay.addEventListener('change', () => {
    startTime.disabled = allDay.checked;
    endTime.disabled = allDay.checked;
  });

  let selectedKind: (typeof EVENT_KINDS)[number] = EVENT_KINDS[0];
  const typeButtons: HTMLButtonElement[] = [];
  const typeGrid = el('div', 'event-compose__types');
  for (const kind of EVENT_KINDS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'event-compose__type';
    button.setAttribute('aria-label', `Event type ${kind.label}`);
    button.setAttribute('aria-pressed', kind.id === selectedKind.id ? 'true' : 'false');
    if (kind.id === selectedKind.id) button.classList.add('is-on');
    button.append(el('strong', undefined, kind.label), el('span', undefined, kind.hint));
    button.addEventListener('click', () => {
      selectedKind = kind;
      typeButtons.forEach((node) => {
        const on = node === button;
        node.classList.toggle('is-on', on);
        node.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      syncAccreditation();
    });
    typeButtons.push(button);
    typeGrid.append(button);
  }

  hours.className = 'event-compose__sr';
  hours.value = hours.value || '0';
  const hoursValue = el('b', 'event-compose__stepper-value', '0.0');
  function paintHours(): void {
    const value = Number(hours.value || 0);
    hoursValue.textContent = value.toFixed(1);
  }
  function bumpHours(delta: number): void {
    const next = Math.max(0, Math.round((Number(hours.value || 0) + delta) * 2) / 2);
    hours.value = String(next);
    paintHours();
  }
  const minus = el('button', undefined, '−') as HTMLButtonElement;
  minus.type = 'button';
  minus.setAttribute('aria-label', 'Decrease hours');
  minus.addEventListener('click', () => bumpHours(-0.5));
  const plus = el('button', undefined, '+') as HTMLButtonElement;
  plus.type = 'button';
  plus.setAttribute('aria-label', 'Increase hours');
  plus.addEventListener('click', () => bumpHours(0.5));
  const stepper = el('div', 'event-compose__stepper');
  stepper.append(minus, hoursValue, plus, hours);
  const hoursCopy = el('div');
  hoursCopy.append(el('b', undefined, 'Hours to log'), el('p', undefined, 'Optional. Use when this event should count as time on the record.'));
  const hoursRow = el('div', 'event-compose__hours');
  hoursRow.append(hoursCopy, stepper);

  const chipButtons: HTMLButtonElement[] = [];
  const chipRow = el('div', 'event-compose__chips');
  for (const area of PRIORITY_AREAS) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'event-compose__chip';
    chip.textContent = area;
    chip.setAttribute('aria-pressed', 'false');
    chip.addEventListener('click', () => {
      const on = !chip.classList.contains('is-on');
      chipButtons.forEach((node) => {
        node.classList.toggle('is-on', node === chip && on);
        node.setAttribute('aria-pressed', node === chip && on ? 'true' : 'false');
      });
      syncAccreditation();
    });
    chipButtons.push(chip);
    chipRow.append(chip);
  }
  accreditation.classList.add('event-compose__sr');
  function syncAccreditation(): void {
    const priority = chipButtons.find((node) => node.classList.contains('is-on'))?.textContent ?? '';
    accreditation.value = [selectedKind.label, priority].filter(Boolean).join(' · ');
  }
  syncAccreditation();
  paintHours();

  function section(title: string, ...nodes: HTMLElement[]): HTMLElement {
    const card = el('section', 'event-detail__card event-compose__section');
    card.append(el('h2', 'event-detail__section-title', title), ...nodes);
    return card;
  }

  const monthNav = el('div', 'event-compose__month-nav');
  monthNav.append(prevMonth, nextMonth);
  const monthRow = el('div', 'event-compose__month');
  monthRow.append(monthTitleEl, monthNav);
  const calBlock = el('div', 'event-compose__cal-block');
  calBlock.append(monthRow, calHost);
  const startTimeRow = el('label', 'event-compose__time');
  startTimeRow.append(el('span', 'event-compose__label', 'Starts'), startTime);
  const endTimeRow = el('label', 'event-compose__time');
  endTimeRow.append(el('span', 'event-compose__label', 'Ends'), endTime);
  const times = el('div', 'event-compose__times');
  times.append(
    startTimeRow,
    endTimeRow,
    allDayLabel,
    field('Time zone', timeZone),
    field('Location', locationField)
  );
  const whenGrid = el('div', 'event-compose__when');
  whenGrid.append(calBlock, times);

  const actions = el('div', 'event-compose__actions');
  actions.append(save);
  const footer = el('div', 'event-compose__footer');
  footer.append(cancel, status, actions);
  form.append(
    section('Event', field('Event type', typeGrid), field('Title', title), hoursRow, field('Priority area', chipRow, accreditation)),
    section('When', whenGrid, start, end),
    section(
      'People',
      field('Organisation relationship', orgRel),
      field('Provider / venue', orgInput, picker.root),
      field('Presenter', presenterInput, presenterPicker.root),
      field('Attendee role for next pick', attendeeRole),
      field('People', attendeeInput, attendeePicker.root),
      chipsHost
    ),
    section(
      'Evidence',
      field('Certificate name', certName),
      field('Certificate reference', certReference),
      field('Certificate issued at', certIssuedAt),
      field('Related Knowledge page', knowledgeInput, knowledgePicker.root)
    ),
    footer
  );

  syncTimesFromWall();
  paintCalendar();

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
    const links: EventLinkInput[] = pending.map((chip) => {
      const relationshipType = chip.relationshipType as EventLinkInput['relationship_type'];
      return {
        target_ref: chip.ref,
        relationship_type: relationshipType,
        ...(relationshipType === 'attendee'
          ? { occurred_at: startIso, role: chip.supportingLabel || null }
          : {})
      };
    });
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

const OCCURRENCE_LABEL: Record<EventOccurrenceState, string> = {
  completed: 'Completed',
  scheduled: 'Scheduled',
  rescheduled: 'Rescheduled',
  cancelled: 'Cancelled'
};

function formatWallTime(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-AU', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true }).format(
      new Date(iso)
    );
  } catch {
    return '';
  }
}

function agendaTimeDetail(record: EventRecord): string {
  if (record.all_day) return `All day · ${record.time_zone}`;
  return `${formatWallTime(record.start, record.time_zone)} – ${formatWallTime(record.end, record.time_zone)} · ${record.time_zone}`;
}

function certificateSummary(certificate: EventCertificate | null): string {
  if (!certificate) return 'No certificate on file';
  const parts = [
    certificate.name,
    certificate.reference,
    certificate.issued_at ? formatDisplayDate(certificate.issued_at) : null
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'No certificate on file';
}

function relationshipChip(entry: UniversalLinkEntry): HTMLElement {
  const label = entry.endpoint?.display_label ?? entry.link.target_ref ?? entry.link.source_ref;
  const item = el('li', 'entity-chip entity-chip--tag');
  const href = entry.endpoint?.href;
  if (href) {
    const link = el('a', 'entity-chip__label entity-chip__label--link', label);
    link.href = href;
    item.append(link);
  } else {
    item.append(el('span', 'entity-chip__label', label));
  }
  item.append(el('span', 'entity-chip__meta', entry.link.relationship_type.replace(/_/g, ' ')));
  return item;
}

function paintLinkedList(host: HTMLElement, title: string, entries: UniversalLinkEntry[], empty: string): void {
  host.replaceChildren(el('p', 'event-detail__kicker', title));
  if (!entries.length) {
    host.append(el('p', 'empty-state', empty));
    return;
  }
  const list = document.createElement('ul');
  list.className = 'entity-chips__list';
  for (const entry of entries) list.append(relationshipChip(entry));
  host.append(list);
}

export interface EventDetailHeader {
  title: string;
  supporting: string;
  actions: HTMLElement;
}

export async function renderEventDetailView(
  canvas: HTMLElement,
  id: string,
  options: {
    onTitleReady?: (title: string) => void;
    onHeaderReady?: (header: EventDetailHeader) => void;
    isCurrent?: () => boolean;
  } = {}
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

    const root = el('div', 'event-detail');
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

    const canReschedule = record.occurrence_state === 'scheduled' || record.occurrence_state === 'rescheduled';
    const editPanel = el('section', 'event-detail__card event-detail__panel');
    editPanel.hidden = true;
    const reschedulePanel = el('section', 'event-detail__card event-detail__panel');
    reschedulePanel.hidden = true;

    const headerActions = el('div', 'event-detail__actions');
    const editBtn = el('button', 'btn btn--secondary', 'Edit') as HTMLButtonElement;
    editBtn.type = 'button';
    editBtn.addEventListener('click', () => {
      editPanel.hidden = !editPanel.hidden;
    });
    if (canReschedule) {
      const rescheduleBtn = el('button', 'btn btn--ghost', 'Reschedule') as HTMLButtonElement;
      rescheduleBtn.type = 'button';
      rescheduleBtn.addEventListener('click', () => {
        reschedulePanel.hidden = !reschedulePanel.hidden;
      });
      const completeBtn = el('button', 'btn btn--secondary', 'Mark complete') as HTMLButtonElement;
      completeBtn.type = 'button';
      completeBtn.addEventListener('click', () =>
        void runAction('Complete', () => eventStateAction(record.id, 'complete'))
      );
      headerActions.append(rescheduleBtn, completeBtn);
    }
    headerActions.append(editBtn);

    const supporting = `${OCCURRENCE_LABEL[record.occurrence_state]} ${record.event_type.replace(/_/g, ' ')}`;
    if (options.onHeaderReady) {
      options.onHeaderReady({ title: record.title, supporting, actions: headerActions });
    } else {
      root.append(headerActions);
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
    const saveTime = el('button', 'btn btn--primary', 'Save new time') as HTMLButtonElement;
    saveTime.type = 'submit';
    rescheduleForm.append(el('label', undefined, 'New start'), newStart, el('label', undefined, 'New end'), newEnd, saveTime);
    rescheduleForm.addEventListener('submit', (event) => {
      event.preventDefault();
      void runAction('Reschedule', () =>
        rescheduleEvent(record.id, {
          start: wallLocalToUtcIso(newStart.value, record.time_zone),
          end: wallLocalToUtcIso(newEnd.value, record.time_zone),
          time_zone: record.time_zone,
          all_day: record.all_day
        })
      );
    });
    reschedulePanel.append(el('h2', 'event-detail__section-title', 'Reschedule'), rescheduleForm);

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
    if (canReschedule) {
      const cancel = el('button', 'btn btn--ghost event-detail__cancel', 'Cancel event') as HTMLButtonElement;
      cancel.type = 'button';
      cancel.addEventListener('click', () => void runAction('Cancel', () => eventStateAction(record.id, 'cancel')));
      edit.append(cancel);
    }
    edit.addEventListener('submit', async (event) => {
      event.preventDefault();
      const nextCertificate = certificateFromFields(certName.value, certReference.value, certIssuedAt.value);
      await runAction('Update', () =>
        updateEvent(record.id, {
          title: title.value,
          location_text: locationField.value || null,
          all_day: allDay.checked,
          hours: hours.value ? Number(hours.value) : null,
          accreditation_category: accreditation.value || null,
          attendance_state: attendance.value || null,
          certificate: nextCertificate ?? null
        })
      );
    });
    editPanel.append(el('h2', 'event-detail__section-title', 'Edit details'), edit);

    if (record.incomplete_links) {
      const incomplete = el('section', 'confirm-card event-detail__incomplete');
      incomplete.append(el('p', undefined, `Incomplete links (operation ${record.incomplete_links.operation_id}).`));
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
          incomplete.append(el('p', undefined, err instanceof ApiClientError ? err.message : 'Retry failed.'));
          retry.disabled = false;
        }
      });
      const actions = el('div', 'confirm-card__actions');
      actions.append(retry);
      incomplete.append(actions);
      root.append(incomplete);
    }

    const session = el('section', 'event-detail__card event-detail__session');
    const sessionWhen = el('div', 'event-detail__session-when');
    sessionWhen.append(
      el('p', 'event-detail__session-date', formatDisplayDateRange(record.start, record.end)),
      el('p', 'event-detail__session-time', agendaTimeDetail(record))
    );
    const sessionWhere = el('div', 'event-detail__session-where');
    sessionWhere.append(
      el('p', 'event-detail__session-place', record.location_text || 'No location'),
      el(
        'p',
        'event-detail__session-meta',
        [
          OCCURRENCE_LABEL[record.occurrence_state],
          record.hours != null ? `${record.hours} hours` : null,
          record.attendance_state || null
        ]
          .filter(Boolean)
          .join(' · ')
      )
    );
    session.append(sessionWhen, sessionWhere);
    const map = createViewOnMap({
      address: record.location_text ?? undefined,
      locationName: record.location_text ?? undefined
    });
    if (map?.el) session.append(map.el);

    function factRow(label: string, value: string): HTMLElement {
      const wrap = el('div', 'event-detail__fact');
      wrap.append(el('span', 'event-detail__fact-label', label), el('span', 'event-detail__fact-value', value));
      return wrap;
    }

    const purposeCard = el('section', 'event-detail__card');
    purposeCard.append(el('h2', 'event-detail__section-title', 'This session is for'));
    const linkedHost = el('div', 'event-detail__linked-host');
    linkedHost.append(el('p', 'event-detail__kicker', 'Knowledge'), el('p', undefined, 'Loading…'));
    purposeCard.append(linkedHost);
    const taskHost = el('div', 'event-detail__task-host');
    mountTaskLinkPanel({
      host: taskHost,
      heading: 'Learning task',
      relationshipType: 'learning_for',
      incompleteOperationId:
        record.learning_operation?.status === 'incomplete'
          ? record.learning_operation.operation_id
          : null,
      statusMessage:
        record.learning_operation?.status === 'committed'
          ? `Learning Task ${record.learning_operation.task_id}`
          : record.learning_operation?.status === 'incomplete'
            ? 'Learning task link is incomplete. Retry the existing link. Do not create a second task until this one lands.'
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
    purposeCard.append(taskHost);

    const whoCard = el('section', 'event-detail__card');
    whoCard.append(el('h2', 'event-detail__section-title', 'Who'));
    const peopleHost = el('div', 'event-detail__people-host');
    peopleHost.append(el('p', undefined, 'Loading…'));
    const evidence = el('div', 'event-detail__evidence');
    evidence.append(
      el('p', 'event-detail__kicker', 'Evidence'),
      factRow('Certificate', certificateSummary(record.certificate)),
      factRow('Accreditation', record.accreditation_category || 'Not specified')
    );
    whoCard.append(peopleHost, evidence);

    const columns = el('div', 'event-detail__columns');
    columns.append(purposeCard, whoCard);

    const tagCard = el('section', 'event-detail__card');
    mountTagAnythingSection(tagCard, `professional:event:${record.id}`);

    root.append(actionStatus, session, reschedulePanel, editPanel, columns, tagCard);
    canvas.append(root);

    void loadEntityRelationships(`professional:event:${record.id}`)
      .then((entries) => {
        const people = entries.filter((entry) => entry.endpoint?.kind === 'person');
        const other = entries.filter((entry) => entry.endpoint?.kind !== 'person');
        paintLinkedList(
          linkedHost,
          'Knowledge',
          other,
          'No provider, venue, or knowledge links yet.'
        );
        paintLinkedList(peopleHost, 'People', people, 'No people linked yet.');
      })
      .catch((err) => {
        const message = err instanceof ApiClientError ? err.message : 'Relationships unavailable.';
        linkedHost.replaceChildren(el('p', 'event-detail__kicker', 'Knowledge'), el('p', 'empty-state', message));
        peopleHost.replaceChildren(el('p', 'empty-state', message));
      });
  }

  await load();
}
