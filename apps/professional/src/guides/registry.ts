import { motivationSdt } from './motivation-sdt';
import type { GuideDefinition } from './types';

/** The shelf, in order. Add a guide here and it appears in every meeting. */
export const GUIDES: GuideDefinition[] = [motivationSdt];

export function guideById(id: string): GuideDefinition | null {
  return GUIDES.find((guide) => guide.id === id) ?? null;
}
