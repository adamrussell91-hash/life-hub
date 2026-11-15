/**
 * One person's mentoring page: how the operator mentors them, the sessions,
 * tasks and open items between the two, private notes, and the blocks that
 * go on the person's own read-only page.
 *
 * The page reads what Professional already holds about the person and adds
 * one saved record, the mentorship. That record is made the first time
 * something needs saving, so opening the page for someone new writes nothing.
 * Completing a mentorship changes its status and nothing else: every session,
 * note, task and shared block stays where it is.
 */

import {
  createMentorship,
  getMentorshipForPerson,
  loadMentorshipShare,
  publishMentorshipShare,
  stopMentorshipShare,
  updateMentorship,
  type Mentorship,
  type MentorshipFields,
  type MentorshipKind,
  type MentorshipLeftOff,
  type MentorshipShare
} from '@/api/mentorships';
import { ApiClientError } from '@/api/client';
import { listMeetings } from '@/api/meetings';
import { fetchSelfPerson } from '@/api/network-ecology';
import {
  fetchPeopleDirectory,
  fetchPeopleDirectorySnapshot,
  fetchPersonLedger,
  peekPeopleDirectory,
  type DirectoryPersonRow,
  type LedgerResponse,
  type PeopleDirectoryResponse
} from '@/api/people-directory';
import { addPersonTask, loadPersonTasks, setPersonTaskDone, type PersonTask } from '@/api/person-tasks';
import { listUniversalLinksForEntities, type UniversalLinkEntry } from '@/api/universal-links';
import { meetingRoute, personRoute } from '@/app/router';
import { mountBlockPage, type BlockPageHandle } from '@/components/block-page';
import { renderMentoringBadge, type BadgeOrganisation } from '@/components/mentoring-badge';
import { buildPersonMenu, type PersonMenuItem } from '@/components/person-menu';
import {
  buildMentoringCards,
  mentoringBadgeFor,
  mentoringSessions,
  relativeDays,
  type MentoringCard,
  type MentoringSession
} from '@/domain/mentoring-model';
import { isValidOrganisationId } from '@/domain/ids';
import type { MeetingRecord } from '@/domain/types';
import { sheetUrl } from '@/guides/share-sheet';
import { badgeOrganisations } from '@/views/mentoring';
import { errorMessage, renderLoadError, showViewLoading } from '@/views/feedback';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';

export interface MentoringPersonOptions {
  isCurrent?: () => boolean;
  now?: () => Date;
  /** The person's name, for the page title, once it is known. */
  onTitleReady?: (title: string) => void;
}

const MEETING_PREFIX = 'professional:meeting:';
/** Sessions shown before "Show all". */
const SESSIONS_SHOWN = 5;

type BlockList = Parameters<typeof mountBlockPage>[1]['blocks'];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, className: string, part?: string): HTMLButtonElement {
  const node = el('button', className, label);
  node.type = 'button';
  if (part) node.dataset.part = part;
  return node;
}

const ORG_PREFIX = 'shared:organisation:';

/** Only a full organisation record can lend a crest; the server refuses any other ref. */
function crestRef(ref: string | null | undefined): string | null {
  return ref && ref.startsWith(ORG_PREFIX) && isValidOrganisationId(ref.slice(ORG_PREFIX.length)) ? ref : null;
}

/** Today as the local calendar day, `YYYY-MM-DD`. */
export function localDay(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** What a publish left off, in the words the meeting share sheet uses. */
export function mentoringLeftOffLine(left: MentorshipLeftOff | null): string {
  if (!left) return '';
  const count = (n: number, one: string, many: string) => (n ? `${n} ${n === 1 ? one : many}` : '');
  const parts = [
    count(left.blocks, 'block that takes answers', 'blocks that take answers'),
    count(left.promise_lines, 'promise line', 'promise lines'),
    count(left.voice_unpublished, 'voice note you haven’t published', 'voice notes you haven’t published')
  ].filter(Boolean);
  return parts.length ? `Left off the page: ${parts.join(', ')}.` : '';
}

/** Upcoming sessions soonest first, then past ones latest first. */
export function orderSessions(sessions: MentoringSession[], now: Date): MentoringSession[] {
  const nowMs = now.getTime();
  const upcoming = sessions.filter((entry) => Date.parse(entry.start) > nowMs);
  const past = sessions.filter((entry) => Date.parse(entry.start) <= nowMs).reverse();
  return [...upcoming, ...past];
}

interface Dialog {
  card: HTMLElement;
  close(): void;
}

/** A small modal card over the page. Esc and a click outside close it. */
function openDialog(title: string, returnFocus: HTMLElement | null): Dialog {
  const overlay = el('div', 'confirm-card-overlay mentoring-dialog');
  const card = el('section', 'confirm-card mentoring-dialog__card');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-label', title);
  card.append(el('h2', 'mentoring-dialog__title', title));
  overlay.append(card);
  function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') close();
  }
  function close(): void {
    document.removeEventListener('keydown', onKey);
    overlay.remove();
    returnFocus?.focus();
  }
  overlay.addEventListener('mousedown', (event) => {
    if (event.target === overlay) close();
  });
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  return { card, close };
}

function field(label: string, control: HTMLElement, hint?: string): HTMLLabelElement {
  const wrap = el('label', 'hub-field mentoring-dialog__field');
  wrap.append(el('span', 'hub-label', label), control);
  if (hint) wrap.append(el('span', 'hub-field__hint', hint));
  return wrap;
}

export async function renderMentoringPersonView(
  canvas: HTMLElement,
  personId: string,
  options: MentoringPersonOptions = {}
): Promise<void> {
  const isCurrent = options.isCurrent ?? (() => true);
  const now = options.now?.() ?? new Date();
  const personRef = `shared:person:${personId}`;
  showViewLoading(canvas, 'Loading mentoring…');

  // ── Load ────────────────────────────────────────────────────────────────
  let directory: PeopleDirectoryResponse;
  let row: DirectoryPersonRow;
  let meetings: MeetingRecord[];
  let record: Mentorship | null;
  let linkEntries: UniversalLinkEntry[] = [];
  try {
    const find = (source: PeopleDirectoryResponse | null) =>
      source ? [...source.people, ...(source.students ?? [])].find((entry) => entry.id === personId) ?? null : null;
    const quick = peekPeopleDirectory() ?? (await fetchPeopleDirectorySnapshot().catch(() => null));
    const [meetingData, mentorshipData, links, found] = await Promise.all([
      listMeetings(),
      getMentorshipForPerson(personRef),
      listUniversalLinksForEntities([personRef]).catch(() => null),
      // The saved copy is enough for a name and a role; only a person it lacks waits for the full scan.
      find(quick) ? Promise.resolve(quick!) : fetchPeopleDirectory()
    ]);
    const person = find(found);
    if (!isCurrent()) return;
    if (!person) {
      canvas.replaceChildren(el('p', 'empty-state', 'This person isn’t in People.'));
      const back = el('a', 'btn btn--secondary', 'Back to Mentoring');
      back.href = '#/mentoring';
      canvas.append(back);
      return;
    }
    directory = found;
    row = person;
    meetings = meetingData.meetings;
    record = mentorshipData.mentorship;
    const entry = links?.results?.[personRef];
    if (entry && !entry.error) linkEntries = [...(entry.outgoing ?? []), ...(entry.incoming ?? [])];
  } catch (err) {
    if (!isCurrent()) return;
    renderLoadError(canvas, err, () => void renderMentoringPersonView(canvas, personId, options));
    return;
  }
  options.onTitleReady?.(row.display_name);

  const organisations: Map<string, BadgeOrganisation> = badgeOrganisations(directory);
  const linkedMeetingIds = new Set(
    linkEntries
      .map((entry) => entry.endpoint?.ref ?? '')
      .filter((ref) => ref.startsWith(MEETING_PREFIX))
      .map((ref) => ref.slice(MEETING_PREFIX.length))
  );
  const sessions = mentoringSessions(personRef, meetings, linkedMeetingIds);
  const firstName = row.display_name.trim().split(/\s+/)[0] || row.display_name;

  let ledger: LedgerResponse | null = null;
  let ledgerFailed = false;
  let tasks: PersonTask[] | null = null;
  let tasksFailed = false;
  let share: MentorshipShare | null = null;
  let leftOff: MentorshipLeftOff | null = null;
  let sharedEdited = false;
  let notesPage: BlockPageHandle | null = null;
  let sharedPage: BlockPageHandle | null = null;

  function card(): MentoringCard {
    const built = buildMentoringCards({
      people: [row],
      meetings,
      linkedMeetings: new Map([[personRef, linkedMeetingIds]]),
      mentorships: record ? [record] : [],
      now
    })[0];
    if (built) return built;
    // No relationship role, coaching sheet or record: still a page, read as a mentee.
    return buildMentoringCards({
      people: [{ ...row, relationship_roles: [{ role: 'mentee', label: 'Mentee', current: true }] }],
      meetings,
      linkedMeetings: new Map([[personRef, linkedMeetingIds]]),
      now
    })[0]!;
  }
  const completed = () => record?.status === 'completed';

  // ── Saving ──────────────────────────────────────────────────────────────
  // One write at a time: two saves landing together would each rewrite the
  // whole record and the later one would drop the earlier one's change.
  let queue: Promise<unknown> = Promise.resolve();
  function inTurn<T>(work: () => Promise<T>): Promise<T> {
    const run = queue.then(work, work);
    queue = run.catch(() => undefined);
    return run;
  }

  async function ensureRecord(): Promise<Mentorship> {
    if (record) return record;
    const current = card();
    try {
      record = (
        await createMentorship({
          person_ref: personRef,
          kind: current.type,
          label: current.badge.style === 'chip' && current.detail ? current.detail : null,
          organisation_ref: current.badge.style === 'crest' ? crestRef(current.badge.organisationRef) : null
        })
      ).mentorship;
    } catch (err) {
      // Made in another tab since this page loaded: use that one.
      if (!(err instanceof ApiClientError) || err.status !== 409) throw err;
      const existing = (await getMentorshipForPerson(personRef)).mentorship;
      if (!existing) throw err;
      record = existing;
    }
    return record;
  }

  function saveFields(fields: MentorshipFields): Promise<Mentorship> {
    return inTurn(async () => {
      const held = await ensureRecord();
      record = (await updateMentorship(held.id, fields)).mentorship;
      return record;
    });
  }

  // ── Layout (built once; each part repaints on its own) ──────────────────
  const root = el('div', 'mentoring-person');
  root.dataset.personId = personId;
  const back = el('a', 'mentoring-person__back', '← Mentoring');
  back.href = '#/mentoring';
  const hero = el('section', 'mentoring-hero');
  const status = el('p', 'mentoring-person__status');
  status.setAttribute('role', 'alert');
  status.hidden = true;
  const tiles = el('div', 'mentoring-tiles');
  const cols = el('div', 'mentoring-cols');
  const main = el('div', 'mentoring-cols__main');
  const side = el('div', 'mentoring-cols__side');

  const notesBox = box('My notes', 'notes');
  notesBox.head.append(el('span', 'mentor-chip', 'Private'));
  const notesHost = el('div', 'mentoring-box__blocks');
  notesBox.root.append(notesHost);

  const sharedBox = box(`Shared with ${firstName}`, 'shared');
  sharedBox.root.classList.add('mentoring-box--shared');
  sharedBox.head.append(el('span', 'mentor-chip mentor-chip--mentee', 'On their page'));
  const sharedHint = el(
    'p',
    'mentoring-box__hint',
    record?.status === 'completed'
      ? `What ${firstName}’s read-only page was built from.`
      : `Whatever you put here goes on ${firstName}’s read-only page: documents, annotations, notes.`
  );
  const sharedHost = el('div', 'mentoring-box__blocks');
  const shareBar = el('div', 'mentoring-share');
  sharedBox.root.append(sharedHint, sharedHost, shareBar);

  const tasksBox = box('Tasks', 'tasks');
  const tasksBody = el('div', 'mentoring-box__body');
  tasksBox.root.append(tasksBody);
  const sessionsBox = box('Sessions', 'sessions');
  const sessionsBody = el('div', 'mentoring-box__body');
  sessionsBox.root.append(sessionsBody);
  const itemsBox = box('Open items', 'open-items');
  const itemsBody = el('div', 'mentoring-box__body');
  itemsBox.root.append(itemsBody);

  main.append(notesBox.root, sharedBox.root);
  side.append(tasksBox.root, sessionsBox.root, itemsBox.root);
  cols.append(main, side);
  root.append(back, hero, status, tiles, cols);
  canvas.replaceChildren(root);

  function box(title: string, part: string): { root: HTMLElement; head: HTMLElement; count: HTMLElement } {
    const section = el('section', 'mentoring-box');
    section.dataset.part = part;
    const head = el('div', 'mentoring-box__head');
    const count = el('span', 'mentoring-section__count');
    head.append(el('h2', 'mentoring-box__title', title), count);
    section.append(head);
    return { root: section, head, count };
  }

  function showError(err: unknown): void {
    status.hidden = false;
    status.textContent = errorMessage(err);
  }
  function clearError(): void {
    status.hidden = true;
    status.textContent = '';
  }

  /** Runs one write behind a button, which waits while it runs and says so if it fails. */
  async function run(trigger: HTMLButtonElement | null, work: () => Promise<void>): Promise<boolean> {
    if (trigger) trigger.disabled = true;
    clearError();
    try {
      await work();
      return true;
    } catch (err) {
      if (root.isConnected) showError(err);
      return false;
    } finally {
      if (trigger?.isConnected) trigger.disabled = false;
    }
  }

  // ── Hero ────────────────────────────────────────────────────────────────
  function paintHero(): void {
    const current = card();
    hero.replaceChildren();
    hero.classList.toggle('mentoring-hero--completed', completed());
    const avatar = el('span', 'mentor-card__avatar mentoring-hero__avatar', current.initials);
    avatar.setAttribute('aria-hidden', 'true');
    const copy = el('div', 'mentoring-hero__copy');
    if (current.roleLine) copy.append(el('p', 'mentor-card__role', current.roleLine));

    const chips = el('div', 'mentor-card__chips');
    chips.append(renderMentoringBadge(current.badge, organisations));
    if (completed()) {
      const done = record?.completed_on ? `Completed ${formatDisplayDate(record.completed_on)}` : 'Completed';
      chips.append(el('span', 'mentor-chip mentor-chip--completed', done));
    } else if (record?.started_on) {
      chips.append(el('span', 'mentor-chip mentor-chip--mentee', `Active since ${formatDisplayDate(record.started_on)}`));
    } else {
      chips.append(el('span', 'mentor-chip mentor-chip--mentee', 'Active'));
    }
    copy.append(chips);

    if (record?.focus) {
      const focus = el('p', 'mentoring-hero__focus');
      focus.append(el('span', 'mentoring-hero__label', 'Focus'), document.createTextNode(record.focus));
      copy.append(focus);
    }
    if (completed() && record?.outcome) {
      const outcome = el('p', 'mentoring-hero__focus');
      outcome.append(el('span', 'mentoring-hero__label', 'Outcome'), document.createTextNode(record.outcome));
      copy.append(outcome);
    }
    // Shown until a type is chosen; a record made just to hold notes has not chosen one.
    if (!completed() && (!record || (record.kind === 'other' && !record.label))) {
      const setUp = button(
        current.kind === 'mentor' ? `Set how ${firstName} mentors you` : `Set how you mentor ${firstName}`,
        'mentoring-hero__setup',
        'set-type'
      );
      setUp.addEventListener('click', () => openDetails(setUp));
      copy.append(setUp);
    }

    const actions = el('div', 'mentoring-hero__actions');
    if (!completed()) {
      const book = el('a', 'btn btn--primary', 'Book a session');
      book.href = '#/meeting/new';
      actions.append(book);
    }
    const people = el('a', 'btn btn--secondary', 'Open in People');
    people.href = personRoute(personId);
    actions.append(people);
    const items: PersonMenuItem[] = [];
    if (completed()) {
      items.push({ label: 'Reopen mentoring', onSelect: () => void reopen() });
    } else {
      items.push({ label: 'Edit details', onSelect: () => openDetails(menu.querySelector('button')) });
      items.push({ label: 'Complete mentoring', onSelect: () => openComplete(menu.querySelector('button')) });
    }
    const menu = buildPersonMenu(items, 'Mentoring actions');
    menu.dataset.part = 'mentoring-menu';
    actions.append(menu);
    hero.append(avatar, copy, actions);
  }

  async function reopen(): Promise<void> {
    await run(null, async () => {
      await saveFields({ status: 'active', completed_on: null, outcome: null });
    });
    // The page was read-only; build it again so the notes can be edited.
    if (isCurrent() && root.isConnected) void renderMentoringPersonView(canvas, personId, options);
  }

  // ── Details: type, crest, focus, start ──────────────────────────────────
  function openDetails(returnFocus: HTMLElement | null): void {
    const current = card();
    const dialog = openDialog(
      current.kind === 'mentor' ? `How is ${firstName} mentoring you?` : `How are you mentoring ${firstName}?`,
      returnFocus
    );
    const form = el('form', 'mentoring-dialog__form');
    form.noValidate = true;
    let picked: MentorshipKind = record?.kind ?? current.type;

    const choices: Array<{ kind: MentorshipKind; hint: string }> = [
      { kind: 'accreditation', hint: 'Shows a school crest' },
      { kind: 'halt_highly_accomplished', hint: 'NSW HALT, in its colours' },
      { kind: 'halt_lead', hint: 'NSW HALT, in its colours' },
      { kind: 'coaching', hint: 'A plain chip, or your own short label' },
      { kind: 'other', hint: 'Any other mentoring, with your own short label' }
    ];
    const pick = el('div', 'mentoring-pick');
    pick.setAttribute('role', 'radiogroup');
    pick.setAttribute('aria-label', 'Mentoring type');
    const ownLabel = el('input', 'hub-input');
    ownLabel.type = 'text';
    ownLabel.maxLength = 60;
    ownLabel.placeholder = 'Early career';
    ownLabel.value = record?.label ?? (current.badge.style === 'chip' && current.detail ? current.detail : '');
    const ownField = field('Your own label (optional)', ownLabel);

    const crest = el('select', 'hub-select');
    const crestField = field('Crest', crest, 'The crest comes from that organisation’s page.');
    function fillCrests(preferred: Array<{ ref: string; display_name: string }>): void {
      const held = crest.value || record?.organisation_ref || '';
      const seen = new Set<string>();
      const options: Array<{ ref: string; name: string }> = [];
      const push = (candidate: string | null | undefined, name: string) => {
        const ref = crestRef(candidate);
        if (!ref || seen.has(ref)) return;
        seen.add(ref);
        options.push({ ref, name });
      };
      for (const org of preferred) push(org.ref, org.display_name);
      for (const org of row.organisations ?? []) push(org.ref, org.display_name);
      for (const org of [...(directory.organisations ?? [])].sort((a, b) => a.display_name.localeCompare(b.display_name))) {
        push(org.ref, org.display_name);
      }
      crest.replaceChildren();
      for (const option of options) {
        const node = el('option', undefined, option.name);
        node.value = option.ref;
        crest.append(node);
      }
      const fallback = current.badge.style === 'crest' ? current.badge.organisationRef : null;
      const want = held || fallback || '';
      if (want && seen.has(want)) crest.value = want;
    }
    fillCrests([]);
    // The operator's own school is the usual crest; put it first once it is known.
    if (!record?.organisation_ref) {
      void fetchSelfPerson({ workplaces: true }).then(
        (self) => {
          if (!crest.isConnected || !self.workplaces?.length) return;
          const untouched = !crest.dataset.touched;
          fillCrests(self.workplaces);
          if (untouched) crest.value = self.workplaces[0]!.ref;
        },
        () => undefined
      );
    }
    crest.addEventListener('change', () => {
      crest.dataset.touched = '1';
    });

    function syncFields(): void {
      crestField.hidden = picked !== 'accreditation';
      ownField.hidden = picked !== 'coaching' && picked !== 'other';
    }
    for (const choice of choices) {
      const option = el('label', 'mentoring-pick__opt');
      const input = el('input');
      input.type = 'radio';
      input.name = 'mentoring-type';
      input.value = choice.kind;
      input.checked = choice.kind === picked;
      const preview = renderMentoringBadge(
        mentoringBadgeFor({
          type: choice.kind,
          kind: current.kind,
          label: choice.kind === 'other' ? 'Other' : null,
          organisationRef: record?.organisation_ref ?? row.organisation?.ref ?? null
        }),
        organisations
      );
      option.append(input, preview, el('span', 'mentoring-pick__hint', choice.hint));
      input.addEventListener('change', () => {
        picked = choice.kind;
        syncFields();
      });
      pick.append(option);
    }
    syncFields();

    const focus = el('input', 'hub-input');
    focus.type = 'text';
    focus.maxLength = 300;
    focus.placeholder = 'Proficient accreditation, submission due Term 2';
    focus.value = record?.focus ?? '';
    const started = el('input', 'hub-input');
    started.type = 'date';
    started.value = record?.started_on ?? '';

    const save = el('button', 'btn btn--primary', 'Save');
    save.type = 'submit';
    save.dataset.part = 'details-save';
    const cancel = button('Cancel', 'btn btn--ghost');
    cancel.addEventListener('click', () => dialog.close());
    const actions = el('div', 'mentoring-dialog__actions');
    actions.append(save, cancel);
    const problem = el('p', 'hub-field__error');
    problem.hidden = true;

    form.append(pick, crestField, ownField, field('Focus (optional)', focus, 'What the two of you are working towards.'), field('Started on (optional)', started), problem, actions);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const fields: MentorshipFields = {
        kind: picked,
        label: picked === 'coaching' || picked === 'other' ? ownLabel.value.trim() || null : null,
        organisation_ref: picked === 'accreditation' ? crest.value || null : null,
        focus: focus.value.trim() || null,
        started_on: started.value || null
      };
      save.disabled = true;
      problem.hidden = true;
      saveFields(fields).then(
        () => {
          dialog.close();
          paintHero();
        },
        (err: unknown) => {
          save.disabled = false;
          problem.hidden = false;
          problem.textContent = errorMessage(err);
        }
      );
    });
    dialog.card.append(form);
    (pick.querySelector('input:checked') as HTMLInputElement | null)?.focus();
  }

  // ── Completing ──────────────────────────────────────────────────────────
  function openComplete(returnFocus: HTMLElement | null): void {
    const dialog = openDialog(`Complete mentoring with ${firstName}?`, returnFocus);
    const form = el('form', 'mentoring-dialog__form');
    form.noValidate = true;
    const finished = el('input', 'hub-input');
    finished.type = 'date';
    finished.value = localDay(now);
    const outcome = el('input', 'hub-input');
    outcome.type = 'text';
    outcome.maxLength = 300;
    outcome.placeholder = 'Proficient achieved';
    const kept = el(
      'p',
      'mentoring-dialog__kept',
      `Everything is kept: sessions, notes, tasks, documents and the shared page. ${firstName} moves to Completed and stops asking for catch-ups. You can reopen at any time.`
    );
    const problem = el('p', 'hub-field__error');
    problem.hidden = true;
    const confirm = el('button', 'btn btn--primary', 'Complete mentoring');
    confirm.type = 'submit';
    confirm.dataset.part = 'complete-confirm';
    const cancel = button('Cancel', 'btn btn--ghost');
    cancel.addEventListener('click', () => dialog.close());
    const actions = el('div', 'mentoring-dialog__actions');
    actions.append(confirm, cancel);
    form.append(field('Finished on', finished), field('Outcome (optional)', outcome), kept, problem, actions);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!finished.value) {
        problem.hidden = false;
        problem.textContent = 'Pick the day it finished.';
        return;
      }
      confirm.disabled = true;
      problem.hidden = true;
      // Anything still being typed goes in before the page turns read-only.
      Promise.all([notesPage?.flush(), sharedPage?.flush()])
        .then(() => saveFields({ status: 'completed', completed_on: finished.value, outcome: outcome.value.trim() || null }))
        .then(
          () => {
            dialog.close();
            if (isCurrent() && root.isConnected) void renderMentoringPersonView(canvas, personId, options);
          },
          (err: unknown) => {
            confirm.disabled = false;
            problem.hidden = false;
            problem.textContent = errorMessage(err);
          }
        );
    });
    dialog.card.append(form);
    finished.focus();
  }

  // ── Tiles ───────────────────────────────────────────────────────────────
  function tile(label: string, value: string, meta: string): HTMLElement {
    const node = el('div', 'mentoring-tile');
    node.append(el('div', 'mentoring-tile__label', label), el('div', 'mentoring-tile__value', value));
    if (meta) node.append(el('div', 'mentoring-tile__meta', meta));
    return node;
  }

  function paintTiles(): void {
    const current = card();
    const sheets = current.sheetCount ? `${current.sheetCount} coaching ${current.sheetCount === 1 ? 'sheet' : 'sheets'}` : '';
    const youOwe = ledger ? ledger.you_owe_count : current.youOwe;
    const theyOwe = ledger ? ledger.they_owe_count : current.theyOwe;
    tiles.replaceChildren(
      tile('Sessions', String(current.sessionCount), sheets),
      tile(
        'Last session',
        current.lastSession ? formatDisplayDate(current.lastSession.start) : 'None yet',
        current.lastSession ? relativeDays(current.lastSession.start, now) : ''
      ),
      tile(
        'Next session',
        current.nextSession ? formatDisplayDate(current.nextSession.start) : 'Nothing booked',
        current.nextSession ? relativeDays(current.nextSession.start, now) : ''
      ),
      tile('You owe', String(youOwe), `They owe ${theyOwe}`)
    );
  }

  // ── Sessions ────────────────────────────────────────────────────────────
  let allSessions = false;
  function paintSessions(): void {
    const ordered = orderSessions(sessions, now);
    sessionsBox.count.textContent = ordered.length ? String(ordered.length) : '';
    sessionsBody.replaceChildren();
    if (!ordered.length) {
      sessionsBody.append(el('p', 'mentoring-box__empty', 'No sessions yet. Book one, and add them to the meeting.'));
      return;
    }
    const nowMs = now.getTime();
    for (const entry of allSessions ? ordered : ordered.slice(0, SESSIONS_SHOWN)) {
      const line = el('div', 'mentoring-row');
      const text = el('div', 'mentoring-row__main');
      const title = el('a', 'mentoring-row__title', entry.title || 'Meeting');
      title.href = meetingRoute(entry.meetingId);
      const meta = [`${formatDisplayDate(entry.start)} · ${relativeDays(entry.start, now)}`, entry.technique ? `coaching sheet: ${entry.technique}` : '']
        .filter(Boolean)
        .join(' · ');
      text.append(title, el('span', 'mentoring-row__meta', meta));
      line.append(text);
      if (Date.parse(entry.start) > nowMs) line.append(el('span', 'mentor-chip mentor-chip--mentee', 'Booked'));
      sessionsBody.append(line);
    }
    if (ordered.length > SESSIONS_SHOWN) {
      const more = button(allSessions ? 'Show fewer' : `Show all ${ordered.length}`, 'mentoring-box__more', 'sessions-more');
      more.addEventListener('click', () => {
        allSessions = !allSessions;
        paintSessions();
      });
      sessionsBody.append(more);
    }
  }

  // ── Tasks ───────────────────────────────────────────────────────────────
  function paintTasks(): void {
    tasksBody.replaceChildren();
    if (tasksFailed) {
      tasksBox.count.textContent = '';
      tasksBody.append(el('p', 'mentoring-box__empty', 'Tasks could not load. Refresh to try again.'));
      return;
    }
    if (!tasks) {
      tasksBox.count.textContent = '';
      tasksBody.append(el('p', 'mentoring-box__empty', 'Loading tasks…'));
      return;
    }
    const open = tasks.filter((task) => !task.done);
    const done = tasks.filter((task) => task.done);
    tasksBox.count.textContent = tasks.length ? `${open.length} open` : '';
    if (!open.length) {
      tasksBody.append(el('p', 'mentoring-box__empty', done.length ? 'Nothing open.' : `No tasks linked to ${firstName} yet.`));
    }
    for (const task of open) {
      const line = el('div', 'mentoring-row');
      line.dataset.taskId = task.id;
      const tick = button('', 'mentoring-task__tick', 'task-tick');
      tick.setAttribute('aria-label', `Mark done: ${task.title}`);
      tick.addEventListener('click', () => {
        void run(tick, async () => {
          await setPersonTaskDone(task.id);
          task.done = true;
          paintTasks();
        });
      });
      const text = el('div', 'mentoring-row__main');
      const title = task.href ? el('a', 'mentoring-row__title', task.title) : el('span', 'mentoring-row__title', task.title);
      if (task.href && title instanceof HTMLAnchorElement) title.href = task.href;
      text.append(title);
      if (task.due) text.append(el('span', 'mentoring-row__meta', `Due ${formatDisplayDate(task.due)}`));
      line.append(tick, text);
      tasksBody.append(line);
    }
    if (done.length) tasksBody.append(el('p', 'mentoring-row__meta mentoring-box__done', `${done.length} done`));
    if (completed()) return;

    const add = button('+ Add a task', 'mentoring-box__more', 'task-add');
    const form = el('form', 'mentoring-task__form');
    form.hidden = true;
    form.noValidate = true;
    const title = el('input', 'hub-input');
    title.type = 'text';
    title.maxLength = 200;
    title.placeholder = 'Book lesson observation';
    title.setAttribute('aria-label', 'Task');
    const due = el('input', 'hub-input mentoring-task__due');
    due.type = 'date';
    due.setAttribute('aria-label', 'Due date (optional)');
    const save = el('button', 'btn btn--primary', 'Add');
    save.type = 'submit';
    const problem = el('p', 'hub-field__error');
    problem.hidden = true;
    form.append(title, due, save, problem);
    add.addEventListener('click', () => {
      add.hidden = true;
      form.hidden = false;
      title.focus();
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const text = title.value.trim();
      if (!text) {
        problem.hidden = false;
        problem.textContent = 'Say what the task is.';
        return;
      }
      problem.hidden = true;
      save.disabled = true;
      addPersonTask(personRef, { title: text, due: due.value || null }).then(
        (task) => {
          tasks = [...(tasks ?? []), task];
          paintTasks();
        },
        (err: unknown) => {
          save.disabled = false;
          problem.hidden = false;
          problem.textContent = errorMessage(err);
        }
      );
    });
    title.addEventListener('input', () => {
      problem.hidden = true;
    });
    tasksBody.append(add, form);
  }

  // ── Open items ──────────────────────────────────────────────────────────
  function paintItems(): void {
    itemsBody.replaceChildren();
    if (ledgerFailed) {
      itemsBody.append(el('p', 'mentoring-box__empty', 'Open items could not load. Refresh to try again.'));
      return;
    }
    if (!ledger) {
      itemsBody.append(el('p', 'mentoring-box__empty', 'Loading open items…'));
      return;
    }
    const rows = [
      ...ledger.you_owe.map((item) => ({ item, who: 'You owe' })),
      ...ledger.they_owe.map((item) => ({ item, who: 'They owe' }))
    ];
    itemsBox.count.textContent = rows.length ? String(rows.length) : '';
    if (!rows.length) {
      itemsBody.append(el('p', 'mentoring-box__empty', 'Nothing open between you.'));
      return;
    }
    for (const { item, who } of rows) {
      const line = el('div', 'mentoring-row');
      const text = el('div', 'mentoring-row__main');
      const title = item.href ? el('a', 'mentoring-row__title', item.text) : el('span', 'mentoring-row__title', item.text);
      if (item.href && title instanceof HTMLAnchorElement) title.href = item.href;
      text.append(title, el('span', 'mentoring-row__meta', [who, item.source_label ?? ''].filter(Boolean).join(' · ')));
      line.append(text);
      itemsBody.append(line);
    }
  }

  // ── Shared page ─────────────────────────────────────────────────────────
  async function publish(trigger: HTMLButtonElement): Promise<void> {
    await run(trigger, async () => {
      await sharedPage?.flush();
      const held = await inTurn(() => ensureRecord());
      const result = await publishMentorshipShare(held.id);
      share = result.share;
      leftOff = result.left_off;
      sharedEdited = false;
    });
    paintShare();
  }

  function paintShare(): void {
    shareBar.replaceChildren();
    if (!share) {
      if (completed()) {
        shareBar.append(el('p', 'mentoring-share__status', 'No link was made for this page.'));
        return;
      }
      const note = el('p', 'mentoring-share__status');
      note.hidden = true;
      const make = button('Create read-only link', 'btn btn--secondary', 'share-create');
      make.addEventListener('click', () => {
        if (!sharedPage?.current().length) {
          note.hidden = false;
          note.textContent = 'Add a block above first, then make the link.';
          return;
        }
        void publish(make);
      });
      shareBar.append(
        make,
        note,
        el('p', 'mentoring-box__hint', `Anyone with the link can read the page, with no sign-in. Nothing reaches ${firstName} until you make the link, and later changes wait for Update page.`)
      );
      return;
    }
    const url = sheetUrl(share.token);
    const state = el(
      'p',
      `mentoring-share__status${sharedEdited ? ' mentoring-share__status--changed' : ''}`,
      sharedEdited ? 'You have changes they can’t see yet' : `Link is on · updated ${formatDisplayDate(share.updated_at)}`
    );
    state.dataset.part = 'share-status';
    const line = el('div', 'mentoring-share__link');
    const link = el('code', undefined, url);
    const copy = button('Copy link', 'btn btn--secondary', 'share-copy');
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(url);
        copy.textContent = 'Copied';
      } catch {
        const range = document.createRange();
        range.selectNodeContents(link);
        const selection = getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        copy.textContent = 'Selected';
      }
      setTimeout(() => {
        copy.textContent = 'Copy link';
      }, 1500);
    });
    line.append(link, copy);
    const buttons = el('div', 'mentoring-share__actions');
    if (!completed()) {
      const update = button('Update page', sharedEdited ? 'btn btn--primary' : 'btn btn--secondary', 'share-update');
      update.addEventListener('click', () => void publish(update));
      buttons.append(update);
    }
    const view = el('a', 'btn btn--ghost', 'See their view');
    view.href = url;
    view.target = '_blank';
    view.rel = 'noopener';
    const stop = button('Stop sharing', 'btn btn--ghost', 'share-stop');
    stop.addEventListener('click', () => {
      void run(stop, async () => {
        await stopMentorshipShare(record!.id);
        share = null;
        leftOff = null;
      }).then(() => paintShare());
    });
    buttons.append(view, stop);
    shareBar.append(state, line, buttons);
    const left = mentoringLeftOffLine(leftOff);
    if (left) shareBar.append(el('p', 'mentoring-box__hint', left));
  }

  // ── Block pages ─────────────────────────────────────────────────────────
  function mountBlocks(): void {
    const editable = !completed();
    notesPage = mountBlockPage(notesHost, {
      blocks: (record?.blocks ?? []) as BlockList,
      editable,
      extraBlockTypes: ['annotation'],
      onSave: async (blocks) => {
        await saveFields({ blocks }).catch((err: unknown) => {
          if (root.isConnected) showError(err);
          throw err;
        });
      }
    });
    sharedPage = mountBlockPage(sharedHost, {
      blocks: (record?.shared_blocks ?? []) as BlockList,
      editable,
      extraBlockTypes: ['annotation'],
      onSave: async (blocks) => {
        await saveFields({ shared_blocks: blocks }).catch((err: unknown) => {
          if (root.isConnected) showError(err);
          throw err;
        });
        if (share && !sharedEdited) {
          sharedEdited = true;
          if (root.isConnected) paintShare();
        }
      }
    });
    if (!editable) {
      if (!(record?.blocks ?? []).length) notesHost.append(el('p', 'mentoring-box__empty', 'No notes were kept.'));
      if (!(record?.shared_blocks ?? []).length) sharedHost.append(el('p', 'mentoring-box__empty', 'Nothing was shared.'));
    }
  }

  // Typing that has not saved yet goes in as the page is left.
  window.addEventListener(
    'hashchange',
    () => {
      void notesPage?.flush().catch(() => undefined);
      void sharedPage?.flush().catch(() => undefined);
    },
    { once: true }
  );

  paintHero();
  paintTiles();
  paintSessions();
  paintTasks();
  paintItems();
  mountBlocks();
  paintShare();

  // ── Slower reads, each filling its own box ──────────────────────────────
  void fetchPersonLedger(personRef).then(
    (data) => {
      ledger = data;
    },
    () => {
      ledgerFailed = true;
    }
  ).then(() => {
    if (!root.isConnected) return;
    paintItems();
    paintTiles();
  });
  void loadPersonTasks(linkEntries).then(
    (data) => {
      tasks = data;
    },
    () => {
      tasksFailed = true;
    }
  ).then(() => {
    if (root.isConnected) paintTasks();
  });
  if (record) {
    void loadMentorshipShare(record.id).then(
      (data) => {
        share = data.share;
        if (root.isConnected) paintShare();
      },
      () => undefined
    );
  }
}
