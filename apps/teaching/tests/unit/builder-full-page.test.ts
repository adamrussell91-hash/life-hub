import { describe, expect, it, vi } from 'vitest';
import {
  applyBuilderFullPageState,
  bindBuilderFullPage,
  BUILDER_FULL_PAGE_BODY_CLASS,
  BUILDER_FULL_PAGE_BUILDER_CLASS,
  BUILDER_FULL_PAGE_LAYOUT_CLASS,
  fullPageExitHtml,
  fullPageToggleHtml,
  shouldExitBuilderFullPage,
  syncFullPageButtons
} from '@/teacher/lesson-canvas/builderFullPage';

describe('lesson builder full page chrome', () => {
  it('renders inactive toggles by default', () => {
    document.body.innerHTML = fullPageToggleHtml(false) + fullPageExitHtml(false);
    const toggle = document.querySelector<HTMLButtonElement>('[data-builder-fullscreen]')!;
    const exit = document.querySelector<HTMLButtonElement>('[data-builder-fullscreen-exit]')!;
    expect(toggle.textContent).toBe('Full screen');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(exit.hidden).toBe(true);
  });

  it('labels active mode as exitable', () => {
    document.body.innerHTML = fullPageToggleHtml(true) + fullPageExitHtml(true);
    expect(document.querySelector('[data-builder-fullscreen]')!.textContent).toBe('Exit full screen');
    expect(document.querySelector<HTMLButtonElement>('[data-builder-fullscreen-exit]')!.hidden).toBe(
      false
    );
  });

  it('applies classes on builder, layout, and body', () => {
    const builder = document.createElement('div');
    builder.className = 'lesson-builder';
    const layout = document.createElement('div');
    layout.className = 'teacher-layout';
    applyBuilderFullPageState(builder, layout, document.body, true);
    expect(builder.classList.contains(BUILDER_FULL_PAGE_BUILDER_CLASS)).toBe(true);
    expect(layout.classList.contains(BUILDER_FULL_PAGE_LAYOUT_CLASS)).toBe(true);
    expect(document.body.classList.contains(BUILDER_FULL_PAGE_BODY_CLASS)).toBe(true);
    applyBuilderFullPageState(builder, layout, document.body, false);
    expect(builder.classList.contains(BUILDER_FULL_PAGE_BUILDER_CLASS)).toBe(false);
    expect(document.body.classList.contains(BUILDER_FULL_PAGE_BODY_CLASS)).toBe(false);
  });

  it('toggles through buttons without remounting', () => {
    const host = document.createElement('div');
    host.innerHTML = `<div class="lesson-builder">${fullPageToggleHtml(false)}${fullPageExitHtml(false)}</div>`;
    const builder = host.querySelector<HTMLElement>('.lesson-builder')!;
    const layout = document.createElement('div');
    let active = false;
    const setActive = vi.fn((on: boolean) => {
      active = on;
      applyBuilderFullPageState(builder, layout, document.body, active);
    });
    bindBuilderFullPage(host, {
      getActive: () => active,
      setActive
    });
    host.querySelector<HTMLButtonElement>('[data-builder-fullscreen]')!.click();
    expect(setActive).toHaveBeenCalledWith(true);
    expect(builder.classList.contains(BUILDER_FULL_PAGE_BUILDER_CLASS)).toBe(true);
    host.querySelector<HTMLButtonElement>('[data-builder-fullscreen-exit]')!.click();
    expect(setActive).toHaveBeenLastCalledWith(false);
  });

  it('only treats Escape as exit while full page is active', () => {
    expect(shouldExitBuilderFullPage('Escape', true)).toBe(true);
    expect(shouldExitBuilderFullPage('Escape', false)).toBe(false);
    expect(shouldExitBuilderFullPage('Enter', true)).toBe(false);
  });

  it('syncs button copy when state changes', () => {
    document.body.innerHTML = fullPageToggleHtml(false) + fullPageExitHtml(false);
    syncFullPageButtons(document.body, true);
    expect(document.querySelector('[data-builder-fullscreen]')!.textContent).toBe('Exit full screen');
    expect(document.querySelector<HTMLButtonElement>('[data-builder-fullscreen-exit]')!.hidden).toBe(
      false
    );
  });
});
