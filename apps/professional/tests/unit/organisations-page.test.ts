import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderOrganisationsView } from '@/views/organisations';
import { renderOrganisationPage } from '@/views/organisation-page';
import {
  layoutOrganisationTimeline,
  renderOrganisationTimelineSvg
} from '@/domain/organisation-timeline';
import {
  layoutOrganisationSpark,
  organisationSparkX,
  renderOrganisationSparkSvg,
  ORG_SPARK_DOMAIN_START
} from '@/domain/organisation-spark';
import { buildOrganisationModel } from '@/domain/organisation-model';

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
        undated_people_count: 0,
        warmth_spread: { warm: 1, cooling: 0, cold: 0, total: 1 },
        arc_points: [{ id: 'person_1', at: '2023-01-15T00:00:00.000Z' }],
        is_current_workplace: true,
        first_touch_at: '2023-01-15T00:00:00.000Z',
        first_touch_kind: 'first_contact',
        last_activity_at: '2026-01-01T00:00:00.000Z',
        timeline_lanes: [
          {
            id: 'lane_1',
            kind: 'work_study',
            label: 'Gifted Education Teacher',
            start: '2025-01-22T00:00:00.000Z',
            end: null
          }
        ],
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
    expect(canvas.querySelector('.orgs-opps__empty')?.textContent).toBe('No opportunities yet.');
    expect(canvas.textContent).not.toMatch(/Phase [0-9]|arrives in|is built|coming soon/);
    canvas.remove();
  });
});

describe('organisation page A5 / Part B wired controls', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/organisations/directory')) {
        return jsonResponse(200, directoryPayload);
      }
      if (url.includes('/api/org-structure')) {
        return jsonResponse(200, {
          ok: true,
          data: {
            organisation_ref: `shared:organisation:${ORG_ID}`,
            units: [],
            positions: [],
            links: [],
            graph: {
              organisation_ref: `shared:organisation:${ORG_ID}`,
              nodes: [],
              edges: [],
              members_by_unit: {},
              memberships_by_person: {},
              member_person_ids: [],
              member_count: 0,
              cycles: []
            }
          }
        });
      }
      if (url.includes('/api/opportunities')) {
        return jsonResponse(200, { ok: true, data: { opportunities: [] } });
      }
      if (url.includes('/api/organisation-read')) {
        return jsonResponse(200, {
          ok: true,
          data: {
            read: {
              organisation_ref: `shared:organisation:${ORG_ID}`,
              summary: '',
              threads: [],
              generated_at: null,
              updated_at: null,
              status: 'empty',
              error: null
            }
          }
        });
      }
      return jsonResponse(404, { ok: false, error: { code: 'not_found', message: 'missing' } });
    });
    location.hash = `#/organisations/${ORG_ID}`;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('wires Compare/Edit/Add structure/Run now live with no roadmap copy (I3/P4)', async () => {
    const canvas = document.createElement('div');
    document.body.append(canvas);
    await renderOrganisationPage(canvas, ORG_ID);
    expect(canvas.querySelectorAll('button[disabled]').length).toBe(0);
    expect(canvas.textContent).toMatch(/Compare with/);
    expect(canvas.textContent).toMatch(/Add structure/);
    expect(canvas.textContent).toMatch(/Run now/);
    expect(canvas.textContent).toContain('Add opportunity');
    expect(canvas.textContent).not.toMatch(/Phase [0-9]|arrives in|is built|coming soon/);
    expect(canvas.textContent).toContain("Ann hasn't read Example University yet.");
    expect(canvas.textContent).toContain('No opportunities yet.');
    const compare = canvas.querySelector('a.btn') as HTMLAnchorElement | null;
    expect(compare?.href || compare?.getAttribute('href') || '').toContain(
      '#/organisations/compare'
    );
    canvas.remove();
  });
});

describe('organisation spark (A1 / C5)', () => {
  const now = '2026-09-26T00:00:00.000Z';

  it('two orgs with different dates produce different path d-strings', () => {
    const a = layoutOrganisationSpark({
      points: [
        { id: '1', at: '2021-01-01T00:00:00.000Z' },
        { id: '2', at: '2022-06-01T00:00:00.000Z' },
        { id: '3', at: '2024-01-01T00:00:00.000Z' }
      ],
      now
    });
    const b = layoutOrganisationSpark({
      points: [
        { id: '1', at: '2023-01-01T00:00:00.000Z' },
        { id: '2', at: '2025-01-01T00:00:00.000Z' }
      ],
      now
    });
    expect(a.path).not.toBe(b.path);
    expect(a.path.length).toBeGreaterThan(0);
    expect(b.path.length).toBeGreaterThan(0);
  });

  it('shared-scale: same date lands on the same x on every tile', () => {
    const at = '2023-01-01T00:00:00.000Z';
    const xAlone = organisationSparkX(at, now);
    const layout = layoutOrganisationSpark({
      points: [
        { id: 'a', at: '2020-01-01T00:00:00.000Z' },
        { id: 'b', at },
        { id: 'c', at: '2025-01-01T00:00:00.000Z' }
      ],
      now
    });
    const point = layout.points.find((p) => p.id === 'b');
    expect(point?.x).toBeCloseTo(xAlone, 5);
  });

  it('spark SVG text nodes are only the two axis labels (C1)', () => {
    const proto = SVGGraphicsElement.prototype as SVGGraphicsElement & {
      getBBox: () => DOMRect;
    };
    const original = proto.getBBox;
    proto.getBBox = function getBBox(this: SVGGraphicsElement): DOMRect {
      if (this instanceof SVGTextElement) {
        const x = Number(this.getAttribute('x') ?? 0);
        const y = Number(this.getAttribute('y') ?? 0);
        const text = this.textContent ?? '';
        const w = Math.min(40, 6 + text.length * 6);
        return {
          x,
          y: y - 10,
          width: w,
          height: 12,
          bottom: y + 2,
          left: x,
          right: x + w,
          top: y - 10,
          toJSON() {
            return this;
          }
        };
      }
      return {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        bottom: 0,
        left: 0,
        right: 0,
        top: 0,
        toJSON() {
          return this;
        }
      };
    };

    try {
      const svg = renderOrganisationSparkSvg({
        points: [
          { id: 'a', at: '2020-01-01T00:00:00.000Z' },
          { id: 'b', at: '2023-06-01T00:00:00.000Z' },
          { id: 'c', at: '2025-01-01T00:00:00.000Z' }
        ],
        now
      });
      document.body.append(svg);
      const labels = [...svg.querySelectorAll('text')].map((t) => t.textContent);
      expect(labels).toEqual(['2019', 'now']);
      expect(svg.querySelectorAll('circle').length).toBe(1);
      svg.remove();
    } finally {
      proto.getBBox = original;
    }
  });

  it('domain start is 2019-01-01', () => {
    expect(ORG_SPARK_DOMAIN_START).toBe('2019-01-01T00:00:00.000Z');
  });
});

describe('organisation timeline A3/A4 (C6 / C1)', () => {
  it('open-ended work_study bar ends at the now x (C6)', () => {
    const domainEnd = '2026-09-26T00:00:00.000Z';
    const layout = layoutOrganisationTimeline({
      lanes: [
        {
          id: '1',
          kind: 'work_study',
          label: 'Gifted Education Teacher',
          start: '2025-01-22T00:00:00.000Z',
          end: null
        }
      ],
      peopleSteps: [],
      domainStart: '2019-01-01T00:00:00.000Z',
      domainEnd,
      width: 900
    });
    const work = layout.lanes.find((l) => l.id === 'work_study');
    expect(work?.bars.length).toBe(1);
    expect(work?.points.length).toBe(0);
    const bar = work!.bars[0]!;
    const nowX = 900 - 48;
    expect(bar.x + bar.w).toBeCloseTo(nowX, 0);
    expect(bar.labelInside || bar.labelX > bar.x).toBe(true);
  });

  it('uses rows × 32 + 24 axis height (C3)', () => {
    const layout = layoutOrganisationTimeline({
      lanes: [
        {
          id: '1',
          kind: 'work_study',
          label: 'English',
          start: '2021-01-01T00:00:00.000Z',
          end: null
        }
      ],
      peopleSteps: [{ at: '2021-01-01T00:00:00.000Z', count: 1, personId: 'a' }],
      domainStart: '2019-01-01T00:00:00.000Z',
      domainEnd: '2026-09-26T00:00:00.000Z'
    });
    expect(layout.height).toBe(3 * 32 + 24);
    expect(layout.peoplePath.startsWith('M')).toBe(true);
    expect(layout.peopleAreaPath.length).toBeGreaterThan(0);
    expect(layout.peopleCountLabel?.text).toBe('1 person');
  });

  it('getBBox: no timeline text intersects another or the SVG edge at 900 and 390', () => {
    const proto = SVGGraphicsElement.prototype as SVGGraphicsElement & {
      getBBox: () => DOMRect;
    };
    const original = proto.getBBox;
    proto.getBBox = function getBBox(this: SVGGraphicsElement): DOMRect {
      if (this instanceof SVGTextElement) {
        const x = Number(this.getAttribute('x') ?? 0);
        const y = Number(this.getAttribute('y') ?? 0);
        const anchor = this.getAttribute('text-anchor') ?? 'start';
        const text = this.textContent ?? '';
        const w = Math.min(200, 6 + text.length * 5.5);
        const left = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
        return {
          x: left,
          y: y - 10,
          width: w,
          height: 12,
          bottom: y + 2,
          left,
          right: left + w,
          top: y - 10,
          toJSON() {
            return this;
          }
        };
      }
      return {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        bottom: 0,
        left: 0,
        right: 0,
        top: 0,
        toJSON() {
          return this;
        }
      };
    };

    try {
      for (const width of [900, 390]) {
        const svg = renderOrganisationTimelineSvg({
          lanes: [
            {
              id: '1',
              kind: 'work_study',
              label: 'Gifted Education Teacher · since Jan 2025',
              start: '2025-01-22T00:00:00.000Z',
              end: null
            }
          ],
          peopleSteps: [
            { at: '2025-01-22T00:00:00.000Z', count: 1, personId: 'adam' }
          ],
          domainStart: '2019-01-01T00:00:00.000Z',
          domainEnd: '2026-09-26T00:00:00.000Z',
          width
        });
        document.body.append(svg);
        const labels = [...svg.querySelectorAll('text')];
        const vb = svg.viewBox.baseVal;
        for (let i = 0; i < labels.length; i++) {
          const a = labels[i]!.getBBox();
          expect(a.left).toBeGreaterThanOrEqual(-1);
          expect(a.right).toBeLessThanOrEqual(vb.width + 1);
          expect(a.top).toBeGreaterThanOrEqual(-2);
          expect(a.bottom).toBeLessThanOrEqual(vb.height + 2);
          for (let j = i + 1; j < labels.length; j++) {
            const b = labels[j]!.getBBox();
            const overlap =
              a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
            expect(overlap).toBe(false);
          }
        }
        // No per-person dots on the people line (A4).
        expect(svg.querySelectorAll('circle').length).toBe(0);
        svg.remove();
      }
    } finally {
      proto.getBBox = original;
    }
  });
});

describe('A8 header meta line', () => {
  it('says you started when firstTouchKind is you_started (D5)', () => {
    const model = buildOrganisationModel({
      id: ORG_ID,
      ref: `shared:organisation:${ORG_ID}`,
      displayName: 'St. Aloysius College',
      chips: [
        { kind: 'workplace', label: 'Workplace', detail: '2025–now', filterBucket: 'work' }
      ],
      people: [
        { id: 'adam', warmthBand: 'cold', firstLinkAt: '2025-01-22T00:00:00.000Z' },
        { id: 'undated', warmthBand: 'cold', firstLinkAt: null }
      ],
      firstTouchAt: '2025-01-22T00:00:00.000Z',
      firstTouchKind: 'you_started'
    });
    expect(model.metaLine).toBe('2 people · you started Jan 2025');
    expect(model.undatedPeopleCount).toBe(1);
  });
});
