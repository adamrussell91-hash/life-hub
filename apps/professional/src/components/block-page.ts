import { mountBlockCanvas, type Block } from '@tasks/teacher/lesson-canvas/mount-page';
import { nextBlockIdFactory } from '@tasks/teacher/lesson-canvas/drop';
import { mountBlockInsert } from '@tasks/views/block-insert';

export type BlockPageHandle = {
  flush(): Promise<void>;
  current(): Block[];
  dispose(): void;
};

/**
 * The Tasks block page (canvas + round "+"), saving through `onSave` after a
 * pause. Professional pages (comms, meetings, events) all use this, so they
 * edit exactly like Tasks and Lessons.
 */
export function mountBlockPage(
  host: HTMLElement,
  options: {
    blocks: Block[];
    onSave: (blocks: Block[]) => Promise<void>;
    debounceMs?: number;
    editable?: boolean;
  }
): BlockPageHandle {
  const debounceMs = options.debounceMs ?? 800;
  let blocks = options.blocks;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;

  const layout = document.createElement('div');
  layout.className = 'block-page';
  const canvasHost = document.createElement('div');
  canvasHost.className = 'block-page__canvas';
  const add = document.createElement('div');
  add.className = 'page-editor__add';
  layout.append(canvasHost, add);
  host.append(layout);

  async function save(): Promise<void> {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (!dirty) return;
    dirty = false;
    await options.onSave(blocks);
  }

  const canvas = mountBlockCanvas(canvasHost, {
    blocks,
    idFactory: nextBlockIdFactory('block', blocks),
    editable: options.editable !== false,
    onChange: (next) => {
      blocks = next;
      dirty = true;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => void save(), debounceMs);
    }
  });
  const insert =
    options.editable === false
      ? null
      : mountBlockInsert(add, { onInsert: (type) => canvas.insertType(type) });

  return {
    flush: save,
    current: () => blocks,
    dispose() {
      if (timer !== null) clearTimeout(timer);
      insert?.dispose();
      canvas.dispose();
      layout.remove();
    }
  };
}
