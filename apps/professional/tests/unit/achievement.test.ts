import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateGuideRuns } from '../../../../netlify/functions/_shared/meeting-schema.mjs';
import { openAchievementPanel, type AchievementSaveExtras } from '@/guides/achievement/panel';
import { renderAchievementCard } from '@/guides/achievement/card';
import {
  ACHIEVEMENT_ID, MOVES, currentValues, emptyState, leadMoves, mismatches, path, profileFor, readRun, stateFromRun, suggested, toRun
} from '@/guides/achievement/model';
import { guideName } from '@/guides/registry';
import { noteLine } from '@/guides/runs';
import type { GuideRun } from '@/guides/types';

const click = (root: ParentNode, selector: string) => {
  const node = root.querySelector(selector) as HTMLElement | null;
  if (!node) throw new Error(`missing ${selector}`);
  node.click();
};
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const type = (root: ParentNode, selector: string, value: string) => {
  const input = root.querySelector(selector) as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input'));
};
const base = { id: 'guide_a1', person_ref: 'shared:person:p_ollie', person_name: 'Ollie Vance', created_at: '2026-11-12T01:00:00.000Z', updated_at: '2026-11-12T01:00:00.000Z' };

afterEach(() => document.body.replaceChildren());

describe('achievement model', () => {
  it('suggests from taps, and the weakest attitude below positive names the read', () => {
    const s = emptyState('English · viva voce');
    s.taps = { value: 1, efficacy: 2, env: 3, reg: 1 };
    expect(suggested(s)).toEqual({ value: 4, efficacy: 7, env: 9, reg: 4 });
    expect(profileFor(currentValues(s))).toBe('value');
    s.values.value = 6;
    s.touched.value = true;
    expect(profileFor(currentValues(s))).toBe('reg');
    expect(profileFor({ value: 8, efficacy: 8, env: 8, reg: 8 })).toBe('flowing');
    expect(profileFor({ value: 2, efficacy: 3, env: 4, reg: 1 })).toBe('low');
  });

  it('branches: digs open on weak taps in Full, on request in Quick, always in One area; the check needs both weak or cost', () => {
    const s = emptyState('x');
    s.mode = 'full';
    s.taps = { value: 1, efficacy: 2, env: 3, reg: 1 };
    expect(path(s)).toEqual(['context', 'gate:value', 'dig:value', 'gate:efficacy', 'gate:env', 'gate:reg', 'dig:reg', 'read', 'plan']);
    s.taps.efficacy = 0;
    expect(path(s)).toContain('check');
    s.mode = 'quick';
    s.taps.efficacy = 2;
    expect(path(s)).not.toContain('dig:value');
    s.forceDig.value = true;
    s.digs.value = ['cost'];
    expect(path(s)).toEqual(['context', 'gate:value', 'dig:value', 'gate:efficacy', 'check', 'gate:env', 'gate:reg', 'read', 'plan']);
    s.mode = 'one';
    s.one = 'reg';
    s.theirOn = true;
    expect(path(s)).toEqual(['context', 'gate:reg', 'dig:reg', 'their', 'read', 'plan']);
  });

  it('a yes to "if you knew you would do well" lifts Worth it by three in the suggestion', () => {
    const s = emptyState('x');
    s.taps = { value: 1, efficacy: 1 };
    s.checks.want = 'yes';
    expect(suggested(s).value).toBe(7);
  });

  it('dig picks open their moves first; a low or flowing read gets its own move', () => {
    const s = emptyState('x');
    s.digs.reg = ['during'];
    expect(leadMoves(s, 'reg')).toEqual(['m_retrieval', 'm_strategy', 'm_steps', 'm_after']);
    expect(leadMoves(s, 'low')).toEqual(['m_low']);
    expect(leadMoves(s, 'flowing')).toEqual(['m_raise']);
  });

  it('flags a gap of three or more between your read and their own rating', () => {
    expect(mismatches({ value: 4, efficacy: 8 }, { value: 4, efficacy: 5 })).toEqual(['value']);
  });

  it('stores a full run inside the server limits and reads it back unchanged', () => {
    const s = emptyState('English · viva voce');
    s.mode = 'full';
    s.taps = { value: 1, efficacy: 0, env: 3, reg: 1 };
    s.digs = { value: ['intrinsic', 'utility', 'attainment', 'cost'], efficacy: ['mastery', 'vicarious', 'persuasion', 'affect'], env: [], reg: ['before', 'during', 'after'] };
    s.checks = { want: 'yes', hold: 'yes' };
    s.theirOn = true;
    s.their = { value: 4, efficacy: 5, env: 5, reg: 3 };
    s.quotes = { value: 'It would get me a good mark towards my ATAR.', efficacy: 'I usually do fine.', env: 'My mum helps me.', reg: 'I might say them out loud.' };
    s.chosen = ['m_steps', 'm_retrieval'];
    s.next = 'When I get home Tuesday, I will test myself on five quotes.';
    s.againDate = '2026-12-10';
    const run = toRun(s, base);
    const [checked] = validateGuideRuns([run]);
    expect(checked).toEqual(run);
    expect(Object.keys(run.checks).length).toBeLessThanOrEqual(12);
    const view = readRun(checked as GuideRun);
    expect(view.quotes.map((q) => q.area)).toEqual(['value', 'efficacy', 'env', 'reg']);
    expect(view.next).toBe(s.next);
    expect(view.their).toEqual(s.their);
    expect(view.againDate).toBe('2026-12-10');
    expect(view.moveIds).toEqual(['m_steps', 'm_retrieval']);
    const back = stateFromRun(checked as GuideRun);
    expect(currentValues(back)).toEqual(run.values);
    expect(back.digs.reg).toEqual(['before', 'during', 'after']);
  });

  it('names itself in notes, the timeline and the digest', () => {
    expect(guideName(ACHIEVEMENT_ID)).toBe('Achievement');
    expect(noteLine({ ...toRun(emptyState('Maths'), base), context: 'Maths' })).toBe('Achievement guide · Maths · see card');
  });
});

function open(about = [{ ref: 'shared:person:p_ollie', name: 'Ollie Vance' }], edit?: GuideRun) {
  const onSave = vi.fn(async (_run: GuideRun, _extras: AchievementSaveExtras) => {});
  const panel = openAchievementPanel(document, { about, onSave, edit, placedRuns: async () => [], now: () => '2026-11-12T01:00:00.000Z', newId: () => 'guide_a1' });
  return { panel, onSave, root: panel.el };
}

describe('achievement panel', () => {
  it('walks a full read with branches, their turn, the read and the plan, and saves only on Save', async () => {
    const { root, onSave } = open();
    await flush();
    type(root, 'input[name="context"]', 'English · viva voce');
    click(root, '[data-mode="full"]');
    click(root, '[data-part="achv-their-on"]');
    click(root, '[data-part="achv-start"]');
    // Worth it: Patchy opens the dig
    click(root, '[data-tap="1"]');
    type(root, 'input[name="quote"]', 'It would get me a good mark towards my ATAR.');
    click(root, '[data-part="achv-next"]');
    expect(root.querySelector('.achv-branch')).not.toBeNull();
    click(root, '[data-dig="intrinsic"]');
    click(root, '[data-part="achv-next"]');
    // Can I: Mostly, no dig, no check
    click(root, '[data-tap="2"]');
    click(root, '[data-part="achv-next"]');
    expect(root.querySelector('.guide-check')).toBeNull();
    // Backed: Solid
    click(root, '[data-tap="3"]');
    click(root, '[data-part="achv-next"]');
    // Run it: Patchy opens the dig
    click(root, '[data-tap="1"]');
    click(root, '[data-part="achv-next"]');
    click(root, '[data-dig="before"]');
    click(root, '[data-dig="during"]');
    click(root, '[data-part="achv-next"]');
    // Their turn
    for (const [area, r] of [['value', 4], ['efficacy', 5], ['env', 5], ['reg', 3]] as const) click(root, `[data-their="${area}"][data-rating="${r}"]`);
    click(root, '[data-part="achv-next"]');
    // The read: stream, sliders, the gap with their rating
    expect(root.querySelector('svg.achv-stream')).not.toBeNull();
    expect(root.querySelector('.achv-reads__name')!.textContent).toBe('Not seeing the point');
    expect(root.querySelector('.achv-diff')!.textContent).toContain('Worth it');
    const worth = root.querySelector('input[data-area="value"]') as HTMLInputElement;
    worth.value = '6';
    worth.dispatchEvent(new Event('input'));
    expect(root.querySelector('.achv-reads__name')!.textContent).toBe('Willing, not yet organised');
    click(root, '[data-part="achv-plan"]');
    // The plan: starts at Run it, the dig picks first, pairing advice open
    expect(root.querySelector('.achv-start__title')!.textContent).toContain('Run it');
    expect(root.querySelector('details.achv-more')!.hasAttribute('open')).toBe(true);
    click(root, '[data-move="m_steps"]');
    click(root, '[data-move="m_retrieval"]');
    expect((root.querySelector('[data-move="m_strategy"]') as HTMLButtonElement).disabled).toBe(true);
    type(root, 'input[name="next"]', 'When I get home Tuesday, I will test myself on five quotes.');
    expect(onSave).not.toHaveBeenCalled();
    click(root, '[data-part="achv-save"]');
    await flush();
    const [run, extras] = onSave.mock.calls[0]!;
    expect(run).toMatchObject({ id: 'guide_a1', guide: ACHIEVEMENT_ID, person_ref: 'shared:person:p_ollie', context: 'English · viva voce', profile: 'reg' });
    expect(run.values).toEqual({ value: 6, efficacy: 7, env: 9, reg: 4 });
    expect(run.moves).toEqual([MOVES.m_steps!.text, MOVES.m_retrieval!.text]);
    expect(run.checks).toMatchObject({ d_value: 'intrinsic', d_reg: 'before,during', t_value: '4', t_reg: '3', again: '2026-12-10' });
    expect(extras.lookAgain).toBe('2026-12-10');
    expect(validateGuideRuns([run])[0]).toEqual(run);
    expect(document.body.contains(root)).toBe(false);
  });

  it('opens the can’t-or-won’t check when both are weak, and the perfectionism side card from it', async () => {
    const { root } = open();
    await flush();
    type(root, 'input[name="context"]', 'Maths');
    click(root, '[data-part="achv-start"]');
    click(root, '[data-tap="0"]');
    click(root, '[data-part="achv-next"]');
    click(root, '[data-tap="1"]');
    click(root, '[data-part="achv-next"]');
    expect(root.querySelector('.guide-check h4')!.textContent).toContain('Can’t, or won’t?');
    click(root, '[data-probe="want"][data-option="yes"]');
    expect(root.querySelector('.achv-nudge')!.textContent).toContain('moved up three');
    click(root, '[data-probe="hold"][data-option="yes"]');
    click(root, '[data-part="achv-perfection"]');
    expect((root.querySelector('.achv-sheet') as HTMLElement).hidden).toBe(false);
    click(root, '[data-part="achv-sheet-close"]');
    expect((root.querySelector('.achv-sheet') as HTMLElement).hidden).toBe(true);
  });

  it('asks who when several are in the room; explains when nobody is', async () => {
    const two = open([{ ref: 'a', name: 'Ollie Vance' }, { ref: 'b', name: 'Sam Lee' }]);
    await flush();
    expect(two.root.querySelectorAll('[data-about]').length).toBe(2);
    two.panel.close();
    const none = open([]);
    await flush();
    expect(none.root.textContent).toContain('Add them to In the room first');
  });

  it('a failed save shows one alert and re-enables Save', async () => {
    const { root, onSave } = open();
    onSave.mockRejectedValue(new Error('nope'));
    await flush();
    type(root, 'input[name="context"]', 'Maths');
    click(root, '[data-mode="one"]');
    click(root, '[data-area="reg"]');
    click(root, '[data-part="achv-start"]');
    click(root, '[data-tap="3"]');
    click(root, '[data-part="achv-next"]');
    click(root, '[data-part="achv-next"]');
    click(root, '[data-part="achv-plan"]');
    click(root, '[data-part="achv-save"]');
    await flush();
    click(root, '[data-part="achv-save"]');
    await flush();
    expect(root.querySelectorAll('[role="alert"]').length).toBe(1);
    expect((root.querySelector('[data-part="achv-save"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it('editing a saved run opens on the read and keeps its id and created time', async () => {
    const s = emptyState('Maths');
    s.taps = { value: 2, efficacy: 2, env: 2, reg: 1 };
    const saved = toRun(s, base);
    const { root, onSave } = open([], saved);
    await flush();
    expect(root.querySelector('svg.achv-stream')).not.toBeNull();
    click(root, '[data-part="achv-plan"]');
    click(root, '[data-again="none"]');
    click(root, '[data-part="achv-save"]');
    await flush();
    const [run, extras] = onSave.mock.calls[0]!;
    expect(run.id).toBe(saved.id);
    expect(run.created_at).toBe(saved.created_at);
    expect(extras.lookAgain).toBeNull();
  });
});

describe('achievement card', () => {
  it('shows the read in words, their words by area, the moves with sources and the next step', () => {
    const s = emptyState('English · viva voce');
    s.taps = { value: 1, efficacy: 2, env: 3, reg: 1 };
    s.quotes = { value: 'Just for marks.' };
    s.chosen = ['m_utility'];
    s.next = 'When I get home, I will write two sentences.';
    s.againDate = '2026-12-10';
    const run = toRun(s, base);
    const card = renderAchievementCard(document, { run, history: [{ at: '2026-10-15T01:00:00.000Z', values: { value: 1, efficacy: 4, env: 9, reg: 4 } }], onEdit: () => {} });
    expect(card.querySelector('.guide-card__pname')!.textContent).toBe('Not seeing the point');
    expect(card.querySelector('.achv-key')!.textContent).toContain('Narrowest: Worth it');
    expect(card.querySelector('.achv-key')!.textContent).toContain('dashed');
    expect(card.querySelectorAll('.achv-stream__ghost').length).toBe(2);
    expect(card.querySelector('blockquote.achv-a--value')!.textContent).toBe('“Just for marks.”');
    expect(card.querySelector('.achv-card__moves small')!.textContent).toContain('Hulleman');
    expect(card.querySelector('.achv-card__next')!.textContent).toContain('Look again');
  });
});
