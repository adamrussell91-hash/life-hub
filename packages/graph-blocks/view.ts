import { buildTree, drawForRoom, svgMarkup, withParents, type TreeNode, type GraphContent, type GraphKind, type Scene } from './graph';

type PaintState = Parameters<typeof drawForRoom>[3];

const EXPAND_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';

const kindName = (kind: GraphKind) => (kind === 'mind' ? 'Mind map' : 'Concept map');

/**
 * Draw the block into a stage at its real size. When it is wider than the room it
 * shrinks to 70% at most, then scrolls sideways inside the stage.
 */
export function paintStage(stage: HTMLElement, kind: GraphKind, content: GraphContent, state: PaintState = {}): Scene {
  const room = Math.max(160, (stage.clientWidth || 680) - 32);
  const scene = drawForRoom(kind, content, room, state);
  const natural = Math.ceil(scene.bounds.w);
  const width = natural <= room ? natural : Math.max(room, Math.ceil(natural * 0.7));
  for (const child of [...stage.children]) if (child.classList.contains('graph-svg')) child.remove();
  stage.insertAdjacentHTML('afterbegin', svgMarkup(scene, content.title?.trim() || kindName(kind), width));
  stage.classList.toggle('is-scrolling', width > room);
  return scene;
}

/** Repaint on resize and once web fonts settle, while the stage stays in the page. */
export function watchStage(stage: HTMLElement, paint: () => void): void {
  let lastWidth = -1;
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => {
      if (!stage.isConnected) return ro.disconnect();
      if (stage.clientWidth === lastWidth) return;
      lastWidth = stage.clientWidth;
      paint();
    });
    ro.observe(stage);
  }
  void document.fonts?.ready.then(() => stage.isConnected && paint());
}

export function expandButton(onOpen: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'hub-icon-btn graph-stage__expand';
  btn.setAttribute('aria-label', 'Open the map full screen');
  btn.title = 'Full screen';
  btn.innerHTML = EXPAND_ICON;
  btn.addEventListener('click', onOpen);
  return btn;
}

export function openFullView(kind: GraphKind, content: GraphContent): void {
  const opener = document.activeElement as HTMLElement | null;
  const full = document.createElement('div');
  full.className = 'graph-full';
  full.setAttribute('role', 'dialog');
  full.setAttribute('aria-modal', 'true');
  full.setAttribute('aria-label', content.title?.trim() || kindName(kind));
  const bar = document.createElement('div');
  bar.className = 'graph-full__bar';
  const heading = document.createElement('h2');
  heading.textContent = content.title?.trim() || kindName(kind);
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'btn btn--secondary';
  close.textContent = 'Close';
  bar.append(heading, close);
  const stage = document.createElement('div');
  stage.className = 'graph-stage graph-full__stage';
  full.append(bar, stage);
  document.body.append(full);
  const paint = () => paintStage(stage, kind, content);
  paint();
  watchStage(stage, paint);
  const shut = () => {
    document.removeEventListener('keydown', onKey, true);
    full.remove();
    opener?.focus?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    shut();
  };
  document.addEventListener('keydown', onKey, true);
  close.addEventListener('click', shut);
  close.focus();
}

/** Read-only picture of a block: the student view, the teacher preview and print all use this. */
const HIDDEN_STYLE =
  'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;margin:-1px;padding:0;border:0';

function treeList(node: TreeNode): HTMLUListElement {
  const ul = document.createElement('ul');
  const li = document.createElement('li');
  li.append(document.createTextNode(node.label));
  if (node.kids.length) {
    const inner = document.createElement('ul');
    for (const kid of node.kids) inner.append(...treeList(kid).children);
    li.append(inner);
  }
  ul.append(li);
  return ul;
}

/** Visually hidden text version of a map so screen readers can read its content. */
export function buildGraphTextAlternative(kind: GraphKind, content: GraphContent): HTMLElement {
  const host = document.createElement('div');
  host.className = 'graph-sr-text';
  host.setAttribute('style', HIDDEN_STYLE);
  const heading = document.createElement('p');
  heading.textContent = `${content.title?.trim() || kindName(kind)}, as a list`;
  host.append(heading);
  if (kind === 'mind') {
    const root = buildTree(content.nodes);
    if (root) host.append(treeList(root));
    return host;
  }
  const label = new Map(content.nodes.map((n) => [n.id, n.label]));
  const ul = document.createElement('ul');
  const linked = new Set<string>();
  for (const e of content.edges ?? []) {
    const a = label.get(e.from);
    const b = label.get(e.to);
    if (a === undefined || b === undefined) continue;
    linked.add(e.from);
    linked.add(e.to);
    const li = document.createElement('li');
    li.textContent = e.label?.trim() ? `${a} \u2014 ${e.label.trim()} \u2014 ${b}` : `${a} \u2014 ${b}`;
    ul.append(li);
  }
  for (const n of content.nodes) {
    if (linked.has(n.id)) continue;
    const li = document.createElement('li');
    li.textContent = n.label;
    ul.append(li);
  }
  host.append(ul);
  return host;
}

export function renderGraphView(host: HTMLElement, kind: GraphKind, block: GraphContent): void {
  const content = withParents(kind, block);
  const stage = document.createElement('div');
  stage.className = 'graph-stage graph-stage--read';
  stage.dataset.kind = kind;
  stage.append(expandButton(() => openFullView(kind, content)), buildGraphTextAlternative(kind, content));
  host.replaceChildren(stage);
  const paint = () => paintStage(stage, kind, content);
  paint();
  watchStage(stage, paint);
}
