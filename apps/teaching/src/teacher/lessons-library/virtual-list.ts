export interface VirtualListOptions {
  host: HTMLElement;
  itemCount: () => number;
  itemHeight: number;
  overscan?: number;
  renderRow: (index: number) => HTMLElement;
}

const VIRTUALIZE_AFTER = 80;

export function mountVirtualList(options: VirtualListOptions): { refresh: () => void; dispose: () => void } {
  const overscan = options.overscan ?? 8;
  const scroller = options.host;
  scroller.classList.add('virtual-list');

  const spacer = document.createElement('div');
  spacer.className = 'virtual-list__spacer';
  const windowEl = document.createElement('div');
  windowEl.className = 'virtual-list__window';
  scroller.replaceChildren(spacer, windowEl);

  const paint = (): void => {
    const count = options.itemCount();
    const height = options.itemHeight;
    spacer.style.height = `${count * height}px`;

    if (count <= VIRTUALIZE_AFTER) {
      windowEl.style.transform = 'translateY(0)';
      windowEl.replaceChildren();
      for (let i = 0; i < count; i += 1) windowEl.append(options.renderRow(i));
      return;
    }

    const top = scroller.scrollTop;
    const view = scroller.clientHeight || 600;
    const start = Math.max(0, Math.floor(top / height) - overscan);
    const end = Math.min(count, Math.ceil((top + view) / height) + overscan);
    windowEl.style.transform = `translateY(${start * height}px)`;
    windowEl.replaceChildren();
    for (let i = start; i < end; i += 1) windowEl.append(options.renderRow(i));
  };

  scroller.addEventListener('scroll', paint, { passive: true });
  paint();

  return {
    refresh: paint,
    dispose: () => {
      scroller.removeEventListener('scroll', paint);
    }
  };
}
