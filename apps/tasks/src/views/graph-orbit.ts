import type { Task } from '@/schemas/task';
import type { GraphInsight } from '@/domain/graph-insights';
import { collisions, formatFriendlyDay, orbitBody } from '@/domain/graph-model';
import { addDays, startOfDay, toDateKey } from '@/domain/queries';
import { domainColor, getTaskPropertiesSync } from '@/services/task-properties';
import {
  ORBIT,
  ORBIT_CORE_FILL,
  ORBIT_LATER_STROKE,
  ORBIT_RING_STROKE,
  bodyPoint,
  bodySize,
  hashAngle,
  heatColour,
  heatForDays,
  omegaForRadius,
  radiusForDays,
  trailPath
} from '../../../life/js/app/chart-kit/orbit-radar.js';
import { el } from '@/views/hub-kit';
import { svgEl, token } from '@/views/graph-svg';

export type OrbitMount = {
  root: HTMLElement;
  update: (input: OrbitInput) => void;
  setLookAhead: (days: number) => void;
  setPaused: (paused: boolean) => void;
  isPaused: () => boolean;
  bodyPosition: (id: string) => { x: number; y: number } | null;
  focus: (id: string) => void;
  teardown: () => void;
};

export type OrbitInput = {
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
  onDismissInsight?: (id: string) => void;
};

type BodyRuntime = {
  task: Task;
  angle: number;
  radius: number;
  heat: number;
  size: number;
  days: number;
  domain: string;
  colour: string;
  el: SVGGElement;
  circle: SVGCircleElement;
  trail: SVGPathElement;
};

function domainMeta(id: string): { label: string; colour: string } {
  const cfg = getTaskPropertiesSync().domains.find((d) => d.id === id);
  return { label: cfg?.label ?? id, colour: cfg?.color ?? domainColor(id) ?? token('--wave', '#376fb7') };
}

const PAUSE_ICON =
  '<svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2.5" y="1.5" width="2.5" height="9" rx="1" fill="currentColor"/><rect x="7" y="1.5" width="2.5" height="9" rx="1" fill="currentColor"/></svg>';
const PLAY_ICON =
  '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.5v9l7-4.5z" fill="currentColor"/></svg>';

export function mountOrbitView(host: HTMLElement, first: OrbitInput): OrbitMount {
  host.replaceChildren();
  const root = el('div', 'graph-orbit');
  const stage = el('div', 'graph-orbit__stage');
  const svg = svgEl('svg', {
    class: 'orbit-radar',
    viewBox: `0 0 ${ORBIT.size} ${ORBIT.size}`,
    role: 'img',
    'aria-label': 'Orbit view'
  });
  const gRings = svgEl('g', {}, svg);
  const gCol = svgEl('g', {}, svg);
  const gTrails = svgEl('g', {}, svg);
  const gBodies = svgEl('g', {}, svg);
  const gTop = svgEl('g', {}, svg);
  svgEl('circle', { cx: ORBIT.cx, cy: ORBIT.cy, r: ORBIT.core, fill: ORBIT_CORE_FILL }, gRings);
  svgEl('circle', { cx: ORBIT.cx, cy: ORBIT.cy, r: ORBIT.later, fill: 'none', stroke: ORBIT_LATER_STROKE, 'stroke-width': 22 }, gRings);
  for (const [days, label] of ORBIT.rings) {
    const r = radiusForDays(days);
    svgEl(
      'circle',
      { cx: ORBIT.cx, cy: ORBIT.cy, r, fill: 'none', stroke: ORBIT_RING_STROKE, 'stroke-dasharray': '2 6', 'stroke-linecap': 'round' },
      gRings
    );
    const t = svgEl('text', { class: 'or-ring__label', 'data-part': 'ring-label', x: ORBIT.cx, y: ORBIT.cy - r - 7, 'text-anchor': 'middle' }, gRings);
    t.textContent = label;
  }
  const laterLbl = svgEl(
    'text',
    { class: 'or-ring__label', 'data-part': 'ring-label', x: ORBIT.cx, y: ORBIT.cy - ORBIT.later - 16, 'text-anchor': 'middle' },
    gRings
  );
  laterLbl.textContent = 'Later';
  const today = svgEl('text', { class: 'or-today', x: ORBIT.cx, y: ORBIT.cy + 4, 'text-anchor': 'middle' }, gTop);
  today.textContent = 'Today';
  const selRing = svgEl('circle', { r: 0, fill: 'none', stroke: token('--wave', '#376fb7'), 'stroke-width': 2, opacity: 0 }, gTop);
  const collisionArc = svgEl(
    'path',
    {
      'data-part': 'collision-arc',
      fill: 'none',
      stroke: token('--high-sea-ink', '#a85a0c'),
      'stroke-width': 7,
      'stroke-linecap': 'round',
      opacity: 0
    },
    gCol
  );
  const pausedTag = el('div', 'or-paused-tag', 'Paused');
  const tip = el('div', 'or-tip');
  stage.append(svg, pausedTag, tip);

  const controls = el('div', 'graph-orbit__controls');
  const pause = el('button', 'btn btn--secondary graph-orbit__pause');
  pause.type = 'button';
  pause.setAttribute('aria-label', 'Pause orbit');
  const lookLabel = el('span', 'graph-orbit__look-label', 'Look ahead');
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '30';
  slider.className = 'hub-slider';
  slider.setAttribute('aria-label', 'Look ahead');
  const lookOut = el('span', 'graph-orbit__look', 'Today');
  const nowBtn = el('button', 'btn btn--ghost', 'Now');
  nowBtn.type = 'button';
  controls.append(pause, lookLabel, slider, lookOut, nowBtn);

  const panel = el('aside', 'graph-orbit__panel');
  panel.innerHTML = '<h3>Load this week</h3>';
  const load = el('div', 'graph-orbit__load');
  const notes = el('div', 'graph-orbit__notes');
  const legend = el('div', 'graph-orbit__legend');
  const foot = el('p', 'graph-loose-footer');
  panel.append(load, notes, legend);
  const left = el('div', 'graph-orbit__left');
  left.append(stage, controls, foot);
  root.append(left, panel);
  host.append(root);

  let input = first;
  let bodies: BodyRuntime[] = [];
  let paused = input.paused || input.reducedMotion;
  let hover: BodyRuntime | null = null;
  let lookAhead = input.lookAhead;
  let tweenFrom = lookAhead;
  let tweenStart = performance.now();
  let entrance = performance.now();
  let easeOut = paused ? 0 : 1;
  let raf = 0;
  let last = performance.now();
  let lastCommit = 0;
  let hidden = document.hidden;
  let pointerOver = false;
  svg.addEventListener('pointerenter', () => {
    pointerOver = true;
    easeOut = 0;
  });
  svg.addEventListener('pointerleave', () => {
    pointerOver = false;
    hover = null;
  });
  const io =
    typeof IntersectionObserver === 'function'
      ? new IntersectionObserver((entries) => {
          hidden = Boolean(entries[0] && !entries[0].isIntersecting);
        })
      : null;
  io?.observe(root);

  const datedTasks = () => input.tasks.filter((t) => t.due_date && t.status !== 'done' && t.status !== 'dead');

  const syncBodies = (): void => {
    const dated = datedTasks();
    const keep = new Set(dated.map((t) => t.id));
    bodies = bodies.filter((body) => {
      if (keep.has(body.task.id)) return true;
      body.el.remove();
      body.trail.remove();
      return false;
    });
    for (const task of dated) {
      if (bodies.some((b) => b.task.id === task.id)) {
        const row = bodies.find((b) => b.task.id === task.id)!;
        row.task = task;
        continue;
      }
      const trail = svgEl('path', { fill: 'none', 'stroke-linecap': 'round', opacity: ORBIT.trailOpacity, class: 'or-trail' }, gTrails);
      const g = svgEl(
        'g',
        { class: 'or-body-wrap', tabindex: '0', role: 'button', 'aria-label': task.title, 'data-task-id': task.id, 'data-body-id': task.id },
        gBodies
      );
      const effort = task.estimated_duration == null ? 1 : task.estimated_duration < 45 ? 1 : task.estimated_duration < 120 ? 2 : 3;
      const circle = svgEl(
        'circle',
        { r: bodySize(effort), stroke: '#fff', 'stroke-width': ORBIT.halo, class: 'or-body', 'data-part': 'orbit-body', 'data-task-id': task.id },
        g
      );
      const runtime: BodyRuntime = {
        task,
        angle: hashAngle(task.id),
        radius: ORBIT.rMax + 40,
        heat: 0,
        size: effort,
        days: 0,
        domain: task.domain,
        colour: domainMeta(task.domain).colour,
        el: g,
        circle,
        trail
      };
      g.addEventListener('click', () => input.onSelect(task.id));
      g.addEventListener('pointerenter', () => {
        hover = runtime;
        showTip(runtime);
      });
      g.addEventListener('pointerleave', () => {
        hover = null;
        tip.classList.remove('is-on');
      });
      g.addEventListener('focus', () => {
        hover = runtime;
        showTip(runtime);
      });
      g.addEventListener('blur', () => {
        hover = null;
        tip.classList.remove('is-on');
      });
      g.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') input.onSelect(task.id);
      });
      g.addEventListener('pointerdown', (event) => {
        if ((event as PointerEvent).metaKey) return;
        let days: number | null = null;
        const ghost = svgEl('text', { class: 'or-ring__label' }, svg);
        const move = (ev: PointerEvent) => {
          const rect = svg.getBoundingClientRect();
          const dx = ev.clientX - (rect.left + rect.width / 2);
          const dy = ev.clientY - (rect.top + rect.height / 2);
          const r = Math.sqrt(dx * dx + dy * dy);
          days = Math.max(0, Math.min(40, Math.round(((r - ORBIT.r0) / Math.max(1, ORBIT.rMax - ORBIT.r0)) * ORBIT.horizon)));
          ghost.setAttribute('x', String(((ev.clientX - rect.left) / rect.width) * ORBIT.size));
          ghost.setAttribute('y', String(((ev.clientY - rect.top) / rect.height) * ORBIT.size));
          ghost.textContent = `+${days} days`;
        };
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          ghost.remove();
          if (days == null) return;
          input.onReschedule(task.id, toDateKey(addDays(startOfDay(input.now), days)));
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      });
      bodies.push(runtime);
    }
  };

  const showTip = (b: BodyRuntime) => {
    const d = b.days;
    const when = d < 0 ? `${Math.abs(d)} days overdue` : d === 0 ? 'due today' : `due in ${d} days`;
    const meta = domainMeta(b.domain);
    tip.innerHTML = `<b>${b.task.title}</b><span>${meta.label} · ${when}</span>`;
    const box = svg.getBoundingClientRect();
    const sc = box.width / ORBIT.size;
    const x = Number(b.circle.getAttribute('cx')) * sc;
    const y = Number(b.circle.getAttribute('cy')) * sc;
    tip.style.left = `${Math.min(x + 14, box.width - 200)}px`;
    tip.style.top = `${y - 14}px`;
    tip.classList.add('is-on');
  };

  const paintPanel = (): void => {
    const domains = getTaskPropertiesSync().domains.filter((d) => ['teaching', 'professional', 'life', 'health'].includes(d.id));
    const list = domains.length ? domains : getTaskPropertiesSync().domains.slice(0, 4);
    const wk: Record<string, number> = {};
    for (const d of list) wk[d.id] = 0;
    for (const b of bodies) {
      if (b.days >= 0 && b.days <= 7) wk[b.domain] = (wk[b.domain] ?? 0) + 1;
    }
    const max = Math.max(...Object.values(wk), 1);
    load.replaceChildren();
    for (const d of list) {
      const row = el('div', '');
      row.dataset.part = 'load-row';
      const count = wk[d.id] ?? 0;
      row.innerHTML = `<span>${d.label}</span><div class="bar"><i style="width:${(count / max) * 100}%;background:${d.color ?? domainMeta(d.id).colour}"></i></div><span class="n">${count}</span>`;
      load.append(row);
    }
    notes.replaceChildren();
    const hits = collisions(datedTasks(), addDays(startOfDay(input.now), lookAhead), 7);
    const collisionInsight = input.insights.find((ins) => ins.view === 'orbit' && ins.id.startsWith('orbit-collision'));
    if (collisionInsight && hits[0]) {
      const note = el('div', '');
      note.dataset.part = 'clare-note';
      note.innerHTML = `<div class="note__head"><span class="graph-clare-alert__avatar">C</span>${collisionInsight.headline}</div><p>${collisionInsight.detail} <span>${hits[0].tasks.map((t) => t.title).join(', ')}</span></p>`;
      const row = el('div', 'row');
      const suggest = el('button', 'btn btn--primary', 'Suggest a move');
      suggest.type = 'button';
      suggest.addEventListener('click', () => input.onReviewInsight(collisionInsight.id));
      const dismiss = el('button', 'btn btn--ghost', 'Dismiss');
      dismiss.type = 'button';
      dismiss.addEventListener('click', () => input.onDismissInsight?.(collisionInsight.id));
      row.append(suggest, dismiss);
      note.append(row);
      notes.append(note);
    }
    const overdue = bodies.filter((b) => b.days < 0);
    if (overdue.length) {
      const note = el('div', 'is-danger');
      note.dataset.part = 'clare-note';
      note.innerHTML = `<div class="note__head"><span class="graph-clare-alert__avatar">C</span>${overdue.length} overdue</div><p>Spinning at the centre. <span>${overdue.map((b) => b.task.title).join(', ')}</span></p>`;
      notes.append(note);
    }
    legend.innerHTML =
      list.map((d) => `<span><i style="background:${d.color ?? domainMeta(d.id).colour}"></i>${d.label}</span>`).join('') +
      `<span><i style="background:${token('--danger', '#9b2c2c')}"></i>Closing in</span><span>Size = effort</span>`;
    const undated = input.tasks.filter((t) => !t.due_date && t.status !== 'done' && t.status !== 'dead');
    foot.innerHTML = undated.length ? `${undated.length} undated · <a href="#/list">Backlog</a>` : '';
  };

  const lookCopy = (days: number) => {
    if (!days) return 'Today';
    return `+${days} days · ${formatFriendlyDay(addDays(input.now, days))}`;
  };

  const applyPauseChrome = () => {
    pause.setAttribute('aria-pressed', String(paused));
    pause.innerHTML = `${paused ? PLAY_ICON : PAUSE_ICON}${paused ? 'Play' : 'Pause'}`;
    pausedTag.classList.toggle('is-on', paused);
  };

  const setPaused = (next: boolean) => {
    paused = next;
    if (paused) easeOut = 0;
    applyPauseChrome();
    input.onPauseChange(paused);
  };

  const frame = (now: number) => {
    const dt = Math.min(now - last, 50);
    last = now;
    const target = paused || hover || hidden || document.hidden || pointerOver ? 0 : 1;
    if (paused || pointerOver) easeOut = 0;
    else {
      easeOut += (target - easeOut) * Math.min(1, dt / 120);
      if (target === 0 && easeOut < 0.04) easeOut = 0;
    }
    if (target === 1 && easeOut > 0.96) easeOut = 1;
    const lt = input.reducedMotion ? 1 : Math.min(1, (now - tweenStart) / 250);
    const la = tweenFrom + (lookAhead - tweenFrom) * (1 - (1 - lt) ** 3);
    const ent = input.reducedMotion ? 1 : Math.min(1, (now - entrance) / 700);
    let sx = 0;
    let sy = 0;
    let collide: BodyRuntime[] = [];
    const dayBuckets = new Map<number, BodyRuntime[]>();
    const commit = easeOut === 0 || now - lastCommit >= 180;
    if (commit) lastCommit = now;
    for (const b of bodies) {
      const metrics = orbitBody(b.task, input.now, la);
      const days = metrics?.effectiveDays ?? 0;
      b.days = days;
      const targetR = radiusForDays(days);
      const k = heatForDays(days);
      b.heat = k;
      const stagger = Math.min(1, Math.max(0, ent * 1.4 - k * 0.4));
      const e = 1 - (1 - stagger) ** 3 * (1 - 0.12 * Math.sin(stagger * Math.PI));
      const r = ORBIT.rMax + 40 + (targetR - (ORBIT.rMax + 40)) * e;
      const w = omegaForRadius(r);
      if (!paused && !pointerOver && easeOut > 0) {
        b.angle += w * dt * easeOut;
        b.radius = r;
      } else if (!b.circle.hasAttribute('cx')) {
        b.radius = r;
      }
      const pt = bodyPoint(ORBIT.cx, ORBIT.cy, b.radius, b.angle);
      const col = heatColour(b.colour.startsWith('#') ? b.colour : '#376fb7', k);
      if (commit) {
        b.circle.setAttribute('cx', pt.x.toFixed(1));
        b.circle.setAttribute('cy', pt.y.toFixed(1));
      }
      b.circle.setAttribute('fill', col);
      b.circle.setAttribute('opacity', String(Math.min(1, stagger * 1.5)));
      b.trail.setAttribute('d', trailPath(ORBIT.cx, ORBIT.cy, r, b.angle, w));
      b.trail.setAttribute('stroke', col);
      b.trail.setAttribute('stroke-width', String(bodySize(b.size) * 0.8));
      if (input.search && !b.task.title.toLowerCase().includes(input.search.toLowerCase())) {
        b.el.style.opacity = '0.22';
      } else {
        b.el.style.opacity = b.task.id === input.selectedId ? '1' : '0.95';
      }
      if (days >= 0 && days <= 7) {
        const bucket = Math.round(days);
        const list = dayBuckets.get(bucket) ?? [];
        list.push(b);
        dayBuckets.set(bucket, list);
      }
    }
    const hit = [...dayBuckets.entries()].filter(([, list]) => list.length >= 3).sort((a, b) => b[1].length - a[1].length)[0];
    if (hit) {
      collide = hit[1];
      const r = radiusForDays(hit[0]);
      collide.forEach((b) => {
        sx += Math.cos(b.angle);
        sy += Math.sin(b.angle);
      });
      const mid = Math.atan2(sy, sx);
      const span = 0.35;
      const p0 = bodyPoint(ORBIT.cx, ORBIT.cy, r, mid - span);
      const p1 = bodyPoint(ORBIT.cx, ORBIT.cy, r, mid + span);
      collisionArc.setAttribute('d', `M${p0.x.toFixed(1)} ${p0.y.toFixed(1)}A${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`);
      collisionArc.setAttribute('opacity', input.reducedMotion ? '0.75' : String(0.55 + (0.3 * (1 + Math.sin(now / 480))) / 2));
    } else {
      collisionArc.setAttribute('opacity', '0');
    }
    const selected = bodies.find((b) => b.task.id === input.selectedId);
    if (selected) {
      selRing.setAttribute('cx', selected.circle.getAttribute('cx') ?? '0');
      selRing.setAttribute('cy', selected.circle.getAttribute('cy') ?? '0');
      selRing.setAttribute('r', String(bodySize(selected.size) + 6));
      selRing.setAttribute('opacity', '1');
    } else selRing.setAttribute('opacity', '0');
    raf = requestAnimationFrame(frame);
  };

  const paintChrome = () => {
    slider.value = String(lookAhead);
    lookOut.textContent = lookCopy(lookAhead);
    applyPauseChrome();
    syncBodies();
    paintPanel();
  };

  pause.addEventListener('click', () => setPaused(!paused));
  slider.addEventListener('input', () => {
    tweenFrom = lookAhead;
    tweenStart = performance.now();
    lookAhead = Number(slider.value);
    lookOut.textContent = lookCopy(lookAhead);
    input.onLookAhead(lookAhead);
    paintPanel();
  });
  nowBtn.addEventListener('click', () => {
    tweenFrom = lookAhead;
    tweenStart = performance.now();
    lookAhead = 0;
    slider.value = '0';
    lookOut.textContent = 'Today';
    input.onLookAhead(0);
    paintPanel();
  });
  const onVis = () => {
    hidden = document.hidden;
  };
  document.addEventListener('visibilitychange', onVis);

  paintChrome();
  raf = requestAnimationFrame(frame);

  return {
    root,
    update: (next) => {
      input = next;
      lookAhead = next.lookAhead;
      if (next.paused !== paused && next.reducedMotion) setPaused(true);
      paintChrome();
    },
    setLookAhead: (days) => {
      tweenFrom = lookAhead;
      tweenStart = performance.now();
      lookAhead = days;
      slider.value = String(days);
      lookOut.textContent = lookCopy(days);
      paintPanel();
    },
    setPaused,
    isPaused: () => paused,
    bodyPosition: (id) => {
      const body = bodies.find((item) => item.task.id === id);
      if (!body) return null;
      return bodyPoint(ORBIT.cx, ORBIT.cy, body.radius, body.angle);
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
