import { apiGet, apiPost } from '@/api/client';
import type { SkillsContinuum } from './schema';

let cached: Promise<SkillsContinuum> | null = null;

/** The continuum, fetched once per page load and shared by every view that needs it. */
export function loadSkills(): Promise<SkillsContinuum> {
  cached ??= apiGet<{ continuum: SkillsContinuum }>('/api/skills-continuum').then((r) => r.continuum);
  cached.catch(() => { cached = null; });
  return cached;
}

/** Copy the continuum again from the private repo. */
export async function refreshSkills(): Promise<SkillsContinuum> {
  const r = await apiPost<{ continuum: SkillsContinuum }>('/api/skills-continuum', { action: 'refresh' });
  cached = Promise.resolve(r.continuum);
  return r.continuum;
}

/** For tests. */
export function resetSkillsCacheForTests(): void {
  cached = null;
}
