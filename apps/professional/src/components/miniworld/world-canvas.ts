/**
 * Miniworld canvas mount — render loop, hit-testing, hover, visibility pause.
 */

import type { HabitatType } from '@/domain/types';
import {
  animateTo,
  createCamera,
  fitTransform,
  focusOn,
  handleCameraKey,
  panBy,
  retainWorldCentre,
  sizeFactor,
  tickCameraAnim,
  toWorld,
  wheelZoom,
  zoomAt,
  zoomTarget,
  type CamAnim,
  type Camera,
  type FitRegion
} from './camera';
import {
  drawBuoy,
  drawCrab,
  drawCrabLod,
  drawPlant,
  drawSleep,
  drawSparkle
} from './creatures';
import { layoutCommunities, layoutOpenSea, type WorldLayout } from './layout';
import {
  HABITAT_LABELS,
  PLACE_MEANINGS,
  type Community,
  type Ecotone,
  type PersonState,
  type WorldApi,
  type WorldModel,
  buildWorldModel
} from './model';
import {
  HAB_COLORS,
  LABEL_AT,
  OUTER,
  drawDriftwood,
  drawRegionBody,
  drawSandbar,
  drawSea,
  drawShoal,
  makeSeaGlints,
  seedRegionTexture,
  strokeBlob,
  type RegionDrawState,
  type SeaGlint
} from './terrain';

export type MiniworldSelection =
  | { kind: 'person'; id: string }
  | { kind: 'community'; id: string }
  | { kind: 'ecotone'; id: string }
  | { kind: 'open-sea'; id: 'open-sea' }
  | null;

export interface MiniworldLayers {
  names: boolean;
  mycelium: boolean;
  opportunity: boolean;
  dormancy: boolean;
}

export interface WorldCanvasHandle {
  destroy(): void;
  setYear(year: number, isNow: boolean): void;
  setLayers(layers: Partial<MiniworldLayers>): void;
  setSelection(sel: MiniworldSelection): void;
  getModel(): WorldModel;
  focusRef(kind: 'person' | 'community' | 'ecotone' | 'open-sea', id: string): void;
  findMe(): void;
  showTheirWorld(personRef: string): void;
  clearDim(): void;
  fit(): void;
  resize(): void;
}

export interface WorldCanvasOptions {
  onSelect?: (sel: MiniworldSelection) => void;
  onHover?: (sel: MiniworldSelection, tip: string | null) => void;
  onModelChange?: (model: WorldModel) => void;
  reduceMotion?: boolean;
}

interface CreatureRuntime {
  ref: string;
  x: number;
  y: number;
  tx: number;
  ty: number;
  wait: number;
  phase: number;
  facing: number;
  speed: number;
  walking: boolean;
  dormant: boolean;
}

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function mountWorldCanvas(
  host: HTMLElement,
  api: WorldApi,
  options: WorldCanvasOptions = {}
): WorldCanvasHandle {
  const reduceMotion = options.reduceMotion ?? prefersReducedMotion();
  const today = new Date();
  let year = today.getUTCFullYear();
  let isNow = true;
  let layers: MiniworldLayers = {
    names: false,
    mycelium: false,
    opportunity: false,
    dormancy: false
  };
  let selection: MiniworldSelection = null;
  let dimBeyondHops: string | null = null; // person ref for 2-hop dim
  let model = buildWorldModel(api, year, today, { isNow });
  let layout: WorldLayout = layoutCommunities(api);

  const stage = document.createElement('div');
  stage.className = 'miniworld__stage';
  stage.tabIndex = 0;
  stage.setAttribute(
    'aria-label',
    'Network world map. Use plus and minus to zoom, arrow keys to move, 0 to fit. The Communities view lists the same information as text.'
  );

  const canvas = document.createElement('canvas');
  canvas.className = 'miniworld__canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Map of professional communities.');

  const tip = document.createElement('div');
  tip.className = 'miniworld__tip';
  tip.hidden = true;

  const zoom = document.createElement('div');
  zoom.className = 'miniworld__zoom';
  zoom.innerHTML = `
    <button type="button" data-z="in" aria-label="Zoom in">+</button>
    <button type="button" data-z="out" aria-label="Zoom out">−</button>
    <button type="button" data-z="fit" class="fit" aria-label="Fit whole world">FIT</button>
  `;

  const hint = document.createElement('div');
  hint.className = 'miniworld__hint';
  hint.textContent = 'Scroll to zoom · drag to move · click anything';

  stage.append(canvas, tip, zoom, hint);
  host.append(stage);

  const ctx = canvas.getContext('2d')!;
  let W = 800;
  let H = 600;
  let dpr = 1;
  const cam: Camera = createCamera();
  let camAnim: CamAnim | null = null;
  let fitted = false;
  const glints: SeaGlint[] = makeSeaGlints(99, 180);
  const creatures = new Map<string, CreatureRuntime>();
  const regions = new Map<string, RegionDrawState & { rTarget: number; label: string }>();
  const openSeaPos = new Map<string, { x: number; y: number }>();
  const buoyPos = new Map<string, { x: number; y: number; personRef: string }>();
  let destroyed = false;
  let raf = 0;
  let lastT = performance.now();
  let dragging = false;
  let lastPtr: { x: number; y: number } | null = null;
  let hover: MiniworldSelection = null;

  function rebuildRegions(): void {
    regions.clear();
    for (const c of model.communities) {
      const pos = layout.communities.find((p) => p.id === c.id);
      if (!pos) continue;
      const seed = mulberry32(hash(c.id));
      const { tex, reefTex } = seedRegionTexture(c.habitat, seed);
      const existing = regions.get(c.id);
      regions.set(c.id, {
        cx: pos.x,
        cy: pos.y,
        rCur: existing?.rCur ?? 0,
        rTarget: pos.radius,
        habitat: c.habitat,
        s1: seed() * 6,
        s2: seed() * 6,
        s3: seed() * 6,
        tex,
        reefTex,
        label: c.label
      });
    }
  }

  function rebuildOpenSea(): void {
    openSeaPos.clear();
    buoyPos.clear();
    const placed = layoutOpenSea(
      model.openSea.people,
      layout.bounds,
      model.openSea.buoys.map((b) => ({ orgRef: b.ref, personRef: b.personRef! }))
    );
    for (const p of placed.people) openSeaPos.set(p.ref, { x: p.x, y: p.y });
    for (const b of placed.buoys) buoyPos.set(b.ref, { x: b.x, y: b.y, personRef: b.personRef });
  }

  function regionPoint(
    r: { cx: number; cy: number; rTarget: number; habitat: HabitatType; s1: number; s2: number; s3: number },
    frMax: number,
    rng: () => number
  ): [number, number] {
    const a = rng() * Math.PI * 2;
    const f = Math.sqrt(rng()) * frMax;
    const amp = r.habitat === 'savannah' ? 0.13 : r.habitat === 'island' ? 0.07 : 0.09;
    const blob =
      1 +
      amp * (0.5 * Math.sin(3 * a + r.s1) + 0.35 * Math.sin(5 * a + r.s2) + 0.4 * Math.sin(2 * a + r.s3));
    const R = r.rTarget || 40;
    return [r.cx + Math.cos(a) * R * blob * f, r.cy + Math.sin(a) * R * blob * f];
  }

  function syncCreatures(): void {
    const now = performance.now();
    const visible = new Set(model.people.filter((p) => p.present).map((p) => p.ref));
    for (const id of [...creatures.keys()]) {
      if (!visible.has(id)) creatures.delete(id);
    }
    for (const p of model.people) {
      if (!p.present) continue;
      let c = creatures.get(p.ref);
      const rng = mulberry32(hash(p.ref + String(year)));
      if (!c) {
        let x = 0;
        let y = 0;
        if (p.homeIds.length) {
          const home = regions.get(p.homeIds[0]);
          if (home) [x, y] = regionPoint(home, 0.7, rng);
        } else {
          const sea = openSeaPos.get(p.ref);
          if (sea) {
            x = sea.x;
            y = sea.y;
          }
        }
        c = {
          ref: p.ref,
          x,
          y,
          tx: x,
          ty: y,
          wait: rng() * 3,
          phase: rng() * 6,
          facing: rng() < 0.5 ? -1 : 1,
          speed: 9 + rng() * 6,
          walking: false,
          dormant: false
        };
        creatures.set(p.ref, c);
      }
      const dormant = layers.dormancy && isNow && p.quiet;
      if (dormant && !c.dormant && p.homeIds[0]) {
        const home = regions.get(p.homeIds[0]);
        if (home) {
          const a = rng() * Math.PI * 2;
          c.tx = home.cx + Math.cos(a) * home.rTarget * 0.78;
          c.ty = home.cy + Math.sin(a) * home.rTarget * 0.78;
          c.wait = 0;
        }
      }
      c.dormant = dormant;
      if (reduceMotion) {
        c.x = c.tx;
        c.y = c.ty;
      }
      void now;
    }
  }

  function pickTarget(c: CreatureRuntime): void {
    const person = model.people.find((p) => p.ref === c.ref);
    if (!person || c.dormant) return;
    const rng = mulberry32(hash(c.ref + String(Math.floor(c.phase * 10))));
    const homes = person.homeIds;
    if (homes.length > 1 && rng() < 0.45) {
      const [a, b] = [...homes].sort();
      const eco = model.ecotones.find((e) => e.key === `${a}|${b}`);
      if (eco) {
        const A = regions.get(a);
        const B = regions.get(b);
        if (A && B) {
          c.tx = (A.cx + B.cx) / 2 + (rng() - 0.5) * 50;
          c.ty = (A.cy + B.cy) / 2 + (rng() - 0.5) * 34;
          return;
        }
      }
    }
    if (homes.length) {
      const home = regions.get(homes[Math.floor(rng() * homes.length)]);
      if (home) {
        const [x, y] = regionPoint(home, 0.74, rng);
        c.tx = x;
        c.ty = y;
        return;
      }
    }
    const sea = openSeaPos.get(c.ref);
    if (sea) {
      c.tx = sea.x + (rng() - 0.5) * 30;
      c.ty = sea.y + (rng() - 0.5) * 30;
    }
  }

  function rebuildModel(): void {
    model = buildWorldModel(api, year, today, { isNow });
    rebuildRegions();
    rebuildOpenSea();
    syncCreatures();
    options.onModelChange?.(model);
  }

  function fitRegions(): FitRegion[] {
    return [...regions.values()].map((r) => ({
      cx: r.cx,
      cy: r.cy,
      rTarget: r.rTarget,
      habitat: r.habitat
    }));
  }

  function doFit(animate = true): void {
    const target = fitTransform(W, H, fitRegions());
    if (animate) camAnim = animateTo(cam, target, reduceMotion, performance.now());
    else {
      cam.k = target.k;
      cam.x = target.x;
      cam.y = target.y;
    }
    fitted = true;
  }

  function resize(): void {
    const rect = stage.getBoundingClientRect();
    if (!rect.width) return;
    const prevW = W;
    const prevH = H;
    W = rect.width;
    H = rect.height;
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    if (fitted && prevW && prevH) retainWorldCentre(cam, prevW, prevH, W, H);
    else doFit(false);
  }

  function shellColors(person: PersonState): string[] {
    if (person.isSelf) return ['#17375e'];
    if (!person.homeIds.length) return [HAB_COLORS.savannah.shell];
    return person.homeIds.map((id) => {
      const c = model.communities.find((x) => x.id === id);
      return HAB_COLORS[c?.habitat ?? 'savannah'].shell;
    });
  }

  function hopSet(centerRef: string, hops: number): Set<string> {
    const adj = new Map<string, Set<string>>();
    for (const link of api.links ?? []) {
      if (link.status !== 'current' && link.status !== 'ended') continue;
      if (!adj.has(link.source_ref)) adj.set(link.source_ref, new Set());
      if (!adj.has(link.target_ref)) adj.set(link.target_ref, new Set());
      adj.get(link.source_ref)!.add(link.target_ref);
      adj.get(link.target_ref)!.add(link.source_ref);
    }
    const reached = new Set<string>([centerRef]);
    let frontier = [centerRef];
    for (let i = 0; i < hops; i += 1) {
      const next: string[] = [];
      for (const cur of frontier) {
        for (const n of adj.get(cur) ?? []) {
          if (!reached.has(n)) {
            reached.add(n);
            next.push(n);
          }
        }
      }
      frontier = next;
    }
    return reached;
  }

  function drawFrame(t: number): void {
    const sf = sizeFactor(cam.k);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const seaGrad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.8);
    seaGrad.addColorStop(0, '#bfdae3');
    seaGrad.addColorStop(1, '#a4c3d3');
    ctx.fillStyle = seaGrad;
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(dpr * cam.k, 0, 0, dpr * cam.k, dpr * cam.x, dpr * cam.y);

    const live = [...regions.values()].filter((r) => r.rCur >= 2);
    for (const r of live) {
      const o = OUTER[r.habitat];
      strokeBlob(ctx, r, o * 1.28, 'rgba(255,255,255,0.16)', 1);
      strokeBlob(ctx, r, o * 1.6, 'rgba(255,255,255,0.1)', 1);
    }
    drawSea(ctx, t, reduceMotion, glints);

    ctx.globalAlpha = layers.mycelium ? 0.4 : 1;

    // Sandbars water layer
    for (const eco of model.ecotones) {
      const A = regions.get(eco.a);
      const B = regions.get(eco.b);
      if (!A || !B || A.rCur < 2 || B.rCur < 2) continue;
      drawSandbar(ctx, A, B, eco.people.length, 'water');
    }
    for (const step of model.steppingStones) {
      const A = regions.get(step.a);
      const B = regions.get(step.b);
      if (!A || !B || A.rCur < 2 || B.rCur < 2) continue;
      drawShoal(ctx, A, B, step.linkCount, 'water');
    }

    const pale =
      layers.dormancy && isNow
        ? (c: Community) => 1 - 0.45 * (c.stats.quietCount / Math.max(1, c.stats.memberCount))
        : () => 1;

    for (const c of model.communities) {
      const r = regions.get(c.id);
      if (!r || r.rCur < 2) continue;
      ctx.globalAlpha = (layers.mycelium ? 0.4 : 1) * pale(c);
      drawRegionBody(ctx, r, t, reduceMotion);
    }
    ctx.globalAlpha = layers.mycelium ? 0.4 : 1;

    for (const eco of model.ecotones) {
      const A = regions.get(eco.a);
      const B = regions.get(eco.b);
      if (!A || !B || A.rCur < 2 || B.rCur < 2) continue;
      drawSandbar(ctx, A, B, eco.people.length, 'land');
    }
    for (const step of model.steppingStones) {
      const A = regions.get(step.a);
      const B = regions.get(step.b);
      if (!A || !B || A.rCur < 2 || B.rCur < 2) continue;
      drawShoal(ctx, A, B, step.linkCount, 'land');
    }

    // Plants on sandbars
    for (const eco of model.ecotones) {
      const A = regions.get(eco.a);
      const B = regions.get(eco.b);
      if (!A || !B) continue;
      const mx = (A.cx + B.cx) / 2;
      const my = (A.cy + B.cy) / 2;
      const opp =
        layers.opportunity &&
        model.upcomingEvents.some((ev) => ev.attendee_refs.some((r) => eco.people.includes(r)));
      drawPlant(ctx, mx, my, eco.people.length, sf, t, {
        badge: true,
        opp,
        reduceMotion
      });
    }

    ctx.globalAlpha = 1;

    // Mycelium: every recorded person↔person tie, drawn fine and quiet
    // between the two creatures, plus a dotted thread from each person to
    // their home island. Follows the creatures as they wander.
    if (layers.mycelium) {
      ctx.save();
      ctx.strokeStyle = 'rgba(23,55,94,0.45)';
      ctx.lineWidth = 1.1 * sf;
      for (const thread of model.threads) {
        const ca = creatures.get(thread.a);
        const cb = creatures.get(thread.b);
        if (!ca || !cb) continue;
        const mx = (ca.x + cb.x) / 2;
        const my = (ca.y + cb.y) / 2;
        const dx = cb.x - ca.x;
        const dy = cb.y - ca.y;
        ctx.beginPath();
        ctx.moveTo(ca.x, ca.y);
        ctx.quadraticCurveTo(mx - dy * 0.15, my + dx * 0.15, cb.x, cb.y);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(122,80,56,0.28)';
      ctx.lineWidth = 0.9 * sf;
      ctx.setLineDash([2 * sf, 3 * sf]);
      for (const person of model.people) {
        if (!person.present || !person.homeIds.length) continue;
        const c = creatures.get(person.ref);
        const home = regions.get(person.homeIds[0]);
        if (!c || !home || home.rCur < 2) continue;
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(home.cx, home.cy);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Open sea at low zoom: aggregate dots
    if (cam.k < 0.6 && model.openSea.people.length) {
      const pts = [...openSeaPos.values()];
      if (pts.length) {
        let sx = 0;
        let sy = 0;
        for (const p of pts) {
          sx += p.x;
          sy += p.y;
        }
        sx /= pts.length;
        sy /= pts.length;
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        for (const p of pts.slice(0, 40)) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
        haloText(`Open sea · ${model.openSea.people.length} people`, sx, sy - 18, `600 ${12 / cam.k}px Inter, sans-serif`, '#17375e');
      }
    }

    const dimSet = dimBeyondHops ? hopSet(dimBeyondHops, 2) : null;
    const showNames = layers.names || cam.k >= 1.6;
    const fullNames = layers.names || cam.k >= 2.2;

    for (const person of model.people) {
      if (!person.present) continue;
      const c = creatures.get(person.ref);
      if (!c) continue;
      const inView = true; // could clip; keep simple
      if (!inView) continue;
      const alpha = dimSet && !dimSet.has(person.ref) ? 0.18 : 1;
      ctx.globalAlpha = alpha;
      if (!person.homeIds.length && cam.k >= 0.6) {
        drawDriftwood(ctx, c.x, c.y + 6 * sf, sf);
      }
      const shells = shellColors(person);
      if (cam.k < 0.6) {
        drawCrabLod(ctx, c.x, c.y, 7 * sf, shells, c.dormant);
      } else {
        drawCrab(ctx, c.x, c.y, 7 * sf, {
          facing: c.facing,
          walking: c.walking,
          dormant: c.dormant,
          phase: c.phase,
          shells,
          spiral: person.isSelf ? '#f1e2b6' : undefined
        });
      }
      if (c.dormant) drawSleep(ctx, c.x, c.y, 7 * sf, t, reduceMotion);
      if (person.isNew) drawSparkle(ctx, c.x + 8 * sf, c.y - 10 * sf, 6 * sf, t, reduceMotion);
      const hoverOrForce =
        (hover?.kind === 'person' && hover.id === person.ref) ||
        (selection?.kind === 'person' && selection.id === person.ref);
      if ((showNames || hoverOrForce) && cam.k >= 0.55) {
        let label = person.displayName;
        if (person.isSelf && cam.k >= 0.55) label = 'You';
        else if (!fullNames && !hoverOrForce) label = person.displayName.split(/\s+/)[0] ?? person.displayName;
        haloText(label, c.x, c.y - 14 * sf, `600 ${11 / Math.sqrt(cam.k)}px Inter, sans-serif`, '#13233a');
      }
      ctx.globalAlpha = 1;
    }

    for (const [ref, pos] of buoyPos) {
      drawBuoy(ctx, pos.x, pos.y, sf);
      void ref;
    }

    // Community labels
    for (const c of model.communities) {
      const r = regions.get(c.id);
      if (!r || r.rCur < 2) continue;
      const at = LABEL_AT[r.habitat];
      const ly = r.cy - r.rCur * at - 8;
      haloText(c.label, r.cx, ly, `700 ${13 / Math.sqrt(cam.k)}px Inter, sans-serif`, HAB_COLORS[r.habitat].edge);
      if (cam.k >= 1.2) {
        haloText(
          HABITAT_LABELS[r.habitat],
          r.cx,
          ly + 14 / cam.k,
          `500 ${10 / Math.sqrt(cam.k)}px Inter, sans-serif`,
          '#6b7788'
        );
      }
    }
  }

  function haloText(text: string, x: number, y: number, font: string, color: string): void {
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(251,248,242,0.92)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.textAlign = 'left';
  }

  function hitTest(sx: number, sy: number): MiniworldSelection {
    const [wx, wy] = toWorld(cam, sx, sy);
    const hitR = 14 / cam.k;
    for (const person of model.people) {
      if (!person.present) continue;
      const c = creatures.get(person.ref);
      if (!c) continue;
      if (Math.hypot(c.x - wx, c.y - wy) < hitR) return { kind: 'person', id: person.ref };
    }
    for (const eco of model.ecotones) {
      const A = regions.get(eco.a);
      const B = regions.get(eco.b);
      if (!A || !B) continue;
      const mx = (A.cx + B.cx) / 2;
      const my = (A.cy + B.cy) / 2;
      if (Math.hypot(mx - wx, my - wy) < 18 / cam.k) return { kind: 'ecotone', id: eco.key };
    }
    for (const c of model.communities) {
      const r = regions.get(c.id);
      if (!r) continue;
      if (Math.hypot(r.cx - wx, r.cy - wy) < r.rCur * 0.95) return { kind: 'community', id: c.id };
    }
    return null;
  }

  function tipFor(sel: MiniworldSelection): string | null {
    if (!sel) return null;
    if (sel.kind === 'person') {
      const p = model.people.find((x) => x.ref === sel.id);
      return p?.displayName ?? null;
    }
    if (sel.kind === 'community') {
      const c = model.communities.find((x) => x.id === sel.id);
      if (!c) return null;
      return `${c.label}\n${PLACE_MEANINGS[c.habitat]}`;
    }
    if (sel.kind === 'ecotone') {
      const e = model.ecotones.find((x) => x.key === sel.id);
      if (!e) return null;
      return `Mangrove sandbar · ${e.people.length} ${e.people.length === 1 ? 'person' : 'people'}`;
    }
    return PLACE_MEANINGS['open-sea'];
  }

  function update(dt: number, t: number): void {
    if (camAnim) {
      if (tickCameraAnim(cam, camAnim, t)) camAnim = null;
    }
    for (const r of regions.values()) {
      r.rCur += (r.rTarget - r.rCur) * Math.min(1, dt * 2.5);
      if (reduceMotion) r.rCur = r.rTarget;
    }
    if (reduceMotion) return;
    for (const c of creatures.values()) {
      c.walking = false;
      if (c.wait > 0) {
        c.wait -= dt;
        continue;
      }
      const dx = c.tx - c.x;
      const dy = c.ty - c.y;
      const d = Math.hypot(dx, dy);
      if (d < 1.5) {
        if (c.dormant) {
          c.wait = 9999;
          continue;
        }
        c.wait = 2 + (hash(c.ref) % 500) / 100;
        pickTarget(c);
        continue;
      }
      const step = Math.min(d, c.speed * (c.dormant ? 0.5 : 1) * dt);
      c.x += (dx / d) * step;
      c.y += (dy / d) * step;
      if (Math.abs(dx) > 0.5) c.facing = dx < 0 ? -1 : 1;
      c.phase += dt * 9;
      c.walking = true;
    }
  }

  function loop(now: number): void {
    if (destroyed) return;
    if (document.hidden) {
      raf = requestAnimationFrame(loop);
      lastT = now;
      return;
    }
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    update(dt, now);
    drawFrame(now);
    raf = requestAnimationFrame(loop);
  }

  // Events
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    camAnim = null;
    const rect = canvas.getBoundingClientRect();
    wheelZoom(cam, e.clientX - rect.left, e.clientY - rect.top, e.deltaY);
  };
  const onPointerDown = (e: PointerEvent) => {
    stage.focus();
    dragging = true;
    lastPtr = { x: e.clientX, y: e.clientY };
    canvas.classList.add('is-dragging');
    canvas.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    if (dragging && lastPtr) {
      panBy(cam, e.clientX - lastPtr.x, e.clientY - lastPtr.y);
      lastPtr = { x: e.clientX, y: e.clientY };
      return;
    }
    const hit = hitTest(sx, sy);
    hover = hit;
    canvas.classList.toggle('is-over', Boolean(hit));
    const text = tipFor(hit);
    if (text) {
      tip.hidden = false;
      tip.textContent = text;
      tip.style.left = `${sx + 12}px`;
      tip.style.top = `${sy + 12}px`;
    } else tip.hidden = true;
    options.onHover?.(hit, text);
  };
  const onPointerUp = (e: PointerEvent) => {
    if (dragging && lastPtr) {
      const moved = Math.hypot(e.clientX - lastPtr.x, e.clientY - lastPtr.y);
      if (moved < 4) {
        const rect = canvas.getBoundingClientRect();
        const hit = hitTest(e.clientX - rect.left, e.clientY - rect.top);
        selection = hit;
        options.onSelect?.(hit);
      }
    }
    dragging = false;
    lastPtr = null;
    canvas.classList.remove('is-dragging');
  };
  const onKey = (e: KeyboardEvent) => {
    const result = handleCameraKey(e.key, cam, W, H);
    if (result.kind === 'none') return;
    e.preventDefault();
    if (result.kind === 'fit') doFit(true);
    else if (result.kind === 'escape') {
      selection = null;
      dimBeyondHops = null;
      options.onSelect?.(null);
    } else if (result.kind === 'zoom') {
      camAnim = animateTo(cam, zoomTarget(cam, W, H, result.factor), reduceMotion, performance.now(), 280);
    } else if (result.kind === 'handled' && result.clearAnim) {
      camAnim = null;
    }
  };

  zoom.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('button');
    if (!btn) return;
    const z = btn.getAttribute('data-z');
    if (z === 'fit') doFit(true);
    else if (z === 'in') camAnim = animateTo(cam, zoomTarget(cam, W, H, 1.25), reduceMotion, performance.now(), 280);
    else if (z === 'out') camAnim = animateTo(cam, zoomTarget(cam, W, H, 1 / 1.25), reduceMotion, performance.now(), 280);
  });

  // Safari pinch
  const onGesture = (e: Event) => {
    e.preventDefault();
    const ge = e as Event & { scale?: number; clientX?: number; clientY?: number };
    if (typeof ge.scale === 'number' && ge.scale !== 1) {
      const rect = canvas.getBoundingClientRect();
      zoomAt(cam, (ge.clientX ?? rect.width / 2) - rect.left, (ge.clientY ?? rect.height / 2) - rect.top, ge.scale);
    }
  };

  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  stage.addEventListener('keydown', onKey);
  stage.addEventListener('gesturestart', onGesture as EventListener, { passive: false } as AddEventListenerOptions);
  stage.addEventListener('gesturechange', onGesture as EventListener, { passive: false } as AddEventListenerOptions);
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => resize()) : null;
  ro?.observe(stage);

  rebuildModel();
  resize();
  doFit(false);
  raf = requestAnimationFrame(loop);

  return {
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      stage.removeEventListener('keydown', onKey);
      host.replaceChildren();
    },
    setYear(y, nowFlag) {
      year = y;
      isNow = nowFlag;
      rebuildModel();
    },
    setLayers(partial) {
      layers = { ...layers, ...partial };
      syncCreatures();
    },
    setSelection(sel) {
      selection = sel;
    },
    getModel() {
      return model;
    },
    focusRef(kind, id) {
      if (kind === 'person') {
        const c = creatures.get(id);
        if (c) camAnim = focusOn(cam, W, H, c.x, c.y, reduceMotion);
      } else if (kind === 'community') {
        const r = regions.get(id);
        if (r) camAnim = focusOn(cam, W, H, r.cx, r.cy, reduceMotion);
      } else if (kind === 'ecotone') {
        const eco = model.ecotones.find((e) => e.key === id);
        if (eco) {
          const A = regions.get(eco.a);
          const B = regions.get(eco.b);
          if (A && B) camAnim = focusOn(cam, W, H, (A.cx + B.cx) / 2, (A.cy + B.cy) / 2, reduceMotion);
        }
      } else {
        doFit(true);
      }
    },
    findMe() {
      const me = model.people.find((p) => p.isSelf);
      if (!me) return;
      dimBeyondHops = me.ref;
      this.focusRef('person', me.ref);
    },
    showTheirWorld(personRef) {
      dimBeyondHops = personRef;
      this.focusRef('person', personRef);
    },
    clearDim() {
      dimBeyondHops = null;
    },
    fit: () => doFit(true),
    resize
  };
}

export type { Ecotone };
