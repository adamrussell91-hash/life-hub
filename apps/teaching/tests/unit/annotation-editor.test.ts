import { describe, expect, it, vi } from 'vitest';
import { HUB_HOLD_MS } from '../../design-kit/js/hub-list.js';
import { resetHubFeedbackForTests } from '../../design-kit/js/hub-feedback.js';
import { clickMenuAction, holdDelete } from './helpers/hub-list';
import { createAnnotationEditor } from '@/blocks/editors';
import { buildAnchor } from '@/blocks/annotation-anchor';
import { dulceAnnotationFixture } from '../../fixtures/annotation-dulce';
import type { Block } from '@/schemas/block';

describe('annotation editor 1b', () => {
  it('creates a word annotation whose offsets slice equals quote.exact', () => {
    const text = dulceAnnotationFixture.content.text;
    const line = text.stanzas[0]!.lines[3]!;
    const start = line.text.indexOf('trudge');
    const end = start + 'trudge'.length;
    const anchor = buildAnchor(text, {
      stanzaId: 'stanza_1',
      lineId: 'line_4',
      start,
      end
    });
    expect(anchor).not.toBeNull();
    expect(line.text.slice(anchor!.start!, anchor!.end!)).toBe(anchor!.quote.exact);
    expect(anchor!.granularity).toBe('word');
  });

  it('reorders attachments and persists order', () => {
    const block = structuredClone(dulceAnnotationFixture);
    block.content.annotations[0]!.body.attachments = [
      { kind: 'link', url: 'https://example.com/a', label: 'A' },
      { kind: 'link', url: 'https://example.com/b', label: 'B' }
    ];
    let latest: Block = block;
    const mount = document.createElement('div');
    document.body.append(mount);
    const rebuild = () => {
      mount.replaceChildren(
        createAnnotationEditor(
          latest as Extract<Block, { block_type: 'annotation' }>,
          (next) => {
            latest = next;
            rebuild();
          },
          () => latest as Extract<Block, { block_type: 'annotation' }>
        )
      );
    };
    rebuild();

    const open = mount.querySelector<HTMLButtonElement>(
      '.block-editor__annotation-open'
    );
    open?.click();
    const more = mount.querySelector(
      '.block-editor__annotation-attachments .hub-list__row .hub-list__more'
    );
    expect(more).toBeTruthy();
    clickMenuAction(more!, 'down');
    expect(latest.block_type).toBe('annotation');
    if (latest.block_type !== 'annotation') return;
    const labels = latest.content.annotations[0]!.body.attachments.map((a) =>
      a.kind === 'link' ? a.label : ''
    );
    expect(labels).toEqual(['B', 'A']);
    mount.remove();
  });

  it('deleting an annotation then Undo restores it', () => {
    vi.useFakeTimers();
    const block = structuredClone(dulceAnnotationFixture);
    let latest: Block = block;
    const mount = document.createElement('div');
    document.body.append(mount);
    const rebuild = () => {
      mount.replaceChildren(
        createAnnotationEditor(
          latest as Extract<Block, { block_type: 'annotation' }>,
          (next) => {
            latest = next;
            rebuild();
          },
          () => latest as Extract<Block, { block_type: 'annotation' }>
        )
      );
    };
    rebuild();
    const before =
      latest.block_type === 'annotation' ? latest.content.annotations.length : 0;
    holdDelete(
      mount.querySelector('.block-editor__annotation-ann-list .hub-list__more')!
    );
    expect(
      latest.block_type === 'annotation' && latest.content.annotations.length
    ).toBe(before - 1);
    const undo = [...document.querySelectorAll('.hub-toast button')].find(
      (btn) => btn.textContent === 'Undo'
    ) as HTMLButtonElement | undefined;
    expect(undo).toBeTruthy();
    undo!.click();
    expect(
      latest.block_type === 'annotation' && latest.content.annotations.length
    ).toBe(before);
    mount.remove();
    vi.useRealTimers();
  });

  it('deletes the open note from the note panel by holding, and a click does not', () => {
    vi.useFakeTimers();
    resetHubFeedbackForTests();
    const block = structuredClone(dulceAnnotationFixture);
    let latest: Block = block;
    const mount = document.createElement('div');
    document.body.append(mount);
    mount.append(
      createAnnotationEditor(
        block,
        (next) => {
          latest = next;
        },
        () => latest as Extract<Block, { block_type: 'annotation' }>
      )
    );
    // The side panel starts on the notes list; open the first note from it.
    expect(mount.querySelector<HTMLElement>('.block-editor__annotation-note-list')?.hidden).toBe(false);
    mount.querySelector<HTMLButtonElement>('.block-editor__annotation-open')!.click();
    const panel = mount.querySelector<HTMLElement>('.block-editor__annotation-note');
    const del = mount.querySelector<HTMLButtonElement>('.block-editor__annotation-note-delete');
    expect(panel?.hidden).toBe(false);
    expect(del?.textContent).toContain('Delete note');
    const beforeIds =
      latest.block_type === 'annotation' ? latest.content.annotations.map((ann) => ann.id) : [];
    expect(beforeIds[0]).toBe('ann_word');

    del!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    del!.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));
    expect(latest.block_type === 'annotation' && latest.content.annotations.map((ann) => ann.id)).toEqual(
      beforeIds
    );
    expect(panel?.hidden).toBe(false);
    expect(del!.querySelector('.hub-action-menu__hint')?.textContent).toBe('Keep holding');

    del!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    vi.advanceTimersByTime(HUB_HOLD_MS + 20);
    expect(latest.block_type === 'annotation' && latest.content.annotations.map((ann) => ann.id)).toEqual(
      beforeIds.slice(1)
    );
    expect(mount.querySelector<HTMLElement>('.block-editor__annotation-note')?.hidden).toBe(true);
    const undo = [...document.querySelectorAll('.hub-toast button')].find(
      (btn) => btn.textContent === 'Undo'
    ) as HTMLButtonElement | undefined;
    expect(undo).toBeTruthy();
    undo!.click();
    expect(latest.block_type === 'annotation' && latest.content.annotations.map((ann) => ann.id)).toEqual(
      beforeIds
    );
    expect(mount.querySelector<HTMLElement>('.block-editor__annotation-note')?.hidden).toBe(false);
    mount.remove();
    resetHubFeedbackForTests();
    vi.useRealTimers();
  });

  it('Escape inside the note body does not close the panel (I8)', () => {
    const block = structuredClone(dulceAnnotationFixture);
    const mount = document.createElement('div');
    document.body.append(mount);
    mount.append(
      createAnnotationEditor(block, () => {
        /* no remount */
      })
    );
    mount.querySelector<HTMLButtonElement>('.block-editor__annotation-open')?.click();
    const panel = mount.querySelector<HTMLElement>('.block-editor__annotation-note');
    expect(panel?.hidden).toBe(false);
    const rich = mount.querySelector<HTMLElement>('.block-editor__rich');
    expect(rich).toBeTruthy();
    rich!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    expect(panel?.hidden).toBe(false);
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
    expect(source).not.toMatch(/textContent = '↑'|textContent = 'Remove'/);
  });

  it('keeps the layer name field while typing (no save remount)', () => {
    const block = structuredClone(dulceAnnotationFixture);
    let latest: Block = block;
    const mount = document.createElement('div');
    document.body.append(mount);
    mount.append(
      createAnnotationEditor(
        block,
        (next) => {
          latest = next;
        },
        () => latest as Extract<Block, { block_type: 'annotation' }>
      )
    );

    mount.querySelector<HTMLButtonElement>('.block-editor__annotation-open')!.click();
    const name = [...mount.querySelectorAll<HTMLInputElement>(
      '.block-editor__annotation-layer-name'
    )].find((input) => input.value === 'Structure');
    expect(name).toBeTruthy();
    const noteBody = mount.querySelector('.block-editor__annotation-body');
    const layerSelect = mount.querySelector<HTMLSelectElement>(
      'select[aria-label="Annotation layer"]'
    );
    expect(noteBody).toBeTruthy();
    expect(layerSelect).toBeTruthy();

    name!.focus();
    const type = (value: string) => {
      name!.value = value;
      name!.setSelectionRange(value.length, value.length);
      name!.dispatchEvent(new Event('input', { bubbles: true }));
    };
    type('Structurex');
    type('Structurexy');

    expect(name!.isConnected).toBe(true);
    expect(document.activeElement).toBe(name);
    expect(name!.selectionStart).toBe('Structurexy'.length);
    expect(mount.querySelector('.block-editor__annotation-body')).toBe(noteBody);
    expect(mount.querySelector('select[aria-label="Annotation layer"]')).toBe(layerSelect);
    expect(
      [...layerSelect!.options].find((opt) => opt.value === 'layer_structure')?.textContent
    ).toBe('Structurexy');
    expect(name!.closest('.hub-list__row')?.querySelector('.hub-list__label')?.textContent).toBe(
      'Structurexy'
    );
    expect(latest.block_type).toBe('annotation');
    if (latest.block_type !== 'annotation') return;
    expect(latest.content.layers.find((layer) => layer.id === 'layer_structure')?.name).toBe(
      'Structurexy'
    );
    // Colour still commits and is allowed to repaint; the rename must already have stuck.
    const colour = name!.closest('.hub-list__row')?.querySelector<HTMLSelectElement>(
      'select[aria-label="Layer colour"]'
    );
    expect(colour).toBeTruthy();
    colour!.value = 'marine';
    colour!.dispatchEvent(new Event('change', { bubbles: true }));
    expect(latest.block_type).toBe('annotation');
    if (latest.block_type !== 'annotation') return;
    const renamed = latest.content.layers.find((layer) => layer.id === 'layer_structure');
    expect(renamed?.name).toBe('Structurexy');
    expect(renamed?.colour).toBe('marine');
    const startOn = mount.querySelector<HTMLSelectElement>(
      '.block-editor__annotation-default-layer'
    );
    expect(
      [...(startOn?.options ?? [])].find((opt) => opt.value === 'layer_structure')?.textContent
    ).toBe('Structurexy');
    mount.remove();
  });

  it('editing the annotation title does not rebuild the layer fields', () => {
    const block = structuredClone(dulceAnnotationFixture);
    let latest: Block = block;
    const mount = document.createElement('div');
    document.body.append(mount);
    mount.append(
      createAnnotationEditor(
        block,
        (next) => {
          latest = next;
        },
        () => latest as Extract<Block, { block_type: 'annotation' }>
      )
    );
    const title = mount.querySelector<HTMLInputElement>('.block-editor__annotation-title');
    const attribution = mount.querySelector<HTMLInputElement>(
      '.block-editor__annotation-attribution'
    );
    const name = mount.querySelector<HTMLInputElement>('.block-editor__annotation-layer-name');
    expect(title).toBeTruthy();
    expect(attribution).toBeTruthy();
    expect(name).toBeTruthy();
    title!.focus();
    title!.value = 'Dulce revised';
    title!.setSelectionRange(title!.value.length, title!.value.length);
    title!.dispatchEvent(new Event('input', { bubbles: true }));
    attribution!.value = 'Owen';
    attribution!.dispatchEvent(new Event('input', { bubbles: true }));
    expect(title!.isConnected).toBe(true);
    expect(document.activeElement).toBe(title);
    expect(mount.querySelector('.block-editor__annotation-layer-name')).toBe(name);
    expect(latest.block_type).toBe('annotation');
    if (latest.block_type !== 'annotation') return;
    expect(latest.content.title).toBe('Dulce revised');
    expect(latest.content.attribution).toBe('Owen');
    mount.remove();
  });

  it('shows a technique tag control in the note panel', () => {
    const mount = document.createElement('div');
    mount.append(createAnnotationEditor(dulceAnnotationFixture, () => undefined));
    mount.querySelector<HTMLButtonElement>('.block-editor__annotation-open')?.click();
    const picker = mount.querySelector<HTMLElement>(
      '.block-editor__annotation-technique'
    );
    expect(picker?.hidden).toBe(false);
    expect(
      picker?.querySelector('.block-editor__annotation-technique-btn')
    ).toBeTruthy();
    expect(picker?.querySelector('button[disabled]')).toBeNull();
  });
});

describe('several notes on one line or stanza', () => {
  type AnnotationBlock = Extract<Block, { block_type: 'annotation' }>;

  function mountEditor() {
    let latest = structuredClone(dulceAnnotationFixture) as AnnotationBlock;
    const mount = document.createElement('div');
    document.body.append(mount);
    const rebuild = () => {
      mount.replaceChildren(
        createAnnotationEditor(
          latest,
          (next) => {
            latest = next as AnnotationBlock;
            rebuild();
          },
          () => latest
        )
      );
    };
    rebuild();
    return { mount, latest: () => latest };
  }

  const lineBar = (mount: HTMLElement, lineId: string) =>
    mount.querySelector<HTMLButtonElement>(
      `.block-editor__annotation-line[data-line-id="${lineId}"] .block-editor__annotation-line-gutter`
    )!;
  const menu = () => document.querySelector<HTMLElement>('.block-editor__annotation-bar-menu');

  it('a noted line bar offers its notes and an add button per layer', () => {
    const { mount } = mountEditor();
    lineBar(mount, 'line_2').click();
    const open = menu()!;
    expect(open).toBeTruthy();
    const items = open.querySelectorAll('.block-editor__annotation-bar-menu-item');
    expect(items).toHaveLength(1);
    expect(items[0]!.textContent).toContain('Structure');
    expect(items[0]!.textContent).toContain('Compound physical detail');
    const adds = Array.from(open.querySelectorAll('.block-editor__annotation-bar-menu-new')).map(
      (btn) => btn.textContent
    );
    expect(adds).toEqual(['+ Structure', '+ Imagery', '+ Teacher notes']);
    mount.remove();
    document.querySelectorAll('.block-editor__annotation-bar-menu').forEach((m) => m.remove());
  });

  it('adds a second line note in the chosen layer', () => {
    const { mount, latest } = mountEditor();
    lineBar(mount, 'line_2').click();
    Array.from(menu()!.querySelectorAll<HTMLButtonElement>('.block-editor__annotation-bar-menu-new'))
      .find((btn) => btn.textContent === '+ Imagery')!
      .click();
    expect(menu()).toBeNull();
    const onLine = latest().content.annotations.filter(
      (ann) => ann.anchor.granularity === 'line' && ann.anchor.line === 'line_2'
    );
    expect(onLine.map((ann) => ann.layer_id)).toEqual(['layer_structure', 'layer_imagery']);
    const bar = lineBar(mount, 'line_2');
    expect(bar.dataset.noteCount).toBe('2');
    expect(bar.getAttribute('aria-label')).toContain('2 notes');
    mount.remove();
  });

  it('adds a second stanza note and still opens the first', () => {
    const { mount, latest } = mountEditor();
    const stanzaBar = () =>
      mount.querySelector<HTMLButtonElement>('.block-editor__annotation-stanza-gutter')!;
    stanzaBar().click();
    Array.from(menu()!.querySelectorAll<HTMLButtonElement>('.block-editor__annotation-bar-menu-new'))
      .find((btn) => btn.textContent === '+ Imagery')!
      .click();
    const stanzaNotes = latest().content.annotations.filter(
      (ann) => ann.anchor.granularity === 'stanza'
    );
    expect(stanzaNotes).toHaveLength(2);
    stanzaBar().click();
    expect(menu()!.querySelectorAll('.block-editor__annotation-bar-menu-item')).toHaveLength(2);
    menu()!.querySelector<HTMLButtonElement>('.block-editor__annotation-bar-menu-item')!.click();
    expect(menu()).toBeNull();
    mount.remove();
  });

  it('Escape closes the menu', () => {
    const { mount } = mountEditor();
    lineBar(mount, 'line_2').click();
    menu()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(menu()).toBeNull();
    mount.remove();
  });
});


describe('annotation editor voice recorder', () => {
  it('opens the recorder beside the poem, even from Text mode', () => {
    const block = structuredClone(dulceAnnotationFixture);
    block.content.layers.push({ id: 'layer_voice', name: 'Voice', kind: 'voice', colour: 'wave' });
    const mount = document.createElement('div');
    document.body.append(mount);
    mount.append(createAnnotationEditor(block, () => undefined, () => block));

    Array.from(mount.querySelectorAll<HTMLButtonElement>('button'))
      .find((btn) => btn.textContent === 'Text')!
      .click();
    const annotatePane = mount.querySelector<HTMLElement>('.block-editor__annotation-annotate-pane')!;
    expect(annotatePane.hidden).toBe(true);

    mount
      .querySelector<HTMLButtonElement>('.block-editor__annotation-voice-toolbar .btn--primary')!
      .click();

    const voicePanel = mount.querySelector<HTMLElement>('.block-editor__annotation-voice-panel')!;
    const listPanel = mount.querySelector<HTMLElement>('.block-editor__annotation-note-list')!;
    expect(annotatePane.hidden).toBe(false);
    expect(voicePanel.hidden).toBe(false);
    expect(voicePanel.querySelector('.block-editor__annotation-voice-recorder')).toBeTruthy();
    // The recorder takes the notes column beside the text rather than wrapping below it.
    expect(listPanel.hidden).toBe(true);

    voicePanel.querySelector<HTMLButtonElement>('.block-editor__annotation-voice-close')!.click();
    expect(voicePanel.hidden).toBe(true);
    expect(listPanel.hidden).toBe(false);
    mount.remove();
  });
});
