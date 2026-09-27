/** Port of zoomable() from travel-planner.html mockup.
 * Counter-scaled marks carry class "cs" plus data-x/data-y so pins and labels keep their size.
 */

export type ZoomView = { x: number; y: number; w: number; h: number };

export type ZoomableOptions = {
  view?: ZoomView;
  onChange?: (k: number, view: ZoomView) => void;
};

export type Proj = {
  p: (lat: number, lon: number) => [number, number];
};

export type ZoomableApi = {
  zoomTo: (lat: number, lon: number, P: Proj, w: number) => void;
  toSvg: (cx: number, cy: number) => DOMPoint;
};

export function zoomable(
  svg: SVGSVGElement,
  host: HTMLElement,
  { view, onChange }: ZoomableOptions = {},
): ZoomableApi {
  const vb = svg.viewBox.baseVal;
  const base: ZoomView = { x: 0, y: 0, w: vb.width, h: vb.height };
  const v: ZoomView = view ? { ...view } : { ...base };
  const minW = base.w / 10;
  let moved = false;

  function apply() {
    v.w = Math.min(base.w, Math.max(minW, v.w));
    v.h = (v.w * base.h) / base.w;
    v.x = Math.min(base.w - v.w, Math.max(0, v.x));
    v.y = Math.min(base.h - v.h, Math.max(0, v.y));
    svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
    const k = v.w / base.w;
    svg.querySelectorAll('.cs').forEach((el) => {
      const htmlEl = el as HTMLElement & SVGElement;
      const x = (htmlEl as any).dataset.x;
      const y = (htmlEl as any).dataset.y;
      el.setAttribute('transform', `translate(${x},${y}) scale(${k})`);
    });
    host.classList.toggle('is-zoomed', k < 0.999);
    onChange?.(k, { ...v });
  }

  const toSvg = (cx: number, cy: number): DOMPoint => {
    const pt = svg.createSVGPoint();
    pt.x = cx;
    pt.y = cy;
    const ctm = svg.getScreenCTM();
    if (!ctm) return pt;
    return pt.matrixTransform(ctm.inverse());
  };

  function zoomAt(f: number, sx: number, sy: number) {
    const nw = Math.min(base.w, Math.max(minW, v.w * f));
    const r = nw / v.w;
    v.x = sx - (sx - v.x) * r;
    v.y = sy - (sy - v.y) * r;
    v.w = nw;
    apply();
  }

  const center = (): [number, number] => [v.x + v.w / 2, v.y + v.h / 2];

  host.addEventListener(
    'wheel',
    (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const p = toSvg(e.clientX, e.clientY);
      zoomAt(Math.exp(e.deltaY * 0.012), p.x, p.y);
    },
    { passive: false },
  );

  const ptrs = new Map<number, { x: number; y: number }>();
  let pinch: { d: number; w: number; m: DOMPoint } | null = null;

  svg.addEventListener('pointerdown', (e) => {
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = false;
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      const m = toSvg((a.x + b.x) / 2, (a.y + b.y) / 2);
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), w: v.w, m };
    }
  });

  svg.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (ptrs.size === 2 && pinch) {
      p.x = e.clientX;
      p.y = e.clientY;
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt((pinch.w * pinch.d / d) / v.w, pinch.m.x, pinch.m.y);
      moved = true;
      return;
    }
    const zoomed = v.w < base.w * 0.999;
    if (ptrs.size === 1 && (e.pointerType === 'mouse' || zoomed)) {
      if (!moved && Math.hypot(dx, dy) < 4) return;
      if (!moved) svg.setPointerCapture(e.pointerId);
      moved = true;
      const s = v.w / svg.getBoundingClientRect().width;
      v.x -= dx * s;
      v.y -= dy * s;
      p.x = e.clientX;
      p.y = e.clientY;
      apply();
    }
  });

  const up = (e: PointerEvent) => {
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
  };
  svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', up);
  svg.addEventListener(
    'click',
    (e) => {
      if (moved) {
        e.stopPropagation();
        e.preventDefault();
        moved = false;
      }
    },
    true,
  );
  svg.addEventListener('dblclick', (e) => {
    const p = toSvg(e.clientX, e.clientY);
    zoomAt(0.5, p.x, p.y);
  });

  const ctl = document.createElement('div');
  ctl.className = 'zoom-ctl';
  ctl.innerHTML =
    '<button type="button" data-z="in" aria-label="Zoom in">+</button><button type="button" data-z="out" aria-label="Zoom out">−</button><button type="button" data-z="reset" aria-label="Show everything"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>';
  ctl.addEventListener('click', (e) => {
    const z = (e.target as HTMLElement).closest('button')?.dataset.z;
    if (!z) return;
    if (z === 'reset') {
      Object.assign(v, base);
      apply();
      return;
    }
    const [cx, cy] = center();
    zoomAt(z === 'in' ? 0.6 : 1 / 0.6, cx, cy);
  });
  host.appendChild(ctl);
  apply();

  return {
    zoomTo(lat: number, lon: number, P: Proj, w: number) {
      const [x, y] = P.p(lat, lon);
      v.w = w;
      v.h = (w * base.h) / base.w;
      v.x = x - v.w / 2;
      v.y = y - v.h / 2;
      apply();
    },
    toSvg,
  };
}
