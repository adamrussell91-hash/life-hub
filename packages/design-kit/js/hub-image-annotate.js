/** Teaching image regions via Annotorious (lazy-loaded).
 * Stores W3C-ish annotation JSON on the image block for teacher notes.
 */

/**
 * @typedef {{
 *   id: string,
 *   body: string,
 *   selector?: unknown,
 * }} HubImageAnnotation
 */

/**
 * @param {unknown} raw
 * @returns {HubImageAnnotation | null}
 */
export function parseImageAnnotation(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const data = /** @type {Record<string, unknown>} */ (raw);
  const id = typeof data.id === 'string' ? data.id.trim() : '';
  const body =
    typeof data.body === 'string'
      ? data.body.trim()
      : Array.isArray(data.bodies) && data.bodies[0] && typeof data.bodies[0].value === 'string'
        ? String(data.bodies[0].value).trim()
        : '';
  if (!id || !body) return null;
  /** @type {HubImageAnnotation} */
  const out = { id, body };
  if (data.selector != null) out.selector = data.selector;
  else if (data.target != null) out.selector = data.target;
  return out;
}

/**
 * @param {unknown} list
 * @returns {HubImageAnnotation[]}
 */
export function normalizeImageAnnotations(list) {
  if (!Array.isArray(list)) return [];
  return list.map(parseImageAnnotation).filter(Boolean);
}

/**
 * Mount Annotorious on an image. Returns destroy + current annotations.
 * @param {HTMLImageElement} image
 * @param {{
 *   annotations?: HubImageAnnotation[],
 *   readOnly?: boolean,
 *   onChange?: (annotations: HubImageAnnotation[]) => void,
 * }} [opts]
 */
export async function mountHubImageAnnotator(image, opts = {}) {
  if (!(image instanceof HTMLImageElement)) {
    throw new TypeError('mountHubImageAnnotator expects an HTMLImageElement');
  }

  const mod = await import('@annotorious/annotorious');
  try {
    await import('@annotorious/annotorious/annotorious.css');
  } catch {
    try {
      await import('@annotorious/annotorious/dist/annotorious.css');
    } catch {
      /* CSS optional in tests */
    }
  }
  const createImageAnnotator = mod.createImageAnnotator || mod.default?.createImageAnnotator;
  if (!createImageAnnotator) {
    throw new Error('Annotorious createImageAnnotator unavailable');
  }

  const annotator = createImageAnnotator(image, {
    drawingEnabled: opts.readOnly !== true,
    readOnly: opts.readOnly === true
  });

  const seed = normalizeImageAnnotations(opts.annotations);
  if (seed.length && typeof annotator.setAnnotations === 'function') {
    try {
      annotator.setAnnotations(
        seed.map((item) => ({
          id: item.id,
          bodies: [{ purpose: 'commenting', value: item.body }],
          target: item.selector || {
            selector: {
              type: 'FRAGMENT',
              value: 'xywh=pixel:0,0,1,1'
            }
          }
        }))
      );
    } catch {
      /* seed shapes may not match; ignore */
    }
  }

  const emit = () => {
    if (!opts.onChange) return;
    const current =
      typeof annotator.getAnnotations === 'function' ? annotator.getAnnotations() : [];
    opts.onChange(
      normalizeImageAnnotations(
        (current || []).map((ann) => ({
          id: ann.id,
          body: Array.isArray(ann.bodies) ? ann.bodies[0]?.value : ann.body,
          selector: ann.target
        }))
      )
    );
  };

  annotator.on?.('createAnnotation', emit);
  annotator.on?.('updateAnnotation', emit);
  annotator.on?.('deleteAnnotation', emit);

  return {
    annotator,
    destroy() {
      try {
        annotator.destroy?.();
      } catch {
        /* ignore */
      }
    },
    getAnnotations() {
      const current =
        typeof annotator.getAnnotations === 'function' ? annotator.getAnnotations() : [];
      return normalizeImageAnnotations(
        (current || []).map((ann) => ({
          id: ann.id,
          body: Array.isArray(ann.bodies) ? ann.bodies[0]?.value : ann.body,
          selector: ann.target
        }))
      );
    }
  };
}
