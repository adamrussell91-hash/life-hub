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
/** Signals are drawn larger than life so they beat the scenery at a glance (C10). */
const SIGNAL = 2.5;
/** Room kept clear at the top of the stage for the HUD, and the margin around the fitted city (C9). */
const HUD_PX = 76;
const FIT_MARGIN = 0.06;

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
  lilac: 0xe8e0f1,
  /** Figure and ground keep their own value bands, day and night (C11). */
  land: 0xd8d0b8,
  water: 0x4f86b3,
  waterNight: 0x5a8fbb,
  plinth: 0x6b5a48,
  halo: 0xffc94a
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
  const ambient = new AmbientLight(0xffffff, 0.72);
  scene.add(ambient);
  const sun = new DirectionalLight(0xffffff, 1.15);
  sun.position.set(40, 70, 30);
  scene.add(sun);

  const renderer = new WebGLRenderer({ antialias: true, alpha: false });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  host.append(renderer.domElement);

  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
  const corners = fitCorners(finalPlan);
  const center = cornersCenter(corners);
  if (!cityCameraState().touched) updateCityCamera({ zoom: 1 });
  if (import.meta.env.DEV) {
    console.info('[city] roads', finalPlan.roads.length, 'scenery', finalPlan.scenery.length);
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
  const signs: Object3D[] = [];
  const stopMeshes = new Map<string, Mesh>();
  const hideable = new Map<string, Object3D>();
  const vehicles: { mesh: Object3D; path: Point[]; index: number; count: number; parked: boolean; at: Point }[] = [];
  const trams: { mesh: Object3D; loop: Point[] }[] = [];

  for (const stop of finalPlan.stops) {
    // Base sits on the street so a finished stop can shrink in place.
    const geometry = new BoxGeometry(0.18 * SIGNAL, 0.42 * SIGNAL, 0.18 * SIGNAL);
    geometry.translate(0, 0.21 * SIGNAL, 0);
    const mesh = new Mesh(geometry, new MeshStandardMaterial({ color: TOKEN.paper, roughness: 0.6 }));
    place(mesh, stop.at, 0.02);
    tag(mesh, stop.id, pickables);
    scene.add(mesh);
    stopMeshes.set(stop.id, mesh);
  }
  for (const barrier of finalPlan.barriers) {
    const mesh = new Mesh(
      new BoxGeometry(0.12 * SIGNAL, 0.24 * SIGNAL, 0.72 * SIGNAL),
      new MeshStandardMaterial({ color: TOKEN.ink, roughness: 0.8 })
    );
    // Lanes run east-west, so the long side spans the road north-south.
    place(mesh, barrier.at, 0.12 * SIGNAL);
    tag(mesh, barrier.id, pickables);
    scene.add(mesh);
  }
  for (const ring of finalPlan.rings) {
    const mesh = new Mesh(
      new RingGeometry(0.34 * SIGNAL, 0.48 * SIGNAL, 28),
      new MeshStandardMaterial({ color: TOKEN.wave, roughness: 0.5, side: DoubleSide })
    );
    mesh.rotation.x = -Math.PI / 2;
    place(mesh, ring.at, 0.08);
    tag(mesh, ring.id, pickables);
    scene.add(mesh);
  }
  if (finalPlan.halo) {
    const mesh = new Mesh(
      new RingGeometry(0.85 * SIGNAL, 1.1 * SIGNAL, 40),
      new MeshStandardMaterial({
        color: TOKEN.halo,
        emissive: TOKEN.halo,
        emissiveIntensity: 1,
        side: DoubleSide
      })
    );
    // The single most salient shape on screen. It faces the camera and never moves.
    place(mesh, finalPlan.halo.at, 1.3 * SIGNAL);
    tag(mesh, finalPlan.halo.id, pickables);
    scene.add(mesh);
    signs.push(mesh);
  }
  for (const station of finalPlan.stations) {
    const mesh = new Mesh(
      new BoxGeometry(0.28 * SIGNAL, 0.16 * SIGNAL, 0.28 * SIGNAL),
      new MeshStandardMaterial({ color: LINE_HUE[hashId(station.id) % LINE_HUE.length] })
    );
    place(mesh, station.at, 0.5);
    tag(mesh, station.id, pickables);
    scene.add(mesh);
  }
  for (const line of finalPlan.lines) {
    const group = new Group();
    const colour = LINE_HUE[hashId(line.id) % LINE_HUE.length];
    for (let i = 1; i < line.path.length; i += 1) group.add(segmentMesh(line.path[i - 1], line.path[i], colour, 0.5));
    hideable.set(line.id, group);
    scene.add(group);
  }
  for (const mark of finalPlan.landmarks) {
    const mesh = fittedClone(await template('commercial-skyscraper-a.glb'), 0.95 * SIGNAL);
    place(mesh, mark.at, 0);
    tag(mesh, mark.id, pickables);
    scene.add(mesh);
  }
  for (const service of finalPlan.services) {
    const mesh = fittedClone(await template(service.file), (service.kind === 'crane' ? 0.95 : 0.7) * SIGNAL);
    place(mesh, service.at, 0);
    tag(mesh, service.id, pickables);
    hideable.set(service.id, mesh);
    scene.add(mesh);
  }
  for (const vehicle of finalPlan.vehicles) {
    const mesh = fittedClone(await template('van.glb'), 0.62 * SIGNAL);
    place(mesh, vehicle.at, 0);
    tag(mesh, vehicle.id, pickables);
    scene.add(mesh);
    vehicles.push({ mesh, path: vehicle.path, index: vehicle.index, count: vehicle.count, parked: vehicle.parked, at: vehicle.at });
  }
  for (const tram of finalPlan.trams) {
    const mesh = fittedClone(await template('train-tram-modern.glb'), 0.7 * SIGNAL);
    place(mesh, tram.loop[0] ?? { x: 0, y: 0 }, 0);
    tag(mesh, tram.id, pickables);
    scene.add(mesh);
    trams.push({ mesh, loop: tram.loop });
  }
  for (const sign of finalPlan.signs) {
    // A striped gate, not a word: the shape says "not running", the legend names it (V10).
    const mesh = signMesh();
    mesh.scale.setScalar(SIGNAL * 1.2);
    place(mesh, sign.at, 0.9 * SIGNAL);
    tag(mesh, sign.id, pickables);
    scene.add(mesh);
    signs.push(mesh);
  }

  // One pulse per catch-up change, played in turn at the place it happens.
  const pulses = finalPlan.changeMarks.map((mark) => {
    const material = new MeshStandardMaterial({
      color: TOKEN.halo,
      emissive: TOKEN.halo,
      emissiveIntensity: 1,
      transparent: true,
      side: DoubleSide
    });
    const mesh = new Mesh(new RingGeometry(0.5, 0.75, 40), material);
    mesh.rotation.x = -Math.PI / 2;
    place(mesh, mark.at, 0.15);
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, material, index: mark.index, count: mark.count };
  });

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

  function applyReplay(t: number): void {
    const replaying = t < 1;
    // Everything not changing dims during the replay; emissive changes and pulses stay bright.
    ambient.intensity = replaying ? 0.4 : 0.72;
    sun.intensity = replaying ? 0.6 : 1.15;
    for (const pulse of pulses) {
      const local = t * pulse.count - pulse.index;
      const on = replaying && local >= 0 && local <= 1;
      pulse.mesh.visible = on;
      if (!on) continue;
      pulse.mesh.scale.setScalar(1 + local * 4);
      pulse.material.opacity = 1 - local * 0.75;
    }
  }

  function applyMask(t: number): void {
    applyReplay(t);
    const mask = replayMask(input.catchUp, t);
    const lit = litStopIds(input.snapshot, mask);
    for (const [id, mesh] of stopMeshes) {
      mesh.visible = !mask.hiddenStopIds.has(id);
      const material = mesh.material as MeshStandardMaterial;
      const on = lit.has(id);
      material.emissive.set(on ? TOKEN.gold : 0x000000);
      material.emissiveIntensity = on ? 0.85 : 0;
      material.color.set(on ? TOKEN.paper : TOKEN.orca);
      // Light is open or finished; a finished stop also drops to a low stub so it never reads as a barrier.
      mesh.scale.y = on ? 1 : 0.3;
    }
    for (const [id, object] of hideable) {
      object.visible = !mask.hiddenServiceIds.has(id) && !mask.hiddenLineIds.has(id);
    }
  }

  let viewW = 0;
  let viewH = 0;

  const fitCache = new Map<string, { left: number; right: number; top: number; bottom: number }>();

  function aim(target: typeof camera, yaw: number, lookX: number, lookZ: number): void {
    target.position.set(
      lookX + DIST * Math.cos(ELEV) * Math.sin(yaw),
      DIST * Math.sin(ELEV),
      lookZ + DIST * Math.cos(ELEV) * Math.cos(yaw)
    );
    target.up.set(0, 1, 0);
    target.lookAt(lookX, 0, lookZ);
    target.updateMatrixWorld(true);
  }

  /** Frustum that holds the whole city and its water below the HUD, per turn and stage size (C9). */
  function fittedFrustum(quarter: number, width: number, height: number) {
    const key = `${quarter}:${width}x${height}`;
    const cached = fitCache.get(key);
    if (cached) return cached;
    const probe = new OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
    aim(probe, cameraYaw(quarter), center.x, center.z);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const corner of corners) {
      const v = new Vector3(corner.x, corner.y, corner.z).applyMatrix4(probe.matrixWorldInverse);
      minX = Math.min(minX, v.x);
      maxX = Math.max(maxX, v.x);
      minY = Math.min(minY, v.y);
      maxY = Math.max(maxY, v.y);
    }
    const usable = Math.max(height - HUD_PX, height * 0.5);
    const perPx = Math.max(((maxX - minX) * (1 + 2 * FIT_MARGIN)) / width, ((maxY - minY) * (1 + 2 * FIT_MARGIN)) / usable);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const bottom = cy - (usable / 2) * perPx;
    const fit = { left: cx - (width / 2) * perPx, right: cx + (width / 2) * perPx, bottom, top: bottom + height * perPx };
    fitCache.set(key, fit);
    return fit;
  }

  function placeCamera(): void {
    const width = host.clientWidth || 1;
    const height = host.clientHeight || 1;
    if (width !== viewW || height !== viewH) {
      viewW = width;
      viewH = height;
      renderer.setSize(width, height, false);
    }
    const cam = cityCameraState();
    aim(camera, cameraYaw(cam.quarter), center.x + cam.panX, center.z + cam.panZ);
    const fit = fittedFrustum(cam.quarter, width, height);
    camera.zoom = cam.zoom;
    camera.left = fit.left;
    camera.right = fit.right;
    camera.top = fit.top;
    camera.bottom = fit.bottom;
    camera.updateProjectionMatrix();
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
      const scale = (camera.right - camera.left) / Math.max(viewW, 1) / cam.zoom;
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
  /**
   * A plain scroll belongs to the page, so scrolling past the city never zooms it.
   * Trackpad pinch in Chrome and Firefox arrives as wheel + ctrlKey; Ctrl/Cmd + scroll works too (C4).
   */
  function onWheel(event: WheelEvent): void {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const cam = cityCameraState();
    updateCityCamera({ zoom: cam.zoom * (event.deltaY > 0 ? 0.92 : 1.08), touched: true });
  }
  // Safari macOS reports trackpad pinch as gesture events, not wheel (C4).
  let gestureZoom = 1;
  function onGestureStart(event: Event): void {
    event.preventDefault();
    gestureZoom = cityCameraState().zoom;
  }
  function onGestureChange(event: Event): void {
    event.preventDefault();
    const scale = (event as Event & { scale?: number }).scale ?? 1;
    updateCityCamera({ zoom: gestureZoom * scale, touched: true });
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
  renderer.domElement.addEventListener('gesturestart', onGestureStart);
  renderer.domElement.addEventListener('gesturechange', onGestureChange);
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
      renderer.domElement.removeEventListener('gesturestart', onGestureStart);
      renderer.domElement.removeEventListener('gesturechange', onGestureChange);
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

/** World corners of the ground and its water, at street and roof height. */
function fitCorners(plan: CityPlan): { x: number; y: number; z: number }[] {
  const lo = tileWorld({ x: GROUND_EXTENT.river.fromX - 1, y: GROUND_EXTENT.harbour.fromY - 1 });
  const hi = tileWorld({ x: plan.bounds.maxX + 1, y: plan.bounds.maxY + 1 });
  const out: { x: number; y: number; z: number }[] = [];
  for (const x of [lo.x, hi.x]) for (const z of [lo.z, hi.z]) for (const y of [-1, 2]) out.push({ x, y, z });
  return out;
}

function cornersCenter(corners: { x: number; z: number }[]): { x: number; z: number } {
  const xs = corners.map((c) => c.x);
  const zs = corners.map((c) => c.z);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2 };
}

function paintGround(scene: Scene, plan: CityPlan): void {
  const x0 = GROUND_EXTENT.river.fromX;
  const y0 = GROUND_EXTENT.harbour.fromY;
  const x1 = plan.bounds.maxX;
  const y1 = plan.bounds.maxY;
  const water = plan.isNight ? TOKEN.waterNight : TOKEN.water;
  // A diorama base: the city sits on a slab with dark sides, so it never floats on the sky (C11).
  // Top sits just under the land so the two never fight for the same depth.
  const slab = rect(x0, y0, x1, y1, TOKEN.plinth, -0.62);
  slab.geometry.dispose();
  slab.geometry = new BoxGeometry(Math.abs(x1 - x0) + 1, 1.2, Math.abs(y1 - y0) + 1);
  scene.add(slab);
  scene.add(rect(x0, y0, x1, y1, TOKEN.land, 0));
  // A dark rim round the board. Sky colour follows the forecast across the whole value range,
  // so no single land colour contrasts with every sky; the rim separates them in all of them (C11).
  const lo = tileWorld({ x: Math.min(x0, x1), y: Math.min(y0, y1) });
  const hi = tileWorld({ x: Math.max(x0, x1), y: Math.max(y0, y1) });
  const w = Math.abs(hi.x - lo.x) + 1;
  const d = Math.abs(hi.z - lo.z) + 1;
  const cx = (lo.x + hi.x) / 2;
  const cz = (lo.z + hi.z) / 2;
  const rim = new MeshStandardMaterial({ color: TOKEN.plinth, roughness: 1 });
  for (const [sx, sz, px, pz] of [
    [w + 0.6, 0.3, cx, cz - d / 2],
    [w + 0.6, 0.3, cx, cz + d / 2],
    [0.3, d + 0.6, cx - w / 2, cz],
    [0.3, d + 0.6, cx + w / 2, cz]
  ]) {
    const edge = new Mesh(new BoxGeometry(sx, 0.25, sz), rim);
    edge.position.set(px, 0.1, pz);
    scene.add(edge);
  }
  scene.add(rect(x0, GROUND_EXTENT.harbour.fromY, x1, GROUND_EXTENT.harbour.toY, water, 0.004));
  scene.add(rect(GROUND_EXTENT.river.fromX, y0, GROUND_EXTENT.river.toX, y1, water, 0.005));
  scene.add(rect(x0, GROUND_EXTENT.promenade.y, x1, GROUND_EXTENT.promenade.y, TOKEN.sand, 0.008));
  scene.add(rect(GROUND_EXTENT.promenade.x, y0, GROUND_EXTENT.promenade.x, y1, TOKEN.sand, 0.009));
  for (const tint of plan.tints) {
    scene.add(rect(tint.x0, tint.y0, tint.x1, tint.y1, DISTRICT_TINT[hashId(tint.id) % DISTRICT_TINT.length], 0.03, 0.45));
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
      // Scenery is background: washed lighter and lower in contrast than any signal (C10).
      const material = (part.material as MeshStandardMaterial).clone();
      material.emissive.set(plan.isNight ? TOKEN.gold : 0xffffff);
      material.emissiveIntensity = plan.isNight ? 0.22 : 0.32;
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
  const mesh = new Mesh(new BoxGeometry(0.3, 0.1, length), new MeshStandardMaterial({ color }));
  mesh.position.set((a.x + b.x) / 2, y, (a.z + b.z) / 2);
  mesh.rotation.y = Math.atan2(dx, dz);
  return mesh;
}

function signMesh(): Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = '#fbf8f2';
    context.fillRect(0, 0, 256, 64);
    context.fillStyle = '#13233a';
    for (let x = -64; x < 256; x += 48) {
      context.beginPath();
      context.moveTo(x, 64);
      context.lineTo(x + 24, 64);
      context.lineTo(x + 88, 0);
      context.lineTo(x + 64, 0);
      context.closePath();
      context.fill();
    }
    context.strokeStyle = '#13233a';
    context.lineWidth = 6;
    context.strokeRect(3, 3, 250, 58);
  }
  return new Mesh(new PlaneGeometry(1.4, 0.35), new MeshStandardMaterial({ map: new CanvasTexture(canvas), roughness: 1, side: DoubleSide }));
}
