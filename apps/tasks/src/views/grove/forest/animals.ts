/**
 * Earned wildlife in the forest. Which animals exist comes from real milestones
 * (domain/grove/wildlife.ts and companions.ts); this places each one on its own loop: land animals
 * on dry, gentle ground in the week they were earned, the mallard and otter on the lake, birds
 * circling over the canopy. Motion reuses Grove's roaming motion (walk, rest, feed).
 */
import { AnimationMixer, Group, Object3D, Raycaster, Scene } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { createRoamingMotion } from '@/domain/grove/roaming-motion';
import type { WildlifeSpecies } from '@/domain/grove/wildlife';
import { groveAssetUrl } from '../asset-url';
import { land, owner, type Cell, type Terrain } from './map';
import type { Placed } from './planting';
import { rng } from './noise';
import { weekOfDay } from './history';

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

type Asset = { id: string; file: string; roles: Record<string, string>; waterline: number };
type Actor = {
  object: Object3D; mixer: AnimationMixer; asset: Asset; animal: ForestAnimal; baby: boolean;
  motion: ReturnType<typeof createRoamingMotion>; mode: 'land' | 'water' | 'flight'; current: any; role: string; size: number;
};

// Models are about life size; the diorama's trees are 6 to 9 units tall, so animals are drawn a little
// larger than life to read at Year zoom. Squirrels and robins are tiny in the source models.
const SIZE: Record<string, number> = { 'animal-squirrel': 4.5, 'animal-chipmunk': 3.6, 'animal-bird-robin': 3.2, 'animal-owl': 2.2 };
const BASE = 1.8;

export async function createForestAnimals(input: { scene: Scene; terrain: Terrain; cells: Cell[]; trees: Placed[]; year: number; animals: ForestAnimal[] }) {
  const { scene, terrain, cells, trees, year } = input;
  const root = new Group();
  root.name = 'grove-wildlife';
  scene.add(root);
  const actors: Actor[] = [];
  const response = await fetch(groveAssetUrl('animal-catalogue.json'));
  if (!response.ok) throw new Error('Animal catalogue unavailable');
  const catalogue = (await response.json()) as { assets: Asset[] };
  const assets = new Map(catalogue.assets.map((a) => [a.id, a]));
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const sources = new Map<string, Promise<{ scene: Object3D; animations: any[] }>>();

  const slope = (x: number, z: number) => {
    const h = terrain.height(x, z);
    return Math.max(Math.abs(terrain.height(x + 0.7, z) - h), Math.abs(terrain.height(x, z + 0.7) - h));
  };
  const trunks = trees.map((t) => ({ x: t.x, z: t.z }));
  const walkable = (x: number, z: number) => land(x, z) >= 4 && terrain.lakeDistance(x, z) > 0.8 && terrain.riverDistance(x, z).d > terrain.RIVER_WIDTH + 0.8 && slope(x, z) < 0.6
    && trunks.every((t) => Math.abs(t.x - x) > 0.9 || Math.abs(t.z - z) > 0.9);
  const segmentOk = (a: { x: number; z: number }, b: { x: number; z: number }, ok: (x: number, z: number) => boolean) => {
    for (let i = 0; i <= 10; i += 1) if (!ok(a.x + ((b.x - a.x) * i) / 10, a.z + ((b.z - a.z) * i) / 10)) return false;
    return true;
  };

  /** A closed loop of safe points around a centre, or null. */
  function loop(seed: string, cx: number, cz: number, ok: (x: number, z: number) => boolean, radius: number): { x: number; z: number }[] | null {
    const random = rng([...seed].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7));
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const r = radius * (1 - attempt * 0.09);
      const points: { x: number; z: number }[] = [];
      for (let k = 0; k < 9; k += 1) {
        const a = (k / 9) * Math.PI * 2 + random() * 0.5, rr = r * (0.55 + random() * 0.45);
        const p = { x: cx + Math.cos(a) * rr, z: cz + Math.sin(a) * rr };
        if (!ok(p.x, p.z)) continue;
        if (points.length && !segmentOk(points[points.length - 1]!, p, ok)) continue;
        points.push(p);
      }
      if (points.length >= 4 && segmentOk(points[points.length - 1]!, points[0]!, ok)) return [...points, points[0]!];
    }
    return null;
  }

  // Land animals start in the piece of the week they were earned, and fall back to its neighbours.
  function landLoop(animal: ForestAnimal, salt: string) {
    const week = Math.max(1, weekOfDay(animal.earnedOn, year));
    const home = cells.find((c) => c.week === week) ?? cells.find((c) => c.week === 1)!;
    const near = [...cells].filter((c) => c.week != null).sort((a, b) => Math.hypot(a.x - home.x, a.z - home.z) - Math.hypot(b.x - home.x, b.z - home.z));
    for (const cell of near.slice(0, 8)) {
      // Round the edge of the clearing, where the stand opens out.
      for (const radius of [7, 5, 9, 3.5]) {
        const points = loop(animal.model + salt + cell.index + radius, cell.x, cell.z, (x, z) => walkable(x, z) && owner(cells, x, z).cell === cell.index, radius);
        if (points) return points;
      }
    }
    return null;
  }
  const lake = terrain.lake;
  const swimmable = (x: number, z: number) => terrain.lakeDistance(x, z) < -1.4;

  let index = 0;
  for (const animal of input.animals) {
    const asset = assets.get(animal.model);
    if (!asset) continue;
    const flying = animal.species === 'robin' || animal.species === 'owl';
    const mode: Actor['mode'] = animal.swimming ? 'water' : flying ? 'flight' : 'land';
    const points = mode === 'water' ? loop(animal.model + index, lake.x, lake.z, swimmable, lake.r * 0.7)
      : mode === 'flight' ? (() => {
        const week = Math.max(1, weekOfDay(animal.earnedOn, year));
        const home = cells.find((c) => c.week === week) ?? cells[0]!;
        return loop(animal.model + index, home.x, home.z, (x, z) => land(x, z) >= 2, 11);
      })()
      : landLoop(animal, String(index));
    index += 1;
    if (!points) continue;
    if (!sources.has(asset.file)) sources.set(asset.file, loader.loadAsync(groveAssetUrl(asset.file)) as any);
    let source;
    try { source = await sources.get(asset.file)!; } catch { continue; }
    const motion = createRoamingMotion(points, { seed: `forest:${year}:${animal.model}:${animal.earnedOn}`, species: animal.species, mode, roles: Object.keys(asset.roles), startFraction: (index * 0.37) % 1, model: asset.id });
    for (const baby of animal.baby ? [false, true] : [false]) {
      const object = clone(source.scene);
      const size = (SIZE[asset.id] ?? 1) * BASE * (baby ? 0.55 : 1);
      object.scale.multiplyScalar(size);
      object.userData.animal = animal;
      object.traverse((node: any) => { if (node.isMesh) { node.castShadow = false; node.receiveShadow = true; node.frustumCulled = false; } });
      const actor: Actor = { object, mixer: new AnimationMixer(object), asset, animal, baby, motion, mode, current: null, role: '', size };
      (actor as any).clips = source.animations;
      root.add(object);
      actors.push(actor);
      pose(actor);
      play(actor, mode === 'water' ? 'water' : 'idle');
    }
  }

  function play(actor: Actor, role: string): void {
    if (role === actor.role) return;
    const clips = (actor as any).clips as { name: string }[];
    const name = actor.asset.roles[role] ?? actor.asset.roles.locomotion ?? role;
    const clip = clips.find((c) => c.name === name) ?? clips.find((c) => c.name === actor.asset.roles.idle) ?? clips[0];
    if (!clip) return;
    const action = actor.mixer.clipAction(clip as any);
    action.reset().play();
    if (actor.current) action.crossFadeFrom(actor.current, 0.25, false);
    actor.current = action;
    actor.role = role;
  }
  function pose(actor: Actor): string {
    const p = actor.motion.snapshot(actor.baby ? 1.5 : 0);
    const ground = terrain.height(p.x, p.z);
    const y = actor.mode === 'water' ? lake.level - actor.asset.waterline * actor.size
      : actor.mode === 'flight' ? Math.max(ground, lake.level) + 10 + Math.sin(p.x * 0.3 + p.z * 0.2) * 0.8
      : ground + 0.02 + (p.lift ?? 0);
    actor.object.position.set(p.x, y, p.z);
    actor.object.rotation.y = p.yaw;
    return actor.mode === 'flight' ? (actor.asset.roles.flight ? 'flight' : 'locomotion') : p.activity;
  }

  return {
    count: actors.length,
    update(delta: number): void {
      const moved = new Set<unknown>();
      for (const actor of actors) {
        if (!moved.has(actor.motion)) { actor.motion.advance(delta); moved.add(actor.motion); }
        play(actor, pose(actor));
        actor.mixer.update(delta);
      }
    },
    pick(raycaster: Raycaster): ForestAnimal | null {
      const hit = raycaster.intersectObject(root, true)[0];
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
