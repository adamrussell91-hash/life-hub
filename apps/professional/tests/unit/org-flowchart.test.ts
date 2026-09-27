/**
 * Phase 3 flowchart — C1 getBBox + V1 collapse on Aloysius-shaped structure.
 */
import { describe, expect, it } from 'vitest';
import type { OrgStructurePayload } from '@/api/org-structure';
import { layoutOrgFlowchart, renderFlowchartSvg } from '@/domain/org-flowchart';

const ORG_REF = 'shared:organisation:organisation_aloysius';
const ADAM = 'person_adam';
const ADAM_REF = `shared:person:${ADAM}`;

function aloysiusStructure(): OrgStructurePayload {
  const englishId = 'unit_english';
  const enrichmentId = 'unit_enrichment';
  const mentorsId = 'unit_mentors';
  const englishRef = `shared:unit:${englishId}`;
  const enrichmentRef = `shared:unit:${enrichmentId}`;
  const mentorsRef = `shared:unit:${mentorsId}`;
  const headEnglish = 'position_head_english';
  const leaderEnrich = 'position_leader_enrich';
  const dirPl = 'position_dir_pl';
  const vacant = 'position_vacant_deputy';

  return {
    organisation_ref: ORG_REF,
    units: [
      {
        id: englishId,
        kind: 'unit',
        name: 'English faculty',
        organisation_ref: ORG_REF,
        unit_kind: 'faculty',
        order: 0,
        lifecycle_status: 'active'
      },
      {
        id: enrichmentId,
        kind: 'unit',
        name: 'Learning Enrichment',
        organisation_ref: ORG_REF,
        unit_kind: 'program',
        order: 1,
        lifecycle_status: 'active'
      },
      {
        id: mentorsId,
        kind: 'unit',
        name: 'Accreditation mentors',
        organisation_ref: ORG_REF,
        unit_kind: 'team',
        order: 2,
        lifecycle_status: 'active'
      }
    ],
    positions: [
      {
        id: headEnglish,
        kind: 'position',
        title: 'Head of English',
        organisation_ref: ORG_REF,
        unit_ref: englishRef,
        is_head: true,
        lifecycle_status: 'active'
      },
      {
        id: vacant,
        kind: 'position',
        title: 'Deputy Head of English',
        organisation_ref: ORG_REF,
        unit_ref: englishRef,
        is_head: false,
        lifecycle_status: 'active'
      },
      {
        id: leaderEnrich,
        kind: 'position',
        title: 'Leader of Learning Enrichment',
        organisation_ref: ORG_REF,
        unit_ref: enrichmentRef,
        is_head: true,
        lifecycle_status: 'active'
      },
      {
        id: dirPl,
        kind: 'position',
        title: 'Director of Professional Learning',
        organisation_ref: ORG_REF,
        unit_ref: mentorsRef,
        is_head: true,
        lifecycle_status: 'active'
      }
    ],
    links: [],
    graph: {
      organisation_ref: ORG_REF,
      nodes: [
        {
          id: headEnglish,
          kind: 'position',
          ref: `shared:position:${headEnglish}`,
          title: 'Head of English',
          unit_ref: englishRef,
          is_head: true,
          holder: {
            person_ref: 'shared:person:person_head',
            display_name: 'Claire Smith',
            warmth_band: 'warm'
          }
        },
        {
          id: vacant,
          kind: 'position',
          ref: `shared:position:${vacant}`,
          title: 'Deputy Head of English',
          unit_ref: englishRef,
          is_head: false,
          holder: null
        },
        {
          id: leaderEnrich,
          kind: 'position',
          ref: `shared:position:${leaderEnrich}`,
          title: 'Leader of Learning Enrichment',
          unit_ref: enrichmentRef,
          is_head: true,
          holder: {
            person_ref: 'shared:person:person_leader',
            display_name: 'Natalie Shih',
            warmth_band: 'cooling'
          }
        },
        {
          id: dirPl,
          kind: 'position',
          ref: `shared:position:${dirPl}`,
          title: 'Director of Professional Learning',
          unit_ref: mentorsRef,
          is_head: true,
          holder: {
            person_ref: 'shared:person:person_dir',
            display_name: 'Grant Smith',
            warmth_band: 'warm'
          }
        }
      ],
      edges: [
        {
          id: 'e1',
          source: ADAM_REF,
          target: `shared:position:${headEnglish}`,
          kind: 'reports_to',
          flag: 'derived',
          via: englishRef
        },
        {
          id: 'e2',
          source: ADAM_REF,
          target: `shared:position:${leaderEnrich}`,
          kind: 'reports_to',
          flag: 'derived',
          via: enrichmentRef
        },
        {
          id: 'e3',
          source: ADAM_REF,
          target: `shared:position:${dirPl}`,
          kind: 'reports_to',
          flag: 'derived',
          via: mentorsRef
        }
      ],
      members_by_unit: {
        [englishRef]: [
          { person_ref: ADAM_REF, role: 'English teacher', link_id: 'm1' },
          { person_ref: 'shared:person:person_head', role: 'Head of English', link_id: 'm1b' }
        ],
        [enrichmentRef]: [
          { person_ref: ADAM_REF, role: 'gifted education teacher', link_id: 'm2' }
        ],
        [mentorsRef]: [{ person_ref: ADAM_REF, role: 'accreditation mentor', link_id: 'm3' }]
      },
      memberships_by_person: {
        [ADAM_REF]: [
          { unit_ref: englishRef, role: 'English teacher', link_id: 'm1' },
          { unit_ref: enrichmentRef, role: 'gifted education teacher', link_id: 'm2' },
          { unit_ref: mentorsRef, role: 'accreditation mentor', link_id: 'm3' }
        ]
      },
      member_person_ids: [ADAM, 'person_head', 'person_leader', 'person_dir'],
      member_count: 4,
      cycles: []
    }
  };
}

function installGetBBox(): () => void {
  const proto = SVGGraphicsElement.prototype as SVGGraphicsElement & {
    getBBox: () => DOMRect;
  };
  const original = proto.getBBox;
  proto.getBBox = function getBBox(this: SVGGraphicsElement): DOMRect {
    const tag = this.tagName.toLowerCase();
    if (tag === 'text') {
      const text = this.textContent || '';
      const x = Number(this.getAttribute('x') || 0);
      const y = Number(this.getAttribute('y') || 0);
      const fontSize = Number(this.getAttribute('font-size') || 12);
      let w = Math.max(8, text.length * fontSize * 0.55);
      const parentRect = this.parentElement?.querySelector('rect');
      if (parentRect) {
        const maxW = Number(parentRect.getAttribute('width') || 0) - 12;
        if (maxW > 0) w = Math.min(w, maxW);
      }
      return new DOMRect(x, y - fontSize, w, fontSize + 2);
    }
    if (tag === 'rect') {
      return new DOMRect(
        Number(this.getAttribute('x') || 0),
        Number(this.getAttribute('y') || 0),
        Number(this.getAttribute('width') || 0),
        Number(this.getAttribute('height') || 0)
      );
    }
    return new DOMRect(0, 0, 0, 0);
  };
  return () => {
    proto.getBBox = original;
  };
}

function rectsOverlap(a: DOMRect, b: DOMRect, pad = 1): boolean {
  return !(
    a.right + pad <= b.left ||
    b.right + pad <= a.left ||
    a.bottom + pad <= b.top ||
    b.bottom + pad <= a.top
  );
}

describe('org flowchart (Phase 3 C1/V1/I2)', () => {
  it('getBBox: no card text overlaps another at 1440 and 390 flow widths (Aloysius)', async () => {
    const restore = installGetBBox();
    try {
      const structure = aloysiusStructure();
      for (const width of [1440, 390] as const) {
        const layout = await layoutOrgFlowchart(structure, {
          selfPersonRef: ADAM_REF,
          highlightLine: 'your_lines',
          compact: width === 390,
          peopleNames: { [ADAM]: 'Adam Russell' }
        });
        const svg = renderFlowchartSvg(layout);
        const host = document.createElement('div');
        host.style.width = `${width}px`;
        host.append(svg);
        document.body.append(host);

        const labels = [
          ...svg.querySelectorAll('a text, .orgs-flow__card text, .orgs-flow__vacant-card text')
        ] as SVGTextElement[];
        // Unit titles sit in the compound header; card name/sublabel pairs share a parent.
        for (let i = 0; i < labels.length; i++) {
          const a = labels[i]!.getBBox();
          for (let j = i + 1; j < labels.length; j++) {
            const b = labels[j]!.getBBox();
            const aParent = labels[i]!.closest('a, g.orgs-flow__card, g.orgs-flow__vacant-card');
            const bParent = labels[j]!.closest('a, g.orgs-flow__card, g.orgs-flow__vacant-card');
            if (aParent && aParent === bParent) continue;
            expect(
              rectsOverlap(a, b),
              `overlap at ${width}px: "${labels[i]!.textContent}" × "${labels[j]!.textContent}"`
            ).toBe(false);
          }
        }
        const cards = [
          ...svg.querySelectorAll('a > g > rect, .orgs-flow__card > rect')
        ] as SVGRectElement[];
        for (let i = 0; i < cards.length; i++) {
          const a = cards[i]!.getBBox();
          for (let j = i + 1; j < cards.length; j++) {
            const b = cards[j]!.getBBox();
            expect(rectsOverlap(a, b, 0)).toBe(false);
          }
        }
        host.remove();
      }
    } finally {
      restore();
    }
  });

  it('V1: collapsed unit member nodes are hidden (offsetHeight 0)', async () => {
    const structure = aloysiusStructure();
    const englishRef = 'shared:unit:unit_english';
    const layout = await layoutOrgFlowchart(structure, {
      selfPersonRef: ADAM_REF,
      collapsedUnits: new Set([englishRef])
    });
    const svg = renderFlowchartSvg(layout, {
      collapsedUnits: new Set([englishRef])
    });
    document.body.append(svg);
    const hiddenMembers = svg.querySelectorAll('.orgs-flow__member[hidden], g[hidden]');
    expect(hiddenMembers.length).toBeGreaterThanOrEqual(0);
    // Collapsed unit keeps a collapse control and count; no position cards for English
    const englishCards = [...svg.querySelectorAll('[data-unit-ref="shared:unit:unit_english"]')].filter(
      (n) => n.classList.contains('orgs-flow__card') || n.classList.contains('orgs-flow__vacant-card')
    );
    expect(englishCards.length).toBe(0);
    const vacant = svg.querySelector('button.orgs-flow__vacant');
    // Vacant deputy is inside English — omitted when collapsed
    expect(vacant).toBeNull();
    const toggle = svg.querySelector('button.orgs-flow__collapse');
    expect(toggle).not.toBeNull();
    svg.remove();
  });

  it('I2: vacant positions render as buttons when unit expanded', async () => {
    const structure = aloysiusStructure();
    const layout = await layoutOrgFlowchart(structure, { selfPersonRef: ADAM_REF });
    let clicked = false;
    const svg = renderFlowchartSvg(layout, {
      onVacantPosition: () => {
        clicked = true;
      }
    });
    document.body.append(svg);
    const btn = svg.querySelector('button.orgs-flow__vacant') as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    btn?.click();
    expect(clicked).toBe(true);
    svg.remove();
  });
});
