import { buildChatHome, buildChatView, buildFloatingChatButton } from '@/chat/build-chat-view';
import { createChatPanelController, type ChatPanelController } from '@/chat/chat-panel';
import { createClareChatController, type ClareChatController } from '@/chat/clare-controller';
import { setChatUnread } from '@/chat/render-chat';
import type { FrameworkEntry } from '@/schemas/templates';
import { tasksApi } from '@/services/client-api';

export type ClareSession = {
  view: HTMLElement;
  home: HTMLElement;
  fab: HTMLButtonElement;
  panel: ChatPanelController;
  controller: ClareChatController;
  start: () => Promise<void>;
  park: () => void;
  showPage: (canvas: HTMLElement) => void;
  sync: (viewId: string) => void;
  openOverlay: (slot: HTMLElement) => void;
  toggleOverlay: (slot: HTMLElement) => void;
  appendExtras: (host: HTMLElement) => Promise<void>;
};

let session: ClareSession | null = null;

export function getClareSession(): ClareSession | null {
  return session;
}

export function installClareSession(root: HTMLElement): ClareSession {
  if (session?.view.isConnected) return session;
  session = null;

  let currentView = 'board';
  const home = buildChatHome();
  const view = buildChatView();
  home.append(view);
  const fab = buildFloatingChatButton();
  const overlaySlot = document.createElement('div');
  overlaySlot.id = 'clare-chat-slot';
  overlaySlot.className = 'clare-chat-slot';
  root.append(home, overlaySlot, fab);

  const panel = createChatPanelController({ panel: view, homeSlot: home });
  const controller = createClareChatController({
    root: view,
    isVisible: () => currentView === 'clare' || panel.isOpen(),
    onUnreadChange: (unread) => setChatUnread(root, unread)
  });
  const closeBtn = view.querySelector<HTMLButtonElement>('#chat-close');
  closeBtn?.addEventListener('click', () => panel.close());

  fab.addEventListener('click', () => {
    setChatUnread(root, false);
    toggleOverlay(overlaySlot);
  });

  window.addEventListener('tasks-hub:open-clare', () => {
    setChatUnread(root, false);
    if (currentView === 'clare') return;
    openOverlay(overlaySlot);
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && panel.isOpen()) panel.close();
  });

  function park(): void {
    document.querySelector('.hub-layout')?.removeAttribute('data-hub-view');
    if (!view.closest('.hub-canvas')) return;
    home.append(view);
    view.hidden = true;
    delete view.dataset.panelMode;
  }

  function showPage(canvas: HTMLElement): void {
    panel.close();
    canvas.append(view);
    view.hidden = false;
    delete view.dataset.panelMode;
    fab.hidden = true;
  }

  function sync(viewId: string): void {
    currentView = viewId;
    fab.hidden = viewId === 'clare';
    document.querySelector('.hub-layout')?.setAttribute('data-hub-view', viewId);
    if (viewId === 'clare') {
      setChatUnread(root, false);
    }
  }

  function openOverlay(slot: HTMLElement): void {
    if (currentView === 'clare') return;
    panel.open(slot, 'var(--wave)');
    setChatUnread(root, false);
    const input = view.querySelector<HTMLTextAreaElement>('#chat-input');
    input?.focus();
  }

  function toggleOverlay(slot: HTMLElement): void {
    if (panel.isOpen()) {
      panel.close();
      return;
    }
    openOverlay(slot);
  }

  async function appendExtras(host: HTMLElement): Promise<void> {
    if (host.querySelector('.clare-extras')) return;
    const extras = document.createElement('details');
    extras.className = 'clare-extras';
    const summary = document.createElement('summary');
    summary.textContent = 'Framework library and calibration';
    extras.append(summary);
    try {
      const [templates, calibrations] = await Promise.all([
        tasksApi.listTemplates(),
        tasksApi.listClareCalibrations().catch(() => [])
      ]);
      const frameworks = templates.frameworks as FrameworkEntry[];
      const library = document.createElement('div');
      library.className = 'clare-library';
      const heading = document.createElement('h2');
      heading.className = 'section-title';
      heading.textContent = 'Framework library';
      library.append(heading);
      const stack = document.createElement('div');
      stack.className = 'task-stack';
      for (const fw of frameworks) {
        const row = document.createElement('article');
        row.className = 'task-row';
        const title = document.createElement('h3');
        title.className = 'task-row__title';
        title.textContent = fw.name;
        const desc = document.createElement('p');
        desc.className = 'task-row__desc';
        desc.textContent = fw.best_suited_task_pattern;
        const reason = document.createElement('p');
        reason.className = 'task-row__desc';
        reason.textContent = fw.reasoning_template;
        row.append(title, desc, reason);
        stack.append(row);
      }
      library.append(stack);
      extras.append(library);
      if (calibrations.length) {
        const cal = document.createElement('div');
        cal.className = 'clare-calibration';
        const calTitle = document.createElement('h2');
        calTitle.className = 'section-title';
        calTitle.textContent = 'Estimate calibration';
        cal.append(calTitle);
        for (const c of calibrations) {
          const row = document.createElement('article');
          row.className = 'task-row';
          const title = document.createElement('h3');
          title.className = 'task-row__title';
          title.textContent = c.domain;
          const meanAccepted =
            c.sample_count > 0 ? Math.round(c.sum_accepted / c.sample_count) : c.calibrated_default_minutes;
          const desc = document.createElement('p');
          desc.className = 'task-row__desc';
          desc.textContent =
            `${c.sample_count} negotiations · default ~${c.calibrated_default_minutes}m · mean accepted ${meanAccepted}m` +
            (c.actual_sample_count
              ? ` · ${c.actual_sample_count} actuals (mean ${Math.round(c.sum_actual / c.actual_sample_count)}m)`
              : '');
          row.append(title, desc);
          cal.append(row);
        }
        extras.append(cal);
      }
    } catch {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'Could not load the framework library.';
      extras.append(empty);
    }
    host.append(extras);
  }

  session = {
    view,
    home,
    fab,
    panel,
    controller,
    start: () => controller.start(),
    park,
    showPage,
    sync,
    openOverlay,
    toggleOverlay,
    appendExtras
  };
  return session;
}
