import type { MapPlanning, MapStation, MapTick } from '@/schemas/map';
import type { Project } from '@/schemas/project';
import { tasksApi } from '@/services/client-api';

/** Tag on projects created by promoting a map card to active. */
export const MAP_CARD_TAG = 'map-card';

export type MapItemKind = 'station' | 'event';

export function planningOf(item: { planning?: MapPlanning | null }): MapPlanning {
  return item.planning === 'active' ? 'active' : 'planned';
}

export function mapItemKindLabel(kind: MapItemKind): string {
  return kind === 'station' ? 'Program' : 'Competition';
}

export function mapItemPageHash(mapId: string, kind: MapItemKind, id: string): string {
  return `#/maps/${encodeURIComponent(mapId)}/${kind}/${encodeURIComponent(id)}`;
}

export function isMapCardProject(project: Project | undefined | null): boolean {
  return Boolean(project?.tags.includes(MAP_CARD_TAG));
}

export async function activateMapItem(
  item: MapStation | MapTick,
  kind: MapItemKind,
  lineName: string | undefined,
  projects: Project[]
): Promise<Project | null> {
  item.planning = 'active';
  if (item.link) {
    const existing = projects.find((project) => project.id === item.link!.id);
    if (existing?.status === 'archived_dead' && isMapCardProject(existing)) {
      return tasksApi.updateProject(existing.id, { status: 'active', title: item.label });
    }
    return existing ?? null;
  }
  const tags = [MAP_CARD_TAG];
  if (lineName) tags.push(lineName.toLowerCase());
  const project = await tasksApi.createProject({
    title: item.label,
    type: kind === 'station' ? 'academic_program' : 'standard',
    current_end_date: item.ends_on,
    tags
  });
  item.link = { type: 'project', id: project.id };
  return project;
}

export async function planMapItem(item: MapStation | MapTick, projects: Project[]): Promise<void> {
  item.planning = 'planned';
  if (!item.link) return;
  const existing = projects.find((project) => project.id === item.link!.id);
  if (existing && isMapCardProject(existing) && existing.status !== 'archived_dead') {
    await tasksApi.updateProject(existing.id, { status: 'archived_dead' });
  }
}

export async function deleteMapItemProject(
  item: MapStation | MapTick,
  projects: Project[]
): Promise<void> {
  if (!item.link) return;
  const existing = projects.find((project) => project.id === item.link!.id);
  if (existing && isMapCardProject(existing)) {
    await tasksApi.deleteProject(existing.id);
  }
}
