import { chime, primeSound } from '@/blocks/classroom-tools/sound';
import { loadClassLists, className } from '@/blocks/classroom-tools/tools';
import { pickableNames, randomIndex } from '@/blocks/classroom-tools/logic';
import { broadcastTimer } from './display-timer';

/**
 * The small classroom tools that sit under a WalkThru step: a timer and a name picker.
 * They share one strip's state, so the name picked at step 3 carries into steps 4 and 5
 * and nobody is picked twice until everyone has had a go.
 */
export interface StripState {
  lessonId?: string;
  name: string | null;
  pool: string[] | null;
  picked: string[];
  classLabel: string;
  onName: () => void;
  goTo: (n: number) => void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(className: string, text: string, label: string): HTMLButtonElement {
  const b = el('button', className, text);
  b.type = 'button';
  b.setAttribute('aria-label', label);
  b.title = label;
  return b;
}

const clockText = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** ▶ 0:15 +15 under a step. When it ends it chimes and moves the strip to the next step. */
export function miniTimer(seconds: number, step: number, state: StripState): HTMLElement {
  const wrap = el('div', 'wts-tool');
  const go = button('wts-tool__go', '▶', `Start a ${seconds} second timer`);
  const out = el('span', 'wts-tool__val', clockText(seconds));
  out.setAttribute('role', 'timer');
  const add = button('wts-tool__aux', '+15', 'Add 15 seconds');
  wrap.append(go, out, add);
  let endsAt = 0;
  let tick: number | undefined;
  const stop = (reset: boolean): void => {
    if (tick !== undefined) window.clearInterval(tick);
    tick = undefined;
    go.textContent = '▶';
    go.setAttribute('aria-label', `Start a ${seconds} second timer`);
    wrap.classList.remove('is-running');
    if (reset) { out.textContent = clockText(seconds); out.classList.remove('is-done'); }
  };
  const paint = (): void => {
    const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    out.textContent = clockText(left);
    if (left > 0) return;
    stop(false);
    out.classList.add('is-done');
    chime(2);
    window.setTimeout(() => state.goTo(step + 1), 900);
  };
  go.addEventListener('click', () => {
    if (tick !== undefined) { stop(true); broadcastTimer(null); return; }
    primeSound();
    state.goTo(step);
    out.classList.remove('is-done');
    endsAt = Date.now() + seconds * 1000;
    broadcastTimer(endsAt);
    go.textContent = '■';
    go.setAttribute('aria-label', 'Stop the timer');
    wrap.classList.add('is-running');
    paint();
    tick = window.setInterval(paint, 250);
  });
  add.addEventListener('click', () => {
    if (tick === undefined) return;
    endsAt += 15_000;
    broadcastTimer(endsAt);
    paint();
  });
  return wrap;
}

/** ☺ Pick under a step: a name from the lesson's class, never the same one twice until all have gone. */
export function miniNames(step: number, state: StripState): HTMLElement {
  const wrap = el('div', 'wts-tool wts-tool--names');
  const go = button('wts-tool__go', '☺', 'Pick a name');
  const out = el('span', 'wts-tool__val', state.name ?? 'Pick');
  out.setAttribute('aria-live', 'polite');
  const left = el('span', 'wts-tool__aux');
  wrap.append(go, out, left);
  const paint = (): void => {
    out.textContent = state.name ?? 'Pick';
    left.textContent = state.pool && state.picked.length ? `${state.pool.length} left` : '';
    wrap.title = [state.name, left.textContent, state.classLabel ? `Names from ${state.classLabel}` : ''].filter(Boolean).join(' · ');
  };
  wrap.addEventListener('wts-names', paint);
  go.addEventListener('click', async () => {
    state.goTo(step);
    primeSound();
    if (!state.pool) {
      out.textContent = '…';
      try {
        const lists = await loadClassLists({ lessonId: state.lessonId });
        const cls = lists.classes.find((c) => c.id === lists.preferred) ?? lists.classes[0];
        if (!cls) { out.textContent = 'No class list'; return; }
        state.pool = pickableNames(cls.students);
        state.classLabel = className(cls);
      } catch {
        out.textContent = 'Didn’t load';
        return;
      }
    }
    if (!state.pool.length) {
      state.pool = [...state.picked];
      state.picked = [];
    }
    const source = state.pool;
    if (!source.length) { out.textContent = 'No names'; return; }
    out.classList.add('is-rolling');
    let spins = 0;
    const spin = window.setInterval(() => {
      out.textContent = source[randomIndex(source.length)]!;
      if (++spins < 8) return;
      window.clearInterval(spin);
      out.classList.remove('is-rolling');
      const [name] = source.splice(randomIndex(source.length), 1);
      state.name = name!;
      state.picked.push(name!);
      chime(1);
      state.onName();
    }, 60);
  });
  paint();
  return wrap;
}
