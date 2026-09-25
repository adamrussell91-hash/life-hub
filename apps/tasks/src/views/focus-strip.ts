// apps/tasks/src/views/focus-strip.ts
import { el } from '@/views/hub-kit';

let stopActive: (() => void) | null = null;

/** A timed focus strip. Creates nothing; it only helps you start. */
export function startFocusStrip(host: HTMLElement, options: { minutes: number; label: string }): void {
  stopActive?.();
  const strip = el('div', 'focus-strip');
  strip.setAttribute('role', 'status');
  const clock = el('span', 'focus-strip__clock');
  const stop = el('button', 'btn btn--ghost', 'Stop');
  stop.type = 'button';
  strip.append(el('span', 'focus-strip__label', options.label), clock, stop);
  host.prepend(strip);

  const endsAt = Date.now() + options.minutes * 60_000;
  const tick = () => {
    const left = Math.max(0, endsAt - Date.now());
    const minutes = Math.floor(left / 60_000);
    const seconds = Math.floor((left % 60_000) / 1000);
    clock.textContent = `${minutes}:${String(seconds).padStart(2, '0')}`;
    if (left === 0) finish();
  };
  const timer = window.setInterval(tick, 1000);
  function finish() {
    window.clearInterval(timer);
    strip.remove();
    if (stopActive === finish) stopActive = null;
  }
  stop.addEventListener('click', finish);
  stopActive = finish;
  tick();
}
