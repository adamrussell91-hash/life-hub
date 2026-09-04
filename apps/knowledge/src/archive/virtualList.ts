export type VirtualListWindow = {
  start: number;
  end: number;
  offset: number;
  spacerHeight: number;
};

export type VirtualListPaint = VirtualListWindow & {
  html: string;
};

export type VirtualListPainted = {
  start: number;
  end: number;
  spacerHeight: number;
};

/** Compute which rows belong in the virtual window for a fixed-height list. */
export function virtualListWindow(input: {
  total: number;
  scrollTop: number;
  viewportHeight: number;
  rowHeight: number;
  overscan: number;
  emptyMinHeight?: number;
}): VirtualListWindow {
  const { total, scrollTop, viewportHeight, rowHeight, overscan, emptyMinHeight = 120 } = input;
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(total, Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan);
  return {
    start,
    end,
    offset: start * rowHeight,
    spacerHeight: Math.max(total * rowHeight, total ? 0 : emptyMinHeight),
  };
}

function samePaintedWindow(previous: VirtualListPainted | null, paint: VirtualListPaint) {
  return Boolean(
    previous &&
      previous.start === paint.start &&
      previous.end === paint.end &&
      previous.spacerHeight === paint.spacerHeight,
  );
}

/**
 * Paint a virtual list into a scroll viewport.
 *
 * Critical: never replace `viewport.innerHTML` on routine scrolls. Rebuilding the
 * scroll container's children resets `scrollTop` on mobile WebKit/Blink and makes
 * the notes flicker in and out while the user tries to move the list.
 */
export function paintVirtualList(
  viewport: HTMLElement,
  paint: VirtualListPaint,
  previous: VirtualListPainted | null,
): VirtualListPainted {
  const next: VirtualListPainted = {
    start: paint.start,
    end: paint.end,
    spacerHeight: paint.spacerHeight,
  };

  const spacer = viewport.querySelector<HTMLElement>(".list-spacer");
  const windowEl = viewport.querySelector<HTMLElement>(".list-window");

  if (samePaintedWindow(previous, paint) && spacer && windowEl) {
    return previous!;
  }

  if (spacer && windowEl) {
    spacer.style.height = `${paint.spacerHeight}px`;
    windowEl.style.transform = `translateY(${paint.offset}px)`;
    windowEl.innerHTML = paint.html;
    return next;
  }

  const scrollTop = viewport.scrollTop;
  viewport.innerHTML = `<div class="list-spacer" style="height:${paint.spacerHeight}px">
    <div class="list-window" style="transform:translateY(${paint.offset}px)">
      ${paint.html}
    </div>
  </div>`;
  // First mount may still wipe scrollTop — put it back before the next frame.
  if (viewport.scrollTop !== scrollTop) viewport.scrollTop = scrollTop;
  return next;
}
