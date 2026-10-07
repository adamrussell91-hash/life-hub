import { describe, expect, it } from 'vitest';
import { citySnapshot } from '@/domain/city/snapshot';
import {
  BLOCK,
  MIN_ROUTE_TILES,
  STOPS_PER_LANE,
  blockRing,
  layoutCity,
  pathLength,
  validateLayout,
  type CityLayout
} from '@/domain/city/layout';
import type { CityInput, CitySnapshot } from '@/domain/city/types';
import { GOLDEN_DAYS, emptyInput, goal, project, task } from '@/domain/city/fixtures/golden-days';

const NOW = new Date('2026-10-12T02:00:00.000Z');

function day(n: number): string {
  return new Date(Date.UTC(2026, 6, 1 + n)).toISOString();
}

/** Projects created a day apart, each with `stops` tasks, all in one district unless given. */
function city(specs: Array<{ id: string; stops: number; domain?: string; goal?: string; created?: number }>): CityInput {
  const input = emptyInput();
  specs.forEach((spec, index) => {
    input.projects.push(project({ id: spec.id, title: spec.id, parent_goal_id: spec.goal ?? null, created_at: day(spec.created ?? index) }));
    for (let i = 0; i < spec.stops; i += 1) {
      input.tasks.push(task({ id: `${spec.id}-t${i}`, title: `Stop ${i}`, domain: spec.domain ?? 'teaching', parent_project_id: spec.id, step_order: i }));
    }
  });
  return input;
}

function snap(input: CityInput): CitySnapshot {
  return citySnapshot(input, NOW);
}

function routeOf(layout: CityLayout, id: string) {
  const route = layout.routes.find((r) => r.id === id);
  if (!route) throw new Error(`no route ${id}`);
  return route;
}

describe('golden days lay out cleanly', () => {
  for (const build of GOLDEN_DAYS) {
    const goldenDay = build();
    it(goldenDay.name, () => {
      const snapshot = citySnapshot(goldenDay.input, goldenDay.now);
      expect(validateLayout(snapshot, layoutCity(snapshot))).toEqual([]);
    });
  }
});

describe('the map grows from the harbour and river corner', () => {
  it('walks blocks in rings north and west', () => {
    const ring = blockRing();
    const first = Array.from({ length: 4 }, () => ring.next().value);
    expect(first).toEqual([{ bx: 0, by: 0 }, { bx: 0, by: 1 }, { bx: 1, by: 1 }, { bx: 1, by: 0 }]);
  });

  it('keeps every route, stop and line off the water and the promenade', () => {
    const input = city([{ id: 'a', stops: 3 }, { id: 'b', stops: 9, domain: 'personal' }, { id: 'c', stops: 1, goal: 'g' }]);
    input.goals.push(goal({ id: 'g', title: 'Goal' }));
    const snapshot = snap(input);
    const layout = layoutCity(snapshot);
    expect(validateLayout(snapshot, layout).filter((n) => n.code === 'public_edge_closed')).toEqual([]);
  });

  it('gives each district its own block', () => {
    const layout = layoutCity(snap(city([{ id: 'a', stops: 2 }, { id: 'b', stops: 2, domain: 'personal' }])));
    expect(layout.districts).toEqual([
      { id: 'personal', blocks: [{ bx: 0, by: 1 }] },
      { id: 'teaching', blocks: [{ bx: 0, by: 0 }] }
    ]);
  });

  it('spills a full district into the next free block', () => {
    const specs = Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, stops: 2 }));
    const layout = layoutCity(snap(city(specs)));
    expect(layout.districts[0].blocks).toHaveLength(2);
    expect(routeOf(layout, 'p6').lanes[0]).toMatchObject({ bx: 0, by: 1, lane: 0 });
  });
});

describe('a full district spreads into its neighbourhood', () => {
  it('takes the free block nearest its own ground, not the next one in ring order', () => {
    // a (0,0), b (0,1), teaching (1,1), c (1,0). When teaching fills up, ring order's next free
    // block is (0,2), two steps away; (1,2) is right beside it and must win.
    const specs = [
      { id: 'a0', stops: 2, domain: 'a' },
      { id: 'b0', stops: 2, domain: 'b' },
      { id: 't0', stops: 2, domain: 'teaching' },
      { id: 'c0', stops: 2, domain: 'c' },
      ...Array.from({ length: 6 }, (_, i) => ({ id: `t${i + 1}`, stops: 2, domain: 'teaching' }))
    ];
    const layout = layoutCity(snap(city(specs)));
    const teaching = layout.districts.find((d) => d.id === 'teaching');
    expect(teaching?.blocks).toEqual([{ bx: 1, by: 1 }, { bx: 1, by: 2 }]);
  });
});

describe('routes are long enough to watch a bus travel', () => {
  it('runs even a one-stop project along a full lane', () => {
    const layout = layoutCity(snap(city([{ id: 'a', stops: 1 }])));
    expect(routeOf(layout, 'a').length).toBeGreaterThanOrEqual(MIN_ROUTE_TILES);
  });

  it('spreads two stops across the route, not side by side', () => {
    const layout = layoutCity(snap(city([{ id: 'a', stops: 2 }])));
    const [first, second] = layout.stops;
    expect(Math.abs(second.at.x - first.at.x) + Math.abs(second.at.y - first.at.y)).toBeGreaterThanOrEqual(BLOCK / 2);
  });

  it('snakes a long project across extra lanes with stops still spaced out', () => {
    const snapshot = snap(city([{ id: 'a', stops: STOPS_PER_LANE * 2 + 1 }]));
    const layout = layoutCity(snapshot);
    expect(routeOf(layout, 'a').lanes).toHaveLength(3);
    expect(validateLayout(snapshot, layout)).toEqual([]);
  });
});

describe('nothing moves unless its own record changes', () => {
  it('gives the same layout for the same input, in any order', () => {
    const input = city([{ id: 'a', stops: 3 }, { id: 'b', stops: 2, domain: 'personal' }, { id: 'c', stops: 5 }]);
    const shuffled = { ...input, projects: [...input.projects].reverse(), tasks: [...input.tasks].reverse() };
    expect(layoutCity(snap(shuffled))).toEqual(layoutCity(snap(input)));
  });

  it('places a new project without moving any existing one', () => {
    const before = city([{ id: 'a', stops: 3 }, { id: 'b', stops: 2, domain: 'personal' }]);
    const first = layoutCity(snap(before));
    const after = city([{ id: 'a', stops: 3 }, { id: 'b', stops: 2, domain: 'personal' }, { id: 'c', stops: 4 }]);
    const snapshot = snap(after);
    const second = layoutCity(snapshot, first);
    expect(validateLayout(snapshot, second, first)).toEqual([]);
    expect(routeOf(second, 'a')).toEqual(routeOf(first, 'a'));
    expect(routeOf(second, 'b')).toEqual(routeOf(first, 'b'));
  });

  it('matches a fresh layout when the newest project is the only change', () => {
    const first = layoutCity(snap(city([{ id: 'a', stops: 3 }])));
    const after = snap(city([{ id: 'a', stops: 3 }, { id: 'b', stops: 2 }]));
    expect(layoutCity(after, first)).toEqual(layoutCity(after));
  });

  it('fits a backdated project into free space instead of shuffling older ones', () => {
    const first = layoutCity(snap(city([{ id: 'a', stops: 3, created: 5 }, { id: 'b', stops: 3, created: 6 }])));
    const snapshot = snap(city([{ id: 'a', stops: 3, created: 5 }, { id: 'b', stops: 3, created: 6 }, { id: 'old', stops: 2, created: 0 }]));
    const second = layoutCity(snapshot, first);
    expect(validateLayout(snapshot, second, first)).toEqual([]);
    expect(routeOf(second, 'old').lanes[0].lane).toBe(2);
  });

  it('leaves the rest of the city alone when a project is deleted', () => {
    const first = layoutCity(snap(city([{ id: 'a', stops: 2 }, { id: 'b', stops: 2 }, { id: 'c', stops: 2 }])));
    const input = city([{ id: 'a', stops: 2 }, { id: 'b', stops: 2 }, { id: 'c', stops: 2 }]);
    input.projects = input.projects.filter((p) => p.id !== 'b');
    input.tasks = input.tasks.filter((t) => t.parent_project_id !== 'b');
    const snapshot = snap(input);
    const second = layoutCity(snapshot, first);
    expect(validateLayout(snapshot, second, first)).toEqual([]);
    expect(routeOf(second, 'c')).toEqual(routeOf(first, 'c'));
  });

  it('grows a route at its end when it outgrows its lane', () => {
    const first = layoutCity(snap(city([{ id: 'a', stops: 3 }, { id: 'b', stops: 2 }])));
    const snapshot = snap(city([{ id: 'a', stops: STOPS_PER_LANE + 2 }, { id: 'b', stops: 2 }]));
    const second = layoutCity(snapshot, first);
    expect(validateLayout(snapshot, second, first)).toEqual([]);
    const grown = routeOf(second, 'a');
    expect(grown.lanes.slice(0, 1)).toEqual(routeOf(first, 'a').lanes);
    expect(grown.path.slice(0, 2)).toEqual(routeOf(first, 'a').path);
    expect(pathLength(grown.path)).toBeGreaterThan(routeOf(first, 'a').length);
    expect(routeOf(second, 'b')).toEqual(routeOf(first, 'b'));
  });

  it('keeps a route in the district it started in, even if its tasks change domain', () => {
    const first = layoutCity(snap(city([{ id: 'a', stops: 2 }])));
    const second = layoutCity(snap(city([{ id: 'a', stops: 2, domain: 'personal' }])), first);
    expect(routeOf(second, 'a').district).toBe('teaching');
    expect(routeOf(second, 'a').lanes).toEqual(routeOf(first, 'a').lanes);
  });

  it('catches a moved route', () => {
    const snapshot = snap(city([{ id: 'a', stops: 2 }, { id: 'b', stops: 2 }]));
    const first = layoutCity(snapshot);
    const moved = structuredClone(first);
    moved.routes[0].lanes[0].lane = 5;
    expect(validateLayout(snapshot, moved, first).map((n) => n.code)).toContain('layout_reflow');
  });
});

describe('lines, trams and landmarks', () => {
  it('puts a station at the start of each of a goal’s routes', () => {
    const input = city([{ id: 'a', stops: 2, goal: 'g' }, { id: 'b', stops: 2, goal: 'g', domain: 'personal' }]);
    input.goals.push(goal({ id: 'g', title: 'Goal' }));
    const layout = layoutCity(snap(input));
    const line = layout.lines[0];
    expect(line.stations.map((s) => s.routeId)).toEqual(['a', 'b']);
    expect(line.stations[0].at).toEqual(routeOf(layout, 'a').path[0]);
  });

  it('gives tasks hosted on a goal their own lane on the line', () => {
    const input = emptyInput();
    input.goals.push(goal({ id: 'g', title: 'Run a half marathon' }));
    input.tasks.push(task({ id: 'd1', title: 'Buy shoes', domain: 'fitness', parent_project_id: null, parent_goal_id: 'g' }));
    const snapshot = snap(input);
    const layout = layoutCity(snapshot);
    expect(layout.stops).toEqual([{ id: 'd1', routeId: 'line:g', at: expect.any(Object) }]);
    expect(validateLayout(snapshot, layout)).toEqual([]);
  });

  it('raises a landmark beside an achieved goal’s first station', () => {
    const input = city([{ id: 'a', stops: 2, goal: 'g' }]);
    input.goals.push(goal({ id: 'g', title: 'Done goal', status: 'achieved' }));
    const layout = layoutCity(snap(input));
    expect(layout.landmarks).toHaveLength(1);
  });

  it('loops trams around their district', () => {
    const input = emptyInput();
    input.tasks.push(task({ id: 'r', title: 'Stretch', domain: 'health', recurrence_rule: JSON.stringify({ v: 1, frequency: 'daily', interval: 1 }) }));
    const layout = layoutCity(snap(input));
    expect(layout.trams).toHaveLength(1);
    expect(layout.trams[0].loop).toHaveLength(5);
  });
});

describe('layout rules fail when broken on purpose', () => {
  const snapshot = snap(city([{ id: 'a', stops: 3 }, { id: 'b', stops: 2 }]));
  const good = layoutCity(snapshot);
  const codes = (layout: CityLayout) => validateLayout(snapshot, layout).map((n) => n.code);

  it('public_edge_closed', () => {
    const bad = structuredClone(good);
    bad.routes[0].path[0] = { x: 0, y: 5 };
    expect(codes(bad)).toContain('public_edge_closed');
  });

  it('route_too_short', () => {
    const bad = structuredClone(good);
    bad.routes[0].length = 4;
    expect(codes(bad)).toContain('route_too_short');
  });

  it('stops_too_close', () => {
    const bad = structuredClone(good);
    bad.stops[1].at = { ...bad.stops[0].at };
    expect(codes(bad)).toContain('stops_too_close');
  });

  it('lane_shared', () => {
    const bad = structuredClone(good);
    bad.routes[1].lanes = [...bad.routes[0].lanes];
    expect(codes(bad)).toContain('lane_shared');
  });

  it('layout_missing', () => {
    const bad = structuredClone(good);
    bad.stops.pop();
    expect(codes(bad)).toContain('layout_missing');
  });
});
