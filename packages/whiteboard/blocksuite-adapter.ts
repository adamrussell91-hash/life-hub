export type BlockSuiteSnapshot = Record<string, unknown>;

export type MountedWhiteboard = {
  snapshot(): Promise<BlockSuiteSnapshot | null>;
  dispose(): void;
};

type MountWhiteboardOptions = {
  snapshot?: BlockSuiteSnapshot | null;
  readOnly?: boolean;
  onSnapshot?: (snapshot: BlockSuiteSnapshot) => void | Promise<void>;
};

let runtimePromise: Promise<{
  createEmptyDoc: typeof import('@blocksuite/presets')['createEmptyDoc'];
  EdgelessEditor: typeof import('@blocksuite/presets')['EdgelessEditor'];
  Job: typeof import('@blocksuite/store')['Job'];
}> | null = null;

async function loadRuntime() {
  if (!runtimePromise) {
    runtimePromise = Promise.all([
      import('@blocksuite/presets'),
      import('@blocksuite/store'),
      import('@blocksuite/presets/effects')
    ]).then(([presets, store, presetEffects]) => {
      if (!customElements.get('edgeless-editor')) {
        presetEffects.effects();
      }
      return {
        createEmptyDoc: presets.createEmptyDoc,
        EdgelessEditor: presets.EdgelessEditor,
        Job: store.Job
      };
    });
  }
  return runtimePromise;
}

export async function mountBlockSuiteWhiteboard(
  host: HTMLElement,
  options: MountWhiteboardOptions = {}
): Promise<MountedWhiteboard> {
  const { createEmptyDoc, EdgelessEditor, Job } = await loadRuntime();

  let doc;
  if (options.snapshot) {
    const seed = createEmptyDoc();
    const importJob = new Job({ collection: seed.doc.collection });
    doc = await importJob.snapshotToDoc(options.snapshot as never);
    if (!doc) throw new Error('BlockSuite could not restore the whiteboard snapshot.');
    if (!doc.loaded) doc.load();
  } else {
    doc = createEmptyDoc().init();
  }

  const viewDoc = options.readOnly
    ? doc.blockCollection.getDoc({ readonly: true })
    : doc;
  if (!viewDoc.loaded) viewDoc.load();

  const editor = new EdgelessEditor();
  editor.doc = viewDoc;
  editor.classList.add('hub-blocksuite-whiteboard');
  editor.style.display = 'block';
  editor.style.width = '100%';
  editor.style.height = '100%';
  editor.setAttribute('aria-label', options.readOnly ? 'Whiteboard preview' : 'Whiteboard editor');
  if (options.readOnly) {
    editor.inert = true;
    editor.setAttribute('aria-readonly', 'true');
  }

  host.replaceChildren(editor);
  await editor.updateComplete;

  const exportJob = new Job({ collection: doc.collection });
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let emitChain = Promise.resolve();

  const readSnapshot = async (): Promise<BlockSuiteSnapshot | null> => {
    const snapshot = await exportJob.docToSnapshot(doc);
    return snapshot ? (snapshot as unknown as BlockSuiteSnapshot) : null;
  };

  const emitSnapshot = () => {
    if (disposed || options.readOnly || !options.onSnapshot) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      emitChain = emitChain.then(async () => {
        const snapshot = await readSnapshot();
        if (snapshot && !disposed) await options.onSnapshot?.(snapshot);
      });
    }, 450);
  };

  if (!options.readOnly) {
    doc.spaceDoc.on('update', emitSnapshot);
    const initial = await readSnapshot();
    if (initial) await options.onSnapshot?.(initial);
  }

  return {
    snapshot: readSnapshot,
    dispose() {
      disposed = true;
      if (timer) clearTimeout(timer);
      if (!options.readOnly) doc.spaceDoc.off('update', emitSnapshot);
      editor.remove();
    }
  };
}
