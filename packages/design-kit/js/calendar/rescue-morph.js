/**
 * Rescue morph (Day Sense §3.1): when "Day changed" proposes moves, each block glides
 * from where it was to where it is proposed, so the whole plan reads at a glance before
 * the one Accept. The original stays, dimmed and dashed, until Accept.
 *
 * FLIP: capture where the originals are, redraw, then animate each proposal from the
 * old place to the new. Reduced motion (or no Web Animations) = instant, same classes.
 */

export const MORPH = Object.freeze({ ms: 560, stagger: 70, easing: 'cubic-bezier(.2,.8,.2,1)' });

/** Pairs of original block → queued proposal (moves only). New protected time just fades in. */
export function morphPairs(queued) {
  return (queued ?? [])
    .filter((ghost) => ghost?.id)
    .map((ghost) => ({ from: ghost.kind === 'move_block' ? ghost.blockId : null, to: ghost.id, ghost }));
}

function reduced(view) {
  return view?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
}

const byId = (root, part, id) => {
  for (const node of root?.querySelectorAll?.(`[data-id]`) ?? []) {
    if (node.getAttribute('data-id') === id && (!part || node.matches?.(part))) return node;
  }
  return null;
};

/** Week / linear day: rects of the originals, before the redraw. */
export function captureChips(root, pairs) {
  const rects = new Map();
  for (const pair of pairs) {
    if (!pair.from) continue;
    const node = byId(root, '.cal-chip', pair.from);
    const rect = node?.getBoundingClientRect?.();
    if (rect) rects.set(pair.from, { left: rect.left, top: rect.top, width: rect.width, height: rect.height });
  }
  return rects;
}

/** After the redraw: dim the originals, fly each proposal in from where its block was. */
export function playChips(root, pairs, rects, { view = root?.defaultView } = {}) {
  const still = reduced(view);
  const played = [];
  pairs.forEach((pair, index) => {
    const target = byId(root, '.cal-chip', pair.to);
    if (!target) return;
    const original = pair.from ? byId(root, '.cal-chip', pair.from) : null;
    original?.classList?.add?.('is-moving-out');
    target.classList?.add?.('is-morphing');
    const from = pair.from ? rects.get(pair.from) : null;
    const to = target.getBoundingClientRect?.();
    if (still || typeof target.animate !== 'function') return;
    const delay = index * MORPH.stagger;
    if (from && to && to.width && to.height) {
      const dx = from.left - to.left;
      const dy = from.top - to.top;
      const sy = from.height / to.height;
      target.animate(
        [{ transform: `translate(${dx}px, ${dy}px) scaleY(${sy})`, transformOrigin: 'top left', opacity: 0.55 }, { transform: 'none', transformOrigin: 'top left', opacity: 1 }],
        { duration: MORPH.ms, delay, easing: MORPH.easing, fill: 'backwards' }
      );
    } else {
      target.animate([{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'none' }], { duration: MORPH.ms, delay, easing: MORPH.easing, fill: 'backwards' });
    }
    played.push(pair.to);
  });
  return played;
}

/**
 * Day dial: an arc moves by rotating about the centre from the old start hour to the new
 * (24-hour dial: 15° an hour). Moves to another day leave the dial: the original dims.
 */
export function playArcs(svg, pairs, { cx, cy, hourOf, view = svg?.ownerDocument?.defaultView } = {}) {
  const still = reduced(view);
  const played = [];
  pairs.forEach((pair, index) => {
    const target = byId(svg, null, pair.to);
    const original = pair.from ? byId(svg, null, pair.from) : null;
    original?.classList?.add?.('is-moving-out');
    if (!target) return;
    target.classList?.add?.('is-morphing');
    if (still || typeof target.animate !== 'function') return;
    const delay = index * MORPH.stagger;
    const oldStart = pair.from ? hourOf(pair.from) : null;
    const newStart = hourOf(pair.to);
    target.style.transformOrigin = `${cx}px ${cy}px`;
    target.style.transformBox = 'view-box';
    if (oldStart != null && newStart != null) {
      const degrees = (oldStart - newStart) * 15;
      target.animate([{ transform: `rotate(${degrees}deg)`, opacity: 0.55 }, { transform: 'rotate(0deg)', opacity: 1 }], { duration: MORPH.ms, delay, easing: MORPH.easing, fill: 'backwards' });
    } else {
      target.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MORPH.ms, delay, easing: MORPH.easing, fill: 'backwards' });
    }
    played.push(pair.to);
  });
  return played;
}
