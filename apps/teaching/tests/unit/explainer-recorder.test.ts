import { describe, it, expect, afterEach, vi } from 'vitest';

// Excalidraw cannot load in jsdom: stand in an empty board that never mounts.
vi.mock('@excalidraw/excalidraw', () => ({}));
vi.mock('@excalidraw/excalidraw/index.css', () => ({}));
vi.mock('react-dom/client', () => ({ createRoot: () => ({ render: () => {}, unmount: () => {} }) }));
// The confirm card says yes.
vi.mock('@/teacher/confirm-dialog', () => ({ askConfirmCard: vi.fn(async () => true) }));
import { mountExplainerRecorder } from '@/blocks/explainer/recorder';
import { inView, wrapForBoard } from '@/blocks/explainer/board-runtime';
import { sampleExplainer } from '@/dev/explainer-sample';
import { createBlockEditor } from '@/blocks/editors';

const noop = () => {};
const mount = (layout: 'text' | 'both') => {
  const block = sampleExplainer();
  block.content = { ...block.content, layout };
  const rec = mountExplainerRecorder(block, { blockId: block.id, lessonId: 'lesson_x', onDone: noop, onCancel: noop });
  document.body.append(rec.el);
  return rec;
};
const toolBtn = (root: HTMLElement, tool: string) => root.querySelector<HTMLButtonElement>(`[data-tool="${tool}"]`)!;

describe('explainer recorder', () => {
  let rec: ReturnType<typeof mountExplainerRecorder> | null = null;
  afterEach(() => {
    rec?.dispose();
    rec?.el.remove();
    rec = null;
  });

  it('pressing the pointer again puts it down and goes back to the last tool', () => {
    rec = mount('text');
    toolBtn(rec.el, 'underline').click();
    toolBtn(rec.el, 'pointer').click();
    expect(rec.el.dataset.tool).toBe('pointer');
    toolBtn(rec.el, 'pointer').click();
    expect(rec.el.dataset.tool).toBe('underline');
    expect(toolBtn(rec.el, 'pointer').getAttribute('aria-pressed')).toBe('false');
  });

  it('fills the window when there is a board, and Shrink puts it back', () => {
    rec = mount('both');
    expect(rec.el.classList.contains('is-full')).toBe(true);
    expect(document.documentElement.classList.contains('block-explainer-full-open')).toBe(true);
    const full = rec.el.querySelector<HTMLButtonElement>('.block-explainer__full')!;
    expect(full.textContent).toBe('Shrink');
    full.click();
    expect(rec.el.classList.contains('is-full')).toBe(false);
    expect(document.documentElement.classList.contains('block-explainer-full-open')).toBe(false);
    full.click();
    rec.dispose();
    expect(document.documentElement.classList.contains('block-explainer-full-open')).toBe(false);
  });

  it('a text-only recorder stays in the lesson', () => {
    rec = mount('text');
    expect(rec.el.classList.contains('is-full')).toBe(false);
  });
});

describe('send to board', () => {
  it('wraps a long quote into lines of about 40 characters', () => {
    const lines = wrapForBoard('the sea keeps every promise it never made to the shore and the gulls').split('\n');
    expect(lines.length).toBe(2);
    expect(lines.every((l) => l.length <= 40)).toBe(true);
    expect(wrapForBoard('short words')).toBe('short words');
  });

  it('knows when sent words land outside the visible board', () => {
    const s = { scrollX: 0, scrollY: 0, zoom: { value: 1 }, width: 600, height: 400 };
    expect(inView(s, { x: 20, y: 20, width: 100, height: 30 })).toBe(true);
    expect(inView(s, { x: 20, y: 500, width: 100, height: 30 })).toBe(false);
    // Scrolled down 300 and zoomed out: the visible scene runs to y = 300 + 800.
    expect(inView({ ...s, scrollY: -300, zoom: { value: 0.5 } }, { x: 20, y: 900, width: 100, height: 30 })).toBe(true);
  });
});

describe('delete recording', () => {
  it('drops the recording, keeps the text and tray, and offers Record again', async () => {
    const changed = vi.fn();
    const block = sampleExplainer({ status: 'draft' });
    const editor = createBlockEditor(block, changed);
    editor.querySelector<HTMLButtonElement>('.block-explainer-editor__delete-recording')!.click();
    await vi.waitFor(() => expect(changed).toHaveBeenCalled());
    const content = changed.mock.calls.at(-1)![0].content;
    expect('recording' in content).toBe(false);
    expect(content.text).toEqual(block.content.text);
    expect(content.tray).toEqual(block.content.tray);
    expect(editor.querySelector('.block-explainer-editor__record')).not.toBeNull();
    expect(editor.querySelector('.block-explainer__player')).toBeNull();
  });
});
