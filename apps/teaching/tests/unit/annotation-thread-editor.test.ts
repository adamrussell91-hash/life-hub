import { describe, expect, it, vi } from 'vitest';
import { clickMenuAction, holdDelete } from './helpers/hub-list';
import { createAnnotationEditor } from '@/blocks/editors';
import { buildAnchor } from '@/blocks/annotation-anchor';
import { dulceAnnotationFixture } from '../../fixtures/annotation-dulce';
import type { AnnotationBlock, Block } from '@/schemas/block';

function mountEditor(block: AnnotationBlock): {
  mount: HTMLDivElement;
  getLatest: () => AnnotationBlock;
} {
  let latest: Block = structuredClone(block);
  const mount = document.createElement('div');
  document.body.append(mount);
  const rebuild = () => {
    mount.replaceChildren(
      createAnnotationEditor(
        latest as AnnotationBlock,
        (next) => {
          latest = next;
          rebuild();
        },
        () => latest as AnnotationBlock
      )
    );
  };
  rebuild();
  return {
    mount,
    getLatest: () => latest as AnnotationBlock
  };
}

function openFirstNote(mount: HTMLElement): void {
  mount.querySelector<HTMLButtonElement>('.block-editor__annotation-open')?.click();
}

function selectLineText(
  mount: HTMLElement,
  lineId: string,
  start: number,
  end: number
): void {
  const line = mount.querySelector<HTMLElement>(
    `.block-editor__annotation-line-text[data-line-id="${lineId}"]`
  );
  expect(line).toBeTruthy();
  const textNode = line!.firstChild;
  expect(textNode).toBeTruthy();
  const range = document.createRange();
  range.setStart(textNode!, start);
  range.setEnd(textNode!, end);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  line!.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  sel?.removeAllRanges();
}

describe('annotation thread editor 3c', () => {
  it('adds also_anchors from Add another place + text selection', () => {
    const { mount, getLatest } = mountEditor(dulceAnnotationFixture);
    openFirstNote(mount);
    mount.querySelector<HTMLButtonElement>('.block-editor__annotation-add-place')?.click();
    const lineEl = mount.querySelector<HTMLElement>(
      '.block-editor__annotation-line-text'
    );
    expect(lineEl).toBeTruthy();
    const lineId = lineEl!.dataset.lineId!;
    const text = lineEl!.textContent ?? '';
    const start = text.indexOf('Bent');
    expect(start).toBeGreaterThanOrEqual(0);
    selectLineText(mount, lineId, start, start + 'Bent'.length);

    const ann = getLatest().content.annotations[0]!;
    expect(ann.also_anchors?.length).toBe(1);
    expect(ann.anchor.id).toBeTruthy();
    expect(ann.also_anchors![0]!.id).toBeTruthy();
    expect(ann.also_anchors![0]!.quote.exact).toBe('Bent');
    expect(ann.thread?.order ?? 'text').toBe('text');
    mount.remove();
  });

  it('reorders stops from the menu and sets custom anchor_order', () => {
    const block = structuredClone(dulceAnnotationFixture);
    const text = block.content.text;
    const a = buildAnchor(text, {
      stanzaId: 'stanza_1',
      lineId: 'line_1',
      start: 0,
      end: 4
    })!;
    const b = buildAnchor(text, {
      stanzaId: 'stanza_1',
      lineId: 'line_2',
      start: 0,
      end: 11
    })!;
    const c = buildAnchor(text, {
      stanzaId: 'stanza_1',
      lineId: 'line_3',
      start: 0,
      end: 4
    })!;
    block.content.annotations[0] = {
      ...block.content.annotations[0]!,
      anchor: { ...block.content.annotations[0]!.anchor, id: 'stop_primary' },
      also_anchors: [
        { ...a, id: 'stop_a' },
        { ...b, id: 'stop_b' },
        { ...c, id: 'stop_c' }
      ],
      thread: { order: 'text', kind: 'motif' }
    };

    const { mount, getLatest } = mountEditor(block);
    openFirstNote(mount);
    const more = mount.querySelector(
      '.block-editor__annotation-stop-list .hub-list__row .hub-list__more'
    );
    expect(more).toBeTruthy();
    clickMenuAction(more!, 'down');

    const ann = getLatest().content.annotations[0]!;
    expect(ann.thread?.order).toBe('custom');
    expect(ann.thread?.anchor_order).toEqual([
      'stop_a',
      'stop_primary',
      'stop_b',
      'stop_c'
    ]);
    mount.remove();
  });

  it('deleting a stop by hold() then Undo restores it; last extra clears the thread', () => {
    vi.useFakeTimers();
    const block = structuredClone(dulceAnnotationFixture);
    const text = block.content.text;
    const extra = buildAnchor(text, {
      stanzaId: 'stanza_1',
      lineId: 'line_1',
      start: 0,
      end: 4
    })!;
    block.content.annotations[0] = {
      ...block.content.annotations[0]!,
      anchor: { ...block.content.annotations[0]!.anchor, id: 'stop_primary' },
      also_anchors: [{ ...extra, id: 'stop_extra' }],
      thread: { order: 'custom', kind: 'echo', anchor_order: ['stop_extra', 'stop_primary'] }
    };

    const { mount, getLatest } = mountEditor(block);
    openFirstNote(mount);
    const rows = mount.querySelectorAll(
      '.block-editor__annotation-stop-list .hub-list__row .hub-list__more'
    );
    expect(rows.length).toBe(2);
    // Custom order puts the extra stop first — delete that extra stop.
    holdDelete(rows[0]!);
    expect(getLatest().content.annotations[0]!.also_anchors).toBeUndefined();
    expect(getLatest().content.annotations[0]!.thread).toBeUndefined();

    const undo = [...document.querySelectorAll('.hub-toast button')].find(
      (btn) => btn.textContent === 'Undo'
    ) as HTMLButtonElement | undefined;
    expect(undo).toBeTruthy();
    undo!.click();
    expect(getLatest().content.annotations[0]!.also_anchors?.length).toBe(1);
    expect(getLatest().content.annotations[0]!.thread?.order).toBe('custom');
    mount.remove();
    vi.useRealTimers();
  });

  it('Back to text order clears custom anchor_order', () => {
    const block = structuredClone(dulceAnnotationFixture);
    const text = block.content.text;
    const extra = buildAnchor(text, {
      stanzaId: 'stanza_1',
      lineId: 'line_1',
      start: 0,
      end: 4
    })!;
    block.content.annotations[0] = {
      ...block.content.annotations[0]!,
      anchor: { ...block.content.annotations[0]!.anchor, id: 'stop_primary' },
      also_anchors: [{ ...extra, id: 'stop_extra' }],
      thread: {
        order: 'custom',
        kind: 'volta',
        anchor_order: ['stop_extra', 'stop_primary']
      }
    };
    const { mount, getLatest } = mountEditor(block);
    openFirstNote(mount);
    const more = mount.querySelector(
      '.block-editor__annotation-stop-list .hub-list__row .hub-list__more'
    );
    clickMenuAction(more!, 'text-order');
    expect(getLatest().content.annotations[0]!.thread?.order).toBe('text');
    expect(getLatest().content.annotations[0]!.thread?.anchor_order).toBeUndefined();
    mount.remove();
  });

  it('Escape inside a stop note does not close the panel', () => {
    const block = structuredClone(dulceAnnotationFixture);
    const text = block.content.text;
    const extra = buildAnchor(text, {
      stanzaId: 'stanza_1',
      lineId: 'line_1',
      start: 0,
      end: 4
    })!;
    block.content.annotations[0] = {
      ...block.content.annotations[0]!,
      anchor: { ...block.content.annotations[0]!.anchor, id: 'stop_primary' },
      also_anchors: [{ ...extra, id: 'stop_extra' }],
      thread: { order: 'text', kind: 'argument' }
    };
    const { mount } = mountEditor(block);
    openFirstNote(mount);
    const panel = mount.querySelector<HTMLElement>('.block-editor__annotation-note');
    const note = mount.querySelector<HTMLTextAreaElement>(
      '.block-editor__annotation-stop-note'
    );
    expect(panel?.hidden).toBe(false);
    expect(note).toBeTruthy();
    note!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(panel?.hidden).toBe(false);
    mount.remove();
  });

  it('thread kind pills set thread.kind', () => {
    const block = structuredClone(dulceAnnotationFixture);
    const text = block.content.text;
    const extra = buildAnchor(text, {
      stanzaId: 'stanza_1',
      lineId: 'line_1',
      start: 0,
      end: 4
    })!;
    block.content.annotations[0] = {
      ...block.content.annotations[0]!,
      anchor: { ...block.content.annotations[0]!.anchor, id: 'stop_primary' },
      also_anchors: [{ ...extra, id: 'stop_extra' }],
      thread: { order: 'text' }
    };
    const { mount, getLatest } = mountEditor(block);
    openFirstNote(mount);
    const pills = [
      ...mount.querySelectorAll<HTMLButtonElement>(
        '.block-editor__annotation-thread-kind .hub-pills__btn'
      )
    ];
    expect(pills.map((btn) => btn.textContent)).toEqual([
      'Motif',
      'Opposition',
      'Volta',
      'Echo',
      'Argument'
    ]);
    pills.find((btn) => btn.textContent === 'Opposition')?.click();
    expect(getLatest().content.annotations[0]!.thread?.kind).toBe('opposition');
    mount.remove();
  });

  it('lists orphaned also_anchors under Needs re-anchoring', () => {
    const block = structuredClone(dulceAnnotationFixture);
    block.content.annotations[0] = {
      ...block.content.annotations[0]!,
      anchor: { ...block.content.annotations[0]!.anchor, id: 'stop_primary' },
      also_anchors: [
        {
          id: 'stop_gone',
          granularity: 'word',
          stanza: 'stanza_1',
          line: 'line_missing',
          start: 0,
          end: 3,
          quote: { exact: 'zzz' }
        }
      ],
      thread: { order: 'text', kind: 'motif' }
    };
    const { mount } = mountEditor(block);
    const orphan = [...mount.querySelectorAll('.block-editor__annotation-orphan')].find(
      (btn) => btn.textContent?.includes('zzz')
    );
    expect(orphan).toBeTruthy();
    mount.remove();
  });

  it('can add a voice layer from the layer kind choices', async () => {
    const { mount, getLatest } = mountEditor(dulceAnnotationFixture);
    const add = mount.querySelector<HTMLButtonElement>(
      '.block-editor__annotation-layer-list .hub-list__add'
    );
    expect(add).toBeTruthy();
    // Layer add uses ask cards; assert the kind select on an existing free layer
    // includes Voice when no voice layer exists yet.
    const kind = mount.querySelector<HTMLSelectElement>(
      '.block-editor__annotation-layer-kind:not([disabled])'
    );
    expect(kind).toBeTruthy();
    expect([...kind!.options].map((opt) => opt.value)).toContain('voice');
    kind!.value = 'voice';
    kind!.dispatchEvent(new Event('change', { bubbles: true }));
    expect(getLatest().content.layers.some((layer) => layer.kind === 'voice')).toBe(true);
    const voiceKind = [
      ...mount.querySelectorAll<HTMLSelectElement>('.block-editor__annotation-layer-kind')
    ].find((select) => select.value === 'voice');
    expect(voiceKind?.disabled).toBe(false);
    expect([...voiceKind!.options].map((opt) => opt.value)).toContain('free');
    voiceKind!.value = 'free';
    voiceKind!.dispatchEvent(new Event('change', { bubbles: true }));
    expect(getLatest().content.layers.some((layer) => layer.kind === 'voice')).toBe(false);
    mount.remove();
  });

  async function answerKindCard(choice: 'change' | 'keep'): Promise<void> {
    const card = document.querySelector<HTMLFormElement>('.confirm-card');
    expect(card).toBeTruthy();
    if (choice === 'keep') {
      card!.querySelector<HTMLButtonElement>('button[type="button"]')?.click();
      return;
    }
    const select = card!.querySelector<HTMLSelectElement>('select');
    expect(select).toBeTruthy();
    select!.value = 'change';
    select!.dispatchEvent(new Event('change', { bubbles: true }));
    card!.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
  }

  it('can change a teacher-notes layer after confirming notes will show to students', async () => {
    const { mount, getLatest } = mountEditor(dulceAnnotationFixture);
    const teacher = [...mount.querySelectorAll<HTMLSelectElement>(
      '.block-editor__annotation-layer-kind'
    )].find((select) => select.value === 'teacher');
    expect(teacher?.disabled).toBe(false);
    expect([...teacher!.options].map((opt) => opt.value)).toEqual(
      expect.arrayContaining(['free', 'lens', 'teacher', 'voice'])
    );
    const freeKind = [...mount.querySelectorAll<HTMLSelectElement>(
      '.block-editor__annotation-layer-kind'
    )].find((select) => select.value === 'free');
    expect([...freeKind!.options].map((opt) => opt.value)).not.toContain('teacher');

    teacher!.value = 'free';
    teacher!.dispatchEvent(new Event('change', { bubbles: true }));
    await answerKindCard('keep');
    expect(getLatest().content.layers.find((layer) => layer.id === 'layer_teacher')?.kind).toBe(
      'teacher'
    );
    await vi.waitFor(() => {
      expect(teacher!.value).toBe('teacher');
    });

    teacher!.value = 'lens';
    teacher!.dispatchEvent(new Event('change', { bubbles: true }));
    await answerKindCard('change');
    const changed = getLatest().content.layers.find((layer) => layer.id === 'layer_teacher');
    expect(changed?.kind).toBe('lens');
    expect(getLatest().content.annotations.some((ann) => ann.layer_id === 'layer_teacher')).toBe(
      true
    );
    mount.remove();
  });

  it('drops voice recordings only after the kind change is confirmed', async () => {
    const block = structuredClone(dulceAnnotationFixture);
    const voiceLayer = block.content.layers[0]!;
    voiceLayer.kind = 'voice';
    block.content.voice_tracks = [
      {
        id: 'track_1',
        layer_id: voiceLayer.id,
        kind: 'reading',
        title: 'Reading',
        audio: { url: 'https://example.com/a.webm', duration_s: 1, mime: 'audio/webm' },
        transcript: { words: [], timing: 'estimated' },
        clips: [],
        status: 'draft'
      }
    ];
    const { mount, getLatest } = mountEditor(block);
    const voice = [...mount.querySelectorAll<HTMLSelectElement>(
      '.block-editor__annotation-layer-kind'
    )].find((select) => select.value === 'voice');
    expect(voice?.disabled).toBe(false);
    voice!.value = 'free';
    voice!.dispatchEvent(new Event('change', { bubbles: true }));
    await answerKindCard('keep');
    expect(getLatest().content.voice_tracks).toHaveLength(1);
    await vi.waitFor(() => expect(voice!.value).toBe('voice'));

    voice!.value = 'free';
    voice!.dispatchEvent(new Event('change', { bubbles: true }));
    await answerKindCard('change');
    expect(getLatest().content.layers.find((layer) => layer.id === voiceLayer.id)?.kind).toBe(
      'free'
    );
    expect(getLatest().content.voice_tracks).toBeUndefined();
    mount.remove();
  });

  it('can change a Periodic Table layer and drops its subgroups', async () => {
    const block = structuredClone(dulceAnnotationFixture);
    block.content.layers.push({
      id: 'layer_family',
      name: 'Comparative',
      kind: 'family',
      family: 'Comparative',
      colour: 'coral',
      sublayers: [{ id: 'sub_fig', name: 'Figurative', subgroup: 'figurative' }]
    });
    block.content.annotations[0] = {
      ...block.content.annotations[0]!,
      layer_id: 'layer_family',
      sublayer_id: 'sub_fig'
    };
    const { mount, getLatest } = mountEditor(block);
    const family = [...mount.querySelectorAll<HTMLSelectElement>(
      '.block-editor__annotation-layer-kind'
    )].find((select) => select.value === 'family');
    expect(family?.disabled).toBe(false);
    family!.value = 'free';
    family!.dispatchEvent(new Event('change', { bubbles: true }));
    await answerKindCard('change');
    const layer = getLatest().content.layers.find((row) => row.id === 'layer_family');
    expect(layer?.kind).toBe('free');
    expect(layer?.family).toBeUndefined();
    expect(layer?.sublayers).toBeUndefined();
    expect(
      getLatest().content.annotations.find((ann) => ann.layer_id === 'layer_family')?.sublayer_id
    ).toBeUndefined();
    mount.remove();
  });

  it('does not use window.prompt/confirm/alert', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(
      resolve(process.cwd(), 'src/blocks/annotation-editor.ts'),
      'utf8'
    );
    expect(source).not.toMatch(/window\.prompt|window\.confirm|\balert\s*\(/);
  });
});
