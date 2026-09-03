import type { Block } from '@/schemas';

export function htmlToPlainText(html: string): string {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, ' ');
  const stripped = withBreaks.replace(/<[^>]+>/g, ' ');
  return stripped
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function push(parts: string[], value: unknown): void {
  if (typeof value === 'string' && value.trim()) parts.push(value);
}

function extractBlock(block: Block, parts: string[]): void {
  const c = block.content as Record<string, unknown>;
  switch (block.block_type) {
    case 'rich_text':
    case 'html':
      push(parts, htmlToPlainText(String(c.html ?? '')));
      break;
    case 'heading':
      push(parts, c.text);
      break;
    case 'callout':
      push(parts, c.title);
      push(parts, c.body);
      break;
    case 'quote':
      push(parts, c.quote);
      push(parts, c.attribution);
      push(parts, c.source);
      push(parts, c.reference);
      break;
    case 'definition':
      push(parts, c.term);
      push(parts, c.definition);
      break;
    case 'code':
      push(parts, c.code);
      break;
    case 'equation':
      push(parts, c.latex);
      push(parts, c.caption);
      break;
    case 'cloze':
      push(parts, c.title);
      push(parts, c.text);
      break;
    case 'image':
    case 'video':
    case 'audio':
    case 'attachment':
    case 'embed':
    case 'diagram':
      push(parts, c.alt_text ?? c.image_alt);
      push(parts, c.title);
      push(parts, c.caption);
      break;
    case 'html_app':
      push(parts, c.title);
      push(parts, htmlToPlainText(String(c.html ?? '')));
      break;
    case 'question_set':
    case 'flashcards':
    case 'self_check':
    case 'timeline':
    case 'accordion':
    case 'table':
    case 'chart':
    case 'mind_map':
    case 'concept_map':
    case 'gallery':
    case 'collection':
    case 'outcomes':
      walkStrings(c, parts);
      break;
    case 'columns': {
      const cols = (c.columns as Array<{ blocks?: Block[] }> | undefined) ?? [];
      for (const col of cols) extractBlocks(col.blocks ?? [], parts);
      break;
    }
    case 'tabs': {
      const panels = (c.tabs as Array<{ label?: string; blocks?: Block[] }> | undefined) ?? [];
      for (const panel of panels) {
        push(parts, panel.label);
        extractBlocks(panel.blocks ?? [], parts);
      }
      break;
    }
    case 'section': {
      push(parts, c.title);
      extractBlocks((c.blocks as Block[] | undefined) ?? [], parts);
      break;
    }
    case 'spacer':
    case 'divider':
      break;
    default:
      walkStrings(c, parts);
  }
}

function walkStrings(value: unknown, parts: string[], depth = 0): void {
  if (depth > 8) return;
  if (typeof value === 'string') {
    push(parts, value.includes('<') ? htmlToPlainText(value) : value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walkStrings(item, parts, depth + 1);
    return;
  }
  if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) {
      walkStrings(v, parts, depth + 1);
    }
  }
}

function extractBlocks(blocks: Block[], parts: string[]): void {
  for (const block of blocks) extractBlock(block, parts);
}

export function blocksToSearchText(blocks: Block[]): string {
  const parts: string[] = [];
  extractBlocks(blocks, parts);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export function snippetAround(haystack: string, query: string, radius = 48): string {
  const lower = haystack.toLowerCase();
  const q = query.trim().toLowerCase();
  const idx = lower.indexOf(q);
  if (idx < 0) return haystack.slice(0, radius * 2).trim();
  const start = Math.max(0, idx - radius);
  const end = Math.min(haystack.length, idx + q.length + radius);
  const slice = haystack.slice(start, end).trim();
  return `${start > 0 ? '…' : ''}${slice}${end < haystack.length ? '…' : ''}`;
}
