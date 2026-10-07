import {
  AmbientLight,
  Box3,
  BoxGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  OrthographicCamera,
  PlaneGeometry,
  Raycaster,
  RingGeometry,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
  type Material
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { CityLayout } from '@/domain/city/layout';
import type { CityCatchUp, CitySnapshot } from '@/domain/city/types';
import { cityCameraState, updateCityCamera } from './camera';
import { cityModelUrl, cityTextureRoot, MODEL_TEXTURE_PACK } from './model-url';
import {
  GROUND_EXTENT,
  litStopIds,
  planCity,
  replayMask,
  replayProgress,
  tileWorld,
  vehiclePose,
  type CityPlan,
  type Point
} from './plan';

const ELEV = Math.atan(1 / Math.sqrt(2));
const DIST = 96;
const FRUSTUM = 16;

/** Classic isometric sits on the corner. Q and E step a quarter turn from there. */
function cameraYaw(quarter: number): number {
  return Math.PI / 4 + quarter * (Math.PI / 2);
}

/** Closed kit colours. District and line hues are identity. Sky is capacity. */
const TOKEN = {
  paper: 0xfbf8f2,
  shore: 0xeae7da,
  sand: 0xf0cfac,
  navy: 0x17375e,
  wave: 0x376fb7,
  ink: 0x13233a,
  orca: 0x424860,
  gold: 0xf1e2b6,
  lilac: 0xe8e0f1
} as const;

const SKY: Record<string, number> = {
  clear: 0xdceafa,
  steady: 0xdfe9e1,
  wind: 0xa7abb9,
  cloud: 0xa7abb9,
  fog: 0xeae7da,
  rain: 0x244f7c,
  storm: 0x142b51,
  recovery: 0xf1e2b6,
  evening: 0x17375e,
  unknown: 0xeae7da
};

const DISTRICT_TINT = [0xdceafa, 0xdfe9e1, 0xf2dfd0, 0xf1e2b6, 0xe8e0f1];
const LINE_HUE = [0x376fb7, 0x17375e, 0x244f7c, 0x142b51];

const ROAD_FILE: Record<CityPlan['roads'][number]['kind'], string> = {
  straight: 'road-straight.glb',
  bend: 'road-bend.glb',
  end: 'road-end.glb',
  tee: 'road-intersection.glb',
  cross: 'road-crossroad.glb'
};

export type CitySceneHandle = {
  dispose: () => void;
  skip: () => void;
  resize: () => void;
  fps: () => number;
};

function travelYaw(at: Point, ahead: Point): number {
  const dx = -(ahead.x - at.x);
  const dz = -(ahead.y - at.y);
  if (dx === 0 && dz === 0) return 0;
  return Math.atan2(-dx, dz);
}

function hashId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 33 + id.charCodeAt(i)) >>> 0;
  return hash;
}

export async function mountCityScene(
  host: HTMLElement,
  input: {
    snapshot: CitySnapshot;
    layout: CityLayout;
    catchUp: CityCatchUp;
    reducedMotion: boolean;
    onHover: (id: string | null, clientX: number, clientY: number) => void;
    onPick: (id: string | null) => void;
    onReplay: (t: number) => void;
  }
): Promise<CitySceneHandle> {
  const settled = input.reducedMotion || input.catchUp.quiet;
  const finalPlan = planCity(input.snapshot, input.layout, input.catchUp, 1, input.reducedMotion);
  if (import.meta.env.DEV) console.info('[city] moving', finalPlan.movingIds.join(' '));
  host.dataset.moving = finalPlan.movingIds.join(' ');

  const scene = new Scene();
  scene.background = new Color(SKY[finalPlan.skyFamily] ?? SKY.unknown);
  scene.add(new AmbientLight(0xffffff, 0.72));
  const sun = new DirectionalLight(0xffffff, 1.15);
  sun.position.set(40, 70, 30);
  scene.add(sun);

  const renderer = new WebGLRenderer({ antialias: true, alpha: false });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  host.append(renderer.domElement);

  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
  const center = cityCenter(finalPlan);
  const span = activitySpan(finalPlan);
  if (!cityCameraState().touched) {
    updateCityCamera({ zoom: Math.min(3.2, (FRUSTUM * 2) / Math.max(span, 6)) });
  }
  if (import.meta.env.DEV) {
    console.info('[city] span', span, 'zoom', cityCameraState().zoom, 'roads', finalPlan.roads.length, 'scenery', finalPlan.scenery.length);
  }

  const loader = new GLTFLoader();
  const templates = new Map<string, Group>();
  async function template(file: string): Promise<Group> {
    const cached = templates.get(file);
    if (cached) return cached;
    loader.resourcePath = cityTextureRoot(MODEL_TEXTURE_PACK[file] ?? 'roads');
    const gltf = await loader.loadAsync(cityModelUrl(file));
    templates.set(file, gltf.scene);
    return gltf.scene;
  }

  paintGround(scene, finalPlan);
  await paintRoads(scene, finalPlan, template);
  await paintScenery(scene, finalPlan, template);

  const pickables: Object3D[] = [];
  const stopMeshes = new Map<string, Mesh>();
  const hideable = new Map<string, Object3D>();
  const vehicles: { mesh: Object3D; path: Point[]; index: number; count: number; parked: boolean; at: Point }[] = [];
  const trams: { mesh: Object3D; loop: Point[] }[] = [];
  const signs: Object3D[] = [];

  for (const stop of finalPlan.stops) {
    const mesh = new Mesh(
      new BoxGeometry(0.18, 0.42, 0.18),
      new MeshStandardMaterial({ color: TOKEN.paper, roughness: 0.6 })
    );
    place(mesh, stop.at, 0.24);
    tag(mesh, stop.id, pickables);
    scene.add(mesh);
    stopMeshes.set(stop.id, mesh);
  }
  for (const barrier of finalPlan.barriers) {
    const mesh = new Mesh(
      new BoxGeometry(0.72, 0.28, 0.16),
      new MeshStandardMaterial({ color: TOKEN.ink, roughness: 0.8 })
    );
    place(mesh, barrier.at, 0.2);
    tag(mesh, barrier.id, pickables);
    scene.add(mesh);
  }
  for (const ring of finalPlan.rings) {
    const mesh = new Mesh(
      new RingGeometry(0.34, 0.48, 28),
      new MeshStandardMaterial({ color: TOKEN.wave, roughness: 0.5, side: DoubleSide })
    );
    mesh.rotation.x = -Math.PI / 2;
    place(mesh, ring.at, 0.08);
    tag(mesh, ring.id, pickables);
    scene.add(mesh);
  }
  if (finalPlan.halo) {
    const mesh = new Mesh(
      new RingGeometry(0.85, 1.05, 32),
      new MeshStandardMaterial({
        color: TOKEN.lilac,
        emissive: TOKEN.gold,
        emissiveIntensity: 0.35,
        side: DoubleSide
      })
    );
    place(mesh, finalPlan.halo.at, 1.7);
    tag(mesh, finalPlan.halo.id, pickables);
    scene.add(mesh);
  }
  for (const station of finalPlan.stations) {
    const mesh = new Mesh(
      new BoxGeometry(0.28, 0.16, 0.28),
      new MeshStandardMaterial({ color: LINE_HUE[hashId(station.id) % LINE_HUE.length] })
    );
    place(mesh, station.at, 0.45);
    tag(mesh, station.id, pickables);
    scene.add(mesh);
  }
  for (const line of finalPlan.lines) {
    const group = new Group();
    const colour = LINE_HUE[hashId(line.id) % LINE_HUE.length];
    for (let i = 1; i < line.path.length; i += 1) group.add(segmentMesh(line.path[i - 1], line.path[i], colour, 0.42));
    hideable.set(line.id, group);
    scene.add(group);
  }
  for (const mark of finalPlan.landmarks) {
    const mesh = fittedClone(await template('commercial-skyscraper-a.glb'), 1.15);
    place(mesh, mark.at, 0);
    tag(mesh, mark.id, pickables);
    scene.add(mesh);
  }
  for (const service of finalPlan.services) {
    const mesh = fittedClone(await template(service.file), service.kind === 'crane' ? 0.95 : 0.7);
    place(mesh, service.at, 0);
    tag(mesh, service.id, pickables);
    hideable.set(service.id, mesh);
    scene.add(mesh);
  }
  for (const vehicle of finalPlan.vehicles) {
    const mesh = fittedClone(await template('van.glb'), 0.62);
    place(mesh, vehicle.at, 0);
    tag(mesh, vehicle.id, pickables);
    scene.add(mesh);
    vehicles.push({ mesh, path: vehicle.path, index: vehicle.index, count: vehicle.count, parked: vehicle.parked, at: vehicle.at });
  }
  for (const tram of finalPlan.trams) {
    const mesh = fittedClone(await template('train-tram-modern.glb'), 0.7);
    place(mesh, tram.loop[0] ?? { x: 0, y: 0 }, 0);
    tag(mesh, tram.id, pickables);
    scene.add(mesh);
    trams.push({ mesh, loop: tram.loop });
  }
  for (const sign of finalPlan.signs) {
    const mesh = signMesh('Not running');
    place(mesh, sign.at, 1.1);
    tag(mesh, sign.id, pickables);
    scene.add(mesh);
    signs.push(mesh);
  }

  let disposed = false;
  let skipped = settled;
  const replayStart = performance.now();
  let frameId = 0;
  let frames = 0;
  let fpsStamp = replayStart;
  let fps = 0;
  let dragging = false;
  let dragMoved = false;
  let lastX = 0;
  let lastY = 0;
  const raycaster = new Raycaster();
  const pointer = new Vector2();

  function replayT(now: number): number {
    return replayProgress(now, replayStart, skipped);
  }

  function applyMask(t: number): void {
    const mask = replayMask(input.catchUp, t);
    const lit = litStopIds(input.snapshot, mask);
    for (const [id, mesh] of stopMeshes) {
      mesh.visible = !mask.hiddenStopIds.has(id);
      const material = mesh.material as MeshStandardMaterial;
      const on = lit.has(id);
      material.emissive.set(on ? TOKEN.gold : 0x000000);
      material.emissiveIntensity = on ? 0.85 : 0;
      material.color.set(on ? TOKEN.paper : TOKEN.orca);
    }
    for (const [id, object] of hideable) {
      object.visible = !mask.hiddenServiceIds.has(id) && !mask.hiddenLineIds.has(id);
    }
  }

  let viewW = 0;
  let viewH = 0;

  function placeCamera(): void {
    const width = host.clientWidth || 1;
    const height = host.clientHeight || 1;
    if (width !== viewW || height !== viewH) {
      viewW = width;
      viewH = height;
      renderer.setSize(width, height, false);
    }
    const aspect = width / height;
    const cam = cityCameraState();
    const yaw = cameraYaw(cam.quarter);
    const lookX = center.x + cam.panX;
    const lookZ = center.z + cam.panZ;
    camera.position.set(
      lookX + DIST * Math.cos(ELEV) * Math.sin(yaw),
      DIST * Math.sin(ELEV),
      lookZ + DIST * Math.cos(ELEV) * Math.cos(yaw)
    );
    camera.up.set(0, 1, 0);
    camera.lookAt(lookX, 0, lookZ);
    camera.zoom = cam.zoom;
    camera.left = -FRUSTUM * aspect;
    camera.right = FRUSTUM * aspect;
    camera.top = FRUSTUM;
    camera.bottom = -FRUSTUM;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    for (const sign of signs) sign.lookAt(camera.position);
  }

  function frame(now: number): void {
    if (disposed) return;
    const t = replayT(now);
    input.onReplay(t);
    applyMask(t);
    const motionTime = input.reducedMotion ? 0 : Math.max(0, now - replayStart) / 1000;
    for (const vehicle of vehicles) {
      if (vehicle.parked) {
        const world = tileWorld(vehicle.at);
        vehicle.mesh.position.x = world.x;
        vehicle.mesh.position.z = world.z;
        continue;
      }
      const pose = vehiclePose(vehicle.path, vehicle.index, vehicle.count, motionTime);
      const world = tileWorld(pose.at);
      vehicle.mesh.position.x = world.x;
      vehicle.mesh.position.z = world.z;
      vehicle.mesh.rotation.y = travelYaw(pose.at, pose.ahead);
    }
    for (const tram of trams) {
      const pose = vehiclePose(tram.loop, 0, 1, motionTime * 0.6);
      const world = tileWorld(pose.at);
      tram.mesh.position.x = world.x;
      tram.mesh.position.z = world.z;
      tram.mesh.rotation.y = travelYaw(pose.at, pose.ahead);
    }
    placeCamera();
    renderer.render(scene, camera);
    frames += 1;
    if (now - fpsStamp >= 1000) {
      fps = frames;
      frames = 0;
      fpsStamp = now;
      host.dataset.fps = String(fps);
    }
    frameId = requestAnimationFrame(frame);
  }

  function pick(event: PointerEvent): string | null {
    const rect = renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(pickables, true);
    for (const hit of hits) {
      let node: Object3D | null = hit.object;
      while (node) {
        const id = node.userData.inspectId as string | undefined;
        if (id) return id;
        node = node.parent;
      }
    }
    return null;
  }

  function onPointerDown(event: PointerEvent): void {
    if (replayT(performance.now()) < 1) {
      skipped = true;
      return;
    }
    dragging = true;
    dragMoved = false;
    lastX = event.clientX;
    lastY = event.clientY;
  }
  function onPointerMove(event: PointerEvent): void {
    if (dragging) {
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 3) dragMoved = true;
      lastX = event.clientX;
      lastY = event.clientY;
      const cam = cityCameraState();
      const yaw = cameraYaw(cam.quarter);
      const scale = 0.03 / cam.zoom;
      updateCityCamera({
        panX: cam.panX - (dx * Math.cos(yaw) + dy * Math.sin(yaw)) * scale,
        panZ: cam.panZ - (dx * -Math.sin(yaw) + dy * Math.cos(yaw)) * scale,
        touched: true
      });
      return;
    }
    input.onHover(pick(event), event.clientX, event.clientY);
  }
  function onPointerUp(event: PointerEvent): void {
    if (!dragging) return;
    dragging = false;
    if (!dragMoved) input.onPick(pick(event));
  }
  function onWheel(event: WheelEvent): void {
    event.preventDefault();
    const cam = cityCameraState();
    updateCityCamera({ zoom: cam.zoom * (event.deltaY > 0 ? 0.92 : 1.08), touched: true });
  }
  function onKey(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, [contenteditable]')) return;
    if (event.key === 'q' || event.key === 'Q') updateCityCamera({ quarter: cityCameraState().quarter + 1, touched: true });
    else if (event.key === 'e' || event.key === 'E') updateCityCamera({ quarter: cityCameraState().quarter - 1, touched: true });
  }

  applyMask(settled ? 1 : 0);
  placeCamera();
  renderer.render(scene, camera);
  host.dataset.ready = 'true';

  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKey);
  frameId = requestAnimationFrame(frame);

  return {
    fps: () => fps,
    skip: () => {
      skipped = true;
    },
    resize: () => placeCamera(),
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
      renderer.dispose();
      renderer.domElement.remove();
    }
  };
}

function tag(object: Object3D, id: string, pickables: Object3D[]): void {
  object.traverse((child: Object3D) => {
    child.userData.inspectId = id;
  });
  pickables.push(object);
}

function place(object: Object3D, at: Point, y: number): void {
  const world = tileWorld(at);
  object.position.set(world.x, y, world.z);
}

function fittedClone(source: Object3D, longest: number): Group {
  const holder = new Group();
  const inner = source.clone(true);
  inner.position.set(0, 0, 0);
  inner.rotation.set(0, 0, 0);
  inner.scale.set(1, 1, 1);
  holder.add(inner);
  inner.updateMatrixWorld(true);
  const box = new Box3().setFromObject(inner);
  const size = box.getSize(new Vector3());
  const scale = longest / Math.max(size.x, size.z, 0.001);
  inner.scale.setScalar(scale);
  inner.updateMatrixWorld(true);
  const fitted = new Box3().setFromObject(inner);
  const center = fitted.getCenter(new Vector3());
  inner.position.set(-center.x, -fitted.min.y, -center.z);
  return holder;
}

function activityPoints(plan: CityPlan): Point[] {
  const points = [plan.depot.at, ...plan.roads.map((road) => road.at), ...plan.stops.map((stop) => stop.at)];
  for (const vehicle of plan.vehicles) points.push(vehicle.at);
  for (const service of plan.services) points.push(service.at);
  if (plan.halo) points.push(plan.halo.at);
  return points;
}

function activitySpan(plan: CityPlan): number {
  const points = activityPoints(plan);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) + 4;
}

function cityCenter(plan: CityPlan): { x: number; z: number } {
  const points = activityPoints(plan);
  const midX = (Math.min(...points.map((point) => point.x)) + Math.max(...points.map((point) => point.x))) / 2;
  const midY = (Math.min(...points.map((point) => point.y)) + Math.max(...points.map((point) => point.y))) / 2;
  return tileWorld({ x: midX, y: midY });
}

function paintGround(scene: Scene, plan: CityPlan): void {
  const x0 = GROUND_EXTENT.river.fromX;
  const y0 = GROUND_EXTENT.harbour.fromY;
  const x1 = plan.bounds.maxX;
  const y1 = plan.bounds.maxY;
  scene.add(rect(x0, y0, x1, y1, TOKEN.shore, 0));
  scene.add(rect(x0, GROUND_EXTENT.harbour.fromY, x1, GROUND_EXTENT.harbour.toY, TOKEN.navy, 0.004));
  scene.add(rect(GROUND_EXTENT.river.fromX, y0, GROUND_EXTENT.river.toX, y1, TOKEN.navy, 0.005));
  scene.add(rect(x0, GROUND_EXTENT.promenade.y, x1, GROUND_EXTENT.promenade.y, TOKEN.sand, 0.008));
  scene.add(rect(GROUND_EXTENT.promenade.x, y0, GROUND_EXTENT.promenade.x, y1, TOKEN.sand, 0.009));
  for (const tint of plan.tints) {
    scene.add(rect(tint.x0, tint.y0, tint.x1, tint.y1, DISTRICT_TINT[hashId(tint.id) % DISTRICT_TINT.length], 0.012, 0.45));
  }
}

function rect(x0: number, y0: number, x1: number, y1: number, color: number, y: number, opacity?: number): Mesh {
  const width = Math.abs(x1 - x0) + 1;
  const depth = Math.abs(y1 - y0) + 1;
  const geometry = new PlaneGeometry(width, depth);
  geometry.rotateX(-Math.PI / 2);
  const material = new MeshStandardMaterial({
    color,
    roughness: 1,
    transparent: opacity != null,
    opacity: opacity ?? 1
  });
  const mesh = new Mesh(geometry, material);
  const lo = tileWorld({ x: Math.min(x0, x1), y: Math.min(y0, y1) });
  const hi = tileWorld({ x: Math.max(x0, x1), y: Math.max(y0, y1) });
  mesh.position.set((lo.x + hi.x) / 2, y, (lo.z + hi.z) / 2);
  return mesh;
}

async function paintRoads(
  scene: Scene,
  plan: CityPlan,
  template: (file: string) => Promise<Group>
): Promise<void> {
  const groups = new Map<string, CityPlan['roads']>();
  for (const road of plan.roads) {
    const key = `${road.kind}:${road.quarter}`;
    const list = groups.get(key) ?? [];
    list.push(road);
    groups.set(key, list);
  }
  for (const [key, roads] of groups) {
    const [kind, quarterText] = key.split(':');
    const source = await template(ROAD_FILE[kind as CityPlan['roads'][number]['kind']]);
    for (const part of meshParts(source)) {
      const mesh = new InstancedMesh(part.geometry, part.material, roads.length);
      const dummy = new Object3D();
      roads.forEach((road, index) => {
        const world = tileWorld(road.at);
        dummy.position.set(world.x, 0.02, world.z);
        dummy.rotation.set(0, Number(quarterText) * (Math.PI / 2), 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      scene.add(mesh);
    }
  }
}

async function paintScenery(
  scene: Scene,
  plan: CityPlan,
  template: (file: string) => Promise<Group>
): Promise<void> {
  const groups = new Map<string, CityPlan['scenery']>();
  for (const tile of plan.scenery) {
    const list = groups.get(tile.file) ?? [];
    list.push(tile);
    groups.set(tile.file, list);
  }
  for (const [file, tiles] of groups) {
    const fitted = fittedClone(await template(file), 0.82);
    for (const part of meshParts(fitted)) {
      const material = part.material as MeshStandardMaterial;
      if (plan.isNight && material.emissive) {
        material.emissive.set(TOKEN.gold);
        material.emissiveIntensity = 0.22;
      }
      const mesh = new InstancedMesh(part.geometry, material, tiles.length);
      const dummy = new Object3D();
      tiles.forEach((tile, index) => {
        const world = tileWorld(tile.at);
        dummy.position.set(world.x, 0.02, world.z);
        dummy.rotation.set(0, tile.quarter * (Math.PI / 2), 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      scene.add(mesh);
    }
  }
}

function meshParts(root: Object3D): { geometry: BufferGeometry; material: Material }[] {
  const parts: { geometry: BufferGeometry; material: Material }[] = [];
  root.updateMatrixWorld(true);
  root.traverse((obj: Object3D) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    parts.push({ geometry, material });
  });
  return parts;
}

function segmentMesh(from: Point, to: Point, color: number, y: number): Mesh {
  const a = tileWorld(from);
  const b = tileWorld(to);
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.max(Math.hypot(dx, dz), 0.001);
  const mesh = new Mesh(new BoxGeometry(0.12, 0.08, length), new MeshStandardMaterial({ color }));
  mesh.position.set((a.x + b.x) / 2, y, (a.z + b.z) / 2);
  mesh.rotation.y = Math.atan2(dx, dz);
  return mesh;
}

function signMesh(label: string): Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = '#fbf8f2';
    context.fillRect(0, 0, 256, 64);
    context.strokeStyle = '#13233a';
    context.lineWidth = 6;
    context.strokeRect(4, 4, 248, 56);
    context.fillStyle = '#13233a';
    context.font = '600 28px Inter, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(label, 128, 34);
  }
  return new Mesh(new PlaneGeometry(1.4, 0.35), new MeshStandardMaterial({ map: new CanvasTexture(canvas), roughness: 1 }));
}
