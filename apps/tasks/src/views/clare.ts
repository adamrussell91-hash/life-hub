import { buildChatView } from '@/chat/build-chat-view';
import { createClareChatController } from '@/chat/clare-controller';
import { getClareSession } from '@/chat/clare-session';
import { CLARE_ADHD_PROTOCOLS, CLARE_PROTOCOLS, CLARE_WAIT_LINES } from '@/domain/clare-protocols';
import { renderLoadError } from '@/views/feedback';
import { tasksApi } from '@/services/client-api';

export { CLARE_ADHD_PROTOCOLS, CLARE_PROTOCOLS, CLARE_WAIT_LINES } from '@/domain/clare-protocols';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function mountStandalone(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading chat…'));
  try {
    await tasksApi.listTemplates();
  } catch (err) {
    renderLoadError(canvas, err, () => void renderClareView(canvas), 'Could not load Clare');
    return;
  }

  let controller: ReturnType<typeof createClareChatController> | null = null;
  const view = buildChatView();
  view.hidden = false;
  canvas.replaceChildren(view);
  controller = createClareChatController({ root: view, isVisible: () => true });
  await controller.start();
}

/** Clare DeMind desk — Life Hub chat window, morning sweep, dump, confirm-card create. */
export async function renderClareView(canvas: HTMLElement): Promise<void> {
  const session = getClareSession();
  if (session) {
    canvas.replaceChildren();
    session.showPage(canvas);
    await session.start();
    await session.appendExtras(canvas);
    return;
  }
  await mountStandalone(canvas);
}
