import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { createEntityPicker } from '../../design-kit/js/entity-picker.js';
import { mountTagAnythingSection } from '@/views/entity-tagger';
import { getMeeting, meetingStateAction, rescheduleMeeting, updateMeeting } from '@/api/meetings';
import {
  createTask,
  createUniversalLink,
  endUniversalLink,
  listUniversalLinksForEntity
} from '@/api/universal-links';
import { fetchPeopleDirectory, fetchPersonLedger, type DirectoryPersonRow } from '@/api/people-directory';
import { createLedgerItem, listLedgerForSources, patchLedger } from '@/api/ledger';
import { ApiClientError } from '@/api/client';
import { mountBlockPage, type BlockPageHandle } from '@/components/block-page';
import { mountComposeWhen } from '@/components/compose-when';
import { buildMeetingTaskLinks, roleLabel } from '@/views/meetings';
import { nextSwitchDelayMs, phaseFor, type CommPhase } from '@/lib/comm-phase';
import { blockPlainText, extractInlinePromises, resolvePromiseOwner } from '@/lib/inline-promises';
import { agendaToBlocks, extractDecisions, extractMentions } from '@/lib/meeting-notes';
import { groupRoom, type RoomCluster } from '@/lib/room';
import { createPillGroup } from '@/lib/pills';
import { searchPickerPeople } from '@/lib/person-picker';
import { utcIsoToWallLocal, wallLocalToUtcIso } from '@/lib/wall-time';
import { renderLoadError, showViewLoading } from '@/views/feedback';
import type { LedgerItem, MeetingRecord } from '@/domain/types';
import {
  clareBrief,
  clareDrafts,
  clareHandwriting,
  clareProposeNext,
  clarePurposeCheck,
  clareSummary,
  type ClareDraft
} from '@/api/clare-comms';
import { buildClareContext } from '@/lib/clare-context';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

type Attendee = { linkId: string; ref: string; role: string | null; name: string };
type OpenPromise = { id: string; text: string; direction: 'you_owe' | 'they_owe'; personName: string };

const STATE_LABEL: Record<string, string> = {
  scheduled: 'Scheduled',
  rescheduled: 'Rescheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No show'
};

function isOpenState(state: string): boolean {
  return state === 'scheduled' || state === 'rescheduled';
}

/** `Wed 30/09/26 · 3:30 pm – 4:30 pm` in the meeting's own zone. */
export function meetingWhenLabel(record: Pick<MeetingRecord, 'scheduled_start' | 'scheduled_end' | 'time_zone'>): string {
  const zone = record.time_zone || 'Australia/Sydney';
  const start = new Date(record.scheduled_start);
  if (Number.isNaN(start.getTime())) return '';
  const weekday = new Intl.DateTimeFormat('en-AU', { timeZone: zone, weekday: 'short' }).format(start);
  const clock = (value: Date) => new Intl.DateTimeFormat('en-AU', { timeZone: zone, hour: 'numeric', minute: '2-digit' }).format(value);
  const end = new Date(record.scheduled_end);
  const range = Number.isNaN(end.getTime()) || end <= start ? clock(start) : `${clock(start)} – ${clock(end)}`;
  return `${weekday} ${formatDisplayDate(start)} · ${range}`;
}

function minutesLabel(ms: number): string {
  const total = Math.max(0, Math.round(ms / 60_000));
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

async function loadAttendees(meetingRef: string): Promise<Attendee[]> {
  const links = await listUniversalLinksForEntity(meetingRef);
  return links.outgoing
    .filter((entry) => entry.link.relationship_type === 'attendee' && entry.link.status === 'current' && entry.endpoint)
    .map((entry) => ({
      linkId: entry.link.id,
      ref: entry.endpoint!.ref,
      role: entry.link.role ?? null,
      name: entry.endpoint!.display_label
    }));
}

async function loadDirectory(): Promise<DirectoryPersonRow[]> {
  try {
    const directory = await fetchPeopleDirectory();
    return [...directory.people, ...(directory.students ?? [])];
  } catch {
    return [];
  }
}

export async function renderMeetingPage(
  canvas: HTMLElement,
  id: string,
  options: { isCurrent: () => boolean; onTitleReady: (title: string) => void }
): Promise<void> {
  if (!options.isCurrent()) return;
  showViewLoading(canvas, 'Loading…');
  const meetingRef = `professional:meeting:${id}`;
  let record: MeetingRecord;
  let attendees: Attendee[];
  let directory: DirectoryPersonRow[];
  let ledger: LedgerItem[];
  try {
    const [meetingResult, loadedAttendees, loadedDirectory, ledgerResult] = await Promise.all([
      getMeeting(id),
      loadAttendees(meetingRef),
      loadDirectory(),
      listLedgerForSources([meetingRef])
    ]);
    record = meetingResult.meeting;
    attendees = loadedAttendees;
    directory = loadedDirectory;
    ledger = ledgerResult.items;
  } catch (err) {
    if (!options.isCurrent()) return;
    renderLoadError(canvas, err, () => void renderMeetingPage(canvas, id, options));
    return;
  }
  if (!options.isCurrent()) return;
  options.onTitleReady(record.title);

  const reload = () => renderMeetingPage(canvas, id, options);
  let people = attendees.map((attendee) => ({ ref: attendee.ref, name: attendee.name }));
  let manual = false;
  let phase: CommPhase = 'after';
  let blockPage: BlockPageHandle | null = null;
  let clock: ReturnType<typeof setTimeout> | null = null;
  let tick: ReturnType<typeof setInterval> | null = null;
  const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date());

  const clareContext = () => buildClareContext({
    title: record.title,
    kind: 'meeting',
    when: meetingWhenLabel(record),
    purpose: record.purpose,
    withPeople: [],
    attendees: people,
    previousSummaries: [],
    ledger,
    blocks: blockPage?.current() ?? record.blocks ?? [],
    summary: record.notes,
    todayKey,
    extra: { time_zone: record.time_zone }
  });

  // ── Header: what, when, where, state, edit ──
  const root = el('div', 'meeting-page');
  const head = el('header', 'meeting-page__head');
  const chips = el('div', 'comm-page__chips');
  chips.append(el('span', 'chip chip--meet', '● Meeting'));
  chips.append(el('span', `chip meeting-page__state is-${record.state}`, STATE_LABEL[record.state] ?? record.state));
  const facts = el('p', 'meeting-page__facts');
  facts.dataset.part = 'facts';
  facts.append(el('span', undefined, meetingWhenLabel(record)));
  if (record.location_text) facts.append(el('span', undefined, record.location_text));
  if (attendees.length) {
    const names = attendees.map((attendee) => attendee.name);
    facts.append(el('span', undefined, `with ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` +${names.length - 3}` : ''}`));
  }

  const headActions = el('div', 'meeting-page__head-actions');
  const editBtn = el('button', 'btn btn--secondary', 'Edit details') as HTMLButtonElement;
  editBtn.type = 'button';
  editBtn.dataset.part = 'edit-details';
  headActions.append(editBtn);
  const actionStatus = el('p', 'meeting-form__status');
  actionStatus.hidden = true;
  if (isOpenState(record.state)) {
    for (const [action, label] of [
      ['complete', 'Mark complete'],
      ['cancel', 'Cancel meeting'],
      ['no-show', 'No show']
    ] as const) {
      const button = el('button', 'btn btn--ghost', label) as HTMLButtonElement;
      button.type = 'button';
      button.dataset.stateAction = action;
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          await meetingStateAction(id, action);
          await reload();
        } catch (err) {
          actionStatus.hidden = false;
          actionStatus.textContent = err instanceof ApiClientError ? err.message : `${label} failed.`;
          button.disabled = false;
        }
      });
      headActions.append(button);
    }
  }

  const switcher = el('div', 'comm-page__phase');
  switcher.setAttribute('role', 'group');
  switcher.setAttribute('aria-label', 'Page phase');
  for (const value of ['before', 'during', 'after'] as const) {
    const button = el('button', 'comm-page__phase-btn', value[0]!.toUpperCase() + value.slice(1)) as HTMLButtonElement;
    button.type = 'button';
    button.dataset.setPhase = value;
    button.addEventListener('click', () => {
      manual = true;
      setPhase(value);
    });
    switcher.append(button);
  }
  const phaseNote = el('p', 'comm-page__phase-note');
  head.append(chips, facts, switcher, headActions, phaseNote, actionStatus);

  const editor = buildDetailsEditor();
  editor.hidden = true;
  editBtn.addEventListener('click', () => {
    editor.hidden = !editor.hidden;
    editBtn.setAttribute('aria-expanded', String(!editor.hidden));
    if (!editor.hidden) editor.querySelector<HTMLInputElement>('input')?.focus();
  });

  const purpose = el('section', 'meeting-page__purpose');
  purpose.dataset.part = 'purpose';
  purpose.append(el('b', undefined, 'Why you’re there'));
  const purposeText = el('textarea', 'meeting-page__purpose-text') as HTMLTextAreaElement;
  purposeText.value = record.purpose ?? '';
  purposeText.placeholder = 'What you want out of this meeting';
  purposeText.setAttribute('aria-label', 'Why you’re there');
  purposeText.addEventListener('change', async () => {
    record = (await updateMeeting(id, { purpose: purposeText.value })).meeting;
  });
  purpose.append(purposeText);

  const main = el('div', 'meeting-page__main');
  const side = el('aside', 'meeting-page__side');
  const roomHost = el('section', 'card');
  roomHost.dataset.part = 'room';
  let notesCardEl: HTMLElement | null = null;
  let taskLinks = buildMeetingTaskLinks(record, refreshTaskLinks);
  let prepPanel = taskLinks.querySelector<HTMLElement>('[data-part="task-link-preparation"]');
  let followPanel = taskLinks.querySelector<HTMLElement>('[data-part="task-link-follow_up"]');
  const tagCard = el('section', 'card meeting-page__tags');
  mountTagAnythingSection(tagCard, meetingRef);
  side.append(roomHost, taskLinks, tagCard);
  const grid = el('div', 'meeting-page__grid');
  grid.append(main, side);
  root.append(head, editor, purpose, grid);
  canvas.replaceChildren(root);
  paintRoom();

  // ── Details editor ──
  function buildDetailsEditor(): HTMLElement {
    const card = el('section', 'event-detail__card event-compose meeting-page__editor');
    card.dataset.part = 'details-editor';
    card.append(el('h2', 'event-detail__section-title', 'Details'));
    const form = el('form', 'event-form event-compose') as HTMLFormElement;
    form.noValidate = true;
    const titleInput = el('input', 'event-compose__title') as HTMLInputElement;
    titleInput.type = 'text';
    titleInput.value = record.title;
    titleInput.setAttribute('aria-label', 'Title');
    const when = mountComposeWhen({
      start: utcIsoToWallLocal(record.scheduled_start, record.time_zone),
      end: utcIsoToWallLocal(record.scheduled_end, record.time_zone)
    });
    const where = el('input') as HTMLInputElement;
    where.type = 'text';
    where.value = record.location_text ?? '';
    where.placeholder = 'Room, school or link';
    where.setAttribute('aria-label', 'Location');
    const reason = el('input') as HTMLInputElement;
    reason.type = 'text';
    reason.placeholder = 'Optional';
    reason.setAttribute('aria-label', 'Reason for the new time');
    const field = (label: string, control: HTMLElement) => {
      const wrap = el('div', 'event-compose__field');
      wrap.append(el('span', 'event-compose__label', label), control);
      return wrap;
    };
    when.times.append(field('Where', where), field('Why the time moved', reason));
    const status = el('p', 'meeting-form__status');
    status.hidden = true;
    const save = el('button', 'btn btn--primary', 'Save details') as HTMLButtonElement;
    save.type = 'submit';
    const discard = el('button', 'btn btn--ghost', 'Discard') as HTMLButtonElement;
    discard.type = 'button';
    discard.addEventListener('click', () => {
      card.hidden = true;
      editBtn.setAttribute('aria-expanded', 'false');
    });
    const footer = el('div', 'event-compose__footer');
    const buttons = el('div', 'event-compose__actions');
    buttons.append(save);
    footer.append(discard, status, buttons);
    form.append(field('Title', titleInput), when.root, footer);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      status.hidden = true;
      save.disabled = true;
      try {
        if (!titleInput.value.trim()) throw new Error('Give the meeting a title.');
        const wall = when.value();
        const start = wallLocalToUtcIso(wall.start, record.time_zone);
        const end = wallLocalToUtcIso(wall.end, record.time_zone);
        if (Date.parse(end) <= Date.parse(start)) throw new Error('The meeting has to end after it starts.');
        const nextLocation = where.value.trim() || null;
        if (titleInput.value.trim() !== record.title || nextLocation !== (record.location_text ?? null)) {
          record = (await updateMeeting(id, { title: titleInput.value.trim(), location_text: nextLocation })).meeting;
        }
        if (Date.parse(start) !== Date.parse(record.scheduled_start) || Date.parse(end) !== Date.parse(record.scheduled_end)) {
          record = (await rescheduleMeeting(id, {
            scheduled_start: start,
            scheduled_end: end,
            time_zone: record.time_zone,
            reason: reason.value.trim() || null
          })).meeting;
        }
        await reload();
      } catch (err) {
        status.hidden = false;
        status.textContent = err instanceof Error ? err.message : 'Save failed.';
        save.disabled = false;
      }
    });
    card.append(form);
    return card;
  }

  // ── The room: attendees by organisation, add / remove ──
  function paintRoom(): void {
    const room = groupRoom(attendees, directory, new Date());
    roomHost.replaceChildren(roomCard(room, attendees, async (attendee) => {
      await endUniversalLink(attendee.linkId);
      attendees = attendees.filter((entry) => entry.linkId !== attendee.linkId);
      people = attendees.map((entry) => ({ ref: entry.ref, name: entry.name }));
      paintRoom();
    }));
    roomHost.append(addPersonRow());
  }

  function addPersonRow(): HTMLElement {
    const wrap = el('div', 'room__add');
    const role = createPillGroup({
      label: 'Role for the person you add',
      choices: [['', 'No role'], ['chair', 'Chair'], ['minute_taker', 'Minute taker']] as const,
      value: ''
    });
    const input = el('input', 'room__add-input') as HTMLInputElement;
    input.type = 'text';
    input.placeholder = 'Add someone';
    input.setAttribute('aria-label', 'Add attendee');
    const status = el('p', 'meeting-form__status');
    status.hidden = true;
    const picker = createEntityPicker({
      input,
      allowedKinds: ['person'],
      emptyText: 'No matching people.',
      mode: 'field',
      search: (query, signal) => searchPickerPeople(query, signal),
      onSelect: async (item) => {
        if (attendees.some((attendee) => attendee.ref === item.ref)) {
          input.value = '';
          return;
        }
        try {
          const picked = role.get() || null;
          const { link } = await createUniversalLink({
            source_ref: meetingRef,
            target_ref: item.ref,
            relationship_type: 'attendee',
            role: picked
          });
          attendees = [...attendees, { linkId: link.id, ref: item.ref, role: picked, name: item.display_label }];
          people = attendees.map((entry) => ({ ref: entry.ref, name: entry.name }));
          paintRoom();
        } catch (err) {
          status.hidden = false;
          status.textContent = err instanceof ApiClientError ? err.message : 'Could not add them.';
        }
      }
    });
    wrap.append(input, picker.root, role.root, status);
    return wrap;
  }

  async function refreshTaskLinks(): Promise<void> {
    const { meeting } = await getMeeting(id);
    record = {
      ...record,
      ...meeting,
      blocks: blockPage?.current() ?? meeting.blocks ?? record.blocks,
      decisions: record.decisions ?? meeting.decisions
    };
    const next = buildMeetingTaskLinks(record, refreshTaskLinks);
    taskLinks.replaceWith(next);
    taskLinks = next;
    prepPanel = taskLinks.querySelector<HTMLElement>('[data-part="task-link-preparation"]');
    followPanel = taskLinks.querySelector<HTMLElement>('[data-part="task-link-follow_up"]');
    applyPhaseChrome();
  }

  function applyPhaseChrome(): void {
    root.dataset.phase = phase;
    for (const button of switcher.querySelectorAll<HTMLButtonElement>('[data-set-phase]')) {
      button.setAttribute('aria-pressed', String(button.dataset.setPhase === phase));
    }
    phaseNote.textContent = manual ? 'Switched by hand' : autoNote(phase);
    if (prepPanel) prepPanel.hidden = phase === 'after';
    if (followPanel) followPanel.hidden = phase === 'before';
  }

  // ── Phases ──
  function setPhase(next: CommPhase): void {
    const alreadyPainted = next === phase && Boolean(blockPage);
    phase = next;
    applyPhaseChrome();
    if (tick !== null) clearInterval(tick);
    tick = null;
    if (alreadyPainted) return;
    // Keep the live notes editor. Disposing it on recycle/autosave left the
    // remounted block as a preview with no contenteditable surface.
    if (notesCardEl?.parentElement === main) notesCardEl.remove();
    main.replaceChildren();
    if (next === 'before') paintBefore();
    else if (next === 'during') paintDuring();
    else paintAfter();
  }

  function autoNote(next: CommPhase): string {
    if (next === 'before') return 'Prep. Switches to During by itself at the start time.';
    if (next === 'during') return 'Capture. Switches to After at the end time, or when you tap End.';
    return 'Wrap-up.';
  }

  function mountNotes(host: HTMLElement): void {
    let n = 0;
    const seeded = (record.blocks ?? []).length
      ? (record.blocks as never[])
      : (agendaToBlocks(record.agenda ?? '', () => `block_${++n}`) as never[]);
    blockPage = mountBlockPage(host, {
      blocks: seeded,
      editable: true,
      onSave: async (blocks) => {
        const found = extractDecisions(blocks as Array<{ block_type: string; content?: unknown }>);
        const decisions = found.map((decision, index) => ({ id: `d_${index + 1}`, ...decision }));
        record = (await updateMeeting(id, { blocks, decisions })).meeting;
        await syncPromises(blocks);
        paintActions();
        paintMentions(blocks);
      }
    });
  }

  function notesCard(heading: string, hint: string): HTMLElement {
    if (!notesCardEl) {
      notesCardEl = el('section', 'card meeting-page__notes-card');
      notesCardEl.dataset.part = 'notes';
      const body = el('div', 'meeting-page__notes');
      notesCardEl.append(el('h3', undefined, heading), el('p', 'muted meeting-page__hint', hint), body);
      mountNotes(body);
    } else {
      notesCardEl.querySelector('h3')!.textContent = heading;
      notesCardEl.querySelector('.meeting-page__hint')!.textContent = hint;
    }
    return notesCardEl;
  }

  const actions = el('section', 'card');
  actions.dataset.part = 'actions';
  const mentions = el('section', 'card');
  mentions.dataset.part = 'mentions';

  function paintBefore(): void {
    main.append(briefCard(), openPromisesCard(), notesCard(
      'Agenda and notes',
      'Each agenda item is a heading. Add what you want to raise under it.'
    ));
  }

  function paintDuring(): void {
    main.append(liveStrip(), notesCard(
      'Notes',
      'Start a line with »me to log something you owe, »Name for something they owe, ✓ for a decision, @Name for who said what.'
    ), actions, mentions);
    paintActions();
    paintMentions(blockPage?.current() ?? record.blocks ?? []);
  }

  function paintAfter(): void {
    if (record.purpose) main.append(purposeCheckCard());
    main.append(wrapUpCard(), actions, notesCard('Notes', 'Your notes from the meeting. Still editable.'), mentions);
    paintActions();
    paintMentions(blockPage?.current() ?? record.blocks ?? []);
  }

  function clareCard(part: string, title: string): { card: HTMLElement; body: HTMLElement } {
    const card = el('section', 'card clare');
    card.dataset.part = part;
    const body = el('div', 'clare__body');
    card.append(el('p', 'clare__who', `✦ Clare · ${title}`), body);
    return { card, body };
  }

  function showClareError(body: HTMLElement, err: unknown, retry: () => void): void {
    body.replaceChildren(el('p', 'muted', err instanceof Error ? err.message : 'Clare could not finish.'));
    const again = el('button', 'btn btn--ghost', 'Try again') as HTMLButtonElement;
    again.type = 'button';
    again.addEventListener('click', retry);
    body.append(again);
  }

  function briefCard(): HTMLElement {
    const { card, body } = clareCard('clare-brief', 'brief');
    const start = el('button', 'btn btn--secondary', 'Brief me') as HTMLButtonElement;
    start.type = 'button';
    start.dataset.part = 'brief-me';
    const load = () => {
      body.replaceChildren(el('p', 'muted', 'Clare is reading your notes and promises…'));
      clareBrief(clareContext()).then((brief) => {
        body.replaceChildren();
        const list = el('ol', 'clare__points');
        for (const point of brief.points) {
          const li = el('li', undefined, point.text);
          li.append(el('span', 'src', ` · ${point.source}`));
          list.append(li);
        }
        body.append(list);
        if (brief.owed_line) body.append(el('p', 'muted', brief.owed_line));
      }, (err) => showClareError(body, err, load));
    };
    start.addEventListener('click', load);
    body.append(el('p', 'muted', 'Three things worth knowing before you walk in, from the people in the room.'), start);
    return card;
  }

  function openPromisesCard(): HTMLElement {
    const card = el('section', 'card');
    card.dataset.part = 'open-promises';
    card.append(el('h3', undefined, 'Open with these people'));
    const list = el('div', 'meeting-page__open');
    card.append(list);
    if (!attendees.length) {
      list.append(el('p', 'muted', 'Add people to the room to see what’s open between you.'));
      return card;
    }
    list.append(el('p', 'muted', 'Loading…'));
    void Promise.all(attendees.slice(0, 8).map(async (attendee) => {
      try {
        const ledgerFor = await fetchPersonLedger(attendee.ref);
        const open = (items: typeof ledgerFor.you_owe, direction: OpenPromise['direction']) => items
          .filter((item) => !item.status || item.status === 'open')
          .map((item) => ({ id: item.id, text: item.text, direction, personName: attendee.name }));
        return [...open(ledgerFor.you_owe, 'you_owe'), ...open(ledgerFor.they_owe, 'they_owe')];
      } catch {
        return [];
      }
    })).then((groups) => {
      const seen = new Set(ledger.map((item) => item.id));
      const items = groups.flat().filter((item) => !seen.has(item.id) && seen.add(item.id));
      list.replaceChildren();
      if (!items.length) list.append(el('p', 'muted', 'Nothing open with anyone in the room.'));
      for (const item of items) list.append(tickRow(item));
    });
    return card;
  }

  function tickRow(item: OpenPromise): HTMLElement {
    const row = el('button', 'tick') as HTMLButtonElement;
    row.type = 'button';
    row.dataset.ledgerId = item.id;
    const box = el('span', 'tick__box');
    const who = item.direction === 'you_owe' ? `You → ${item.personName}` : item.personName;
    row.append(box, el('span', 'tick__text', item.text), el('span', `who-tag ${item.direction === 'you_owe' ? 'who-me' : 'who-them'}`, who));
    let done = false;
    row.addEventListener('click', async () => {
      done = !done;
      await patchLedger(item.id, done ? { status: 'done', checked_in_ref: meetingRef } : { status: 'open', checked_in_ref: null });
      row.classList.toggle('is-done', done);
      box.textContent = done ? '✓' : '';
    });
    return row;
  }

  function liveStrip(): HTMLElement {
    const strip = el('div', 'live-strip');
    strip.dataset.part = 'live-strip';
    const timer = el('span', 'live-strip__timer');
    const paintTimer = () => {
      const now = Date.now();
      const start = Date.parse(record.scheduled_start);
      const end = Date.parse(record.scheduled_end);
      if (now < start) timer.textContent = `Starts in ${minutesLabel(start - now)}`;
      else if (now < end) timer.textContent = `${minutesLabel(now - start)} in · ${minutesLabel(end - now)} left`;
      else timer.textContent = `Ran ${minutesLabel(now - end)} over`;
    };
    paintTimer();
    tick = setInterval(() => {
      if (!strip.isConnected) {
        if (tick !== null) clearInterval(tick);
        return;
      }
      paintTimer();
    }, 30_000);

    const end = el('button', 'btn btn--ghost', 'End ›') as HTMLButtonElement;
    end.type = 'button';
    end.dataset.part = 'end-meeting';
    end.addEventListener('click', async () => {
      end.disabled = true;
      await blockPage?.flush();
      if (isOpenState(record.state)) {
        try {
          record = (await meetingStateAction(id, 'complete')).meeting;
        } catch {
          // The wrap-up still opens; the state buttons stay in the header.
        }
      }
      manual = true;
      setPhase('after');
    });

    const photo = el('label', 'btn btn--ghost', '✎ Read a photo');
    const file = el('input') as HTMLInputElement;
    file.type = 'file';
    file.accept = 'image/jpeg,image/png,image/webp';
    file.hidden = true;
    photo.append(file);
    file.addEventListener('change', async () => {
      const picked = file.files?.[0];
      if (!picked || !blockPage) return;
      photo.firstChild!.textContent = 'Reading…';
      try {
        const { text } = await clareHandwriting(picked);
        const stamp = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', hour: 'numeric', minute: '2-digit' }).format(new Date());
        const html = `<p><em>From your handwriting · ${stamp}</em></p>` + text.split('\n').map((lineText) => `<p>${lineText.replace(/[<&>]/g, (c) => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;' })[c]!)}</p>`).join('');
        blockPage.append([{ id: `hand_${Date.now()}`, block_type: 'rich_text', variant: 'medium', content: { html } }]);
      } catch (err) {
        strip.append(el('span', 'muted', err instanceof Error ? err.message : 'Clare could not read that photo.'));
      } finally {
        photo.firstChild!.textContent = '✎ Read a photo';
        file.value = '';
      }
    });
    strip.append(el('span', 'live-strip__rec', 'Live'), timer, photo, end);
    return strip;
  }

  function purposeCheckCard(): HTMLElement {
    const { card, body } = clareCard('purpose-check-card', 'did you get what you came for?');
    const check = el('button', 'btn btn--secondary', 'Check against your purpose') as HTMLButtonElement;
    check.type = 'button';
    check.dataset.part = 'purpose-check';
    const out = el('div');
    check.addEventListener('click', async () => {
      check.disabled = true;
      try {
        const verdict = await clarePurposeCheck(clareContext());
        out.replaceChildren(el('p', verdict.met ? 'quiet-link' : 'muted', `${verdict.met ? '✓ Met' : '◐ Not yet'}. ${verdict.note}`));
        if (!verdict.met && people[0]) {
          const carry = el('button', 'btn btn--ghost', 'Carry it to next time') as HTMLButtonElement;
          carry.type = 'button';
          carry.dataset.part = 'carry-purpose';
          carry.addEventListener('click', async () => {
            carry.disabled = true;
            await createLedgerItem({ direction: 'you_owe', person_ref: people[0]!.ref, text: `Carried: ${record.purpose}`, comm_ref: meetingRef });
            carry.replaceWith(el('span', 'quiet-link', '✓ It will open your next meeting with them'));
          });
          out.append(carry);
        }
      } catch (err) {
        out.replaceChildren(el('p', 'muted', err instanceof Error ? err.message : 'Clare could not check.'));
      } finally {
        check.disabled = false;
      }
    });
    body.append(check, out);
    return card;
  }

  function wrapUpCard(): HTMLElement {
    const card = el('section', 'card meeting-page__wrap');
    card.dataset.part = 'wrap-up';
    card.append(el('h3', undefined, 'Summary'));
    const text = el('textarea', 'comm-page__summary-text') as HTMLTextAreaElement;
    text.value = record.notes ?? '';
    text.placeholder = 'What happened, in a few lines. Clare can draft it from your notes.';
    text.setAttribute('aria-label', 'Summary');
    text.addEventListener('change', async () => {
      record = (await updateMeeting(id, { notes: text.value || null })).meeting;
    });

    const row = el('div', 'clare-row');
    const summarise = el('button', 'btn btn--secondary', '✦ Summarise') as HTMLButtonElement;
    summarise.type = 'button';
    summarise.dataset.part = 'clare-summarise';
    const draftsBtn = el('button', 'btn btn--secondary', '✦ Draft follow-ups') as HTMLButtonElement;
    draftsBtn.type = 'button';
    draftsBtn.dataset.part = 'clare-drafts';
    draftsBtn.disabled = !attendees.length;
    const nextBtn = el('button', 'btn btn--ghost', '✦ Suggest next meeting') as HTMLButtonElement;
    nextBtn.type = 'button';
    nextBtn.dataset.part = 'clare-next';
    row.append(summarise, draftsBtn, nextBtn);
    const found = el('div', 'clare-found');
    const draftsHost = el('div', 'clare-drafts');

    summarise.addEventListener('click', async () => {
      summarise.disabled = true;
      try {
        const out = await clareSummary(clareContext());
        text.value = out.summary;
        record = (await updateMeeting(id, { notes: out.summary })).meeting;
        found.replaceChildren();
        if (!out.promises.length) return;
        found.append(el('h4', undefined, 'Promises Clare found'));
        const boxes: Array<[HTMLInputElement, (typeof out.promises)[number]]> = [];
        for (const promise of out.promises) {
          const label = el('label', 'clare-found__item');
          const box = el('input') as HTMLInputElement;
          box.type = 'checkbox';
          box.checked = true;
          const due = promise.due ? ` · due ${formatDisplayDate(promise.due)}` : '';
          label.append(box, document.createTextNode(` ${promise.direction === 'you_owe' ? 'You' : 'They'}: ${promise.text}${due}`));
          found.append(label);
          boxes.push([box, promise]);
        }
        const add = el('button', 'btn btn--primary', 'Add to the ledger') as HTMLButtonElement;
        add.type = 'button';
        add.dataset.part = 'clare-add-promises';
        add.addEventListener('click', async () => {
          add.disabled = true;
          for (const [box, promise] of boxes) {
            if (!box.checked) continue;
            const { item, created } = await createLedgerItem({ ...promise, comm_ref: meetingRef });
            if (created) ledger.push(item);
          }
          found.replaceChildren(el('span', 'quiet-link', '✓ Added'));
          paintActions();
        });
        found.append(add);
      } catch (err) {
        showClareError(found, err, () => summarise.click());
      } finally {
        summarise.disabled = false;
      }
    });

    draftsBtn.addEventListener('click', async () => {
      draftsBtn.disabled = true;
      try {
        const { drafts } = await clareDrafts(clareContext());
        draftsHost.replaceChildren();
        for (const draft of drafts) draftsHost.append(draftCard(draft));
        if (!drafts.length) draftsHost.append(el('p', 'muted', 'Nobody here needs a follow-up.'));
      } catch (err) {
        showClareError(draftsHost, err, () => draftsBtn.click());
      } finally {
        draftsBtn.disabled = false;
      }
    });

    nextBtn.addEventListener('click', async () => {
      nextBtn.disabled = true;
      try {
        const next = await clareProposeNext(clareContext());
        nextBtn.replaceWith(el('span', 'muted', `Proposed on your calendar: ${formatDisplayDate(next.date)} at ${next.time}. Accept or dismiss it there.`));
      } catch (err) {
        nextBtn.disabled = false;
        row.append(el('span', 'muted', err instanceof Error ? err.message : 'Clare could not suggest a time.'));
      }
    });

    card.append(text, row, found, draftsHost);
    return card;
  }

  function draftCard(draft: ClareDraft): HTMLElement {
    const card = el('section', 'draft');
    card.append(el('p', 'draft__to', `To ${draft.to} · ${draft.subject}`));
    const body = el('textarea', 'draft__body') as HTMLTextAreaElement;
    body.value = draft.body;
    body.setAttribute('aria-label', `Draft to ${draft.to}`);
    const copy = el('button', 'btn btn--primary', 'Copy') as HTMLButtonElement;
    copy.type = 'button';
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(body.value);
        copy.textContent = 'Copied';
      } catch {
        body.select();
      }
    });
    card.append(body, copy);
    return card;
  }

  async function syncPromises(blocks: unknown[]): Promise<void> {
    for (const promise of extractInlinePromises(blockPlainText(blocks))) {
      const owner = resolvePromiseOwner(promise.owner, people);
      if (!owner) continue;
      const { item, created } = await createLedgerItem({ ...owner, text: promise.text, comm_ref: meetingRef });
      if (created) ledger.push(item);
    }
  }

  function paintActions(): void {
    actions.replaceChildren(el('h3', undefined, 'Actions'));
    const open = ledger.filter((entry) => entry.status === 'open' && entry.comm_ref === meetingRef);
    const decisions = record.decisions ?? [];
    if (!open.length && !decisions.length) {
      actions.append(el('p', 'muted meeting-page__hint', phase === 'during'
        ? 'Nothing yet. Lines starting »me, »Name or ✓ in your notes show up here.'
        : 'No promises or decisions came out of this meeting.'));
      return;
    }
    const cols = el('div', 'ledger');
    const mine = el('div', 'ledger__col');
    const theirs = el('div', 'ledger__col');
    mine.append(el('p', 'ledger__head is-me', 'I owe'));
    theirs.append(el('p', 'ledger__head is-them', 'They owe · checked next time'));
    for (const item of open) {
      const row = el('div', 'ledger__row');
      row.append(el('span', 'ledger__text', item.text));
      if (item.direction === 'you_owe') {
        const toggle = el('button', 'switch') as HTMLButtonElement;
        toggle.type = 'button';
        toggle.setAttribute('role', 'switch');
        toggle.setAttribute('aria-label', 'Make it a task');
        toggle.title = item.task_ref ? 'Task made' : 'Make it a task';
        toggle.setAttribute('aria-checked', String(Boolean(item.task_ref)));
        toggle.disabled = Boolean(item.task_ref);
        toggle.addEventListener('click', async () => {
          toggle.disabled = true;
          const task = await createTask({ title: item.text });
          Object.assign(item, (await patchLedger(item.id, { task_ref: `tasks:task:${task.id}` })).item);
          toggle.setAttribute('aria-checked', 'true');
          toggle.title = 'Task made';
        });
        row.append(toggle);
        mine.append(row);
      } else {
        theirs.append(row);
      }
    }
    if (mine.children.length === 1) mine.append(el('p', 'muted', 'Nothing.'));
    if (theirs.children.length === 1) theirs.append(el('p', 'muted', 'Nothing.'));
    cols.append(mine, theirs);
    actions.append(cols);
    if (decisions.length) {
      const list = el('div', 'meeting-page__decisions');
      list.append(el('p', 'ledger__head', 'Decisions'));
      for (const decision of decisions) {
        list.append(el('div', 'meeting-page__decision', `✓ ${decision.text}${decision.agenda_heading ? ` · ${decision.agenda_heading}` : ''}`));
      }
      actions.append(list);
    }
  }

  function paintMentions(blocks: unknown[]): void {
    mentions.replaceChildren(el('h3', undefined, 'Who said what'));
    const found = extractMentions(blockPlainText(blocks));
    if (!found.length) {
      mentions.append(el('p', 'muted meeting-page__hint', 'Start a line in your notes with @Name and it’s filed under that person here.'));
      return;
    }
    for (const mention of found) {
      const block = el('div', 'meeting-page__mention');
      block.append(el('b', undefined, mention.name));
      for (const line of mention.lines) block.append(el('p', undefined, line));
      const known = people.some((person) => person.name.toLowerCase().startsWith(mention.name.toLowerCase()));
      if (!known) {
        const add = el('a', 'btn btn--ghost', 'Add to People') as HTMLAnchorElement;
        add.href = '#/people';
        block.append(add);
      }
      mentions.append(block);
    }
  }

  const slot = () => ({ scheduled_start: record.scheduled_start, scheduled_end: record.scheduled_end });
  function scheduleClock(): void {
    if (clock !== null) clearTimeout(clock);
    const delay = nextSwitchDelayMs(slot(), new Date());
    if (delay === null) return;
    clock = setTimeout(() => {
      if (!root.isConnected) return;
      if (!manual) setPhase(phaseFor(slot(), new Date()));
      scheduleClock();
    }, delay);
  }

  setPhase(phaseFor(slot(), new Date()));
  scheduleClock();
}

function roomCard(room: RoomCluster[], attendees: Attendee[], onRemove: (attendee: Attendee) => Promise<void>): DocumentFragment {
  const frag = document.createDocumentFragment();
  const count = room.reduce((total, cluster) => total + cluster.people.length, 0);
  frag.append(el('h3', undefined, count ? `The room · ${count}` : 'The room'));
  if (!count) frag.append(el('p', 'muted', 'Nobody added yet.'));
  for (const cluster of room) {
    const group = el('div', 'room__org');
    group.append(el('p', 'room__org-name', cluster.organisation ?? 'No organisation yet'));
    for (const person of cluster.people) {
      const attendee = attendees.find((entry) => entry.ref === person.ref);
      const row = el('div', 'room__person');
      row.dataset.warmth = String(person.warmthDots);
      row.append(el('span', `room__initials${person.student ? ' room__initials--student' : ''}`, person.initials), el('span', 'room__name', person.name));
      const role = roleLabel(person.role);
      if (role) row.append(el('span', 'muted', role));
      if (person.isNew) row.append(el('span', 'chip chip--warn', 'New to you'));
      if (!person.known) {
        const add = el('a', 'quiet-link room__add-people', 'Add to People') as HTMLAnchorElement;
        add.href = '#/people';
        row.append(add);
      }
      const dots = el('span', 'room__warmth');
      dots.setAttribute('aria-label', `Warmth ${person.warmthDots} of 3`);
      for (let i = 1; i <= 3; i += 1) dots.append(el('i', i <= person.warmthDots ? 'is-on' : ''));
      row.append(dots);
      if (attendee) {
        const remove = el('button', 'hub-icon-btn room__remove', '×') as HTMLButtonElement;
        remove.type = 'button';
        remove.setAttribute('aria-label', `Remove ${person.name}`);
        remove.title = `Remove ${person.name}`;
        remove.addEventListener('click', async () => {
          remove.disabled = true;
          try {
            await onRemove(attendee);
          } catch {
            remove.disabled = false;
          }
        });
        row.append(remove);
      }
      group.append(row);
    }
    frag.append(group);
  }
  return frag;
}
