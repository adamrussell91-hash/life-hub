import {
  fetchPeopleDirectory,
  fetchPeopleDirectorySnapshot,
  peekPeopleDirectory,
  type PeopleDirectoryResponse
} from '@/api/people-directory';
import { listMeetings } from '@/api/meetings';
import { listUniversalLinksForEntities } from '@/api/universal-links';
import type { MeetingRecord } from '@/domain/types';
import { meetingRoute, personRoute } from '@/app/router';
import { decisionLabel } from '@/guides/coaching-sheet';
import {
  MENTORING_KIND_LABEL,
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
 * sheets written in those meetings. Nothing new is stored.
 */

export interface MentoringViewOptions {
  isCurrent?: () => boolean;
  now?: () => Date;
}

const MEETING_PREFIX = 'professional:meeting:';
/** The server reads at most this many people's links per request. */
const LINK_BATCH = 50;
type LinkCache = Map<string, Set<string> | null>;

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

function renderCard(card: MentoringCard, now: Date): HTMLElement {
  const article = el('article', `mentor-card${card.dueCatchUp ? ' mentor-card--due' : ''}`);
  article.dataset.personId = card.personId;
  article.dataset.kind = card.kind;

  const head = el('div', 'mentor-card__head');
  const avatar = el('span', 'mentor-card__avatar', card.initials);
  avatar.setAttribute('aria-hidden', 'true');
  const titles = el('div', 'mentor-card__titles');
  const name = el('a', 'mentor-card__name', card.name);
  name.href = personRoute(card.personId);
  const chips = el('div', 'mentor-card__chips');
  chips.append(el('span', `mentor-chip mentor-chip--${card.kind}`, MENTORING_KIND_LABEL[card.kind]));
  if (card.detail) chips.append(el('span', 'mentor-chip', card.detail));
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
  const book = el('a', 'btn btn--primary', 'Book a session');
  book.href = '#/meeting/new';
  const open = el('a', 'btn btn--ghost', 'Open profile');
  open.href = personRoute(card.personId);
  actions.append(book, open);
  article.append(actions);
  return article;
}

function renderSection(title: string, hint: string, cards: MentoringCard[], now: Date): HTMLElement | null {
  if (!cards.length) return null;
  const section = el('section', 'mentoring-section');
  const head = el('div', 'mentoring-section__head');
  head.append(el('h2', 'mentoring-section__title', title), el('span', 'mentoring-section__count', String(cards.length)));
  section.append(head, el('p', 'mentoring-section__hint', hint));
  const grid = el('div', 'mentoring-grid');
  for (const card of cards) grid.append(renderCard(card, now));
  section.append(grid);
  return section;
}

export async function renderMentoringView(canvas: HTMLElement, options: MentoringViewOptions = {}): Promise<void> {
  const isCurrent = options.isCurrent ?? (() => true);
  const now = options.now?.() ?? new Date();
  showViewLoading(canvas, 'Loading mentoring…');

  // A full people scan takes seconds. Paint first from this session's last
  // directory or the server's saved copy of the last scan, then repaint if
  // the fresh scan changes anything (a role just set, say).
  let live: PeopleDirectoryResponse | null = null;
  let liveError: unknown = null;
  const liveLoad = fetchPeopleDirectory().then(
    (directory) => (live = directory),
    (err: unknown) => {
      liveError = err;
      return null;
    }
  );
  const quick = peekPeopleDirectory();
  const quickLoad: Promise<PeopleDirectoryResponse | null> = quick
    ? Promise.resolve(quick)
    : fetchPeopleDirectorySnapshot().catch(() => null);
  const links: LinkCache = new Map();

  async function cardsFrom(directory: PeopleDirectoryResponse, meetings: MeetingRecord[]): Promise<MentoringCard[]> {
    const people = [...directory.people, ...(directory.students ?? [])];
    const relevant = mentoringPeople(people, meetings);
    const linkedMeetings = await linkedMeetingIds(relevant.map((row) => row.ref), links);
    return buildMentoringCards({ people: relevant, meetings, linkedMeetings, now });
  }

  let meetings: MeetingRecord[];
  let first: PeopleDirectoryResponse | null;
  let cards: MentoringCard[];
  try {
    meetings = (await listMeetings()).meetings;
    first = live ?? (await quickLoad) ?? (await liveLoad);
    if (!first) throw liveError ?? new Error('People failed to load.');
    cards = await cardsFrom(first, meetings);
  } catch (err) {
    if (!isCurrent()) return;
    renderLoadError(canvas, err, () => void renderMentoringView(canvas, options));
    return;
  }
  if (!isCurrent()) return;
  paintMentoring(canvas, cards, now);
  if (first === live) return;

  const fresh = await liveLoad;
  if (!fresh || !isCurrent()) return; // a failed refresh keeps the saved copy on screen
  const freshCards = await cardsFrom(fresh, meetings);
  if (!isCurrent() || JSON.stringify(freshCards) === JSON.stringify(cards)) return;
  paintMentoring(canvas, freshCards, now);
}

function paintMentoring(canvas: HTMLElement, cards: MentoringCard[], now: Date): void {
  canvas.replaceChildren();
  const page = el('div', 'mentoring-page');
  const supported = cards.filter((card) => card.kind !== 'mentor');
  const mentors = cards.filter((card) => card.kind === 'mentor');
  const due = cards.filter((card) => card.dueCatchUp).length;

  const summary = el('p', 'page-header__supporting mentoring-summary');
  summary.textContent = cards.length
    ? [
        `${supported.length} you support`,
        `${mentors.length} supporting you`,
        due ? `${due} due a catch-up` : 'everyone has a recent or booked session'
      ].join(' · ')
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
    renderSection('People you support', 'Mentees and the people you coach.', supported, now),
    renderSection('People who support you', 'Your mentors.', mentors, now)
  ].filter((section): section is HTMLElement => section !== null);
  page.append(...sections);
  canvas.append(page);
}
