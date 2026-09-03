export const DRAG_THRESHOLD = 4;
export const TOUCH_DRAG_THRESHOLD = 12;

/** Mice keep a tight lift; fingers need slack so a tap can expand the card. */
export function dragThresholdFor(event: Pick<PointerEvent, 'pointerType'>): number {
  return event.pointerType === 'touch' || event.pointerType === 'pen'
    ? TOUCH_DRAG_THRESHOLD
    : DRAG_THRESHOLD;
}

/** Mice and fingers both drag; fingers use the wider lift in `dragThresholdFor`. */
export function boardPointerDragEnabled(_event: Pick<PointerEvent, 'pointerType'>): boolean {
  return true;
}

export type BoardMoveDetail = {
  id: string;
  column: string;
  index: number;
};

export type InitBoardOptions = {
  onCardMoved?: (detail: BoardMoveDetail) => void;
};

type DragState = {
  card: HTMLElement;
  placeholder: HTMLElement;
  offsetX: number;
  offsetY: number;
};

type PendingDrag = {
  card: HTMLElement;
  startX: number;
  startY: number;
  pointerId: number;
};

type KbdState = {
  parent: HTMLElement;
  next: ChildNode | null;
};

/** Keep column counts and empty hints in sync after in-place add/delete. */
export function updateBoardCounts(root: HTMLElement): void {
  const board = root.matches('.board') ? root : root.querySelector<HTMLElement>('.board');
  if (!board) return;
  for (const col of board.querySelectorAll<HTMLElement>('.column')) {
    const list = col.querySelector('.card-list');
    if (!list) continue;
    const count = list.querySelectorAll('.card').length;
    const counter = col.querySelector('.column-count');
    if (counter) counter.textContent = String(count).padStart(2, '0');
    const hint = list.querySelector<HTMLElement>('.empty-hint');
    const hasSlot = Boolean(list.querySelector('.card-slot'));
    if (hint) hint.hidden = !(count === 0 && !hasSlot);
  }
}

function isInteractive(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('button, a, input, textarea, select, label'));
}

/**
 * Sprint-board pointer + keyboard drag engine.
 * DOM contract: `.board > .column[data-col] > .card-list > .card[data-id] > .card-title`
 */
export function initBoard(root: HTMLElement, options: InitBoardOptions = {}): () => void {
  const found = root.matches('.board') ? root : root.querySelector<HTMLElement>('.board');
  if (!found) return () => undefined;
  const board = found;

  let liveRegion = root.querySelector<HTMLElement>('[data-live-region]');
  if (!liveRegion) {
    liveRegion = document.createElement('div');
    liveRegion.className = 'sr-only';
    liveRegion.dataset.liveRegion = 'true';
    liveRegion.setAttribute('aria-live', 'polite');
    root.append(liveRegion);
  }

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let dragState: DragState | null = null;
  let pendingDrag: PendingDrag | null = null;
  let kbdState: KbdState | null = null;

  function announce(msg: string): void {
    liveRegion!.textContent = msg;
  }

  function columns(): HTMLElement[] {
    return [...board.querySelectorAll<HTMLElement>('.column')];
  }

  function cardLists(): HTMLElement[] {
    return [...board.querySelectorAll<HTMLElement>('.card-list')];
  }

  function updateCounts(): void {
    updateBoardCounts(board);
  }

  function flip(lists: Array<ParentNode | null>, mutate: () => void): void {
    const nodes = new Set<HTMLElement>();
    for (const list of lists) {
      if (!list) continue;
      list.querySelectorAll<HTMLElement>('.card, .card-slot').forEach((n) => nodes.add(n));
    }
    const first = new Map<HTMLElement, DOMRect>();
    nodes.forEach((n) => first.set(n, n.getBoundingClientRect()));
    mutate();
    for (const list of lists) {
      if (!list) continue;
      list.querySelectorAll<HTMLElement>('.card, .card-slot').forEach((n) => nodes.add(n));
    }
    nodes.forEach((n) => {
      if (!n.isConnected) return;
      const f = first.get(n);
      if (!f) return;
      const last = n.getBoundingClientRect();
      const dx = f.left - last.left;
      const dy = f.top - last.top;
      if ((dx || dy) && !prefersReducedMotion) {
        n.style.transition = 'none';
        n.style.transform = `translate(${dx}px,${dy}px)`;
        requestAnimationFrame(() => {
          n.style.transition = 'transform .22s cubic-bezier(.2,.8,.2,1)';
          n.style.transform = '';
        });
      }
    });
  }

  function cardTitle(card: HTMLElement): string {
    return card.querySelector('.card-title')?.textContent?.trim() ?? '';
  }

  function positionDescription(card: HTMLElement): string {
    const list = card.parentElement;
    const col = list?.closest('.column');
    const name = col?.querySelector('.column-title')?.textContent ?? 'column';
    const cards = list ? [...list.querySelectorAll('.card')] : [];
    const idx = cards.indexOf(card);
    return `${name}, position ${idx + 1} of ${cards.length}`;
  }

  function reportMove(card: HTMLElement): void {
    const list = card.parentElement;
    const col = list?.closest('.column')?.getAttribute('data-col');
    if (!list || !col || !card.dataset.id) return;
    const cards = [...list.querySelectorAll('.card')];
    const detail: BoardMoveDetail = {
      id: card.dataset.id,
      column: col,
      index: cards.indexOf(card)
    };
    root.dispatchEvent(new CustomEvent<BoardMoveDetail>('board:cardmoved', { detail, bubbles: true }));
    options.onCardMoved?.(detail);
  }

  function activateDrag(): void {
    if (!pendingDrag) return;
    const card = pendingDrag.card;
    const rect = card.getBoundingClientRect();
    const placeholder = document.createElement('li');
    placeholder.className = 'card-slot';
    placeholder.style.height = `${rect.height}px`;
    card.parentNode?.insertBefore(placeholder, card);

    document.body.appendChild(card);
    card.style.width = `${rect.width}px`;
    card.style.left = `${rect.left}px`;
    card.style.top = `${rect.top}px`;
    card.classList.add('dragging');
    try {
      card.setPointerCapture(pendingDrag.pointerId);
    } catch {
      /* jsdom and some browsers skip capture */
    }

    dragState = {
      card,
      placeholder,
      offsetX: pendingDrag.startX - rect.left,
      offsetY: pendingDrag.startY - rect.top
    };
    document.body.style.cursor = 'grabbing';
    updateCounts();
  }

  function moveSlot(colList: HTMLElement, insertBefore: Element | null): void {
    if (!dragState) return;
    const placeholder = dragState.placeholder;
    const currentParent = placeholder.parentNode;
    if (currentParent === colList && placeholder.nextSibling === insertBefore) return;
    flip([currentParent, colList], () => {
      colList.insertBefore(placeholder, insertBefore);
    });
    updateCounts();
  }

  function onPointerMove(event: PointerEvent): void {
    if (!dragState) {
      if (!pendingDrag) return;
      const dx = event.clientX - pendingDrag.startX;
      const dy = event.clientY - pendingDrag.startY;
      if (Math.sqrt(dx * dx + dy * dy) < dragThresholdFor(event)) return;
      event.preventDefault();
      activateDrag();
    }
    if (!dragState) return;
    event.preventDefault();
    const card = dragState.card;
    card.style.left = `${event.clientX - dragState.offsetX}px`;
    card.style.top = `${event.clientY - dragState.offsetY}px`;

    const el = document.elementFromPoint(event.clientX, event.clientY);
    const colEl = el?.closest<HTMLElement>('.column') ?? null;
    for (const col of columns()) col.classList.toggle('drop-active', col === colEl);
    if (!colEl || !board.contains(colEl)) return;

    const colList = colEl.querySelector<HTMLElement>('.card-list');
    if (!colList) return;
    const siblings = [...colList.querySelectorAll('.card, .card-slot')].filter(
      (n) => n !== dragState!.placeholder && n !== card
    );
    let insertBefore: Element | null = null;
    for (const sib of siblings) {
      const r = sib.getBoundingClientRect();
      if (event.clientY < r.top + r.height / 2) {
        insertBefore = sib;
        break;
      }
    }
    moveSlot(colList, insertBefore);
  }

  function finalize(card: HTMLElement, placeholder: HTMLElement): void {
    placeholder.parentNode?.insertBefore(card, placeholder);
    placeholder.remove();
    card.style.position = '';
    card.style.left = '';
    card.style.top = '';
    card.style.width = '';
    card.style.transition = '';
    card.focus({ preventScroll: true });
    updateCounts();
    reportMove(card);
  }

  function onPointerUp(): void {
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);

    if (!dragState) {
      pendingDrag?.card.focus({ preventScroll: true });
      pendingDrag = null;
      return;
    }
    pendingDrag = null;
    document.body.style.cursor = '';

    const card = dragState.card;
    const placeholder = dragState.placeholder;
    const targetRect = placeholder.getBoundingClientRect();

    card.classList.remove('dragging');
    const newCol = placeholder.parentElement?.closest('.column')?.getAttribute('data-col');
    if (newCol) card.dataset.col = newCol;

    const currentLeft = parseFloat(card.style.left) || 0;
    const currentTop = parseFloat(card.style.top) || 0;
    const movesEnough =
      Math.abs(currentLeft - targetRect.left) > 0.5 || Math.abs(currentTop - targetRect.top) > 0.5;

    if (prefersReducedMotion || !movesEnough) {
      finalize(card, placeholder);
    } else {
      card.style.transition = 'left .22s cubic-bezier(.2,.8,.2,1), top .22s cubic-bezier(.2,.8,.2,1)';
      card.style.left = `${targetRect.left}px`;
      card.style.top = `${targetRect.top}px`;
      card.addEventListener(
        'transitionend',
        () => {
          finalize(card, placeholder);
        },
        { once: true }
      );
    }

    for (const col of columns()) col.classList.remove('drop-active');
    updateCounts();
    dragState = null;
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.button !== undefined && event.button !== 0) return;
    if (!boardPointerDragEnabled(event)) return;
    if (isInteractive(event.target)) return;
    const card = (event.target as Element | null)?.closest<HTMLElement>('.card');
    if (!card || !board.contains(card) || card.classList.contains('kbd-lifted')) return;
    // Do not preventDefault here — a tap must still fire click so the micro card can expand.
    pendingDrag = {
      card,
      startX: event.clientX,
      startY: event.clientY,
      pointerId: event.pointerId
    };
    document.addEventListener('pointermove', onPointerMove, { passive: false });
    document.addEventListener('pointerup', onPointerUp);
  }

  function liftCard(card: HTMLElement): void {
    kbdState = { parent: card.parentElement!, next: card.nextSibling };
    card.classList.add('kbd-lifted');
    announce(`Picked up “${cardTitle(card)}”. Arrow keys to move, Space or Enter to drop, Escape to cancel.`);
  }

  function dropCard(card: HTMLElement): void {
    card.classList.remove('kbd-lifted');
    kbdState = null;
    updateCounts();
    announce(`Dropped in ${positionDescription(card)}.`);
    reportMove(card);
  }

  function cancelLift(card: HTMLElement): void {
    if (!kbdState) return;
    flip([kbdState.parent, card.parentElement], () => {
      kbdState!.parent.insertBefore(card, kbdState!.next);
    });
    card.classList.remove('kbd-lifted');
    kbdState = null;
    const col = card.parentElement?.closest('.column')?.getAttribute('data-col');
    if (col) card.dataset.col = col;
    card.focus({ preventScroll: true });
    updateCounts();
    announce('Move canceled.');
  }

  function handleArrow(card: HTMLElement, key: string): void {
    const list = card.parentElement;
    if (!list) return;
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      const sibs = [...list.querySelectorAll<HTMLElement>('.card')];
      const idx = sibs.indexOf(card);
      const targetIdx = key === 'ArrowUp' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= sibs.length) return;
      const target = sibs[targetIdx]!;
      flip([list], () => {
        if (key === 'ArrowUp') list.insertBefore(card, target);
        else list.insertBefore(card, target.nextSibling);
      });
    } else {
      const lists = cardLists();
      const curIdx = lists.indexOf(list);
      const targetIdx = key === 'ArrowLeft' ? curIdx - 1 : curIdx + 1;
      if (targetIdx < 0 || targetIdx >= lists.length) return;
      const targetList = lists[targetIdx]!;
      const cardsBefore = [...list.querySelectorAll('.card')].indexOf(card);
      const targetCards = [...targetList.querySelectorAll('.card')];
      const insertBefore = targetCards[Math.min(cardsBefore, targetCards.length)] ?? null;
      flip([list, targetList], () => {
        targetList.insertBefore(card, insertBefore);
      });
      const col = targetList.closest('.column')?.getAttribute('data-col');
      if (col) card.dataset.col = col;
    }
    card.focus({ preventScroll: true });
    updateCounts();
    announce(`Moved to ${positionDescription(card)}.`);
  }

  function onKeyDown(event: KeyboardEvent): void {
    const card = (event.target as Element | null)?.closest<HTMLElement>('.card');
    if (!card || !board.contains(card)) return;
    const isLifted = card.classList.contains('kbd-lifted');

    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      if (isLifted) dropCard(card);
      else liftCard(card);
    } else if (isLifted && event.key === 'Escape') {
      event.preventDefault();
      cancelLift(card);
    } else if (
      isLifted &&
      (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight')
    ) {
      event.preventDefault();
      handleArrow(card, event.key);
    }
  }

  board.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('keydown', onKeyDown);
  updateCounts();

  return () => {
    board.removeEventListener('pointerdown', onPointerDown);
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.body.style.cursor = '';
    dragState = null;
    pendingDrag = null;
    kbdState = null;
  };
}
