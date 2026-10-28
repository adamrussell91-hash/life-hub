import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectoryPersonRow } from '@/api/people-directory';
import type { MeetingRecord } from '@/domain/types';
import type { CoachingSheet } from '@/guides/coaching-sheet';
import { buildMentoringCards, mentoringPeople, relativeDays } from '@/domain/mentoring-model';
import { parseRoute, railHighlightFor } from '@/app/router';

vi.mock('@/api/people-directory', () => ({ fetchPeopleDirectory: vi.fn() }));
vi.mock('@/api/meetings', () => ({ listMeetings: vi.fn() }));
vi.mock('@/api/entities', () => ({ fetchEntityOverview: vi.fn() }));

import { fetchPeopleDirectory } from '@/api/people-directory';
import { listMeetings } from '@/api/meetings';
import { fetchEntityOverview } from '@/api/entities';
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

  it('reads dates relative to now', () => {
    expect(relativeDays('2026-10-28T20:00:00.000Z', NOW)).toBe('today');
    expect(relativeDays('2026-10-31T00:00:00.000Z', NOW)).toBe('in 3 days');
    expect(relativeDays('2026-09-30T00:00:00.000Z', NOW)).toBe('4 weeks ago');
  });
});

describe('mentoring route', () => {
  it('parses #/mentoring and highlights its own rail item', () => {
    expect(parseRoute('#/mentoring')).toEqual({ name: 'mentoring' });
    expect(railHighlightFor({ name: 'mentoring' })).toBe('mentoring');
  });
});

describe('renderMentoringView', () => {
  beforeEach(() => {
    vi.mocked(fetchEntityOverview).mockImplementation(async (ref: string) => ({
      entity: {} as never,
      current_relationships: [],
      historical_relationships: [],
      timeline: [],
      linked_records: {
        tasks: [],
        communications: [],
        organisations: [],
        people: [],
        meetings:
          ref === mentee.ref
            ? [{ ref: 'professional:meeting:m_next', kind: 'meeting', display_label: '', supporting_label: null, href: null, lifecycle_status: null, visibility: 'private' }]
            : []
      }
    }));
    vi.mocked(listMeetings).mockResolvedValue({ meetings: [meeting('m_next', '2026-11-04T00:00:00.000Z')] });
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
    expect(fetchEntityOverview).toHaveBeenCalledTimes(2);
  });

  it('explains how to add someone when there are no relationships', async () => {
    vi.mocked(fetchPeopleDirectory).mockResolvedValue({ people: [stranger], organisations: [], counts: { people: 1, organisations: 0 } });
    const canvas = document.createElement('main');
    await renderMentoringView(canvas, { now: () => NOW });
    expect(canvas.querySelector('.mentoring-empty')?.textContent).toMatch(/Mentor or Mentee/);
    expect(canvas.querySelector('.mentor-card')).toBeNull();
  });
});
