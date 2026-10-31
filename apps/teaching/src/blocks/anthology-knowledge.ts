/**
 * Class knowledge: what students add to a unit's Anthology map from their pre-readings.
 * The server keeps it apart from lessons; this file is the client's view of it.
 */
import { apiGet, apiPost } from '@/api/client';
import type { AnthologyData } from '@/blocks/anthology-collect';

export type KnowledgeStatus = 'shown' | 'hidden' | 'waiting';

export type KnowledgeItem = {
  id: string;
  title: string;
  quote: string;
  info: string;
  themes: string[];
  concepts: string[];
  created_at: string;
  /** Teacher only. */
  initials?: string;
  /** Teacher only. */
  status?: KnowledgeStatus;
};

export type KnowledgeDraft = Pick<KnowledgeItem, 'title' | 'quote' | 'info' | 'themes' | 'concepts'> & {
  initials: string;
};

export type KnowledgeApi = {
  teacher: boolean;
  list(): Promise<KnowledgeItem[]>;
  add(draft: KnowledgeDraft): Promise<{ item: KnowledgeItem; status: KnowledgeStatus }>;
  moderate?(id: string, action: 'show' | 'hide' | 'delete'): Promise<void>;
};

/** The hub every class item sits under when the map groups by text. */
export const CLASS_KNOWLEDGE_TEXT = 'Class knowledge';

const PREFIX = 'knowledge::';
export const knowledgeNoteId = (id: string): string => `${PREFIX}${id}`;
export const isKnowledgeNoteId = (pageId: string): boolean => pageId.startsWith(PREFIX);

/** The themes and concepts a student may pick: the ones on the teacher's tagged notes. */
export function unitTagChoices(data: AnthologyData): { themes: string[]; concepts: string[] } {
  const sorted = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b));
  return {
    themes: sorted(data.items.flatMap((item) => item.themes)),
    concepts: sorted(data.items.flatMap((item) => item.concepts))
  };
}

export function studentKnowledgeApi(unitId: string): KnowledgeApi {
  const path = `/api/published/anthology-knowledge/${encodeURIComponent(unitId)}`;
  return {
    teacher: false,
    list: async () => (await apiGet<{ items: KnowledgeItem[] }>(path)).items,
    add: (draft) => apiPost(path, { action: 'add', ...draft })
  };
}

export function teacherKnowledgeApi(unitId: string): KnowledgeApi {
  const path = `/api/units/${encodeURIComponent(unitId)}/anthology-knowledge`;
  return {
    teacher: true,
    list: async () => (await apiGet<{ items: KnowledgeItem[] }>(path)).items,
    add: (draft) => apiPost(path, { action: 'add', ...draft }),
    moderate: async (id, action) => {
      await apiPost(path, { action, id });
    }
  };
}
