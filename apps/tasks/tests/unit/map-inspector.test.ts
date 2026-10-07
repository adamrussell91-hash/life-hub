import { describe, expect, it, vi } from 'vitest';
import type { MapLine } from '@/schemas/map';
import { buildLineEditor, createMapInspector, inspectorText } from '@/views/map-inspector';

function line(partial: Partial<MapLine> = {}): MapLine {
  return {
    id: 'line_x',
    name: 'Robotics',
    letter: 'X',
    color: 'navy',
    points: [
      { x: 80, y: 0 },
      { x: 80, y: 400 }
    ],
    extra_tracks: [],
    ...partial
  };
}

function mount(nodes: HTMLElement[]): HTMLElement {
  const host = document.createElement('div');
  host.append(...nodes);
  document.body.replaceChildren(host);
  return host;
}

describe('map inspector', () => {
  it('drafts on every keystroke and commits on change, snapping blanks back', () => {
    const onDraft = vi.fn();
    const onCommit = vi.fn();
    const input = inspectorText({ value: 'New program', ariaLabel: 'Name', onDraft, onCommit });
    input.value = 'Da Vinci';
    input.dispatchEvent(new Event('input'));
    expect(onDraft).toHaveBeenLastCalledWith('Da Vinci');
    input.dispatchEvent(new Event('change'));
    expect(onCommit).toHaveBeenLastCalledWith('Da Vinci');
    input.value = '   ';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('change'));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(input.value).toBe('Da Vinci');
  });

  it('renames a line, its letter and colour from the panel', () => {
    const onChange = vi.fn();
    const host = mount(
      buildLineEditor(line(), { index: 1, count: 3, itemCount: 0 }, { onChange, onMove: vi.fn(), onDelete: vi.fn() })
    );
    const name = host.querySelector<HTMLInputElement>('input[aria-label="Line name"]')!;
    name.value = 'Robotics League';
    name.dispatchEvent(new Event('change'));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Robotics League' }), true);

    const letter = host.querySelector<HTMLInputElement>('input[aria-label="Line letter"]')!;
    expect(letter.maxLength).toBe(4);
    letter.value = 'rb';
    letter.dispatchEvent(new Event('change'));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: 'Robotics League', letter: 'RB' }),
      true
    );

    host.querySelector<HTMLButtonElement>('.map-swatch[aria-label="green"]')!.click();
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ color: 'green' }), true);
  });

  it('locks the colour of a canonical line and blocks deleting a line with items', () => {
    const onDelete = vi.fn();
    const host = mount(
      buildLineEditor(
        line({ id: 'line_j', name: 'Justice', letter: 'J', color: 'blue' }),
        { index: 0, count: 2, itemCount: 2 },
        { onChange: vi.fn(), onMove: vi.fn(), onDelete }
      )
    );
    const swatches = host.querySelectorAll<HTMLButtonElement>('.map-swatch');
    expect(swatches).toHaveLength(1);
    expect(swatches[0]!.disabled).toBe(true);
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('button')];
    expect(buttons.find((btn) => btn.textContent === '← Move left')?.disabled).toBe(true);
    expect(buttons.find((btn) => btn.textContent === 'Move right →')?.disabled).toBe(false);
    const remove = buttons.find((btn) => btn.textContent === 'Delete line')!;
    expect(remove.disabled).toBe(true);
    remove.click();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('adds and drops year lines without a browser prompt, never leaving none', () => {
    const onChange = vi.fn();
    const promptSpy = vi.spyOn(window, 'prompt');
    const host = mount(
      buildLineEditor(
        line({ year_tracks: ['junior'] }),
        { index: 0, count: 1, itemCount: 0 },
        { onChange, onMove: vi.fn(), onDelete: vi.fn() }
      )
    );
    const junior = host.querySelector<HTMLInputElement>('.map-tracks input')!;
    junior.checked = false;
    junior.dispatchEvent(new Event('change'));
    expect(junior.checked).toBe(true);
    expect(onChange).not.toHaveBeenCalled();

    const add = host.querySelector<HTMLInputElement>('input[aria-label="New year line name"]')!;
    add.value = 'Middle';
    add.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ extra_tracks: [{ id: 'extra_middle', label: 'Middle' }] }),
      true
    );
    expect(promptSpy).not.toHaveBeenCalled();
  });

  it('closes with the × button and Escape outside a text field', () => {
    const onClose = vi.fn();
    const panel = createMapInspector({ eyebrow: 'Program', title: 'Da Vinci', onClose, body: [] });
    document.body.replaceChildren(panel);
    panel.querySelector<HTMLButtonElement>('[aria-label="Close panel"]')!.click();
    expect(onClose).toHaveBeenCalledTimes(1);
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
