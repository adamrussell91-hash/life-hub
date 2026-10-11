import { it, expect, vi, afterEach } from 'vitest';
// Only the GPU boundary is replaced; renderer lifecycle, scene, clock, model
// ownership, OrbitControls, route planning and pose updates are real.
vi.mock('three', async (original) => {
    const three = await original<typeof import('three')>();
    return { ...three, WebGLRenderer: class {
            domElement = document.createElement('canvas');
            info = { render: { calls: 0, triangles: 0 }, memory: { geometries: 0, textures: 0 } };
            setPixelRatio() { }
            setSize() { }
            render() { }
            dispose() { }
            forceContextLoss() { }
        } };
});
import { createWorldPreview } from '@/grove-world-preview/renderer';
import { fixture, assets } from '../helpers/grove-wide';
import { Group } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { WorldMeshes } from '@/domain/grove/world-meshes';
function setup() {
    assets();
    const frames = new Map<number, FrameRequestCallback>();
    let id = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++id, callback); return id; });
    vi.stubGlobal('cancelAnimationFrame', (n: number) => frames.delete(n));
    vi.stubGlobal('IntersectionObserver', class {
        observe() { }
        disconnect() { }
    });
    vi.stubGlobal('ResizeObserver', class {
        observe() { }
        disconnect() { }
    });
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() { }, removeEventListener() { } }));
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const { world, plan } = fixture();
    const host = document.createElement('div');
    document.body.append(host);
    const preview = createWorldPreview(host, undefined, { heightScale: 1 });
    const payload = { identity: world.identity, terrain: [], water: [], falls: [] } as unknown as WorldMeshes;
    preview.showAnnual([world], 'elevation', plan, [payload]);
    return { host, preview, world, plan, payload, step(t: number) {
            const jobs = [...frames.values()];
            frames.clear();
            for (const job of jobs)
                job(t);
        } };
}
const waitReady = async (host: HTMLElement) => {
    for (let i = 0; i < 100 && host.dataset.animalsReady !== 'true'; i++)
        await new Promise(r => setTimeout(r, 2));
    expect(host.dataset.animalsReady).toBe('true');
};
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren(); });
it('retains actors/routes and clocks across pan, freezes pause and removes diagnostics on disposal', async () => {
    const { host, preview, step } = setup();
    try {
        await waitReady(host);
        expect((preview as any).wildlifeDiagnostics).toBeTypeOf('function');
        const capture = () => { let value: any; host.dispatchEvent(new CustomEvent('grove-wildlife-diagnostics', { detail: (d: any) => { value = d; } })); return value; };
        const before = capture();
        expect(before.actors.length).toBeGreaterThan(0);
        expect(JSON.parse(host.dataset.wildlifeRoutes!)).toEqual(before.routes);
        const state = preview.cameraState();
        state.target[0] += 5;
        state.position[0] += 5;
        preview.restoreCamera(state);
        expect(capture()).toEqual(before);
        step(1000);
        step(1100);
        const moving = capture();
        expect(moving.actors).not.toEqual(before.actors);
        preview.setMotionPaused(true);
        step(1200);
        step(1400);
        expect(capture()).toEqual(moving);
        preview.setMotionPaused(false);
        step(1500);
        step(1600);
        expect(capture().actors).not.toEqual(moving.actors);
        preview.dispose();
        expect(capture()).toBeUndefined();
        expect((preview as any).wildlifeDiagnostics().actors).toEqual([]);
    }
    finally {
        preview.dispose();
    }
});
it('cancels obsolete preparations without attaching their late population', async () => {
    const { host, preview, world, plan, payload } = setup();
    plan.wildlife = [];
    plan.wildlifeAt = () => [];
    preview.showAnnual([world], 'elevation', plan, [payload]);
    try {
        await waitReady(host);
        await new Promise(r => setTimeout(r, 20));
        expect(host.dataset.wildlifeCount).toBe('0');
        expect((preview as any).wildlifeDiagnostics).toBeTypeOf('function');
        expect((preview as any).wildlifeDiagnostics().actors).toEqual([]);
    }
    finally {
        preview.dispose();
    }
});
it('chooses completed habitat across a Term boundary without multiplying population', async () => {
    const { host, preview, world, plan, payload } = setup();
    const next = structuredClone(world);
    next.key = { ...world.key, year: 2027 };
    next.identity = 'integration-2027';
    for (const week of next.regions!.weeks) {
        week.id += '-2027';
        week.from = week.from.replace('2026', '2027');
        week.to = week.to.replace('2026', '2027');
    }
    const trees = plan.contextTrees.map(t => ({ ...t, id: t.id + '-2027', regionId: t.regionId + '-2027', worldYear: 2027, dayKey: t.dayKey.replace('2026', '2027'), completedMs: Date.parse(t.dayKey.replace('2026', '2027')) }));
    plan.contextTrees.push(...trees);
    plan.view = 'term';
    plan.from = '2026-12-20';
    plan.to = '2027-01-21';
    plan.today = '2027-01-21';
    preview.showAnnual([world, next], 'elevation', plan, [payload, { ...payload, identity: next.identity }]);
    try {
        await waitReady(host);
        expect((preview as any).wildlifeDiagnostics).toBeTypeOf('function');
        const d = (preview as any).wildlifeDiagnostics();
        expect(d.actors.length).toBeGreaterThan(0);
        expect(d.actors.length).toBeLessThanOrEqual(11);
        expect(new Set(d.routes.map((r: any) => r.worldYear))).toEqual(new Set([2027]));
    }
    finally {
        preview.dispose();
    }
});
function fallbackFixture(input: ReturnType<typeof setup>) {
    const { world, plan, payload } = input;
    const preferred = structuredClone(world);
    preferred.key = { ...world.key, year: 2027 };
    preferred.identity = 'unsafe-2027';
    for (const week of preferred.regions!.weeks) {
        week.id += '-2027';
        week.from = week.from.replace('2026', '2027');
        week.to = week.to.replace('2026', '2027');
    }
    for (let i = 0; i < preferred.hydrology.bed.length; i++)
        preferred.hydrology.bed[i] = (i % preferred.grid.size) * preferred.grid.step * .8;
    plan.contextTrees.push(...plan.contextTrees.map(t => ({ ...t, id: t.id + '-2027', regionId: t.regionId + '-2027', worldYear: 2027, dayKey: t.dayKey.replace('2026', '2027'), completedMs: Date.parse(t.dayKey.replace('2026', '2027')) })));
    plan.view = 'term';
    plan.to = '2027-01-21';
    plan.today = '2027-01-21';
    return { preferred, payloads: [payload, { ...payload, identity: preferred.identity }] };
}
it('falls back when preferred completed-year habitat has no safe routes', async () => {
    const input = setup(), { preferred, payloads } = fallbackFixture(input), { host, preview, world, plan } = input;
    preview.showAnnual([world, preferred], 'elevation', plan, payloads);
    try {
        await waitReady(host);
        const d = preview.wildlifeDiagnostics();
        expect(d.actors.length).toBeGreaterThan(0);
        expect(d.actors.length).toBeLessThanOrEqual(11);
        expect(new Set(d.routes.map(r => r.worldYear))).toEqual(new Set([2026]));
    }
    finally {
        preview.dispose();
    }
});
it('cancels fallback loading and never attaches its late population', async () => {
    const input = setup(), { preferred, payloads } = fallbackFixture(input), { host, preview, world, plan, payload } = input;
    let finish: ((value: unknown) => void) | undefined;
    vi.mocked(GLTFLoader.prototype.loadAsync).mockImplementation((file: string) => file.includes('animal') ? new Promise(resolve => { finish = resolve; }) as never : Promise.resolve({ scene: new Group(), animations: [] }) as never);
    preview.showAnnual([world, preferred], 'elevation', plan, payloads);
    try {
        for (let i = 0; i < 100 && !finish; i++)
            await new Promise(r => setTimeout(r, 2));
        expect(finish).toBeTypeOf('function');
        const empty = { ...plan, wildlife: [], wildlifeAt: () => [] };
        preview.showAnnual([world], 'elevation', empty, [payload]);
        await waitReady(host);
        finish!({ scene: new Group(), animations: [] });
        await new Promise(r => setTimeout(r, 10));
        expect(host.dataset.wildlifeCount).toBe('0');
        expect(preview.wildlifeDiagnostics().actors).toEqual([]);
        expect(preview.wildlifeDiagnostics().routes).toEqual([]);
    }
    finally {
        preview.dispose();
    }
});
it.each([{ laterWeeks: 3, want: 2027 }, { laterWeeks: 1, want: 2026 }])('preserves completed-week ranking and latest-year ties with $laterWeeks later weeks', async ({ laterWeeks, want }) => {
    const input = setup(), { preferred, payloads } = fallbackFixture(input), { host, preview, world, plan } = input;
    preferred.hydrology.bed.fill(0);
    plan.contextTrees = plan.contextTrees.filter(t => t.worldYear === 2026 || Number(t.regionId.split('-')[1]) < laterWeeks);
    preview.showAnnual([world, preferred], 'elevation', plan, payloads);
    try {
        await waitReady(host);
        const d = preview.wildlifeDiagnostics();
        expect(d.actors.length).toBeGreaterThan(0);
        expect(d.actors.length).toBeLessThanOrEqual(11);
        expect(new Set(d.routes.map(r => r.worldYear))).toEqual(new Set([want]));
    }
    finally {
        preview.dispose();
    }
});
it('keeps unavailable-route diagnostics when all ranked habitats are unsuitable', async () => {
    const input = setup(), { preferred, payloads } = fallbackFixture(input), { host, preview, world, plan } = input;
    world.hydrology.bed.set(preferred.hydrology.bed);
    preview.showAnnual([world, preferred], 'elevation', plan, payloads);
    try {
        await waitReady(host);
        expect(host.dataset.wildlifeCount).toBe('0');
        expect(preview.wildlifeDiagnostics().actors).toEqual([]);
        expect(host.dataset.unavailableWildlife).toContain('no safe land path nearby');
    }
    finally {
        preview.dispose();
    }
});
