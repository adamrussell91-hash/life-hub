/**
 * Grove three.js scene: an island of clearings drawn from a GrovePlan.
 *
 * Renders on demand only. Trees wobble up once when the scene opens (or when a task is
 * finished while it is open), then the loop stops; nothing animates forever.
 */
import {
  AmbientLight,
  Box3,
  CylinderGeometry,
  ConeGeometry,
  IcosahedronGeometry,
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
import {MOUSE, TOUCH} from 'three';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { propModelFile, treeModelFile } from '@/domain/grove/assets';
import type { GroveDay, GrovePlan, GroveTree } from '@/domain/grove/plan';
import { shoreProps } from '@/domain/grove/shore';
import { sampleTerrain } from '@/domain/grove/terrain';
import { createGroveAnimals } from './animals';
import { createGroveGround } from './ground';
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
  wildlifePaused?: boolean;
  cameraState?: GroveCameraState;
  onWildlife?: (count: number, missing: string[], credits: string[]) => void;
  onPick?: (treeId: string | null, clientX: number, clientY: number) => void;
};

export type GroveSceneHandle = {
  resize(): void;
  setWildlifePaused(paused: boolean): void;
  cameraState(): GroveCameraState;
  dispose(): void;
};
export type GroveCameraState = {
  position: [number,number,number]; target: [number,number,number]; zoom: number;
  left: number;right: number;top: number;bottom: number;
};

/** Camera elevation and turn: a gentle three-quarter view from above. */
const ELEVATION = (35 * Math.PI) / 180;
/** Day: classic corner view. Week: turned so the row of clearings runs across the screen. */
const YAW = { day: Math.PI / 4, week: (16 * Math.PI) / 180, term: (16 * Math.PI) / 180, year: (16 * Math.PI) / 180 } as const;
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
  host.dataset.state = 'loading';
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
  // Keep the old extruded cap below the lowest basin bed; it must not occlude terrain/water.
  islandGeometry.translate(0, -ISLAND_DEPTH - 2, 0);
  const soil = new MeshStandardMaterial({ color: COLOUR.soil, roughness: 0.95 });
  const soilTop = new MeshStandardMaterial({ color: new Color(COLOUR.grass), roughness: 1 });
  const island = new Mesh(islandGeometry, [soilTop, soil]);
  island.receiveShadow = true;
  scene.add(island);
  owned.push(islandGeometry, soil, soilTop);

  const terrain = createGroveGround(plan.days, origin, bounds);
  scene.add(terrain.root);
  owned.push(terrain);
  const broad = plan.view === 'term' || plan.view === 'year';

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

  const treeFiles = new Set((broad ? [] : plan.trees).map((t) => treeModelFile(t.species, t.variant)));
  const shoreline = shoreProps({minX:bounds.minX+origin.x,maxX:bounds.maxX+origin.x,minZ:bounds.minZ+origin.z,maxZ:bounds.maxZ+origin.z});
  const propFiles = new Set(plan.days.flatMap((d) => (broad ? d.props.filter(p => p.kind === 'bush' || p.kind === 'rock') : d.props).map((p) => propModelFile(p.kind, p.variant))));
  for (const prop of shoreline) propFiles.add(prop.file);
  let loaded: (readonly [string, Template])[];
  try {
    loaded = await Promise.all([...treeFiles, ...propFiles].map(async (file) => [file, await template(file)] as const));
  } catch (error) {
    for (const item of owned) item.dispose();
    const settled = await Promise.allSettled(templates.values());
    for (const result of settled) if (result.status === 'fulfilled') result.value.root.traverse((node: Obj3) => {
      node.geometry?.dispose();
      for (const material of Array.isArray(node.material) ? node.material : node.material ? [node.material] : []) { material.map?.dispose();material.dispose(); }
    });
    renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();
    throw error;
  }
  const byFile = new Map(loaded);

  // Ground cover: one instanced mesh per model part, so a week of grass is a handful of draw calls.
  const propGroups = new Map<string, Mat4[]>();
  const position = new Vector3();
  const quaternion = new Quaternion();
  const scaleVec = new Vector3();
  const up = new Vector3(0, 1, 0);
  for (const day of plan.days) {
    for (const prop of day.props) {
      if (broad && prop.kind !== 'bush' && prop.kind !== 'rock') continue;
      const file = propModelFile(prop.kind, prop.variant);
      position.set(day.cx - origin.x + prop.x, sampleTerrain(day.cx + prop.x, day.cz + prop.z).height + 0.01, day.cz - origin.z + prop.z);
      quaternion.setFromAxisAngle(up, prop.rotation);
      scaleVec.setScalar(prop.scale);
      const list = propGroups.get(file) ?? [];
      list.push(new Matrix4().compose(position, quaternion, scaleVec));
      propGroups.set(file, list);
    }
  }
  for (const prop of shoreline) {
    position.set(prop.x-origin.x,prop.y,prop.z-origin.z);
    quaternion.setFromAxisAngle(up,prop.rotation);scaleVec.setScalar(prop.scale);
    const list=propGroups.get(prop.file)??[];list.push(new Matrix4().compose(position,quaternion,scaleVec));propGroups.set(prop.file,list);
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
    for (const tree of broad ? [] : day.trees) {
      const tpl = byFile.get(treeModelFile(tree.species, tree.variant));
      if (!tpl) continue;
      const group = new Group();
      const body = tpl.root.clone(true);
      group.add(body);
      group.position.set(day.cx - origin.x + tree.x, sampleTerrain(day.cx + tree.x, day.cz + tree.z).height + 0.01, day.cz - origin.z + tree.z);
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

  // Broad views batch simple faceted trees. Each picked instance still maps to its real task.
  if (broad) {
    const colours: Record<string,string> = {life:'#3f7a3a',teaching:'#5f8f37',health:'#9cc24a',wedding:'#e7a1bf',other:'#76a447',late:'#89634b'};
    for (const species of Object.keys(colours)) {
      const trees=plan.days.flatMap(day => day.trees.filter(t=>t.species===species).map(tree=>({day,tree})));
      if (!trees.length) continue;
      const trunkGeometry=new CylinderGeometry(.15,.22,2,5), crownGeometry=species==='life' ? new ConeGeometry(1.5,4.5,5) : new IcosahedronGeometry(1.8,0);
      const trunkMaterial=new MeshStandardMaterial({color:'#785740',flatShading:true}),crownMaterial=new MeshStandardMaterial({color:colours[species],flatShading:true});
      owned.push(trunkGeometry,crownGeometry,trunkMaterial,crownMaterial);
      for (const [geometry, material, height] of [[trunkGeometry,trunkMaterial,1],[crownGeometry,crownMaterial,3.5]] as const) {
        const mesh=new InstancedMesh(geometry,material,trees.length);
        trees.forEach(({day,tree},i)=>{
          position.set(day.cx-origin.x+tree.x,sampleTerrain(day.cx+tree.x,day.cz+tree.z).height+height*tree.scale,day.cz-origin.z+tree.z);
          quaternion.setFromAxisAngle(up,tree.rotation);scaleVec.setScalar(tree.scale);
          mesh.setMatrixAt(i,new Matrix4().compose(position,quaternion,scaleVec));
        });
        mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();mesh.castShadow=false;mesh.receiveShadow=true;
        mesh.userData.treeIds=trees.map(({tree})=>tree.id);
        scene.add(mesh);pickables.push(mesh);instanced.push(mesh);
      }
    }
  }

  const animals = await createGroveAnimals(plan, origin, options.focusKey).catch(error => {
    console.warn('Grove wildlife unavailable',error);
    return {root: new Group(),missing: ['wildlife'],credits: [] as string[],update:()=>false,dispose(){}};
  });
  scene.add(animals.root);owned.push(animals);
  options.onWildlife?.(animals.root.children.length,animals.missing,animals.credits);
  let wildlifePaused = !!options.wildlifePaused || options.reducedMotion;
  let inViewport = true;

  // Camera.
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, span * 5 + 1000);
  const dist = span * 2 + 200;
  const direction = new Vector3(Math.cos(ELEVATION) * Math.sin(YAW[plan.view]), Math.sin(ELEVATION), Math.cos(ELEVATION) * Math.cos(YAW[plan.view]));
  const focus = options.focusKey ? plan.days.find((d) => d.key === options.focusKey) : null;
  const target = new Vector3(focus ? focus.cx - origin.x : 0, 0, focus ? focus.cz - origin.z : 0);
  camera.position.copy(target).addScaledVector(direction, dist);
  camera.lookAt(target);

  let controls: { update(): void; dispose(): void; addEventListener(t: string, f: () => void): void; target: Vec3; [k: string]: unknown } | null = null;
  if (options.interactive) {
    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.mouseButtons = {LEFT:MOUSE.PAN,MIDDLE:MOUSE.DOLLY,RIGHT:MOUSE.ROTATE};
    orbit.touches = {ONE:TOUCH.PAN,TWO:TOUCH.DOLLY_PAN};
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
        const tallest = d.trees.reduce((m, t) => Math.max(m, 6 * t.scale), 1) + 3;
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
    if (width < 720 && 1 / metres < 4.5 && focus) frameDays([focus]);
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

  let previousFrame = performance.now();
  let wildlifeSeconds = 0;
  const projected = new Vector3();
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
    const delta = Math.min(.05,Math.max(0,(now-previousFrame)/1000));
    previousFrame = now;
    let activeWildlife = false;
    if (!wildlifePaused && inViewport && !document.hidden) {
      wildlifeSeconds += delta;
      activeWildlife = animals.update(wildlifeSeconds,delta,(object: Obj3) => {
      projected.copy(object.position).project(camera);
      if (host.clientHeight * camera.zoom / (camera.top-camera.bottom) < 3) return false;
      return Math.abs(projected.x)<1.15 && Math.abs(projected.y)<1.15 && projected.z<1;
    });
    }
    renderer.render(scene, camera);
    host.dataset.state = 'ready';
    if (animating || activeWildlife) requestRender();
  }

  function requestRender(): void {
    if (!frame && !disposed) frame = requestAnimationFrame(draw);
  }

  let framed = false;
  function resize(): void {
    const width = host.clientWidth || 1;
    const height = host.clientHeight || 1;
    renderer.setSize(width, height, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    if (!framed) {
      fit(width, height);
      const saved=options.cameraState;
      if(saved) {
        camera.position.set(...saved.position);target.set(...saved.target);
        if(controls) {controls.target.copy(target);controls.update();} else camera.lookAt(target);
        Object.assign(camera,{zoom:saved.zoom,left:saved.left,right:saved.right,top:saved.top,bottom:saved.bottom});
        camera.updateProjectionMatrix();
      }
      framed=true;
    } else {
      const centre=(camera.left+camera.right)/2,half=(camera.top-camera.bottom)/2*width/height;
      camera.left=centre-half;camera.right=centre+half;camera.updateProjectionMatrix();
    }
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
    return (hit?.instanceId != null ? hit.object.userData.treeIds?.[hit.instanceId] : hit?.object?.userData?.treeId) ?? null;
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

  const visibility = () => {previousFrame=performance.now();if(!document.hidden && inViewport) requestRender();};
  document.addEventListener('visibilitychange',visibility);
  const intersection = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    inViewport=!!entries[0]?.isIntersecting;
    if(inViewport) {previousFrame=performance.now();requestRender();}
  }) : null;
  intersection?.observe(host);
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => resize()) : null;
  observer?.observe(host);
  resize();

  return {
    resize,
    cameraState() {
      const focus=controls?.target??target;
      return {position:[camera.position.x,camera.position.y,camera.position.z],target:[focus.x,focus.y,focus.z],zoom:camera.zoom,left:camera.left,right:camera.right,top:camera.top,bottom:camera.bottom};
    },
    setWildlifePaused(paused) { wildlifePaused=paused || options.reducedMotion;previousFrame=performance.now();requestRender(); },
    dispose() {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
      intersection?.disconnect();
      document.removeEventListener('visibilitychange',visibility);
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
      renderer.forceContextLoss();
      renderer.domElement.remove();
    }
  };
}
