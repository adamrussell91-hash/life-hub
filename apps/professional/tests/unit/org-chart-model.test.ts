import { describe, expect, it } from 'vitest';
import type { OrgStructurePayload } from '@/api/org-structure';
import {
  autoLayout,
  buildChartModel,
  describeLine,
  linePath,
  nextFreeSpot,
  reportingDepths,
  resolveLayout
} from '@/domain/org-chart-model';

const ORG = 'shared:organisation:organisation_1';

function payload(): OrgStructurePayload {
  const position = (id: string, title: string, lifecycle = 'active') => ({
    id,
    kind: 'position' as const,
    title,
    organisation_ref: ORG,
    unit_ref: null,
    is_head: false,
    lifecycle_status: lifecycle
  });
  const link = (id: string, type: string, source: string, target: string, status = 'current') => ({
    id,
    relationship_type: type,
    source_ref: source,
    target_ref: target,
    status
  });
  return {
    organisation_ref: ORG,
    units: [],
    positions: [
      position('p_principal', 'Principal'),
      position('p_deputy', 'Deputy'),
      position('p_head_eng', 'Head of English'),
      position('p_old', 'Old role', 'archived')
    ],
    links: [
      link('h1', 'holds_position', 'shared:person:jo', 'shared:position:p_principal'),
      link('h2', 'holds_position', 'shared:person:sam', 'shared:position:p_deputy', 'ended'),
      link('r1', 'reports_to', 'shared:position:p_deputy', 'shared:position:p_principal'),
      link('r2', 'reports_to', 'shared:position:p_head_eng', 'shared:position:p_deputy'),
      link('r3', 'reports_to', 'shared:position:p_old', 'shared:position:p_principal'),
      link('w1', 'works_with', 'shared:position:p_deputy', 'shared:position:p_head_eng', 'ended')
    ],
    graph: {
      organisation_ref: ORG,
      nodes: [
        {
          id: 'shared:position:p_principal',
          kind: 'position',
          ref: 'shared:position:p_principal',
          holder: { person_ref: 'shared:person:jo', display_name: 'Jo Principal', warmth_band: null }
        }
      ],
      edges: [],
      members_by_unit: {},
      memberships_by_person: {},
      member_person_ids: [],
      member_count: 0,
      cycles: []
    }
  };
}

describe('buildChartModel', () => {
  it('makes one box per active role, named by its current holder', () => {
    const { boxes } = buildChartModel(payload());
    expect(boxes.map((b) => b.title)).toEqual(['Principal', 'Deputy', 'Head of English']);
    expect(boxes[0]).toMatchObject({ holderName: 'Jo Principal', holderLinkId: 'h1' });
    // Sam's holding ended — the Deputy box is vacant, not stale.
    expect(boxes[1]).toMatchObject({ holderRef: null, holderName: null });
  });

  it('keeps only current lines between boxes on the chart', () => {
    const { lines } = buildChartModel(payload());
    expect(lines.map((l) => l.id)).toEqual(['r1', 'r2']);
  });
});

describe('layout', () => {
  it('puts the boss on top and each report one row below', () => {
    const { boxes, lines } = buildChartModel(payload());
    const depth = reportingDepths(boxes, lines);
    expect(depth.get('shared:position:p_principal')).toBe(0);
    expect(depth.get('shared:position:p_deputy')).toBe(1);
    expect(depth.get('shared:position:p_head_eng')).toBe(2);
    const layout = autoLayout(boxes, lines);
    expect(layout['shared:position:p_principal']!.y).toBeLessThan(layout['shared:position:p_deputy']!.y);
    expect(layout['shared:position:p_deputy']!.y).toBeLessThan(layout['shared:position:p_head_eng']!.y);
  });

  it('never loops on a reporting cycle', () => {
    const boxes = buildChartModel(payload()).boxes;
    const depth = reportingDepths(boxes, [
      { id: 'a', kind: 'reports_to', source: boxes[0]!.ref, target: boxes[1]!.ref },
      { id: 'b', kind: 'reports_to', source: boxes[1]!.ref, target: boxes[0]!.ref }
    ]);
    expect(depth.size).toBe(3);
  });

  it('keeps saved positions and places new boxes on a fresh row', () => {
    const { boxes, lines } = buildChartModel(payload());
    const saved = { 'shared:position:p_principal': { x: 400, y: 40 } };
    const layout = resolveLayout(boxes, lines, saved);
    expect(layout['shared:position:p_principal']).toEqual({ x: 400, y: 40 });
    expect(layout['shared:position:p_deputy']!.y).toBeGreaterThan(40);
    const spot = nextFreeSpot(layout);
    expect(Object.values(layout).some((p) => p.x === spot.x && p.y === spot.y)).toBe(false);
  });
});

describe('lines', () => {
  it('draws a reporting line as an elbow from the boss down to the report', () => {
    const d = linePath('reports_to', { x: 0, y: 200 }, { x: 0, y: 0 });
    expect(d.startsWith('M 92 68')).toBe(true);
    expect(d.endsWith('V 200')).toBe(true);
  });

  it('describes every line in plain English', () => {
    const { boxes, lines } = buildChartModel(payload());
    expect(describeLine(lines[0]!, boxes)).toBe('Deputy reports to Jo Principal (Principal)');
  });
});
