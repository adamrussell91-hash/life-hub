// The whiteboard block shared by the Teaching and Tasks hubs: a static picture
// in the page, Excalidraw over the whole page to draw or look closer.
import { loadWhiteboardDocument, saveWhiteboardDocument } from './document-client';
import {
  hasDrawing,
  openBoardOverlay,
  renderBoardSvg,
  toScene,
  type BoardOverlay,
  type BoardScene
} from './excalidraw-board';
import './whiteboard.css';

export type WhiteboardBlockLike = {
  content: {
    document_id: string;
    seed_document_id?: string;
    title?: string;
    published_snapshot?: unknown;
  };
};

export type HubWhiteboardOptions<B extends WhiteboardBlockLike> = {
  /** The hub's API origin; read on every request so a changed setting applies. */
  getBaseUrl: () => string;
  readOnly: boolean;
  published?: boolean;
  onBlockChange?: (block: B) => void;
  onStatus?: (message: string, isError?: boolean) => void;
  /** The editor's title field can change after mount. */
  getTitle?: () => string | undefined;
};

const SAVE_DELAY_MS = 600;

// The lesson editor can rebuild a block while its board is open full screen,
// so a closed board tells every mounted copy of the same document to redraw.
const UPDATED_EVENT = 'hub-whiteboard:updated';
type UpdatedDetail = { documentId: string; scene: BoardScene };

async function resolveDraftScene(
  block: WhiteboardBlockLike,
  baseUrl: string
): Promise<{ scene: BoardScene; seeded: boolean }> {
  const own = await loadWhiteboardDocument(baseUrl, block.content.document_id);
  if (own) return { scene: toScene(own.snapshot), seeded: false };

  const seedId = block.content.seed_document_id;
  if (!seedId) return { scene: toScene(null), seeded: false };

  const seed = await loadWhiteboardDocument(baseUrl, seedId);
  if (!seed) return { scene: toScene(null), seeded: true };

  const scene = toScene(seed.snapshot);
  await saveWhiteboardDocument(baseUrl, block.content.document_id, scene);
  return { scene, seeded: true };
}

function clearSeed<B extends WhiteboardBlockLike>(block: B, onBlockChange?: (block: B) => void): void {
  if (!block.content.seed_document_id || !onBlockChange) return;
  const { seed_document_id: _seed, ...content } = block.content;
  onBlockChange({ ...block, content } as B);
}

function statusLine(text: string, isError = false): HTMLParagraphElement {
  const line = document.createElement('p');
  line.className = 'block-whiteboard__status block-empty';
  if (isError) line.classList.add('block-whiteboard__status--error');
  line.textContent = text;
  return line;
}

function button(label: string, variant: 'primary' | 'secondary'): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `btn btn--${variant} block-whiteboard__action`;
  el.textContent = label;
  return el;
}

export async function mountHubWhiteboard<B extends WhiteboardBlockLike>(
  host: HTMLElement,
  block: B,
  options: HubWhiteboardOptions<B>
): Promise<void> {
  host.replaceChildren(statusLine('Loading whiteboard…'));

  let scene: BoardScene;
  try {
    if (options.published) {
      scene = toScene(block.content.published_snapshot);
    } else {
      const resolved = await resolveDraftScene(block, options.getBaseUrl());
      scene = resolved.scene;
      if (resolved.seeded) clearSeed(block, options.onBlockChange);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Whiteboard failed to load.';
    host.replaceChildren(statusLine(message, true));
    options.onStatus?.(message, true);
    return;
  }

  const editable = !options.readOnly;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let pending: BoardScene | null = null;
  let saveChain = Promise.resolve();
  let overlay: BoardOverlay | null = null;

  const report = (message: string, isError = false) => {
    overlay?.setStatus(message, isError);
    options.onStatus?.(message, isError);
  };

  const flush = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    const next = pending;
    pending = null;
    if (!next) return saveChain;
    report('Saving…');
    saveChain = saveChain
      .then(() => saveWhiteboardDocument(options.getBaseUrl(), block.content.document_id, next))
      .then(() => report('Saved'))
      .catch((error: unknown) => {
        report(error instanceof Error ? error.message : 'Whiteboard save failed.', true);
      });
    return saveChain;
  };

  const queueSave = (next: BoardScene) => {
    pending = next;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void flush(), SAVE_DELAY_MS);
    overlay?.setStatus('Unsaved changes');
  };

  const open = async () => {
    if (overlay) return;
    try {
      overlay = await openBoardOverlay({
        scene,
        title: options.getTitle?.() ?? block.content.title,
        editable,
        onScene: editable ? queueSave : undefined,
        onClose: (latest) => {
          overlay = null;
          if (!editable) return;
          void flush();
          document.dispatchEvent(
            new CustomEvent<UpdatedDetail>(UPDATED_EVENT, {
              detail: { documentId: block.content.document_id, scene: latest }
            })
          );
        }
      });
    } catch (error) {
      report(error instanceof Error ? error.message : 'Whiteboard failed to open.', true);
    }
  };

  const paint = async () => {
    const actions = document.createElement('div');
    actions.className = 'block-whiteboard__actions';

    if (!hasDrawing(scene)) {
      if (!editable) {
        host.replaceChildren(
          statusLine(
            options.published
              ? 'This whiteboard has no published content.'
              : 'Nothing on this board yet.'
          )
        );
        return;
      }
      const empty = document.createElement('div');
      empty.className = 'block-whiteboard__empty';
      empty.append(statusLine('An empty board. Open it to draw, write and lay out ideas.'));
      const start = button('Start drawing', 'primary');
      start.addEventListener('click', () => void open());
      actions.append(start);
      empty.append(actions);
      host.replaceChildren(empty);
      return;
    }

    let picture: SVGSVGElement;
    try {
      picture = await renderBoardSvg(scene);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Whiteboard failed to draw.';
      host.replaceChildren(statusLine(message, true));
      return;
    }
    const title = options.getTitle?.() ?? block.content.title;
    picture.setAttribute('aria-label', title?.trim() || 'Whiteboard drawing');

    const frame = document.createElement('button');
    frame.type = 'button';
    frame.className = 'block-whiteboard__picture';
    frame.setAttribute('aria-label', editable ? 'Edit whiteboard' : 'Open whiteboard full screen');
    frame.append(picture);
    frame.addEventListener('click', () => void open());

    const action = button(editable ? 'Edit board' : 'Full screen', editable ? 'primary' : 'secondary');
    action.addEventListener('click', () => void open());
    actions.append(action);

    host.replaceChildren(frame, actions);
  };

  const onUpdated = (event: Event) => {
    if (!host.isConnected) {
      document.removeEventListener(UPDATED_EVENT, onUpdated);
      return;
    }
    const detail = (event as CustomEvent<UpdatedDetail>).detail;
    if (detail.documentId !== block.content.document_id) return;
    scene = detail.scene;
    void paint();
  };
  document.addEventListener(UPDATED_EVENT, onUpdated);

  await paint();
}
