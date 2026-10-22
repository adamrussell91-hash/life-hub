/**
 * The HSC skills continuum, for the teacher only.
 *
 *   skills_continuum/v1   { strands, fetched_at }
 *
 * Copied from the private data repository (data/teaching/skills/{strand}.json)
 * on first use and on refresh. The continuum is edited in the private repo,
 * not in the app.
 */
import { SKILL_STRANDS, SkillStrandSchema, SkillsContinuumSchema } from './skills-continuum-schema.mjs';
import { readPrivateJsonFile } from './private-data-file.mjs';
import { reject } from './question-drop.mjs';

const KEY = 'skills_continuum/v1';
export const privateSkillsPath = (strand) => `data/teaching/skills/${strand}.json`;

export async function readPrivateSkills(deps = {}) {
  const strands = [];
  for (const strand of SKILL_STRANDS) {
    const parsed = SkillStrandSchema.safeParse(await readPrivateJsonFile(privateSkillsPath(strand), { ...deps, label: 'private skills file' }));
    if (!parsed.success) reject(500, 'corrupt', `The private skills file for ${strand} couldn’t be read.`);
    strands.push(parsed.data);
  }
  return { strands, fetched_at: new Date().toISOString() };
}

async function readStored(store) {
  const raw = await store.get(KEY, { type: 'json', consistency: 'strong' });
  if (!raw) return null;
  const parsed = SkillsContinuumSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** The continuum, copied from the private repo on first use. */
export async function loadSkills(store, deps = {}) {
  const stored = await readStored(store);
  if (stored) return stored;
  return refreshSkills(store, deps);
}

/** Copy the continuum again from the private repo, replacing the stored copy. */
export async function refreshSkills(store, deps = {}) {
  const fresh = await readPrivateSkills(deps);
  await store.setJSON(KEY, fresh);
  return fresh;
}
