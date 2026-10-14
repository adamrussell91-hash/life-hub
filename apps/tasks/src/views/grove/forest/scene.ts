/**
 * Grove's forest: one continuous island for the year, built week by week from finished work.
 * Each week is a jigsaw piece; every finished task is a tree (nothing dies); earned wildlife roams it.
 * Mounted by the Grove page with real history, and by /grove-lookdev.html with synthetic history.
 */
import {
  BufferGeometry, Color, DirectionalLight, Float32BufferAttribute, Fog, Group, HemisphereLight,
  InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, MOUSE, Object3D, OrthographicCamera, PCFSoftShadowMap, Quaternion,
  NeutralToneMapping, BoxGeometry, IcosahedronGeometry, MeshBasicMaterial, Raycaster, Scene, SRGBColorSpace, TOUCH, Vector2, Vector3, WebGLRenderer, DoubleSide
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BOUNDS, buildCells, buildTerrain, land, owner } from './map';
import { weekOfDay, weekRange, type Done } from './history';
import { plant, type Placed } from './planting';
import { fbm, lerp, smoothstep } from './noise';
import { createForestAnimals, type ForestAnimal } from './animals';

export type { ForestAnimal } from './animals';
export type ForestState = { year: number; week: number | null; from?: Date; to?: Date; trees: number; future: boolean; builtWeeks: number; animals: number };
export type ForestPick =
  | { kind: 'tree'; id: string; title: string; species: Done['species']; completed: Date; late: boolean }
  | { kind: 'animal'; animal: ForestAnimal };
export type ForestOptions = {
  year: number;
  today: Date;
  history: Done[];
  animals?: ForestAnimal[];
  /** False for a still picture (Home's preview): no panning, zooming or picking. Default true. */
  interactive?: boolean;
  /** Open on this week straight away, without the camera move. */
  week?: number;
  /** Map units an opened week spans on screen (default 40 on a phone, 58 wider). */
  weekSpan?: number;
  /** Pixels at the top of the stage covered by floating controls; an opened week centres below them. */
  topInset?: () => number;
  onChange?: (state: ForestState) => void;
  onPick?: (pick: ForestPick | null, x: number, y: number) => void;
  /** The camera started or stopped following an animal (stops when the map is dragged away). */
  onFollow?: (animal: ForestAnimal | null) => void;
};
export type ForestAnimalEntry = { key: number; animal: ForestAnimal; young: boolean; visible: boolean };
export type ForestHandle = { expand(week: number): void; showYear(): void; dispose(): void; state(): ForestState;
  /** Turn the view about its centre (radians; positive turns the island clockwise). */
  rotate(by: number): void;
  /** The animals out in the forest, for the animal tray. */
  animals(): ForestAnimalEntry[];
  /** Keep an animal in the middle of the view as it moves; null stops. */
  follow(key: number | null): void;
  /** For check scripts: where each animal is, and a way to run their clock on (seconds, in 1/30 s steps). */
  wildlife(): unknown[]; stepWildlife(seconds: number): void };

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export async function mountForest(stage: HTMLElement, options: ForestOptions): Promise<ForestHandle> {
const { year, today, history } = options;
const builtWeeks = today.getUTCFullYear() > year ? 52 : today.getUTCFullYear() < year ? 0 : weekOfDay(dayKey(today), year);
const cells = buildCells();
const terrain = buildTerrain(cells, builtWeeks);
const planting = plant(cells, terrain, history, builtWeeks, today);
// Nothing dies: every finished task this year must have its tree.
const planted = new Set(planting.trees.map((t) => t.id));
const dropped = history.filter((d) => d.week >= 1 && d.week <= 52 && !planted.has(d.id)).length;
if (dropped) console.error(`Grove: ${dropped} finished tasks have no tree`);
stage.dataset.dropped = String(dropped);
let disposed = false;

// ---------- Renderer, light ----------
const renderer = new WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.outputColorSpace = SRGBColorSpace;
// Neutral keeps Forest Island's saturated yellow-greens; ACES pushed them towards olive.
renderer.toneMapping = NeutralToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFSoftShadowMap;
stage.append(renderer.domElement);

const scene = new Scene();
// Soft sky above, warm grass bounce below, a low warm sun: bright diorama light, no black shade.
scene.add(new HemisphereLight('#dff3ff', '#d8d6a6', 1.9));
const sun = new DirectionalLight('#fff3d6', 2.6);
sun.position.set(-70, 140, 60);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -130, right: 130, top: 130, bottom: -130, near: 10, far: 400 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
// Light aerial haze: the far rim and cliff feet fade towards the sky, near edges stay crisp.
scene.fog = new Fog('#d4eef2', 420, 1000);

// ---------- Ground ----------
const C = {
  grass: new Color('#8ccf4a'), grassLight: new Color('#b6e15a'), grassDeep: new Color('#6cbd3e'),
  floor: new Color('#58a336'), meadow: new Color('#d3e57e'), sand: new Color('#f1e3b0'),
  path: new Color('#e0be82'), cliff: new Color('#f7f1e3'), bank: new Color('#ead9a8'), strata: new Color('#e6d9bd'), bed: new Color('#5cc6b8')
};
// Grid vertices are nudged off their lattice, so shores, path edges and week borders come out as
// irregular facets rather than straight saw-tooth runs along the grid.
const STEP = 1.2;
const jitter = (i: number, j: number, k: number) => { const s = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453; return s - Math.floor(s) - 0.5; };
function buildGround(): Mesh {
  const positions: number[] = [], colors: number[] = [], weeks: number[] = [];
  const nx = Math.ceil((BOUNDS.halfW * 2) / STEP), nz = Math.ceil((BOUNDS.halfD * 2) / STEP);
  const xs: number[] = [], zs: number[] = [], heights: number[] = [];
  for (let j = 0; j <= nz; j += 1) for (let i = 0; i <= nx; i += 1) {
    const x = -BOUNDS.halfW + i * STEP + (i > 0 && i < nx ? jitter(i, j, 1) * STEP * 0.7 : 0);
    const z = -BOUNDS.halfD + j * STEP + (j > 0 && j < nz ? jitter(i, j, 2) * STEP * 0.7 : 0);
    xs.push(x); zs.push(z); heights.push(terrain.height(x, z));
  }
  const at = (i: number, j: number) => j * (nx + 1) + i;
  const colour = new Color();
  const tint = (x: number, z: number, y: number, slope: number) => {
    if (slope > 1.6 || y < -2) {
      colour.copy(C.cliff).lerp(C.strata, (Math.sin(y * 1.7) * 0.5 + 0.5) * 0.6);
      return;
    }
    const n = fbm(x * 0.05, z * 0.05, 11);
    colour.copy(C.grassDeep).lerp(C.grass, smoothstep(0.3, 0.5, n)).lerp(C.grassLight, smoothstep(0.55, 0.75, n));
    const own = owner(cells, x, z);
    const week = cells[own.cell]!.week;
    if (week == null || week > builtWeeks) colour.lerp(C.meadow, 0.4);
    colour.lerp(C.floor, planting.density(x, z) * 0.75);
    // Terrace risers inside the map: a creamy earth bank, so each step reads as a little cliff.
    if (slope > 0.35) colour.lerp(C.bank, smoothstep(0.35, 0.95, slope) * 0.85);
    // Path and sand edges wander a little, as worn ground and beaches do.
    const p = terrain.pathDistance(x, z) + (fbm(x * 0.21, z * 0.21, 15) - 0.5) * 1.4;
    if (p < 1.6) colour.lerp(C.path, smoothstep(1.6, 0.6, p));
    const r = terrain.riverDistance(x, z);
    const shore = Math.min(r.d - terrain.RIVER_WIDTH, terrain.lakeDistance(x, z));
    const beach = shore + (fbm(x * 0.17, z * 0.17, 19) - 0.5) * 2.2;
    if (beach < 2.2) colour.lerp(C.sand, smoothstep(2.2, 0.4, beach));
    if (shore < 0) colour.copy(C.bed);
  };
  for (let j = 0; j < nz; j += 1) for (let i = 0; i < nx; i += 1) {
    // Alternate the diagonal, so no long straight seam runs across the map.
    const quad = (i + j) % 2
      ? [[i, j], [i, j + 1], [i + 1, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]] as const
      : [[i, j], [i, j + 1], [i + 1, j + 1], [i, j], [i + 1, j + 1], [i + 1, j]] as const;
    for (let t = 0; t < 2; t += 1) {
      const tri = quad.slice(t * 3, t * 3 + 3).map(([a, b]) => at(a, b));
      const ys = tri.map((k) => heights[k]!);
      if (ys.every((y) => y <= -8.9)) continue;
      const cx = tri.reduce((s, k) => s + xs[k]!, 0) / 3, cz = tri.reduce((s, k) => s + zs[k]!, 0) / 3;
      // Bed well inside the river or lake is hidden under opaque water: don't draw it.
      if (Math.min(terrain.riverDistance(cx, cz).d - terrain.RIVER_WIDTH, terrain.lakeDistance(cx, cz)) < 0 && land(cx, cz) > 3) continue;
      const cy = ys.reduce((s, y) => s + y, 0) / 3;
      const slope = (Math.max(...ys) - Math.min(...ys)) / STEP;
      tint(cx, cz, cy, slope);
      const week = cells[owner(cells, cx, cz).cell]!.index;
      tri.forEach((k, v) => {
        positions.push(xs[k]!, ys[v]!, zs[k]!);
        colors.push(colour.r, colour.g, colour.b);
        weeks.push(week);
      });
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setAttribute('aCell', new Float32BufferAttribute(weeks, 1));
  geometry.computeVertexNormals();
  const material = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSelected = selection;
    shader.vertexShader = 'attribute float aCell;\nvarying float vCell;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvCell = aCell;');
    shader.fragmentShader = 'uniform float uSelected;\nvarying float vCell;\n' + shader.fragmentShader.replace(
      '#include <color_fragment>',
      '#include <color_fragment>\nif (uSelected >= 0.0 && abs(vCell - uSelected) > 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.33))), 0.55) * 0.82;'
    );
  };
  const mesh = new Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}
const selection = { value: -1 };
const ground = buildGround();
scene.add(ground);

// ---------- Water: stepped river with little falls, and a still lake ----------
function buildWater(): Group {
  const group = new Group();
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.0, side: DoubleSide });
  const positions: number[] = [], colors: number[] = [];
  const deep = new Color('#2fb3c6'), foam = new Color('#f2fdff');
  const pts = terrain.river;
  // Wide enough to tuck under the meandering bank (map.ts), so the bank, not the ribbon, draws the shore.
  const w = terrain.RIVER_WIDTH + 1.8;
  const first = pts.findIndex((p) => land(p.x, p.z) > 3);
  let last = first;
  while (last + 1 < pts.length && land(pts[last + 1]!.x, pts[last + 1]!.z) > 1.5) last += 1;
  // Falls (the little steps and the big drop over the cliff) are unlit: a lit vertical sheet facing
  // away from the sun read grey. Each runs from clear aqua at the lip to white foam at the foot.
  const fallPositions: number[] = [], fallColors: number[] = [];
  const lip = new Color('#7fe0ea'), white = new Color('#ffffff'), c = new Color();
  type Side = { x: number; z: number };
  const sideOf = (from: { x: number; z: number }, to: { x: number; z: number }): Side => {
    const dx = to.x - from.x, dz = to.z - from.z, len = Math.hypot(dx, dz) || 1;
    return { x: (-dz / len) * w, z: (dx / len) * w };
  };
  // Each point's sideways reach follows the river's direction through it, so neighbouring segments
  // share their edges: no slivers of sky open on the outside of a bend.
  const sideAt = (i: number) => sideOf(pts[Math.max(0, i - 1)]!, pts[Math.min(pts.length - 1, i + 1)]!);
  const ribbon = (a: { x: number; z: number }, b: { x: number; z: number }, ya: number, yb: number, sa = sideOf(a, b), sb = sa) => {
    const quad = [[a.x - sa.x, ya, a.z - sa.z], [b.x - sb.x, yb, b.z - sb.z], [a.x + sa.x, ya, a.z + sa.z], [a.x + sa.x, ya, a.z + sa.z], [b.x - sb.x, yb, b.z - sb.z], [b.x + sb.x, yb, b.z + sb.z]];
    const step = Math.abs(ya - yb) > 0.2;
    for (const [x, y, z] of quad) {
      if (step) {
        fallPositions.push(x!, y!, z!);
        c.copy(lip).lerp(foam, y === ya ? 0.15 : 1);
        fallColors.push(c.r, c.g, c.b);
      } else {
        positions.push(x!, y!, z!);
        c.copy(deep).lerp(foam, fbm(x! * 0.3, z! * 0.3, 4) * 0.25);
        colors.push(c.r, c.g, c.b);
      }
    }
  };
  for (let i = Math.max(0, first); i < last; i += 1) ribbon(pts[i]!, pts[i + 1]!, pts[i]!.level, pts[i + 1]!.level, sideAt(i), sideAt(i + 1));
  // Spring at the top: a little pool. Fall at the bottom: a curved sheet over the cliff, streaked,
  // widening a little as it drops, with a puff of spray at its foot.
  const end = pts[last]!, beyond = pts[Math.min(pts.length - 1, last + 2)]!;
  const out = new Vector3(beyond.x - end.x, 0, beyond.z - end.z).normalize();
  const side = new Vector3(-out.z, 0, out.x);
  ribbon({ x: end.x, z: end.z }, { x: end.x + out.x * 1.2, z: end.z + out.z * 1.2 }, end.level, end.level);
  const ROWS = 6, COLS = 4, drop = end.level + 9;
  const at = (row: number, col: number): [number, number, number] => {
    const t = row / ROWS, reach = 1.2 + 0.4 * t + 0.5 * Math.sqrt(t), spread = w * (1 + 0.15 * t) * (col / COLS * 2 - 1);
    return [end.x + out.x * reach + side.x * spread, end.level - drop * t, end.z + out.z * reach + side.z * spread];
  };
  const tone = (row: number, col: number) => {
    const t = row / ROWS, streak = col % 2 ? 0.18 : 0;
    c.copy(lip).lerp(white, Math.min(1, Math.pow(t, 0.6) + streak));
    fallColors.push(c.r, c.g, c.b);
  };
  for (let row = 0; row < ROWS; row += 1) for (let col = 0; col < COLS; col += 1) {
    for (const [r, k] of [[row, col], [row + 1, col], [row, col + 1], [row, col + 1], [row + 1, col], [row + 1, col + 1]] as const) {
      fallPositions.push(...at(r, k));
      tone(r, k);
    }
  }
  const spray = new IcosahedronGeometry(1, 0).getAttribute('position');
  const foot = at(ROWS, COLS / 2);
  for (let b = 0; b < 3; b += 1) {
    const s = 1.8 + (b % 2) * 0.5, off = (b - 1) * w * 0.55;
    for (let v = 0; v < spray.count; v += 1) {
      fallPositions.push(foot[0] + side.x * off + spray.getX(v) * s, foot[1] + 0.6 + spray.getY(v) * s * 0.7, foot[2] + side.z * off + spray.getZ(v) * s);
      c.copy(white).lerp(lip, 0.08 + (spray.getY(v) < 0 ? 0.12 : 0));
      fallColors.push(c.r, c.g, c.b);
    }
  }
  const fallGeometry = new BufferGeometry();
  fallGeometry.setAttribute('position', new Float32BufferAttribute(fallPositions, 3));
  fallGeometry.setAttribute('color', new Float32BufferAttribute(fallColors, 3));
  const falls = new Mesh(fallGeometry, new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.96, side: DoubleSide }));
  falls.renderOrder = 2;
  group.add(falls);
  // Lake disc.
  const L = terrain.lake;
  for (let k = 0; k < 48; k += 1) {
    const a0 = (k / 48) * Math.PI * 2, a1 = ((k + 1) / 48) * Math.PI * 2, r = L.r * 1.4;
    for (const [x, z] of [[L.x, L.z], [L.x + Math.cos(a0) * r, L.z + Math.sin(a0) * r], [L.x + Math.cos(a1) * r, L.z + Math.sin(a1) * r]]) {
      positions.push(x!, L.level, z!);
      colors.push(deep.r, deep.g, deep.b);
    }
  }
  const usable = positions.length - (positions.length % 9);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions.slice(0, usable), 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors.slice(0, usable), 3));
  geometry.computeVertexNormals();
  const mesh = new Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  group.add(mesh);
  return group;
}
scene.add(buildWater());

// ---------- Bridges where the path crosses the river ----------
// The only "bridge" in the model set is a stepping-stone slab at 3.5k triangles a stone, so these are
// built here: a plank deck arched over the water with posts and a rail, a few hundred triangles each.
// They share the ground material, so they mute with their week like everything else.
function buildBridges(): Mesh {
  const positions: number[] = [], colors: number[] = [], cellIds: number[] = [];
  const deck = new Color('#c08a52'), rail = new Color('#946038');
  const basis = new Matrix4(), place = new Matrix4(), along = new Vector3(), across = new Vector3(), upY = new Vector3(0, 1, 0);
  const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, colour: Color, cell: number, ends = true) => {
    // BoxGeometry faces run +x, -x, +y, -y, +z, -z (6 vertices each). The underside never shows, and
    // planks and rails butt end to end, so their end faces can go too.
    const g = new BoxGeometry(sx, sy, sz).toNonIndexed();
    const keep = (v: number) => Math.floor(v / 6) !== 3 && (ends || Math.floor(v / 6) > 1);
    g.applyMatrix4(place.copy(basis).setPosition(x, y, z));
    const pos = g.getAttribute('position');
    for (let v = 0; v < pos.count; v += 1) {
      if (!keep(v)) continue;
      positions.push(pos.getX(v), pos.getY(v), pos.getZ(v));
      const shade = 0.92 + ((v * 7) % 5) * 0.03; // a little plank-to-plank variation
      colors.push(colour.r * shade, colour.g * shade, colour.b * shade);
      cellIds.push(cell);
    }
  };
  decks.length = 0;
  const near = (p: { x: number; z: number }) => terrain.riverDistance(p.x, p.z).d < terrain.RIVER_WIDTH + 1;
  const path = terrain.path;
  for (let i = 0; i < path.length; i += 1) {
    if (!near(path[i]!)) continue;
    let j = i;
    while (j + 1 < path.length && near(path[j + 1]!)) j += 1;
    const a = path[Math.max(0, i - 1)]!, b = path[Math.min(path.length - 1, j + 1)]!;
    i = j;
    if (land(a.x, a.z) < 4 || land(b.x, b.z) < 4) continue;
    // Centre on the water, run along the path, reach well onto both banks.
    let mid = a, best = Infinity;
    for (let k = 0; k <= 10; k += 1) {
      const p = { x: lerp(a.x, b.x, k / 10), z: lerp(a.z, b.z, k / 10) };
      const d = terrain.riverDistance(p.x, p.z).d;
      if (d < best) { best = d; mid = p; }
    }
    along.set(b.x - a.x, 0, b.z - a.z).normalize();
    across.crossVectors(along, upY).normalize();
    basis.makeBasis(along, upY, across);
    const span = Math.max(9, Math.hypot(b.x - a.x, b.z - a.z) + 1.5), half = span / 2;
    const endA = { x: mid.x - along.x * half, z: mid.z - along.z * half }, endB = { x: mid.x + along.x * half, z: mid.z + along.z * half };
    const ya = terrain.height(endA.x, endA.z) + 0.12, yb = terrain.height(endB.x, endB.z) + 0.12;
    const water = terrain.riverDistance(mid.x, mid.z).level;
    const crown = Math.max(water + 1.1, (ya + yb) / 2 + 0.7) - (ya + yb) / 2;
    const cell = owner(cells, mid.x, mid.z).cell;
    const at = (t: number) => ({ x: lerp(endA.x, endB.x, t), z: lerp(endA.z, endB.z, t), y: lerp(ya, yb, t) + crown * Math.sin(Math.PI * t) });
    decks.push({ x: endA.x, z: endA.z, ux: along.x, uz: along.z, span, ya, yb, crown });
    const planks = Math.round(span / 0.85);
    for (let k = 0; k < planks; k += 1) {
      const p = at((k + 0.5) / planks);
      box(p.x, p.y, p.z, span / planks - 0.08, 0.2, 2.6, deck, cell, false);
    }
    // Posts and a rail on each side, between the banks.
    for (const sideSign of [-1, 1]) {
      const posts = 4;
      let prev: { x: number; y: number; z: number } | null = null;
      for (let k = 0; k < posts; k += 1) {
        const t = 0.1 + (0.8 * k) / (posts - 1), p = at(t);
        const px = p.x + across.x * 1.2 * sideSign, pz = p.z + across.z * 1.2 * sideSign;
        box(px, p.y + 0.45, pz, 0.18, 0.9, 0.18, rail, cell);
        const top = { x: px, y: p.y + 0.85, z: pz };
        if (prev) {
          const len = Math.hypot(top.x - prev.x, top.z - prev.z);
          box((top.x + prev.x) / 2, (top.y + prev.y) / 2, (top.z + prev.z) / 2, len + 0.1, 0.12, 0.12, rail, cell, false);
        }
        prev = top;
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setAttribute('aCell', new Float32BufferAttribute(cellIds, 1));
  geometry.computeVertexNormals();
  const mesh = new Mesh(geometry, ground.material);
  mesh.castShadow = false; // keeps the shadow pass within round three's triangle budget
  mesh.receiveShadow = true;
  return mesh;
}
const decks: { x: number; z: number; ux: number; uz: number; span: number; ya: number; yb: number; crown: number }[] = [];
scene.add(buildBridges());
/** Top of a bridge deck at (x, z), or null off the bridges. Animals cross the river on these. */
function deckAt(x: number, z: number): number | null {
  for (const d of decks) {
    const dx = x - d.x, dz = z - d.z;
    const along = dx * d.ux + dz * d.uz, across = Math.abs(-dx * d.uz + dz * d.ux);
    if (along < 0 || along > d.span || across > 1.15) continue;
    const t = along / d.span;
    return lerp(d.ya, d.yb, t) + d.crown * Math.sin(Math.PI * t) + 0.1;
  }
  return null;
}
const surface = (x: number, z: number) => deckAt(x, z) ?? terrain.height(x, z);

// ---------- Foliage colour ----------
// Quaternius leaves carry dark baked vertex colour (AO) and flat textures. At Year zoom that reads
// near-black. Soften the AO, pull greens towards Forest Island yellow-green, and add a little fill
// so crowns facing away from the sun stay light. Blossom and autumn reds keep their hue.
const FOLIAGE_GLSL = `
uniform float uLeafAO;
uniform float uLeafFill;
vec3 groveHsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
vec3 groveRgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
vec3 groveLeaf(vec3 linear) {
  vec3 hsv = groveHsv(pow(max(linear, 0.0), vec3(1.0 / 2.2)));
  float green = smoothstep(0.12, 0.17, hsv.x) * (1.0 - smoothstep(0.42, 0.5, hsv.x));
  hsv.x = mix(hsv.x, mix(hsv.x, 0.27, 0.6), green);
  hsv.y = mix(hsv.y, clamp(hsv.y, 0.66, 0.9), green);
  hsv.z = mix(min(1.0, hsv.z * 1.12), clamp(0.34 + hsv.z * 0.6, 0.0, 0.82), green);
  return pow(groveRgb(hsv), vec3(2.2));
}
`;
function dress(mat: any): void {
  if (!mat || mat.userData.dressed) return;
  mat.userData.dressed = true;
  const leaf = /lea[fv]/i.test(mat.name ?? '');
  // Every model material mutes instances outside the expanded week, like the ground does.
  const mute = 'if (uSelected >= 0.0 && abs(vGroveCell - uSelected) > 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.33))), 0.55) * 0.82;';
  mat.onBeforeCompile = (shader: any) => {
    shader.uniforms.uSelected = selection;
    shader.vertexShader = 'attribute float aCell;\nvarying float vGroveCell;\n' + shader.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGroveCell = aCell;');
    let frag: string = shader.fragmentShader;
    if (leaf) {
      shader.uniforms.uLeafAO = { value: 0.35 };
      shader.uniforms.uLeafFill = { value: 0.14 };
      frag = FOLIAGE_GLSL + frag
        .replace('#include <color_fragment>', '#ifdef USE_COLOR\n  diffuseColor.rgb *= mix(vec3(1.0), vColor.rgb, uLeafAO);\n#endif\ndiffuseColor.rgb = groveLeaf(diffuseColor.rgb);\n' + mute)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uLeafFill;');
    } else frag = frag.replace('#include <color_fragment>', '#include <color_fragment>\n' + mute);
    shader.fragmentShader = 'uniform float uSelected;\nvarying float vGroveCell;\n' + frag;
  };
  mat.customProgramCacheKey = () => (leaf ? 'grove-leaf-mute' : 'grove-mute');
  mat.needsUpdate = true;
}

// ---------- Models, instanced ----------
type Part = { geometry: BufferGeometry; material: unknown; matrix: Matrix4 };
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map<string, Promise<{ parts: Part[]; height: number }>>();
function model(file: string) {
  let job = cache.get(file);
  if (!job) {
    job = loader.loadAsync(`/assets/grove/${file}`).then((gltf: { scene: Object3D }) => {
      const root = gltf.scene;
      root.updateMatrixWorld(true);
      const parts: Part[] = [];
      let minY = Infinity, maxY = -Infinity;
      root.traverse((node: any) => {
        if (!node.isMesh) return;
        node.geometry.computeBoundingBox();
        const box = node.geometry.boundingBox.clone().applyMatrix4(node.matrixWorld);
        minY = Math.min(minY, box.min.y);
        maxY = Math.max(maxY, box.max.y);
        for (const mat of Array.isArray(node.material) ? node.material : [node.material]) dress(mat);
        parts.push({ geometry: node.geometry, material: node.material, matrix: node.matrixWorld.clone() });
      });
      return { parts, height: Math.max(0.01, maxY - minY) };
    });
    cache.set(file, job);
  }
  return job;
}

// Each model gets two instanced meshes: full detail and a simplified LOD copy (models/lod/...).
// Only instances on screen when trees are drawn large use full detail; Year view is all LOD. That keeps a full
// year within a phone's budget while an expanded week still shows the real models.
type Slot = { list: Placed[]; full: InstancedMesh[]; lod: InstancedMesh[]; fullItems: Placed[]; lodItems: Placed[]; unit: number; fullParts: Part[]; lodParts: Part[] };
const slots: Slot[] = [];
const pickTrees: { mesh: InstancedMesh; items: () => Placed[] }[] = [];
const lodFile = (file: string) => file.replace(/^models\//, 'models/lod/');
async function instance(items: Placed[], shadows: boolean) {
  const byFile = new Map<string, Placed[]>();
  for (const item of items) byFile.set(item.file, [...(byFile.get(item.file) ?? []), item]);
  await Promise.all([...byFile].map(async ([file, list]) => {
    let full, lod;
    try { full = await model(file); } catch { console.warn('missing', file); return; }
    try { lod = await model(lodFile(file)); } catch { console.warn('missing LOD', file); lod = full; }
    const slot: Slot = { list, full: [], lod: [], fullItems: [], lodItems: list, unit: 1 / full.height, fullParts: full.parts, lodParts: lod.parts };
    const make = (parts: Part[], into: InstancedMesh[], items: () => Placed[]) => {
      for (const part of parts) {
        // Own geometry shell (shared buffers) so each mesh carries its own per-instance cell index.
        const geometry = new BufferGeometry();
        geometry.index = part.geometry.index;
        for (const name of Object.keys(part.geometry.attributes)) geometry.setAttribute(name, part.geometry.attributes[name]!);
        geometry.groups = part.geometry.groups;
        geometry.boundingBox = part.geometry.boundingBox;
        geometry.setAttribute('aCell', new InstancedBufferAttribute(new Float32Array(list.length), 1));
        const mesh = new InstancedMesh(geometry, part.material as any, list.length);
        mesh.castShadow = shadows;
        mesh.receiveShadow = !shadows; // tree crowns stay bright; ground cover sits in shade
        into.push(mesh);
        scene.add(mesh);
        pickTrees.push({ mesh, items });
      }
    };
    make(full.parts, slot.full, () => slot.fullItems);
    make(lod.parts, slot.lod, () => slot.lodItems);
    slots.push(slot);
    fill(slot);
  }));
}
const m4 = new Matrix4(), q4 = new Quaternion(), p4 = new Vector3(), s4 = new Vector3(), up4 = new Vector3(0, 1, 0);
function fill(slot: Slot): void {
  const write = (meshes: InstancedMesh[], parts: Part[], items: Placed[]) => meshes.forEach((mesh, k) => {
    const aCell = mesh.geometry.getAttribute('aCell') as InstancedBufferAttribute;
    items.forEach((item, i) => {
      item.cell ??= owner(cells, item.x, item.z).cell;
      aCell.setX(i, item.cell);
      q4.setFromAxisAngle(up4, item.rotation);
      s4.setScalar(item.scale * slot.unit);
      p4.set(item.x, item.y - 0.05, item.z);
      mesh.setMatrixAt(i, m4.compose(p4, q4, s4).multiply(parts[k]!.matrix));
    });
    mesh.count = items.length;
    mesh.visible = items.length > 0;
    mesh.instanceMatrix.needsUpdate = true;
    aCell.needsUpdate = true;
    mesh.computeBoundingSphere();
  });
  write(slot.full, slot.fullParts, slot.fullItems);
  write(slot.lod, slot.lodParts, slot.lodItems);
}
// Full detail once a map unit is 10+ screen pixels (desktop expanded week is about 15; Year is
// about 6 on desktop, 4 on a phone, and a phone's expanded week about 7, where LOD reads the same).
const DETAIL_PX = 10;
const pxPerUnit = () => (stage.clientHeight * camera.zoom) / (camera.top - camera.bottom);
const ndc = new Vector3();
function partition(): void {
  const close = pxPerUnit() >= DETAIL_PX;
  for (const slot of slots) {
    const full: Placed[] = [], lod: Placed[] = [];
    for (const item of slot.list) {
      let near = false;
      // Understorey trees stay on LOD: small, in the canopy's shade, and full detail would cost 100k+ triangles.
      if (close && !item.understorey) {
        ndc.set(item.x, item.y, item.z).project(camera);
        near = Math.abs(ndc.x) < 1.15 && ndc.y > -1.15 && ndc.y < 1.4;
      }
      (near ? full : lod).push(item);
    }
    if (full.length === slot.fullItems.length && full.every((v, i) => v === slot.fullItems[i])) continue;
    slot.fullItems = full;
    slot.lodItems = lod;
    fill(slot);
  }
}
let partitionTimer = 0;
function schedulePartition(): void {
  clearTimeout(partitionTimer);
  partitionTimer = window.setTimeout(() => { partition(); render(); }, 120);
}

// ---------- Camera ----------
const camera = new OrthographicCamera(-1, 1, 1, -1, 1, 2000);
const YAW = Math.PI / 4, ELEV = (33 * Math.PI) / 180;
const viewDir = new Vector3(Math.sin(YAW) * Math.cos(ELEV), Math.sin(ELEV), Math.cos(YAW) * Math.cos(ELEV));
const controls = new OrbitControls(camera, renderer.domElement);
controls.mouseButtons = { LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE };
controls.touches = { ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_PAN };
Object.assign(controls, { enableDamping: false, screenSpacePanning: false, enableRotate: true, minPolarAngle: Math.PI / 2 - ELEV - 0.3, maxPolarAngle: Math.PI / 2 - ELEV + 0.15, minZoom: 0.6, maxZoom: 9, zoomToCursor: true });

let worldHalf = 1;
function frameAll(): void {
  const w = stage.clientWidth || 1, h = stage.clientHeight || 1, aspect = w / h;
  // Project the land's corners to fit them snugly.
  const corners: Vector3[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [-9, 14]) corners.push(new Vector3(sx * (BOUNDS.halfW - 8), y, sz * (BOUNDS.halfD - 8)));
  camera.position.copy(viewDir).multiplyScalar(500);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  let maxX = 0, maxY = 0;
  for (const c of corners) {
    const v = c.clone().applyMatrix4(camera.matrixWorldInverse);
    maxX = Math.max(maxX, Math.abs(v.x));
    maxY = Math.max(maxY, Math.abs(v.y));
  }
  worldHalf = Math.max(maxY, maxX / aspect) * 1.04;
  camera.top = worldHalf * 1.06; camera.bottom = -worldHalf * 0.94;
  camera.left = -worldHalf * aspect; camera.right = worldHalf * aspect;
  camera.zoom = 1;
  camera.updateProjectionMatrix();
  controls.target.set(0, 0, 0);
  controls.update();
}

function resize(): void {
  const w = stage.clientWidth || 1, h = stage.clientHeight || 1;
  renderer.setSize(w, h, false);
  const aspect = w / h;
  camera.left = -worldHalf * aspect; camera.right = worldHalf * aspect;
  camera.updateProjectionMatrix();
  render();
}

// The shadow map only changes when the camera does (the sun follows the view), so it is redrawn on
// camera moves, not on every animation frame; animals cast no shadows.
renderer.shadowMap.autoUpdate = false;
let frame = 0;
function draw(): void {
  if (disposed) return;
  // The sun follows the view only when the shadow map is redrawn with it; frames that just track a
  // moving animal leave both alone (the shadow camera covers the whole island either way).
  if (renderer.shadowMap.needsUpdate) {
    sun.target.position.copy(controls.target);
    sun.position.copy(controls.target).add(new Vector3(-70, 140, 60));
  }
  renderer.render(scene, camera);
  stage.dataset.ready = 'true';
  stage.dataset.trees = String(planting.trees.length);
  stage.dataset.triangles = String(renderer.info.render.triangles);
  stage.dataset.calls = String(renderer.info.render.calls);
  stage.dataset.zoom = camera.zoom.toFixed(2);
  stage.dataset.px = pxPerUnit().toFixed(2);
  stage.dataset.detailed = String(slots.reduce((n, s) => n + s.fullItems.length, 0));
}
function render(): void {
  renderer.shadowMap.needsUpdate = true;
  if (frame || disposed) return;
  frame = requestAnimationFrame(() => { frame = 0; draw(); });
}
let following: number | null = null, dragging = false;
const followAt = new Vector3();
controls.addEventListener('start', () => { dragging = true; });
controls.addEventListener('end', () => { dragging = false; });
controls.addEventListener('change', () => {
  const t = controls.target;
  // Panning away from a followed animal lets it go; zooming and turning keep it in view.
  if (following != null && dragging && t.distanceTo(followAt) > 0.05) stopFollowing();
  const cx = Math.max(-BOUNDS.halfW + 10, Math.min(BOUNDS.halfW - 10, t.x)), cz = Math.max(-BOUNDS.halfD + 10, Math.min(BOUNDS.halfD - 10, t.z));
  if (cx !== t.x || cz !== t.z) { camera.position.x += cx - t.x; camera.position.z += cz - t.z; t.x = cx; t.z = cz; }
  schedulePartition();
  render();
});

// ---------- Expanding a week ----------
let current: ForestState = { year, week: null, trees: planting.trees.length, future: false, builtWeeks, animals: 0 };
function announce(next: ForestState): void {
  current = next;
  options.onChange?.(next);
}
function showYear(): void {
  announce({ year, week: null, trees: planting.trees.length, future: false, builtWeeks, animals: animals?.count ?? 0 });
  selection.value = -1;
  animals?.focus(null);
  render();
}
function ease(toTarget: Vector3, toZoom: number, instant = false): void {
  const fromTarget = controls.target.clone(), fromZoom = camera.zoom, offset = camera.position.clone().sub(controls.target);
  const start = performance.now();
  const reduce = instant || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const step = (now: number) => {
    if (disposed) return;
    const f = reduce ? 1 : Math.min(1, (now - start) / 900);
    const t = f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2;
    controls.target.lerpVectors(fromTarget, toTarget, t);
    camera.position.copy(controls.target).add(offset);
    camera.zoom = lerp(fromZoom, toZoom, t);
    camera.updateProjectionMatrix();
    controls.update();
    render();
    if (f < 1) requestAnimationFrame(step);
    else schedulePartition();
  };
  if (instant) step(start); else requestAnimationFrame(step);
}
function expand(cellIndex: number, instant = false): void {
  const cell = cells[cellIndex]!;
  if (!cell.week) return;
  stopFollowing();
  const trees = planting.trees.filter((t) => t.week === cell.week);
  const [from, to] = weekRange(cell.week, year);
  announce({ year, week: cell.week, from, to, trees: trees.length, future: cell.week > builtWeeks, builtWeeks, animals: animals?.count ?? 0 });
  selection.value = cellIndex;
  animals?.focus(cellIndex);
  const centre = trees.length ? trees.reduce((v, t) => v.add(new Vector3(t.x / trees.length, 0, t.z / trees.length)), new Vector3()) : new Vector3(cell.x, 0, cell.z);
  centre.lerp(new Vector3(cell.x, 0, cell.z), 0.5);
  centre.y = terrain.height(centre.x, centre.z) + 3; // middle of the stand, not the ground under it
  const w = stage.clientWidth, h = stage.clientHeight;
  // A phone shows the week across its width; a wider screen keeps some neighbours around it.
  const span = options.weekSpan ?? (w < 720 ? 40 : 58);
  const zoom = Math.min(controls.maxZoom, (worldHalf * 2) / span, (worldHalf * 2 * (w / h)) / span);
  // Put the week in the middle of the space under the floating title. The frustum is offset upward
  // and three.js zooms about its middle, not about the target, so without this the week slid down
  // the screen as it zoomed in.
  const free = Math.max(0, options.topInset?.() ?? 0);
  const aim = (free + h) / 2;
  const mid = (camera.top + camera.bottom) / 2, half = (camera.top - camera.bottom) / (2 * zoom);
  const v = mid + half - (aim / h) * 2 * half; // view height that lands on the aim line
  const up = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  ease(centre.sub(up.multiplyScalar(v)), zoom, instant);
}
function backToYear(): void {
  showYear();
  ease(new Vector3(0, 0, 0), stage.clientWidth < 720 ? PHONE_ZOOM : 1);
}

const raycaster = new Raycaster();
let down = { x: 0, y: 0 };
const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
const onUp = (e: PointerEvent) => {
  if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
  const r = renderer.domElement.getBoundingClientRect();
  raycaster.setFromCamera(new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
  const beast = animals?.pick(raycaster);
  if (beast) { options.onPick?.({ kind: 'animal', animal: beast }, e.clientX, e.clientY); return; }
  const hit = raycaster.intersectObjects([ground, ...pickTrees.filter((p) => p.mesh.visible).map((p) => p.mesh)], false)[0];
  if (!hit) return;
  const tree = pickTrees.find((p) => p.mesh === hit.object);
  if (tree && hit.instanceId != null && selection.value >= 0) {
    const item = tree.items()[hit.instanceId]!;
    const task = history.find((d) => d.id === item.id);
    if (task && owner(cells, item.x, item.z).cell === selection.value) {
      options.onPick?.({ kind: 'tree', id: task.id, title: task.title, species: task.species, completed: task.completed, late: !!task.late }, e.clientX, e.clientY);
      return;
    }
  }
  options.onPick?.(null, e.clientX, e.clientY);
  const cell = owner(cells, hit.point.x, hit.point.z).cell;
  if (cell !== selection.value) expand(cell);
};
const interactive = options.interactive !== false;
controls.enabled = interactive;
if (interactive) {
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointerup', onUp);
}

// ---------- Go ----------
const PHONE_ZOOM = 2.3;
const observer = new ResizeObserver(resize);
observer.observe(stage);
frameAll();
resize();
if (stage.clientWidth < 720) {
  // Portrait phones: the whole map fits the width, so lean in a little; pan for the rest.
  camera.zoom = PHONE_ZOOM;
  camera.updateProjectionMatrix();
  controls.update();
}
let animals: Awaited<ReturnType<typeof createForestAnimals>> | null = null;
showYear();
const opening = options.week != null ? cells.find((c) => c.week === options.week) : undefined;
if (opening) expand(opening.index, true);
// Understorey trees (squeezed into crowded weeks) stand in the canopy's shade: they cast no shadow of
// their own, which keeps them within the triangle budget.
await Promise.all([
  instance(planting.trees.filter((t) => !t.understorey), true),
  instance(planting.trees.filter((t) => t.understorey), false),
  instance(planting.ground, false)
]);
if (disposed) return handle();
partition();
stage.dataset.models = 'true';
render();

/** Top of a planted tree's crown: a ray straight down onto its drawn model. */
const downward = new Raycaster();
function treeTop(tree: Placed): number | null {
  downward.set(new Vector3(tree.x, tree.y + tree.scale * 2 + 10, tree.z), new Vector3(0, -1, 0));
  const meshes = pickTrees.filter((p) => p.mesh.visible && p.items().includes(tree)).map((p) => p.mesh);
  const hit = downward.intersectObjects(meshes, false)[0];
  return hit ? hit.point.y : null;
}

// ---------- Wildlife ----------
// Earned animals roam their week's piece. They animate at up to 30 frames a second while the page is
// visible; reduced motion keeps them standing still.
if (options.animals?.length) {
  try {
    animals = await createForestAnimals({ scene, terrain, cells, trees: planting.trees, year, builtWeeks, animals: options.animals, surface, onDeck: (x, z) => deckAt(x, z) != null, treeTop });
  } catch (error) {
    console.warn('Grove wildlife unavailable', error);
  }
  if (disposed) { animals?.dispose(); return handle(); }
  if (animals) {
    stage.dataset.animals = String(animals.count);
    if (selection.value < 0) showYear(); else { animals.focus(selection.value); announce({ ...current, animals: animals.count }); }
    render();
  }
}
const still = matchMedia('(prefers-reduced-motion: reduce)');
let last = performance.now(), loop = 0;
function tick(now: number): void {
  loop = 0;
  if (disposed || !animals || still.matches) return;
  loop = requestAnimationFrame(tick);
  if (document.hidden || now - last < 33) return;
  const delta = Math.min(0.1, (now - last) / 1000);
  last = now;
  animals.update(delta);
  if (following != null) {
    trackFollowed(1 - Math.exp(-delta * 4));
    followPartition += delta;
    if (followPartition > 0.8) { followPartition = 0; partition(); }
  } else if (!frame) draw();
}
if (animals && !still.matches) loop = requestAnimationFrame(tick);
const onMotion = () => { if (!still.matches && !loop && animals) { last = performance.now(); loop = requestAnimationFrame(tick); } };
still.addEventListener('change', onMotion);

// ---------- Turning the view ----------
const turnAxis = new Vector3(0, 1, 0);
function rotate(by: number): void {
  const offset = camera.position.clone().sub(controls.target);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const start = performance.now();
  let done = 0;
  const step = (now: number) => {
    if (disposed) return;
    const f = reduce ? 1 : Math.min(1, (now - start) / 450);
    const t = 1 - Math.pow(1 - f, 3);
    camera.position.copy(controls.target).add(offset.clone().applyAxisAngle(turnAxis, -by * t));
    camera.lookAt(controls.target);
    done = t;
    controls.update();
    render();
    if (done < 1) requestAnimationFrame(step);
    else schedulePartition();
  };
  requestAnimationFrame(step);
}

// ---------- Following an animal ----------
let followZoom = 1, followPartition = 0;
function stopFollowing(): void {
  if (following == null) return;
  following = null;
  controls.zoomToCursor = true;
  schedulePartition();
  render();
  options.onFollow?.(null);
}
function follow(key: number | null): void {
  if (key == null || !animals) { stopFollowing(); return; }
  const entry = animals.list().find((a) => a.key === key);
  if (!entry) return;
  // A week view shows only its own animals: step back out to the year so this one is out.
  if (!entry.visible) showYear();
  following = key;
  // Close enough to see legs move: about 28 screen pixels a map unit (or as close as the map allows).
  followZoom = Math.min(controls.maxZoom, Math.max(camera.zoom, (28 * (camera.top - camera.bottom)) / (stage.clientHeight || 1)));
  // Zooming about the cursor would pull the view off the animal.
  controls.zoomToCursor = false;
  options.onFollow?.(entry.animal);
  if (still.matches || !loop) trackFollowed(1);
}
/** Move the view towards the followed animal; `blend` 1 lands on it. */
function trackFollowed(blend: number): void {
  if (following == null || !animals) return;
  const p = animals.position(following);
  if (!p) { stopFollowing(); return; }
  const t = controls.target, before = t.clone();
  t.lerp(new Vector3(p.x, p.y, p.z), blend);
  camera.position.add(t.clone().sub(before));
  followAt.copy(t);
  if (Math.abs(camera.zoom - followZoom) > 0.001) {
    camera.zoom = lerp(camera.zoom, followZoom, blend);
    camera.updateProjectionMatrix();
  }
  if (blend >= 1) { renderer.shadowMap.needsUpdate = true; partition(); }
  draw();
}

function handle(): ForestHandle {
  return {
    expand: (week: number) => { const cell = cells.find((c) => c.week === week); if (cell) expand(cell.index); },
    showYear: () => { stopFollowing(); backToYear(); },
    state: () => current,
    rotate,
    animals: () => (animals?.list() ?? []).map(({ key, animal, young, visible }) => ({ key, animal, young, visible })),
    follow,
    wildlife: () => (animals?.report() ?? []).map((a) => {
      const p = new Vector3(a.x, a.y, a.z).project(camera);
      return { ...a, sx: ((p.x + 1) / 2) * stage.clientWidth, sy: ((1 - p.y) / 2) * stage.clientHeight };
    }),
    stepWildlife: (seconds: number) => { for (let t = 0; t < seconds && animals; t += 1 / 30) animals.update(1 / 30); render(); },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      cancelAnimationFrame(loop);
      clearTimeout(partitionTimer);
      still.removeEventListener('change', onMotion);
      observer.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      animals?.dispose();
      scene.traverse((node: any) => {
        if (node.isInstancedMesh) node.dispose();
        else if (node.isMesh) { node.geometry?.dispose(); }
      });
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    }
  };
}
return handle();
}
