import { fetchPeopleDirectory } from '@/api/people-directory';
import { listMeetings } from '@/api/meetings';
import { fetchEntityOverview } from '@/api/entities';
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
/** Overview reads run a few at a time so a long list never floods the API. */
const OVERVIEW_CONCURRENCY = 4;

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

async function linkedMeetingIds(refs: string[]): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < refs.length) {
      const ref = refs[cursor++]!;
      try {
        const overview = await fetchEntityOverview(ref);
        const ids = (overview.linked_records.meetings ?? [])
          .map((endpoint) => endpoint.ref)
          .filter((value) => value.startsWith(MEETING_PREFIX))
          .map((value) => value.slice(MEETING_PREFIX.length));
        out.set(ref, new Set(ids));
      } catch {
        // A person whose overview fails still gets a card; it just shows no linked sessions.
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(OVERVIEW_CONCURRENCY, refs.length) }, worker));
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

  let cards: MentoringCard[];
  try {
    const [directory, meetingList] = await Promise.all([fetchPeopleDirectory(), listMeetings()]);
    const people = [...directory.people, ...(directory.students ?? [])];
    const meetings = meetingList.meetings;
    const relevant = mentoringPeople(people, meetings);
    const linkedMeetings = await linkedMeetingIds(relevant.map((row) => row.ref));
    cards = buildMentoringCards({ people: relevant, meetings, linkedMeetings, now });
  } catch (err) {
    if (!isCurrent()) return;
    renderLoadError(canvas, err, () => void renderMentoringView(canvas, options));
    return;
  }
  if (!isCurrent()) return;

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
