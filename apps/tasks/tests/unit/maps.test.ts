import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as keys from '@/storage/keys';
import { createTasksStore, seedIfEmpty, type KvAdapter } from '@/services/store';
import type { SeedData } from '@/services/types';
import { TransitMapSchema } from '@/schemas/map';
import {
  attachTick,
  capsuleOccupies,
  crossingKind,
  exportMapHtml,
  isOrthogonalPath,
  pickCurrentYearMap,
  segmentCrossings,
  stationLineCuts
} from '@/domain/maps';
import { mindWorks2026Map } from '@/domain/maps-seed';
import {
  addExtraYearTrack,
  adjacentStrandBoxesOverlap,
  evenTrackX,
  lineContentBox,
  lineTrackDefs,
  applyDateSpanToStation,
  boxesOverlap,
  dateToY,
  eventPorts,
  labelHitsForeignLine,
  layoutMap,
  lineStrokeBoxes,
  MAP_LINE_GAP,
  matchConnectTarget,
  moveLine,
  normalizeLineColors,
  placeBox,
  schoolTerms,
  spanWeeks,
  stationPorts,
  underpassLaneY,
  wrapEventLines
} from '@/domain/maps-layout';
import { mapsOrSeed } from '@/views/maps';

describe('map schema', () => {
  it('accepts a valid map and rejects a diagonal line', () => {
    const map = mindWorks2026Map();
    expect(TransitMapSchema.parse(map).id).toBe('map_mindworks_2026');
    expect(() =>
      TransitMapSchema.parse({
        ...map,
        lines: [{ ...map.lines[0]!, points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] }]
      })
    ).toThrow();
  });
});

describe('orthogonal paths', () => {
  it('allows horizontal and vertical steps only', () => {
    expect(isOrthogonalPath([{ x: 0, y: 0 }, { x: 0, y: 40 }, { x: 20, y: 40 }])).toBe(true);
    expect(isOrthogonalPath([{ x: 0, y: 0 }, { x: 8, y: 8 }])).toBe(false);
  });
});

describe('crossings', () => {
  it('tunnels when lines cross without a station', () => {
    const crossings = segmentCrossings(
      [
        { id: 'a', points: [{ x: 0, y: 50 }, { x: 100, y: 50 }] },
        { id: 'b', points: [{ x: 50, y: 0 }, { x: 50, y: 100 }] }
      ],
      []
    );
    expect(crossings).toHaveLength(1);
    expect(crossingKind(crossings[0]!, [])).toBe('tunnel');
  });

  it('is an interchange when a station occupies the crossing', () => {
    const stations = [{ id: 's1', line_id: 'b', y: 50, height: 48 }];
    const crossings = segmentCrossings(
      [
        { id: 'a', points: [{ x: 0, y: 50 }, { x: 100, y: 50 }] },
        { id: 'b', points: [{ x: 50, y: 0 }, { x: 50, y: 100 }] }
      ],
      stations
    );
    expect(crossingKind(crossings[0]!, stations)).toBe('interchange');
    expect(capsuleOccupies(stations[0]!, { x: 50, y: 50 })).toBe(true);
  });
});

describe('ticks', () => {
  it('attaches to a line, a station side, or another event port', () => {
    const onLine = attachTick({ kind: 'line', line_id: 'j', y: 120 });
    const onStation = attachTick({ kind: 'station', station_id: 'st_ydp', side: 'right', offset: 0.4 });
    const onEvent = attachTick({ kind: 'event', event_id: 'tk_locke', side: 'bottom' });
    expect(onLine.kind).toBe('line');
    expect(onStation.kind).toBe('station');
    expect(onEvent.kind).toBe('event');
    if (onStation.kind !== 'station') throw new Error('expected station attach');
    expect(onStation.side).toBe('right');
    if (onEvent.kind !== 'event') throw new Error('expected event attach');
    expect(onEvent.side).toBe('bottom');
  });
});

describe('station geometry', () => {
  it('cuts the line at the capsule — no stroke through the fill', () => {
    const cuts = stationLineCuts(
      { points: [{ x: 80, y: 0 }, { x: 80, y: 400 }] },
      [{ y: 100, height: 80 }]
    );
    expect(cuts.some((c) => c.y0 === 100 && c.y1 === 180)).toBe(false);
    expect(cuts.some((c) => c.y1 === 100)).toBe(true);
    expect(cuts.some((c) => c.y0 === 180)).toBe(true);
  });
});

describe('MindWorks 2026 seed', () => {
  it('has four lines and poster programs', () => {
    const map = mindWorks2026Map();
    expect(map.lines.map((l) => l.letter).sort()).toEqual(['E', 'I', 'J', 'R']);
    const labels = map.stations.map((s) => s.label);
    expect(labels).toEqual(
      expect.arrayContaining([
        'Young Diplomats Program',
        'Diplomacy and Advocacy',
        'Young Creators Lab',
        'StudioGAT',
        'Foundations Psychology'
      ])
    );
    expect(map.ticks.some((t) => t.attach.kind === 'line')).toBe(true);
    expect(map.ticks.some((t) => t.attach.kind === 'station')).toBe(true);
    expect(map.ticks.some((t) => t.attach.kind === 'event')).toBe(true);
    expect(map.ticks.some((t) => t.connects_to && /MUNA|Locke|Innovation|Reasoning|Justice/i.test(t.connects_to))).toBe(
      true
    );
    expect(map.lines.find((l) => l.letter === 'J')?.color).toBe('blue');
    expect(map.lines.find((l) => l.letter === 'I')?.color).toBe('yellow');
    expect(map.lines.find((l) => l.letter === 'E')?.color).toBe('green');
    expect(map.lines.find((l) => l.letter === 'R')?.color).toBe('purple');
    expect(map.stations.every((s) => s.starts_on && s.ends_on)).toBe(true);
    expect(map.stations.every((s) => s.planning === 'planned')).toBe(true);
    expect(map.ticks.every((t) => t.planning === 'planned')).toBe(true);
    expect(map.stations.find((s) => s.id === 'st_ydp')?.tracks).toEqual(['junior']);
    expect(map.stations.find((s) => s.id === 'st_studio')?.tracks).toEqual(['junior', 'rozelle', 'senior']);
  });
});

describe('year layout', () => {
  it('maps dates onto the calendar year and draws T1–T4 plus E', () => {
    const year = 2026;
    const terms = schoolTerms(year);
    const t1 = dateToY(terms.t1, year);
    const e = dateToY(terms.e, year);
    expect(t1).toBeLessThan(dateToY(terms.t2, year));
    expect(dateToY(terms.t4, year)).toBeLessThan(e);
    const later = applyDateSpanToStation(
      {
        id: 'st_x',
        line_id: 'line_justice',
        label: 'Later program',
        y: 0,
        height: 10,
        tracks: ['junior'],
        in_stroke: 'solid',
        out_stroke: 'solid',
        starts_on: '2026-10-12',
        ends_on: '2026-12-17',
        link: null,
        planning: 'planned'
      },
      year
    );
    expect(later.y).toBeGreaterThan(t1);
    const layout = layoutMap(mindWorks2026Map());
    expect(layout.terms.map((t) => t.id)).toEqual(['T1', 'T2', 'T3', 'T4', 'E']);
    expect(layout.lines.map((l) => l.letter).sort()).toEqual(['E', 'I', 'J', 'R']);
    for (const line of layout.lines) {
      expect(line.tracks.map((track) => track.id)).toEqual(['junior', 'rozelle', 'senior']);
      expect(line.tracks.map((track) => track.label)).toEqual(['Junior', 'Rozelle', 'Senior']);
    }
    const sixMonths = applyDateSpanToStation(
      { ...later, starts_on: '2026-01-27', ends_on: '2026-07-27', height: 10 },
      year
    );
    const short = applyDateSpanToStation(
      { ...later, starts_on: '2026-01-27', ends_on: '2026-02-27', height: 10 },
      year
    );
    expect(sixMonths.height).toBeGreaterThan(short.height + 100);
  });

  it('spaces year lines evenly within each strand', () => {
    const layout = layoutMap(mindWorks2026Map());
    for (const line of layout.lines) {
      const xs = line.tracks.map((track) => track.x).sort((a, b) => a - b);
      const gaps = xs.slice(1).map((x, index) => x - xs[index]!);
      expect(gaps.length).toBe(2);
      expect(gaps[0]).toBeCloseTo(gaps[1]!, 5);
      expect(gaps[0]).toBeCloseTo(evenTrackX(0, 1, 3) - evenTrackX(0, 0, 3), 5);
    }
  });

  it('adds a custom year line and keeps even spacing', () => {
    const map = mindWorks2026Map();
    const justice = addExtraYearTrack(map.lines[0]!, 'Middle');
    expect(lineTrackDefs(justice).some((track) => track.label === 'Middle')).toBe(true);
    const layout = layoutMap({ ...map, lines: [justice, ...map.lines.slice(1)] });
    const xs = layout.lines[0]!.tracks.map((track) => track.x).sort((a, b) => a - b);
    const gaps = xs.slice(1).map((x, index) => x - xs[index]!);
    expect(layout.lines[0]!.tracks.length).toBe(4);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(1);
  });

  it('connects a late competition to its program even when the date is past the station', () => {
    const base = mindWorks2026Map();
    const ydp = base.stations.find((station) => station.id === 'st_ydp')!;
    const layout = layoutMap({
      ...base,
      ticks: [
        ...base.ticks,
        {
          id: 'tk_late',
          label: 'Late showcase',
          attach: { kind: 'station', station_id: 'st_ydp', side: 'right', offset: 0.5 },
          stroke: 'solid',
          connects_to: null,
          starts_on: '2026-11-15',
          ends_on: null,
          link: null,
          planning: 'planned'
        }
      ]
    });
    const station = layout.stations.find((item) => item.id === 'st_ydp')!;
    const tick = layout.ticks.find((item) => item.id === 'tk_late')!;
    const link = layout.connectors.find((item) => item.id === 'link-tk_late');
    expect(ydp.ends_on).toBe('2026-04-10');
    expect(tick.cy).toBeGreaterThan(station.y + station.h);
    expect(link?.from.ownerId).toBe('st_ydp');
    expect(link?.to.ownerId).toBe('tk_late');
  });

  it('gives a term-length program weekly ports on both sides', () => {
    expect(spanWeeks('2026-01-27', '2026-04-10', 2026)).toBe(10);
    const ports = stationPorts({
      id: 'st_term',
      x: 200,
      y: 100,
      w: 40,
      h: 200,
      weeks: 10
    });
    expect(ports.filter((p) => p.side === 'left')).toHaveLength(10);
    expect(ports.filter((p) => p.side === 'right')).toHaveLength(10);
  });

  it('wraps long event names so chips stay compact', () => {
    const lines = wrapEventLines('International Philosophy Olympiad selection workshop and public showcase');
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((line) => line.length <= 22)).toBe(true);
    expect(wrapEventLines('StatewideJuniorMootingChampionshipFinal').every((line) => line.length <= 22)).toBe(
      true
    );
  });

  it('gives an event four cardinal ports', () => {
    const ports = eventPorts({ id: 'tk', cx: 80, cy: 80 });
    expect(ports.map((p) => p.side).sort()).toEqual(['bottom', 'left', 'right', 'top']);
  });

  it('connects a competition to another competition’s border', () => {
    const layout = layoutMap(mindWorks2026Map());
    const eventToEvent = layout.connectors.filter(
      (link) => link.from.owner === 'event' && link.to.owner === 'event'
    );
    expect(eventToEvent.length).toBeGreaterThan(0);
    const moot = layout.ticks.find((tick) => tick.id === 'tk_moot');
    const locke = layout.ticks.find((tick) => tick.id === 'tk_locke');
    expect(moot && locke).toBeTruthy();
    expect(layout.connectors.some((link) => link.id.includes('tk_moot') && link.id.includes('tk_locke') || (link.from.ownerId === 'tk_locke' && link.to.ownerId === 'tk_moot') || (link.from.ownerId === 'tk_moot' && link.to.ownerId === 'tk_locke'))).toBe(true);
    const target = matchConnectTarget('Rotary MUNA', layout.lines, layout.ticks);
    expect(target?.kind).toBe('event');
  });

  it('sends a crossing connector below other elements, not over them', () => {
    const wall = { id: 'wall', x: 40, y: 80, w: 20, h: 100 };
    const from = { x: 10, y: 90 };
    const to = { x: 120, y: 95 };
    const y = underpassLaneY(from, to, [wall], 8);
    expect(y).toBe(Math.max(from.y, to.y));
    expect(y).toBeLessThan(wall.y + wall.h + 40);
    const layout = layoutMap(mindWorks2026Map());
    const under = layout.connectors.filter((link) => link.under);
    expect(under.length).toBeGreaterThan(0);
    for (const link of under) {
      const match = /V ([\d.]+) H/.exec(link.path);
      if (!match) continue;
      const lane = Number(match[1]);
      expect(lane).toBeGreaterThanOrEqual(Math.min(link.from.y, link.to.y) - 1);
    }
  });

  it('connects events through ports and keeps line groups packed', () => {
    const layout = layoutMap(mindWorks2026Map());
    expect(layout.connectors.length).toBeGreaterThan(0);
    const mock = layout.stations.find((s) => s.id === 'st_mock');
    expect(mock?.weeks).toBeGreaterThanOrEqual(10);
    expect(mock?.ports.filter((p) => p.side === 'left')).toHaveLength(mock!.weeks);
    const xs = layout.lines.map((line) => line.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i += 1) {
      expect(xs[i]! - xs[i - 1]!).toBeGreaterThan(80);
    }
  });

  it('never leaves two label boxes overlapping', () => {
    const layout = layoutMap(mindWorks2026Map());
    const boxes = layout.boxes;
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        expect(boxesOverlap(boxes[i]!, boxes[j]!)).toBe(false);
      }
    }
    const placed = placeBox(
      { id: 'probe', x: boxes[0]!.x, y: boxes[0]!.y, w: 20, h: 20 },
      boxes,
      { width: layout.width, height: layout.height }
    );
    expect(boxes.some((box) => boxesOverlap(box, placed))).toBe(false);
  });

  it('keeps event chips horizontal and off every other line', () => {
    const layout = layoutMap(mindWorks2026Map());
    expect(layout.ticks.length).toBeGreaterThan(0);
    expect(layout.ticks.every((tick) => tick.labelBox.w > tick.labelBox.h)).toBe(true);
    expect(labelHitsForeignLine(layout)).toBe(false);
    for (const tick of layout.ticks) {
      for (const line of layout.lines) {
        if (line.id === tick.lineId) continue;
        expect(lineStrokeBoxes(line).some((box) => boxesOverlap(tick.labelBox, box))).toBe(false);
      }
    }
  });

  it('slides a later line right when the first line grows a wide event', () => {
    const base = mindWorks2026Map();
    const tick = (id: string, label: string) => ({
      id,
      label,
      attach: { kind: 'line' as const, line_id: 'line_justice', y: 220 },
      stroke: 'solid' as const,
      connects_to: null,
      starts_on: '2026-03-12',
      ends_on: null,
      link: null,
      planning: 'planned' as const
    });
    const packed = layoutMap({ ...base, ticks: [tick('tk_short', 'Moot')] });
    const grown = layoutMap({
      ...base,
      ticks: [tick('tk_wide', 'Statewide Junior Mooting Championship Final')]
    });
    const firstI = packed.lines.find((line) => line.id === 'line_innovation')!.x;
    const grownI = grown.lines.find((line) => line.id === 'line_innovation')!.x;
    expect(grownI).toBeGreaterThan(firstI);
    expect(labelHitsForeignLine(grown)).toBe(false);
    expect(adjacentStrandBoxesOverlap(grown.lines, grown.stations, grown.ticks)).toBe(false);
    const chip = grown.ticks.find((tick) => tick.id === 'tk_wide')!.labelBox;
    const next = grown.lines.find((line) => line.id === 'line_innovation')!;
    expect(lineStrokeBoxes(next).some((box) => boxesOverlap(chip, box))).toBe(false);
    expect(boxesOverlap(chip, lineContentBox(next, grown.stations, grown.ticks))).toBe(false);
  });

  it('keeps a renamed championship chip off the next strand', () => {
    const base = mindWorks2026Map();
    const layout = layoutMap({
      ...base,
      ticks: [
        ...base.ticks,
        {
          id: 'tk_champ',
          label: 'Statewide Junior Mooting Championship Final',
          attach: { kind: 'line', line_id: 'line_justice', y: 200 },
          stroke: 'solid',
          connects_to: null,
          starts_on: '2026-01-27',
          ends_on: null,
          link: null,
          planning: 'planned'
        }
      ]
    });
    const chip = layout.ticks.find((tick) => tick.id === 'tk_champ')!.labelBox;
    const next = layout.lines.find((line) => line.id === 'line_innovation')!;
    const nextLeft = Math.min(...next.tracks.map((track) => track.x)) - 8;
    expect(chip.x + chip.w).toBeLessThan(nextLeft);
    expect(labelHitsForeignLine(layout)).toBe(false);
  });

  it('spreads strands evenly with room for event chips between them', () => {
    const layout = layoutMap(mindWorks2026Map());
    const xs = layout.lines.map((line) => line.x).sort((a, b) => a - b);
    const gaps = xs.slice(1).map((x, index) => x - xs[index]!);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(MAP_LINE_GAP - 1);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(1);
    expect(adjacentStrandBoxesOverlap(layout.lines, layout.stations, layout.ticks)).toBe(false);
    expect(labelHitsForeignLine(layout)).toBe(false);
  });

  it('keeps every line lane the same width', () => {
    const xs = layoutMap(mindWorks2026Map())
      .lines.map((line) => line.x)
      .sort((a, b) => a - b);
    const gaps = xs.slice(1).map((x, index) => x - xs[index]!);
    expect(gaps.length).toBeGreaterThan(1);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(1);
  });

  it('keeps competition chips in a column beside the circle', () => {
    const layout = layoutMap(mindWorks2026Map());
    for (const tick of layout.ticks) {
      expect(tick.labelBox.x).toBeGreaterThan(tick.cx);
      expect(Math.abs(tick.labelBox.x - (tick.cx + 36))).toBeLessThan(8);
    }
  });

  it('moves a line and its lane left or right', () => {
    const map = mindWorks2026Map();
    const ids = map.lines.map((line) => line.id);
    const shifted = moveLine(map.lines, 'line_innovation', -1);
    expect(shifted.map((line) => line.id)).toEqual([
      'line_innovation',
      'line_justice',
      ...ids.slice(2)
    ]);
    const laid = layoutMap({ ...map, lines: shifted });
    const justice = laid.lines.find((line) => line.id === 'line_justice')!;
    const innovation = laid.lines.find((line) => line.id === 'line_innovation')!;
    expect(innovation.x).toBeLessThan(justice.x);
    expect(laid.stations.filter((station) => station.line_id === 'line_innovation').every((station) => station.lineX === innovation.x)).toBe(
      true
    );
  });

  it('pins Justice blue, Innovation yellow, Expression green, Reasoning purple', () => {
    const dirty = mindWorks2026Map();
    dirty.lines = dirty.lines.map((line) => {
      if (line.letter === 'J') return { ...line, color: 'lilac' as const };
      if (line.letter === 'I') return { ...line, color: 'success' as const };
      if (line.letter === 'E') return { ...line, color: 'lilac' as const };
      if (line.letter === 'R') return { ...line, color: 'high-sea' as const };
      return line;
    });
    const fixed = normalizeLineColors(dirty).lines;
    expect(fixed.find((line) => line.letter === 'J')?.color).toBe('blue');
    expect(fixed.find((line) => line.letter === 'I')?.color).toBe('yellow');
    expect(fixed.find((line) => line.letter === 'E')?.color).toBe('green');
    expect(fixed.find((line) => line.letter === 'R')?.color).toBe('purple');
    const seeded = mapsOrSeed([dirty])[0]!.lines;
    expect(seeded.map((line) => [line.letter, line.color])).toEqual([
      ['J', 'blue'],
      ['I', 'yellow'],
      ['E', 'green'],
      ['R', 'purple']
    ]);
  });

  it('connects each year line through its disc and into every station on that track', () => {
    const layout = layoutMap(mindWorks2026Map());
    for (const line of layout.lines) {
      expect(line.y0).toBe(line.disc.cy);
      for (const track of line.tracks) {
        expect(track.disc.cy).toBe(line.y0);
        expect(track.cuts[0]?.y0).toBe(track.disc.cy);
        const stations = layout.stations.filter(
          (station) => station.line_id === line.id && station.tracks.includes(track.id)
        );
        for (const station of stations) {
          const body = station.bodies.find((item) => item.track === track.id)!;
          const arrives = track.cuts.some((cut) => Math.abs(cut.y1 - body.y) < 0.5);
          const leaves = track.cuts.some((cut) => Math.abs(cut.y0 - (body.y + body.h)) < 0.5);
          expect(arrives).toBe(true);
          expect(leaves).toBe(true);
        }
      }
    }
  });
});

describe('library default', () => {
  it('seeds MindWorks when the API returns nothing', () => {
    expect(mapsOrSeed([]).map((m) => m.id)).toEqual(['map_mindworks_2026']);
    expect(mapsOrSeed(undefined).map((m) => m.id)).toEqual(['map_mindworks_2026']);
  });

  it('picks the current-year map when present', () => {
    const maps = [
      { ...mindWorks2026Map(), id: 'map_old', year: 2025, title: 'Old' },
      mindWorks2026Map()
    ];
    expect(pickCurrentYearMap(maps, 2026)?.id).toBe('map_mindworks_2026');
  });
});

function memoryKv(): KvAdapter {
  const map = new Map<string, unknown>();
  return {
    async getJSON<T>(key: string) {
      return (map.has(key) ? map.get(key) : null) as T | null;
    },
    async setJSON(key: string, value: unknown) {
      map.set(key, value);
    },
    async delete(key: string) {
      map.delete(key);
    }
  };
}

describe('maps store', () => {
  it('seeds MindWorks 2026 even when the fixture has no maps', async () => {
    const seed = JSON.parse(readFileSync(resolve(process.cwd(), 'fixtures/seed.json'), 'utf8')) as SeedData;
    const kv = memoryKv();
    await seedIfEmpty(kv, keys, seed);
    const store = createTasksStore(kv, keys);
    const maps = await store.listMaps();
    expect(maps.some((m) => m.id === 'map_mindworks_2026')).toBe(true);
    const created = await store.createMap({ title: 'Scratch' });
    expect(created.lines).toEqual([]);
    const updated = await store.updateMap(created.id, { title: 'Scratch v2' });
    expect(updated.title).toBe('Scratch v2');
  });
});

describe('export', () => {
  it('writes viewer-only HTML with hub tokens and no edit chrome', () => {
    const html = exportMapHtml(mindWorks2026Map());
    expect(html).toContain('data-hub="tasks"');
    expect(html).toContain('--wave');
    expect(html).not.toContain('+ Program');
    expect(html).not.toContain('hub-rail');
    expect(html).toContain('Young Diplomats Program');
    expect(html).toContain('#0057b8');
    expect(html).toContain('#f0c400');
    expect(html).toContain('#009a3a');
    expect(html).toContain('#6b2d8e');
    expect(html).toContain('Junior');
    expect(html).toContain('Rozelle');
    expect(html).toContain('Senior');
    expect(html).not.toContain('r="4"');
    expect(html).toMatch(/<circle cx="[\d.]+" cy="[\d.]+" r="14"/);
  });
});
