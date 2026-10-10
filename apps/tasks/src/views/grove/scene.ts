/**
 * Grove three.js scene: an island of clearings drawn from a GrovePlan.
 *
 * Renders on demand only. Trees wobble up once when the scene opens (or when a task is
 * finished while it is open), then the loop stops; nothing animates forever.
 */
import {
  AmbientLight,
  Box3,
  CanvasTexture,
  Color,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  OrthographicCamera,
  PCFSoftShadowMap,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  Scene,
  Shape,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { propModelFile, treeModelFile } from '@/domain/grove/assets';
import type { GroveDay, GrovePlan, GroveTree } from '@/domain/grove/plan';
import { groveAssetUrl } from './asset-url';

// three is declared as an untyped module in this app (see views/city/three-modules.d.ts).
type Obj3 = InstanceType<typeof Object3D>;
type Grp = InstanceType<typeof Group>;
type Mat4 = InstanceType<typeof Matrix4>;
type Vec3 = InstanceType<typeof Vector3>;

export type GroveSceneOptions = {
  plan: GrovePlan;
  reducedMotion: boolean;
  /** Pan, zoom and pick. Off for the Home preview. */
  interactive: boolean;
  /** Trees that should wobble up. Everything else stands still from the first frame. */
  wobble: ReadonlySet<string> | 'all';
  /** Centre the opening frame on this day (the anchor). */
  focusKey?: string;
  onPick?: (treeId: string | null, clientX: number, clientY: number) => void;
};

export type GroveSceneHandle = {
  resize(): void;
  dispose(): void;
};

/** Camera elevation and turn: a gentle three-quarter view from above. */
const ELEVATION = (35 * Math.PI) / 180;
/** Day: classic corner view. Week: turned so the row of clearings runs across the screen. */
const YAW = { day: Math.PI / 4, week: (16 * Math.PI) / 180 } as const;
const ISLAND_MARGIN = 5;
const ISLAND_DEPTH = 3;
const WOBBLE_MS = 900;
const WOBBLE_STAGGER_MS = 55;

const COLOUR = {
  grass: '#86b55b',
  clearing: '#a3c96b',
  meadow: '#bdd27a',
  path: '#d8c493',
  speck: '#6f9c49',
  soil: 0x9a7350
};

function islandBounds(days: GroveDay[], origin: { x: number; z: number }) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const day of days) {
    const x = day.cx - origin.x;
    const z = day.cz - origin.z;
    const r = day.radius + ISLAND_MARGIN;
    minX = Math.min(minX, x - r);
    maxX = Math.max(maxX, x + r);
    minZ = Math.min(minZ, z - r);
    maxZ = Math.max(maxZ, z + r);
  }
  return { minX, maxX, minZ, maxZ };
}

function roundedRect(minX: number, maxX: number, minZ: number, maxZ: number, radius: number): InstanceType<typeof Shape> {
  const r = Math.min(radius, (maxX - minX) / 2, (maxZ - minZ) / 2);
  const shape = new Shape();
  // Shape lives in x/y; the island is rotated so shape y becomes world -z.
  shape.moveTo(minX + r, -maxZ);
  shape.lineTo(maxX - r, -maxZ);
  shape.quadraticCurveTo(maxX, -maxZ, maxX, -maxZ + r);
  shape.lineTo(maxX, -minZ - r);
  shape.quadraticCurveTo(maxX, -minZ, maxX - r, -minZ);
  shape.lineTo(minX + r, -minZ);
  shape.quadraticCurveTo(minX, -minZ, minX, -minZ - r);
  shape.lineTo(minX, -maxZ + r);
  shape.quadraticCurveTo(minX, -maxZ, minX + r, -maxZ);
  return shape;
}

/** Painted ground: grass, a lighter clearing per day, warmer meadows at weekends, a path between days. */
function groundTexture(days: GroveDay[], origin: { x: number; z: number }, b: ReturnType<typeof islandBounds>) {
  const width = b.maxX - b.minX;
  const depth = b.maxZ - b.minZ;
  const scale = Math.min(12, 2048 / Math.max(width, depth));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(64, Math.round(width * scale));
  canvas.height = Math.max(64, Math.round(depth * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const px = (x: number) => (x - origin.x - b.minX) * scale;
  const pz = (z: number) => (z - origin.z - b.minZ) * scale;
  ctx.fillStyle = COLOUR.grass;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = COLOUR.path;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1.3 * scale;
  ctx.lineCap = 'round';
  ctx.beginPath();
  days.forEach((day, i) => {
    if (i === 0) ctx.moveTo(px(day.cx), pz(day.cz));
    else {
      const prev = days[i - 1]!;
      const mx = (prev.cx + day.cx) / 2;
      const mz = (prev.cz + day.cz) / 2 + (i % 2 ? 3 : -3);
      ctx.quadraticCurveTo(px(mx), pz(mz), px(day.cx), pz(day.cz));
    }
  });
  ctx.stroke();
  ctx.globalAlpha = 1;

  for (const day of days) {
    const r = (day.radius + 2.5) * scale;
    const gradient = ctx.createRadialGradient(px(day.cx), pz(day.cz), r * 0.2, px(day.cx), pz(day.cz), r);
    const tone = day.weekend ? COLOUR.meadow : COLOUR.clearing;
    gradient.addColorStop(0, tone);
    gradient.addColorStop(0.75, tone);
    gradient.addColorStop(1, `${COLOUR.grass}00`);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(px(day.cx), pz(day.cz), r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Fixed speckle so the grass is not a flat sheet. Seeded by position, not Math.random.
  ctx.fillStyle = COLOUR.speck;
  ctx.globalAlpha = 0.18;
  let seed = 7;
  const next = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const specks = Math.round((canvas.width * canvas.height) / 90);
  for (let i = 0; i < specks; i += 1) ctx.fillRect(next() * canvas.width, next() * canvas.height, 1.5, 1.5);
  ctx.globalAlpha = 1;

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

type Template = { root: Grp; meshes: { geometry: unknown; material: unknown; matrix: Mat4 }[] };

export async function mountGroveScene(host: HTMLElement, options: GroveSceneOptions): Promise<GroveSceneHandle> {
  const { plan } = options;
  const origin = {
    x: plan.days.reduce((n, d) => n + d.cx, 0) / plan.days.length,
    z: plan.days.reduce((n, d) => n + d.cz, 0) / plan.days.length
  };
  const bounds = islandBounds(plan.days, origin);

  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);
  host.append(renderer.domElement);

  const scene = new Scene();
  scene.add(new HemisphereLight(0xf4f7ff, 0x7d8f5a, 1.6));
  scene.add(new AmbientLight(0xffffff, 0.25));
  const sun = new DirectionalLight(0xfff3dd, 2.4);
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
  sun.position.set(span * 0.35, span * 0.8 + 30, span * 0.25 + 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  const half = span / 2 + 8;
  Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: span * 3 + 120 });
  scene.add(sun);
  scene.add(sun.target);

  // Island: soil sides, painted grass top.
  const owned: { dispose(): void }[] = [];
  const shape = roundedRect(bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ, 9);
  const islandGeometry = new ExtrudeGeometry(shape, {
    depth: ISLAND_DEPTH,
    bevelEnabled: true,
    bevelThickness: 0.6,
    bevelSize: 0.6,
    bevelSegments: 2,
    curveSegments: 10
  });
  islandGeometry.rotateX(-Math.PI / 2);
  islandGeometry.translate(0, -ISLAND_DEPTH - 0.6, 0);
  const soil = new MeshStandardMaterial({ color: COLOUR.soil, roughness: 0.95 });
  const soilTop = new MeshStandardMaterial({ color: new Color(COLOUR.grass), roughness: 1 });
  const island = new Mesh(islandGeometry, [soilTop, soil]);
  island.receiveShadow = true;
  scene.add(island);
  owned.push(islandGeometry, soil, soilTop);

  const texture = groundTexture(plan.days, origin, bounds);
  const topGeometry = new PlaneGeometry(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
  topGeometry.rotateX(-Math.PI / 2);
  topGeometry.translate((bounds.minX + bounds.maxX) / 2, 0.01, (bounds.minZ + bounds.maxZ) / 2);
  const topMaterial = new MeshStandardMaterial({ map: texture ?? undefined, color: texture ? 0xffffff : COLOUR.grass, roughness: 1 });
  const top = new Mesh(topGeometry, topMaterial);
  top.receiveShadow = true;
  scene.add(top);
  owned.push(topGeometry, topMaterial);
  if (texture) owned.push(texture);

  // Models.
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const templates = new Map<string, Promise<Template>>();
  function template(file: string): Promise<Template> {
    const cached = templates.get(file);
    if (cached) return cached;
    const pending: Promise<Template> = loader.loadAsync(groveAssetUrl(file)).then((gltf: { scene: Grp }) => {
        const root = gltf.scene;
        root.updateMatrixWorld(true);
        const meshes: Template['meshes'] = [];
        root.traverse((node: Obj3) => {
          if (!node.isMesh) return;
          node.castShadow = true;
          node.receiveShadow = true;
          meshes.push({ geometry: node.geometry, material: node.material, matrix: node.matrixWorld.clone() });
        });
        return { root, meshes };
      });
    templates.set(file, pending);
    return pending;
  }

  const treeFiles = new Set(plan.trees.map((t) => treeModelFile(t.species, t.variant)));
  const propFiles = new Set(plan.days.flatMap((d) => d.props.map((p) => propModelFile(p.kind, p.variant))));
  const loaded = await Promise.all([...treeFiles, ...propFiles].map(async (file) => [file, await template(file)] as const));
  const byFile = new Map(loaded);

  // Ground cover: one instanced mesh per model part, so a week of grass is a handful of draw calls.
  const propGroups = new Map<string, Mat4[]>();
  const position = new Vector3();
  const quaternion = new Quaternion();
  const scaleVec = new Vector3();
  const up = new Vector3(0, 1, 0);
  for (const day of plan.days) {
    for (const prop of day.props) {
      const file = propModelFile(prop.kind, prop.variant);
      position.set(day.cx - origin.x + prop.x, 0.01, day.cz - origin.z + prop.z);
      quaternion.setFromAxisAngle(up, prop.rotation);
      scaleVec.setScalar(prop.scale);
      const list = propGroups.get(file) ?? [];
      list.push(new Matrix4().compose(position, quaternion, scaleVec));
      propGroups.set(file, list);
    }
  }
  const instanced: InstanceType<typeof InstancedMesh>[] = [];
  for (const [file, matrices] of propGroups) {
    const tpl = byFile.get(file);
    if (!tpl) continue;
    for (const part of tpl.meshes) {
      const mesh = new InstancedMesh(part.geometry, part.material, matrices.length);
      matrices.forEach((m, i) => mesh.setMatrixAt(i, new Matrix4().multiplyMatrices(m, part.matrix)));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      scene.add(mesh);
      instanced.push(mesh);
    }
  }

  // Trees: one group each, so they can be picked and wobble on their own.
  type Planted = { tree: GroveTree; group: Grp; delay: number; wobbles: boolean };
  const planted: Planted[] = [];
  const pickables: Obj3[] = [];
  let order = 0;
  for (const day of plan.days) {
    for (const tree of day.trees) {
      const tpl = byFile.get(treeModelFile(tree.species, tree.variant));
      if (!tpl) continue;
      const group = new Group();
      const body = tpl.root.clone(true);
      group.add(body);
      group.position.set(day.cx - origin.x + tree.x, 0.01, day.cz - origin.z + tree.z);
      group.rotation.y = tree.rotation;
      group.scale.setScalar(tree.scale);
      group.userData.treeId = tree.id;
      body.traverse((node: Obj3) => {
        node.userData.treeId = tree.id;
      });
      scene.add(group);
      pickables.push(group);
      const wobbles = !options.reducedMotion && (options.wobble === 'all' || options.wobble.has(tree.id));
      planted.push({ tree, group, delay: wobbles ? order * WOBBLE_STAGGER_MS : 0, wobbles });
      if (wobbles) {
        order += 1;
        group.scale.setScalar(0.0001);
      }
    }
  }

  // Camera.
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 2000);
  const dist = span * 2 + 200;
  const direction = new Vector3(Math.cos(ELEVATION) * Math.sin(YAW[plan.view]), Math.sin(ELEVATION), Math.cos(ELEVATION) * Math.cos(YAW[plan.view]));
  const focus = options.focusKey ? plan.days.find((d) => d.key === options.focusKey) : null;
  const target = new Vector3(focus ? focus.cx - origin.x : 0, 0, focus ? focus.cz - origin.z : 0);
  camera.position.copy(target).addScaledVector(direction, dist);
  camera.lookAt(target);

  let controls: { update(): void; dispose(): void; addEventListener(t: string, f: () => void): void; target: Vec3; [k: string]: unknown } | null = null;
  if (options.interactive) {
    const orbit = new OrbitControls(camera, renderer.domElement);
    controls = orbit;
    Object.assign(orbit, {
      enableRotate: true,
      enableDamping: false,
      screenSpacePanning: false,
      minPolarAngle: Math.PI / 2 - ELEVATION - 0.35,
      maxPolarAngle: Math.PI / 2 - ELEVATION + 0.2,
      minZoom: 0.5,
      maxZoom: 6,
      zoomToCursor: true
    });
    orbit.target.copy(target);
    orbit.update();
    orbit.addEventListener('change', () => {
      clampTarget();
      requestRender();
    });
  }

  /** Keep the island in view while panning. */
  function clampTarget(): void {
    if (!controls) return;
    const t = controls.target;
    const cx = Math.min(bounds.maxX, Math.max(bounds.minX, t.x));
    const cz = Math.min(bounds.maxZ, Math.max(bounds.minZ, t.z));
    if (cx !== t.x || cz !== t.z || t.y !== 0) {
      const shift = new Vector3(cx - t.x, -t.y, cz - t.z);
      t.add(shift);
      camera.position.add(shift);
    }
  }

  /** Fit the frame to the clearings (not the island), so trees are as large as the screen allows. */
  function fit(width: number, height: number): void {
    const aspect = width / Math.max(1, height);
    camera.updateMatrixWorld(true);
    const view = camera.matrixWorldInverse;
    const box = new Box3();
    const point = new Vector3();
    const frameDays = (days: GroveDay[]) => {
      box.makeEmpty();
      for (const d of days) {
        const r = d.radius + 1.5;
        const tallest = d.trees.reduce((m, t) => Math.max(m, 6 * t.scale), 1);
        for (let i = 0; i < 16; i += 1) {
          const a = (i / 16) * Math.PI * 2;
          const x = d.cx - origin.x + Math.cos(a) * r;
          const z = d.cz - origin.z + Math.sin(a) * r;
          box.expandByPoint(point.set(x, 0, z).applyMatrix4(view));
          box.expandByPoint(point.set(x, tallest, z).applyMatrix4(view));
        }
      }
    };
    frameDays(plan.days);
    // If the whole window would draw a mature tree under ~25 px, frame the focus day and let the rest pan in.
    const metres = Math.max((box.max.x - box.min.x) / width, (box.max.y - box.min.y) / height);
    if (1 / metres < 4.5 && focus) frameDays([focus]);
    const padX = (box.max.x - box.min.x) * 0.06;
    const padTop = (box.max.y - box.min.y) * 0.16; // room for the toolbar and caption
    const padBottom = (box.max.y - box.min.y) * 0.06;
    let left = box.min.x - padX;
    let right = box.max.x + padX;
    let bottom = box.min.y - padBottom;
    let top = box.max.y + padTop;
    const w = right - left;
    const h = top - bottom;
    if (w / h > aspect) {
      const grow = (w / aspect - h) / 2;
      top += grow;
      bottom -= grow;
    } else {
      const grow = (h * aspect - w) / 2;
      left -= grow;
      right += grow;
    }
    camera.left = left;
    camera.right = right;
    camera.top = top;
    camera.bottom = bottom;
    camera.zoom = 1;
    camera.updateProjectionMatrix();
  }

  // Render loop, on demand.
  let frame = 0;
  let disposed = false;
  const start = performance.now();
  let animating = planted.some((p) => p.wobbles);

  function wobbleScale(p: Planted, now: number): number {
    const t = (now - start - p.delay) / WOBBLE_MS;
    if (t <= 0) return 0.0001;
    if (t >= 1) return p.tree.scale;
    // Damped spring: overshoot, settle.
    const s = 1 - Math.exp(-6 * t) * Math.cos(t * 11);
    return Math.max(0.0001, p.tree.scale * s);
  }

  function draw(now: number): void {
    frame = 0;
    if (disposed) return;
    if (animating) {
      let still = true;
      for (const p of planted) {
        if (!p.wobbles) continue;
        const s = wobbleScale(p, now);
        p.group.scale.setScalar(s);
        if (now - start - p.delay < WOBBLE_MS) still = false;
      }
      if (still) {
        for (const p of planted) p.group.scale.setScalar(p.tree.scale);
        animating = false;
      }
    }
    renderer.render(scene, camera);
    if (animating) requestRender();
  }

  function requestRender(): void {
    if (!frame && !disposed) frame = requestAnimationFrame(draw);
  }

  function resize(): void {
    const width = host.clientWidth || 1;
    const height = host.clientHeight || 1;
    renderer.setSize(width, height, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    fit(width, height);
    requestRender();
  }

  // Picking: a tap is a pointer that barely moved.
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  let downAt: { x: number; y: number } | null = null;
  function pick(clientX: number, clientY: number): string | null {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pickables, true)[0];
    return (hit?.object?.userData?.treeId as string | undefined) ?? null;
  }
  const onDown = (e: PointerEvent) => {
    downAt = { x: e.clientX, y: e.clientY };
  };
  const onUp = (e: PointerEvent) => {
    if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) {
      downAt = null;
      return;
    }
    downAt = null;
    options.onPick?.(pick(e.clientX, e.clientY), e.clientX, e.clientY);
  };
  if (options.interactive) {
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);
  }

  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => resize()) : null;
  observer?.observe(host);
  resize();

  return {
    resize,
    dispose() {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      controls?.dispose();
      for (const mesh of instanced) mesh.dispose();
      for (const item of owned) item.dispose();
      void Promise.all(templates.values()).then((list) => {
        for (const tpl of list) {
          tpl.root.traverse((node: Obj3) => {
            node.geometry?.dispose();
            const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
            for (const m of materials as { dispose(): void; map?: { dispose(): void } }[]) {
              m.map?.dispose();
              m.dispose();
            }
          });
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    }
  };
}
