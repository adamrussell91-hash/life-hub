import { describe, expect, it } from 'vitest';
import { renderAnnotationBlock } from '@/blocks/render';
import { loadLiteraryElements } from '@/blocks/literary-elements';
import type { AnnotationItem } from '@/schemas/block';
import { threadFocusFixture } from '../../fixtures/annotation-thread-focus';

const stamp = '2026-10-22T00:00:00.000Z';

function tagged(id: string, line: string, start: number, exact: string, technique: string): AnnotationItem {
  return {
    id,
    layer_id: 'layer_imagery',
    anchor: {
      granularity: 'phrase',
      stanza: 'stanza_1',
      line,
      start,
      end: start + exact.length,
      quote: { exact }
    },
    technique: { id: technique, table_version: 'test' },
    body: { html: '<p>Note.</p>', attachments: [] },
    created_at: stamp,
    updated_at: stamp
  };
}

async function renderTagged(): Promise<HTMLElement> {
  const fixture = structuredClone(threadFocusFixture);
  fixture.content.annotations = [
    tagged('ann_simile', 'line_1', 13, 'like old beggars', 'simile'),
    tagged('ann_allit', 'line_2', 0, 'Knock-kneed', 'alliteration')
  ];
  const el = renderAnnotationBlock(fixture, 'student');
  document.body.append(el);
  await loadLiteraryElements();
  await new Promise((resolve) => setTimeout(resolve, 0));
  return el;
}

describe('annotation technique family colours', () => {
  it('recolours tagged marks to their family and shows a key', async () => {
    const el = await renderTagged();
    const toggle = el.querySelector<HTMLButtonElement>('.block-annotation__family-toggle')!;
    expect(toggle).toBeTruthy();
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(el.querySelector('.block-annotation__family-swatches')).toBeNull();
    const simile = () => el.querySelector<HTMLElement>('[data-annotation-id="ann_simile"]')!;
    expect(simile().className).not.toContain('--fam-');

    toggle.click();
    expect(simile().className).toContain('block-annotation__anchor--fam-comparative');
    expect(
      el.querySelector<HTMLElement>('[data-annotation-id="ann_allit"]')!.className
    ).toContain('block-annotation__anchor--fam-repetitive');
    const names = [...el.querySelectorAll('.block-annotation__family-swatch')].map((li) => li.textContent);
    expect(names).toEqual(['Repetitive', 'Comparative']);
    // The colours come from the Periodic Table data, so they match the cards.
    const block = el.querySelector<HTMLElement>('.block-annotation')!;
    expect(block.style.getPropertyValue('--fam-comparative')).toBe('#a98bff');

    el.querySelector<HTMLButtonElement>('.block-annotation__family-toggle')!.click();
    expect(simile().className).not.toContain('--fam-');
    el.remove();
  });

  it('stays hidden when no note carries a technique', () => {
    const el = renderAnnotationBlock(structuredClone(threadFocusFixture), 'student');
    expect(el.querySelector<HTMLElement>('.block-annotation__family-key')!.hidden).toBe(true);
  });
});
