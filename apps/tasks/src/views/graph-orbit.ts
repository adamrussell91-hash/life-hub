import type { Task } from '@/schemas/task';
import type { GraphInsight } from '@/domain/graph-insights';
import { collisions, formatFriendlyDay, orbitBody, separateOrbitAngles } from '@/domain/graph-model';
import { addDays, parseDue, startOfDay, toDateKey } from '@/domain/queries';
import { domainColor } from '@/services/task-properties';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { bodyPoint } from '../../../life/js/app/chart-kit/orbit-radar.js';
import { el } from '@/views/hub-kit';

export type OrbitMount = {
  root: HTMLElement;
  setLookAhead: (days: number) => void;
  setPaused: (paused: boolean) => void;
  isPaused: () => boolean;
  bodyPosition: (id: string) => { x: number; y: number } | null;
  focus: (id: string) => void;
  teardown: () => void;
};

type BodyRuntime = {
  task: Task;
  angle: number;
  radius: number;
  targetRadius: number;
  speed: number;
  heat: number;
  size: number;
  el: SVGGElement;
  circle: SVGCircleElement;
  trail: SVGPathElement;
};

function blend(hub: string, heat: number): string {
  return `color-mix(in srgb, var(--danger) ${Math.round(heat * 100)}%, ${hub})`;
}

export function mountOrbitView(
  host: HTMLElement,
  input: {
    tasks: Task[];
    now: Date;
    selectedId: string | null;
    search: string;
    insights: GraphInsight[];
    lookAhead: number;
    paused: boolean;
    reducedMotion: boolean;
    onSelect: (taskId: string) => void;
    onPauseChange: (paused: boolean) => void;
    onLookAhead: (days: number) => void;
    onReschedule: (taskId: string, dateKey: string) => void;
    onReviewInsight: (id: string) => void;
  }
): OrbitMount {
  host.replaceChildren();
  const root = el('div', 'graph-orbit');
  const width = Math.max(host.clientWidth || 640, 320);
  const height = Math.max(420, Math.min(width, 720));
  const cx = width / 2;
  const cy = height / 2;
  const rMax = Math.min(cx, cy) - 40;
  const dated = input.tasks.filter((t) => t.due_date && t.status !== 'done' && t.status !== 'dead');
  const undated = input.tasks.filter((t) => !t.due_date && t.status !== 'done' && t.status !== 'dead');

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'orbit-radar');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Orbit view');
  svg.style.width = '100%';
  svg.style.height = `${height}px`;

  const core = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  core.setAttribute('cx', String(cx));
  core.setAttribute('cy', String(cy));
  core.setAttribute('r', '26');
  core.setAttribute('class', 'or-core');
  svg.append(core);
  for (const ring of [
    { d: 7, label: '1 week' },
    { d: 14, label: '2 weeks' },
    { d: 30, label: '1 month' }
  ]) {
    const r = 40 + ((ring.d - 1) / 29) * (rMax - 40);
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', String(cx));
    c.setAttribute('cy', String(cy));
    c.setAttribute('r', String(r));
    c.setAttribute('class', 'or-ring');
    svg.append(c);
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', String(cx));
    label.setAttribute('y', String(cy - r - 6));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'or-ring__label');
    label.textContent = ring.label;
    svg.append(label);
  }

  const bodies: BodyRuntime[] = [];
  const metrics = dated
    .map((task) => {
      const body = orbitBody(task, input.now, input.lookAhead);
      return body ? { task, body } : null;
    })
    .filter((row): row is { task: Task; body: NonNullable<ReturnType<typeof orbitBody>> } => Boolean(row));
  const angles = metrics.map((row) => ({
    radius: (row.body.radius / 204) * rMax,
    angle: row.body.angle,
    size: row.body.size * 6
  }));
  separateOrbitAngles(angles);

  for (let i = 0; i < metrics.length; i += 1) {
    const row = metrics[i]!;
    const layout = angles[i]!;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.dataset.bodyId = row.task.id;
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', row.task.title);
    const trail = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    trail.setAttribute('class', 'or-trail');
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('r', String(5 + row.body.size * 2));
    circle.setAttribute('class', 'or-body');
    const hub = domainColor(row.task.domain) || 'var(--wave)';
    circle.setAttribute('fill', blend(hub, row.body.heat));
    g.append(trail, circle);
    g.addEventListener('click', () => input.onSelect(row.task.id));
    g.addEventListener('focus', () => input.onPauseChange(true));
    g.addEventListener('mouseenter', () => input.onPauseChange(true));
    g.addEventListener('mouseleave', () => input.onPauseChange(false));
    g.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') input.onSelect(row.task.id);
    });
    g.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      let days: number | null = null;
      const ghost = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      ghost.setAttribute('class', 'or-ring__label');
      svg.append(ghost);
      const move = (ev: PointerEvent) => {
        const rect = svg.getBoundingClientRect();
        const dx = ev.clientX - (rect.left + rect.width / 2);
        const dy = ev.clientY - (rect.top + rect.height / 2);
        const r = Math.sqrt(dx * dx + dy * dy);
        days = Math.max(0, Math.min(40, Math.round(((r - 40) / Math.max(1, rMax - 40)) * 29 + 1)));
        ghost.setAttribute('x', String(ev.clientX - rect.left));
        ghost.setAttribute('y', String(ev.clientY - rect.top));
        ghost.textContent = `+${days} days`;
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        ghost.remove();
        if (days == null) return;
        input.onReschedule(row.task.id, toDateKey(addDays(startOfDay(input.now), days)));
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
    svg.append(g);
    bodies.push({
      task: row.task,
      angle: layout.angle,
      radius: layout.radius,
      targetRadius: layout.radius,
      speed: row.body.angularSpeed,
      heat: row.body.heat,
      size: row.body.size,
      el: g,
      circle,
      trail
    });
  }

  const controls = el('div', 'graph-orbit__controls');
  const pause = el('button', 'btn btn--secondary', input.paused || input.reducedMotion ? 'Play' : 'Pause');
  pause.type = 'button';
  pause.setAttribute('aria-label', 'Pause orbit');
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '30';
  slider.value = String(input.lookAhead);
  slider.className = 'hub-slider';
  slider.setAttribute('aria-label', 'Look ahead');
  const lookLabel = el('span', 'graph-orbit__look', `+${input.lookAhead} days`);
  const nowBtn = el('button', 'btn btn--ghost', 'Now');
  nowBtn.type = 'button';
  controls.append(pause, slider, lookLabel, nowBtn);

  const banner = el('p', 'graph-orbit__banner');
  const hits = collisions(dated, addDays(startOfDay(input.now), input.lookAhead), 7);
  const first = hits[0];
  const collisionInsight = input.insights.find((ins) => ins.view === 'orbit' && ins.id.startsWith('orbit-collision'));
  if (collisionInsight && first) {
    banner.textContent = collisionInsight.detail;
    banner.tabIndex = 0;
    banner.addEventListener('click', () => input.onReviewInsight(collisionInsight.id));
    const day = parseDue(first.dateKey);
    if (day) {
      const days = Math.round((day.getTime() - startOfDay(input.now).getTime()) / 86_400_000) - input.lookAhead;
      const r = 40 + ((Math.max(1, Math.min(30, days)) - 1) / 29) * (rMax - 40);
      const arc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const start = bodyPoint(cx, cy, r, 0);
      const end = bodyPoint(cx, cy, r, 0.8);
      arc.setAttribute('d', `M${start.x} ${start.y} A${r} ${r} 0 0 1 ${end.x} ${end.y}`);
      arc.setAttribute('class', 'or-collision');
      svg.append(arc);
    }
  } else {
    const overdue = input.insights.find((ins) => ins.id === 'orbit-overdue');
    banner.textContent = overdue?.headline ?? '';
    if (overdue) banner.addEventListener('click', () => input.onSelect(overdue.anchor.kind === 'task' ? overdue.anchor.id : dated[0]!.id));
  }

  root.append(svg, controls, banner);
  if (undated.length) {
    const foot = el('a', 'graph-loose-footer', `${undated.length} undated · Backlog`);
    (foot as HTMLAnchorElement).href = '#/list';
    root.append(foot);
  }

  let paused = input.paused || input.reducedMotion;
  let raf = 0;
  let last = performance.now();
  let hidden = document.hidden;
  const io =
    typeof IntersectionObserver === 'function'
      ? new IntersectionObserver((entries) => {
          hidden = Boolean(entries[0] && !entries[0].isIntersecting);
        })
      : null;
  io?.observe(root);

  const paint = (dt: number) => {
    for (const body of bodies) {
      if (!paused && !hidden && !input.reducedMotion) body.angle += body.speed * (dt / 1000);
      body.radius += (body.targetRadius - body.radius) * Math.min(1, dt / 250);
      const pt = bodyPoint(cx, cy, body.radius, body.angle);
      body.circle.setAttribute('cx', String(pt.x));
      body.circle.setAttribute('cy', String(pt.y));
      const trail = bodyPoint(cx, cy, body.radius, body.angle - body.speed * 0.4);
      body.trail.setAttribute('d', `M${trail.x} ${trail.y} A${body.radius} ${body.radius} 0 0 1 ${pt.x} ${pt.y}`);
      body.trail.setAttribute('stroke', body.circle.getAttribute('fill') || 'currentColor');
      if (input.search && !body.task.title.toLowerCase().includes(input.search.toLowerCase())) {
        body.el.style.opacity = '0.22';
      } else {
        body.el.style.opacity = body.task.id === input.selectedId ? '1' : '0.95';
      }
    }
  };

  const tick = (now: number) => {
    const dt = Math.min(50, now - last);
    last = now;
    paint(dt);
    if (!paused && !hidden && !input.reducedMotion) raf = requestAnimationFrame(tick);
  };
  paint(16);
  if (!paused && !input.reducedMotion) raf = requestAnimationFrame(tick);

  const setPaused = (next: boolean) => {
    paused = next;
    pause.textContent = paused ? 'Play' : 'Pause';
    input.onPauseChange(paused);
    if (!paused && !input.reducedMotion) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(raf);
    }
  };
  pause.addEventListener('click', () => setPaused(!paused));
  slider.addEventListener('input', () => {
    const days = Number(slider.value);
    lookLabel.textContent = `+${days} days · ${formatFriendlyDay(addDays(input.now, days))}`;
    input.onLookAhead(days);
  });
  nowBtn.addEventListener('click', () => input.onLookAhead(0));

  const onVis = () => {
    hidden = document.hidden;
  };
  document.addEventListener('visibilitychange', onVis);

  host.append(root);
  return {
    root,
    setLookAhead: (days) => {
      slider.value = String(days);
      lookLabel.textContent = `+${days} days · ${formatDisplayDate(addDays(input.now, days))}`;
      for (const body of bodies) {
        const next = orbitBody(body.task, input.now, days);
        if (next) body.targetRadius = (next.radius / 204) * rMax;
      }
    },
    setPaused,
    isPaused: () => paused,
    bodyPosition: (id) => {
      const body = bodies.find((item) => item.task.id === id);
      if (!body) return null;
      return bodyPoint(cx, cy, body.radius, body.angle);
    },
    focus: (id) => {
      const body = bodies.find((item) => item.task.id === id);
      body?.el.classList.add('is-pulse');
      body?.el.focus();
    },
    teardown: () => {
      cancelAnimationFrame(raf);
      io?.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      host.replaceChildren();
    }
  };
}
