import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectoryPersonRow } from '@/api/people-directory';
import type { MeetingRecord } from '@/domain/types';
import type { CoachingSheet } from '@/guides/coaching-sheet';
import type { MentorshipSummary } from '@/api/mentorships';
import { buildMentoringCards, mentoringPeople, mentorshipKindFromLabel, relativeDays } from '@/domain/mentoring-model';
import { mentoringPersonRoute, parseRoute, railHighlightFor } from '@/app/router';

vi.mock('@/api/people-directory', () => ({
  fetchPeopleDirectory: vi.fn(),
  fetchPeopleDirectorySnapshot: vi.fn(),
  peekPeopleDirectory: vi.fn()
}));
vi.mock('@/api/meetings', () => ({ listMeetings: vi.fn() }));
vi.mock('@/api/universal-links', () => ({ listUniversalLinksForEntities: vi.fn() }));
vi.mock('@/api/mentorships', () => ({ listMentorships: vi.fn() }));
vi.mock('@/api/organisations-directory', () => ({
  fetchCrestImage: vi.fn(async () => null),
  fetchCrestRefs: vi.fn(async () => ({ refs: [] })),
  fetchOrgCrestUrl: vi.fn(async () => ({ url: null }))
}));

import { fetchPeopleDirectory, fetchPeopleDirectorySnapshot, peekPeopleDirectory } from '@/api/people-directory';
import { listMeetings } from '@/api/meetings';
import { listUniversalLinksForEntities } from '@/api/universal-links';
import { listMentorships } from '@/api/mentorships';
import { renderMentoringView } from '@/views/mentoring';

const NOW = new Date('2026-10-28T09:00:00.000Z');

function person(id: string, name: string, roles: DirectoryPersonRow['relationship_roles'], extra: Partial<DirectoryPersonRow> = {}): DirectoryPersonRow {
  return {
    id,
    ref: `shared:person:${id}`,
    display_name: name,
    initials: name.split(' ').map((part) => part[0]).join(''),
    role_line: '',
    relationship_roles: roles,
    job_title: null,
    organisation: null,
    organisations: [],
    warmth: 50,
    warmth_band: 'warm',
    relationship_state: 'steady',
    relationship_reasons: [],
    open_item_count: 0,
    you_owe_count: 0,
    they_owe_count: 0,
    next_label: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...extra
  };
}

function meeting(id: string, start: string, extra: Partial<MeetingRecord> = {}): MeetingRecord {
  return {
    schema_version: 1,
    id,
    title: `Meeting ${id}`,
    scheduled_start: start,
    scheduled_end: start,
    time_zone: 'Australia/Sydney',
    location_text: null,
    agenda: null,
    notes: null,
    state: 'scheduled',
    occurrence_history: [],
    created_at: start,
    updated_at: start,
    ...extra
  };
}

function sheet(personRef: string, updated: string): CoachingSheet {
  return {
    id: `coach_${updated}`,
    person_ref: personRef,
    person_name: 'x',
    technique_id: 'not-a-real-technique',
    steps: {},
    decision: 'keep',
    decided_at: updated,
    created_at: updated,
    updated_at: updated
  };
}

function mentorship(personRef: string, extra: Partial<MentorshipSummary> = {}): MentorshipSummary {
  return {
    schema_version: 1,
    id: `mentorship_${personRef.slice(-1)}`,
    person_ref: personRef,
    kind: 'accreditation',
    label: null,
    organisation_ref: null,
    focus: null,
    status: 'active',
    started_on: null,
    completed_on: null,
    outcome: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...extra
  };
}

const mentee = person('person_a', 'Sam Lee', [{ role: 'mentee', label: 'Accreditation', current: true }]);
const mentor = person('person_b', 'Jo Park', [{ role: 'mentor', label: 'Mentor', current: true }]);
const formerMentee = person('person_c', 'Ex Mentee', [{ role: 'mentee', label: 'Mentee', current: false }]);
const colleague = person('person_d', 'Al Coach', [{ role: 'colleague', label: 'Colleague', current: true }]);
const stranger = person('person_e', 'No Link', [{ role: 'colleague', label: 'Colleague', current: true }]);

describe('mentoring model', () => {
  const meetings = [
    meeting('m_old', '2026-08-01T00:00:00.000Z'),
    meeting('m_next', '2026-11-04T00:00:00.000Z'),
    meeting('m_cancel', '2026-10-20T00:00:00.000Z', { state: 'cancelled' }),
    meeting('m_coach', '2026-10-21T00:00:00.000Z', { coaching_sheets: [sheet(colleague.ref, '2026-10-21T01:00:00.000Z')] })
  ];

  it('picks current mentors and mentees, plus anyone a coaching sheet is about', () => {
    const ids = mentoringPeople([mentee, mentor, formerMentee, colleague, stranger], meetings).map((row) => row.id);
    expect(ids).toEqual(['person_a', 'person_b', 'person_d']);
  });

  it('builds sessions, coaching and catch-up state per relationship', () => {
    const cards = buildMentoringCards({
      people: [mentee, mentor, colleague],
      meetings,
      linkedMeetings: new Map([
        [mentee.ref, new Set(['m_old', 'm_cancel'])],
        [mentor.ref, new Set(['m_next', 'm_old'])]
      ]),
      now: NOW
    });
    const byId = new Map(cards.map((card) => [card.personId, card]));

    const a = byId.get('person_a')!;
    expect(a.kind).toBe('mentee');
    expect(a.detail).toBe('Accreditation');
    expect(a.lastSession?.meetingId).toBe('m_old');
    expect(a.nextSession).toBeNull();
    expect(a.dueCatchUp).toBe(true);

    const b = byId.get('person_b')!;
    expect(b.kind).toBe('mentor');
    expect(b.detail).toBeNull();
    expect(b.nextSession?.meetingId).toBe('m_next');
    expect(b.dueCatchUp).toBe(false);

    const d = byId.get('person_d')!;
    expect(d.kind).toBe('coachee');
    expect(d.sheetCount).toBe(1);
    expect(d.latestSheet?.meetingId).toBe('m_coach');
    expect(d.lastSession?.meetingId).toBe('m_coach');
    expect(d.dueCatchUp).toBe(false);

    expect(cards[0]!.personId).toBe('person_a');
  });

  it('reads the mentoring type from the relationship label until one is saved', () => {
    expect(mentorshipKindFromLabel('Accreditation', 'mentee')).toBe('accreditation');
    expect(mentorshipKindFromLabel('Highly Accomplished', 'mentee')).toBe('halt_highly_accomplished');
    expect(mentorshipKindFromLabel('HALT Lead', 'mentee')).toBe('halt_lead');
    expect(mentorshipKindFromLabel(null, 'coachee')).toBe('coaching');
    expect(mentorshipKindFromLabel(null, 'mentor')).toBe('other');

    const [card] = buildMentoringCards({ people: [mentee], meetings: [], now: NOW });
    expect(card!.type).toBe('accreditation');
    expect(card!.typeSaved).toBe(false);
    expect(card!.badge).toEqual({ style: 'crest', label: 'Accreditation mentor', organisationRef: null });
    expect(card!.status).toBe('active');
  });

  it('lets a saved mentorship set the badge, and keeps a finished one on the page', () => {
    const records = [
      mentorship(mentee.ref, { kind: 'halt_lead', focus: 'Lead submission' }),
      mentorship(formerMentee.ref, { status: 'completed', started_on: '2025-02-03', completed_on: '2026-11-12', outcome: 'Proficient achieved' })
    ];
    const people = [mentee, mentor, formerMentee, stranger];
    expect(mentoringPeople(people, [], records).map((row) => row.id)).toEqual(['person_a', 'person_b', 'person_c']);

    const cards = buildMentoringCards({ people, meetings: [], mentorships: records, now: NOW });
    const byId = new Map(cards.map((card) => [card.personId, card]));
    expect(byId.get('person_a')!.badge).toEqual({ style: 'halt', label: 'Lead' });
    expect(byId.get('person_a')!.typeSaved).toBe(true);
    expect(byId.get('person_a')!.focus).toBe('Lead submission');

    const done = byId.get('person_c')!;
    expect(done.status).toBe('completed');
    expect(done.kind).toBe('mentee');
    expect(done.outcome).toBe('Proficient achieved');
    // A finished mentorship never asks for a catch-up, and sorts after the active ones.
    expect(done.dueCatchUp).toBe(false);
    expect(cards[cards.length - 1]!.personId).toBe('person_c');
  });

  it('prefers a person\'s active mentorship over an earlier finished one', () => {
    const records = [
      mentorship(mentee.ref, { id: 'mentorship_old', status: 'completed', updated_at: '2026-09-01T00:00:00.000Z' }),
      mentorship(mentee.ref, { id: 'mentorship_new', kind: 'halt_highly_accomplished', updated_at: '2026-03-01T00:00:00.000Z' })
    ];
    const [card] = buildMentoringCards({ people: [mentee], meetings: [], mentorships: records, now: NOW });
    expect(card!.mentorshipId).toBe('mentorship_new');
    expect(card!.badge).toEqual({ style: 'halt', label: 'Highly Accomplished' });
  });

  it('reads dates relative to now', () => {
    expect(relativeDays('2026-10-28T10:00:00.000Z', NOW)).toBe('today');
    expect(relativeDays('2026-10-31T00:00:00.000Z', NOW)).toBe('in 3 days');
    expect(relativeDays('2026-09-30T00:00:00.000Z', NOW)).toBe('4 weeks ago');
  });
});

describe('mentoring route', () => {
  it('parses #/mentoring and highlights its own rail item', () => {
    expect(parseRoute('#/mentoring')).toEqual({ name: 'mentoring' });
    expect(railHighlightFor({ name: 'mentoring' })).toBe('mentoring');
  });

  it('parses one person\'s mentoring page and keeps the Mentoring rail item lit', () => {
    const id = 'person_00000000-0000-4000-8000-0000000000f1';
    expect(mentoringPersonRoute(id)).toBe(`#/mentoring/${id}`);
    expect(parseRoute(mentoringPersonRoute(id))).toEqual({ name: 'mentoring-person', id });
    expect(railHighlightFor({ name: 'mentoring-person', id })).toBe('mentoring');
    expect(parseRoute('#/mentoring/..%2Fsecrets').name).toBe('not-found');
  });
});

describe('renderMentoringView', () => {
  beforeEach(() => {
    vi.mocked(listUniversalLinksForEntities).mockImplementation(async (refs: string[]) => ({
      results: Object.fromEntries(
        refs.map((ref) => [
          ref,
          {
            outgoing:
              ref === mentee.ref
                ? [
                    {
                      link: { id: 'l1', source_ref: ref, target_ref: 'professional:meeting:m_next', relationship_type: 'attended', status: 'current' },
                      endpoint: { ref: 'professional:meeting:m_next', kind: 'meeting', display_label: '' },
                      direction: 'outgoing' as const
                    }
                  ]
                : [],
            incoming: []
          }
        ])
      )
    }));
    vi.mocked(fetchPeopleDirectorySnapshot).mockResolvedValue(null);
    vi.mocked(peekPeopleDirectory).mockReturnValue(null);
    vi.mocked(listMeetings).mockResolvedValue({ meetings: [meeting('m_next', '2026-11-04T00:00:00.000Z')] });
    vi.mocked(listMentorships).mockResolvedValue({ mentorships: [] });
  });

  afterEach(() => vi.clearAllMocks());

  it('shows one card per relationship, split into who you support and who supports you', async () => {
    vi.mocked(fetchPeopleDirectory).mockResolvedValue({
      people: [mentee, mentor, stranger],
      organisations: [],
      counts: { people: 3, organisations: 0 }
    });
    const canvas = document.createElement('main');
    await renderMentoringView(canvas, { now: () => NOW });

    const titles = [...canvas.querySelectorAll('.mentoring-section__title')].map((node) => node.textContent);
    expect(titles).toEqual(['People you support', 'People who support you']);
    const card = canvas.querySelector<HTMLElement>('.mentor-card[data-person-id="person_a"]')!;
    expect(card.textContent).toContain('Accreditation');
    expect(card.querySelector('a[href="#/meeting/m_next"]')).not.toBeNull();
    expect(canvas.querySelector('.mentor-card[data-person-id="person_e"]')).toBeNull();
    expect(canvas.querySelector('.mentor-card[data-person-id="person_b"] .mentor-card__nudge')?.textContent).toBe('No sessions on record yet');
    expect(listUniversalLinksForEntities).toHaveBeenCalledTimes(1);
    expect(vi.mocked(listUniversalLinksForEntities).mock.calls[0]![0]).toHaveLength(2);
  });

  it('badges each card with its mentoring type and opens the person\'s mentoring page', async () => {
    const halt = person('person_f', 'Kit Moss', [{ role: 'mentee', label: 'Mentee', current: true }]);
    vi.mocked(fetchPeopleDirectory).mockResolvedValue({
      people: [mentee, halt, formerMentee],
      organisations: [],
      counts: { people: 3, organisations: 0 }
    });
    vi.mocked(listMentorships).mockResolvedValue({
      mentorships: [
        mentorship(halt.ref, { kind: 'halt_highly_accomplished' }),
        mentorship(formerMentee.ref, { status: 'completed', started_on: '2025-02-03', completed_on: '2026-11-12', outcome: 'Proficient achieved' })
      ]
    });
    const canvas = document.createElement('main');
    await renderMentoringView(canvas, { now: () => NOW });

    const accreditation = canvas.querySelector<HTMLElement>('.mentor-card[data-person-id="person_a"]')!;
    expect(accreditation.querySelector('[data-badge="crest"]')?.textContent).toContain('Accreditation mentor');
    expect(accreditation.querySelector<HTMLAnchorElement>('.mentor-card__name')!.getAttribute('href')).toBe('#/mentoring/person_a');
    expect(accreditation.querySelector<HTMLAnchorElement>('.btn--primary')!.getAttribute('href')).toBe('#/mentoring/person_a');

    const haltBadge = canvas.querySelector<HTMLElement>('.mentor-card[data-person-id="person_f"] [data-badge="halt"]')!;
    expect(haltBadge.getAttribute('aria-label')).toBe('NSW HALT: Highly Accomplished');
    expect(haltBadge.textContent).toBe('HALTNSWHighly Accomplished');

    // Finished mentoring leaves the cards and sits in its own section, records intact.
    expect(canvas.querySelector('.mentor-card[data-person-id="person_c"]')).toBeNull();
    const titles = [...canvas.querySelectorAll('.mentoring-section__title')].map((node) => node.textContent);
    expect(titles).toEqual(['People you support', 'Completed']);
    const row = canvas.querySelector<HTMLElement>('.mentoring-done__row[data-person-id="person_c"]')!;
    expect(row.querySelector('.mentoring-done__when')?.textContent).toBe('03/02/25 to 12/11/26 · Proficient achieved');
    expect(row.querySelector<HTMLAnchorElement>('.mentoring-done__open')!.getAttribute('href')).toBe('#/mentoring/person_c');
    expect(canvas.querySelector('.mentoring-summary')?.textContent).toMatch(/2 you support .* 1 completed/);
  });

  it('still lists everyone when saved mentorships fail to load', async () => {
    vi.mocked(fetchPeopleDirectory).mockResolvedValue({ people: [mentee], organisations: [], counts: { people: 1, organisations: 0 } });
    vi.mocked(listMentorships).mockRejectedValue(new Error('down'));
    const canvas = document.createElement('main');
    await renderMentoringView(canvas, { now: () => NOW });
    expect(canvas.querySelector('.mentor-card[data-person-id="person_a"]')).not.toBeNull();
  });

  it('explains how to add someone when there are no relationships', async () => {
    vi.mocked(fetchPeopleDirectory).mockResolvedValue({ people: [stranger], organisations: [], counts: { people: 1, organisations: 0 } });
    const canvas = document.createElement('main');
    await renderMentoringView(canvas, { now: () => NOW });
    expect(canvas.querySelector('.mentoring-empty')?.textContent).toMatch(/Mentor or Mentee/);
    expect(canvas.querySelector('.mentor-card')).toBeNull();
  });

  it('paints from the saved people copy, then repaints when the fresh scan adds someone', async () => {
    let finishScan: (value: Awaited<ReturnType<typeof fetchPeopleDirectory>>) => void = () => {};
    vi.mocked(fetchPeopleDirectory).mockReturnValue(new Promise((resolve) => (finishScan = resolve)));
    vi.mocked(fetchPeopleDirectorySnapshot).mockResolvedValue({
      as_of: '2026-10-28T08:00:00.000Z',
      people: [mentee, stranger],
      organisations: [],
      counts: { people: 2, organisations: 0 }
    });
    const canvas = document.createElement('main');
    const done = renderMentoringView(canvas, { now: () => NOW });
    await vi.waitFor(() => expect(canvas.querySelector('.mentor-card[data-person-id="person_a"]')).not.toBeNull());
    expect(canvas.querySelector('.mentor-card[data-person-id="person_b"]')).toBeNull();

    finishScan({ people: [mentee, mentor, stranger], organisations: [], counts: { people: 3, organisations: 0 } });
    await done;
    expect(canvas.querySelector('.mentor-card[data-person-id="person_b"]')).not.toBeNull();
    // The mentee's links were read once, for the first paint, and reused.
    expect(vi.mocked(listUniversalLinksForEntities).mock.calls.flatMap(([refs]) => refs).filter((ref) => ref === mentee.ref)).toHaveLength(1);
  });

  it('starts the fresh scan only after the saved copy is back', async () => {
    let finishSnapshot: (value: Awaited<ReturnType<typeof fetchPeopleDirectorySnapshot>>) => void = () => {};
    vi.mocked(fetchPeopleDirectorySnapshot).mockReturnValue(new Promise((resolve) => (finishSnapshot = resolve)));
    vi.mocked(fetchPeopleDirectory).mockResolvedValue({ people: [mentee], organisations: [], counts: { people: 1, organisations: 0 } });
    const canvas = document.createElement('main');
    const done = renderMentoringView(canvas, { now: () => NOW });
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchPeopleDirectory).not.toHaveBeenCalled();
    finishSnapshot(null);
    await done;
    expect(fetchPeopleDirectory).toHaveBeenCalledTimes(1);
    expect(canvas.querySelector('.mentor-card[data-person-id="person_a"]')).not.toBeNull();
  });

  it('keeps the saved copy on screen when the fresh scan fails', async () => {
    vi.mocked(fetchPeopleDirectory).mockRejectedValue(new Error('scan failed'));
    vi.mocked(fetchPeopleDirectorySnapshot).mockResolvedValue({
      as_of: '2026-10-28T08:00:00.000Z',
      people: [mentee],
      organisations: [],
      counts: { people: 1, organisations: 0 }
    });
    const canvas = document.createElement('main');
    await renderMentoringView(canvas, { now: () => NOW });
    expect(canvas.querySelector('.mentor-card[data-person-id="person_a"]')).not.toBeNull();
  });

  it('shows the load error when there is neither a saved copy nor a fresh scan', async () => {
    vi.mocked(fetchPeopleDirectory).mockRejectedValue(new Error('scan failed'));
    const canvas = document.createElement('main');
    await renderMentoringView(canvas, { now: () => NOW });
    expect(canvas.querySelector('.mentor-card')).toBeNull();
    expect(canvas.textContent).toMatch(/scan failed|couldn|try again/i);
  });
});
