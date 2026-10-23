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

  const back = (root: HTMLElement) =>
    [...root.querySelectorAll('button')].find((b) => b.textContent === '‹ Back')!.click();
  const typeQuote = (root: HTMLElement, text: string) => {
    const quote = root.querySelector('input[name="quote"]') as HTMLInputElement;
    quote.value = text;
    quote.dispatchEvent(new Event('input'));
  };

  it('Back to context then Start keeps taps and quotes', async () => {
    const { root, onSave } = open();
    await toPrompts(root);
    click(root, '[data-tap="0"]');
    typeQuote(root, 'Mum makes me.');
    click(root, '[data-part="guide-next"]');
    back(root);
    back(root);
    const input = root.querySelector('input[name="context"]') as HTMLInputElement;
    expect(input.value).toBe('English · essays');
    click(root, '[data-part="guide-start"]');
    expect(root.querySelector('[data-tap="0"]')?.classList.contains('is-on')).toBe(true);
    for (let i = 0; i < 6; i++) {
      if (i > 0) click(root, '[data-tap="0"]');
      click(root, '[data-part="guide-next"]');
    }
    click(root, '[data-part="guide-save"]');
    await flush();
    expect(onSave.mock.calls[0]![0].quotes).toEqual(['Mum makes me.']);
  });

  it('clears stale check answers when the check is no longer needed', async () => {
    const { root, onSave } = open();
    await toPrompts(root);
    for (const tap of [0, 1, 3, 2, 0, 1]) {
      click(root, `[data-tap="${tap}"]`);
      click(root, '[data-part="guide-next"]');
    }
    click(root, '[data-probe="alone"][data-option="yes"]');
    back(root);
    for (let i = 0; i < 6; i++) {
      if (i > 0) back(root);
    }
    // now at prompt 1: set all taps to 0 by walking forward
    for (let i = 0; i < 6; i++) {
      click(root, '[data-tap="0"]');
      click(root, '[data-part="guide-next"]');
    }
    expect(root.querySelector('.guide-check')).toBeNull();
    click(root, '[data-part="guide-save"]');
    await flush();
    expect(onSave.mock.calls[0]![0].checks).toEqual({});
  });

  it('saves quotes de-duplicated and in prompt order', async () => {
    const { root, onSave } = open();
    await toPrompts(root);
    const words = ['one', 'two', 'one', '', '  three  ', 'two'];
    for (let i = 0; i < 6; i++) {
      click(root, '[data-tap="0"]');
      typeQuote(root, words[i]!);
      click(root, '[data-part="guide-next"]');
    }
    click(root, '[data-part="guide-save"]');
    await flush();
    expect(onSave.mock.calls[0]![0].quotes).toEqual(['one', 'two', 'three']);
  });

  it('a failed save shows one alert and re-enables Save', async () => {
    const { root, onSave } = open();
    onSave.mockRejectedValue(new Error('nope'));
    await toPrompts(root);
    for (let i = 0; i < 6; i++) {
      click(root, '[data-tap="0"]');
      click(root, '[data-part="guide-next"]');
    }
    const save = root.querySelector('[data-part="guide-save"]') as HTMLButtonElement;
    save.click();
    await flush();
    save.click();
    await flush();
    expect(root.querySelectorAll('[role="alert"]').length).toBe(1);
    expect(save.disabled).toBe(false);
    expect(document.body.contains(root)).toBe(true);
  });

  it('Escape closes the panel', () => {
    const { root } = open();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.body.contains(root)).toBe(false);
  });
});
