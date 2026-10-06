import './graph-blocks.css';
import { mountCanvas } from './canvas';
import { modeOf, type GraphContent, type GraphKind, type GraphMode } from './graph';
import { mountOutline, type EditorHandle } from './outline';

export { renderGraphView } from './view';
export { modeOf, type GraphContent, type GraphKind, type GraphMode } from './graph';
export type { EditorHandle } from './outline';

export type GraphEditorOptions = {
  kind: GraphKind;
  content: GraphContent;
  onChange: (content: GraphContent) => void;
  /** Prefix for new node / edge ids, normally the block id. */
  idPrefix: string;
  titleClassName?: string;
};

const MODES: Array<{ mode: GraphMode; label: string; hint: string }> = [
  { mode: 'outline', label: 'Outline', hint: 'Write it as a list; the map lays itself out' },
  { mode: 'canvas', label: 'Canvas', hint: 'Build it on the map: drag, link and place ideas yourself' }
];

/**
 * Mind map / concept map editor with two ways to build the same block. The chosen
 * way is saved on the block (`mode`) and decides how every read-only view draws it.
 */
export function mountGraphEditor(host: HTMLElement, opts: GraphEditorOptions): EditorHandle {
  const { kind, idPrefix } = opts;
  let content: GraphContent = {
    ...opts.content,
    nodes: opts.content.nodes.map((n) => ({ ...n })),
    edges: (opts.content.edges ?? []).map((e) => ({ ...e }))
  };
  let mode = modeOf(kind, content);
  let body: EditorHandle | null = null;

  const root = document.createElement('div');
  root.className = 'graph-block';
  root.dataset.kind = kind;

  const head = document.createElement('div');
  head.className = 'graph-block__head';
  const title = document.createElement('input');
  title.type = 'text';
  title.className = ['graph-block__title', opts.titleClassName].filter(Boolean).join(' ');
  title.value = content.title ?? '';
  title.placeholder = 'Title (optional)';
  title.setAttribute('aria-label', kind === 'mind' ? 'Mind map title' : 'Concept map title');

  const modes = document.createElement('div');
  modes.className = 'hub-pills graph-block__modes';
  modes.setAttribute('role', 'group');
  modes.setAttribute('aria-label', 'How to build it');
  for (const m of MODES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hub-pills__btn';
    b.dataset.mode = m.mode;
    b.title = m.hint;
    b.textContent = m.label;
    modes.append(b);
  }
  head.append(title, modes);

  const bodyEl = document.createElement('div');
  bodyEl.className = 'graph-block__body';
  root.append(head, bodyEl);
  host.replaceChildren(root);

  const emit = () => opts.onChange({ ...content, title: title.value.trim() || undefined, mode });

  function mountBody(): void {
    body?.destroy();
    root.dataset.mode = mode;
    modes.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    const view = { ...content, mode };
    const onPatch = (patch: { nodes: GraphContent['nodes']; edges: GraphContent['edges'] }) => {
      content = { ...content, nodes: patch.nodes, edges: patch.edges };
      emit();
    };
    body = mode === 'outline' ? mountOutline(bodyEl, kind, view, onPatch, idPrefix) : mountCanvas(bodyEl, kind, view, onPatch, idPrefix);
  }

  modes.addEventListener('click', (e) => {
    const next = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-mode]')?.dataset.mode as GraphMode | undefined;
    if (!next || next === mode) return;
    mode = next;
    mountBody();
    emit();
  });
  title.addEventListener('input', () => {
    content.title = title.value;
    emit();
  });

  mountBody();
  return {
    destroy: () => {
      body?.destroy();
      root.remove();
    }
  };
}
