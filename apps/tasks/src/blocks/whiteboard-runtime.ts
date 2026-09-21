import { getApiBaseUrl } from '@/api/config';
import type { Block } from '@/schemas/block';
import {
  mountBlockSuiteWhiteboard,
  type BlockSuiteSnapshot,
  type MountedWhiteboard
} from '../../../../packages/whiteboard/blocksuite-adapter';
import {
  loadWhiteboardDocument,
  saveWhiteboardDocument
} from '../../../../packages/whiteboard/document-client';

export type WhiteboardBlock = Extract<Block, { block_type: 'whiteboard' }>;

type MountOptions = {
  readOnly: boolean;
  published?: boolean;
  onBlockChange?: (block: WhiteboardBlock) => void;
  onStatus?: (message: string, isError?: boolean) => void;
};

async function resolveDraftSnapshot(block: WhiteboardBlock): Promise<{
  snapshot: BlockSuiteSnapshot | null;
  seeded: boolean;
}> {
  const baseUrl = getApiBaseUrl();
  const own = await loadWhiteboardDocument(baseUrl, block.content.document_id);
  if (own) return { snapshot: own.snapshot, seeded: false };

  const seedId = block.content.seed_document_id;
  if (!seedId) return { snapshot: null, seeded: false };

  const seed = await loadWhiteboardDocument(baseUrl, seedId);
  if (!seed) return { snapshot: null, seeded: true };

  await saveWhiteboardDocument(baseUrl, block.content.document_id, seed.snapshot);
  return { snapshot: seed.snapshot, seeded: true };
}

function clearSeed(block: WhiteboardBlock, onBlockChange?: (block: WhiteboardBlock) => void): void {
  if (!block.content.seed_document_id || !onBlockChange) return;
  const { seed_document_id: _seed, ...content } = block.content;
  onBlockChange({ ...block, content });
}

function disposeWhenDetached(host: HTMLElement, handle: MountedWhiteboard): void {
  if (typeof MutationObserver === 'undefined') return;
  const observer = new MutationObserver(() => {
    if (host.isConnected) return;
    observer.disconnect();
    handle.dispose();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

export async function mountHubWhiteboard(
  host: HTMLElement,
  block: WhiteboardBlock,
  options: MountOptions
): Promise<void> {
  host.replaceChildren();
  const loading = document.createElement('p');
  loading.className = 'block-whiteboard__status';
  loading.textContent = 'Loading whiteboard…';
  host.append(loading);

  try {
    let snapshot: BlockSuiteSnapshot | null = null;
    let seeded = false;

    if (options.published) {
      const value = block.content.published_snapshot;
      snapshot =
        value && typeof value === 'object' && !Array.isArray(value)
          ? (value as BlockSuiteSnapshot)
          : null;
    } else {
      const resolved = await resolveDraftSnapshot(block);
      snapshot = resolved.snapshot;
      seeded = resolved.seeded;
    }

    if (options.published && !snapshot) {
      loading.textContent = 'This whiteboard has no published content.';
      return;
    }

    if (seeded) clearSeed(block, options.onBlockChange);

    let saveChain = Promise.resolve();
    const handle = await mountBlockSuiteWhiteboard(host, {
      snapshot,
      readOnly: options.readOnly,
      onSnapshot: options.readOnly
        ? undefined
        : (nextSnapshot) => {
            options.onStatus?.('Saving…');
            saveChain = saveChain
              .then(() =>
                saveWhiteboardDocument(
                  getApiBaseUrl(),
                  block.content.document_id,
                  nextSnapshot
                )
              )
              .then(() => options.onStatus?.('Saved'))
              .catch((error: unknown) => {
                const message = error instanceof Error ? error.message : 'Whiteboard save failed.';
                options.onStatus?.(message, true);
              });
            return saveChain.then(() => undefined);
          }
    });
    disposeWhenDetached(host, handle);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Whiteboard failed to load.';
    host.replaceChildren();
    const unavailable = document.createElement('p');
    unavailable.className = 'block-whiteboard__status block-whiteboard__status--error';
    unavailable.textContent = message;
    host.append(unavailable);
    options.onStatus?.(message, true);
  }
}
