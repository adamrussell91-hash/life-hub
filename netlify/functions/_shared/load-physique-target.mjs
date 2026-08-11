import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';

const CONFIG_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../config/physique-target.yml'
);

const DEFAULT_TARGET = { shoulder_waist_ratio: 1.6, body_fat_pct: 8 };

export function loadPhysiqueTarget({ readFileSyncImpl = readFileSync } = {}) {
  try {
    const text = readFileSyncImpl(CONFIG_PATH, 'utf8');
    const parsed = load(text);
    const ratio = Number(parsed?.shoulder_waist_ratio);
    const bodyFatPct = Number(parsed?.body_fat_pct);
    return {
      shoulder_waist_ratio: Number.isFinite(ratio) ? ratio : DEFAULT_TARGET.shoulder_waist_ratio,
      body_fat_pct: Number.isFinite(bodyFatPct) ? bodyFatPct : DEFAULT_TARGET.body_fat_pct
    };
  } catch {
    return { ...DEFAULT_TARGET };
  }
}
