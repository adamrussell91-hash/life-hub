import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import {
  DOMAIN_VOCABULARY,
  MIN_TAG_PAGES,
  attachMinors,
  buildSolarModel,
  buildUniverseModel,
  entriesFromWork,
  massOf,
  packOrbits,
  rankTags,
  tagsForTask,
  worldPositions,
  type Body,
  type SolarModel,
  type UniverseEntry
} from '@/domain/universe';

const V = DOMAIN_VOCABULARY;

function page(id: string, title: string, tags: string[], excerpt = ''): UniverseEntry {
  return { id, title, excerpt, tags };
}

function tagged(prefix: string, tag: string, n: number, extra: string[] = []): UniverseEntry[] {
  return Array.from({ length: n }, (_, i) => page(`${prefix}${i}`, `${tag} ${i}`, [tag, ...extra]));
}

function snapshot(model: SolarModel) {
  return model.bodies.map((body) => ({
    id: body.id,
    kind: body.kind,
    parent: body.parent,
    a: body.a,
    phase: body.phase,
    r: body.r,
    sysR: body.sysR,
    pageId: body.pageId,
    count: body.count,
    color: body.color,
    period: body.period
  }));
}

const baseTask = (partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task => ({
  schema_version: 1,
  description: '',
  kind: 'task',
  bucket: 'active',
  step_order: 0,
  domain: 'teaching',
  framework_used: null,
  estimated_duration: 30,
  actual_duration: null,
  due_date: null,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
  completed_at: null,
  status: 'open',
  blocked_since: null,
  priority: 'medium',
  parent_project_id: null,
  parent_task_id: null,
  depends_on: [],
  tags: [],
  recurrence_rule: null,
  due_time: null,
  remind_at: null,
  remind_dismissed_at: null,
  attachments: [],
  source: 'manual',
  ...partial
});

const project: Project = {
  schema_version: 1,
  id: 'proj_mw',
  title: 'MindWorks',
  description: '',
  parent_goal_id: null,
  tags: [],
  arc_summary: '',
  type: 'academic_program',
  milestones: [],
  status: 'active',
  baseline_end_date: null,
  current_end_date: null,
  review_summary: null,
  stall_flagged_at: null,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
  competition_or_event_type: null,
  key_dates: null,
  student_group_reference: null,
  generated_admin_tasks: [],
  drafted_documents: null
};

describe('task tags', () => {
  it('adds domain, project title, and free tags', () => {
    const task = baseTask({
      id: 't1',
      title: 'Pack',
      domain: 'teaching',
      parent_project_id: 'proj_mw',
      tags: ['marking']
    });
    expect(tagsForTask(task, 'MindWorks')).toEqual(['teaching', 'marking', 'MindWorks']);
  });

  it('drops dead tasks from the model', () => {
    const entries = entriesFromWork(
      [
        baseTask({ id: 'live', title: 'Live' }),
        baseTask({ id: 'dead', title: 'Dead', status: 'dead' })
      ],
      []
    );
    expect(entries.map((entry) => entry.id)).toEqual(['live']);
  });
});

describe('rankTags', () => {
  it('keeps domains and extra tags that meet the floor', () => {
    const entries = [...tagged('real', V[0], MIN_TAG_PAGES), ...tagged('clip', 'Clip', 3)];
    const ranked = rankTags(entries);
    expect(ranked.map((item) => item.tag)).toEqual(['Clip', V[0]]);
  });
});

describe('attachMinors', () => {
  it('keeps domains as planets and projects as minors', () => {
    const ranked = [
      { tag: 'teaching', count: 12 },
      { tag: 'MindWorks', count: 8 },
      { tag: 'life', count: 3 }
    ];
    const weights = new Map([['MindWorks||teaching', 8]]);
    const { majors, minors, ownerOf } = attachMinors(ranked, weights);
    expect(majors.map((item) => item.tag)).toEqual(['teaching', 'life']);
    expect(minors.map((item) => item.tag)).toEqual(['MindWorks']);
    expect(ownerOf.get('MindWorks')).toBe('teaching');
  });
});

describe('INV-1 — one task, one body', () => {
  it('emits exactly one page or rock per entry and never duplicates a pageId', () => {
    const entries = [
      ...tagged('g', V[0], 12),
      ...tagged('l', V[1], 12),
      page('none', 'Untagged', []),
      page('empty', 'Empty', [])
    ];
    const model = buildSolarModel(entries);
    const pages = model.bodies.filter((body) => body.kind === 'page');
    const rocks = model.rocks;
    expect(pages.length + rocks.length).toBe(entries.length);
    const ids = model.bodies.map((body) => body.pageId).filter(Boolean) as string[];
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(entries.length);
  });

  it('sends untagged work to the belt, not to a planet', () => {
    const entries = [...tagged('g', V[0], 12), page('clip', 'A clip', [])];
    const model = buildSolarModel(entries);
    expect(model.bodies.find((body) => body.pageId === 'clip')?.kind).toBe('rock');
    expect(model.planets.map((planet) => planet.label)).toEqual([V[0]]);
  });
});

describe('buildSolarModel structure', () => {
  it('is depth-ordered so every parent precedes its children', () => {
    const entries = [
      ...tagged('a', V[0], 12, [V[1]]),
      ...tagged('b', V[1], 12),
      ...tagged('c', V[2], 12)
    ];
    const model = buildSolarModel(entries);
    for (const body of model.bodies) {
      expect(body.idx).toBe(model.bodies.indexOf(body));
      if (body.parent < 0) continue;
      expect(model.bodies[body.parent]!.idx).toBeLessThan(body.idx);
    }
  });

  it('treats every domain that appears as a major planet', () => {
    const tags = V.slice(0, 5);
    const entries = Array.from({ length: 40 }, (_, i) => {
      const major = tags[i % tags.length]!;
      const extra = tags[(i + 1) % tags.length]!;
      return page(`p${i}`, `Task ${i}`, [major, extra]);
    });
    const model = buildSolarModel(entries);
    expect(model.planets).toHaveLength(5);
    expect(model.planets.every((planet) => planet.parent === model.sun.idx)).toBe(true);
    expect(model.sun.label).toBe('Adam');
  });

  it('groups an owner’s tasks into moons by full tag set', () => {
    const entries = [
      ...Array.from({ length: 12 }, (_, i) => page(`solo${i}`, `Solo ${i}`, [V[0]])),
      ...Array.from({ length: 12 }, (_, i) => page(`pair${i}`, `Pair ${i}`, [V[0], 'MindWorks']))
    ];
    const model = buildSolarModel(entries);
    const moons = model.bodies.filter((body) => body.kind === 'moon');
    expect(moons.some((moon) => moon.label === V[0])).toBe(true);
    expect(moons.some((moon) => moon.label.includes(' + '))).toBe(true);
  });

  it('places a project as a minor planet around its domain', () => {
    const tasks = [
      ...Array.from({ length: 8 }, (_, i) =>
        baseTask({
          id: `mw${i}`,
          title: `MindWorks ${i}`,
          parent_project_id: 'proj_mw',
          tags: ['marking']
        })
      ),
      baseTask({ id: 'life1', title: 'Walk', domain: 'life' })
    ];
    const model = buildUniverseModel(tasks, [project]);
    expect(model.planets.some((planet) => planet.label === 'teaching')).toBe(true);
    expect(model.bodies.some((body) => body.kind === 'minor' && body.label === 'MindWorks')).toBe(true);
  });
});

describe('packOrbits', () => {
  function stub(id: string, sysR: number): Body {
    return {
      idx: 0,
      id,
      kind: 'moon',
      label: id,
      parent: 0,
      count: 1,
      r: sysR,
      sysR,
      a: 0,
      phase: 0,
      period: 0,
      e: 0,
      argP: 0,
      incline: 0,
      color: '#000',
      ink: '#000',
      children: []
    };
  }

  it('keeps similar sizes on one ring and opens a new ring for much smaller bodies', () => {
    const big = [stub('a', 10), stub('b', 9.5), stub('c', 9)];
    const small = [stub('d', 2), stub('e', 2)];
    const outer = packOrbits([...big, ...small], 4, false);
    expect(big[0]!.a).toBe(big[1]!.a);
    expect(small[0]!.a).toBeGreaterThan(big[0]!.a);
    expect(outer).toBeGreaterThan(small[0]!.a);
  });

  it('places solo children on distinct rings', () => {
    const minors = [stub('m1', 8), stub('m2', 6), stub('m3', 5)];
    packOrbits(minors, 9, true);
    expect(new Set(minors.map((body) => body.a)).size).toBe(3);
  });
});

function archive(): UniverseEntry[] {
  return Array.from({ length: 80 }, (_, i) => {
    const tags = [V[i % V.length]!, `cluster-${i % 4}`];
    if (i % 3 === 0) tags.push('MindWorks');
    return page(`p${i}`, `Task ${i}`, tags);
  });
}

describe('layout invariants', () => {
  it('is deterministic and never uses Math.random', () => {
    const src = readFileSync(path.resolve(process.cwd(), 'src/domain/universe.ts'), 'utf8');
    expect(src).not.toMatch(/Math\.random/);
    const entries = archive();
    expect(snapshot(buildSolarModel(entries))).toEqual(snapshot(buildSolarModel(entries)));
  });

  it('spreads major planets across several solar distances instead of one ring', () => {
    const model = buildSolarModel(archive());
    const radii = model.planets
      .filter((planet) => planet.parent === model.sun.idx)
      .map((planet) => Math.round(planet.a / 40));
    expect(new Set(radii).size).toBeGreaterThan(2);
  });

  it('gives a satellite a shorter year than the body it orbits', () => {
    const model = buildSolarModel(archive());
    const moons = model.bodies.filter((body) => body.kind === 'moon' && body.period > 0);
    expect(moons.length).toBeGreaterThan(0);
    for (const moon of moons) {
      const parent = model.bodies[moon.parent]!;
      if (!parent.period) continue;
      expect(moon.period).toBeLessThan(parent.period);
    }
  });

  it('jitters each orbit’s year by up to 20% so siblings do not lock step', () => {
    const model = buildSolarModel(archive());
    const planets = model.planets.filter((planet) => planet.parent === model.sun.idx && planet.a > 0);
    const sunMass = Math.max(massOf(model.sun), 1);
    const ratios = planets.map((planet) => {
      const kepler = Math.max(7, 24 * Math.sqrt(planet.a ** 3 / sunMass));
      return planet.period / kepler;
    });
    expect(Math.min(...ratios)).toBeGreaterThanOrEqual(0.8);
    expect(Math.max(...ratios)).toBeLessThanOrEqual(1.2);
  });
});

describe('degenerate inputs', () => {
  it('builds a sun-only model from an empty archive', () => {
    const model = buildSolarModel([]);
    expect(model.sun.kind).toBe('sun');
    expect(model.planets).toHaveLength(0);
    expect(model.rocks).toHaveLength(0);
    expect(model.bodies).toHaveLength(1);
    expect(model.reach).toBeGreaterThan(0);
  });

  it('handles a single entry', () => {
    const model = buildSolarModel([page('x', 'One', [V[0]])]);
    expect(model.bodies.filter((body) => body.pageId).length).toBe(1);
  });

  it('puts an all-untagged archive in the belt', () => {
    const entries = Array.from({ length: 20 }, (_, i) => page(`u${i}`, `U ${i}`, []));
    const model = buildSolarModel(entries);
    expect(model.planets).toHaveLength(0);
    expect(model.rocks).toHaveLength(20);
  });

  it('keeps the sun as the root and every planet on a solar orbit', () => {
    const model = buildSolarModel(tagged('t', V[0], 8));
    expect(model.sun.parent).toBe(-1);
    expect(model.planets.every((planet) => planet.parent === model.sun.idx)).toBe(true);
    const { x, y } = worldPositions(model.bodies, 0);
    expect(Number.isFinite(x[model.sun.idx])).toBe(true);
    expect(Number.isFinite(y[model.sun.idx])).toBe(true);
  });
});
