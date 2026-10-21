import { LOGIC_AXIS, type Logic, type ReasoningStep } from './content';

const SVG = 'http://www.w3.org/2000/svg';
const PRINT_LINES = 2;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/**
 * Connectors between two columns. Columns lay their nodes out with
 * `justify-content: space-around`, so node i of n is centred at (i + 0.5) / n
 * of the column height; the SVG stretches to that height.
 */
function links(left: number, right: number, allPairs: boolean): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'block-reasoning-chart__links');
  svg.setAttribute('viewBox', '0 0 40 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  const y = (i: number, n: number) => ((i + 0.5) / n) * 100;
  const pairs: Array<[number, number]> = [];
  if (allPairs || left === 1 || right === 1) {
    for (let a = 0; a < left; a += 1) for (let b = 0; b < right; b += 1) pairs.push([a, b]);
  } else {
    for (let a = 0; a < left; a += 1) pairs.push([a, 0]);
  }
  for (const [a, b] of pairs) {
    const path = document.createElementNS(SVG, 'path');
    const from = y(a, left);
    const to = y(b, right);
    path.setAttribute('d', `M0 ${from} C20 ${from} 20 ${to} 40 ${to}`);
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.append(path);
  }
  return svg;
}

/**
 * The chart students build: each writing step is a node in its column, joined
 * by connectors in the shape of its logic (branching, joining or a network).
 */
export function renderReasoningChart(options: {
  logic: Logic;
  steps: ReasoningStep[];
  answers: Record<string, string>;
  current?: string;
  /** Steps a later answer was ticked against. */
  fits?: Set<string>;
  print?: boolean;
}): HTMLElement {
  const { logic, print } = options;
  const chart = el('div', 'block-reasoning-chart');
  chart.dataset.logic = logic;
  const [from, to] = LOGIC_AXIS[logic];
  const axis = el('p', 'block-reasoning-chart__axis');
  axis.append(el('span', undefined, from), el('span', 'block-reasoning-chart__axis-line'), el('span', undefined, to));
  axis.setAttribute('aria-hidden', 'true');

  const columns: ReasoningStep[][] = [];
  for (const step of options.steps) {
    if (step.logic !== logic || step.kind !== 'text') continue;
    (columns[step.column] ??= []).push(step);
  }
  const body = el('div', 'block-reasoning-chart__body');
  const filled = columns.filter(Boolean);
  filled.forEach((column, i) => {
    if (i > 0) body.append(links(filled[i - 1]!.length, column.length, logic === 'abductive' && i === 1));
    const col = el('div', 'block-reasoning-chart__col');
    for (const step of column) col.append(node(step, options));
    body.append(col);
  });
  chart.append(axis, body);
  if (!print) chart.setAttribute('aria-label', `Your ${logic} chart`);
  return chart;
}

function node(step: ReasoningStep, options: { answers: Record<string, string>; current?: string; fits?: Set<string>; print?: boolean }): HTMLElement {
  const answer = options.print ? '' : options.answers[step.id]?.trim() ?? '';
  const state = options.current === step.id ? 'now' : answer ? 'done' : 'ghost';
  const box = el('div', `block-reasoning-chart__node block-reasoning-chart__node--${state}`);
  box.dataset.step = step.id;
  const label = el('span', 'block-reasoning-chart__label', step.title);
  if (!options.print && options.fits?.has(step.id)) label.append(el('span', 'block-reasoning-chart__fit', '✓ fits'));
  box.append(label);
  if (options.print) {
    for (let i = 0; i < PRINT_LINES; i += 1) box.append(el('span', 'block-reasoning-chart__line'));
  } else {
    box.append(el('span', 'block-reasoning-chart__text', answer || '…'));
  }
  return box;
}

/** Small line drawings of each logic's shape, for the picker cards and the lens chip. */
const SYMBOL_PATHS: Record<Logic, string> = {
  // One box branching into three.
  deductive: 'M2 9.5h5v5H2zM17 3h5v4h-5zM17 10h5v4h-5zM17 17h5v4h-5zM7 12h4M11 5v14M11 5h6M11 12h6M11 19h6',
  // Three boxes joining into one.
  inductive: 'M2 3h5v4H2zM2 10h5v4H2zM2 17h5v4H2zM17 9.5h5v5h-5zM7 5h4v14H7M11 12h6',
  // Joined dots, then a dotted line to the best guess.
  abductive: 'M4 5a1.5 1.5 0 1 0 .01 0M11 5a1.5 1.5 0 1 0 .01 0M4 17a1.5 1.5 0 1 0 .01 0M11 17a1.5 1.5 0 1 0 .01 0M20 17a2 2 0 1 0 .01 0M5 6.5l5 9M10 6.5l-5 9M5.5 5h4M5.5 17h4M11 6.5v9M12.5 17h1.5M15.5 17h1.5'
};

export function logicSymbol(logic: Logic): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('kaplan-symbol');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', SYMBOL_PATHS[logic]);
  svg.append(path);
  return svg;
}
