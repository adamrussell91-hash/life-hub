/**
 * A WalkThru step timer, shown big on Display while it runs. The teacher's page and Display
 * talk over a same-browser channel, so it works when Display is a second window on the same
 * computer. Only the end time crosses: never the technique, its steps or any names.
 */
const CHANNEL = 'life-hub-walkthru-timer';

type Message = { endsAt: number | null };

function channel(): BroadcastChannel | null {
  return typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL) : null;
}

/** Teacher side: a timer started (end time in ms) or stopped (null). */
export function broadcastTimer(endsAt: number | null): void {
  const ch = channel();
  if (!ch) return;
  ch.postMessage({ endsAt } satisfies Message);
  ch.close();
}

/** Display side: a countdown that appears while a step timer runs. Returns a dispose function. */
export function mountDisplayTimer(host: HTMLElement): () => void {
  const ch = channel();
  if (!ch) return () => undefined;
  const clock = document.createElement('div');
  clock.className = 'wts-display-timer';
  clock.setAttribute('role', 'timer');
  clock.hidden = true;
  host.append(clock);
  let tick: number | undefined;
  const stop = (): void => {
    if (tick !== undefined) window.clearInterval(tick);
    tick = undefined;
  };
  const paint = (endsAt: number): void => {
    const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    clock.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    clock.classList.toggle('is-done', left === 0);
    if (left === 0) {
      stop();
      window.setTimeout(() => { if (tick === undefined) clock.hidden = true; }, 2500);
    }
  };
  ch.onmessage = (event: MessageEvent<Message>) => {
    stop();
    const endsAt = event.data?.endsAt;
    if (typeof endsAt !== 'number') { clock.hidden = true; return; }
    clock.hidden = false;
    paint(endsAt);
    tick = window.setInterval(() => paint(endsAt), 250);
  };
  return () => { stop(); ch.close(); clock.remove(); };
}
