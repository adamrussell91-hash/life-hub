// Excalidraw is React. Everything here loads lazily so lessons without a board
// never download React or the editor.

export type BoardScene = {
  format: 'excalidraw';
  version: 1;
  elements: unknown[];
  appState: { viewBackgroundColor?: string };
  files: Record<string, unknown>;
};

export function emptyScene(): BoardScene {
  return { format: 'excalidraw', version: 1, elements: [], appState: {}, files: {} };
}

/** Reads a stored snapshot. Anything not saved by Excalidraw (old BlockSuite boards) starts empty. */
export function toScene(snapshot: unknown): BoardScene {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return emptyScene();
  const value = snapshot as Partial<BoardScene>;
  if (value.format !== 'excalidraw' || !Array.isArray(value.elements)) return emptyScene();
  return {
    format: 'excalidraw',
    version: 1,
    elements: value.elements,
    appState:
      value.appState && typeof value.appState === 'object'
        ? { viewBackgroundColor: value.appState.viewBackgroundColor }
        : {},
    files: value.files && typeof value.files === 'object' ? value.files : {}
  };
}

export function hasDrawing(scene: BoardScene): boolean {
  return scene.elements.some(
    (element) => !(element as { isDeleted?: boolean } | null)?.isDeleted
  );
}

type Runtime = {
  React: typeof import('react');
  createRoot: typeof import('react-dom/client')['createRoot'];
  excalidraw: typeof import('@excalidraw/excalidraw');
};

let runtimePromise: Promise<Runtime> | null = null;

function loadRuntime(): Promise<Runtime> {
  if (!runtimePromise) {
    runtimePromise = Promise.all([
      import('react'),
      import('react-dom/client'),
      import('@excalidraw/excalidraw'),
      import('@excalidraw/excalidraw/index.css')
    ]).then(([React, reactDom, excalidraw]) => ({
      React: (React as { default?: typeof import('react') }).default ?? React,
      createRoot: reactDom.createRoot,
      excalidraw
    }));
    runtimePromise.catch(() => {
      runtimePromise = null;
    });
  }
  return runtimePromise;
}

function liveElements(scene: BoardScene): unknown[] {
  return scene.elements.filter((element) => !(element as { isDeleted?: boolean })?.isDeleted);
}

/** A static picture of the board that scales to the column. */
export async function renderBoardSvg(scene: BoardScene): Promise<SVGSVGElement> {
  const { excalidraw } = await loadRuntime();
  const svg = await excalidraw.exportToSvg({
    elements: liveElements(scene) as never,
    appState: {
      exportBackground: true,
      viewBackgroundColor: scene.appState.viewBackgroundColor ?? '#ffffff',
      exportWithDarkMode: false
    } as never,
    files: scene.files as never,
    exportPadding: 24
  });
  const width = Number(svg.getAttribute('width')) || 0;
  const height = Number(svg.getAttribute('height')) || 0;
  if (width && height && !svg.getAttribute('viewBox')) {
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  }
  // Keep the drawing's natural size as the cap so small sketches are not blown up.
  if (width) svg.style.maxWidth = `${width}px`;
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.setAttribute('role', 'img');
  return svg;
}

type OverlayOptions = {
  scene: BoardScene;
  title?: string;
  editable: boolean;
  onScene?: (scene: BoardScene) => void;
  onClose?: (scene: BoardScene) => void;
};

export type BoardOverlay = {
  setStatus(message: string, isError?: boolean): void;
  close(): void;
};

/** Opens the board over the whole page: editing for teachers, pan and zoom for everyone else. */
export async function openBoardOverlay(options: OverlayOptions): Promise<BoardOverlay> {
  const { React, createRoot, excalidraw } = await loadRuntime();

  const overlay = document.createElement('div');
  overlay.className = 'board-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', options.title?.trim() || 'Whiteboard');

  const bar = document.createElement('div');
  bar.className = 'board-overlay__bar';

  const heading = document.createElement('p');
  heading.className = 'board-overlay__title';
  heading.textContent = options.title?.trim() || 'Whiteboard';

  const status = document.createElement('span');
  status.className = 'board-overlay__status';
  status.setAttribute('role', 'status');

  const done = document.createElement('button');
  done.type = 'button';
  done.className = 'btn btn--primary board-overlay__done';
  done.textContent = options.editable ? 'Done' : 'Close';

  bar.append(heading, status, done);

  const stage = document.createElement('div');
  stage.className = 'board-overlay__stage';
  overlay.append(bar, stage);

  const previousOverflow = document.body.style.overflow;
  const previousFocus = document.activeElement as HTMLElement | null;
  document.body.style.overflow = 'hidden';
  document.body.append(overlay);

  const background = options.scene.appState.viewBackgroundColor ?? '#ffffff';
  let latest: BoardScene = { ...options.scene, appState: { viewBackgroundColor: background } };
  let lastVersion = sceneVersion(latest.elements);
  const root = createRoot(stage);
  let resolveApi: (api: ExcalidrawApi) => void = () => undefined;
  const apiReady = new Promise<ExcalidrawApi>((resolve) => {
    resolveApi = resolve;
  });

  root.render(
    React.createElement(excalidraw.Excalidraw, {
      initialData: {
        elements: latest.elements as never,
        appState: { viewBackgroundColor: background },
        files: latest.files as never,
        scrollToContent: true
      },
      excalidrawAPI: (api: unknown) => resolveApi(api as ExcalidrawApi),
      viewModeEnabled: !options.editable,
      theme: 'light',
      UIOptions: {
        canvasActions: {
          loadScene: false,
          saveToActiveFile: false,
          toggleTheme: false,
          export: false
        }
      },
      onChange: options.editable
        ? (elements: readonly unknown[], appState: { viewBackgroundColor?: string }, files: unknown) => {
            // onChange fires on every pointer move; only real edits count.
            const version = sceneVersion(elements);
            const nextBackground = appState.viewBackgroundColor;
            if (version === lastVersion && nextBackground === latest.appState.viewBackgroundColor) return;
            lastVersion = version;
            latest = {
              format: 'excalidraw',
              version: 1,
              elements: [...elements],
              appState: { viewBackgroundColor: nextBackground },
              files: (files ?? {}) as Record<string, unknown>
            };
            options.onScene?.(latest);
          }
        : undefined
    })
  );

  // Text typed before the hand-drawn font arrives is measured with the fallback
  // font and clips once the real one loads. Wait for it, then re-measure text.
  void apiReady.then(async (api) => {
    await Promise.race([
      document.fonts?.load('20px Excalifont') ?? Promise.resolve(),
      new Promise((resolve) => setTimeout(resolve, 3000))
    ]).catch(() => undefined);
    if (closed) return;
    api.updateScene({
      elements: excalidraw.restoreElements(api.getSceneElementsIncludingDeleted() as never, null, {
        refreshDimensions: true,
        repairBindings: true
      })
    });
    // Fit the whole board on screen (phones especially), but never blow a small sketch past 100%.
    if (!hasDrawing(latest)) return;
    api.scrollToContent(undefined, { fitToViewport: true, viewportZoomFactor: 0.9, animate: false });
    if (api.getAppState().zoom.value > 1) {
      api.updateScene({ appState: { zoom: { value: 1 } } });
      api.scrollToContent(undefined, { animate: false });
    }
  });

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    root.unmount();
    overlay.remove();
    document.body.style.overflow = previousOverflow;
    previousFocus?.focus?.();
    options.onClose?.(latest);
  };
  done.addEventListener('click', close);

  return {
    setStatus(message, isError = false) {
      status.textContent = message;
      status.classList.toggle('board-overlay__status--error', isError);
    },
    close
  };
}

type ExcalidrawApi = {
  updateScene(scene: { elements?: unknown; appState?: unknown }): void;
  scrollToContent(
    target: undefined,
    opts?: { fitToViewport?: boolean; viewportZoomFactor?: number; animate?: boolean }
  ): void;
  getAppState(): { zoom: { value: number } };
  getSceneElementsIncludingDeleted(): readonly unknown[];
};

function sceneVersion(elements: readonly unknown[]): number {
  let sum = 0;
  for (const element of elements) {
    const item = element as { version?: number; versionNonce?: number };
    sum = (sum + (item.version ?? 0) * 31 + (item.versionNonce ?? 0)) | 0;
  }
  return sum + elements.length;
}
