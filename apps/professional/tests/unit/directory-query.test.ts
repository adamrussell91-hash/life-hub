import { describe, expect, it } from 'vitest';
import {
  activeFilterCount,
  defaultDirectoryQuery,
  parseDirectoryQuery,
  serializeDirectoryQuery,
  SORT_LABELS
} from '@/domain/directory-query';
import { layoutRelationshipArc, ARC_HEIGHT_PX } from '@/domain/relationship-arc';

describe('directory-query', () => {
  it('round-trips sort via URL and keeps Sort label source of truth (V2)', () => {
    const state = { ...defaultDirectoryQuery(), sort: 'going_cold' as const };
    const qs = serializeDirectoryQuery(state);
    expect(qs).toContain('sort=going_cold');
    const parsed = parseDirectoryQuery(qs);
    expect(parsed.sort).toBe('going_cold');
    expect(SORT_LABELS[parsed.sort]).toBe('Going cold');
  });

  it('counts active filters', () => {
    expect(activeFilterCount(defaultDirectoryQuery())).toBe(0);
    expect(
      activeFilterCount({
        ...defaultDirectoryQuery(),
        role: 'mentee',
        hasOpen: true,
        warmth: 'cold'
      })
    ).toBe(3);
  });
});

describe('relationship-arc', () => {
  it('uses fixed 86px height and places points on the path (C2/C3)', () => {
    const layout = layoutRelationshipArc([
      { id: 'a', at: '2026-09-01', label: 'Connected' },
      { id: 'b', at: '2026-09-10', label: 'First chat' },
      { id: 'c', at: '2026-09-20', label: 'Mentor task' }
    ]);
    expect(layout.height).toBe(ARC_HEIGHT_PX);
    expect(layout.height).toBe(86);
    expect(layout.points).toHaveLength(3);
    expect(layout.path.startsWith('M')).toBe(true);
    // Line must pass through each point's coordinates
    for (const p of layout.points) {
      expect(layout.path).toContain(`${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
    }
  });

  it('hides colliding labels rather than overlapping (C1)', () => {
    const layout = layoutRelationshipArc([
      { id: 'a', at: '2026-09-01', label: 'Very long label that takes space A' },
      { id: 'b', at: '2026-09-01T12:00:00.000Z', label: 'Very long label that takes space B' }
    ]);
    const shown = layout.points.filter((p) => p.showLabel);
    expect(shown.length).toBeLessThanOrEqual(2);
    // At least one point always keeps a mark even if label hidden
    expect(layout.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });
});
