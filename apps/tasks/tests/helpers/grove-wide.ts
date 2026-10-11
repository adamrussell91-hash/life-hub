import { vi } from 'vitest';
import { Group, Mesh, BoxGeometry, MeshStandardMaterial } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { AnnualGrovePlan } from '@/domain/grove/annual-plan';
import type { AnnualWorld } from '@/domain/grove/world';
import { worldKeyForYear } from '@/domain/grove/world-key';
export function fixture(wet = false) {
    const size = 9, owner = new Int16Array(81), bed = new Float32Array(81);
    for (let z = 0; z < size; z++)
        for (let x = 0; x < size; x++)
            owner[z * size + x] = x * 2 < 5 ? 0 : x * 2 < 11 ? 1 : 2;
    const triangles = wet ? [0, 2, 6, 16, 2, 6, 16, 2, 10, 0, 2, 6, 16, 2, 10, 0, 2, 10] : [];
    if (wet)
        for (let z = 3; z <= 5; z++)
            for (let x = 0; x < size; x++)
                owner[z * size + x] = -1;
    const weeks = ['2026-01-01', '2026-01-08', '2026-01-15'].map((from, index) => ({ id: 'week-' + index, index, from, to: ['2026-01-07', '2026-01-14', '2026-01-21'][index], anchor: { x: 2 + index * 6, z: 2 }, cells: Array.from(owner.keys()).filter(i => owner[i] === index) }));
    const world = { identity: 'integration', key: worldKeyForYear(2026), grid: { size, step: 2, extent: 16, x0: 0, z0: 0 }, meadows: [{ cx: 2, cz: 8, radius: 4 }], regions: { owner, weeks }, hydrology: { bed, receiver: new Int32Array(81).fill(-1), lakes: [{ triangles: new Float32Array(triangles), shoreLoops: [] }], channels: [], falls: [] } } as unknown as AnnualWorld;
    const trees = weeks.map((w, i) => ({ id: 'tree-' + i, x: 2 + i * 6, z: 2, regionId: w.id, worldYear: 2026, dayKey: ['2026-01-02', '2026-01-09', '2026-01-16'][i], height: 0, scale: 1, rotation: 0, species: 'life', variant: 0, completedMs: Date.parse(['2026-01-02', '2026-01-09', '2026-01-16'][i]!) }));
    const wildlife = [{ species: 'hare', earnedOn: '2026-01-08', baby: true, reason: 'five tasks' }, { species: 'robin', earnedOn: '2026-01-08', baby: false, reason: 'ten tasks' }, { species: 'mallard', earnedOn: '2026-01-08', baby: false, reason: 'twenty tasks' }];
    const plan = { baselineProps: [], activityProps: [], view: 'year', anchor: '2026-01-01', from: '2026-01-01', to: '2026-01-21', today: '2026-01-21', days: [{ key: '2026-01-01', worldYear: 2026, cx: 2, cz: 2, future: false }], contextTrees: trees, trees, wildlife, wildlifeAt: (day: string) => day < '2026-01-08' ? [] : wildlife } as unknown as AnnualGrovePlan;
    return { world, plan };
}
export function assets() { const source = new Group(), geometry = new BoxGeometry(), material = new MeshStandardMaterial(); source.add(new Mesh(geometry, material)); vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockResolvedValue({ scene: source, animations: [] } as never); const ids = ['animal-rabbit-hare', 'animal-forest-rabbit', 'animal-bird-robin', 'animal-duck-mallard', 'animal-skunk', 'animal-raccoon', 'animal-river-otter']; vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ assets: ids.map(id => ({ id, file: id + '.glb', roles: { idle: 'idle', feed: 'eat', water: 'swim', flight: 'fly' }, waterline: .3, credit: null })) }) } as Response); return { source, geometry }; }
