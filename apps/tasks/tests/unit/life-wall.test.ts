import { describe, expect, it } from 'vitest';
import { sanitizeProjectPatch, sanitizeTaskPatch } from '@/domain/agent-mutations';
import { beforeWallChip, collectLifeWalls, dueNearWall } from '@/domain/life-wall';
import { GoalSchema } from '@/schemas/goal';
import { LifeWallValueSchema } from '@/schemas/life-wall';
import { MilestoneSchema, ProjectSchema } from '@/schemas/project';
import { TaskSchema } from '@/schemas/task';

const wall = { starts_on: '2026-12-12', ends_on: '2027-01-06', label: 'Overseas trip' };

function task(extra: Record<string, unknown> = {}) {
  return TaskSchema.parse({
    schema_version: 1,
    id: 't1',
    title: 'Pack',
    domain: 'life',
    created_at: '2026-09-22T00:00:00.000Z',
    updated_at: '2026-09-22T00:00:00.000Z',
    ...extra
  });
}

describe('life wall schema', () => {
  it('parses records that omit life_wall', () => {
    expect(task().life_wall).toBeUndefined();
    expect(
      ProjectSchema.parse({
        schema_version: 1,
        id: 'p1',
        title: 'Trip',
        created_at: '2026-09-22T00:00:00.000Z',
        updated_at: '2026-09-22T00:00:00.000Z'
      }).life_wall
    ).toBeUndefined();
    expect(
      GoalSchema.parse({
        schema_version: 1,
        id: 'g1',
        title: 'Rest',
        created_at: '2026-09-22T00:00:00.000Z',
        updated_at: '2026-09-22T00:00:00.000Z'
      }).life_wall
    ).toBeUndefined();
    expect(MilestoneSchema.parse({ id: 'm1', project_id: 'p1', title: 'Leave' }).life_wall).toBeUndefined();
  });

  it('keeps a wall and rejects an end before the start', () => {
    expect(task({ life_wall: wall }).life_wall).toEqual(wall);
    expect(task({ life_wall: null }).life_wall).toBeNull();
    expect(() => LifeWallValueSchema.parse({ ...wall, ends_on: '2026-12-01' })).toThrow(/ends_on/);
    expect(() => task({ life_wall: { ...wall, ends_on: '2026-12-01' } })).toThrow(/ends_on/);
  });
});

describe('life wall sanitising', () => {
  it('keeps life_wall on task and project patches', () => {
    expect(sanitizeTaskPatch({ life_wall: wall, id: 'nope' })).toEqual({ life_wall: wall });
    expect(sanitizeProjectPatch({ life_wall: null, schema_version: 2 })).toEqual({ life_wall: null });
  });
});

describe('life wall collection', () => {
  it('collects walls from tasks, projects, goals, and milestones', () => {
    const walls = collectLifeWalls({
      tasks: [{ id: 'dream', title: 'Sabbatical', life_wall: { starts_on: '2027-06-01', ends_on: '2027-06-14', label: null } }],
      goals: [{ id: 'g1', title: 'Family', life_wall: { starts_on: '2026-12-24', ends_on: '2026-12-26', label: 'Christmas' } }],
      projects: [
        {
          id: 'p-trip',
          title: 'Overseas trip',
          life_wall: wall,
          milestones: [
            { id: 'm1', title: 'Flight', life_wall: { starts_on: '2026-12-12', ends_on: '2026-12-12', label: 'Departure' } }
          ]
        }
      ]
    });
    expect(walls.map((item) => [item.source, item.label])).toEqual([
      ['task', 'Sabbatical'],
      ['goal', 'Christmas'],
      ['project', 'Overseas trip'],
      ['milestone', 'Departure']
    ]);
  });

  it('flags dues inside a wall and within 3 working days before it', () => {
    expect(dueNearWall('2026-12-20', wall)).toBe(true);
    expect(dueNearWall('2026-12-09', wall)).toBe(true);
    expect(dueNearWall('2026-12-08', wall)).toBe(false);
    expect(beforeWallChip('2026-12-09', 'open', [{ id: 'w', ...wall, label: 'Overseas trip', source: 'project', sourceId: 'p-trip' }])).toBe(
      'before Overseas trip'
    );
    expect(beforeWallChip('2026-12-09', 'done', [{ id: 'w', ...wall, label: 'Overseas trip', source: 'project', sourceId: 'p-trip' }])).toBeNull();
  });
});
