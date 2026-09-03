const SEARCH_FIELDS = ['title', 'display_title', 'display_name', 'code', 'slug', 'id'];

export function normalizeSearchQuery(query) {
  return typeof query === 'string' ? query.trim().toLowerCase() : '';
}

export function searchTeachingRecords(query, records, type) {
  const q = normalizeSearchQuery(query);
  if (q.length < 2) return [];

  const hits = [];
  for (const item of records) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const id = typeof item.id === 'string' ? item.id : '';
    if (!id) continue;
    const haystack = SEARCH_FIELDS
      .map(field => item[field])
      .filter(value => typeof value === 'string' && value)
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(q)) continue;
    const title = typeof item.title === 'string' && item.title ? item.title : id;
    hits.push({
      type: type || (typeof item.type === 'string' ? item.type : 'record'),
      id,
      title,
      snippet: title,
      match: 'title'
    });
  }
  return hits;
}

export function htmlToPlainText(html) {
  if (typeof html !== 'string') return '';
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function push(parts, value) {
  if (typeof value === 'string' && value.trim()) parts.push(value);
}

function walkStrings(value, parts, depth = 0) {
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
    for (const next of Object.values(value)) walkStrings(next, parts, depth + 1);
  }
}

function extractBlock(block, parts) {
  const content = block?.content && typeof block.content === 'object' ? block.content : {};
  switch (block?.block_type) {
    case 'rich_text':
    case 'html':
      push(parts, htmlToPlainText(String(content.html ?? '')));
      break;
    case 'heading':
      push(parts, content.text);
      break;
    case 'callout':
      push(parts, content.title);
      push(parts, content.body);
      break;
    case 'section':
      push(parts, content.title);
      extractBlocks(content.blocks ?? [], parts);
      break;
    case 'columns':
      for (const col of content.columns ?? []) extractBlocks(col.blocks ?? [], parts);
      break;
    case 'tabs':
      for (const panel of content.tabs ?? []) {
        push(parts, panel.label);
        extractBlocks(panel.blocks ?? [], parts);
      }
      break;
    case 'spacer':
    case 'divider':
      break;
    default:
      walkStrings(content, parts);
  }
}

function extractBlocks(blocks, parts) {
  if (!Array.isArray(blocks)) return;
  for (const block of blocks) extractBlock(block, parts);
}

export function blocksToSearchText(blocks) {
  const parts = [];
  extractBlocks(blocks, parts);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export function snippetAround(haystack, query, radius = 48) {
  const lower = haystack.toLowerCase();
  const q = query.trim().toLowerCase();
  const idx = lower.indexOf(q);
  if (idx < 0) return haystack.slice(0, radius * 2).trim();
  const start = Math.max(0, idx - radius);
  const end = Math.min(haystack.length, idx + q.length + radius);
  const slice = haystack.slice(start, end).trim();
  return `${start > 0 ? '…' : ''}${slice}${end < haystack.length ? '…' : ''}`;
}

export function runContentSearch(query, corpus) {
  const q = normalizeSearchQuery(query);
  if (q.length < 2) return [];
  const hits = [];
  const scan = (type, id, blocks, title) => {
    const text = blocksToSearchText(blocks);
    if (!text.toLowerCase().includes(q)) return;
    hits.push({
      type,
      id,
      title: title || id,
      snippet: snippetAround(text, q),
      match: 'body'
    });
  };
  for (const lesson of corpus.lessons ?? []) {
    scan('lesson', lesson.id, lesson.blocks ?? [], lesson.title);
  }
  for (const unit of corpus.units ?? []) {
    scan('unit', unit.id, unit.blocks ?? [], unit.title);
  }
  for (const composition of corpus.compositions ?? []) {
    const root = composition.root ? [composition.root] : composition.blocks ?? [];
    scan('composition', composition.id, root, composition.title);
  }
  return hits;
}

export function mergeSearchHits(titleHits, bodyHits) {
  const seen = new Set(titleHits.map(hit => `${hit.type}:${hit.id}`));
  const merged = [...titleHits];
  for (const hit of bodyHits) {
    const key = `${hit.type}:${hit.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(hit);
  }
  return merged;
}
