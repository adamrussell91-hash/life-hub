import { describe, expect, it } from 'vitest';
import {
  buildGrovePlan,
  dayCentre,
  groveCompletions,
  groveWindow,
  growthAt,
  scaleFor,
  stageFor,
  GROWTH_DAYS,
  SAPLING_SCALE,
  TREE_SPACING,
  type GroveTaskInput
} from '@/domain/grove/plan';

const HOUR = 3_600_000;
// Saturday 10 October 2026, 8 pm in Sydney (AEDT, UTC+11).
const NOW = new Date('2026-10-10T09:00:00Z');

function done(id: string, completed_at: string | null, extra: Partial<GroveTaskInput> = {}): GroveTaskInput {
  return { id, title: `Task ${id}`, domain: 'life', status: 'done', completed_at, ...extra };
}

function plan(tasks: GroveTaskInput[], view: 'day' | 'week' = 'day', anchor = '2026-10-10', now = NOW) {
  return buildGrovePlan({ tasks, view, anchor, now });
}

describe('which tasks plant trees', () => {
  it('plants one tree per completed task on the Sydney day it was finished', () => {
    // 23:30 UTC on the 9th is 10:30 am on the 10th in Sydney.
    const { completions } = groveCompletions([done('a', '2026-10-09T23:30:00Z')]);
    expect(completions).toHaveLength(1);
    expect(completions[0]!.dayKey).toBe('2026-10-10');
  });

  it('never plants deleted tasks', () => {
    const { completions } = groveCompletions([
      done('dead', '2026-10-10T01:00:00Z', { status: 'dead' }),
      done('trash', '2026-10-10T01:00:00Z', { bucket: 'trash' }),
      { ...done('trashed', '2026-10-10T01:00:00Z'), trashed_at: '2026-10-10T02:00:00Z' } as GroveTaskInput
    ]);
    expect(completions).toEqual([]);
  });

  it('drops a reopened task, whose completion time the store clears', () => {
    const { completions, undated } = groveCompletions([
      { id: 'r', title: 'Reopened', domain: 'life', status: 'open', completed_at: null }
    ]);
    expect(completions).toEqual([]);
    expect(undated).toBe(0);
  });

  it('counts done tasks with no completion time instead of inventing a date', () => {
    const { completions, undated } = groveCompletions([done('legacy', null), done('bad', 'not a date')]);
    expect(completions).toEqual([]);
    expect(undated).toBe(2);
  });

  it('maps each domain to its species and anything unknown to other', () => {
    const { completions } = groveCompletions(
      ['life', 'teaching', 'health', 'wedding', 'other', 'professional', ''].map((domain, i) =>
        done(`d${i}`, `2026-10-10T0${i}:00:00Z`, { domain })
      )
    );
    expect(completions.map((c) => c.species)).toEqual(['life', 'teaching', 'health', 'wedding', 'other', 'other', 'other']);
  });

  it('grows a gnarled tree only when finished after the due day', () => {
    const { completions } = groveCompletions([
      done('on-time', '2026-10-10T01:00:00Z', { due_date: '2026-10-10' }),
      done('late', '2026-10-10T01:00:00Z', { due_date: '2026-10-09' }),
      done('early', '2026-10-10T01:00:00Z', { due_date: '2026-10-20' }),
      // 10 am Sydney on the 10th, due the 10th: on time even though UTC says the 9th.
      done('tz', '2026-10-09T23:00:00Z', { due_date: '2026-10-10', domain: 'teaching' })
    ]);
    const species = Object.fromEntries(completions.map((c) => [c.id, c.species]));
    expect(species).toEqual({ 'on-time': 'life', late: 'late', early: 'life', tz: 'teaching' });
  });
});

describe('growth', () => {
  it('runs from sapling to mature over the growth days and never shrinks', () => {
    const t0 = Date.parse('2026-10-01T00:00:00Z');
    expect(growthAt(t0, t0)).toBe(0);
    expect(growthAt(t0, t0 - HOUR)).toBe(0);
    expect(growthAt(t0, t0 + GROWTH_DAYS * 24 * HOUR)).toBe(1);
    expect(growthAt(t0, t0 + 400 * 24 * HOUR)).toBe(1);
    expect(stageFor(0)).toBe('sapling');
    expect(stageFor(0.5)).toBe('young');
    expect(stageFor(1)).toBe('mature');
    expect(scaleFor(0)).toBe(SAPLING_SCALE);
    expect(scaleFor(1)).toBe(1);
    let last = 0;
    for (let g = 0; g <= 1; g += 0.05) {
      expect(scaleFor(g)).toBeGreaterThanOrEqual(last);
      last = scaleFor(g);
    }
  });

  it('shows today as saplings and last week as a mature wood', () => {
    const p = plan(
      [done('today', '2026-10-10T08:00:00Z'), done('old', '2026-10-05T01:00:00Z')],
      'week'
    );
    const byId = Object.fromEntries(p.trees.map((t) => [t.id, t]));
    expect(byId.today!.stage).toBe('sapling');
    expect(byId.old!.stage).toBe('mature');
  });
});

describe('windows and clearings', () => {
  it('a week runs Monday to Sunday around the anchor', () => {
    expect(groveWindow('week', '2026-10-10')).toEqual([
      '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'
    ]);
    expect(groveWindow('day', '2026-10-10')).toEqual(['2026-10-10']);
  });

  it('marks weekends, today and the days still to come', () => {
    const p = plan([], 'week');
    expect(p.days.map((d) => d.weekend)).toEqual([false, false, false, false, false, true, true]);
    expect(p.days.find((d) => d.today)!.key).toBe('2026-10-10');
    expect(p.days.filter((d) => d.future).map((d) => d.key)).toEqual(['2026-10-11']);
  });

  it('an empty day is still grass', () => {
    const day = plan([]).days[0]!;
    expect(day.trees).toEqual([]);
    expect(day.props.filter((p) => p.kind === 'grass').length).toBeGreaterThan(0);
  });

  it('a clearing sits in the same place in the day and week views', () => {
    const tasks = [done('a', '2026-10-08T01:00:00Z'), done('b', '2026-10-08T02:00:00Z', { domain: 'teaching' })];
    const day = plan(tasks, 'day', '2026-10-08').days[0]!;
    const week = plan(tasks, 'week', '2026-10-08').days.find((d) => d.key === '2026-10-08')!;
    expect(week.cx).toBe(day.cx);
    expect(week.trees).toEqual(day.trees);
    expect(week.props).toEqual(day.props);
  });

  it('neighbouring clearings do not overlap', () => {
    const p = plan([], 'week');
    for (let i = 1; i < p.days.length; i += 1) {
      const a = dayCentre(p.days[i - 1]!.key);
      const b = dayCentre(p.days[i]!.key);
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(p.days[i]!.radius + p.days[i - 1]!.radius);
    }
  });
});

describe('placement', () => {
  const busyDay = Array.from({ length: 24 }, (_, i) =>
    done(`t${i}`, new Date(Date.parse('2026-10-09T20:00:00Z') + i * 20 * 60_000).toISOString(), {
      domain: ['life', 'teaching', 'health', 'wedding'][i % 4]
    })
  );

  it('is deterministic', () => {
    expect(plan(busyDay)).toEqual(plan(busyDay));
  });

  it('keeps trunks apart, so there is never a visible clump or grid', () => {
    const trees = plan(busyDay).trees;
    expect(trees).toHaveLength(24);
    for (const a of trees) {
      for (const b of trees) {
        if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(TREE_SPACING - 1e-3);
      }
    }
  });

  it('never moves standing trees when another task is finished later', () => {
    const before = plan(busyDay.slice(0, 12)).trees;
    const after = plan(busyDay).trees;
    for (const tree of before) {
      const same = after.find((t) => t.id === tree.id)!;
      expect([same.x, same.z, same.variant, same.rotation]).toEqual([tree.x, tree.z, tree.variant, tree.rotation]);
    }
  });

  it('grows each species in its own patch', () => {
    const trees = plan(busyDay).trees;
    const centroid = (s: string) => {
      const list = trees.filter((t) => t.species === s);
      return { x: list.reduce((n, t) => n + t.x, 0) / list.length, z: list.reduce((n, t) => n + t.z, 0) / list.length };
    };
    const life = centroid('life');
    const health = centroid('health');
    expect(Math.hypot(life.x - health.x, life.z - health.z)).toBeGreaterThan(3);
  });

  it('keeps ground cover off the trunks', () => {
    const day = plan(busyDay).days[0]!;
    for (const prop of day.props) {
      for (const tree of day.trees) expect(Math.hypot(prop.x - tree.x, prop.z - tree.z)).toBeGreaterThan(0.55);
    }
  });

  it('counts trees per species for the key', () => {
    const p = plan(busyDay);
    expect(p.counts).toMatchObject({ life: 6, teaching: 6, health: 6, wedding: 6, other: 0, late: 0 });
  });
});
