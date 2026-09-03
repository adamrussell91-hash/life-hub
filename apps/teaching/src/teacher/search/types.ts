export type SearchObjectType =
  | 'lesson'
  | 'unit'
  | 'class'
  | 'subject'
  | 'year'
  | 'scope_sequence'
  | 'scope_note'
  | 'resource'
  | 'composition'
  | 'action';

export interface SearchHit {
  type: SearchObjectType;
  id: string;
  title: string;
  hierarchy?: string;
  snippet?: string;
  /** For ranking: where it matched */
  match: 'title' | 'code' | 'hierarchy' | 'body' | 'action';
  /** Navigation path or action id */
  href?: string;
  actionId?: string;
}

export interface RecentItem {
  type: 'lesson' | 'unit' | 'class';
  id: string;
  title: string;
  opened_at: string;
}

export interface ContentSearchHit {
  type: 'lesson' | 'unit' | 'composition';
  id: string;
  snippet: string;
}
