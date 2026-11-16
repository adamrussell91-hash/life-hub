import { afterEach, describe, expect, it } from 'vitest';
import { createAnnotationEditor } from '@/blocks/editors';
import { dulceAnnotationFixture } from '../../fixtures/annotation-dulce';
import type { AnnotationBlock, Block } from '@/schemas/block';

function mountEditor(block: AnnotationBlock): { mount: HTMLDivElement; rebuild: () => void } {
  let latest: Block = structuredClone(block);
  const mount = document.createElement('div');
  mount.className = 'narrow-column';
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
  return { mount, rebuild };
}

const fullButton = (root: ParentNode) =>
  root.querySelector<HTMLButtonElement>('.block-editor__annotation-full')!;
const layers = () => document.querySelectorAll('.block-editor__annotation-fullscreen');

afterEach(() => {
  document.querySelector<HTMLButtonElement>('.block-editor__annotation-fullscreen .block-editor__annotation-full')?.click();
  document.body.replaceChildren();
  document.documentElement.classList.remove('annotation-fullscreen-open');
});

describe('annotation editor full screen', () => {
  it('lifts the editor over the window and puts it back', async () => {
    const { mount } = mountEditor(dulceAnnotationFixture);
    await Promise.resolve();
    const editor = mount.querySelector<HTMLElement>('.block-editor__annotation')!;
    const btn = fullButton(mount);
    expect(btn.textContent).toBe('Full screen');

    btn.click();
    const layer = document.querySelector('.block-editor__annotation-fullscreen')!;
    expect(layer.parentElement).toBe(document.body);
    expect(editor.parentElement).toBe(layer);
    expect(editor.classList.contains('is-fullscreen')).toBe(true);
    expect(mount.contains(editor)).toBe(false);
    expect(document.documentElement.classList.contains('annotation-fullscreen-open')).toBe(true);
    expect(btn.textContent).toBe('Exit full screen');
    expect(btn.getAttribute('aria-pressed')).toBe('true');

    btn.click();
    expect(layers()).toHaveLength(0);
    expect(mount.contains(editor)).toBe(true);
    expect(editor.classList.contains('is-fullscreen')).toBe(false);
    expect(document.documentElement.classList.contains('annotation-fullscreen-open')).toBe(false);
    expect(btn.textContent).toBe('Full screen');
  });

  it('Escape leaves full screen, but not from a text box', async () => {
    const { mount } = mountEditor(dulceAnnotationFixture);
    await Promise.resolve();
    fullButton(mount).click();
    const title = document.querySelector<HTMLInputElement>('.block-editor__annotation-title')!;
    title.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(layers()).toHaveLength(1);

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(layers()).toHaveLength(0);
    expect(mount.querySelector('.block-editor__annotation')).toBeTruthy();
  });

  it('stays in full screen when the host rebuilds the editor', async () => {
    const { mount, rebuild } = mountEditor(dulceAnnotationFixture);
    await Promise.resolve();
    fullButton(mount).click();
    const old = document.querySelector('.block-editor__annotation-fullscreen .block-editor__annotation');

    rebuild();
    await Promise.resolve();

    expect(layers()).toHaveLength(1);
    const lifted = document.querySelectorAll('.block-editor__annotation-fullscreen .block-editor__annotation');
    expect(lifted).toHaveLength(1);
    expect(lifted[0]).not.toBe(old);
    expect(old?.isConnected).toBe(false);

    fullButton(lifted[0]).click();
    expect(layers()).toHaveLength(0);
    expect(mount.querySelector('.block-editor__annotation')).toBe(lifted[0]);
  });

  it('leaving the page takes full screen down', async () => {
    const { mount } = mountEditor(dulceAnnotationFixture);
    await Promise.resolve();
    fullButton(mount).click();
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(layers()).toHaveLength(0);
    expect(document.documentElement.classList.contains('annotation-fullscreen-open')).toBe(false);
  });
});
