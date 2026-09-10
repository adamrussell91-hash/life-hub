import type { ConceptMapContent, MindMapContent } from '@/blocks/graph-layout';
import './graph-maker-engine.js';
import {
  conceptMapContentToEngineState,
  engineStateToConceptMapContent,
  engineStateToMindMapContent,
  mindMapContentToEngineState,
  type ConceptMapEngineState,
  type MindMapEngineState
} from '@/blocks/graph-maker/content-adapters';

declare global {
  interface Window {
    GraphMakerEngine?: {
      boot: (config: GraphMakerBootConfig) => GraphMakerController;
    };
  }
}

type GraphMakerBootConfig = {
  mode: 'mindmap' | 'conceptmap';
  embedded?: boolean;
  readOnly?: boolean;
  storageKey?: string;
  exportPrefix?: string;
  initialState?: MindMapEngineState | ConceptMapEngineState;
  onChange?: (state: MindMapEngineState | ConceptMapEngineState) => void;
  strings?: {
    newConfirm?: string;
    importError?: string;
    fabLabel?: string;
    emptyHint?: string;
    canvasLabel?: string;
  };
  domOverride?: Record<string, HTMLElement | SVGElement | null>;
};

type GraphMakerController = {
  destroy?: () => void;
  setState?: (state: MindMapEngineState | ConceptMapEngineState) => void;
};

export type GraphMakerMountOptions = {
  mode: 'mindmap' | 'conceptmap';
  readOnly?: boolean;
  content: MindMapContent | ConceptMapContent;
  onChange?: (content: MindMapContent | ConceptMapContent) => void;
};

function ensureEngine(): NonNullable<Window['GraphMakerEngine']> {
  if (!window.GraphMakerEngine) {
    throw new Error('Graph maker engine failed to load');
  }
  return window.GraphMakerEngine;
}

function createCanvasDom(readOnly: boolean): {
  root: HTMLElement;
  dom: Record<string, HTMLElement>;
} {
  const root = document.createElement('div');
  root.className = 'block-graph-maker';

  const instanceId = Math.random().toString(36).slice(2, 8);
  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'canvas-wrap block-graph-maker__canvas';
  canvasWrap.id = `graph-canvas-${instanceId}`;

  const world = document.createElement('div');
  world.className = 'graph-maker__world';
  world.id = `graph-world-${instanceId}`;

  const edges = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  edges.classList.add('graph-maker__edges');
  edges.id = `graph-edges-${instanceId}`;
  edges.setAttribute('overflow', 'visible');
  edges.setAttribute('aria-hidden', 'true');

  const nodesLayer = document.createElement('div');
  nodesLayer.className = 'graph-maker__nodes';
  nodesLayer.id = `graph-nodes-${instanceId}`;

  world.append(edges, nodesLayer);
  canvasWrap.append(world);

  const hintBar = document.createElement('p');
  hintBar.className = 'hint-bar';
  hintBar.id = `hintBar-${instanceId}`;
  hintBar.hidden = readOnly;

  const emptyHint = document.createElement('div');
  emptyHint.className = 'empty-hint';
  emptyHint.id = `emptyHint-${instanceId}`;
  emptyHint.hidden = true;
  emptyHint.innerHTML = '<p></p>';

  const zoomControls = document.createElement('div');
  zoomControls.className = 'zoom-controls block-graph-maker__zoom';
  zoomControls.innerHTML = `
    <button type="button" id="zoomOut-${instanceId}" aria-label="Zoom out" title="Zoom out">−</button>
    <span class="zoom-controls__pct" id="zoomPct-${instanceId}">100%</span>
    <button type="button" id="zoomIn-${instanceId}" aria-label="Zoom in" title="Zoom in">+</button>
    <button type="button" id="zoomReset-${instanceId}" aria-label="Reset zoom" title="Reset zoom">⟳</button>
  `;

  const fabAdd = document.createElement('button');
  fabAdd.className = 'fab block-graph-maker__fab';
  fabAdd.id = `fabAdd-${instanceId}`;
  fabAdd.type = 'button';
  fabAdd.hidden = readOnly;

  const colorPopover = document.createElement('div');
  colorPopover.className = 'color-popover';
  colorPopover.id = `colorPopover-${instanceId}`;
  colorPopover.setAttribute('role', 'dialog');
  colorPopover.setAttribute('aria-label', 'Choose colour');

  const linkBanner = document.createElement('p');
  linkBanner.className = 'link-banner';
  linkBanner.id = `linkBanner-${instanceId}`;
  linkBanner.hidden = true;
  linkBanner.textContent = 'Drag to another concept to connect — Esc to cancel';

  const edgeLabelEditor = document.createElement('input');
  edgeLabelEditor.type = 'text';
  edgeLabelEditor.className = 'edge-label-editor';
  edgeLabelEditor.id = `edgeLabelEditor-${instanceId}`;
  edgeLabelEditor.setAttribute('aria-label', 'Relationship label');
  edgeLabelEditor.hidden = true;

  canvasWrap.append(hintBar, emptyHint, zoomControls, fabAdd, colorPopover, linkBanner, edgeLabelEditor);
  root.append(canvasWrap);

  const hiddenChrome = document.createElement('div');
  hiddenChrome.hidden = true;
  hiddenChrome.innerHTML = `
    <button type="button" id="btnNew-${instanceId}"></button>
    <button type="button" id="btnImport-${instanceId}"></button>
    <button type="button" id="btnExport-${instanceId}"></button>
    <button type="button" id="btnFit-${instanceId}"></button>
    <input type="file" id="fileInput-${instanceId}" />
  `;
  root.append(hiddenChrome);

  const pick = (id: string): HTMLElement => {
    const el = root.querySelector(`#${id}-${instanceId}`) as HTMLElement | null;
    if (!el) throw new Error(`Graph maker DOM missing #${id}-${instanceId}`);
    return el;
  };

  return {
    root,
    dom: {
      canvasWrap,
      world,
      edgesSvg: edges as unknown as HTMLElement,
      nodesLayer,
      emptyHint,
      colorPopover,
      zoomPct: pick('zoomPct'),
      fileInput: pick('fileInput') as unknown as HTMLElement,
      btnNew: pick('btnNew'),
      btnImport: pick('btnImport'),
      btnExport: pick('btnExport'),
      btnFit: pick('btnFit'),
      zoomIn: pick('zoomIn'),
      zoomOut: pick('zoomOut'),
      zoomReset: pick('zoomReset'),
      fabAdd,
      hintBar,
      linkBanner,
      edgeLabelEditor
    }
  };
}

export function mountGraphMaker(
  host: HTMLElement,
  options: GraphMakerMountOptions
): { root: HTMLElement; destroy: () => void } {
  const readOnly = options.readOnly ?? false;
  const { root, dom } = createCanvasDom(readOnly);

  const initialState =
    options.mode === 'mindmap'
      ? mindMapContentToEngineState(options.content as MindMapContent)
      : conceptMapContentToEngineState(options.content as ConceptMapContent);

  const strings =
    options.mode === 'mindmap'
      ? {
          fabLabel: '+ Add idea',
          emptyHint: 'Press Tab or double-click the canvas to add your first branch.',
          canvasLabel: 'Mind map editor',
          newConfirm: '',
          importError: ''
        }
      : {
          fabLabel: '+ Add concept',
          emptyHint: 'Press Enter to add a concept, then link with labelled relationships.',
          canvasLabel: 'Concept map editor',
          newConfirm: '',
          importError: ''
        };

  if (options.mode === 'mindmap') {
    dom.hintBar.textContent =
      'Tab · child · Enter · sibling · Del · remove · double-click · rename';
  } else {
    root.classList.add('concept-mode');
    (dom.edgesSvg as unknown as SVGSVGElement).classList.add('concept-edges');
    dom.hintBar.textContent =
      'Enter · concept · Tab · linked concept · ⟷ · connect · Del · remove';
  }

  host.replaceChildren(root);

  const controller = ensureEngine().boot({
    mode: options.mode,
    embedded: true,
    readOnly,
    initialState,
    onChange: options.onChange
      ? (state) => {
          const content =
            options.mode === 'mindmap'
              ? engineStateToMindMapContent(state as MindMapEngineState)
              : engineStateToConceptMapContent(state as ConceptMapEngineState);
          options.onChange?.(content);
        }
      : undefined,
    strings,
    domOverride: dom
  });

  return {
    root,
    destroy: () => {
      controller.destroy?.();
      root.remove();
    }
  };
}
