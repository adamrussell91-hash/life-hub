/** Shared full-screen media viewer (PhotoSwipe).
 * Life Hub owns chrome via CSS variables; PhotoSwipe owns swipe/zoom/a11y.
 * Lazy-loads photoswipe — call sites must depend on the package.
 */

/**
 * @typedef {{ src: string, alt?: string, width?: number, height?: number, caption?: string }} HubMediaItem
 */

/**
 * @param {string} src
 * @returns {Promise<{ width: number, height: number }>}
 */
function probeImageSize(src) {
  return new Promise((resolve) => {
    const fallback = { width: 1600, height: 1067 };
    const img = new Image();
    let settled = false;
    const finish = (width, height) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        width: width || fallback.width,
        height: height || fallback.height
      });
    };
    const timer = setTimeout(() => finish(fallback.width, fallback.height), 120);
    img.onload = () => finish(img.naturalWidth, img.naturalHeight);
    img.onerror = () => finish(fallback.width, fallback.height);
    try {
      img.src = src;
    } catch {
      finish(fallback.width, fallback.height);
    }
  });
}

/**
 * Open a swipeable / zoomable gallery.
 * @param {HubMediaItem[]} items
 * @param {{ index?: number, onClose?: () => void }} [opts]
 * @returns {Promise<{ close: () => void } | null>}
 */
export async function openHubMediaViewer(items, opts = {}) {
  const list = (items ?? []).filter((item) => item && typeof item.src === 'string' && item.src);
  if (!list.length) return null;

  const index = Math.min(Math.max(opts.index ?? 0, 0), list.length - 1);
  const [{ default: PhotoSwipe }, dataSource] = await Promise.all([
    import('photoswipe'),
    Promise.all(
      list.map(async (item) => {
        const size = item.width && item.height
          ? { width: item.width, height: item.height }
          : await probeImageSize(item.src);
        return {
          src: item.src,
          width: size.width,
          height: size.height,
          alt: item.alt || '',
          caption: item.caption || ''
        };
      })
    )
  ]);

  const pswp = new PhotoSwipe({
    dataSource,
    index,
    showHideAnimationType: 'fade',
    bgOpacity: 0.92,
    padding: { top: 16, bottom: 16, left: 8, right: 8 },
    wheelToZoom: true,
    arrowKeys: true,
    returnFocus: true
  });

  pswp.on('uiRegister', () => {
    pswp.ui.registerElement({
      name: 'caption',
      order: 9,
      isButton: false,
      appendTo: 'root',
      html: '',
      onInit: (el) => {
        pswp.on('change', () => {
          const curr = pswp.currSlide?.data;
          el.textContent = curr?.caption || curr?.alt || '';
        });
      }
    });
  });

  if (opts.onClose) {
    pswp.on('destroy', () => opts.onClose?.());
  }

  pswp.init();
  return {
    close: () => pswp.close()
  };
}
