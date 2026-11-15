import {
  fetchPeopleDirectory,
  fetchPeopleDirectorySnapshot,
  peekPeopleDirectory,
  type PeopleDirectoryResponse
} from '@/api/people-directory';
import { listMeetings } from '@/api/meetings';
import { headStart } from '@/app/head-start';
import { listUniversalLinksForEntities } from '@/api/universal-links';
import { listMentorships, type MentorshipSummary } from '@/api/mentorships';
import type { MeetingRecord } from '@/domain/types';
import { meetingRoute, mentoringPersonRoute } from '@/app/router';
import { renderMentoringBadge, type BadgeOrganisation } from '@/components/mentoring-badge';
import { decisionLabel } from '@/guides/coaching-sheet';
import {
  buildMentoringCards,
  mentoringPeople,
  relativeDays,
  type MentoringCard
} from '@/domain/mentoring-model';
import { renderLoadError, showViewLoading } from '@/views/feedback';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';

/**
 * Mentoring & coaching: the relationship side of mentoring, one card per
 * person. Built from what Professional already holds — mentor / mentee
 * relationship roles, the meetings linked to each person, and the coaching
 * sheets written in those meetings — plus each person's saved mentorship,
 * which says how the operator mentors them and whether it has finished. A
 * card opens that person's mentoring page.
 */

export interface MentoringViewOptions {
  isCurrent?: () => boolean;
  now?: () => Date;
}

const MEETING_PREFIX = 'professional:meeting:';
/** The server reads at most this many people's links per request. */
const LINK_BATCH = 50;
type LinkCache = Map<string, Set<string> | null>;
type Organisations = ReadonlyMap<string, BadgeOrganisation>;

/** Crest details for every organisation the directory knows, keyed by ref. */
export function badgeOrganisations(directory: PeopleDirectoryResponse): Map<string, BadgeOrganisation> {
  const out = new Map<string, BadgeOrganisation>();
  for (const org of directory.organisations ?? []) out.set(org.ref, { monogram: org.monogram, logo_key: org.logo_key });
  for (const row of [...directory.people, ...(directory.students ?? [])]) {
    for (const org of row.organisations ?? []) {
      if (!out.has(org.ref)) out.set(org.ref, { monogram: org.monogram, logo_key: org.logo_key });
    }
  }
  return out;
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
 * Meetings linked to each person, from the people's own link lists, in one
 * request per 50 people. The full person overview carries the same meetings
 * but also builds a timeline and reads workplaces, several times slower, and
 * one call per person can each wake a cold server. `cache` keeps answers
 * between the quick paint and the refreshed one so no person is asked twice.
 */
async function linkedMeetingIds(refs: string[], cache: LinkCache): Promise<Map<string, Set<string>>> {
  const todo = refs.filter((ref) => !cache.has(ref));
  for (let start = 0; start < todo.length; start += LINK_BATCH) {
    const chunk = todo.slice(start, start + LINK_BATCH);
    try {
      const { results } = await listUniversalLinksForEntities(chunk);
      for (const ref of chunk) {
        const entry = results?.[ref];
        if (!entry || entry.error) {
          // A person whose links fail still gets a card; it just shows no linked sessions.
          cache.set(ref, null);
          continue;
        }
        const ids = [...(entry.outgoing ?? []), ...(entry.incoming ?? [])]
          .map((link) => link.endpoint?.ref ?? '')
          .filter((value) => value.startsWith(MEETING_PREFIX))
          .map((value) => value.slice(MEETING_PREFIX.length));
        cache.set(ref, new Set(ids));
      }
    } catch {
      for (const ref of chunk) cache.set(ref, null);
    }
  }
  const out = new Map<string, Set<string>>();
  for (const ref of refs) {
    const ids = cache.get(ref);
    if (ids) out.set(ref, ids);
  }
  return out;
}

function fact(label: string, value: string | Node, extraClass = ''): HTMLElement {
  const row = el('div', `mentor-card__fact${extraClass ? ` ${extraClass}` : ''}`);
  row.append(el('dt', undefined, label));
  const dd = el('dd');
  dd.append(value);
  row.append(dd);
  return row;
}

function sessionLink(meetingId: string, text: string): HTMLAnchorElement {
  const link = el('a', 'mentor-card__link', text);
  link.href = meetingRoute(meetingId);
  return link;
}

function renderCard(card: MentoringCard, now: Date, organisations: Organisations): HTMLElement {
  const article = el('article', `mentor-card${card.dueCatchUp ? ' mentor-card--due' : ''}`);
  article.dataset.personId = card.personId;
  article.dataset.kind = card.kind;
  article.dataset.type = card.type;

  const head = el('div', 'mentor-card__head');
  const avatar = el('span', 'mentor-card__avatar', card.initials);
  avatar.setAttribute('aria-hidden', 'true');
  const titles = el('div', 'mentor-card__titles');
  const name = el('a', 'mentor-card__name', card.name);
  name.href = mentoringPersonRoute(card.personId);
  const chips = el('div', 'mentor-card__chips');
  chips.append(renderMentoringBadge(card.badge, organisations));
  chips.append(el('span', `mentor-chip mentor-chip--warmth-${card.warmthBand}`, card.warmthBand === 'warm' ? 'Warm' : card.warmthBand === 'cooling' ? 'Cooling' : 'Cold'));
  titles.append(name, chips);
  if (card.roleLine) titles.append(el('p', 'mentor-card__role', card.roleLine));
  head.append(avatar, titles);
  article.append(head);

  if (card.dueCatchUp) {
    article.append(
      el(
        'p',
        'mentor-card__nudge',
        card.lastSession ? `No catch-up booked · last one ${relativeDays(card.lastSession.start, now)}` : 'No sessions on record yet'
      )
    );
  }

  const facts = el('dl', 'mentor-card__facts');
  facts.append(
    fact(
      'Last session',
      card.lastSession
        ? sessionLink(card.lastSession.meetingId, `${formatDisplayDate(card.lastSession.start)} · ${relativeDays(card.lastSession.start, now)}`)
        : 'None yet'
    ),
    fact(
      'Next session',
      card.nextSession
        ? sessionLink(card.nextSession.meetingId, `${formatDisplayDate(card.nextSession.start)} · ${relativeDays(card.nextSession.start, now)}`)
        : 'Nothing booked'
    )
  );
  if (card.latestSheet) {
    facts.append(
      fact(
        'Coaching',
        sessionLink(
          card.latestSheet.meetingId,
          `${card.latestSheet.technique} · ${decisionLabel(card.latestSheet.decision)}${card.sheetCount > 1 ? ` · ${card.sheetCount} sheets` : ''}`
        )
      )
    );
  }
  if (card.youOwe || card.theyOwe) {
    const owed = [card.youOwe ? `You owe ${card.youOwe}` : '', card.theyOwe ? `They owe ${card.theyOwe}` : '']
      .filter(Boolean)
      .join(' · ');
    facts.append(fact('Open items', owed));
  }
  article.append(facts);

  const actions = el('div', 'mentor-card__actions');
  const open = el('a', 'btn btn--primary', 'Open');
  open.href = mentoringPersonRoute(card.personId);
  open.setAttribute('aria-label', `Open mentoring with ${card.name}`);
  const book = el('a', 'btn btn--ghost', 'Book a session');
  book.href = '#/meeting/new';
  actions.append(open, book);
  article.append(actions);
  return article;
}

function renderSection(
  title: string,
  hint: string,
  cards: MentoringCard[],
  now: Date,
  organisations: Organisations
): HTMLElement | null {
  if (!cards.length) return null;
  const section = el('section', 'mentoring-section');
  const head = el('div', 'mentoring-section__head');
  head.append(el('h2', 'mentoring-section__title', title), el('span', 'mentoring-section__count', String(cards.length)));
  section.append(head, el('p', 'mentoring-section__hint', hint));
  const grid = el('div', 'mentoring-grid');
  for (const card of cards) grid.append(renderCard(card, now, organisations));
  section.append(grid);
  return section;
}

/** "03/02/25 to 12/11/26 · 14 sessions · Proficient achieved", leaving out what is not known. */
export function completedLine(card: MentoringCard): string {
  const from = card.startedOn ? formatDisplayDate(card.startedOn) : '';
  const to = card.completedOn ? formatDisplayDate(card.completedOn) : '';
  const span = from && to ? `${from} to ${to}` : to ? `Finished ${to}` : '';
  const sessions = card.sessionCount ? `${card.sessionCount} ${card.sessionCount === 1 ? 'session' : 'sessions'}` : '';
  return [span, sessions, card.outcome ?? ''].filter(Boolean).join(' · ');
}

/** Finished mentoring: one quiet row each, every record still behind it. */
function renderCompleted(cards: MentoringCard[], organisations: Organisations): HTMLElement | null {
  if (!cards.length) return null;
  const section = el('section', 'mentoring-section mentoring-section--completed');
  const head = el('div', 'mentoring-section__head');
  head.append(el('h2', 'mentoring-section__title', 'Completed'), el('span', 'mentoring-section__count', String(cards.length)));
  section.append(head, el('p', 'mentoring-section__hint', 'Finished mentoring. Every record is kept; open one to read it or reopen it.'));
  const list = el('div', 'mentoring-done');
  for (const card of cards) {
    const row = el('div', 'mentoring-done__row');
    row.dataset.personId = card.personId;
    const avatar = el('span', 'mentor-card__avatar', card.initials);
    avatar.setAttribute('aria-hidden', 'true');
    const who = el('div', 'mentoring-done__who');
    const name = el('a', 'mentor-card__name', card.name);
    name.href = mentoringPersonRoute(card.personId);
    who.append(name);
    const line = completedLine(card);
    if (line) who.append(el('p', 'mentoring-done__when', line));
    const open = el('a', 'btn btn--ghost mentoring-done__open', 'Open');
    open.href = mentoringPersonRoute(card.personId);
    open.setAttribute('aria-label', `Open mentoring with ${card.name}`);
    row.append(
      avatar,
      who,
      renderMentoringBadge(card.badge, organisations),
      el('span', 'mentor-chip mentor-chip--completed', 'Completed'),
      open
    );
    list.append(row);
  }
  section.append(list);
  return section;
}

export async function renderMentoringView(canvas: HTMLElement, options: MentoringViewOptions = {}): Promise<void> {
  const isCurrent = options.isCurrent ?? (() => true);
  const now = options.now?.() ?? new Date();
  showViewLoading(canvas, 'Loading mentoring…');

  // A full people scan takes seconds. Paint first from this session's last
  // directory or the server's saved copy of the last scan, then repaint if
  // the fresh scan changes anything (a role just set, say). The scan starts
  // once the saved copy is back (or after 1.5s): sent together, the second
  // request often waits seconds on a server starting cold, and the quick
  // paint with it.
  let live: PeopleDirectoryResponse | null = null;
  let liveError: unknown = null;
  const quick = peekPeopleDirectory();
  const quickLoad: Promise<PeopleDirectoryResponse | null> = quick
    ? Promise.resolve(quick)
    : fetchPeopleDirectorySnapshot().catch(() => null);
  const liveLoad = headStart(quickLoad).then(() => fetchPeopleDirectory()).then(
    (directory) => (live = directory),
    (err: unknown) => {
      liveError = err;
      return null;
    }
  );
  // Saved mentorships only add to the page; without them it still shows who is mentored.
  const mentorshipLoad: Promise<MentorshipSummary[]> = listMentorships().then(
    (data) => data.mentorships ?? [],
    () => []
  );
  const links: LinkCache = new Map();

  async function cardsFrom(
    directory: PeopleDirectoryResponse,
    meetings: MeetingRecord[],
    mentorships: MentorshipSummary[]
  ): Promise<MentoringCard[]> {
    const people = [...directory.people, ...(directory.students ?? [])];
    const relevant = mentoringPeople(people, meetings, mentorships);
    const linkedMeetings = await linkedMeetingIds(relevant.map((row) => row.ref), links);
    return buildMentoringCards({ people: relevant, meetings, linkedMeetings, mentorships, now });
  }

  let meetings: MeetingRecord[];
  let mentorships: MentorshipSummary[];
  let first: PeopleDirectoryResponse | null;
  let cards: MentoringCard[];
  try {
    meetings = (await listMeetings()).meetings;
    mentorships = await mentorshipLoad;
    first = live ?? (await quickLoad) ?? (await liveLoad);
    if (!first) throw liveError ?? new Error('People failed to load.');
    cards = await cardsFrom(first, meetings, mentorships);
  } catch (err) {
    if (!isCurrent()) return;
    renderLoadError(canvas, err, () => void renderMentoringView(canvas, options));
    return;
  }
  if (!isCurrent()) return;
  paintMentoring(canvas, cards, now, badgeOrganisations(first));
  if (first === live) return;

  const fresh = await liveLoad;
  if (!fresh || !isCurrent()) return; // a failed refresh keeps the saved copy on screen
  const freshCards = await cardsFrom(fresh, meetings, mentorships);
  if (!isCurrent() || JSON.stringify(freshCards) === JSON.stringify(cards)) return;
  paintMentoring(canvas, freshCards, now, badgeOrganisations(fresh));
}

function paintMentoring(canvas: HTMLElement, cards: MentoringCard[], now: Date, organisations: Organisations): void {
  canvas.replaceChildren();
  const page = el('div', 'mentoring-page');
  const active = cards.filter((card) => card.status === 'active');
  const completed = cards.filter((card) => card.status === 'completed');
  const supported = active.filter((card) => card.kind !== 'mentor');
  const mentors = active.filter((card) => card.kind === 'mentor');
  const due = active.filter((card) => card.dueCatchUp).length;

  const summary = el('p', 'page-header__supporting mentoring-summary');
  summary.textContent = cards.length
    ? [
        `${supported.length} you support`,
        `${mentors.length} supporting you`,
        active.length ? (due ? `${due} due a catch-up` : 'everyone has a recent or booked session') : '',
        completed.length ? `${completed.length} completed` : ''
      ]
        .filter(Boolean)
        .join(' · ')
    : '';
  if (cards.length) page.append(summary);

  if (!cards.length) {
    const empty = el('div', 'empty-state mentoring-empty');
    empty.append(
      el('p', undefined, 'No mentoring or coaching relationships yet.'),
      el(
        'p',
        undefined,
        'Open someone in People and set their relationship to Mentor or Mentee (add a label such as "Accreditation"), or write a coaching sheet about them in a meeting. They appear here.'
      )
    );
    const people = el('a', 'btn btn--primary', 'Go to People');
    people.href = '#/people';
    empty.append(people);
    page.append(empty);
    canvas.append(page);
    return;
  }

  const sections = [
    renderSection('People you support', 'Mentees and the people you coach.', supported, now, organisations),
    renderSection('People who support you', 'Your mentors.', mentors, now, organisations),
    renderCompleted(completed, organisations)
  ].filter((section): section is HTMLElement => section !== null);
  page.append(...sections);
  canvas.append(page);
}
