import { journalOverlayOpenCount } from '@/journal/overlay-host';
import { ICONS, button, el, icon } from '@/journal/story/dom';

export interface DockOptions {
  /** The round middle button: bring photos in from the camera roll. */
  onPhotos: () => void;
  onMoment: () => void;
  /** Drawn only when keepsakes are available. */
  onKeepsake?: () => void;
  /** Where to watch scrolling. Defaults to the window. */
  scroller?: Window;
}

export interface DockHandle {
  el: HTMLElement;
  /** Re-check whether a sheet or the viewer is covering the page. */
  sync(): void;
  destroy(): void;
}

/** How far down the page must move before the dock steps aside. */
export const DOCK_HIDE_AFTER_PX = 90;
/** How long after scrolling stops the dock comes back. */
export const DOCK_RETURN_MS = 650;

/**
 * The floating row of ways to add to the journal. It steps aside while the
 * page scrolls down and is back the moment scrolling stops, so it never sits
 * on what is being read and is always one tap away.
 */
export function mountDock(options: DockOptions): DockHandle {
  const view = options.scroller ?? window;
  const dock = el('div', 'story-dock');
  dock.setAttribute('role', 'toolbar');
  dock.setAttribute('aria-label', 'Add to the journal');
  dock.setAttribute('data-story-dock', '');

  const side = (label: string, paths: string | string[], onClick: () => void): HTMLButtonElement => {
    const btn = button('story-dock__btn');
    btn.setAttribute('aria-label', label);
    btn.append(icon(paths), el('span', 'story-dock__label', label));
    btn.addEventListener('click', onClick);
    return btn;
  };

  if (options.onKeepsake) dock.append(side('Keepsake', ICONS.keepsake, options.onKeepsake));
  const main = button('story-dock__main');
  main.setAttribute('aria-label', 'Add photos');
  main.append(icon(ICONS.photos));
  main.addEventListener('click', options.onPhotos);
  dock.append(main, side('Moment', ICONS.pen, options.onMoment));

  let lastY = view.scrollY;
  let downRun = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function sync(): void {
    dock.classList.toggle('is-covered', journalOverlayOpenCount() > 0);
  }

  function onScroll(): void {
    const y = view.scrollY;
    const dy = y - lastY;
    lastY = y;
    downRun = dy > 0 ? downRun + dy : 0;
    if (dy < -2 || y < 80) dock.classList.remove('is-away');
    else if (downRun > DOCK_HIDE_AFTER_PX) dock.classList.add('is-away');
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      downRun = 0;
      dock.classList.remove('is-away');
    }, DOCK_RETURN_MS);
    sync();
  }

  view.addEventListener('scroll', onScroll, { passive: true });
  sync();

  return {
    el: dock,
    sync,
    destroy() {
      view.removeEventListener('scroll', onScroll);
      if (timer) clearTimeout(timer);
      dock.remove();
    },
  };
}
