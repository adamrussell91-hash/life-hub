/**
 * Thin Floating UI wrapper for hub menus / popovers.
 * Geometry only — callers keep Cotton Glass chrome.
 *
 * Life serves unbundled ESM, so we import the vendored browser build
 * under js/vendor/floating-ui/ (not node_modules bare specifiers).
 */
import {
  computePosition,
  flip,
  shift,
  offset,
  limitShift,
  autoUpdate,
  size
} from './vendor/floating-ui/dom.browser.mjs';

const MOBILE_BREAKPOINT = 720;
const DEFAULT_PAD = 12;
const MOBILE_BOTTOM_PAD = 72;

function viewPadding(padding, mobileBottomPad) {
  const vw = globalThis.innerWidth ?? 800;
  const phone = vw < MOBILE_BREAKPOINT;
  const base = padding ?? DEFAULT_PAD;
  return {
    top: base,
    right: base,
    bottom: phone ? (mobileBottomPad ?? MOBILE_BOTTOM_PAD) : base,
    left: base
  };
}

/**
 * Position `floating` against `reference` once.
 * @param {Element} reference
 * @param {HTMLElement} floating
 * @param {{
 *   placement?: string,
 *   strategy?: 'absolute' | 'fixed',
 *   offset?: number,
 *   padding?: number,
 *   matchWidth?: boolean,
 *   mobileBottomPad?: number,
 * }} [options]
 */
export async function positionHubFloating(reference, floating, options = {}) {
  const placement = options.placement ?? 'bottom-start';
  const strategy = options.strategy ?? 'fixed';
  const gap = options.offset ?? 6;
  const padding = viewPadding(options.padding, options.mobileBottomPad);
  const middleware = [
    offset(gap),
    flip({ padding }),
    shift({ padding, limiter: limitShift() })
  ];
  if (options.matchWidth) {
    middleware.push(
      size({
        padding,
        apply({ rects, elements }) {
          Object.assign(elements.floating.style, {
            minWidth: `${Math.round(rects.reference.width)}px`
          });
        }
      })
    );
  }

  floating.style.position = strategy;
  const result = await computePosition(reference, floating, {
    placement,
    strategy,
    middleware
  });
  Object.assign(floating.style, {
    left: `${Math.round(result.x)}px`,
    top: `${Math.round(result.y)}px`,
    right: 'auto',
    bottom: 'auto'
  });
  const side = String(result.placement || placement).split('-')[0];
  floating.dataset.hubPlacement = result.placement;
  floating.classList.toggle('hub-menu--above', side === 'top');
  floating.classList.toggle('hub-menu--below', side === 'bottom');
  return result;
}

/**
 * Keep `floating` synced to `reference` while open. Returns a cleanup fn.
 * @param {Element} reference
 * @param {HTMLElement} floating
 * @param {Parameters<typeof positionHubFloating>[2]} [options]
 */
export function autoUpdateHubFloating(reference, floating, options = {}) {
  return autoUpdate(reference, floating, () => {
    void positionHubFloating(reference, floating, options);
  });
}

export { computePosition, flip, shift, offset, autoUpdate, size, limitShift };
