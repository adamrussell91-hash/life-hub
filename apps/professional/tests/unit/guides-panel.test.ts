import { afterEach, describe, expect, it, vi } from 'vitest';
import { openGuidePanel } from '@/guides/guide-panel';
import { GUIDES } from '@/guides/registry';
import type { GuideRun } from '@/guides/types';

const click = (root: ParentNode, selector: string) => (root.querySelector(selector) as HTMLElement).click();
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function open(about = [{ ref: 'shared:person:p_jonah', name: 'Jonah Pereira' }]) {
  const onSave = vi.fn(async (_run: GuideRun) => {});
  const panel = openGuidePanel(document, {
    guides: GUIDES, about, onSave,
    placedRuns: async () => [],
    now: () => '2026-10-27T01:00:00.000Z', newId: () => 'guide_t1'
  });
  return { panel, onSave, root: panel.el };
}

afterEach(() => document.body.replaceChildren());

async function toPrompts(root: HTMLElement) {
  click(root, '[data-guide="motivation_sdt"]');
  await flush();
  const input = root.querySelector('input[name="context"]') as HTMLInputElement;
  input.value = 'English · essays';
  input.dispatchEvent(new Event('input'));
  click(root, '[data-part="guide-start"]');
}

describe('guide panel', () => {
  it('walks context → six prompts → check → mix, and saves only on Save', async () => {
    const { root, onSave } = open();
    await toPrompts(root);
    const taps = [0, 1, 3, 2, 0, 1];
    for (const tap of taps) {
      expect(root.querySelector('.guide-prompt__ask')).not.toBeNull();
      click(root, `[data-tap="${tap}"]`);
      click(root, '[data-part="guide-next"]');
    }
    expect(root.querySelector('.guide-check')).not.toBeNull();
    click(root, '[data-probe="alone"][data-option="yes"]');
    click(root, '[data-probe="feel"][data-option="guilty"]');
    click(root, '[data-part="guide-next"]');
    expect(root.querySelectorAll('[role="slider"]').length).toBe(6);
    expect(onSave).not.toHaveBeenCalled();
    click(root, '[data-part="guide-save"]');
    await flush();
    const run = onSave.mock.calls[0]![0];
    expect(run).toMatchObject({ id: 'guide_t1', guide: 'motivation_sdt', person_ref: 'shared:person:p_jonah', context: 'English · essays' });
    expect(run.values).toEqual({ amotivation: 0, external: 3, introjected: 9, identified: 6, integrated: 0, intrinsic: 3 });
    expect(run.checks).toEqual({ alone: 'yes', feel: 'guilty' });
    expect(run.profile).toBe('control');
    expect(run.moves.length).toBe(3);
    expect(document.body.contains(root)).toBe(false);
  });

  it('skips the check when it is not needed, and keeps a quote', async () => {
    const { root, onSave } = open();
    await toPrompts(root);
    for (let i = 0; i < 6; i++) {
      click(root, `[data-tap="${i === 1 ? 3 : 0}"]`);
      if (i === 1) {
        const quote = root.querySelector('input[name="quote"]') as HTMLInputElement;
        quote.value = 'Mum makes me.';
        quote.dispatchEvent(new Event('input'));
      }
      click(root, '[data-part="guide-next"]');
    }
    expect(root.querySelector('.guide-check')).toBeNull();
    click(root, '[data-part="guide-save"]');
    await flush();
    expect(onSave.mock.calls[0]![0].quotes).toEqual(['Mum makes me.']);
  });

  it('asks who it is about when several are in the room; explains when nobody is', async () => {
    const two = open([{ ref: 'a', name: 'Jonah Pereira' }, { ref: 'b', name: 'Sam Lee' }]);
    click(two.root, '[data-guide="motivation_sdt"]');
    await flush();
    expect(two.root.querySelectorAll('[data-about]').length).toBe(2);
    two.panel.close();
    const none = open([]);
    expect(none.root.textContent).toContain('Add them to In the room first');
    expect(none.root.querySelector('[data-guide]')?.hasAttribute('disabled')).toBe(true);
  });

  it('Start waits for a context; ✕ closes without saving', async () => {
    const { root, onSave, panel } = open();
    click(root, '[data-guide="motivation_sdt"]');
    await flush();
    expect((root.querySelector('[data-part="guide-start"]') as HTMLButtonElement).disabled).toBe(true);
    click(root, '[data-part="guide-close"]');
    expect(onSave).not.toHaveBeenCalled();
    expect(document.body.contains(panel.el)).toBe(false);
  });
});
