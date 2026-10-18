// apps/teaching/src/notion-import/map-blocks.ts
import type { Block } from '../schemas/block';
import { parseVideoInput } from '../blocks/video-url';
import { parseEmbedInput } from '../blocks/embed-url';
import { BlockIds, makeBlock } from './block-factory';
import { escapeHtml, plainText, richTextHtml } from './rich-text';
import {
  MEDIA_PLACEHOLDER_PREFIX,
  type HtmlAppCandidate,
  type ImportWarning,
  type MediaPurpose,
  type MediaRef,
  type NotionNode,
  type WarningRule
} from './types';

/** Where blocks are being placed; decides which layout blocks are allowed. */
export type Scope = 'top' | 'section' | 'tabs' | 'column';

export interface BlockState {
  page_id: string;
  now: string;
  ids: BlockIds;
  warnings: ImportWarning[];
  media: MediaRef[];
  html_apps: HtmlAppCandidate[];
  html_as_code: Set<string>;
}

export function createBlockState(pageId: string, now: string, htmlAsCode: string[]): BlockState {
  return {
    page_id: pageId,
    now,
    ids: new BlockIds(),
    warnings: [],
    media: [],
    html_apps: [],
    html_as_code: new Set(htmlAsCode)
  };
}

export function warn(st: BlockState, node: NotionNode | null, rule: WarningRule, message: string): void {
  st.warnings.push({ page_id: st.page_id, notion_block_id: node?.id ?? null, rule, message });
}

const LIST_TYPES = new Set(['bulleted_list_item', 'numbered_list_item', 'to_do']);
export const TEXT_RUN_TYPES = new Set(['paragraph', ...LIST_TYPES]);

// ---------- text runs ----------

function listItemHtml(item: NotionNode, st: BlockState): string {
  const prefix = item.type === 'to_do' ? (item.data.checked ? '☑ ' : '☐ ') : '';
  let inner = prefix + richTextHtml(item.data.rich_text);
  const nestedLists = item.children.filter((c) => LIST_TYPES.has(c.type));
  const other = item.children.filter((c) => !LIST_TYPES.has(c.type));
  if (nestedLists.length) inner += listsHtml(nestedLists, st);
  if (other.length) {
    inner += other.map((c) => `<br>${escapeHtml(deepPlainText(c))}`).join('');
    warn(st, item, 'flattened', 'Content nested under a list item was flattened to text.');
  }
  return `<li>${inner}</li>`;
}

function listsHtml(items: NotionNode[], st: BlockState): string {
  let html = '';
  let i = 0;
  while (i < items.length) {
    const tag = items[i].type === 'numbered_list_item' ? 'ol' : 'ul';
    let run = '';
    while (i < items.length && (items[i].type === 'numbered_list_item' ? 'ol' : 'ul') === tag) {
      run += listItemHtml(items[i], st);
      i += 1;
    }
    html += `<${tag}>${run}</${tag}>`;
  }
  return html;
}

function textRunHtml(run: NotionNode[], st: BlockState): string {
  let html = '';
  let i = 0;
  while (i < run.length) {
    const n = run[i];
    if (n.type === 'paragraph') {
      const text = richTextHtml(n.data.rich_text);
      if (text) html += `<p>${text}</p>`;
      if (n.children.length) html += textRunHtml(n.children.filter((c) => TEXT_RUN_TYPES.has(c.type)), st);
      i += 1;
      continue;
    }
    const lists: NotionNode[] = [];
    while (i < run.length && LIST_TYPES.has(run[i].type)) lists.push(run[i++]);
    html += listsHtml(lists, st);
  }
  return html;
}

export function deepPlainText(n: NotionNode): string {
  const own = plainText(n.data?.rich_text ?? n.data?.caption);
  const kids = n.children.map(deepPlainText).filter(Boolean);
  return [own, ...kids].filter(Boolean).join('\n');
}

function plainParagraphsHtml(text: string): string {
  return text
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('');
}

// ---------- media ----------

function fileUrl(data: Record<string, any>): { url: string; hosted: boolean } | null {
  if (data.type === 'file' && data.file?.url) return { url: data.file.url, hosted: true };
  if (data.type === 'file_upload' && data.file_upload?.url) return { url: data.file_upload.url, hosted: true };
  if (data.type === 'external' && data.external?.url) return { url: data.external.url, hosted: false };
  return null;
}

function fileName(data: Record<string, any>, url: string): string {
  if (typeof data.name === 'string' && data.name) return data.name;
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop();
    return last ? decodeURIComponent(last) : 'file';
  } catch {
    return 'file';
  }
}

/** Returns the URL to put in the block: a placeholder for Notion-hosted files. */
export function mediaUrl(st: BlockState, ref: string, node: NotionNode | null, url: string, hosted: boolean, name: string, purpose: MediaPurpose): string {
  if (!hosted) return url;
  st.media.push({ ref, page_id: st.page_id, notion_block_id: node?.id ?? null, url, name, purpose });
  return `${MEDIA_PLACEHOLDER_PREFIX}${ref}`;
}

const FULL_HTML = /<(html|body|script)\b/i;

// ---------- leaves ----------

function mapLeaf(n: NotionNode, st: BlockState): Block[] | null {
  const id = () => st.ids.from(n.id);
  const now = st.now;
  const d = n.data ?? {};
  switch (n.type) {
    case 'heading_1':
    case 'heading_2':
    case 'heading_3': {
      const variant = n.type === 'heading_1' ? 'page' : n.type === 'heading_2' ? 'section' : 'subsection';
      return [makeBlock('heading', id(), { text: plainText(d.rich_text) }, now, variant)];
    }
    case 'quote': {
      const extra = n.children.map(deepPlainText).filter(Boolean);
      return [makeBlock('quote', id(), { quote: [plainText(d.rich_text), ...extra].join('\n') }, now)];
    }
    case 'divider':
      return [makeBlock('divider', id(), { tools: true, timer_stack: [] }, now)];
    case 'equation':
      return [makeBlock('equation', id(), { latex: String(d.expression ?? '') }, now)];
    case 'code': {
      const code = plainText(d.rich_text);
      const language = typeof d.language === 'string' ? d.language : undefined;
      if (language === 'html' && FULL_HTML.test(code) && !st.html_as_code.has(n.id)) {
        st.html_apps.push({ page_id: st.page_id, notion_block_id: n.id, preview: code.slice(0, 120) });
        warn(st, n, 'html_app', 'HTML code block will run as an interactive.');
        return [makeBlock('html_app', id(), { html: code }, now)];
      }
      if (language === 'mermaid') warn(st, n, 'mermaid', 'Mermaid diagram kept as code.');
      return [makeBlock('code', id(), { code, language }, now)];
    }
    case 'table': {
      const rows = n.children
        .filter((r) => r.type === 'table_row')
        .map((r) => (r.data.cells ?? []).map((cell: any) => plainText(cell)));
      const headers = d.has_column_header && rows.length ? rows[0] : [];
      return [makeBlock('table', id(), { headers, rows: d.has_column_header ? rows.slice(1) : rows }, now)];
    }
    case 'image': {
      const f = fileUrl(d);
      if (!f) return null;
      const caption = plainText(d.caption);
      if (!caption) warn(st, n, 'alt_text', 'Image has no caption, so its alt text is empty.');
      const url = mediaUrl(st, n.id, n, f.url, f.hosted, fileName(d, f.url), 'image');
      return [makeBlock('image', id(), { url, alt_text: caption, caption: caption || undefined }, now)];
    }
    case 'video': {
      const f = fileUrl(d);
      if (!f) return null;
      if (!f.hosted) {
        const parsed = parseVideoInput(f.url);
        if (parsed && parsed.provider !== 'file') {
          return [makeBlock('video', id(), { ...parsed, url: f.url, caption: plainText(d.caption) || undefined }, now)];
        }
        return [makeBlock('embed', id(), { url: f.url, provider: 'generic' }, now)];
      }
      const url = mediaUrl(st, n.id, n, f.url, true, fileName(d, f.url), 'video');
      return [makeBlock('video', id(), { provider: 'file', external_id: url, url }, now)];
    }
    case 'file': {
      const f = fileUrl(d);
      if (!f) return null;
      const name = fileName(d, f.url);
      if (/\.html?$/i.test(name)) {
        const html = mediaUrl(st, n.id, n, f.url, f.hosted, name, 'html');
        warn(st, n, 'html_app', `${name} will run as an interactive.`);
        return [makeBlock('html_app', id(), { title: name, html }, now)];
      }
      const url = mediaUrl(st, n.id, n, f.url, f.hosted, name, 'attachment');
      return [makeBlock('attachment', id(), { url, title: plainText(d.caption) || name, filename: name }, now)];
    }
    case 'pdf': {
      const f = fileUrl(d);
      if (!f) return null;
      const url = mediaUrl(st, n.id, n, f.url, f.hosted, fileName(d, f.url), 'pdf');
      return [makeBlock('embed', id(), { url, provider: 'pdf', title: plainText(d.caption) || undefined }, now)];
    }
    case 'audio': {
      const f = fileUrl(d);
      if (!f) return null;
      const url = mediaUrl(st, n.id, n, f.url, f.hosted, fileName(d, f.url), 'audio');
      return [makeBlock('audio', id(), { url, title: plainText(d.caption) || undefined }, now)];
    }
    case 'embed':
    case 'bookmark':
    case 'link_preview': {
      const url = String(d.url ?? '');
      if (!url) return null;
      const parsed = n.type === 'embed' ? parseEmbedInput(url) : null;
      return [makeBlock('embed', id(), {
        url,
        provider: parsed?.provider ?? 'generic',
        embed_url: parsed?.embed_url,
        title: plainText(d.caption) || undefined
      }, now)];
    }
    case 'synced_block': {
      const html = plainParagraphsHtml(n.children.map(deepPlainText).join('\n'));
      return html ? [makeBlock('rich_text', id(), { html }, now)] : [];
    }
    case 'child_database':
    case 'link_to_page':
    case 'table_of_contents':
    case 'breadcrumb':
      warn(st, n, 'skipped', `Notion ${n.type.replace(/_/g, ' ')} skipped.`);
      return [];
    default:
      return null;
  }
}

function unsupportedNode(n: NotionNode, st: BlockState): Block[] {
  warn(st, n, 'unsupported', `Notion ${n.type.replace(/_/g, ' ')} block is not supported; kept its text.`);
  const html = plainParagraphsHtml(deepPlainText(n));
  return html ? [makeBlock('rich_text', st.ids.from(n.id), { html }, st.now)] : [];
}

// ---------- entry ----------

export function mapBlocks(nodes: NotionNode[], scope: Scope, st: BlockState): Block[] {
  const out: Block[] = [];
  let i = 0;
  while (i < nodes.length) {
    const n = nodes[i];
    if (TEXT_RUN_TYPES.has(n.type)) {
      const run: NotionNode[] = [];
      while (i < nodes.length && TEXT_RUN_TYPES.has(nodes[i].type)) run.push(nodes[i++]);
      const html = textRunHtml(run, st);
      if (html) out.push(makeBlock('rich_text', st.ids.from(run[0].id), { html }, st.now));
      continue;
    }
    const layout = mapLayout(nodes, i, scope, st);
    if (layout) {
      out.push(...layout.blocks);
      i = layout.next;
      continue;
    }
    out.push(...(mapLeaf(n, st) ?? unsupportedNode(n, st)));
    i += 1;
  }
  return out;
}

/** Layout blocks; filled in by Task 6. Returns null when `nodes[i]` is not a layout block. */
function mapLayout(_nodes: NotionNode[], _i: number, _scope: Scope, _st: BlockState): { blocks: Block[]; next: number } | null {
  return null;
}
