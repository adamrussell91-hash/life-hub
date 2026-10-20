import { findAlchemyBlock, protectedContentUnchanged } from './revisions.js';

/**
 * Ann's edits are exact-match string patches on one text field of one block:
 * {blockId, path, oldStr, newStr}. The server checks them when Ann proposes
 * them and the editor checks them again against the live lesson on accept.
 */
const PROTECTED_KEY = /^(id|.*_id|ids|block_type|visibility|url|.*_url|src|href|provider|kind|type|width|width_pct|width_percent|correct|answer)$/;
const CHILD_LISTS = new Set(['blocks', 'columns', 'tabs']);

export class PatchError extends Error {}

/** Every string Ann may edit in a block, as [path, value]. Nested blocks are listed as their own blocks. */
export function editableFields(block) {
  const fields = [];
  const walk = (value, path, key) => {
    if (typeof value === 'string') { if (!PROTECTED_KEY.test(key) && !/^https?:/i.test(value) && value.trim()) fields.push([path, value]); return; }
    if (Array.isArray(value)) { value.forEach((item, i) => walk(item, path + '.' + i, key)); return; }
    if (value && typeof value === 'object') {
      if (value.block_type && path !== 'content') return;
      for (const [k, v] of Object.entries(value)) {
        if (PROTECTED_KEY.test(k)) continue;
        if (CHILD_LISTS.has(k) && containsBlocks(v)) continue;
        walk(v, path + '.' + k, k);
      }
    }
  };
  walk(block.content, 'content', 'content');
  return fields;
}

function containsBlocks(value) {
  if (!Array.isArray(value)) return false;
  return value.some(item => item?.block_type || (Array.isArray(item?.blocks) && item.blocks.some(b => b?.block_type)));
}

/** The children of a layout block (sections, columns, tabs), in reading order. */
export function childBlocks(block) {
  const c = block?.content ?? {};
  if (block?.block_type === 'section') return c.blocks ?? [];
  if (block?.block_type === 'columns') return (c.columns ?? []).flatMap(col => col.blocks ?? []);
  if (block?.block_type === 'tabs') return (c.tabs ?? []).flatMap(tab => tab.blocks ?? []);
  return [];
}

function count(haystack, needle) {
  let n = 0, at = haystack.indexOf(needle);
  while (at !== -1) { n++; at = haystack.indexOf(needle, at + 1); }
  return n;
}

/**
 * The block after one patch, or a PatchError saying what to fix.
 * `validateBlock(block)` returns the parsed block or null (the hub's BlockSchema).
 */
export function patchBlock(blocks, patch, validateBlock) {
  const { blockId, path, oldStr, newStr } = patch ?? {};
  if (typeof blockId !== 'string' || typeof path !== 'string' || typeof oldStr !== 'string' || typeof newStr !== 'string') throw new PatchError('blockId, path, oldStr and newStr are all required strings.');
  if (!oldStr) throw new PatchError('oldStr is empty. Quote the exact words to replace.');
  if (oldStr === newStr) throw new PatchError('newStr is the same as oldStr.');
  const block = findAlchemyBlock(blocks, blockId);
  if (!block) throw new PatchError(`No block with id ${blockId} in this lesson.`);
  const allowed = new Map(editableFields(block));
  if (!allowed.has(path)) throw new PatchError(`${path} is not an editable text field of block ${blockId}. Use a path shown in the lesson text.`);
  const current = allowed.get(path);
  const matches = count(current, oldStr);
  if (matches === 0) throw new PatchError(`oldStr does not appear in ${path}. Copy the words exactly as the lesson shows them.`);
  if (matches > 1) throw new PatchError(`oldStr appears ${matches} times in ${path}. Include more surrounding words so it matches once.`);
  const next = structuredClone(block);
  const keys = path.split('.');
  let parent = next;
  for (const key of keys.slice(0, -1)) parent = parent[key];
  parent[keys.at(-1)] = current.replace(oldStr, () => newStr);
  const parsed = validateBlock(next);
  if (!parsed) throw new PatchError('The edited block would no longer be valid. Keep the same structure and markup.');
  if (parsed.id !== block.id || parsed.block_type !== block.block_type || !protectedContentUnchanged(block.content, parsed.content)) throw new PatchError('The edit changes protected parts of the block.');
  return parsed;
}

/** A copy of the lesson with one patch applied; throws PatchError when it no longer fits. */
export function applyPatchToEntity(entity, patch, validateBlock) {
  const patched = patchBlock(entity.blocks ?? [], patch, validateBlock);
  const next = structuredClone(entity);
  findAlchemyBlock(next.blocks ?? [], patch.blockId).content = patched.content;
  return next;
}

/** Text compared for a quote check: case, spacing, quote marks and dashes ignored. */
export function normaliseForQuote(text) {
  return String(text ?? '').normalize('NFKC').toLowerCase()
    .replace(/[‘’‚′`]/g, "'").replace(/[“”„″]/g, '"')
    .replace(/[‐-―]/g, '-').replace(/[*_#>]/g, '').replace(/\s+/g, ' ').trim();
}

export function quoteAppears(noteText, quote) {
  const q = normaliseForQuote(quote).replace(/^["'.…]+|["'.…]+$/g, '').trim();
  return q.length >= 10 && normaliseForQuote(noteText).includes(q);
}
