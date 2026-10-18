export interface NotionAnnotations {
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
  code?: boolean;
  color?: string;
}

export interface NotionRichText {
  type: 'text' | 'mention' | 'equation';
  plain_text: string;
  href?: string | null;
  annotations?: NotionAnnotations;
}

/**
 * One block after normalisation by the reader. `data` is the raw
 * `block[block.type]` payload. Tabs are normalised to
 * { type: 'tabs', children: [{ type: 'tab', data: { label }, children }] }.
 */
export interface NotionNode {
  id: string;
  type: string;
  data: Record<string, any>;
  children: NotionNode[];
  /** Set by the reader when Notion refused to return this block's children. */
  children_error?: string;
}

export interface NotionFileRef {
  name: string;
  url: string;
  source: 'file' | 'external';
}

export interface NotionPage {
  id: string;
  url: string;
  last_edited_time: string;
  title: string;
  category: string | null;
  subjects: string[];
  years: string[];
  outcomes: string[];
  date_start: string | null;
  date_end: string | null;
  files: NotionFileRef[];
  cover: NotionFileRef | null;
  blocks: NotionNode[];
  /** Sub-item page ids, in Notion's relation order. */
  child_ids: string[];
}

export interface NotionTree {
  root_id: string;
  pages: Record<string, NotionPage>;
  /** Sub-item pages the reader could not read. */
  unreadable?: Array<{ page_id: string; parent_id: string; code: string }>;
}

export type WarningRule =
  | 'flattened'
  | 'skipped'
  | 'unsupported'
  | 'file_too_big'
  | 'file_failed'
  | 'html_app'
  | 'mermaid'
  | 'alt_text'
  | 'outcome_unmatched'
  | 'limit'
  | 'needs_choice'
  | 'invalid';

export interface ImportWarning {
  page_id: string;
  notion_block_id: string | null;
  rule: WarningRule;
  message: string;
}

export type MediaPurpose = 'image' | 'video' | 'attachment' | 'audio' | 'pdf' | 'html' | 'cover';

/** A Notion-hosted file the applier must download. `ref` appears in records as `notion-media:<ref>`. */
export interface MediaRef {
  ref: string;
  page_id: string;
  notion_block_id: string | null;
  url: string;
  name: string;
  purpose: MediaPurpose;
}

export const MEDIA_PLACEHOLDER_PREFIX = 'notion-media:';

export type EntityKind = 'unit' | 'lesson' | 'class' | 'document';

export interface PlannedEntity {
  page_id: string;
  parent_page_id: string | null;
  kind: EntityKind;
  /** e.g. 'Unit', 'Program', 'Workshop', 'Class', 'Syllabus' — for the preview. */
  label: string;
  id: string;
  title: string;
  /** True when the source map already has this page. */
  existing: boolean;
  /** Unmet choices; the applier skips entities with any. */
  needs: Array<'unit' | 'year' | 'subject'>;
  /** Defaults the preview pickers start from. */
  suggested: { year_id?: string; subject_id?: string; subject_title?: string };
  record: Record<string, unknown>;
}

export interface SkippedPage {
  page_id: string;
  parent_page_id: string | null;
  title: string;
  reason: string;
}

export interface HtmlAppCandidate {
  page_id: string;
  notion_block_id: string;
  preview: string;
}

export interface NewSubject {
  id: string;
  title: string;
}

export interface ImportPlan {
  root_page_id: string;
  entities: PlannedEntity[];
  skipped: SkippedPage[];
  new_subjects: NewSubject[];
  media: MediaRef[];
  warnings: ImportWarning[];
  html_apps: HtmlAppCandidate[];
}

export interface EntityOverride {
  year_id?: string;
  subject_id?: string;
  /** Create a subject with this title and use it. */
  create_subject_title?: string;
  /** Existing Teaching Hub unit for a lesson imported without its Notion unit. */
  unit_id?: string;
}

export interface ImportChoices {
  excluded_page_ids: string[];
  overrides: Record<string, EntityOverride>;
  /** Notion block ids of HTML code blocks to keep as plain code. */
  html_as_code: string[];
}

export const EMPTY_CHOICES: ImportChoices = { excluded_page_ids: [], overrides: {}, html_as_code: [] };

export interface MapContext {
  now: string;
  years: Array<{ id: string; year_level: number }>;
  subjects: Array<{ id: string; title: string }>;
  outcomes: Array<{ id: string; code: string }>;
  /** dashed notion page id, as the reader returns it → existing Teaching Hub entity id */
  source_map: Record<string, string>;
  choices: ImportChoices;
}
