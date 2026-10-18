// apps/teaching/src/notion-import/map-blocks.ts
import type { Block } from '../schemas/block';
import { parseVideoInput } from '../blocks/video-url';
import { parseEmbedInput } from '../blocks/embed-url';
import { BlockIds, makeBlock } from './block-factory';
import { columnPreset, columnWidths } from './columns';
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

/** Accumulates a text run as HTML parts, with moved-out blocks between them. */
class Run {
  parts: Array<{ html: string } | { nodes: NotionNode[] }> = [];
  html = '';
  hoist(nodes: NotionNode[]): void {
    if (this.html) this.parts.push({ html: this.html });
    this.html = '';
    this.parts.push({ nodes });
  }
  finish(): Array<{ html: string } | { nodes: NotionNode[] }> {
    if (this.html) this.parts.push({ html: this.html });
    this.html = '';
    return this.parts;
  }
}

/** `moved` collects blocks nested under the item (or its nested lists) that cannot stay inside it. */
function listItemHtml(item: NotionNode, st: BlockState, moved: NotionNode[]): string {
  const prefix = item.type === 'to_do' ? (item.data.checked ? '☑ ' : '☐ ') : '';
  let inner = prefix + richTextHtml(item.data.rich_text);
  const nestedLists = item.children.filter((c) => LIST_TYPES.has(c.type));
  const rest = item.children.filter((c) => !LIST_TYPES.has(c.type));
  const textKids = rest.filter(isTextOnly);
  const blockKids = rest.filter((c) => !isTextOnly(c));
  if (nestedLists.length) inner += listsHtml(nestedLists, st, moved);
  if (textKids.length) {
    inner += textKids.map((c) => `<br>${escapeHtml(deepPlainText(c))}`).join('');
    warn(st, item, 'flattened', 'Content nested under a list item was flattened to text.');
  }
  if (blockKids.length) {
    warn(st, item, 'flattened', 'Blocks nested under a list item were moved after it.');
    moved.push(...blockKids);
  }
  return `<li>${inner}</li>`;
}

const listTag = (n: NotionNode) => (n.type === 'numbered_list_item' ? 'ol' : 'ul');

/** Nested lists: blocks that cannot stay are collected in `moved` for the top-level list to place. */
function listsHtml(items: NotionNode[], st: BlockState, moved: NotionNode[]): string {
  let html = '';
  let i = 0;
  while (i < items.length) {
    const tag = listTag(items[i]);
    let run = '';
    while (i < items.length && listTag(items[i]) === tag) {
      run += listItemHtml(items[i], st, moved);
      i += 1;
    }
    html += `<${tag}>${run}</${tag}>`;
  }
  return html;
}

/** Top-level lists: closes the list after an item with moved blocks, emits them, then reopens. */
function listsInto(items: NotionNode[], st: BlockState, r: Run): void {
  let i = 0;
  while (i < items.length) {
    const tag = listTag(items[i]);
    let open = false;
    const runStart = i;
    while (i < items.length && listTag(items[i]) === tag) {
      const moved: NotionNode[] = [];
      const li = listItemHtml(items[i], st, moved);
      if (!open) {
        const n = i - runStart + 1;
        r.html += tag === 'ol' && n > 1 ? `<ol start="${n}">` : `<${tag}>`;
        open = true;
      }
      r.html += li;
      i += 1;
      if (moved.length) {
        r.html += `</${tag}>`;
        open = false;
        r.hoist(moved);
      }
    }
    if (open) r.html += `</${tag}>`;
  }
}

function textRunInto(run: NotionNode[], st: BlockState, r: Run): void {
  let i = 0;
  while (i < run.length) {
    const n = run[i];
    if (n.type === 'paragraph') {
      const text = richTextHtml(n.data.rich_text);
      if (text) r.html += `<p>${text}</p>`;
      let buffer: NotionNode[] = [];
      let warned = false;
      let k = 0;
      while (k < n.children.length) {
        const c = n.children[k];
        if (TEXT_RUN_TYPES.has(c.type)) {
          buffer.push(c);
          k += 1;
          continue;
        }
        if (buffer.length) textRunInto(buffer, st, r);
        buffer = [];
        const blocks: NotionNode[] = [];
        while (k < n.children.length && !TEXT_RUN_TYPES.has(n.children[k].type)) blocks.push(n.children[k++]);
        if (!warned) {
          warn(st, n, 'flattened', 'Blocks nested under a paragraph were moved after it.');
          warned = true;
        }
        r.hoist(blocks);
      }
      if (buffer.length) textRunInto(buffer, st, r);
      i += 1;
      continue;
    }
    const lists: NotionNode[] = [];
    while (i < run.length && LIST_TYPES.has(run[i].type)) lists.push(run[i++]);
    listsInto(lists, st, r);
  }
}

export function deepPlainText(n: NotionNode): string {
  const own = plainText(n.data?.rich_text ?? n.data?.caption);
  const kids = n.children.map(deepPlainText).filter(Boolean);
  return [own, ...kids].filter(Boolean).join('\n');
}

const typeLabel = (n: NotionNode) => (n.type === 'pdf' ? 'PDF' : n.type.replace(/_/g, ' '));

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

function warnNoFile(n: NotionNode, st: BlockState): void {
  const label = typeLabel(n);
  warn(st, n, 'skipped', `${label.charAt(0).toUpperCase()}${label.slice(1)} has no file; skipped.`);
}

/** Resolves a media block's file, or records a skip. Returns the placeholder-or-URL and file name. */
function mediaFile(n: NotionNode, st: BlockState, purpose: MediaPurpose): { url: string; name: string; hosted: boolean } | null {
  const f = fileUrl(n.data ?? {});
  if (!f) {
    warnNoFile(n, st);
    return null;
  }
  const name = fileName(n.data, f.url);
  return { url: mediaUrl(st, n.id, n, f.url, f.hosted, name, purpose), name, hosted: f.hosted };
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
      const f = mediaFile(n, st, 'image');
      if (!f) return [];
      const caption = plainText(d.caption);
      if (!caption) warn(st, n, 'alt_text', 'Image has no caption, so its alt text is empty.');
      return [makeBlock('image', id(), { url: f.url, alt_text: caption, caption: caption || undefined }, now)];
    }
    case 'video': {
      const raw = fileUrl(d);
      if (!raw) {
        warnNoFile(n, st);
        return [];
      }
      const caption = plainText(d.caption) || undefined;
      if (!raw.hosted) {
        const parsed = parseVideoInput(raw.url);
        if (parsed) return [makeBlock('video', id(), { ...parsed, url: raw.url, caption }, now)];
        warn(st, n, 'flattened', 'Video is not YouTube, Vimeo or a direct file; kept as a link embed.');
        return [makeBlock('embed', id(), { url: raw.url, provider: 'generic' }, now)];
      }
      const f = mediaFile(n, st, 'video')!;
      return [makeBlock('video', id(), { provider: 'file', external_id: f.url, url: f.url, caption }, now)];
    }
    case 'file': {
      const raw = fileUrl(d);
      const name = raw ? fileName(d, raw.url) : '';
      const isHtml = /\.html?$/i.test(name);
      if (raw && !raw.hosted && isHtml) {
        warn(st, n, 'flattened', 'External HTML file kept as a link embed; only uploaded files can run as an interactive.');
        return [makeBlock('embed', id(), { url: raw.url, provider: 'generic', title: plainText(d.caption) || undefined }, now)];
      }
      const f = mediaFile(n, st, isHtml ? 'html' : 'attachment');
      if (!f) return [];
      if (isHtml) {
        warn(st, n, 'html_app', `${f.name} will run as an interactive.`);
        return [makeBlock('html_app', id(), { title: f.name, html: f.url }, now)];
      }
      return [makeBlock('attachment', id(), { url: f.url, title: plainText(d.caption) || f.name, filename: f.name }, now)];
    }
    case 'pdf': {
      const f = mediaFile(n, st, 'pdf');
      return f ? [makeBlock('embed', id(), { url: f.url, provider: 'pdf', title: plainText(d.caption) || undefined }, now)] : [];
    }
    case 'audio': {
      const f = mediaFile(n, st, 'audio');
      return f ? [makeBlock('audio', id(), { url: f.url, title: plainText(d.caption) || undefined }, now)] : [];
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
    case 'child_database':
    case 'link_to_page':
    case 'table_of_contents':
    case 'breadcrumb':
      warn(st, n, 'skipped', `Notion ${typeLabel(n)} skipped.`);
      return [];
    default:
      return null;
  }
}

function unsupportedNode(n: NotionNode, st: BlockState): Block[] {
  warn(st, n, 'unsupported', `Notion ${typeLabel(n)} block is not supported; kept its text.`);
  const html = plainParagraphsHtml(deepPlainText(n));
  return html ? [makeBlock('rich_text', st.ids.from(n.id), { html }, st.now)] : [];
}

// ---------- entry ----------

function warnChildrenError(n: NotionNode, st: BlockState): void {
  if (!n.children_error) return;
  warn(st, n, 'skipped', `Notion would not return the contents of this ${typeLabel(n)} block (${n.children_error}); it was left out.`);
}

export function mapBlocks(nodes: NotionNode[], scope: Scope, st: BlockState): Block[] {
  const out: Block[] = [];
  let i = 0;
  while (i < nodes.length) {
    const n = nodes[i];
    if (TEXT_RUN_TYPES.has(n.type)) {
      const run: NotionNode[] = [];
      while (i < nodes.length && TEXT_RUN_TYPES.has(nodes[i].type)) run.push(nodes[i++]);
      for (const r of run) warnChildrenError(r, st);
      const r = new Run();
      textRunInto(run, st, r);
      for (const part of r.finish()) {
        if ('html' in part) out.push(makeBlock('rich_text', st.ids.from(run[0].id), { html: part.html }, st.now));
        else out.push(...mapBlocks(part.nodes, scope, st));
      }
      continue;
    }
    warnChildrenError(n, st);
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

const CALLOUT_BY_COLOUR: Record<string, string> = {
  red: 'warning',
  orange: 'warning',
  yellow: 'important',
  blue: 'information',
  green: 'remember',
  purple: 'extension',
  pink: 'extension'
};
const stripVs = (e: string) => e.replace(/\uFE0F/g, '');
const CALLOUT_BY_EMOJI_RAW: Record<string, string> = {
  '⚠️': 'warning', '❗': 'warning', 'ℹ️': 'information', '📋': 'information',
  '📅': 'information', '✅': 'remember', '🚀': 'extension'
};

const CALLOUT_BY_EMOJI: Record<string, string> = Object.fromEntries(
  Object.entries(CALLOUT_BY_EMOJI_RAW).map(([k, v]) => [stripVs(k), v])
);

export function calloutStyle(data: Record<string, any>): string {
  const colour = String(data.color ?? '').replace(/_background$/, '');
  if (CALLOUT_BY_COLOUR[colour]) return CALLOUT_BY_COLOUR[colour];
  const emoji = data.icon?.type === 'emoji' ? data.icon.emoji : '';
  return CALLOUT_BY_EMOJI[stripVs(String(emoji))] ?? 'information';
}

function isTextOnly(n: NotionNode): boolean {
  return TEXT_RUN_TYPES.has(n.type) && n.children.every(isTextOnly);
}

function isTextOnlyToggle(n: NotionNode): boolean {
  return n.type === 'toggle' && n.children.every(isTextOnly);
}

function isToggleHeading(n: NotionNode): boolean {
  return /^heading_[123]$/.test(n.type) && n.data?.is_toggleable === true;
}

function boldLine(text: string, st: BlockState, notionId: string): Block {
  return makeBlock('rich_text', st.ids.from(notionId), { html: `<p><strong>${escapeHtml(text)}</strong></p>` }, st.now);
}

/** A titled group of blocks, shaped to fit the scope it lands in. */
function titledGroup(title: string, children: NotionNode[], scope: Scope, st: BlockState, notionId: string, boldInColumn = true): Block[] {
  if (scope === 'top') {
    return [makeBlock('section', st.ids.from(notionId), {
      title,
      collapsed_in_editor: true,
      blocks: mapBlocks(children, 'section', st) as any
    }, st.now)];
  }
  const inner = mapBlocks(children, scope, st);
  if (scope === 'column' && boldInColumn) return [boldLine(title, st, notionId), ...inner];
  return [makeBlock('heading', st.ids.from(notionId), { text: title }, st.now, 'subsection'), ...inner];
}

function mapCallout(n: NotionNode, scope: Scope, st: BlockState): Block[] {
  const textKids = n.children.filter(isTextOnly);
  const otherKids = n.children.filter((c) => !isTextOnly(c));
  const body = [plainText(n.data.rich_text), ...textKids.map(deepPlainText)].filter(Boolean).join('\n');
  const callout = makeBlock('callout', st.ids.from(n.id), { style: calloutStyle(n.data) as any, body }, st.now);
  if (!otherKids.length) return [callout];
  warn(st, n, 'flattened', 'Images or other blocks inside a callout were placed after it.');
  return [callout, ...mapBlocks(otherKids, scope, st)];
}

function mapQuote(n: NotionNode, scope: Scope, st: BlockState): Block[] {
  const textKids = n.children.filter(isTextOnly);
  const otherKids = n.children.filter((c) => !isTextOnly(c));
  const quote = [plainText(n.data.rich_text), ...textKids.map(deepPlainText)].filter(Boolean).join('\n');
  const block = makeBlock('quote', st.ids.from(n.id), { quote }, st.now);
  if (!otherKids.length) return [block];
  warn(st, n, 'flattened', 'Images or other blocks inside a quote were placed after it.');
  return [block, ...mapBlocks(otherKids, scope, st)];
}

function mapSynced(n: NotionNode, scope: Scope, st: BlockState): Block[] {
  warn(st, n, 'flattened', 'Synced block copied as plain text; the sync link was dropped.');
  const textKids = n.children.filter(isTextOnly);
  const otherKids = n.children.filter((c) => !isTextOnly(c));
  const html = plainParagraphsHtml(textKids.map(deepPlainText).join('\n'));
  const out: Block[] = html ? [makeBlock('rich_text', st.ids.from(n.id), { html }, st.now)] : [];
  return [...out, ...mapBlocks(otherKids, scope, st)];
}

function mapColumns(n: NotionNode, scope: Scope, st: BlockState): Block[] {
  const cols = n.children.filter((c) => c.type === 'column');
  if (scope === 'column' || cols.length > 12) {
    warn(st, n, 'flattened', cols.length > 12 ? 'More than 12 columns; stacked.' : 'Columns inside a column were stacked.');
    return cols.flatMap((c) => mapBlocks(c.children, scope, st));
  }
  if (cols.length <= 1) return cols.flatMap((c) => mapBlocks(c.children, scope, st));
  const widths = columnWidths(cols.map((c) => c.data?.width_ratio));
  return [makeBlock('columns', st.ids.from(n.id), {
    preset: columnPreset(widths),
    columns: cols.map((c, k) => ({ width: widths[k], blocks: mapBlocks(c.children, 'column', st) as any }))
  }, st.now)];
}

function mapTabs(n: NotionNode, scope: Scope, st: BlockState): Block[] {
  const items = n.children.filter((c) => c.type === 'tab');
  const label = (t: NotionNode, k: number) => String(t.data?.label ?? '').trim() || `Tab ${k + 1}`;
  const fits = items.length >= 2 && items.length <= 8;
  if (fits && (scope === 'top' || scope === 'section')) {
    return [makeBlock('tabs', st.ids.from(n.id), {
      tabs: items.map((t, k) => ({ id: `${st.ids.from(t.id)}`, label: label(t, k), blocks: mapBlocks(t.children, 'tabs', st) as any }))
    }, st.now)];
  }
  if (scope !== 'top' || !fits) {
    warn(st, n, 'flattened', fits
      ? 'Tabs inside tabs or columns became headings.'
      : `${items.length} tab(s) cannot be a tabs block; each became its own group.`);
  }
  return items.flatMap((t, k) => titledGroup(label(t, k), t.children, scope, st, t.id, false));
}

function mapLayout(nodes: NotionNode[], i: number, scope: Scope, st: BlockState): { blocks: Block[]; next: number } | null {
  const n = nodes[i];
  if (isTextOnlyToggle(n)) {
    const run: NotionNode[] = [];
    let j = i;
    while (j < nodes.length && isTextOnlyToggle(nodes[j])) run.push(nodes[j++]);
    const items = run.map((t) => ({ title: plainText(t.data.rich_text), body: t.children.map(deepPlainText).join('\n') }));
    return { blocks: [makeBlock('accordion', st.ids.from(run[0].id), { items }, st.now)], next: j };
  }
  if (n.type === 'toggle' || isToggleHeading(n)) {
    if (scope !== 'top') warn(st, n, 'flattened', 'A toggle inside a layout was opened out.');
    return { blocks: titledGroup(plainText(n.data.rich_text), n.children, scope, st, n.id), next: i + 1 };
  }
  if (n.type === 'quote') return { blocks: mapQuote(n, scope, st), next: i + 1 };
  if (n.type === 'synced_block') return { blocks: mapSynced(n, scope, st), next: i + 1 };
  if (n.type === 'callout') return { blocks: mapCallout(n, scope, st), next: i + 1 };
  if (n.type === 'column_list') return { blocks: mapColumns(n, scope, st), next: i + 1 };
  if (n.type === 'tabs') return { blocks: mapTabs(n, scope, st), next: i + 1 };
  if (n.type === 'child_page') {
    warn(st, n, 'flattened', `Sub-page “${n.data.title ?? ''}” was placed inline.`);
    const heading = makeBlock('heading', st.ids.from(n.id), { text: String(n.data.title ?? 'Untitled') }, st.now, 'section');
    return { blocks: [heading, ...mapBlocks(n.children, scope, st)], next: i + 1 };
  }
  return null;
}
