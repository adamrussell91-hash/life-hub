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

  it('the plan heads a pre-unit lesson as Pre, ahead of week 1', () => {
    const two = [{ id: 'P', title: 'Before', blocks: [] }, { id: 'L1', title: 'One', blocks: [] }] as never;
    const host = document.createElement('div');
    mountDeepPlan(host, { deep: [du], lessons: two, weeks: new Map([['P', 0], ['L1', 1]]), scope, onOpen: vi.fn(), onNew: vi.fn() });
    expect([...host.querySelectorAll('.du-map thead th')].map((th) => th.textContent)).toEqual(['Deep understanding', 'Pre', 'Wk 1']);
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

describe('pieces and the organiser', () => {
  const tracked = { ...du, pieces: [{ id: 'kp_aa11bb', text: 'Old words in the piece.', tier: 'essential' as const }] };

  it('the plan shows a piece with an organiser line as its short prompt, and opens to the words and the way to edit them', () => {
    const edit = vi.fn();
    const host = document.createElement('div');
    mountDeepPlan(host, {
      deep: [tracked], lessons, weeks: new Map([['L1', 1]]), scope, onOpen: vi.fn(), onNew: vi.fn(),
      lines: new Map([['kp_aa11bb', { line_id: 'ol_1', prompt: 'What does a form do?', text: 'Words on the sheet.' }]]),
      onEditInOrganiser: edit
    });
    expect(host.querySelector('.du-piece__name')?.textContent).toBe('What does a form do?');
    expect(host.textContent).not.toContain('Words on the sheet.');
    host.querySelector<HTMLButtonElement>('.du-piece__head')!.click();
    expect(host.textContent).toContain('Words on the sheet.');
    [...host.querySelectorAll('button')].find((b) => b.textContent === 'Edit in the organiser')!.click();
    expect(edit).toHaveBeenCalledWith('kp_aa11bb');
  });

  it('a piece with no line keeps its full sentence', () => {
    const host = document.createElement('div');
    mountDeepPlan(host, { deep: [tracked], lessons, weeks: new Map(), scope, onOpen: vi.fn(), onNew: vi.fn() });
    expect(host.querySelector('.du-piece__head')).toBeNull();
    expect(host.textContent).toContain('Old words in the piece.');
  });

  it('Make one locks the words of a piece with a line, and leaves the others editable', () => {
    const two = { ...du, pieces: [...tracked.pieces, { id: 'kp_cc22dd', text: 'Not on the sheet.', tier: 'strong' as const }] };
    const host = document.createElement('div');
    mountDeepEditor(host, {
      du: two, all: [two], lessons, weeks: new Map(), scope, onChange: vi.fn(), onClose: vi.fn(),
      lines: new Map([['kp_aa11bb', { line_id: 'ol_1', prompt: '', text: 'Old words in the piece.' }]])
    });
    const boxes = [...host.querySelectorAll<HTMLTextAreaElement>('[aria-label="Knowledge piece"]')];
    expect(boxes.map((b) => b.readOnly)).toEqual([true, false]);
  });
});
