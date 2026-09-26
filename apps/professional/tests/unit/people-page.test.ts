import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderPeoplePage } from '@/views/people';
import { parseRoute, personRoute, peopleRoute } from '@/app/router';

const PERSON_ID = 'person_00000000-0000-4000-8000-000000000001';

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

describe('people redesign Phase 1 routes', () => {
  it('parses #/people and #/people/<id>', () => {
    expect(parseRoute('#/people')).toEqual({ name: 'people', id: null });
    expect(parseRoute(`#/people/${PERSON_ID}`)).toEqual({ name: 'people', id: PERSON_ID });
  });

  it('builds canonical people routes', () => {
    expect(personRoute(PERSON_ID)).toBe(`#/people/${PERSON_ID}`);
    expect(peopleRoute(null)).toBe('#/people');
    expect(peopleRoute(PERSON_ID, '?sort=az')).toBe(`#/people/${PERSON_ID}?sort=az`);
  });
});

describe('renderPeoplePage (W2 real entry)', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        if (url.includes('/api/people/directory')) {
          return jsonResponse({
            people: [
              {
                id: PERSON_ID,
                ref: `shared:person:${PERSON_ID}`,
                display_name: 'Henry McLennan',
                initials: 'HM',
                role_line: 'Mentee',
                relationship_roles: [{ role: 'mentee', label: 'Mentee', current: true }],
                organisation: {
                  ref: 'shared:organisation:organisation_00000000-0000-4000-8000-000000000002',
                  display_name: 'St. Aloysius College',
                  monogram: 'SAC',
                  logo_key: null,
                  current: true
                },
                organisations: [],
                warmth: 62,
                warmth_band: 'warm',
                relationship_state: 'active',
                relationship_reasons: ['Recent contact'],
                open_item_count: 0,
                you_owe_count: 0,
                they_owe_count: 0,
                next_label: null,
                created_at: '2026-09-01T00:00:00.000Z',
                updated_at: '2026-09-20T00:00:00.000Z'
              }
            ],
            organisations: [],
            counts: { people: 1, organisations: 1 }
          });
        }
        if (url.includes('/api/entities/overview')) {
          return jsonResponse({
            entity: {
              schema_version: 1,
              id: PERSON_ID,
              kind: 'person',
              display_name: 'Henry McLennan',
              sort_name: null,
              aliases: [],
              lifecycle_status: 'active',
              is_self: false,
              retention_reason: null,
              retention_review_at: null,
              created_at: '2026-09-01T00:00:00.000Z',
              updated_at: '2026-09-20T00:00:00.000Z',
              ref: `shared:person:${PERSON_ID}`
            },
            current_relationships: [],
            historical_relationships: [],
            linked_records: { tasks: [], communications: [], meetings: [], events: [], applications: [] },
            timeline: []
          });
        }
        if (url.includes('/api/people/brief')) {
          return jsonResponse({
            header: {
              person: { ref: `shared:person:${PERSON_ID}`, display_name: 'Henry McLennan', href: null },
              role: null,
              organisation: null,
              next_interaction: null
            },
            who_they_are: '',
            open_loops: [
              { ref: 'tasks:task:t1', label: 'Set up mentoring meeting', href: null, status: 'open' }
            ],
            current_shared_work: [],
            mutual_connections: []
          });
        }
        if (url.includes('/api/people/link-proposals')) {
          return jsonResponse({ proposals: [], count: 0 });
        }
        if (url.includes('/api/people/ledger')) {
          return jsonResponse({
            you_owe: [
              {
                id: 'derived:tasks:task:t1',
                text: 'Set up mentoring meeting',
                source_label: 'task',
                derived: true,
                status: 'open'
              }
            ],
            they_owe: [],
            you_owe_count: 1,
            they_owe_count: 0,
            open_item_count: 1
          });
        }
        if (url.includes('/api/people/remember')) {
          return jsonResponse({ facts: [], count: 0 });
        }
        if (url.includes('/api/people/today')) {
          return jsonResponse({
            day_key: '2026-09-28',
            slots: [
              {
                id: 'free:785',
                kind: 'free',
                title: 'Free',
                start_minutes: 785,
                end_minutes: 860,
                start_label: '1:05pm',
                people: [],
                suggested: true,
                suggestion_note: 'You usually meet Henry after lunch'
              }
            ],
            suggestion: {
              slot_id: 'free:785',
              note: 'You usually meet Henry after lunch',
              person_ref: `shared:person:${PERSON_ID}`
            }
          });
        }
        if (url.includes('/api/people/ask')) {
          return jsonResponse({
            mode: 'ask',
            answer: "I don't know enough about who knows that yet.",
            people: [],
            filter: null,
            source: 'test'
          });
        }
        return jsonResponse({});
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders one People h1 and directory rows as real links', async () => {
    const canvas = document.createElement('div');
    document.body.append(canvas);
    await renderPeoplePage(canvas, { selectedId: PERSON_ID });
    const titles = canvas.querySelectorAll('h1');
    expect(titles).toHaveLength(1);
    expect(titles[0]?.textContent).toBe('People');
    const row = canvas.querySelector(`a.people-page__row[href="#/people/${PERSON_ID}"]`);
    expect(row).toBeTruthy();
    // Full record disclosure starts collapsed (V1)
    const full = canvas.querySelector('details.people-pane__full') as HTMLDetailsElement | null;
    expect(full).toBeTruthy();
    expect(full?.open).toBe(false);
  });

  it('Remember empty offers Run now; Today strip mounts (Phases 5–7)', async () => {
    const canvas = document.createElement('div');
    document.body.append(canvas);
    await renderPeoplePage(canvas, { selectedId: PERSON_ID });
    const remember = canvas.querySelector('[data-section="remember"] .people-pane__section-body');
    expect(remember?.textContent).toMatch(/Ann hasn't found anything yet/);
    expect(remember?.querySelector('button.people-pane__run-ann')?.textContent).toBe('Run now');
    const today = canvas.querySelector('.people-page__today');
    expect(today).toBeTruthy();
    expect(today?.textContent).toMatch(/You usually meet Henry after lunch|Today/);
  });
});
