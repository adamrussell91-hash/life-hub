import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOARD_COLUMNS } from '@/domain/board';
import {
  initBoardColumnNav,
  renderBoardColumnNav,
  syncBoardColumnNavCounts
} from '@/views/board-column-nav';
import { el } from '@/views/hub-kit';

function mockMatchMedia(matches: Record<string, boolean>): void {
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    matches: matches[query] ?? false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }) as unknown as MediaQueryList);
}

function mockBoard(): HTMLElement {
  const board = el('div', 'board board-grid');
  for (const col of BOARD_COLUMNS) {
    const section = el('section', 'column board-col');
    section.dataset.col = col.id;
    section.append(
      el('header', 'column-header', col.title),
      el('span', 'column-count', '02')
    );
    board.append(section);
  }
  return board;
}

describe('board column nav', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a tab for each board column with counts', () => {
    const board = mockBoard();
    const nav = renderBoardColumnNav(board);
    const tabs = [...nav.querySelectorAll('[data-board-col]')];
    expect(tabs).toHaveLength(4);
    expect(tabs[0]?.textContent).toBe('To do 02');
    expect(tabs[1]?.textContent).toBe('Doing 02');
  });

  it('syncs counts from the live board', () => {
    const board = mockBoard();
    board.querySelector('.column[data-col="doing"] .column-count')!.textContent = '05';
    const nav = renderBoardColumnNav(board);
    syncBoardColumnNavCounts(nav, board);
    expect(nav.querySelector('[data-board-col="doing"]')?.textContent).toBe('Doing 05');
  });

  it('scrolls to a column when its tab is clicked on desktop', () => {
    mockMatchMedia({ '(max-width: 720px)': false });
    const board = mockBoard();
    document.body.append(board);
    const nav = renderBoardColumnNav(board);
    const { teardown } = initBoardColumnNav(board, nav);
    const doing = board.querySelector<HTMLElement>('.column[data-col="doing"]')!;
    const scrollIntoView = vi.fn();
    doing.scrollIntoView = scrollIntoView;
    nav.querySelector<HTMLButtonElement>('[data-board-col="doing"]')?.click();
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      inline: 'start',
      block: 'nearest'
    });
    teardown();
    document.body.replaceChildren();
  });

  it('shows one column at a time on mobile', () => {
    mockMatchMedia({ '(max-width: 720px)': true });
    const board = mockBoard();
    document.body.append(board);
    const nav = renderBoardColumnNav(board);
    const { teardown } = initBoardColumnNav(board, nav);
    expect(board.classList.contains('board-grid--single-col')).toBe(true);
    expect(board.querySelector('.column[data-col="todo"]')?.classList.contains('board-col--active')).toBe(true);
    expect(board.querySelector('.column[data-col="doing"]')?.hasAttribute('hidden')).toBe(true);
    nav.querySelector<HTMLButtonElement>('[data-board-col="doing"]')?.click();
    expect(board.querySelector('.column[data-col="doing"]')?.classList.contains('board-col--active')).toBe(true);
    expect(board.querySelector('.column[data-col="todo"]')?.hasAttribute('hidden')).toBe(true);
    teardown();
    document.body.replaceChildren();
  });

  it('marks the first column active on init', () => {
    mockMatchMedia({ '(max-width: 720px)': false });
    const board = mockBoard();
    document.body.append(board);
    const nav = renderBoardColumnNav(board);
    const { teardown } = initBoardColumnNav(board, nav);
    expect(nav.querySelector('[data-board-col="todo"]')?.classList.contains('is-active')).toBe(true);
    teardown();
    document.body.replaceChildren();
  });
});
