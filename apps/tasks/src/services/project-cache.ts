import type { Project } from '@/schemas/project';

const listed = new Map<string, Project>();
const deleted = new Set<string>();
const tombstones = new Map<string, Project>();

function pickNewer(a: Project, b: Project): Project {
  return a.updated_at >= b.updated_at ? a : b;
}

/**
 * Mirrors task-cache.ts: a project just created or updated can momentarily
 * lag behind on a fresh list/get fetch (e.g. Netlify Blobs read-after-write
 * propagation), which is exactly the "have to refresh" symptom. Keep serving
 * the locally-known version until the fetch catches up.
 */
export function mergeListedProjects(fetched: Project[]): Project[] {
  for (const project of fetched) {
    if (deleted.has(project.id)) continue;
    const current = listed.get(project.id);
    listed.set(project.id, current ? pickNewer(project, current) : project);
  }
  return [...listed.values()].filter((project) => !deleted.has(project.id));
}

/** Prefer whichever of a fresh single-project fetch or the local cache is newer. */
export function mergeFetchedProject(project: Project): Project {
  deleted.delete(project.id);
  const current = listed.get(project.id);
  const resolved = current ? pickNewer(project, current) : project;
  listed.set(project.id, resolved);
  return resolved;
}

export function getCachedProject(id: string): Project | null {
  if (deleted.has(id)) return null;
  return listed.get(id) ?? null;
}

export function rememberCreatedProject(project: Project): void {
  deleted.delete(project.id);
  tombstones.delete(project.id);
  listed.set(project.id, project);
}

export function rememberUpdatedProject(project: Project): void {
  rememberCreatedProject(project);
}

export function rememberDeletedProject(id: string, project?: Project): void {
  const existing = project ?? listed.get(id);
  if (existing) tombstones.set(id, existing);
  listed.delete(id);
  deleted.add(id);
}

export function restoreDeletedProject(id: string): Project | null {
  deleted.delete(id);
  const project = tombstones.get(id) ?? null;
  tombstones.delete(id);
  if (project) listed.set(id, project);
  return project;
}

/** Test hook — drop session overlays between specs. */
export function resetProjectCache(): void {
  listed.clear();
  deleted.clear();
  tombstones.clear();
}
