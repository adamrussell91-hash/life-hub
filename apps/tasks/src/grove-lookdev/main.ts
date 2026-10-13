/**
 * Grove Year look prototype: one continuous forest built week by week.
 * Synthetic history only. Open /grove-lookdev.html on the Tasks dev server.
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
import { syntheticHistory, TODAY, weekOf, weekRange } from './history';
import { plant, type Placed } from './planting';
import { fbm, lerp, smoothstep } from './noise';

const stage = document.getElementById('stage')!;
const title = document.getElementById('title')!;
const back = document.getElementById('back') as HTMLButtonElement;
const status = document.getElementById('status')!;

const history = syntheticHistory();
const builtWeeks = weekOf(TODAY);
const cells = buildCells();
const terrain = buildTerrain(cells, builtWeeks);
const planting = plant(cells, terrain, history, builtWeeks);
// Nothing dies: every finished task this year must have its tree.
const planted = new Set(planting.trees.map((t) => t.id));
const dropped = history.filter((d) => d.week >= 1 && d.week <= 52 && !planted.has(d.id)).length;
if (dropped) console.error(`Grove: ${dropped} finished tasks have no tree`);
document.body.dataset.dropped = String(dropped);

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
const STEP = 1.5;
function buildGround(): Mesh {
  const positions: number[] = [], colors: number[] = [], weeks: number[] = [];
  const nx = Math.ceil((BOUNDS.halfW * 2) / STEP), nz = Math.ceil((BOUNDS.halfD * 2) / STEP);
  const vx = (i: number) => -BOUNDS.halfW + i * STEP, vz = (j: number) => -BOUNDS.halfD + j * STEP;
  const heights: number[] = [];
  for (let j = 0; j <= nz; j += 1) for (let i = 0; i <= nx; i += 1) heights.push(terrain.height(vx(i), vz(j)));
  const H = (i: number, j: number) => heights[j * (nx + 1) + i]!;
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
    const p = terrain.pathDistance(x, z);
    if (p < 1.6) colour.lerp(C.path, smoothstep(1.6, 0.6, p));
    const r = terrain.riverDistance(x, z);
    const shore = Math.min(r.d - terrain.RIVER_WIDTH, terrain.lakeDistance(x, z));
    if (shore < 2.2) colour.lerp(C.sand, smoothstep(2.2, 0.4, shore));
    if (shore < 0) colour.copy(C.bed);
  };
  for (let j = 0; j < nz; j += 1) for (let i = 0; i < nx; i += 1) {
    const quad = [[i, j], [i, j + 1], [i + 1, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]] as const;
    for (let t = 0; t < 2; t += 1) {
      const tri = quad.slice(t * 3, t * 3 + 3);
      const ys = tri.map(([a, b]) => H(a, b));
      if (ys.every((y) => y <= -8.9)) continue;
      const cx = tri.reduce((s, [a]) => s + vx(a), 0) / 3, cz = tri.reduce((s, [, b]) => s + vz(b), 0) / 3;
      // Bed well inside the river or lake is hidden under opaque water: don't draw it.
      if (Math.min(terrain.riverDistance(cx, cz).d - terrain.RIVER_WIDTH, terrain.lakeDistance(cx, cz)) < 0 && land(cx, cz) > 3) continue;
      const cy = ys.reduce((s, y) => s + y, 0) / 3;
      const slope = (Math.max(...ys) - Math.min(...ys)) / STEP;
      tint(cx, cz, cy, slope);
      const week = cells[owner(cells, cx, cz).cell]!.index;
      tri.forEach(([a, b], k) => {
        positions.push(vx(a), ys[k]!, vz(b));
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
  const w = terrain.RIVER_WIDTH + 0.6;
  const first = pts.findIndex((p) => land(p.x, p.z) > 3);
  let last = first;
  while (last + 1 < pts.length && land(pts[last + 1]!.x, pts[last + 1]!.z) > 1.5) last += 1;
  // Falls (the little steps and the big drop over the cliff) are unlit: a lit vertical sheet facing
  // away from the sun read grey. Each runs from clear aqua at the lip to white foam at the foot.
  const fallPositions: number[] = [], fallColors: number[] = [];
  const lip = new Color('#7fe0ea'), white = new Color('#ffffff'), c = new Color();
  const ribbon = (a: { x: number; z: number }, b: { x: number; z: number }, ya: number, yb: number) => {
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
    const nx = (-dz / len) * w, nz = (dx / len) * w;
    const quad = [[a.x - nx, ya, a.z - nz], [b.x - nx, yb, b.z - nz], [a.x + nx, ya, a.z + nz], [a.x + nx, ya, a.z + nz], [b.x - nx, yb, b.z - nz], [b.x + nx, yb, b.z + nz]];
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
  for (let i = Math.max(0, first); i < last; i += 1) ribbon(pts[i]!, pts[i + 1]!, pts[i]!.level, pts[i + 1]!.level);
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
scene.add(buildBridges());

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

let frame = 0;
function render(): void {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    sun.target.position.copy(controls.target);
    sun.position.copy(controls.target).add(new Vector3(-70, 140, 60));
    renderer.render(scene, camera);
    document.body.dataset.ready = 'true';
    document.body.dataset.trees = String(planting.trees.length);
    document.body.dataset.triangles = String(renderer.info.render.triangles);
    document.body.dataset.calls = String(renderer.info.render.calls);
    document.body.dataset.zoom = camera.zoom.toFixed(2);
    document.body.dataset.px = pxPerUnit().toFixed(2);
    document.body.dataset.detailed = String(slots.reduce((n, s) => n + s.fullItems.length, 0));
  });
}
controls.addEventListener('change', () => {
  const t = controls.target;
  const cx = Math.max(-BOUNDS.halfW + 10, Math.min(BOUNDS.halfW - 10, t.x)), cz = Math.max(-BOUNDS.halfD + 10, Math.min(BOUNDS.halfD - 10, t.z));
  if (cx !== t.x || cz !== t.z) { camera.position.x += cx - t.x; camera.position.z += cz - t.z; t.x = cx; t.z = cz; }
  schedulePartition();
  render();
});

// ---------- Expanding a week ----------
const fmt = (d: Date) => d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
function showYear(): void {
  const trees = planting.trees.length;
  title.innerHTML = `<strong>2026</strong> <span>· ${trees} trees · ${builtWeeks} weeks</span>`;
  back.hidden = true;
  selection.value = -1;
}
function ease(toTarget: Vector3, toZoom: number): void {
  const fromTarget = controls.target.clone(), fromZoom = camera.zoom, offset = camera.position.clone().sub(controls.target);
  const start = performance.now();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const step = (now: number) => {
    const f = reduce ? 1 : Math.min(1, (now - start) / 700);
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
  requestAnimationFrame(step);
}
function expand(cellIndex: number): void {
  const cell = cells[cellIndex]!;
  if (!cell.week) return;
  const trees = planting.trees.filter((t) => t.week === cell.week);
  const [from, to] = weekRange(cell.week);
  const future = cell.week > builtWeeks;
  title.innerHTML = `<strong>Week ${cell.week}</strong> <span>· ${fmt(from)} to ${fmt(to)} · ${future ? 'still to come' : trees.length === 1 ? '1 tree' : `${trees.length} trees`}</span>`;
  back.hidden = false;
  selection.value = cellIndex;
  const centre = trees.length ? trees.reduce((v, t) => v.add(new Vector3(t.x / trees.length, 0, t.z / trees.length)), new Vector3()) : new Vector3(cell.x, 0, cell.z);
  centre.lerp(new Vector3(cell.x, 0, cell.z), 0.5);
  centre.y = terrain.height(centre.x, centre.z) + 3; // middle of the stand, not the ground under it
  const w = stage.clientWidth, h = stage.clientHeight;
  // A phone shows the week across its width; a wider screen keeps some neighbours around it.
  const span = w < 720 ? 40 : 58;
  const zoom = Math.min(controls.maxZoom, (worldHalf * 2) / span, (worldHalf * 2 * (w / h)) / span);
  // Put the week in the middle of the space under the title. The frustum is offset upward and
  // three.js zooms about its middle, not about the target, so without this the week slid down the
  // screen as it zoomed in (and the title covers the top of a phone screen).
  const stageTop = stage.getBoundingClientRect().top;
  const free = Math.max(0, title.getBoundingClientRect().bottom - stageTop + 8);
  const aim = (free + h) / 2;
  const mid = (camera.top + camera.bottom) / 2, half = (camera.top - camera.bottom) / (2 * zoom);
  const v = mid + half - (aim / h) * 2 * half; // view height that lands on the aim line
  const up = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  ease(centre.sub(up.multiplyScalar(v)), zoom);
}
back.addEventListener('click', () => {
  showYear();
  ease(new Vector3(0, 0, 0), 1);
});

const raycaster = new Raycaster();
let down = { x: 0, y: 0 };
renderer.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
  const r = renderer.domElement.getBoundingClientRect();
  raycaster.setFromCamera(new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
  const hit = raycaster.intersectObjects([ground, ...pickTrees.filter((p) => p.mesh.visible).map((p) => p.mesh)], false)[0];
  if (!hit) return;
  const tree = pickTrees.find((p) => p.mesh === hit.object);
  if (tree && hit.instanceId != null && selection.value >= 0) {
    const item = tree.items()[hit.instanceId]!;
    const task = history.find((d) => d.id === item.id);
    if (task) status.textContent = `${task.title} · finished ${fmt(task.completed)}`;
    return;
  }
  status.textContent = '';
  expand(owner(cells, hit.point.x, hit.point.z).cell);
});
(window as any).groveExpand = (week: number) => expand(cells.find((c) => c.week === week)!.index);
(window as any).groveYear = () => back.click();

// ---------- Go ----------
new ResizeObserver(resize).observe(stage);
frameAll();
showYear();
resize();
if (stage.clientWidth < 720) {
  // Portrait phones: the whole map fits the width, so lean in a little; pan for the rest.
  camera.zoom = 2.3;
  camera.updateProjectionMatrix();
  controls.update();
}
status.textContent = 'Planting…';
// Understorey trees (squeezed into crowded weeks) stand in the canopy's shade: they cast no shadow of
// their own, which keeps them within the triangle budget.
await Promise.all([
  instance(planting.trees.filter((t) => !t.understorey), true),
  instance(planting.trees.filter((t) => t.understorey), false),
  instance(planting.ground, false)
]);
partition();
status.textContent = '';
document.body.dataset.models = 'true';
render();
