/**
 * The colour pulse on the To do panel's Do now box: from the moment the progress page opens its
 * ring pulses red and orange, and every ten seconds another colour joins (yellow, green, purple…)
 * until ten are cycling. It runs until the student leaves the page, say by opening a lesson.
 * The clock starts once per page, so a redraw (the organiser reloading) carries on where it was.
 */

/** The colours, in the order they join: two to start, one more every PULSE_ADD_MS. */
export const PULSE_COLOURS = ['#e5484d', '#f76b15', '#ffc53d', '#30a46c', '#8e4ec6', '#0090ff', '#d6409f', '#12a594', '#a3d10b', '#00c2d7'];
export const PULSE_ADD_MS = 10_000;
/** How long each colour holds before the ring moves to the next. */
export const PULSE_STEP_MS = 700;

/** How many colours are cycling `ms` after the page opened: 2, then one more every ten seconds, up to 10. */
export function pulseCount(ms: number): number {
  return Math.min(PULSE_COLOURS.length, 2 + Math.floor(Math.max(0, ms) / PULSE_ADD_MS));
}

const opened = new Map<string, number>();

/** When this class's progress page opened, for the life of the page. */
export function pageOpenedAt(classId: string): number {
  let at = opened.get(classId);
  if (at === undefined) opened.set(classId, (at = Date.now()));
  return at;
}

/** Tests only: forget every page's clock. */
export function resetColourPulse(): void {
  opened.clear();
}

/** Steps `node`'s `--pulse` colour round the cycle; stops once the node has left the page. */
export function startColourPulse(node: HTMLElement, openedAt: number): void {
  node.classList.add('is-pulsing');
  let step = 0;
  const paint = (): void => {
    const n = pulseCount(Date.now() - openedAt);
    node.style.setProperty('--pulse', PULSE_COLOURS[step % n]!);
    node.dataset.colours = String(n);
    step += 1;
  };
  paint();
  const timer = window.setInterval(() => {
    if (!node.isConnected) {
      window.clearInterval(timer);
      return;
    }
    paint();
  }, PULSE_STEP_MS);
}
