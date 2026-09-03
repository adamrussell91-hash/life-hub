import type { Block } from '@/schemas/block';

export type CompositionTemplate = {
  id: string;
  title: string;
  slug: string;
  status: 'active' | 'archived' | 'trashed';
  created_at: string;
  updated_at: string;
  schema_version: 1;
  type: 'composition_template';
  root: Extract<Block, { block_type: 'section' }>;
};

export type CompositionSummary = {
  id: string;
  title: string;
  updated_at: string;
};
