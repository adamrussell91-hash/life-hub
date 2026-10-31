import { describe, expect, it, vi } from 'vitest';
import {
  draftProblem, draftToFusion, editStep, fromChip, isUsed, loopOptions, moveStep, ownStep, removeStep, setLoop, stepHint, useStep
} from '@/views/walkthrus-fuse-steps';
import { fitName, fusedTileSvg, PLACEHOLDER_FIGURE, weldPath, type Fusion } from '../../../../packages/walkthrus/board/fused';
import { axialToPixel } from '../../../../packages/walkthrus/board/hex';

const A = 'w1-cold-calling';
const B = 'w1-say-it-again-better';
const src = (id: string, n: number) => ({ id, n, label: `Invented ${id.slice(3, 7)} ${n}`, text: `Made-up text ${n}.` });
const titleOf = (id: string) => (id === A ? 'Cold calling' : id === B ? 'Say it again better' : id);

describe('fuse bench step logic', () => {
  it('uses a step once, adds own steps, and marks used', () => {
    let steps = useStep([], src(A, 1));
    steps = useStep(steps, src(A, 1));
    expect(steps).toHaveLength(1);
    expect(isUsed(steps, A, 1)).toBe(true);
    expect(isUsed(steps, A, 2)).toBe(false);
    steps = ownStep(useStep(steps, src(B, 2)));
    expect(steps.map((s) => s.from?.n ?? null)).toEqual([1, 2, null]);
    expect(stepHint(3)).toBe('Five steps suggested. 3 steps so far.');
    expect(stepHint(5)).toBe('Five steps, as suggested.');
  });

  it('reorders and keeps loops pointing at the same step', () => {
    let steps = [src(A, 1), src(A, 2), src(B, 1)].reduce(useStep, [] as ReturnType<typeof useStep>);
    steps = setLoop(steps, 2, 1); // step 3 loops back to step 1
    expect(loopOptions(steps, 2)).toEqual([1, 2]);
    steps = moveStep(steps, 0, 1); // A1 now step 2
    expect(steps.map((s) => s.from!.n)).toEqual([2, 1, 1]);
    expect(steps[2]!.loop_to).toBe(2);
    steps = removeStep(steps, 1); // remove A1: the loop has nowhere to go
    expect(steps[1]!.loop_to).toBeNull();
    expect(setLoop(steps, 0, 1)[0]!.loop_to).toBeNull(); // never to itself
  });

  it('edits mark the step edited and show on the from chip', () => {
    let steps = useStep([], src(A, 1));
    expect(fromChip(steps[0]!, titleOf)).toBe('Cold calling · 1');
    steps = editStep(steps, 0, { label: 'My heading' }, src(A, 1));
    expect(fromChip(steps[0]!, titleOf)).toBe('Cold calling · 1 · edited');
    steps = editStep(steps, 0, { label: src(A, 1).label }, src(A, 1));
    expect(steps[0]!.edited).toBe(false);
    expect(fromChip(ownStep([])[0]!, titleOf)).toBe('Your own step');
  });

  it('builds the fusion to save', () => {
    const steps = setLoop(ownStep([src(A, 1), src(B, 1)].reduce(useStep, [] as ReturnType<typeof useStep>)), 1, 1);
    expect(draftProblem({ name: ' ', why: '', steps })).toMatch(/name/);
    expect(draftProblem({ name: 'X', why: '', steps: ownStep([]) })).toMatch(/step/);
    const f = draftToFusion({ name: ' Call and polish ', why: 'One routine.', steps }, { parents: [A, B], clusterId: 'cl_talk', now: '2026-10-31T00:00:00.000Z' });
    expect(f.id).toMatch(/^fu_[a-z0-9]{6,24}$/);
    expect(f.name).toBe('Call and polish');
    expect(f.steps).toHaveLength(2); // the blank own step drops
    expect(f.steps[1]!.loop_to).toBe(1);
    expect(f.drawing.status).toBe('none');
    const again = draftToFusion({ name: 'Renamed', why: '', steps }, { parents: [A, B], clusterId: null, existing: f });
    expect(again.id).toBe(f.id);
    expect(again.cluster_id).toBe('cl_talk');
  });
});

const fusion = (over: Partial<Fusion> = {}): Fusion => ({
  id: 'fu_abc123', name: 'Call and polish', parents: [A, B], cluster_id: null, steps: [], why: '',
  drawing: { status: 'none', scene: null, svg: null, note: null, at: null }, created_at: '2026-10-31T00:00:00.000Z', ...over
});

describe('fused tile', () => {
  it('draws the frame, FUSED, the parent numbers, the name and a dashed figure until drawn', () => {
    const svg = fusedTileSvg(fusion(), { size: 60 });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('FUSED');
    expect(svg).toContain('90 + 98');
    expect(svg).toContain('#ffd400');
    expect(svg).toContain(PLACEHOLDER_FIGURE);
    expect(svg).toContain('CALL AND');
    expect(svg.match(/<polygon/g)).toHaveLength(3);
    expect(fusedTileSvg(fusion(), { standalone: false }).startsWith('<g')).toBe(true);
  });

  it('shows a safe drawing and escapes the name', () => {
    const body = '<circle cx="60" cy="45" r="9" fill="currentColor"/>';
    const svg = fusedTileSvg(fusion({ name: 'A <b> & C', drawing: { status: 'drawn', scene: [], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 90">${body}</svg>`, note: null, at: null } }));
    expect(svg).toContain(body);
    expect(svg).not.toContain(PLACEHOLDER_FIGURE);
    expect(svg).toContain('&lt;B&gt; &amp; C');
    const bad = fusedTileSvg(fusion({ drawing: { status: 'drawn', scene: [], svg: '<svg><script>x</script></svg>', note: null, at: null } }));
    expect(bad).not.toContain('<script');
    expect(bad).toContain(PLACEHOLDER_FIGURE);
  });

  it('fits long names into two lines with an ellipsis', () => {
    expect(fitName('Call and polish', 13)).toEqual(['CALL AND', 'POLISH']);
    const long = fitName('Retrieval quizzing with mini whiteboards then whole class feedback', 13);
    expect(long).toHaveLength(2);
    expect(long[1]!.endsWith('…')).toBe(true);
    expect(long.every((l) => l.length <= 13)).toBe(true);
  });

  it('welds two touching hexagons across their gap', () => {
    const size = 50;
    const drawn = 46;
    const a = axialToPixel({ q: 0, r: 0 }, size);
    const b = axialToPixel({ q: 0, r: 1 }, size); // straight below
    const d = weldPath(a, b, { drawn });
    const ys = [...d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => Number(m[2]));
    const xs = [...d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => Number(m[1]));
    const edgeA = (drawn * Math.sqrt(3)) / 2;
    const edgeB = b.y - edgeA;
    expect(Math.min(...ys)).toBeLessThan(edgeA); // reaches into a
    expect(Math.max(...ys)).toBeGreaterThan(edgeB); // and into b
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(size); // short
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(drawn * 0.32, 1);
    expect(d.endsWith('Z')).toBe(true);
    expect(weldPath(a, a, { drawn })).toBe('');
  });
});

describe('fuse bench', () => {
  it('uses, reorders, saves and asks to draw', async () => {
    const { openFuseBench } = await import('@/views/walkthrus-fuse');
    const host = document.createElement('div');
    document.body.append(host);
    const onSave = vi.fn(async (_f: Fusion) => {});
    const onDraw = vi.fn(async (f: Fusion) => ({ ...f, drawing: { ...f.drawing, status: 'drawn' as const, svg: '<svg viewBox="0 0 120 90"><circle cx="1" cy="1" r="1"/></svg>' } }));
    const bench = openFuseBench({
      parents: [A, B], clusterId: 'cl_talk', host, titleOf, codeOf: (id) => (id === A ? '90' : '98'), onSave, onDraw,
      stepsOf: async (id) => [1, 2, 3, 4, 5].map((n) => ({ label: `Invented ${id.slice(3, 7)} ${n}`, text: `Made-up text ${n}.` }))
    });
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
    const q = <T extends Element>(sel: string) => [...host.querySelectorAll<T>(sel)];
    expect(q('.wt-fuse__source')).toHaveLength(10);
    q<HTMLButtonElement>('.wt-fuse__use')[0]!.click();
    q<HTMLButtonElement>('.wt-fuse__use')[5]!.click();
    expect(q('.wt-fuse__source.is-used')).toHaveLength(2);
    expect(q('.wt-fuse__chip').map((c) => c.textContent)).toEqual(['Cold calling · 1', 'Say it again better · 1']);
    host.querySelector<HTMLButtonElement>('[aria-label="Move step 2 up"]')!.click();
    expect(q('.wt-fuse__chip').map((c) => c.textContent)).toEqual(['Say it again better · 1', 'Cold calling · 1']);
    const heading = q<HTMLInputElement>('.wt-fuse__step input')[0]!;
    heading.value = 'My own heading';
    heading.dispatchEvent(new Event('input'));
    expect(q('.wt-fuse__chip')[0]!.textContent).toBe('Say it again better · 1 · edited');
    expect(host.querySelector('.wt-fuse__hint')!.textContent).toMatch(/Five steps suggested/);

    const save = q<HTMLButtonElement>('.wt-fuse__actions .btn--primary')[0]!;
    save.click();
    await Promise.resolve();
    expect(onSave).not.toHaveBeenCalled(); // no name yet
    const name = host.querySelector<HTMLInputElement>('input[maxlength="60"]')!;
    name.value = 'Call and polish';
    save.click();
    for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0]![0];
    expect(saved.parents).toEqual([A, B]);
    expect(saved.steps[0]!.label).toBe('My own heading');
    expect(saved.steps[0]!.edited).toBe(true);
    expect(host.querySelector('.wt-fuse__ask')!.textContent).toBe('Draw it? About A$0.10–0.25');
    q<HTMLButtonElement>('.wt-fuse__draw .btn--primary')[0]!.click();
    for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
    expect(onDraw).toHaveBeenCalledTimes(1);
    expect(host.querySelector('.wt-fuse__draw')!.textContent).toMatch(/Redraw/);
    expect(host.querySelector('[role="dialog"]')!.getAttribute('aria-labelledby')).toBeTruthy();
    bench.close();
    expect(host.querySelector('.wt-fuse')).toBeNull();
  });
});
