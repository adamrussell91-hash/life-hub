export const WHITEBOARD_CONTENT_STORE = 'hub-whiteboards';
export const WHITEBOARD_PREFIX = 'documents/';

export function whiteboardKey(id) {
  return `${WHITEBOARD_PREFIX}${id}`;
}

export async function defaultGetWhiteboardStore() {
  const { getStore } = await import('@netlify/blobs');
  return getStore(WHITEBOARD_CONTENT_STORE);
}

export async function getWhiteboardJSON(store, key) {
  return store.get(key, { type: 'json' });
}

export async function setWhiteboardJSON(store, key, value) {
  if (typeof store.setJSON === 'function') return store.setJSON(key, value);
  if (typeof store.set === 'function') return store.set(key, JSON.stringify(value));
  throw new Error('Whiteboard content store cannot write.');
}

export function containsWhiteboardBlocks(blocks) {
  if (!Array.isArray(blocks)) return false;
  return blocks.some((block) => {
    if (!block || typeof block !== 'object') return false;
    if (block.block_type === 'whiteboard') return true;
    if (block.block_type === 'section') return containsWhiteboardBlocks(block.content?.blocks);
    if (block.block_type === 'columns') {
      return (block.content?.columns ?? []).some((column) =>
        containsWhiteboardBlocks(column?.blocks)
      );
    }
    if (block.block_type === 'tabs') {
      return (block.content?.tabs ?? []).some((tab) =>
        containsWhiteboardBlocks(tab?.blocks)
      );
    }
    return false;
  });
}

export async function materialiseWhiteboardSnapshots(blocks, store) {
  if (!Array.isArray(blocks)) return [];
  return Promise.all(blocks.map(async (block) => {
    if (!block || typeof block !== 'object') return block;

    if (block.block_type === 'whiteboard') {
      const content = block.content && typeof block.content === 'object'
        ? { ...block.content }
        : {};
      const ids = [content.document_id, content.seed_document_id]
        .filter((id, index, all) =>
          typeof id === 'string' && id && all.indexOf(id) === index
        );
      let record = null;
      for (const documentId of ids) {
        record = await getWhiteboardJSON(store, whiteboardKey(documentId));
        if (record?.snapshot) break;
      }
      delete content.seed_document_id;
      content.published_snapshot = record?.snapshot ?? null;
      return { ...block, content };
    }

    if (block.block_type === 'section') {
      return {
        ...block,
        content: {
          ...block.content,
          blocks: await materialiseWhiteboardSnapshots(block.content?.blocks, store)
        }
      };
    }

    if (block.block_type === 'columns') {
      return {
        ...block,
        content: {
          ...block.content,
          columns: await Promise.all((block.content?.columns ?? []).map(async (column) => ({
            ...column,
            blocks: await materialiseWhiteboardSnapshots(column?.blocks, store)
          })))
        }
      };
    }

    if (block.block_type === 'tabs') {
      return {
        ...block,
        content: {
          ...block.content,
          tabs: await Promise.all((block.content?.tabs ?? []).map(async (tab) => ({
            ...tab,
            blocks: await materialiseWhiteboardSnapshots(tab?.blocks, store)
          })))
        }
      };
    }

    return block;
  }));
}
