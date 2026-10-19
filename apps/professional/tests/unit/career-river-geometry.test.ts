import { describe, expect, it } from 'vitest';
import {
  assignEmploymentLanes,
  axisYearTicks,
  branchPolyline,
  clampZoom,
  clusterMarks,
  riverHeightPx,
  riverJobShortLabel,
  layoutRoleSwimlanes,
  pastShareFor,
  placeBarLabel,
  swimlaneBlockPx,
  timeToUnit,
  truncateRiverLabel,
  yearFraction
} from '@/domain/career-river-geometry';

describe('career-river-geometry', () => {
  it('maps Now to 0.4 when Now is in view', () => {
    const zoom = { from: 2020, to: 2030 };
    expect(timeToUnit(2020, zoom, 2025)).toBeCloseTo(0, 5);
    expect(timeToUnit(2025, zoom, 2025)).toBeCloseTo(0.4, 5);
    expect(timeToUnit(2030, zoom, 2025)).toBeCloseTo(1, 5);
  });

  it('uses linear scale when Now is out of view', () => {
    const zoom = { from: 2010, to: 2015 };
    expect(timeToUnit(2010, zoom, 2025)).toBeCloseTo(0, 5);
    expect(timeToUnit(2015, zoom, 2025)).toBeCloseTo(1, 5);
    expect(timeToUnit(2012.5, zoom, 2025)).toBeCloseTo(0.5, 5);
  });

  it('clamps zoom span to at least 1 year', () => {
    const clamped = clampZoom({ from: 2025, to: 2025.2 }, 2012, 2035);
    expect(clamped.to - clamped.from).toBeGreaterThanOrEqual(1);
  });

  it('sizes the phone river from years in view, within bounds', () => {
    expect(riverHeightPx('vertical', 3, 10)).toBe(600);
    expect(riverHeightPx('vertical', 0, 2)).toBe(560);
    expect(riverHeightPx('vertical', 0, 60)).toBe(1600);
  });

  it('gives the past most of the river when there are no futures', () => {
    const zoom = { from: 2012, to: 2029 };
    expect(pastShareFor(0)).toBeGreaterThan(0.8);
    expect(pastShareFor(2)).toBe(0.4);
    expect(timeToUnit(2026, zoom, 2026, pastShareFor(0))).toBeCloseTo(pastShareFor(0), 5);
    expect(timeToUnit(2029, zoom, 2026, pastShareFor(0))).toBeCloseTo(1, 5);
  });

  it('lays out swimlanes by workplace with concurrent roles stacked inside', () => {
    const layout = layoutRoleSwimlanes([
      { group: 'org:wattle', start: 2021, end: 2024.6 },
      { group: 'org:ridgeway', start: 2012.9, end: 2015 },
      { group: 'org:wattle', start: 2023, end: 2024.6 },
      { group: 'org:wattle', start: 2020, end: 2021 },
      { group: 'org:seaview', start: 2025, end: 2026.8 }
    ]);
    // Groups ordered by first start: ridgeway, wattle (2 rows), seaview.
    expect(layout.groupCount).toBe(3);
    expect(layout.rowCount).toBe(4);
    expect(layout.jobRow[1]).toBe(0);
    expect(layout.jobRow[3]).toBe(1);
    expect(layout.jobRow[0]).toBe(1);
    expect(layout.jobRow[2]).toBe(2);
    expect(layout.jobRow[4]).toBe(3);
    expect(layout.rowStartsGroup).toEqual([true, true, false, true]);
    // Label room reserved past a bar's end stops a later role sharing its row.
    const reserved = layoutRoleSwimlanes([
      { group: 'g', start: 0, end: 160 },
      { group: 'g', start: 120, end: 200 }
    ]);
    expect(reserved.rowCount).toBe(2);
    expect(swimlaneBlockPx(layout)).toBeGreaterThan(swimlaneBlockPx({ rowCount: 3, groupCount: 3 }));
    expect(swimlaneBlockPx({ rowCount: 0, groupCount: 0 })).toBe(0);
  });

  it('places bar labels inside, beside, or not at all — never over another bar', () => {
    expect(placeBarLabel({ x0: 0, x1: 200, textW: 80, maxX: 600 })).toEqual({
      x: 6,
      anchor: 'start',
      inside: true
    });
    expect(placeBarLabel({ x0: 100, x1: 120, textW: 80, maxX: 600 })).toEqual({
      x: 126,
      anchor: 'start',
      inside: false
    });
    // Right side blocked by the next bar → goes left.
    expect(
      placeBarLabel({ x0: 100, x1: 120, textW: 60, maxX: 600, blocked: [[130, 300]] })
    ).toEqual({ x: 94, anchor: 'end', inside: false });
    // A workplace's first bar tries the left first.
    expect(placeBarLabel({ x0: 200, x1: 220, textW: 60, maxX: 600, preferLeft: true })).toEqual({
      x: 194,
      anchor: 'end',
      inside: false
    });
    // Both sides blocked → tooltip only.
    expect(
      placeBarLabel({ x0: 100, x1: 120, textW: 60, maxX: 600, blocked: [[0, 90], [130, 300]] })
    ).toBeNull();
  });

  it('emits readable year axis ticks by zoom span', () => {
    expect(axisYearTicks({ from: 2023, to: 2026 })).toEqual([2023, 2024, 2025, 2026]);
    expect(axisYearTicks({ from: 2012, to: 2026 }).every((y) => y % 3 === 0)).toBe(true);
    expect(axisYearTicks({ from: 2012, to: 2026 }).length).toBeGreaterThan(2);
    expect(axisYearTicks({ from: 2000, to: 2035 }).every((y) => y % 5 === 0)).toBe(true);
  });

  it('clusters marks closer than 10px', () => {
    const clusters = clusterMarks(
      [
        { id: 'a', unit: 0.5, title: 'A' },
        { id: 'b', unit: 0.502, title: 'B' },
        { id: 'c', unit: 0.8, title: 'C' }
      ],
      1000,
      10
    );
    expect(clusters).toHaveLength(2);
    expect(clusters[0]!.count).toBe(2);
    expect(clusters[1]!.count).toBe(1);
  });

  it('builds a peel polyline past the split', () => {
    const pts = branchPolyline({
      orientation: 'horizontal',
      lengthPx: 800,
      midPx: 200,
      nowUnit: 0.4,
      splitUnit: 0.5,
      arrivalUnit: 0.9,
      laneY: 80,
      bundleY: 4
    });
    expect(pts.length).toBeGreaterThan(2);
    expect(pts[0]!.y).toBeCloseTo(204, 0);
    expect(pts[pts.length - 1]!.y).toBeCloseTo(280, 0);
  });

  it('yearFraction is mid-year for July', () => {
    expect(yearFraction('2026-07-02')).toBeGreaterThan(2026.4);
    expect(yearFraction('2026-07-02')).toBeLessThan(2026.6);
  });

  it('stacks concurrent employment into separate lanes', () => {
    const lanes = assignEmploymentLanes([
      { valid_from: '2021-01-25', valid_to: '2024-08-16' },
      { valid_from: '2023-01-23', valid_to: '2024-08-16' },
      { valid_from: '2024-08-19', valid_to: '2024-12-20' }
    ]);
    expect(lanes[0]).toBe(0);
    expect(lanes[1]).toBe(1);
    expect(lanes[2]).toBe(0);
  });

  it('truncates river labels to a pixel budget', () => {
    expect(truncateRiverLabel('English Teacher', 12)).toBe('');
    expect(truncateRiverLabel('English Teacher', 48)).toMatch(/Engl/);
    expect(truncateRiverLabel('Gifted', 80)).toBe('Gifted');
  });

  it('builds complete short job labels without dangling of-phrases', () => {
    expect(riverJobShortLabel('Leader of Learning Enrichment')).toBe('Leader of Learning');
    expect(riverJobShortLabel('Leader of Learning')).toBe('Leader of Learning');
    expect(riverJobShortLabel('Head of Gifted Education')).toBe('Head of Gifted');
    expect(riverJobShortLabel('Deputy Principal')).toBe('Deputy Principal');
    expect(riverJobShortLabel('English Teacher')).toBe('English');
    expect(riverJobShortLabel('Gifted Education Teacher')).toBe('Gifted Education');
    expect(riverJobShortLabel('Professional Learning Coordinator')).toBe(
      'Professional Learning'
    );
    expect(riverJobShortLabel('HSIE Teacher')).toBe('HSIE');
    expect(riverJobShortLabel('HSIE and Business Studies Teacher')).toBe('HSIE');
    expect(riverJobShortLabel('English/HSIE Teacher')).toBe('English/HSIE');
    expect(riverJobShortLabel('Curriculum Leader')).toBe('Curriculum Leader');
    expect(riverJobShortLabel('Senior Education Project Officer')).toBe('Senior Education');
  });
});
