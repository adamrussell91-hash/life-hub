import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderOrganisationsView } from '@/views/organisations';
import { layoutOrganisationTimeline } from '@/domain/organisation-timeline';
import { layoutRelationshipArc } from '@/domain/relationship-arc';

const ORG_ID = 'organisation_00000000-0000-4000-8000-000000000002';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

const directoryPayload = {
  ok: true,
  data: {
    organisations: [
      {
        id: ORG_ID,
        ref: `shared:organisation:${ORG_ID}`,
        display_name: 'Example University',
        legal_name: null,
        logo_key: null,
        monogram: 'EU',
        chips: [
          { kind: 'workplace', label: 'Workplace', detail: '2023–now', filterBucket: 'work' }
        ],
        people_count: 1,
        people: [
          {
            id: 'person_1',
            display_name: 'Seth',
            warmth_band: 'warm',
            warmth: 70,
            first_link_at: '2023-01-15T00:00:00.000Z'
          }
        ],
        warmth_spread: { warm: 1, cooling: 0, cold: 0, total: 1 },
        arc_points: [{ id: 'person_1', at: '2023-01-15T00:00:00.000Z', label: '1' }],
        is_current_workplace: true,
        first_touch_at: '2023-01-15T00:00:00.000Z',
        last_activity_at: '2026-01-01T00:00:00.000Z',
        timeline_lanes: [],
        created_at: '2020-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z'
      }
    ],
    counts: { organisations: 1, people: 1 }
  }
};

describe('renderOrganisationsView (W2)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(200, directoryPayload));
    location.hash = '#/organisations';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders crest wall with filter pills and tile anchors', async () => {
    const canvas = document.createElement('div');
    document.body.append(canvas);
    await renderOrganisationsView(canvas);
    expect(canvas.querySelector('.orgs-page__title')?.textContent).toBe('Organisations');
    expect(canvas.querySelectorAll('.orgs-page__pill').length).toBe(6);
    const tile = canvas.querySelector('a.orgs-tile') as HTMLAnchorElement | null;
    expect(tile).not.toBeNull();
    expect(tile?.getAttribute('href')).toContain(`#/organisations/${ORG_ID}`);
    canvas.remove();
  });
});

describe('arc / timeline getBBox collision (C1)', () => {
  it('layoutRelationshipArc does not place overlapping showLabel pairs', () => {
    const layout = layoutRelationshipArc([
      { id: 'a', at: '2020-01-01T00:00:00.000Z', label: 'Joined' },
      { id: 'b', at: '2020-01-02T00:00:00.000Z', label: 'Also joined very close' },
      { id: 'c', at: '2024-06-01T00:00:00.000Z', label: 'Later' }
    ]);
    const shown = layout.points.filter((p) => p.showLabel);
    for (let i = 1; i < shown.length; i++) {
      const prev = shown[i - 1]!;
      const cur = shown[i]!;
      const approx = (label: string) => Math.min(160, 6 + label.length * 6.2);
      const overlapX =
        Math.abs(cur.labelX - prev.labelX) < (approx(prev.label) + approx(cur.label)) / 2;
      const overlapY = Math.abs(cur.labelY - prev.labelY) < 14;
      expect(overlapX && overlapY).toBe(false);
    }
  });

  it('organisation timeline collision hides overlapping labels', () => {
    const layout = layoutOrganisationTimeline({
      lanes: [
        {
          id: '1',
          kind: 'events',
          label: 'PD Day One Long',
          start: '2024-01-01T00:00:00.000Z',
          end: null
        },
        {
          id: '2',
          kind: 'events',
          label: 'PD Day Two Long',
          start: '2024-01-02T00:00:00.000Z',
          end: null
        }
      ],
      peopleSteps: [],
      domainStart: '2023-01-01T00:00:00.000Z',
      domainEnd: '2026-01-01T00:00:00.000Z'
    });
    const events = layout.lanes.find((l) => l.id === 'events');
    expect(events).toBeTruthy();
    const visible = events!.points.filter((p) => p.showLabel).length;
    expect(visible).toBeLessThan(events!.points.length);
  });
});
