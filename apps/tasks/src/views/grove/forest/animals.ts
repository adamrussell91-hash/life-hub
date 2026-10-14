/**
 * Earned wildlife in the forest. Which animals exist comes from real milestones
 * (domain/grove/wildlife.ts and companions.ts); this decides where each one lives and how it moves.
 *
 * - Year view: every animal is out, and land animals wander the whole built island on trails found
 *   over walkable ground (bridges included), visiting other weeks and coming home.
 * - Week view: only the animals that week earned are shown, roaming a loop inside their own week.
 * - The mallard and otter keep to the lake; the robin hops and makes short flights; the owl (whose
 *   model has no flight cycle) perches on the tallest tree of its week and stays there.
 *
 * Sizes and speeds come from gait.ts, measured from the models themselves, so legs and ground agree.
 */
import { AnimationMixer, Group, LoopRepeat, Object3D, Raycaster, Scene, Box3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import type { WildlifeSpecies } from '@/domain/grove/wildlife';
import { groveAssetUrl } from '../asset-url';
import { BOUNDS, CELL, land, owner, type Cell, type Terrain } from './map';
import type { Placed } from './planting';
import { rng } from './noise';
import { weekOfDay } from './history';
import { createWalker, drawnScale, gaitFor, HEIGHT, routeOf, type Gait, type Rest, type Walker } from './gait';
import { buildWalkGrid, closedTour, findRoute, roundLoop, type Point, type WalkGrid } from './trails';

export type ForestAnimal = {
  /** Catalogue model id, e.g. animal-deer-doe. */
  model: string;
  species: WildlifeSpecies;
  name: string;
  earnedOn: string;
  reason: string;
  baby: boolean;
  swimming: boolean;
};

// three ships without type declarations here; clips and actions stay loosely typed.
type AnimationAction = any;
type AnimationClip = any;

type Asset = { id: string; file: string; roles: Record<string, string>; waterline: number };
type Mode = 'land' | 'water' | 'bird' | 'perch';

type Mover = {
  /** Year view: the whole island. Week view: the home week. Same walker for both when they share a route. */
  tour: Walker;
  local: Walker;
};

type Actor = {
  object: Object3D;
  mixer: AnimationMixer;
  actions: Map<string, AnimationAction>;
  current: AnimationAction | null;
  role: string;
  asset: Asset;
  animal: ForestAnimal;
  mode: Mode;
  scale: number;
  /** Native distance from the model's origin down to its feet. */
  footing: number;
  home: number;
  mover: Mover | null;
  /** Babies walk behind their parent on the same route. */
  parent: Actor | null;
  trail: number;
  legs: number;
  yaw: number;
  perch?: { x: number; y: number; z: number; yaw: number; turnIn: number; target: number };
};

const hashSeed = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export async function createForestAnimals(input: {
  scene: Scene; terrain: Terrain; cells: Cell[]; trees: Placed[]; year: number; builtWeeks: number; animals: ForestAnimal[];
  /** Walking height at (x, z): the ground, or a bridge deck where one spans the river. */
  surface: (x: number, z: number) => number;
  /** True on a bridge deck. */
  onDeck: (x: number, z: number) => boolean;
  /** Top of a planted tree's crown, if it can be found. */
  treeTop: (tree: Placed) => number | null;
}) {
  const { scene, terrain, cells, trees, year, builtWeeks, surface, onDeck } = input;
  const root = new Group();
  root.name = 'grove-wildlife';
  scene.add(root);
  const actors: Actor[] = [];
  const response = await fetch(groveAssetUrl('animal-catalogue.json'));
  if (!response.ok) throw new Error('Animal catalogue unavailable');
  const catalogue = (await response.json()) as { assets: Asset[] };
  const assets = new Map(catalogue.assets.map((a) => [a.id, a]));
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const sources = new Map<string, Promise<{ scene: Object3D; animations: AnimationClip[] }>>();

  // ---------- Where animals can go ----------
  const trunkGrid = new Map<string, Point[]>();
  for (const t of trees) {
    const key = `${Math.floor(t.x / 2)},${Math.floor(t.z / 2)}`;
    trunkGrid.set(key, [...(trunkGrid.get(key) ?? []), { x: t.x, z: t.z }]);
  }
  const clearOfTrunks = (x: number, z: number) => {
    const gx = Math.floor(x / 2), gz = Math.floor(z / 2);
    for (let i = -1; i <= 1; i += 1) for (let j = -1; j <= 1; j += 1) {
      for (const t of trunkGrid.get(`${gx + i},${gz + j}`) ?? []) if (Math.hypot(t.x - x, t.z - z) < 0.9) return false;
    }
    return true;
  };
  const slope = (x: number, z: number) => {
    const h = terrain.height(x, z);
    return Math.max(Math.abs(terrain.height(x + 0.7, z) - h), Math.abs(terrain.height(x, z + 0.7) - h));
  };
  const built = (x: number, z: number) => {
    const week = cells[owner(cells, x, z).cell]!.week;
    return week != null && week <= builtWeeks;
  };
  const grid: WalkGrid = buildWalkGrid({
    halfW: BOUNDS.halfW, halfD: BOUNDS.halfD, step: 1,
    ok: (x, z) => {
      if (land(x, z) < 4) return false;
      if (onDeck(x, z)) return true;
      return terrain.lakeDistance(x, z) > 0.8 && terrain.riverDistance(x, z).d > terrain.RIVER_WIDTH + 0.8 && slope(x, z) < 0.6 && clearOfTrunks(x, z) && built(x, z);
    },
    // Animals take the path when it suits them, as real ones use trails.
    cost: (x, z) => (terrain.pathDistance(x, z) < 1.4 ? 0.7 : 1)
  });
  const inCell = (cell: number) => (x: number, z: number) => owner(cells, x, z).cell === cell;
  const builtCells = cells.filter((c) => c.week != null && c.week <= builtWeeks);
  const homeOf = (animal: ForestAnimal) => {
    const week = Math.max(1, weekOfDay(animal.earnedOn, year));
    return (cells.find((c) => c.week === week) ?? builtCells[0] ?? cells[0]!).index;
  };

  /** A few spots round a week's clearing, joined into a loop that stays inside that week. */
  function weekLoop(cell: Cell, random: () => number): Point[] | null {
    const fence = inCell(cell.index);
    for (const radius of [6, 4.5, 8, 3]) {
      const spots: Point[] = [];
      const turn = random() * Math.PI * 2;
      for (let k = 0; k < 5; k += 1) {
        const a = turn + (k / 5) * Math.PI * 2 + (random() - 0.5) * 0.6, r = radius * (0.7 + random() * 0.5);
        const spot = grid.nearest(cell.x + Math.cos(a) * r, cell.z + Math.sin(a) * r, 3, fence);
        if (spot && !spots.some((s) => Math.hypot(s.x - spot.x, s.z - spot.z) < 2.5)) spots.push(spot);
      }
      if (spots.length < 3) continue;
      const route = closedTour(grid, spots, fence);
      if (route) return route;
    }
    return null;
  }

  /** A wander across built weeks: from home to neighbouring weeks and on, then back home. */
  function islandTour(home: Cell, random: () => number): Point[] | null {
    const start = grid.nearest(home.x, home.z, 8, inCell(home.index)) ?? grid.nearest(home.x, home.z, 10);
    if (!start) return null;
    const stops: Point[] = [start];
    const visited = new Set([home.index]);
    let at = home;
    for (let hop = 0; hop < 7; hop += 1) {
      const next = builtCells
        .filter((c) => !visited.has(c.index) && Math.hypot(c.x - at.x, c.z - at.z) < CELL * 1.6)
        .sort(() => random() - 0.5);
      let moved = false;
      for (const cell of next) {
        const spot = grid.nearest(cell.x + (random() - 0.5) * 6, cell.z + (random() - 0.5) * 6, 7, inCell(cell.index));
        if (!spot || !findRoute(grid, stops[stops.length - 1]!, spot)) { visited.add(cell.index); continue; }
        stops.push(spot);
        visited.add(cell.index);
        at = cell;
        moved = true;
        break;
      }
      if (!moved) break;
    }
    return stops.length >= 2 ? closedTour(grid, stops) : null;
  }

  /** A loop round the lake, for swimmers. */
  const lake = terrain.lake;
  function lakeLoop(random: () => number): Point[] | null {
    const deep = (x: number, z: number) => terrain.lakeDistance(x, z) < -1.4;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const r = lake.r * 0.7 * (1 - attempt * 0.08), points: Point[] = [];
      const turn = random() * Math.PI * 2;
      for (let k = 0; k < 10; k += 1) {
        const a = turn + (k / 10) * Math.PI * 2, rr = r * (0.75 + random() * 0.25);
        const p = { x: lake.x + Math.cos(a) * rr, z: lake.z + Math.sin(a) * rr };
        if (deep(p.x, p.z)) points.push(p);
      }
      if (points.length >= 6) return roundLoop(points);
    }
    return null;
  }

  // ---------- Animation ----------
  function play(actor: Actor, role: string, pace = 1): void {
    const action = actor.actions.get(role) ?? actor.actions.get('idle');
    if (!action) return;
    action.setEffectiveTimeScale(pace);
    if (role === actor.role) return;
    action.reset().setLoop(LoopRepeat, Infinity).play();
    if (actor.current && actor.current !== action) action.crossFadeFrom(actor.current, 0.35, false);
    actor.current = action;
    actor.role = role;
  }

  async function source(asset: Asset) {
    if (!sources.has(asset.file)) sources.set(asset.file, loader.loadAsync(groveAssetUrl(asset.file)) as any);
    return sources.get(asset.file)!;
  }

  function spawn(animal: ForestAnimal, asset: Asset, model: { scene: any; animations: AnimationClip[] }, mode: Mode, home: number, baby: boolean): Actor {
    const object = clone(model.scene);
    object.updateMatrixWorld(true);
    const box = new Box3().setFromObject(object, true);
    const native = Math.max(0.01, box.max.y - box.min.y);
    const scale = drawnScale(asset.id, native, baby);
    object.scale.setScalar(scale);
    object.userData.animal = animal;
    object.traverse((node: any) => { if (node.isMesh) { node.castShadow = false; node.receiveShadow = true; node.frustumCulled = false; } });
    const mixer = new AnimationMixer(object);
    const actions = new Map<string, AnimationAction>();
    for (const [role, name] of Object.entries(asset.roles)) {
      const clip = model.animations.find((c) => c.name === name);
      if (clip) actions.set(role, mixer.clipAction(clip));
    }
    root.add(object);
    const actor: Actor = { object, mixer, actions, current: null, role: '', asset, animal, mode, scale, footing: box.min.y, home, mover: null, parent: null, trail: 0, legs: 1, yaw: 0 };
    actors.push(actor);
    return actor;
  }

  const restsOf = (asset: Asset): Rest[] => ['idle', 'idle', ...(asset.roles.feed ? ['feed' as const] : []), ...(asset.roles.sleep ? ['sleep' as const] : [])];

  // ---------- Place each animal ----------
  let index = 0;
  for (const animal of input.animals) {
    const asset = assets.get(animal.model);
    index += 1;
    if (!asset) continue;
    const random = rng(hashSeed(`forest:${year}:${animal.model}:${animal.earnedOn}:${index}`));
    const home = homeOf(animal);
    const mode: Mode = animal.swimming ? 'water' : animal.species === 'owl' ? 'perch' : animal.species === 'robin' ? 'bird' : 'land';
    let model;
    try { model = await source(asset); } catch { continue; }

    if (mode === 'perch') {
      // The tallest grown tree of its week; failing that, any tree near home.
      const homeCell = cells[home]!;
      const candidates = trees.filter((t) => !t.understorey && t.week === homeCell.week).sort((a, b) => b.scale - a.scale);
      const near = candidates.length ? candidates : trees.filter((t) => !t.understorey).sort((a, b) => Math.hypot(a.x - homeCell.x, a.z - homeCell.z) - Math.hypot(b.x - homeCell.x, b.z - homeCell.z));
      const tree = near[0];
      if (!tree) continue;
      const top = input.treeTop(tree) ?? tree.y + tree.scale * 0.95;
      const actor = spawn(animal, asset, model, mode, home, false);
      const yaw = random() * Math.PI * 2;
      actor.perch = { x: tree.x, y: top, z: tree.z, yaw, turnIn: 4 + random() * 6, target: yaw };
      actor.yaw = yaw;
      play(actor, 'idle');
      continue;
    }

    let tour: Point[] | null, local: Point[] | null;
    if (mode === 'water') {
      tour = lakeLoop(random);
      local = tour;
    } else {
      // Week loops fall back to the nearest built week with room (a week that is mostly lake).
      const homeCell = cells[home]!;
      local = null;
      for (const cell of [...builtCells].sort((a, b) => Math.hypot(a.x - homeCell.x, a.z - homeCell.z) - Math.hypot(b.x - homeCell.x, b.z - homeCell.z)).slice(0, 6)) {
        local = weekLoop(cell, random);
        if (local) break;
      }
      tour = islandTour(homeCell, random) ?? local;
    }
    if (!tour || !local) continue;

    const parent = spawn(animal, asset, model, mode, home, false);
    const ground = gaitFor(asset.id, parent.scale, mode === 'water' ? 'water' : 'land');
    const flight: Gait | undefined = mode === 'bird' ? { legs: 3, cruise: 3, turn: 3, accel: 2.5, reach: 0.3 } : undefined;
    const make = (points: Point[], salt: number): Walker => {
      const route = routeOf(points);
      return createWalker(route, ground, {
        random: rng(hashSeed(`${animal.model}:${animal.earnedOn}:${salt}`)),
        rests: mode === 'water' ? ['idle'] : restsOf(asset),
        start: random() * route.total,
        minLeg: mode === 'water' ? 8 : 5,
        maxLeg: mode === 'water' ? 30 : 22,
        flyOver: mode === 'bird' ? 9 : undefined,
        flight
      });
    };
    parent.mover = { tour: make(tour, 1), local: local === tour ? make(local, 1) : make(local, 2) };
    parent.legs = ground.legs;
    if (animal.baby && mode === 'land') {
      const baby = spawn(animal, asset, model, mode, home, true);
      baby.parent = parent;
      baby.trail = (HEIGHT[asset.id] ?? 1) * 0.9;
      baby.legs = gaitFor(asset.id, baby.scale, 'land').legs;
    }
  }

  // ---------- Views ----------
  let focus: number | null = null;
  const walkerOf = (actor: Actor) => {
    const owner = actor.parent ?? actor;
    return owner.mover ? (focus == null ? owner.mover.tour : owner.mover.local) : null;
  };
  function show(cell: number | null): void {
    focus = cell;
    for (const actor of actors) actor.object.visible = cell == null || actor.home === cell;
    for (const actor of actors) { actor.yaw = walkerOf(actor)?.yaw() ?? actor.yaw; pose(actor, 0); }
  }

  function pose(actor: Actor, delta: number): void {
    const lift = -actor.footing * actor.scale;
    if (actor.perch) {
      const p = actor.perch;
      // An owl by day: still, now and then turning to look another way, or preening.
      p.turnIn -= delta;
      if (p.turnIn <= 0) { p.target = p.yaw + (Math.random() - 0.5) * 2.4; p.turnIn = 6 + Math.random() * 8; play(actor, Math.random() < 0.3 && actor.actions.has('feed') ? 'feed' : 'idle'); }
      const diff = wrapAngle(p.target - p.yaw);
      p.yaw += Math.sign(diff) * Math.min(Math.abs(diff), 0.6 * delta);
      actor.object.position.set(p.x, p.y + lift, p.z);
      actor.object.rotation.y = p.yaw;
      return;
    }
    const walker = walkerOf(actor);
    if (!walker) return;
    let x: number, z: number, yaw: number, pace: number, moving: boolean;
    if (actor.parent) {
      // Walk the parent's route a little behind, turning at the baby's own (quicker) rate.
      const d = walker.distance() - actor.trail;
      const here = walker.route.at(d);
      x = here.x; z = here.z;
      const want = walker.moving() ? walker.route.heading(d) : actor.yaw;
      const diff = wrapAngle(want - actor.yaw);
      actor.yaw += Math.sign(diff) * Math.min(Math.abs(diff), 2.2 * delta);
      yaw = actor.yaw;
      pace = walker.speed() / actor.legs;
      moving = walker.moving();
    } else {
      const here = walker.position();
      x = here.x; z = here.z; yaw = walker.yaw(); pace = walker.pace(); moving = walker.moving();
    }
    let y: number;
    if (actor.mode === 'water') y = lake.level - actor.asset.waterline * actor.scale;
    else {
      y = surface(x, z) + lift;
      if (walker.flying()) {
        const p = walker.progress();
        y += Math.pow(Math.sin(Math.PI * p), 0.6) * 4.5;
      }
    }
    actor.object.position.set(x, y, z);
    actor.object.rotation.y = yaw;
    if (actor.mode === 'water') play(actor, actor.actions.has('water') ? 'water' : 'idle', moving ? 1 : 0.5);
    else if (walker.flying() && !actor.parent) play(actor, actor.actions.has('flight') ? 'flight' : 'locomotion', 1);
    // Below a third of its walk the animal stands (idle), so legs never cycle faster than the ground moves.
    else if (moving && pace > 0.33) play(actor, 'locomotion', Math.min(2, pace));
    else play(actor, moving ? 'idle' : walker.rest() === 'feed' ? 'feed' : walker.rest() === 'sleep' ? 'sleep' : 'idle');
  }

  show(null);

  return {
    count: actors.length,
    /** null: Year view, everyone out on the island. A cell index: only that week's animals, at home. */
    focus: show,
    update(delta: number): void {
      const advanced = new Set<Walker>();
      for (const actor of actors) {
        if (!actor.object.visible) continue;
        const walker = actor.parent ? null : walkerOf(actor);
        if (walker && !advanced.has(walker)) { walker.advance(delta); advanced.add(walker); }
      }
      for (const actor of actors) {
        if (!actor.object.visible) continue;
        pose(actor, delta);
        actor.mixer.update(delta);
      }
    },
    /** Every animal out in the forest (young ones walk with their parent, so they are not listed). */
    list(): { key: number; animal: ForestAnimal; young: boolean; home: number; visible: boolean }[] {
      return actors.flatMap((a, key) => (a.parent ? [] : [{ key, animal: a.animal, young: actors.some((b) => b.parent === a), home: a.home, visible: a.object.visible }]));
    },
    /** Where an animal stands now, at about its middle; null if there is no such animal. */
    position(key: number): { x: number; y: number; z: number } | null {
      const a = actors[key];
      if (!a) return null;
      const p = a.object.position;
      return { x: p.x, y: p.y + (HEIGHT[a.asset.id] ?? 1) * 0.5, z: p.z };
    },
    /** Where each animal is and what it is doing (for check scripts). */
    report() {
      return actors.map((a) => ({
        model: a.asset.id, baby: !!a.parent, home: a.home, visible: a.object.visible, role: a.role,
        x: a.object.position.x, y: a.object.position.y, z: a.object.position.z, yaw: a.object.rotation.y,
        height: (HEIGHT[a.asset.id] ?? 1) * (a.parent ? 0.55 : 1),
        cell: owner(cells, a.object.position.x, a.object.position.z).cell,
        speed: walkerOf(a)?.speed() ?? 0, pace: a.current?.getEffectiveTimeScale?.() ?? 0, legs: a.legs,
        tour: (a.parent ?? a).mover?.tour.route.total ?? 0, local: (a.parent ?? a).mover?.local.route.total ?? 0
      }));
    },
    pick(raycaster: Raycaster): ForestAnimal | null {
      const hit = raycaster.intersectObject(root, true).find((h: any) => {
        for (let node: any = h.object; node; node = node.parent) if (!node.visible) return false;
        return true;
      });
      let node: Object3D | null = hit?.object ?? null;
      while (node && !node.userData.animal) node = node.parent;
      return (node?.userData.animal as ForestAnimal | undefined) ?? null;
    },
    dispose(): void {
      for (const actor of actors) { actor.mixer.stopAllAction(); actor.mixer.uncacheRoot(actor.object); }
      scene.remove(root);
      root.traverse((node: any) => { if (node.isSkinnedMesh) node.skeleton?.dispose(); });
    }
  };
}
