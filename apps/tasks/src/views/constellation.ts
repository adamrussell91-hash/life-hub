import type { Task } from '@/schemas/task';
import { tasksApi } from '@/services/client-api';
import { buildConstellation, type ConstellationModel } from '@/domain/constellation';
import { renderGraphFamilyPills } from '@/views/stretch-pills';
import { createHubToolbar } from '@/views/hub-kit';

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

function mountConstellation(host: HTMLElement, model: ConstellationModel): void {
  host.replaceChildren();

  const width = host.clientWidth || 960;
  const height = Math.max(480, Math.floor(window.innerHeight * 0.58));

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'constellation-svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', model.headline);
  svg.style.width = '100%';
  svg.style.height = `${height}px`;

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const haze = Math.round(model.fill_ratio * 100);
  defs.innerHTML = `
    <radialGradient id="constellation-glow" cx="50%" cy="48%" r="55%">
      <stop offset="0%" stop-color="var(--wave)" stop-opacity="${0.12 + model.fill_ratio * 0.35}"/>
      <stop offset="70%" stop-color="var(--depth)" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="var(--depth)" stop-opacity="0.85"/>
    </radialGradient>
    <filter id="star-soft">
      <feGaussianBlur stdDeviation="1.2" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  `;
  svg.append(defs);

  const sky = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  sky.setAttribute('width', String(width));
  sky.setAttribute('height', String(height));
  sky.setAttribute('fill', 'url(#constellation-glow)');
  sky.setAttribute('class', 'constellation-sky');
  svg.append(sky);

  // Soft haze ring when overdue penalty bites
  if (model.overdue_count > 0) {
    const hazeRing = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    hazeRing.setAttribute('cx', String(width / 2));
    hazeRing.setAttribute('cy', String(height / 2));
    hazeRing.setAttribute('rx', String(width * 0.42));
    hazeRing.setAttribute('ry', String(height * 0.36));
    hazeRing.setAttribute('class', 'constellation-haze');
    svg.append(hazeRing);
  }

  const tip = el('div', 'graph-tip');
  tip.hidden = true;

  const lines = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  lines.setAttribute('class', 'constellation-lines');
  const lit = model.stars.filter((s) => s.lit);
  for (let i = 0; i < lit.length - 1; i++) {
    const a = lit[i];
    const b = lit[(i + 1) % lit.length];
    if (!a || !b || lit.length < 2) continue;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(a.x * width));
    line.setAttribute('y1', String(a.y * height));
    line.setAttribute('x2', String(b.x * width));
    line.setAttribute('y2', String(b.y * height));
    line.setAttribute('class', 'constellation-line');
    line.style.setProperty('--line-delay', `${i * 90}ms`);
    lines.append(line);
  }
  svg.append(lines);

  const starsG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  for (const star of model.stars) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', star.lit ? 'constellation-star constellation-star--lit' : 'constellation-star');
    g.style.setProperty('--star-delay', `${(star.x * 400) | 0}ms`);
    const cx = star.x * width;
    const cy = star.y * height;
    const r = star.size * 2.4;
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(cx));
    circle.setAttribute('cy', String(cy));
    circle.setAttribute('r', String(r));
    circle.setAttribute('filter', star.lit ? 'url(#star-soft)' : '');
    g.append(circle);
    g.addEventListener('mouseenter', (event) => {
      const rect = host.getBoundingClientRect();
      tip.hidden = false;
      tip.textContent = star.label;
      tip.style.left = `${event.clientX - rect.left + 12}px`;
      tip.style.top = `${event.clientY - rect.top + 12}px`;
    });
    g.addEventListener('mouseleave', () => {
      tip.hidden = true;
    });
    starsG.append(g);
  }
  svg.append(starsG);

  const fillLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  fillLabel.setAttribute('x', String(width / 2));
  fillLabel.setAttribute('y', String(height - 28));
  fillLabel.setAttribute('text-anchor', 'middle');
  fillLabel.setAttribute('class', 'constellation-fill');
  fillLabel.textContent = `${haze}% sky · ${model.completed_count} lit · ${model.open_count} waiting`;
  svg.append(fillLabel);

  const list = el('ul', 'viz-alt');
  list.setAttribute('aria-label', 'Constellation stars');
  for (const star of model.stars) {
    list.append(el('li', undefined, `${star.lit ? 'Lit' : 'Waiting'}: ${star.label}`));
  }
  host.append(svg, tip, list);
}

/** Spec §6.5 — emotional payoff metaphor, not a task manager. */
export async function renderConstellationView(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading constellation…'));
  const tasks = await tasksApi.listTasks();
  const model = buildConstellation(tasks);

  canvas.replaceChildren();
  const toolbar = createHubToolbar('graph-toolbar');
  toolbar.append(renderGraphFamilyPills('constellation'));
  canvas.append(toolbar);
  canvas.append(el('p', 'view-lede', model.headline));
  const host = el('div', 'constellation-host graph-host');
  canvas.append(host);
  mountConstellation(host, model);
}
