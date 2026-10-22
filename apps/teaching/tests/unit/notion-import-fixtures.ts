// apps/teaching/tests/unit/notion-import-fixtures.ts
import type { NotionNode, NotionRichText } from '@/notion-import/types';
import { createBlockState, type BlockState } from '@/notion-import/map-blocks';

let seq = 0;
export const rt = (plain_text: string, annotations = {}): NotionRichText[] =>
  [{ type: 'text', plain_text, href: null, annotations }];

export function node(type: string, data: Record<string, any> = {}, children: NotionNode[] = []): NotionNode {
  seq += 1;
  return { id: `00000000-0000-0000-0000-${String(seq).padStart(12, '0')}`, type, data, children };
}

export const p = (text: string) => node('paragraph', { rich_text: rt(text) });
export const bullet = (text: string, children: NotionNode[] = []) =>
  node('bulleted_list_item', { rich_text: rt(text) }, children);
export const numbered = (text: string) => node('numbered_list_item', { rich_text: rt(text) });
export const todo = (text: string, checked = false) => node('to_do', { rich_text: rt(text), checked });
export const toggle = (text: string, children: NotionNode[]) => node('toggle', { rich_text: rt(text) }, children);
export const notionFile = (url: string, name = 'file.bin') => ({ type: 'file', file: { url }, name });
export const external = (url: string) => ({ type: 'external', external: { url } });

export function state(overrides: Partial<BlockState> = {}): BlockState {
  return { ...createBlockState('page-1', '2026-10-18T00:00:00.000Z', []), ...overrides };
}
