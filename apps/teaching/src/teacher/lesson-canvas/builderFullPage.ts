export const BUILDER_FULL_PAGE_BODY_CLASS = 'is-lesson-builder-full-page';
export const BUILDER_FULL_PAGE_LAYOUT_CLASS = 'teacher-layout--lesson-full-page';
export const BUILDER_FULL_PAGE_BUILDER_CLASS = 'lesson-builder--full-page';

export function fullPageToggleHtml(active: boolean): string {
  const activeClass = active ? ' is-active' : '';
  return `<button type="button" class="btn btn--ghost${activeClass}" data-builder-fullscreen aria-pressed="${active}">${active ? 'Exit full screen' : 'Full screen'}</button>`;
}

export function fullPageExitHtml(active: boolean): string {
  return `<button type="button" class="lesson-builder__exit btn btn--ghost" data-builder-fullscreen-exit${active ? '' : ' hidden'}>Exit full screen</button>`;
}

export function syncFullPageButtons(root: ParentNode, active: boolean): void {
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-builder-fullscreen]')) {
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
    button.textContent = active ? 'Exit full screen' : 'Full screen';
  }
  const exit = root.querySelector<HTMLButtonElement>('[data-builder-fullscreen-exit]');
  if (exit) exit.hidden = !active;
}

export function applyBuilderFullPageState(
  builder: HTMLElement,
  layout: HTMLElement,
  body: HTMLElement,
  active: boolean
): void {
  builder.classList.toggle(BUILDER_FULL_PAGE_BUILDER_CLASS, active);
  layout.classList.toggle(BUILDER_FULL_PAGE_LAYOUT_CLASS, active);
  body.classList.toggle(BUILDER_FULL_PAGE_BODY_CLASS, active);
  syncFullPageButtons(builder, active);
  syncFullPageButtons(layout, active);
}

export function shouldExitBuilderFullPage(key: string, active: boolean): boolean {
  return key === 'Escape' && active;
}

export function bindBuilderFullPage(
  root: ParentNode,
  options: {
    getActive: () => boolean;
    setActive: (on: boolean) => void;
  }
): void {
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-builder-fullscreen]')) {
    button.onclick = () => options.setActive(!options.getActive());
  }
  const exit = root.querySelector<HTMLButtonElement>('[data-builder-fullscreen-exit]');
  if (exit) {
    exit.onclick = () => options.setActive(false);
  }
}
