import { afterEach, describe, expect, it } from 'vitest';
import { renderAnnotationBlock } from '@/blocks/render';
import { loadLiteraryElements } from '@/blocks/literary-elements';
import type { AnnotationItem } from '@/schemas/block';
import { threadFocusFixture } from '../../fixtures/annotation-thread-focus';

const stamp = '2026-11-01T00:00:00.000Z';

function tagged(id: string, line: string, start: number, exact: string, technique: string, note: string): AnnotationItem {
  return {
    id,
    layer_id: 'layer_imagery',
    anchor: { granularity: 'phrase', stanza: 'stanza_1', line, start, end: start + exact.length, quote: { exact } },
    technique: { id: technique, table_version: 'test' },
    body: { html: `<p>${note}</p>`, attachments: [] },
    created_at: stamp,
    updated_at: stamp
  };
}

async function renderTagged(): Promise<HTMLElement> {
  const fixture = structuredClone(threadFocusFixture);
  fixture.content.annotations = [
    tagged('ann_simile', 'line_1', 13, 'like old beggars', 'simile', 'Soldiers reduced to beggars.'),
    tagged('ann_allit', 'line_2', 0, 'Knock-kneed', 'alliteration', 'Hard k sounds.')
  ];
  const el = renderAnnotationBlock(fixture, 'student');
  document.body.append(el);
  await loadLiteraryElements();
  await new Promise((resolve) => setTimeout(resolve, 0));
  return el;
}

const toggle = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('.block-annotation__tiles-toggle')!;

describe('technique tiles', () => {
  afterEach(() => {
    localStorage.clear();
    document.body.replaceChildren();
  });

  it('is off until the student switches it on, then puts a tile after each tagged phrase', async () => {
    const el = await renderTagged();
    expect(toggle(el).getAttribute('aria-pressed')).toBe('false');
    expect(el.querySelector('.block-annotation__tile')).toBeNull();

    toggle(el).click();
    expect(toggle(el).getAttribute('aria-pressed')).toBe('true');
    const tiles = [...el.querySelectorAll<HTMLElement>('.block-annotation__tile')];
    expect(tiles.map((t) => t.dataset.tileFor)).toEqual(['ann_simile', 'ann_allit']);
    expect(tiles[0]!.textContent).toBe('SimSimile');
    const phrase = el.querySelector<HTMLElement>('.block-annotation__anchor[data-annotation-id="ann_simile"]')!;
    expect(phrase.classList.contains('block-annotation__anchor--tiled')).toBe(true);
    expect(phrase.nextElementSibling).toBe(tiles[0]);
    // Family colour comes from the Periodic Table data.
    expect(tiles[0]!.style.getPropertyValue('--tile-c')).toBe('#a98bff');
    // The thread-highlighting text offsets are unaffected: the line text still reads cleanly.
    expect(phrase.textContent).toBe('like old beggars');
  });

  it('opens the card under the line, not in the side panel, and closes it again', async () => {
    const el = await renderTagged();
    toggle(el).click();
    el.querySelector<HTMLButtonElement>('[data-tile-for="ann_simile"]')!.click();

    const card = el.querySelector<HTMLElement>('[data-tile-card-for="ann_simile"]')!;
    expect(card).toBeTruthy();
    expect(card.previousElementSibling?.getAttribute('data-line-id')).toBe('line_1');
    expect(card.textContent).toContain('Simile');
    expect(card.textContent).toContain('Soldiers reduced to beggars.');
    expect(card.querySelector('.block-annotation__element')).toBeTruthy();
    expect(el.querySelector<HTMLElement>('.block-annotation__panel')!.hidden).toBe(true);
    expect(el.querySelector('[data-tile-for="ann_simile"]')!.getAttribute('aria-expanded')).toBe('true');

    // Tapping the phrase itself toggles the same card.
    el.querySelector<HTMLButtonElement>('button.block-annotation__anchor[data-annotation-id="ann_simile"]')!.click();
    expect(el.querySelector('[data-tile-card-for]')).toBeNull();

    el.querySelector<HTMLButtonElement>('button.block-annotation__anchor[data-annotation-id="ann_allit"]')!.click();
    expect(el.querySelector('[data-tile-card-for="ann_allit"]')).toBeTruthy();
    el.querySelector<HTMLButtonElement>('.block-annotation__tile-card-close')!.click();
    expect(el.querySelector('[data-tile-card-for]')).toBeNull();
  });

  it('remembers the choice for the next lesson, and switching off restores the side panel', async () => {
    const first = await renderTagged();
    toggle(first).click();
    first.remove();

    const again = await renderTagged();
    expect(toggle(again).getAttribute('aria-pressed')).toBe('true');
    expect(again.querySelectorAll('.block-annotation__tile')).toHaveLength(2);

    toggle(again).click();
    expect(again.querySelector('.block-annotation__tile')).toBeNull();
    again.querySelector<HTMLButtonElement>('button.block-annotation__anchor[data-annotation-id="ann_simile"]')!.click();
    expect(again.querySelector('[data-tile-card-for]')).toBeNull();
  });
});
