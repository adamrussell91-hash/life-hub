/** Authored wildlife; immutable annual geography owns all legal routes/heights. */
import { AnimationMixer, Group, Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { annualEncounters } from '@/domain/grove/companions';
import { buildAnnualRoamingRoutes, type RoamingRoute, type RoamingEncounter } from '@/domain/grove/annual-roaming';
import { createRoamingMotion } from '@/domain/grove/roaming-motion';
import { annualLandPath, annualSwimPath, annualAnimalHeight } from '@/domain/grove/annual-wildlife';
import type { AnnualWorld } from '@/domain/grove/world';
import type { AnnualGrovePlan } from '@/domain/grove/annual-plan';
import { groveAssetUrl } from './asset-url';
type Obj = InstanceType<typeof Object3D>;
type Asset = {
    id: string;
    file: string;
    roles: Record<string, string>;
    waterline: number;
    credit: string | null;
};
type Source = {
    scene: Obj;
    animations: {
        name: string;
    }[];
};
type Motion = ReturnType<typeof createRoamingMotion>;
type Actor = {
    object: Obj;
    mixer: InstanceType<typeof AnimationMixer>;
    source: Source;
    asset: Asset;
    encounter: RoamingEncounter;
    route: RoamingRoute;
    motion: Motion;
    baby: boolean;
    current: unknown;
    role: string;
};
export async function createAnnualAnimals(world: AnnualWorld, plan: AnnualGrovePlan, focusKey?: string, heightScale = 1, options: {
    signal?: AbortSignal;
} = {}) {
    const root = new Group(), actors: Actor[] = [], sources: Source[] = [], missing: string[] = [], credits: string[] = [], routes: {
        worldYear: number;
        model: string;
        encounter: string;
        species: string;
        mode: RoamingRoute['mode'];
        earnedOn: string;
        regionIds: string[];
        pointCount: number;
        length: number;
    }[] = [];
    const started = performance.now(), signal = options.signal, wide = plan.view === 'year' || plan.view === 'term', day = plan.days.find(d => d.key === focusKey) ?? plan.days.find(d => d.today) ?? plan.days[0];
    let disposed = false, preparationMs = 0;
    const released = new Set<object>();
    const abortError = () => new DOMException('Obsolete wildlife request', 'AbortError');
    const check = () => {
        if (signal?.aborted || disposed)
            throw abortError();
    };
    function releaseSource(source: Source) {
        source.scene.traverse((node: Obj) => {
            if (node.geometry && !released.has(node.geometry)) {
                released.add(node.geometry);
                node.geometry.dispose();
            }
            if (node.skeleton && !released.has(node.skeleton)) {
                released.add(node.skeleton);
                node.skeleton.dispose();
            }
            for (const material of Array.isArray(node.material) ? node.material : node.material ? [node.material] : []) {
                if (released.has(material))
                    continue;
                released.add(material);
                for (const value of Object.values(material))
                    if (value && typeof value === 'object' && (value as {
                        isTexture?: boolean;
                    }).isTexture && !released.has(value)) {
                        released.add(value);
                        (value as {
                            dispose(): void;
                        }).dispose();
                    }
                material.dispose();
            }
        });
    }
    function dispose() {
        if (disposed)
            return;
        disposed = true;
        signal?.removeEventListener('abort', onAbort);
        for (const actor of actors) {
            actor.mixer.stopAllAction();
            actor.mixer.uncacheRoot(actor.object);
            actor.object.traverse((node: Obj) => {
                if (node.skeleton && !released.has(node.skeleton)) {
                    released.add(node.skeleton);
                    node.skeleton.dispose();
                }
            });
        }
        for (const source of sources)
            releaseSource(source);
        root.clear();
        actors.length = 0;
        sources.length = 0;
        routes.length = 0;
    }
    const onAbort = () => dispose();
    signal?.addEventListener('abort', onAbort, { once: true });
    /** Race non-abortable GLTF decoding too; a late source is released immediately. */
    function cancellable<T>(pending: Promise<T>): Promise<T> {
        if (!signal)
            return pending;
        return new Promise((resolve, reject) => {
            const cancel = () => reject(abortError());
            signal.addEventListener('abort', cancel, { once: true });
            pending.then(value => {
                signal.removeEventListener('abort', cancel);
                if (signal.aborted)
                    reject(abortError());
                else
                    resolve(value);
            }, error => { signal.removeEventListener('abort', cancel); reject(error); });
            if (signal.aborted)
                cancel();
        });
    }
    function play(actor: Actor, role: string) {
        if (role === actor.role)
            return;
        const name = actor.asset.roles[role] ?? role, clip = actor.source.animations.find(c => c.name === name) ?? actor.source.animations.find(c => c.name === 'idle');
        if (!clip)
            return;
        const action = actor.mixer.clipAction(clip);
        action.reset().play();
        if (actor.current)
            action.crossFadeFrom(actor.current, .2, false);
        actor.current = action;
        actor.role = role;
    }
    function pose(actor: Actor) { const p = actor.motion.snapshot(actor.baby ? 1.5 : 0), y = annualAnimalHeight(world, p.x, p.z, actor.encounter.swimming, actor.asset.waterline, actor.object.scale.y, heightScale); actor.object.position.set(p.x, y + (actor.encounter.swimming ? 0 : .02) + p.lift, p.z); actor.object.rotation.y = p.yaw; return p; }
    function update(_seconds: number, delta: number, visible?: (object: Obj) => boolean) {
        if (disposed || !Number.isFinite(delta) || delta <= 0)
            return false;
        let active = false;
        const advanced = new Set<Motion>();
        for (const actor of actors) {
            if (!advanced.has(actor.motion)) {
                actor.motion.advance(delta);
                advanced.add(actor.motion);
            }
            const p = pose(actor);
            if (!visible || visible(actor.object)) {
                play(actor, p.activity);
                actor.mixer.update(delta);
                active = true;
            }
        }
        return active;
    }
    function diagnostics() { return { preparationMs, routes: routes.map(r => ({ ...r, regionIds: r.regionIds.slice() })), actors: actors.map(a => { const p = a.motion.snapshot(a.baby ? 1.5 : 0); return { worldYear: world.key.year, model: a.asset.id, encounter: a.encounter.id, species: a.encounter.species, mode: a.route.mode, baby: a.baby, x: a.object.position.x, y: a.object.position.y, z: a.object.position.z, lift: p.lift, routeDistance: p.routeDistance, activity: p.activity, destination: p.destination }; }) }; }
    const result = () => { preparationMs = performance.now() - started; return { root, missing, credits, count: actors.length, swimmers: actors.filter(a => a.encounter.swimming).length, swimmerError: () => actors.filter(a => a.encounter.swimming).reduce((error, a) => Math.max(error, Math.abs(a.object.position.y - annualAnimalHeight(world, a.object.position.x, a.object.position.z, true, a.asset.waterline, a.object.scale.y, heightScale))), 0), diagnostics, update, dispose }; };
    try {
        check();
        if (!wide && (!day || day.future || day.worldYear !== world.key.year))
            return result();
        const encounters = annualEncounters(plan, focusKey);
        if (!encounters.length)
            return result();
        const prepared = wide ? await buildAnnualRoamingRoutes(world, plan, encounters, signal) : [];
        check();
        const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
        let catalogue: {
            assets: Asset[];
        };
        try {
            const response = await cancellable(fetch(groveAssetUrl('animal-catalogue.json'), { signal }));
            if (!response.ok)
                throw Error('Catalogue unavailable');
            catalogue = await cancellable(response.json()) as {
                assets: Asset[];
            };
            check();
            if (!catalogue || !Array.isArray(catalogue.assets) || catalogue.assets.some(a => !a || typeof a.id !== 'string' || !a.id || typeof a.file !== 'string' || !a.file || !a.roles || typeof a.roles !== 'object' || Array.isArray(a.roles) || Object.values(a.roles).some(role => typeof role !== 'string') || !Number.isFinite(a.waterline) || !(a.credit == null || typeof a.credit === 'string')) || new Set(catalogue.assets.map(a => a.id)).size !== catalogue.assets.length)
                throw Error('Invalid catalogue');
        }
        catch (error) {
            check();
            missing.push(...encounters.map(m => m.species + ': asset unavailable'));
            return result();
        }
        const assets = new Map(catalogue.assets.map(a => [a.id, a])), obstacles = wide ? [] : plan.contextTrees.filter(t => t.worldYear === world.key.year && Math.hypot(t.x - day!.cx, t.z - day!.cz) < 42).map(t => ({ x: t.x, z: t.z }));
        for (const [index, encounter] of encounters.entries()) {
            check();
            const limit = encounter.companion ? 11 : 9;
            if (actors.length >= limit)
                continue;
            const asset = assets.get(encounter.id);
            if (!asset) {
                missing.push(encounter.species + ': asset unavailable');
                continue;
            }
            const route = wide ? prepared.find(r => r.id === encounter.id) : { id: encounter.id, points: encounter.swimming ? annualSwimPath(world, day!.cx, day!.cz) : annualLandPath(world, encounter.id + ':' + day!.key, day!.cx - 3 + index, day!.cz + 4, obstacles), regionIds: day?.regionId ? [day.regionId] : [], mode: encounter.swimming ? 'water' : encounter.species === 'robin' || encounter.species === 'owl' ? 'flight' : 'land' } as RoamingRoute;
            if (!route || route.points.length < 2) {
                missing.push(encounter.species + ': no safe ' + (encounter.swimming ? 'water' : 'land') + ' path nearby');
                continue;
            }
            let source: Source;
            try {
                const pending = (loader.loadAsync(groveAssetUrl(asset.file)) as Promise<Source>).then(s => {
                    if (disposed || signal?.aborted) {
                        releaseSource(s);
                        throw abortError();
                    }
                    return s;
                });
                source = await cancellable(pending);
                if (disposed || signal?.aborted) {
                    releaseSource(source);
                    check();
                }
                sources.push(source);
            }
            catch (error) {
                check();
                missing.push(encounter.species + ': asset unavailable');
                continue;
            }
            const motion = createRoamingMotion(route.points, { seed: world.identity + ':' + encounter.id + ':' + (wide ? plan.from : day!.key), species: encounter.species, mode: route.mode, roles: Object.keys(asset.roles), startFraction: wide ? index / encounters.length : 0 });
            routes.push({ worldYear: world.key.year, model: asset.id, encounter: encounter.id, species: encounter.species, mode: route.mode, earnedOn: encounter.earnedOn, regionIds: route.regionIds, pointCount: route.points.length, length: motion.total });
            for (const baby of encounter.baby ? [false, true] : [false]) {
                if (actors.length >= limit)
                    break;
                const object = clone(source.scene), size = (asset.id === 'animal-squirrel' ? 2.5 : asset.id === 'animal-bird-robin' ? 1.3 : 1) * (baby ? .5 : 1);
                object.scale.multiplyScalar(size);
                object.userData.wildlife = asset.id;
                object.userData.baby = baby;
                object.userData.swimming = encounter.swimming;
                object.traverse((node: Obj) => {
                    if (node.isMesh) {
                        node.castShadow = true;
                        node.receiveShadow = true;
                    }
                });
                const actor: Actor = { object, mixer: new AnimationMixer(object), source, asset, encounter, route, motion, baby, current: null, role: '' };
                actors.push(actor);
                root.add(object);
                pose(actor);
                play(actor, encounter.swimming ? 'water' : 'idle');
            }
            if (asset.credit && !credits.includes(asset.credit))
                credits.push(asset.credit);
        }
        check();
        return result();
    }
    catch (error) {
        dispose();
        throw error;
    }
}
