/**
 * Keeps retrying a link operation quietly, so nobody has to press "Retry".
 * linking → (success) linked, or → stuck once failures have lasted
 * stuckAfterMs. Stuck keeps retrying; it only changes what the page shows.
 */
export type AutoRetryState = 'linking' | 'linked' | 'stuck';

export const AUTO_RETRY_DELAYS_MS = [5_000, 30_000, 120_000, 600_000];
export const AUTO_RETRY_STEADY_MS = 1_800_000;
export const AUTO_RETRY_STUCK_AFTER_MS = 3_600_000;

export type AutoRetryHandle = {
  tryNow(): Promise<void>;
  stop(): void;
};

export function createAutoRetry(options: {
  run: () => Promise<void>;
  onState: (state: AutoRetryState, error?: unknown) => void;
  delays?: number[];
  steadyMs?: number;
  stuckAfterMs?: number;
}): AutoRetryHandle {
  const delays = options.delays ?? AUTO_RETRY_DELAYS_MS;
  const steadyMs = options.steadyMs ?? AUTO_RETRY_STEADY_MS;
  const stuckAfterMs = options.stuckAfterMs ?? AUTO_RETRY_STUCK_AFTER_MS;
  const startedAt = Date.now();
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let running = false;

  function clearTimer(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  function schedule(): void {
    if (stopped) return;
    const ms = attempt < delays.length ? delays[attempt] : steadyMs;
    timer = setTimeout(() => {
      timer = null;
      void tryNow();
    }, ms);
  }

  async function tryNow(): Promise<void> {
    if (stopped || running) return;
    clearTimer();
    running = true;
    try {
      await options.run();
      if (stopped) return;
      stopped = true;
      options.onState('linked');
    } catch (error) {
      attempt += 1;
      options.onState(Date.now() - startedAt >= stuckAfterMs ? 'stuck' : 'linking', error);
      schedule();
    } finally {
      running = false;
    }
  }

  options.onState('linking');
  schedule();

  return {
    tryNow,
    stop() {
      stopped = true;
      clearTimer();
    }
  };
}
