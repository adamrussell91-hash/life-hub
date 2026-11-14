import type { Block } from '@/schemas/block';
import type { QuizResponse } from '@/quiz/core';
import { el } from '@/quiz/dom';
import type { PublicStation, RotationLevel } from './schema';
import { forLevel, lockOf, roleOf } from './model';
import type { PublicStationLock, RotationClient, RotationStatus, VivaKitCard } from './api';
import { mountRushRound, type RushRound } from './rush-round';

/**
 * A station's chain of locks, as the student works through it. Passed locks
 * fold to one row with their Viva Kit card; the open lock shows its blocks and
 * then its check; locked locks show a padlock and a title, nothing more.
 */

export const PADLOCK_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
const TICK_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

/** The chain from the status; before the first status, the snapshot's summary with every lock closed. */
export function chainOf(station: PublicStation, status: RotationStatus | null): PublicStationLock[] {
  const live = status?.station_locks?.[station.id];
  if (live?.length) return live;
  return (station.locks ?? []).map((l, i) => ({ id: l.id, title: l.title, kind: l.kind, state: i === 0 ? 'open' : 'locked' }));
}

/** A lock's blocks: the first lock's are in the snapshot (tagged), later ones arrive with the status once open. */
export function blocksOfLock(lock: PublicStationLock, index: number, snapshot: Block[]): Block[] {
  if (lock.state === 'locked') return [];
  if (index === 0) return snapshot.filter((b) => lockOf(b) === lock.id);
  return lock.blocks ?? [];
}

/** Exit questions that sit inside opened or passed locks: they join the station's exit check. */
export function lockExitBlocks(station: PublicStation, status: RotationStatus | null, snapshot: Block[]): Block[] {
  return chainOf(station, status).flatMap((l, i) => blocksOfLock(l, i, snapshot)).filter((b) => roleOf(b) === 'exit' && b.block_type === 'quiz_question');
}

export const allLocksPassed = (station: PublicStation, status: RotationStatus | null): boolean => {
  const chain = chainOf(station, status);
  return chain.length > 0 && chain.every((l) => l.state === 'passed');
};

/** One Viva Kit card, full text. */
export function kitCard(card: { title: string; text: string }, eyebrow?: string): HTMLElement {
  const box = el('div', 'rot-kit-card');
  if (eyebrow) box.append(el('span', 'rot-kit-card__from', eyebrow));
  box.append(el('b', 'rot-kit-card__title', card.title), el('p', 'rot-kit-card__text', card.text));
  return box;
}

/** The Viva Kit cards earned at one station, in chain order. */
export const kitFor = (status: RotationStatus | null, stationId: string): VivaKitCard[] => (status?.kit ?? []).filter((k) => k.station === stationId);

export type LockChainOptions = {
  station: PublicStation;
  lessonId: string;
  /** The station section's blocks from the snapshot. */
  blocks: Block[];
  render: (b: Block) => HTMLElement;
  client: RotationClient;
  /** Runs a call and shows its error. */
  act: (go: () => Promise<RotationStatus>, btn?: HTMLButtonElement) => Promise<RotationStatus | null>;
  /** Runs a call and keeps any error quiet. */
  quiet: (go: () => Promise<RotationStatus>) => Promise<RotationStatus | null>;
  /** Swaps content without the page jumping. */
  keepScroll?: (swap: () => void) => void;
  /** The last lock just opened on this page. */
  onAllOpen?: () => void;
};

export type LockChain = { root: HTMLElement; update(status: RotationStatus): void; dispose(): void };

const reducedMotion = (): boolean => {
  try { return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false; } catch { return false; }
};

export function mountLockChain(o: LockChainOptions): LockChain {
  const s = o.station;
  const keep = o.keepScroll ?? ((swap: () => void) => swap());
  const root = el('div', 'rot-chain');
  root.setAttribute('aria-label', 'Locks at this station');
  const els = new Map<string, HTMLElement>();
  const sigs = new Map<string, string>();
  const prev = new Map<string, PublicStationLock['state']>();
  const rushes = new Map<string, RushRound>();
  const aiDrafts: Record<string, string> = {};
  const checking = new Set<string>();
  /** AI check boxes of open locks, repainted on their own. */
  const aiBoxes = new Map<string, { box: HTMLElement; sig: string }>();
  let status: RotationStatus | null = null;

  const levelNow = (): RotationLevel => status?.levels[s.id]?.level ?? 'core';

  function row(lock: PublicStationLock, index: number, total: number, tag: 'div' | 'summary' = 'div'): HTMLElement {
    const r = el(tag, 'rot-lk__row');
    const icon = el('span', 'rot-lk__icon');
    icon.innerHTML = lock.state === 'passed' ? TICK_SVG : lock.state === 'locked' ? PADLOCK_SVG : String(index + 1);
    const text = el('span', 'rot-lk__name');
    text.append(el('span', 'rot-lk__num', `Lock ${index + 1} of ${total}`), el('span', 'rot-lk__title', lock.title || 'Lock'));
    const state = el('span', 'rot-lk__state', lock.state === 'passed' ? 'Open' : lock.state === 'locked' ? 'Locked' : lock.kind === 'rush' ? 'Rush round' : 'Written check');
    r.append(icon, text, state);
    return r;
  }

  function aiCheck(lock: PublicStationLock): HTMLElement {
    const box = el('div', 'rot-lk__ai');
    paintAi(lock, box);
    aiBoxes.set(lock.id, { box, sig: aiSig(lock) });
    return box;
  }
  const aiSig = (lock: PublicStationLock) => JSON.stringify([lock.ai, lock.flagged ?? false, checking.has(lock.id)]);

  function paintAi(lock: PublicStationLock, box: HTMLElement): void {
    box.replaceChildren();
    const prompt = lock.check?.kind === 'ai' ? lock.check.prompt : '';
    const flagged = !!lock.flagged;
    const busy = checking.has(lock.id);
    const last = lock.ai?.last ?? null;
    if (aiDrafts[lock.id] === undefined) aiDrafts[lock.id] = last?.text ?? '';
    const q = el('p', 'rot-lk__prompt');
    q.append(el('b', '', prompt));
    const ta = el('textarea', 'rot-input');
    ta.rows = 3;
    ta.maxLength = 600;
    ta.value = aiDrafts[lock.id] ?? '';
    ta.placeholder = 'One or two sentences…';
    ta.setAttribute('aria-label', 'Your answer, one or two sentences');
    ta.disabled = flagged || busy;
    ta.addEventListener('input', () => { aiDrafts[lock.id] = ta.value; });
    const left = lock.ai?.checks_left ?? 0;
    const go = el('button', 'rot-btn rot-btn--primary', busy ? 'Checking…' : 'Check');
    go.type = 'button';
    go.disabled = flagged || busy || left <= 0;
    const tries = el('span', 'rot-small rot-muted', flagged ? '' : `${left} check${left === 1 ? '' : 's'} left`);
    const r = el('div', 'rot-row');
    r.append(go, tries);
    const spin = el('span', 'rot-checking');
    spin.append(el('span', 'rot-spin'), document.createTextNode('Checking your answer…'));
    spin.hidden = !busy;
    const out = el('div', 'rot-lk__reply');
    out.setAttribute('aria-live', 'polite');
    if (flagged) {
      out.dataset.kind = 'teacher';
      out.append(el('p', '', 'Your teacher will check this one with you. You can do another station and come back.'));
    } else if (last?.outcome === 'not_yet') {
      out.dataset.kind = 'fix';
      out.append(el('b', '', 'Not yet. Next step: '), document.createTextNode(last.fix || 'Read the question again and add the missing link.'));
    } else if (last?.outcome === 'teacher') {
      out.dataset.kind = 'teacher';
      out.append(el('p', '', 'Your teacher will look at this one.'));
    }
    go.addEventListener('click', () => {
      const text = (aiDrafts[lock.id] ?? '').trim();
      if (!text) { out.dataset.kind = 'fix'; out.textContent = 'Write your answer first.'; return; }
      checking.add(lock.id);
      paintAi(lock, box);
      void o.act(() => o.client.lockAi(s.id, lock.id, text)).then((next) => {
        checking.delete(lock.id);
        const now = next ? chainOf(s, next).find((l) => l.id === lock.id) : lock;
        if (now && now.state === 'open') { paintAi(now, box); aiBoxes.set(lock.id, { box, sig: aiSig(now) }); }
        if (next?.lock_check?.message && now?.state === 'open') box.querySelector('.rot-lk__reply')?.append(el('p', 'rot-small', next.lock_check.message));
      });
    });
    box.append(q, ta, r, spin);
    if (out.childNodes.length) box.append(out);
    box.append(el('p', 'rot-note', 'The checker says what to add next. It won’t write the answer for you.'));
  }

  function openCheck(lock: PublicStationLock): HTMLElement {
    const wrap = el('div', 'rot-lk__check');
    if (lock.kind === 'rush' && lock.check?.kind === 'rush') {
      wrap.append(el('p', 'rot-lk__how', `Rush round: get ${lock.check.streak} right in a row within ${lock.check.seconds} seconds.`));
      let rush = rushes.get(lock.id);
      if (!rush) {
        rush = mountRushRound({
          lessonId: o.lessonId,
          stationId: s.id,
          lock,
          submit: (itemId, response) => o.act(() => o.client.lockRush(s.id, lock.id, itemId, response)),
          reset: (itemId) => o.quiet(() => o.client.lockRush(s.id, lock.id, itemId, {} as QuizResponse))
        });
        rushes.set(lock.id, rush);
      }
      wrap.append(rush.root);
    } else if (lock.kind === 'ai') {
      wrap.append(aiCheck(lock));
    }
    return wrap;
  }

  function build(lock: PublicStationLock, index: number, total: number, fresh: boolean): HTMLElement {
    const box = el('div', 'rot-lk');
    box.dataset.state = lock.state;
    box.dataset.lock = lock.id;
    const blocks = forLevel(blocksOfLock(lock, index, o.blocks), levelNow()).filter((b) => roleOf(b) !== 'exit');
    if (lock.state === 'locked') {
      box.append(row(lock, index, total));
      return box;
    }
    if (lock.state === 'passed') {
      const fold = el('details', 'rot-lk__fold');
      fold.append(row(lock, index, total, 'summary'));
      if (blocks.length) {
        const list = el('div', 'rot-blocks');
        for (const b of blocks) list.append(o.render(b));
        fold.append(list);
      } else fold.append(el('p', 'rot-note', 'Nothing more to read in this lock.'));
      box.append(fold);
      if (lock.reward) {
        const card = kitCard(lock.reward, 'Viva Kit card');
        if (fresh) card.classList.add('rot-kit-card--new');
        box.append(card);
      }
      return box;
    }
    box.append(row(lock, index, total));
    if (blocks.length) {
      const list = el('div', 'rot-blocks');
      for (const b of blocks) list.append(o.render(b));
      box.append(list);
    }
    box.append(openCheck(lock));
    return box;
  }

  function update(next: RotationStatus): void {
    status = next;
    const chain = chainOf(s, next);
    let opened: HTMLElement | null = null;
    let lastOpened = false;
    const changed: Array<() => void> = [];
    chain.forEach((lock, i) => {
      const was = prev.get(lock.id);
      const fresh = was === 'open' && lock.state === 'passed';
      const sig = JSON.stringify([lock.state, lock.reward ?? null, (lock.blocks ?? []).map((b) => b.id), lock.kind, levelNow(), lock.check?.kind === 'rush' ? lock.check.items.map((q) => q.id) : lock.check?.kind === 'ai' ? lock.check.prompt : null]);
      if (sigs.get(lock.id) !== sig) {
        sigs.set(lock.id, sig);
        if (lock.state !== 'open') { rushes.get(lock.id)?.dispose(); rushes.delete(lock.id); aiBoxes.delete(lock.id); }
        const elNew = build(lock, i, chain.length, fresh);
        const old = els.get(lock.id);
        els.set(lock.id, elNew);
        changed.push(() => { if (old?.isConnected) old.replaceWith(elNew); });
        if (fresh) {
          const nextLock = chain[i + 1];
          if (!nextLock) lastOpened = true;
        }
        if (was === 'locked' && lock.state === 'open') opened = elNew;
      } else if (lock.state === 'open') {
        rushes.get(lock.id)?.update(lock);
        const ai = aiBoxes.get(lock.id);
        if (ai && !checking.has(lock.id)) {
          const sigNow = aiSig(lock);
          if (ai.sig !== sigNow) { ai.sig = sigNow; paintAi(lock, ai.box); }
        }
      }
      prev.set(lock.id, lock.state);
    });
    // First paint, or the chain itself changed (a lock added or taken away by a republish).
    const order = chain.map((l) => els.get(l.id)!);
    const inOrder = order.length === root.children.length && order.every((e, i) => root.children[i] === e);
    if (changed.length || !inOrder) {
      keep(() => {
        for (const run of changed) run();
        if (!order.every((e, i) => root.children[i] === e)) root.replaceChildren(...order);
      });
    }
    const target = opened as HTMLElement | null;
    if (target) {
      // The unlock moment: the reward card animates in, then the new lock slides into view.
      window.setTimeout(() => target.scrollIntoView?.({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' }), reducedMotion() ? 0 : 420);
    } else if (lastOpened) o.onAllOpen?.();
  }

  return {
    root,
    update,
    dispose(): void { for (const r of rushes.values()) r.dispose(); }
  };
}
