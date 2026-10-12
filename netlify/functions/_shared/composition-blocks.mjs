import { compositionKey } from './teaching-blobs.mjs';
import { isDeletedRecord } from './record-liveness.mjs';

export function isIndependentSectionRoot(root) {
  return Boolean(
    root && typeof root === 'object' && !Array.isArray(root) &&
    root.type === 'block' && root.block_type === 'section' &&
    typeof root.id === 'string' && root.id &&
    root.content && typeof root.content === 'object' &&
    typeof root.content.title === 'string' && Array.isArray(root.content.blocks) &&
    !root.content.link
  );
}

function clonePublishedBlocks(blocks, nextId) {
  return blocks.map((block) => {
    const copy = structuredClone(block);
    copy.id = nextId();
    if (copy.block_type === 'section') {
      copy.content.blocks = clonePublishedBlocks(copy.content.blocks ?? [], nextId);
    } else if (copy.block_type === 'columns') {
      for (const column of copy.content.columns ?? []) {
        column.blocks = clonePublishedBlocks(column.blocks ?? [], nextId);
      }
    } else if (copy.block_type === 'tabs') {
      for (const tab of copy.content.tabs ?? []) {
        tab.blocks = clonePublishedBlocks(tab.blocks ?? [], nextId);
      }
    }
    return copy;
  });
}

/** Draft links remain live; students receive an independent, frozen snapshot. */
export async function materialiseLinkedCompositions(blocks, store, lessonId) {
  const usedIds = new Set();
  function collectIds(rows) {
    for (const block of rows) {
      usedIds.add(block.id);
      if (block.block_type === 'section') collectIds(block.content?.blocks ?? []);
      if (block.block_type === 'columns') {
        for (const col of block.content?.columns ?? []) collectIds(col.blocks ?? []);
      }
      if (block.block_type === 'tabs') {
        for (const tab of block.content?.tabs ?? []) collectIds(tab.blocks ?? []);
      }
    }
  }
  collectIds(blocks);
  let n = 0;
  const nextId = () => {
    let id;
    do { id = `block_pub_${lessonId}_${++n}`; } while (usedIds.has(id));
    usedIds.add(id);
    return id;
  };
  const sources = new Map();
  const result = [];
  for (const block of blocks) {
    const link = block.block_type === 'section' ? block.content?.link : null;
    if (link?.mode !== 'linked') {
      result.push(block);
      continue;
    }
    const id = link.source_composition_id;
    if (!sources.has(id)) {
      sources.set(id, await store.get(compositionKey(id), { type: 'json', consistency: 'strong' }));
    }
    const source = sources.get(id);
    if (!source || isDeletedRecord(source) || source.status !== 'active' ||
        !isIndependentSectionRoot(source.root)) {
      throw Object.assign(new Error(`Linked composition ${id} is missing or not active`), { status: 400 });
    }
    result.push({
      ...block,
      visibility: source.root.visibility === 'teacher_only' ? 'teacher_only' : block.visibility,
      content: {
        ...structuredClone(source.root.content),
        blocks: clonePublishedBlocks(source.root.content.blocks, nextId)
      }
    });
  }
  return result;
}
