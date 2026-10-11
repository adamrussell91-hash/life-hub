import { it, expect, vi, afterEach } from 'vitest';
import { AnimationMixer } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createAnnualAnimals } from '@/views/grove/annual-animals';
import type { AnnualGrovePlan } from '@/domain/grove/annual-plan';
import { fixture, assets } from '../helpers/grove-wide';
afterEach(() => vi.restoreAllMocks());
// Catches anchor suppression, point dumps and unrelated baby clocks.
it.each(['year', 'term'])('loads %s earned population across open weeks with bounded route summaries', async (view) => { assets(); const { world, plan } = fixture(); plan.view = view as 'year'; const a = await createAnnualAnimals(world, plan, plan.anchor); try {
    expect(a.count).toBeGreaterThan(0);
    const d = (a as any).diagnostics();
    expect(d.preparationMs).toBeGreaterThanOrEqual(0);
    expect(d.routes.length).toBeGreaterThan(0);
    for (const r of d.routes) {
        expect(r.regionIds.sort()).toEqual(['week-1', 'week-2']);
        expect(r.earnedOn).toBe('2026-01-08');
        expect(r.pointCount).toBeGreaterThan(2);
        expect(r).not.toHaveProperty('points');
    }
    expect(a.count).toBeLessThanOrEqual(11);
    const before = d.actors;
    a.update(999, 0);
    expect((a as any).diagnostics().actors).toEqual(before);
    a.update(1, .25);
    expect((a as any).diagnostics().actors).not.toEqual(before);
}
finally {
    a.dispose();
} });
it.each(['day', 'week'])('keeps %s encounters near selected focus and gated by its date', async (view) => { assets(); const { world, plan } = fixture(); plan.view = view as 'day'; expect((await createAnnualAnimals(world, plan, plan.anchor)).count).toBe(0); plan.days[0]!.key = '2026-01-21'; const a = await createAnnualAnimals(world, plan, '2026-01-21'); try {
    expect(a.count).toBeGreaterThan(0);
    for (const obj of a.root.children)
        expect(Math.hypot(obj.position.x - 2, obj.position.z - 2)).toBeLessThan(15);
}
finally {
    a.dispose();
} });
it('advances culled route clocks consistently while avoiding mixer work and keeps swimmers on their height', async () => { assets(); const mixer = vi.spyOn(AnimationMixer.prototype, 'update'), { world, plan } = fixture(true), a = await createAnnualAnimals(world, plan, plan.anchor, 2), b = await createAnnualAnimals(world, plan, plan.anchor, 2); try {
    for (let i = 0; i < 100; i++) {
        a.update(i * .25, .25, () => false);
        b.update(i * .25, .25);
    }
    expect((a as any).diagnostics).toBeTypeOf('function');
    expect((a as any).diagnostics().actors).toEqual((b as any).diagnostics().actors);
    expect(mixer).toHaveBeenCalledTimes(b.count * 100);
    expect(a.swimmers).toBeGreaterThan(0);
    expect(a.swimmerError()).toBeLessThan(.00001);
    const birds = (a as any).diagnostics().actors.filter((p: any) => p.mode === 'flight');
    expect(birds.length).toBeGreaterThan(0);
}
finally {
    a.dispose();
    b.dispose();
} });
it('rejects already obsolete requests before fetching models', async () => { assets(); const { world, plan } = fixture(), controller = new AbortController(); controller.abort(); await expect(createAnnualAnimals(world, plan, plan.anchor, 1, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' }); expect(fetch).not.toHaveBeenCalled(); });
it('disposes late model resources when cancellation wins the pending load', async () => { const { geometry, source } = assets(), release = vi.spyOn(geometry, 'dispose'); let resolve!: (v: unknown) => void; vi.mocked(GLTFLoader.prototype.loadAsync).mockRejectedValue(Error('later unavailable')).mockImplementationOnce(() => new Promise(r => { resolve = r; }) as never); const { world, plan } = fixture(); plan.days[0]!.key = '2026-01-21'; plan.anchor = '2026-01-21'; const controller = new AbortController(), pending = createAnnualAnimals(world, plan, plan.anchor, 1, { signal: controller.signal }); while (!resolve)
    await new Promise(r => setTimeout(r, 0)); controller.abort(); resolve({ scene: source, animations: [] }); await expect(pending).rejects.toMatchObject({ name: 'AbortError' }); await new Promise(r => setTimeout(r, 0)); expect(release).toHaveBeenCalledTimes(1); });
it('keeps surviving actors and releases resources when another model fails', async () => { const { geometry } = assets(), release = vi.spyOn(geometry, 'dispose'); vi.mocked(GLTFLoader.prototype.loadAsync).mockRejectedValueOnce(Error('unavailable')); const { world, plan } = fixture(), a = await createAnnualAnimals(world, plan, plan.anchor); expect(a.count).toBeGreaterThan(0); expect(a.missing.some(m => m.includes('asset unavailable'))).toBe(true); a.dispose(); expect(release).toHaveBeenCalledTimes(1); expect(a.root.children).toHaveLength(0); });
it('loads every delivered model over deterministic dates with at most eleven actors and exact milestone dates', async () => { assets(); const ids = ['animal-bird-robin', 'animal-chipmunk', 'animal-deer-doe', 'animal-deer-stag', 'animal-duck-mallard', 'animal-forest-bear', 'animal-forest-boar', 'animal-forest-deer', 'animal-forest-fox', 'animal-forest-moose', 'animal-forest-rabbit', 'animal-forest-stag', 'animal-forest-wolf', 'animal-fox', 'animal-owl', 'animal-rabbit-hare', 'animal-raccoon', 'animal-river-otter', 'animal-skunk', 'animal-squirrel']; vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ assets: ids.map(id => ({ id, file: id + '.glb', roles: { idle: 'idle', locomotion: 'walk', feed: 'eat', sleep: 'sleep', flight: 'fly', water: 'swim' }, waterline: .3, credit: null })) }) } as Response); const { world, plan } = fixture(true), earned = ['hare', 'deer', 'fox', 'squirrel', 'robin', 'mallard', 'owl'].map(species => ({ species, earnedOn: '2026-01-08', baby: species === 'hare' || species === 'deer', reason: 'earned' })) as AnnualGrovePlan['wildlife']; plan.wildlife = earned; plan.wildlifeAt = () => earned; plan.to = '2026-12-31'; const seen = new Set(); for (let i = 1; i <= 28; i++) {
    plan.today = '2026-10-' + String(i).padStart(2, '0');
    const a = await createAnnualAnimals(world, plan, plan.anchor);
    try {
        expect(a.count).toBe(11);
        for (const r of a.diagnostics().routes) {
            seen.add(r.model);
            expect(r.earnedOn).toBe('2026-01-08');
        }
        a.update(1, .5);
        const poses = a.diagnostics().actors;
        for (const baby of poses.filter(p => p.baby)) {
            const parent = poses.find(p => p.encounter === baby.encounter && !p.baby)!, route = a.diagnostics().routes.find(r => r.encounter === baby.encounter)!;
            expect((parent.routeDistance - baby.routeDistance + route.length) % route.length).toBeCloseTo(1.5);
        }
        for (const p of poses.filter(p => p.model === 'animal-raccoon'))
            expect(p.mode).toBe('land');
    }
    finally {
        a.dispose();
    }
} expect([...seen].sort()).toEqual(ids.sort()); });
it('returns promptly on abort during catalogue fetch without creating actors', async () => { assets(); let resolve!: (r: Response) => void; vi.mocked(fetch).mockImplementation(() => new Promise(r => { resolve = r; })); const { world, plan } = fixture(), controller = new AbortController(), pending = createAnnualAnimals(world, plan, plan.anchor, 1, { signal: controller.signal }); for (let i = 0; i < 100 && !resolve; i++)
    await new Promise(r => setTimeout(r, 1)); expect(resolve).toBeTypeOf('function'); const settled = pending.then(() => 'loaded', e => e.name); controller.abort(); expect(await Promise.race([settled, new Promise(r => setTimeout(() => r('waiting'), 30))])).toBe('AbortError'); resolve({ ok: true, json: async () => ({ assets: [] }) } as Response); });
