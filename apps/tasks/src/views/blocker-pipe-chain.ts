import {
  ASSET_BASE,
  PIPE_DIAMETER,
  VALVE_WIDTH,
  WATER_TILE_WIDTH,
  type ChainSegment,
  type PipeChainLayout,
  type PipeIllustrationLayout,
  type WaterState
} from '@/domain/pipe-chain-layout';

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

function asset(name: string): string {
  return `${ASSET_BASE}/${name}.svg`;
}

function waterAsset(state: WaterState): string {
  if (state === 'dry') return asset('water-dry');
  if (state === 'pressurised') return asset('water-pressurised');
  return asset('water-flow-tile');
}

function renderStraightSegment(
  segment: Extract<ChainSegment, { kind: 'straight' }>,
  onSelect: (taskId: string) => void,
  taskId?: string
): HTMLElement {
  const wrap = el('div', 'pipe-segment');
  wrap.style.left = `${segment.x}px`;
  wrap.style.top = `${segment.y}px`;
  wrap.style.width = `${segment.width}px`;
  wrap.style.height = `${PIPE_DIAMETER}px`;

  const waterLayer = el('div', 'pipe-segment__water-layer');
  const waterFill = el('div', 'pipe-segment__water-fill');
  waterFill.style.backgroundImage = `url('${waterAsset(segment.water)}')`;
  if (segment.flowDuration != null && segment.water !== 'dry') {
    waterFill.style.setProperty('--flow-duration', `${segment.flowDuration}s`);
    waterFill.dataset.animate = 'true';
  }
  waterLayer.append(waterFill);

  const casingLayer = el('div', 'pipe-segment__casing-layer');
  casingLayer.style.backgroundImage = `url('${asset('casing-straight')}')`;

  wrap.append(waterLayer, casingLayer);

  if (taskId) {
    wrap.addEventListener('click', () => onSelect(taskId));
  }
  return wrap;
}

function renderValveUnit(
  segment: Extract<ChainSegment, { kind: 'valve' }>,
  onSelect: (taskId: string) => void
): HTMLElement {
  const wrap = el('button', 'valve-unit');
  wrap.type = 'button';
  wrap.style.left = `${segment.x}px`;
  wrap.style.top = `${segment.y}px`;
  wrap.style.width = `${VALVE_WIDTH}px`;
  wrap.style.height = `${PIPE_DIAMETER + 48}px`;
  wrap.setAttribute(
    'aria-label',
    `${segment.title}, ${segment.status === 'closed' ? 'closed' : 'open'} valve, ${segment.fanOut} downstream`
  );
  wrap.title = `${segment.title}${segment.daysBlocked ? ` · blocked ${segment.daysBlocked}d` : ''} · clears ${segment.fanOut}`;

  const closed = el('img', 'valve-unit__img valve-unit__img--closed');
  closed.src = asset('valve-closed');
  closed.alt = '';
  closed.draggable = false;

  const open = el('img', 'valve-unit__img valve-unit__img--open');
  open.src = asset('valve-open');
  open.alt = '';
  open.draggable = false;

  if (segment.status === 'open') {
    closed.classList.add('is-hidden');
  } else {
    open.classList.add('is-hidden');
    const seep = el('img', 'valve-unit__seep');
    seep.src = asset('seep-drip');
    seep.alt = '';
    seep.draggable = false;
    wrap.append(seep);
  }

  wrap.append(closed, open);
  wrap.addEventListener('click', () => onSelect(segment.taskId));
  return wrap;
}

function renderStaticAsset(
  segment: ChainSegment,
  className: string,
  file: string,
  width: number,
  height: number
): HTMLElement {
  const node = el('div', className);
  node.style.left = `${segment.x}px`;
  node.style.top = `${segment.y}px`;
  node.style.width = `${width}px`;
  node.style.height = `${height}px`;
  const img = el('img');
  img.src = asset(file);
  img.alt = '';
  img.draggable = false;
  img.style.width = '100%';
  img.style.height = '100%';
  node.append(img);
  return node;
}

function renderQueuedCap(segment: Extract<ChainSegment, { kind: 'queued-cap' }>): HTMLElement {
  const cap = el('div', 'pipe-queued-cap');
  cap.style.left = `${segment.x}px`;
  cap.style.top = `${segment.y}px`;
  cap.textContent = segment.label;
  return cap;
}

function renderChain(chain: PipeChainLayout, onSelect: (taskId: string) => void): HTMLElement {
  const host = el('div', 'blocker-pipe-chain');
  host.dataset.chainId = chain.chainId;
  host.style.width = `${chain.width}px`;
  host.style.height = `${chain.height}px`;

  let lastValveId: string | undefined;
  for (const segment of chain.segments) {
    switch (segment.kind) {
      case 'straight':
        host.append(renderStraightSegment(segment, onSelect, lastValveId));
        break;
      case 'valve':
        lastValveId = segment.taskId;
        host.append(renderValveUnit(segment, onSelect));
        break;
      case 'coupling':
        host.append(renderStaticAsset(segment, 'pipe-coupling', 'coupling-ring', 32, PIPE_DIAMETER + 48));
        break;
      case 'end-cap':
        host.append(renderStaticAsset(segment, 'pipe-end-cap', 'end-cap', 48, PIPE_DIAMETER + 48));
        break;
      case 'queued-cap':
        host.append(renderQueuedCap(segment));
        break;
      case 'elbow':
        host.append(
          renderStaticAsset(segment, 'pipe-elbow', 'casing-elbow', PIPE_DIAMETER + 48, PIPE_DIAMETER + 48)
        );
        break;
      case 'junction':
        host.append(
          renderStaticAsset(segment, 'pipe-junction', 'casing-tjunction', PIPE_DIAMETER + 48, PIPE_DIAMETER + 48)
        );
        break;
      default:
        break;
    }
  }
  return host;
}

export function renderPipeIllustration(
  layout: PipeIllustrationLayout,
  onSelectGate: (taskId: string) => void
): HTMLElement {
  const card = el('div', 'blocker-pipe-card');
  card.setAttribute('role', 'img');
  card.setAttribute('aria-label', layout.srSummary);

  const headline = el('p', 'blocker-pipe-card__headline', layout.headline);
  card.append(headline);

  for (const warning of layout.warnings) {
    card.append(el('p', 'blocker-pipe-card__warning', warning));
  }

  const stage = el('div', 'blocker-pipe-card__stage');
  if (!layout.chains.length) {
    stage.append(
      el(
        'p',
        'empty-state',
        'No blocked-by links yet. Add a blocker on a task to see the pipe here.'
      )
    );
  } else {
    for (const chain of layout.chains) {
      stage.append(renderChain(chain, onSelectGate));
    }
  }
  card.append(stage);

  const sr = el('p', 'sr-only');
  sr.textContent = layout.srSummary;
  card.append(sr);

  card.style.setProperty('--water-tile-width', `${WATER_TILE_WIDTH}px`);
  return card;
}
