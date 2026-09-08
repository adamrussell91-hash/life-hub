import {
  attachVisualViewportInset,
  detachVisualViewportInset
} from "../../design-kit/js/visual-viewport.js";

/** Knowledge chat keyboard inset — shared hub visual-viewport contract. */
export function bindKeyboardInset(): void {
  attachVisualViewportInset();
}

export function unbindKeyboardInset(): void {
  detachVisualViewportInset();
}
