// apps/tasks/tests/unit/seed-fixture.ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TaskSchema } from '@/schemas/task';
import { ProjectSchema } from '@/schemas/project';
import { AreaSchema } from '@/schemas/area';
import { GoalSchema } from '@/schemas/goal';
import type { SeedData } from '@/services/types';

/**
 * fixtures/seed.json parsed the way seedIfEmpty writes it, so tests see the
 * same shape production reads back (schema defaults such as depends_on: [] and
 * description: '' filled in). Casting the raw JSON to SeedData lets a sparse
 * seed entry reach domain code with fields that real tasks always have.
 */
export function loadSeed(): SeedData {
  const raw = JSON.parse(
    readFileSync(resolve(process.cwd(), 'fixtures/seed.json'), 'utf8')
  ) as SeedData;
  return {
    ...raw,
    tasks: raw.tasks.map((item) => TaskSchema.parse(item)),
    projects: raw.projects.map((item) => ProjectSchema.parse(item)),
    ...(raw.areas ? { areas: raw.areas.map((item) => AreaSchema.parse(item)) } : {}),
    ...(raw.goals ? { goals: raw.goals.map((item) => GoalSchema.parse(item)) } : {})
  };
}
