import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountDeepPlan } from '@/deep/plan-view';
import { mountDeepEditor } from '@/deep/editor';

const du = { id: 'du_ab12cd', claim: 'A borrowed form turned back on its makers.', why: 'Carries to unseen texts.', dot_points: ['area-one:U1'], concept_bullets: ['ARG1'], pieces: [{ id: 'kp_aa11bb', text: 'The form began as a warning story', tier: 'essential' as const }], shared_piece_ids: [], steps: [] };
const lessons = [{ id: 'L1', title: 'One', dot_points: ['area-one:U1'], blocks: [] }] as never;
const scope = { points: [{ ref: 'area-one:U1', id: 'U1', kind: 'U' as const, short: 'Close reading' }], bullets: [{ ref: 'ARG1', text: 'claims need reasons', via: ['U1'] }] };

describe('deep understanding views', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('the plan shows each claim, its links and its gaps, and offers a new one', () => {
    const onNew = vi.fn();
    const host = document.createElement('div');
    mountDeepPlan(host, { deep: [du], lessons, weeks: new Map([['L1', 1]]), scope, onOpen: vi.fn(), onNew });
    expect(host.textContent).toContain('A borrowed form turned back on its makers.');
    expect(host.textContent).toContain('U1');
    expect(host.textContent).toContain('ARG1');
    expect(host.textContent).toContain('not taught yet');
    host.querySelector<HTMLButtonElement>('[data-du-action="new"]')!.click();
    expect(onNew).toHaveBeenCalled();
  });

  it('the editor lists only the unit’s scope and saves as you go', () => {
    const onChange = vi.fn();
    const host = document.createElement('div');
    mountDeepEditor(host, { du: { ...du, dot_points: [], concept_bullets: [] }, all: [du], lessons, weeks: new Map(), scope, onChange, onClose: vi.fn() });
    const boxes = [...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-du-link]')];
    expect(boxes.map((b) => b.value)).toEqual(['area-one:U1', 'ARG1']);
    boxes[0]!.click();
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ dot_points: ['area-one:U1'] }));
    expect(host.textContent).not.toContain('Search all');
  });
});
