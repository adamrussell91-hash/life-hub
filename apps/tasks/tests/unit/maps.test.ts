import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as keys from '@/storage/keys';
import { createTasksStore, seedIfEmpty, type KvAdapter } from '@/services/store';
import type { SeedData } from '@/services/types';
import { TransitMapSchema, type MapStation, type MapTick } from '@/schemas/map';
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
  fitPillLabel,
  lineContentBox,
  lineTrackDefs,
  applyDateSpanToStation,
  boxesOverlap,
  dateToY,
  eventPorts,
  labelHitsForeignLine,
  lineStrokeBoxes,
  MAP_FORK_BAR_GAP,
  MAP_LINE_GAP,
  MAP_STATION_LANE_GAP,
  MAP_TRACK_GAP,
  mapTerms,
  termMarksInOrder,
  termSpans,
  matchConnectTarget,
  moveLine,
  nearestLaidTrack,
  normalizeLineColors,
  placeBox,
  resolveLineAttachTrack,
  resolveLineAttachTracks,
  schoolTerms,
  spanWeeks,
  stationLaneX,
  stationPorts,
  underpassLaneY,
  wrapEventLines,
  type LaidTrackFork
} from '@/domain/maps-layout';
import { mapsOrSeed } from '@/views/maps';
import { layoutMap, renderTransitSvg, TM_LANE_GAP, TM_PILL_W, TM_RAIL_OUT, TM_TRACK_GAP } from '@/domain/maps-transit';

function datedProgram(
  id: string,
  label: string,
  startsOn: string,
  endsOn: string,
  extras: Partial<MapStation> = {}
): MapStation {
  return {
    id,
    line_id: 'line_reasoning',
    label,
    y: 0,
    height: 10,
    tracks: ['senior'],
    in_stroke: 'solid',
    out_stroke: 'solid',
    starts_on: startsOn,
    ends_on: endsOn,
    link: null,
    planning: 'planned',
    ...extras
  };
}

function isCrossbar(fork: LaidTrackFork, y: number, xMain: number, xSide: number): boolean {
  return (
    fork.y1 === fork.y2 &&
    fork.y1 === y &&
    Math.min(fork.x1, fork.x2) === xMain &&
    Math.max(fork.x1, fork.x2) === xSide
  );
}

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

  it('sizes programs by calendar span, not label length', () => {
    const year = 2026;
    const long = applyDateSpanToStation(
      datedProgram('st_long', 'The Philosophy of Power', '2026-07-20', '2026-10-30'),
      year
    );
    const shortName = applyDateSpanToStation(
      datedProgram('st_short', 'PSYOPS', '2026-07-20', '2026-10-30'),
      year
    );
    expect(long.y).toBe(shortName.y);
    expect(long.height).toBe(shortName.height);
    expect(long.height).toBe(Math.max(24, dateToY(long.ends_on!, year) - dateToY(long.starts_on!, year)));
  });

  it('runs concurrent programs on parallel rails beside the year line, steps the neighbour aside, then rejoins', () => {
    const base = mindWorks2026Map();
    const layout = layoutMap({
      ...base,
      stations: [
        ...base.stations.filter((item) => item.line_id !== 'line_reasoning'),
        datedProgram('st_philosophy', 'The Philosophy of Power', '2026-07-20', '2026-10-30', { tracks: ['rozelle'] }),
        datedProgram('st_psyops', 'PSYOPS', '2026-07-20', '2026-10-30', { tracks: ['rozelle'] })
      ]
    });
    const a = layout.stations.find((item) => item.id === 'st_philosophy')!.bodies[0]!;
    const b = layout.stations.find((item) => item.id === 'st_psyops')!.bodies[0]!;
    const line = layout.lines.find((item) => item.id === 'line_reasoning')!;
    const rozelle = line.tracks.find((track) => track.id === 'rozelle')!;
    expect(Math.abs(a.x - b.x)).toBeCloseTo(TM_LANE_GAP, 5);
    expect(Math.min(a.x, b.x) - rozelle.x).toBeCloseTo(TM_RAIL_OUT, 5);
    const draw = layout.draw.tracks.filter((track) => track.lineId === 'line_reasoning');
    const rz = draw.find((track) => track.trackId === 'rozelle')!;
    expect(rz.lanes).toHaveLength(2);
    // The year line itself runs straight past both programs.
    expect(rz.pieces).toHaveLength(1);
    const mid = a.y + a.h / 2;
    const xAtY = (points: Array<{ x: number; y: number }>, y: number) => {
      for (let i = 1; i < points.length; i += 1) {
        const p = points[i - 1]!;
        const q = points[i]!;
        if (y >= p.y && y <= q.y) return q.y === p.y ? q.x : p.x + ((q.x - p.x) * (y - p.y)) / (q.y - p.y);
      }
      return NaN;
    };
    for (const id of ['senior']) {
      const track = draw.find((item) => item.trackId === id)!;
      const pts = track.pieces[0]!;
      const away = Math.abs(xAtY(pts, mid) - rz.top.x);
      expect(away).toBeGreaterThan(TM_TRACK_GAP);
      expect(track.bottom.x).toBeCloseTo(track.top.x, 5);
    }
  });

  it('bends the next year line out for a middle-line competition name, then back', () => {
    const layout = layoutMap(mindWorks2026Map());
    const tick = layout.ticks.find((item) => item.id === 'tk_davinci')!;
    const senior = layout.draw.tracks.find((track) => track.lineId === 'line_innovation' && track.trackId === 'senior')!;
    const pts = senior.pieces.flat();
    const near = pts.filter((p) => p.y >= tick.labelBox.y && p.y <= tick.labelBox.y + tick.labelBox.h);
    const xs = near.length ? near.map((p) => p.x) : [Math.max(...pts.map((p) => p.x))];
    expect(Math.min(...xs)).toBeGreaterThan(tick.labelBox.x + tick.labelBox.w);
    expect(senior.bottom.x).toBeCloseTo(senior.top.x, 5);
  });

  it('packs strands close, never letting a label sit on another strand', () => {
    const layout = layoutMap(mindWorks2026Map());
    const xs = layout.lines.map((line) => line.tracks[0]!.x);
    for (let i = 1; i < xs.length; i += 1) expect(xs[i]! - xs[i - 1]!).toBeLessThan(560);
    for (const tick of layout.ticks) {
      for (const track of layout.draw.tracks.filter((item) => item.lineId !== tick.lineId)) {
        for (const piece of track.pieces) {
          for (const p of piece) {
            const inside =
              p.x > tick.labelBox.x && p.x < tick.labelBox.x + tick.labelBox.w &&
              p.y > tick.labelBox.y && p.y < tick.labelBox.y + tick.labelBox.h;
            expect(inside).toBe(false);
          }
        }
      }
    }
  });

  it('runs a program’s round chain on a branch and rings the final', () => {
    const layout = layoutMap(mindWorks2026Map());
    const branch = layout.draw.branches.find((item) => item.id.includes('st_mock'))!;
    expect(branch).toBeTruthy();
    const locke = layout.draw.stops.find((stop) => stop.tickId === 'tk_locke')!;
    const moot = layout.draw.stops.find((stop) => stop.tickId === 'tk_moot')!;
    expect(locke.dots[0]!.x).toBeCloseTo(moot.dots[0]!.x, 5);
    expect(moot.y).toBeGreaterThan(locke.y);
    expect(moot.final).toBe(true);
    expect(locke.final).toBe(false);
  });

  it('puts a lone program competition on the program’s edge, with no branch', () => {
    const base = mindWorks2026Map();
    const layout = layoutMap({ ...base, ticks: base.ticks.filter((tick) => tick.id !== 'tk_moot') });
    expect(layout.draw.branches).toHaveLength(0);
    const station = layout.stations.find((item) => item.id === 'st_mock')!;
    const stop = layout.draw.stops.find((item) => item.tickId === 'tk_locke')!;
    expect(stop.dots[0]!.x).toBeCloseTo(station.bodies[0]!.x + TM_PILL_W / 2, 5);
  });

  it('draws a capsule across every year line a competition serves', () => {
    const layout = layoutMap(mindWorks2026Map());
    const evatt = layout.draw.stops.find((stop) => stop.tickId === 'tk_evatt')!;
    expect(evatt.dots).toHaveLength(2);
    const muna = layout.draw.stops.find((stop) => stop.tickId === 'tk_muna')!;
    expect(muna.anchor).toBe('end');
  });

  it('sets a short program’s name beside its pill', () => {
    const base = mindWorks2026Map();
    const layout = layoutMap({
      ...base,
      stations: [...base.stations, datedProgram('st_tft', 'Teachers for Tomorrow', '2026-11-30', '2026-12-10')]
    });
    const flag = layout.draw.flags.find((item) => item.stationId === 'st_tft')!;
    expect(flag.lines.join(' ')).toBe('Teachers for Tomorrow');
    expect(flag.sub).toContain('30 Nov');
    const svg = renderTransitSvg(layout);
    expect(svg).toContain('tm-flag-label');
    expect(svg).not.toContain('NaN');
  });

  it('links a competition to another strand', () => {
    const base = mindWorks2026Map();
    const layout = layoutMap({
      ...base,
      ticks: base.ticks.map((tick) => (tick.id === 'tk_davinci' ? { ...tick, connects_to: 'Reasoning' } : tick))
    });
    const link = layout.draw.links.find((item) => item.id === 'link-tk_davinci')!;
    expect(link.ends).toHaveLength(2);
    const reasoning = layout.lines.find((line) => line.id === 'line_reasoning')!;
    expect(Math.abs(link.ends[1]!.x - reasoning.tracks[0]!.x)).toBeLessThan(TM_TRACK_GAP * 3);
  });

  it('uses per-map term dates for the term bands', () => {
    const base = mindWorks2026Map();
    const terms = { t1: '2026-02-02', t2: '2026-04-29', t3: '2026-07-21', t4: '2026-10-13', e: '2026-12-18' };
    const layout = layoutMap({ ...base, terms });
    expect(layout.terms.map((term) => term.date)).toEqual([terms.t1, terms.t2, terms.t3, terms.t4, terms.e]);
    expect(layout.terms[0]!.y).toBeCloseTo(dateToY(terms.t1, 2026), 5);
    expect(mapTerms({ year: 2026, terms: null })).toEqual(schoolTerms(2026));
    expect(TransitMapSchema.parse({ ...base, terms }).terms).toEqual(terms);
    expect(TransitMapSchema.parse({ ...base, terms: undefined }).terms).toBeNull();
    expect(termMarksInOrder(terms)).toBe(true);
    expect(termMarksInOrder({ ...terms, t3: '2026-04-01' })).toBe(false);
  });

  it('fits long program names inside short capsules', () => {
    expect(fitPillLabel('PSYOPS', 300)).toEqual({ lines: ['PSYOPS'], font: 18, truncated: false });
    const two = fitPillLabel('Future Solutions Lab', 150);
    expect(two.truncated).toBe(false);
    expect(two.lines.length).toBe(2);
    const clipped = fitPillLabel('Foundations Ethics and Philosophy of Mind', 60);
    expect(clipped.truncated).toBe(true);
  });

  it('adds a custom year line', () => {
    const map = mindWorks2026Map();
    const justice = addExtraYearTrack(map.lines[0]!, 'Middle');
    expect(lineTrackDefs(justice).some((track) => track.label === 'Middle')).toBe(true);
    const layout = layoutMap({ ...map, lines: [justice, ...map.lines.slice(1)] });
    const xs = layout.lines[0]!.tracks.map((track) => track.x);
    expect(xs).toHaveLength(4);
    for (let i = 1; i < xs.length; i += 1) expect(xs[i]! - xs[i - 1]!).toBeGreaterThan(TM_TRACK_GAP - 0.01);
  });

  it('gives a term-length program weekly ports on both sides', () => {
    const layout = layoutMap(mindWorks2026Map());
    const station = layout.stations.find((item) => item.id === 'st_ydp')!;
    expect(station.ports.filter((port) => port.side === 'left').length).toBe(station.weeks * station.bodies.length);
    expect(station.ports.filter((port) => port.side === 'right').length).toBe(station.weeks * station.bodies.length);
  });

  it('gives an event four cardinal ports', () => {
    expect(eventPorts({ id: 'e', cx: 10, cy: 10 }).map((port) => port.side)).toEqual(['top', 'bottom', 'left', 'right']);
  });

  it('wraps long event names so labels stay compact', () => {
    expect(wrapEventLines('UN Evatt Competition', 16)).toEqual(['UN Evatt', 'Competition']);
  });

  it('places every seeded competition with readable, non-overlapping labels in one column', () => {
    const layout = layoutMap(mindWorks2026Map());
    expect(layout.ticks).toHaveLength(mindWorks2026Map().ticks.length);
    const boxes = layout.ticks.map((tick) => tick.labelBox);
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        expect(boxesOverlap(boxes[i]!, boxes[j]!, 0)).toBe(false);
      }
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
    // One rotated year name per year line, one lettered cap at each end of every year line.
    expect(html.match(/class="tm-year-name"/g)?.length).toBe(12);
    expect(html.match(/<circle cx="[\d.]+" cy="[\d.]+" r="13"/g)?.length).toBe(24);
    expect(html).toContain('class="tm-stop');
    expect(html).not.toContain('map-port');
    expect(html).not.toContain('NaN');
  });
});

describe('term holidays', () => {
  const starts = { t1: '2026-01-27', t2: '2026-04-27', t3: '2026-07-20', t4: '2026-10-12', e: '2026-12-31' };
  const ends = { t1_end: '2026-04-10', t2_end: '2026-07-03', t3_end: '2026-09-25', t4_end: '2026-12-17' };

  it('runs each band to its saved end, so holidays are gaps', () => {
    const base = mindWorks2026Map();
    const layout = layoutMap({ ...base, terms: { ...starts, ...ends } });
    const t1 = layout.terms[0]!;
    expect(t1.hasEnd).toBe(true);
    expect(t1.endY).toBeCloseTo(dateToY(ends.t1_end, 2026), 5);
    expect(t1.endY!).toBeLessThan(layout.terms[1]!.y);
    const svg = renderTransitSvg(layout);
    expect(svg).toContain('27 Jan – 10 Apr');
    expect(svg).not.toContain('tm-term-band--alt');
    expect(TransitMapSchema.parse({ ...base, terms: { ...starts, ...ends } }).terms).toEqual({ ...starts, ...ends });
  });

  it('falls back to the next term start when no end is saved', () => {
    const spans = termSpans({ ...starts, t2_end: '2026-07-03' });
    expect(spans[0]).toMatchObject({ end: starts.t2, hasEnd: false });
    expect(spans[1]).toMatchObject({ end: '2026-07-03', hasEnd: true });
    expect(spans[3]).toMatchObject({ end: starts.e, hasEnd: false });
    // An end after the next start is ignored rather than overlapping bands.
    expect(termSpans({ ...starts, t1_end: '2026-05-01' })[0]).toMatchObject({ end: starts.t2, hasEnd: false });
  });

  it('checks term ends sit inside their term', () => {
    expect(termMarksInOrder({ ...starts, ...ends })).toBe(true);
    expect(termMarksInOrder({ ...starts, t1_end: '2026-01-20' })).toBe(false);
    expect(termMarksInOrder({ ...starts, t2_end: '2026-07-25' })).toBe(false);
    expect(termMarksInOrder({ ...starts, t4_end: '2027-01-02' })).toBe(false);
  });

  it('takes term ends from Settings dates', () => {
    const years = [
      {
        year: 2026,
        terms: [
          { term: 1 as const, starts_on: '2026-02-02', ends_on: '2026-04-02' },
          { term: 2 as const, starts_on: '2026-04-22', ends_on: '2026-07-03' },
          { term: 3 as const, starts_on: '2026-07-21', ends_on: '2026-09-25' },
          { term: 4 as const, starts_on: '2026-10-13', ends_on: '2026-12-17' }
        ]
      }
    ];
    const marks = schoolTerms(2026, years);
    expect(marks.t1_end).toBe('2026-04-02');
    expect(marks.t4_end).toBe('2026-12-17');
  });
});

describe('open all year', () => {
  function chainTick(id: string, label: string, attach: MapTick['attach'], startsOn: string, extras: Partial<MapTick> = {}): MapTick {
    return {
      id,
      label,
      attach,
      stroke: 'solid',
      connects_to: null,
      starts_on: startsOn,
      ends_on: null,
      link: null,
      planning: 'planned',
      all_year: false,
      ...extras
    };
  }

  function essayMap(allYear: boolean) {
    const base = mindWorks2026Map();
    return {
      ...base,
      stations: [],
      ticks: [
        chainTick('tk_open', 'Essay Prize opens', { kind: 'line', line_id: 'line_expression', y: 200, tracks: ['senior'] }, '2026-02-02', {
          all_year: allYear
        }),
        chainTick('tk_due', 'Essay Prize due', { kind: 'event', event_id: 'tk_open', side: 'bottom' }, '2026-06-30'),
        chainTick('tk_results', 'Results', { kind: 'event', event_id: 'tk_due', side: 'bottom' }, '2026-10-01'),
        chainTick('tk_gallery', 'Gallery entry 1', { kind: 'line', line_id: 'line_expression', y: 200, tracks: ['senior'] }, '2026-04-03')
      ]
    };
  }

  it('defaults to off for older maps', () => {
    const map = mindWorks2026Map();
    expect(map.ticks.every((tick) => tick.all_year === false)).toBe(true);
  });

  it('draws the chain on a dotted spur outside the other names on that year line', () => {
    const layout = layoutMap(essayMap(true));
    const spur = layout.draw.branches.find((branch) => branch.dotted);
    expect(spur).toBeTruthy();
    expect(spur!.caption?.text).toBe('Senior · open all year');
    const chain = layout.draw.stops.filter((stop) => stop.tickId !== 'tk_gallery');
    const xs = chain.map((stop) => stop.dots[0]!.x);
    expect(new Set(xs).size).toBe(1);
    const gallery = layout.draw.stops.find((stop) => stop.tickId === 'tk_gallery')!;
    expect(xs[0]!).toBeGreaterThan(gallery.labelX + gallery.w);
    // Leaves the year line before the first stop and rejoins after the last.
    const ys = spur!.points.map((point) => point.y);
    expect(Math.min(...ys)).toBeLessThan(chain[0]!.y);
    expect(Math.max(...ys)).toBeGreaterThan(Math.max(...chain.map((stop) => stop.y)));
    const senior = layout.lines.find((line) => line.id === 'line_expression')!.tracks.at(-1)!;
    expect(spur!.points[0]!.x).toBeCloseTo(senior.x, 5);
    const svg = renderTransitSvg(layout);
    expect(svg).toContain('tm-branch--all-year');
    expect(svg).toContain('stroke-dasharray');
    expect(svg).not.toContain('NaN');
  });

  it('keeps the chain on the year line when it is not open all year', () => {
    const layout = layoutMap(essayMap(false));
    expect(layout.draw.branches.some((branch) => branch.dotted)).toBe(false);
  });
});

describe('strand extents', () => {
  it('gives each strand its own left-to-right span for framing on a phone', () => {
    const layout = layoutMap(mindWorks2026Map());
    const strands = layout.draw.strands;
    expect(strands.map((strand) => strand.lineId)).toEqual(layout.lines.map((line) => line.id));
    for (const [i, strand] of strands.entries()) {
      const line = layout.lines[i]!;
      expect(strand.x0).toBeLessThan(Math.min(...line.tracks.map((track) => track.x)));
      expect(strand.x1).toBeGreaterThan(Math.max(...line.tracks.map((track) => track.x)));
      if (i > 0) expect(strand.x0).toBeGreaterThan(strands[i - 1]!.x0);
    }
  });
});

describe('screenshot regressions (Expression gallery, Reasoning olympiad)', () => {
  function comp(id: string, label: string, attach: MapTick['attach'], startsOn: string): MapTick {
    return {
      id,
      label,
      attach,
      stroke: 'solid',
      connects_to: null,
      starts_on: startsOn,
      ends_on: null,
      link: null,
      planning: 'planned',
      all_year: false
    };
  }

  function program(id: string, lineId: string, label: string, startsOn: string, endsOn: string, track: string): MapStation {
    return { ...datedProgram(id, label, startsOn, endsOn, { tracks: [track] }), line_id: lineId };
  }

  it('puts a first-year-line program competition on the outside, joined to its program, without bending neighbours', () => {
    const base = mindWorks2026Map();
    const map = {
      ...base,
      stations: [
        program('st_y8', 'line_expression', 'StudioGAT Year 8', '2026-01-27', '2026-07-10', 'junior'),
        program('st_y7', 'line_expression', 'StudioGAT Year 7', '2026-07-27', '2026-12-10', 'junior')
      ],
      ticks: [
        comp('tk_gallery', 'StudioGAT Gallery (Year 8)', { kind: 'station', station_id: 'st_y8', side: 'right', offset: 0.5 }, '2026-07-23')
      ]
    };
    const layout = layoutMap(map);
    const tracks = layout.draw.tracks.filter((track) => track.lineId === 'line_expression');
    for (const track of tracks.slice(1)) {
      const xs = track.pieces.flat().map((point) => point.x);
      expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(0.5);
    }
    const stop = layout.draw.stops.find((item) => item.tickId === 'tk_gallery')!;
    expect(stop.anchor).toBe('end');
    expect(stop.dots[0]!.x).toBeLessThan(tracks[0]!.top.x);
    // A short branch runs from the Year 8 pill to the stop.
    const y8 = layout.stations.find((station) => station.id === 'st_y8')!;
    const branch = layout.draw.branches.find((item) => item.lineId === 'line_expression' && !item.dotted)!;
    expect(branch).toBeTruthy();
    expect(branch.points[0]!.y).toBeGreaterThanOrEqual(y8.y);
    expect(branch.points[0]!.y).toBeLessThanOrEqual(y8.y + y8.h);
    expect(Math.max(...branch.points.map((point) => point.y))).toBeGreaterThanOrEqual(stop.y);
  });

  it('keeps a tall name clear of a program pill that starts just below its stop', () => {
    const base = mindWorks2026Map();
    const map = {
      ...base,
      stations: [program('st_tft', 'line_reasoning', 'Teachers for Tomorrow', '2026-07-20', '2026-12-10', 'senior')],
      ticks: [
        comp(
          'tk_ipo',
          'International Psychology Olympiad Global',
          { kind: 'line', line_id: 'line_reasoning', y: 200, tracks: ['senior'] },
          '2026-07-11'
        )
      ]
    };
    const layout = layoutMap(map);
    const stop = layout.draw.stops.find((item) => item.tickId === 'tk_ipo')!;
    const pill = layout.stations.find((station) => station.id === 'st_tft')!.bodies[0]!;
    expect(stop.labelY - 12 + stop.h).toBeGreaterThan(pill.y);
    // The program's rail is on the right, so the name takes the free left side, beside its dot.
    expect(stop.anchor).toBe('end');
    expect(stop.labelX).toBeLessThan(stop.dots[0]!.x);
    expect(stop.labelX).toBeLessThan(pill.x - pill.w / 2);
  });

  it('draws a competition on several strands as one interchange joined to a stop on each strand', () => {
    const base = mindWorks2026Map();
    const map = {
      ...base,
      stations: [],
      ticks: [
        {
          ...comp('tk_locke2', 'John Locke Essay', { kind: 'line', line_id: 'line_justice', y: 200, tracks: ['senior'] }, '2026-08-05'),
          also_lines: ['line_reasoning', 'line_innovation', 'line_expression']
        }
      ]
    };
    const layout = layoutMap(map);
    const stops = layout.draw.stops.filter((stop) => stop.tickId === 'tk_locke2');
    expect(stops).toHaveLength(1);
    const stop = stops[0]!;
    // Hosted by the last strand, so its name sits at the end of the rule.
    expect(stop.lineId).toBe('line_reasoning');
    expect(stop.cross!.badges.map((badge) => badge.letter)).toEqual(['J', 'I', 'E', 'R']);
    const seniors = layout.draw.tracks.filter((track) => track.trackId === 'senior');
    expect(stop.cross!.railDots).toHaveLength(4);
    for (const dot of stop.cross!.railDots) {
      expect(seniors.some((track) => Math.abs(track.top.x - dot.x) < 0.5)).toBe(true);
    }
    const ring = stop.dots[0]!;
    const reasoningSenior = seniors.find((track) => track.lineId === 'line_reasoning')!;
    expect(ring.x).toBeGreaterThan(reasoningSenior.top.x);
    expect(stop.cross!.rule[0]!.x).toBeCloseTo(Math.min(...stop.cross!.railDots.map((dot) => dot.x)), 5);
    expect(stop.cross!.rule[1]!.x).toBeCloseTo(ring.x, 5);
    expect(stop.labelX).toBeGreaterThan(ring.x);
    const svg = renderTransitSvg(layout);
    expect(svg.match(/class="tm-badge"/g)).toHaveLength(4);
    expect(svg.match(/class="tm-cross-stop"/g)).toHaveLength(4);
  });

  it('stacks same-day events on one line in a shared platform, each name beside its own dot', () => {
    const base = mindWorks2026Map();
    const at = { kind: 'line', line_id: 'line_reasoning', y: 200, tracks: ['senior'] } as const;
    const map = {
      ...base,
      stations: [],
      ticks: [comp('tk_seo', 'Senior Ethics Olympiad', at, '2026-05-27'), comp('tk_ee', 'Ethical Explorations', at, '2026-05-27')]
    };
    const layout = layoutMap(map);
    const a = layout.draw.stops.find((stop) => stop.tickId === 'tk_seo')!;
    const b = layout.draw.stops.find((stop) => stop.tickId === 'tk_ee')!;
    expect(a.dots[0]!.x).toBeCloseTo(b.dots[0]!.x, 5);
    expect(b.y).toBeGreaterThan(a.y);
    expect(a.labelY).toBeCloseTo(a.y, 5);
    expect(b.labelY).toBeCloseTo(b.y, 5);
    expect(a.anchor).toBe(b.anchor);
    // The date shows once, under the last name.
    expect(a.sub).toBe('');
    expect(b.sub).not.toBe('');
    expect(a.platform).toEqual(b.platform);
    expect(a.platform!.y0).toBeLessThan(a.y);
    expect(a.platform!.y1).toBeGreaterThan(b.y);
    expect(renderTransitSvg(layout).match(/class="tm-platform"/g)).toHaveLength(1);
  });

  it('runs a program on a rail joined to its year line top and bottom, keeping line stops on the line', () => {
    const base = mindWorks2026Map();
    const map = {
      ...base,
      stations: [program('st_mock2', 'line_justice', 'Mock Trial', '2026-03-02', '2026-07-03', 'senior')],
      ticks: [
        comp('tk_evatt2', 'UN Evatt Competition', { kind: 'line', line_id: 'line_justice', y: 200, tracks: ['rozelle', 'senior'] }, '2026-05-04'),
        comp('tk_muna2', 'Rotary MUNA', { kind: 'line', line_id: 'line_justice', y: 200, tracks: ['senior'] }, '2026-05-16'),
        comp('tk_r1', 'Round 1', { kind: 'station', station_id: 'st_mock2', side: 'right', offset: 0.2 }, '2026-03-25'),
        comp('tk_r2', 'Round 2', { kind: 'event', event_id: 'tk_r1', side: 'bottom' }, '2026-05-13')
      ]
    };
    const layout = layoutMap(map);
    const senior = layout.draw.tracks.find((track) => track.lineId === 'line_justice' && track.trackId === 'senior')!;
    const pill = layout.stations.find((station) => station.id === 'st_mock2')!.bodies[0]!;
    const lineX = senior.top.x;
    expect(senior.pieces).toHaveLength(1);
    expect(pill.x - lineX).toBeCloseTo(TM_RAIL_OUT, 5);
    // The rail leaves the year line above the program and rejoins it below.
    expect(senior.lanes).toHaveLength(1);
    const rail = senior.lanes[0]!;
    expect(rail[0]!.x).toBeCloseTo(lineX, 5);
    expect(rail[0]!.y).toBeLessThan(pill.y);
    expect(rail[rail.length - 1]!.x).toBeCloseTo(lineX, 5);
    expect(rail[rail.length - 1]!.y).toBeGreaterThan(pill.y + pill.h);
    // Both interchange dots sit on year lines, not on the program.
    const evatt = layout.draw.stops.find((stop) => stop.tickId === 'tk_evatt2')!;
    expect(Math.max(...evatt.dots.map((dot) => dot.x))).toBeCloseTo(lineX, 5);
    // A line stop inside the program's dates stays on the line, its name on the same side as its dot.
    const muna = layout.draw.stops.find((stop) => stop.tickId === 'tk_muna2')!;
    expect(muna.dots[0]!.x).toBeCloseTo(lineX, 5);
    expect(muna.anchor).toBe('end');
    expect(muna.labelX).toBeLessThan(lineX);
    // Rounds branch off the program's outer edge.
    const branch = layout.draw.branches.find((item) => item.id.includes('st_mock2'))!;
    expect(branch.points[0]!.x).toBeCloseTo(pill.x + TM_PILL_W / 2, 5);
    const r1 = layout.draw.stops.find((stop) => stop.tickId === 'tk_r1')!;
    expect(r1.dots[0]!.x).toBeGreaterThan(pill.x + TM_PILL_W / 2);
  });
});
