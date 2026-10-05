/**
 * Runs the neural relax off the main thread and remembers results. Where workers are missing
 * (tests, very old browsers) it runs inline, still before anything is shown.
 */
import { relaxKey, relaxNeural, type RelaxLink, type RelaxNode, type RelaxReply, type RelaxShape } from "./showAllRelax";

const cache = new Map<string, Float64Array>();
const MAX_CACHED = 6;
let worker: Worker | null | undefined;
let nextToken = 1;
const waiting = new Map<number, (positions: Float64Array) => void>();

function getWorker() {
  if (worker !== undefined) return worker;
  try {
    worker =
      typeof Worker === "function"
        ? new Worker(new URL("./showAllRelax.worker.ts", import.meta.url), { type: "module" })
        : null;
  } catch {
    worker = null;
  }
  if (worker) {
    worker.onmessage = (event: MessageEvent<RelaxReply>) => {
      const done = waiting.get(event.data.token);
      waiting.delete(event.data.token);
      done?.(event.data.positions);
    };
    worker.onerror = () => {
      // Fall back to inline for this and later requests.
      const pending = [...waiting.entries()];
      waiting.clear();
      worker = null;
      for (const [, done] of pending) done(new Float64Array(0));
    };
  }
  return worker;
}

/** True when relaxing happens off the main thread; otherwise callers may run it inline. */
export function relaxRunsInWorker() {
  return Boolean(getWorker());
}

/** Inline relax, remembered like a worker result. For environments with no workers. */
export function relaxNow(nodes: RelaxNode[], links: RelaxLink[], shape: RelaxShape) {
  const key = relaxKey(nodes, links, shape);
  const hit = cache.get(key);
  if (hit) return hit;
  const positions = relaxNeural(nodes, links, shape);
  cache.set(key, positions);
  if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value!);
  return positions;
}

export function cachedRelax(nodes: RelaxNode[], links: RelaxLink[], shape: RelaxShape) {
  return cache.get(relaxKey(nodes, links, shape)) ?? null;
}

/** Resolves with x,y pairs in node order. Never resolves for a request that was superseded. */
export function requestRelax(nodes: RelaxNode[], links: RelaxLink[], shape: RelaxShape): Promise<Float64Array> {
  const key = relaxKey(nodes, links, shape);
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const remember = (positions: Float64Array) => {
    cache.set(key, positions);
    if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value!);
    return positions;
  };
  const runner = getWorker();
  if (!runner) return Promise.resolve(remember(relaxNeural(nodes, links, shape)));
  return new Promise(resolve => {
    const token = nextToken++;
    waiting.set(token, positions => {
      resolve(remember(positions.length ? positions : relaxNeural(nodes, links, shape)));
    });
    runner.postMessage({ token, nodes, links, shape });
  });
}
