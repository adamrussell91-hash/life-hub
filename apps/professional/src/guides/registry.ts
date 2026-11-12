import { ACHIEVEMENT_ID, ACHIEVEMENT_NAME } from './achievement/model';
import { motivationSdt } from './motivation-sdt';
import type { GuideDefinition } from './types';

/** The shelf, in order. Add a guide here and it appears in every meeting. */
export const GUIDES: GuideDefinition[] = [motivationSdt];

export function guideById(id: string): GuideDefinition | null {
  return GUIDES.find((guide) => guide.id === id) ?? null;
}

/** A guide's display name, including guides with their own panel (Achievement). */
export function guideName(id: string): string {
  if (id === ACHIEVEMENT_ID) return ACHIEVEMENT_NAME;
  return guideById(id)?.name ?? 'Guide';
}
