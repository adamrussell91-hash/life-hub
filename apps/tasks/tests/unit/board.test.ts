import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '@/schemas/task';
import { columnForTask, statusForColumn } from '@/domain/board';
import { DRAG_THRESHOLD, boardPointerDragEnabled, dragThresholdFor, initBoard } from '@/views/sprint-board';

const baseTask = (partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task => ({
  schema_version: 1,
  description: '',
  kind: 'task',
  bucket: 'active',
  step_order: 0,
  domain: 'teaching',
  framework_used: null,
  estimated_duration: 30,
  actual_duration: null,
  due_date: null,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
  completed_at: null,
  status: 'open',
  blocked_since: null,
  priority: 'medium',
  parent_project_id: null,
  parent_task_id: null,
  depends_on: [],
  tags: [],
  recurrence_rule: null,
  due_time: null,
  remind_at: null,
  remind_dismissed_at: null,
  attachments: [],
  source: 'manual',
  ...partial
});

describe('board columns', () => {
  it('maps drop columns to persistable statuses', () => {
    expect(statusForColumn('todo')).toBe('open');
    expect(statusForColumn('doing')).toBe('in_progress');
    expect(statusForColumn('done')).toBe('done');
    expect(statusForColumn('blocked')).toBeNull();
  });

  it('puts unmet-dependency work in Blocked unless it is already started', () => {
    const blocker = baseTask({ id: 'dep', title: 'Dep', status: 'open' });
    const waiting = baseTask({ id: 'wait', title: 'Wait', depends_on: ['dep'] });
    const started = baseTask({
      id: 'go',
      title: 'Go',
      status: 'in_progress',
      depends_on: ['dep']
    });
    const byId = new Map([
      [blocker.id, blocker],
      [waiting.id, waiting],
      [started.id, started]
    ]);
    expect(columnForTask(waiting, byId)).toBe('blocked');
    expect(columnForTask(started, byId)).toBe('doing');
    expect(columnForTask(baseTask({ id: 'done', title: 'Done', status: 'done' }), byId)).toBe('done');
  });

  it('treats a missing depends_on as unblocked', () => {
    const dirty = { ...baseTask({ id: 'raw', title: 'Breakfast' }), depends_on: undefined } as Task;
    expect(columnForTask(dirty, new Map([[dirty.id, dirty]]))).toBe('todo');
  });
});

function stubRect(el: Element, rect: Partial<DOMRect>): void {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    x: rect.left ?? 0,
    y: rect.top ?? 0,
    left: rect.left ?? 0,
    top: rect.top ?? 0,
    right: (rect.left ?? 0) + (rect.width ?? 120),
    bottom: (rect.top ?? 0) + (rect.height ?? 40),
    width: rect.width ?? 120,
    height: rect.height ?? 40,
    toJSON() {}
  });
}

function mountMiniBoard() {
  const root = document.createElement('div');
  root.innerHTML = `
    <div class="board">
      <section class="column" data-col="todo">
        <h2 class="column-title">To do</h2>
        <span class="column-count">00</span>
        <ul class="card-list" data-col="todo">
          <li class="card" tabindex="0" role="button" data-id="a">
            <p class="card-title">Alpha</p>
            <button type="button" class="btn">Edit</button>
          </li>
          <li class="empty-hint" hidden>Empty</li>
        </ul>
      </section>
      <section class="column" data-col="doing">
        <h2 class="column-title">Doing</h2>
        <span class="column-count">00</span>
        <ul class="card-list" data-col="doing">
          <li class="card" tabindex="0" role="button" data-id="b">
            <p class="card-title">Beta</p>
          </li>
          <li class="empty-hint" hidden>Empty</li>
        </ul>
      </section>
    </div>
  `;
  document.body.append(root);
  const board = root.querySelector<HTMLElement>('.board')!;
  const todoCard = root.querySelector<HTMLElement>('[data-id="a"]')!;
  const doingCard = root.querySelector<HTMLElement>('[data-id="b"]')!;
  stubRect(todoCard, { left: 10, top: 10, width: 120, height: 40 });
  stubRect(doingCard, { left: 200, top: 10, width: 120, height: 40 });
  return { root, board, todoCard, doingCard };
}

describe('sprint-board engine', () => {
  it('gives fingers a wider lift than a mouse so a tap can expand', () => {
    expect(dragThresholdFor({ pointerType: 'mouse' })).toBe(DRAG_THRESHOLD);
    expect(dragThresholdFor({ pointerType: 'touch' })).toBeGreaterThan(DRAG_THRESHOLD);
  });

  it('allows pointer drag for mouse, touch, and pen', () => {
    expect(boardPointerDragEnabled({ pointerType: 'mouse' })).toBe(true);
    expect(boardPointerDragEnabled({ pointerType: 'touch' })).toBe(true);
    expect(boardPointerDragEnabled({ pointerType: 'pen' })).toBe(true);
  });

  it('does not start a touch drag until the wider lift is crossed', () => {
    const { root, todoCard } = mountMiniBoard();
    initBoard(root);
    todoCard.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, clientX: 20, clientY: 20, button: 0, pointerType: 'touch' })
    );
    document.dispatchEvent(
      new PointerEvent('pointermove', { bubbles: true, clientX: 26, clientY: 20, pointerType: 'touch' })
    );
    expect(todoCard.classList.contains('dragging')).toBe(false);
    document.dispatchEvent(
      new PointerEvent('pointermove', { bubbles: true, clientX: 40, clientY: 20, pointerType: 'touch' })
    );
    expect(todoCard.classList.contains('dragging')).toBe(true);
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('updates padded counts on mount', () => {
    const { root } = mountMiniBoard();
    initBoard(root);
    const counts = [...root.querySelectorAll('.column-count')].map((n) => n.textContent);
    expect(counts).toEqual(['01', '01']);
  });

  it('does not lift a card on click without crossing the drag threshold', () => {
    const { root, board, todoCard } = mountMiniBoard();
    initBoard(root);
    todoCard.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, clientX: 20, clientY: 20, button: 0 })
    );
    document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 21, clientY: 21 }));
    expect(todoCard.classList.contains('dragging')).toBe(false);
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 21, clientY: 21 }));
    expect(todoCard.classList.contains('dragging')).toBe(false);
    expect(todoCard.parentElement?.closest('.column')?.getAttribute('data-col')).toBe('todo');
  });

  it('ignores pointerdown on Edit so a click can open the editor', () => {
    const { root, todoCard } = mountMiniBoard();
    const moved = vi.fn();
    initBoard(root, { onCardMoved: moved });
    const edit = todoCard.querySelector('button')!;
    edit.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 20, clientY: 20, button: 0 }));
    document.dispatchEvent(
      new PointerEvent('pointermove', { bubbles: true, clientX: 20 + DRAG_THRESHOLD + 8, clientY: 20 })
    );
    expect(todoCard.classList.contains('dragging')).toBe(false);
    expect(moved).not.toHaveBeenCalled();
  });

  it('keeps focus on a card moved across columns with the keyboard', () => {
    const { root, todoCard } = mountMiniBoard();
    const moved = vi.fn();
    initBoard(root, { onCardMoved: moved });
    todoCard.focus();
    todoCard.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(todoCard.classList.contains('kbd-lifted')).toBe(true);
    todoCard.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(todoCard);
    expect(todoCard.parentElement?.closest('.column')?.getAttribute('data-col')).toBe('doing');
    expect(todoCard.dataset.col).toBe('doing');
    todoCard.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(todoCard.classList.contains('kbd-lifted')).toBe(false);
    expect(moved).toHaveBeenCalledWith({ id: 'a', column: 'doing', index: 0 });
    const counts = [...root.querySelectorAll('.column-count')].map((n) => n.textContent);
    expect(counts).toEqual(['00', '02']);
  });

  it('reverts to the original slot on Escape and does not persist', () => {
    const { root, todoCard } = mountMiniBoard();
    const moved = vi.fn();
    initBoard(root, { onCardMoved: moved });
    todoCard.focus();
    todoCard.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    todoCard.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    todoCard.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(todoCard.parentElement?.closest('.column')?.getAttribute('data-col')).toBe('todo');
    expect(todoCard.classList.contains('kbd-lifted')).toBe(false);
    expect(document.activeElement).toBe(todoCard);
    expect(moved).not.toHaveBeenCalled();
  });

  it('finalizes a same-position pointer drop without leaving the card fixed', () => {
    const { root, board, todoCard } = mountMiniBoard();
    const moved = vi.fn();
    initBoard(root, { onCardMoved: moved });
    todoCard.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, clientX: 20, clientY: 20, button: 0 })
    );
    document.dispatchEvent(
      new PointerEvent('pointermove', { bubbles: true, clientX: 20 + DRAG_THRESHOLD + 2, clientY: 20 })
    );
    expect(todoCard.classList.contains('dragging')).toBe(true);
    stubRect(root.querySelector('.card-slot')!, { left: 10, top: 10, width: 120, height: 40 });
    todoCard.style.left = '10px';
    todoCard.style.top = '10px';
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 22, clientY: 20 }));
    expect(todoCard.classList.contains('dragging')).toBe(false);
    expect(todoCard.style.position).toBe('');
    expect(todoCard.parentElement?.classList.contains('card-list')).toBe(true);
    expect(moved).toHaveBeenCalledWith({ id: 'a', column: 'todo', index: 0 });
  });

  it('cleanup removes document listeners so a remount cannot double-handle keys', () => {
    const { root, todoCard } = mountMiniBoard();
    const stop = initBoard(root);
    stop();
    todoCard.focus();
    todoCard.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(todoCard.classList.contains('kbd-lifted')).toBe(false);
  });
});
