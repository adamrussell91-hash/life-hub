export type JsonStore = {
  getJSON<T = unknown>(key: string): Promise<T | null>;
  setJSON(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  listKeys?(prefix: string): Promise<string[]>;
};

export {
  CHECKPOINT_AFTER_SAVE_WARNING,
  VersionStoreError,
  createMemoryJsonStore,
  getVersion,
  listVersionIndex,
  restoreVersion,
  tryWriteCheckpoint,
  writeCheckpoint
} from '../../../../../netlify/functions/_shared/teaching-versions.mjs';
