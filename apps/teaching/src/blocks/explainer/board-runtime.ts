/**
 * The explainer's board: Excalidraw mounted inline. Editable while recording
 * (and for the starting picture); view-only for playback, where pan and zoom
 * work while paused and the view snaps back on play. React and Excalidraw
 * load lazily, the same way as packages/whiteboard/excalidraw-board.ts, so a
 * text-only explainer never downloads them.
 */
import type { ExplainerBoardElement } from '@/schemas/block';

type Runtime = {
  React: typeof import('react');
  createRoot: typeof import('react-dom/client')['createRoot'];
  excalidraw: typeof import('@excalidraw/excalidraw');
};

let runtimePromise: Promise<Runtime> | null = null;

export function loadBoardRuntime(): Promise<Runtime> {
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

type AppState = {
  scrollX: number;
  scrollY: number;
  zoom: { value: number };
  newElement?: { id: string; type: string; points?: unknown[] } | null;
  offsetLeft?: number;
  offsetTop?: number;
  width?: number;
  height?: number;
};

type ExcalidrawApi = {
  updateScene(scene: { elements?: unknown; appState?: unknown; captureUpdate?: unknown }): void;
  getSceneElementsIncludingDeleted(): readonly ExplainerBoardElement[];
  getAppState(): AppState;
  getFiles(): Record<string, unknown>;
  scrollToContent(target?: unknown, opts?: { fitToViewport?: boolean; viewportZoomFactor?: number; animate?: boolean }): void;
  setActiveTool(tool: { type: string }): void;
};

export type BoardChange = { elements: readonly ExplainerBoardElement[]; appState: AppState };

export type MountBoardOptions = {
  elements: readonly ExplainerBoardElement[];
  files?: Record<string, unknown>;
  background?: string;
  editable: boolean;
  /** Frame the view round these instead of the first picture (playback: everything ever drawn). */
  fitElements?: readonly ExplainerBoardElement[];
  onChange?: (change: BoardChange) => void;
};

export type BoardHandle = {
  el: HTMLElement;
  ready: Promise<void>;
  /** Replace the picture (playback). */
  setElements: (elements: readonly ExplainerBoardElement[]) => void;
  /** Every element, deleted ones too. */
  getElements: () => readonly ExplainerBoardElement[];
  getFiles: () => Record<string, unknown>;
  appState: () => AppState | null;
  /** Playback: pan and zoom only while paused. */
  setInteractive: (on: boolean) => void;
  /** Back to the fitted view, on play. */
  snapBack: () => void;
  /** The pointer dot, in scene coordinates; null hides it. */
  showPointer: (at: { x: number; y: number } | null) => void;
  /** A viewport point as scene coordinates. */
  sceneCoords: (clientX: number, clientY: number) => { x: number; y: number } | null;
  /** Excalidraw's active tool (selection, laser…). */
  setTool: (type: string) => void;
  /** A new text element below the drawing, added to the board. */
  addText: (text: string) => ExplainerBoardElement | null;
  dispose: () => void;
};

/** Break sent words into lines of about 40 characters so a long quote stays on the board. */
export function wrapForBoard(text: string, width = 40): string {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.join('\n');
}

/** Whether an element sits wholly inside the visible board. */
export function inView(s: AppState, el: { x: number; y: number; width?: number; height?: number }): boolean {
  if (!s.width || !s.height) return true;
  const z = s.zoom.value || 1;
  const left = -s.scrollX;
  const top = -s.scrollY;
  const right = left + s.width / z;
  const bottom = top + s.height / z;
  return el.x >= left && el.y >= top && el.x + (el.width ?? 0) <= right && el.y + (el.height ?? 0) <= bottom;
}

export function mountBoard(options: MountBoardOptions): BoardHandle {
  const wrap = document.createElement('div');
  wrap.className = 'block-explainer__board';
  const host = document.createElement('div');
  host.className = 'block-explainer__board-host';
  const dot = document.createElement('span');
  dot.className = 'block-explainer__pointer block-explainer__pointer--board';
  dot.hidden = true;
  dot.setAttribute('aria-hidden', 'true');
  const loading = document.createElement('p');
  loading.className = 'block-explainer__hint block-explainer__board-loading';
  loading.textContent = 'Loading the board…';
  wrap.append(host, dot, loading);

  let api: ExcalidrawApi | null = null;
  let rt: Runtime | null = null;
  let root: ReturnType<Runtime['createRoot']> | null = null;
  let disposed = false;
  let pending: readonly ExplainerBoardElement[] | null = null;
  let view: { scrollX: number; scrollY: number; zoom: { value: number } } | null = null;
  let pointerAt: { x: number; y: number } | null = null;
  let wanted: string | null = null;

  const placeDot = () => {
    if (!pointerAt || !api || !rt) {
      dot.hidden = true;
      return;
    }
    const s = api.getAppState();
    const v = rt.excalidraw.sceneCoordsToViewportCoords({ sceneX: pointerAt.x, sceneY: pointerAt.y }, s as never);
    const box = wrap.getBoundingClientRect();
    dot.hidden = false;
    dot.style.left = `${v.x - box.left}px`;
    dot.style.top = `${v.y - box.top}px`;
  };

  const fit = () => {
    if (!api || !rt) return;
    const frame = options.fitElements
      ? (rt.excalidraw.restoreElements(options.fitElements.filter((e) => !e.isDeleted) as never, null) as unknown[])
      : api.getSceneElementsIncludingDeleted().filter((e) => !e.isDeleted);
    if (frame.length) {
      api.scrollToContent(frame, { fitToViewport: true, viewportZoomFactor: 0.85, animate: false });
      if (api.getAppState().zoom.value > 1) {
        // Never blow a small drawing up; centre it at full size instead.
        api.updateScene({ appState: { zoom: { value: 1 } } });
        api.scrollToContent(frame, { fitToViewport: false, animate: false });
      }
    }
    const s = api.getAppState();
    view = { scrollX: s.scrollX, scrollY: s.scrollY, zoom: { value: s.zoom.value } };
  };

  const ready = loadBoardRuntime().then((runtime) => {
    if (disposed) return;
    rt = runtime;
    const { React, createRoot, excalidraw } = runtime;
    root = createRoot(host);
    return new Promise<void>((resolve) => {
      root!.render(
        React.createElement(excalidraw.Excalidraw, {
          initialData: {
            elements: options.elements as never,
            appState: { viewBackgroundColor: options.background ?? '#ffffff' },
            files: (options.files ?? {}) as never
          },
          excalidrawAPI: (a: unknown) => {
            if (api) return;
            api = a as ExcalidrawApi;
            loading.remove();
            // Let Excalidraw measure itself before fitting the view.
            setTimeout(() => {
              fit();
              if (wanted) api!.setActiveTool({ type: wanted });
              if (pending) {
                api!.updateScene({ elements: pending });
                pending = null;
              }
              resolve();
            }, 50);
          },
          viewModeEnabled: !options.editable,
          zenModeEnabled: !options.editable,
          theme: 'light',
          UIOptions: {
            canvasActions: { loadScene: false, saveToActiveFile: false, toggleTheme: false, export: false, saveAsImage: false, clearCanvas: false }
          },
          onScrollChange: () => placeDot(),
          onChange: options.onChange
            ? (elements: readonly unknown[], appState: unknown) =>
                options.onChange!({ elements: elements as readonly ExplainerBoardElement[], appState: appState as AppState })
            : undefined
        })
      );
    });
  });
  ready.catch(() => {
    loading.textContent = 'The board did not load. Refresh the page to try again.';
  });

  return {
    el: wrap,
    ready: ready.then(() => undefined),
    setElements: (elements) => {
      if (!api || !rt) {
        pending = elements;
        return;
      }
      // Fill in any defaults a stored element leaves out, as Excalidraw does on load.
      api.updateScene({ elements: rt.excalidraw.restoreElements(elements as never, null) });
    },
    getElements: () => api?.getSceneElementsIncludingDeleted() ?? options.elements,
    getFiles: () => api?.getFiles() ?? options.files ?? {},
    appState: () => api?.getAppState() ?? null,
    setInteractive: (on) => wrap.classList.toggle('is-locked', !on),
    snapBack: () => {
      if (api && view) api.updateScene({ appState: { ...view } });
      placeDot();
    },
    showPointer: (at) => {
      pointerAt = at;
      placeDot();
    },
    sceneCoords: (clientX, clientY) => {
      if (!api || !rt) return null;
      const p = rt.excalidraw.viewportCoordsToSceneCoords({ clientX, clientY }, api.getAppState() as never);
      return { x: Math.round(p.x), y: Math.round(p.y) };
    },
    setTool: (type) => {
      wanted = type;
      try {
        api?.setActiveTool({ type });
      } catch {
        /* older builds */
      }
    },
    addText: (text) => {
      if (!api || !rt) return null;
      const live = api.getSceneElementsIncludingDeleted().filter((e) => !e.isDeleted);
      let x = 0;
      let y = 0;
      if (live.length) {
        const [minX, , , maxY] = rt.excalidraw.getCommonBounds(live as never);
        x = minX;
        y = maxY + 40;
      }
      const [el] = rt.excalidraw.convertToExcalidrawElements([{ type: 'text', x, y, text: wrapForBoard(text), fontSize: 20 } as never]) as unknown as ExplainerBoardElement[];
      if (!el) return null;
      api.updateScene({ elements: [...api.getSceneElementsIncludingDeleted(), el] });
      // It lands below the drawing, often out of view: bring it on screen.
      if (!inView(api.getAppState(), el as unknown as { x: number; y: number; width: number; height: number }))api.scrollToContent([el], { fitToViewport: false, animate: true });
      return el;
    },
    dispose: () => {
      disposed = true;
      root?.unmount();
    }
  };
}
