import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import { TARGETS_CONFIG } from './targets-config.mjs';
import { bodyCompositionTargets } from '../../../apps/life/js/core/forecast-targets.js';

const CONFIG_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../config/physique-target.yml'
);

const DEFAULT_TARGET = { shoulder_waist_ratio: 1.6, body_fat_pct: 8 };

function fromForecast(config) {
  const body = bodyCompositionTargets(config) ?? {};
  const ratio = Number(body.shoulder_waist_ratio);
  const bodyFatPct = Number(body.body_fat_pct_tight);
  return {
    shoulder_waist_ratio: Number.isFinite(ratio) ? ratio : DEFAULT_TARGET.shoulder_waist_ratio,
    body_fat_pct: Number.isFinite(bodyFatPct) ? bodyFatPct : DEFAULT_TARGET.body_fat_pct,
    weight_kg_min: body.weight_kg_min ?? null,
    weight_kg_max: body.weight_kg_max ?? null,
    body_fat_pct_min: body.body_fat_pct_min ?? null,
    body_fat_pct_max: body.body_fat_pct_max ?? null,
    body_fat_pct_tight: Number.isFinite(bodyFatPct) ? bodyFatPct : DEFAULT_TARGET.body_fat_pct
  };
}

function fromLegacyYaml(text) {
  const parsed = load(text);
  const ratio = Number(parsed?.shoulder_waist_ratio);
  const bodyFatPct = Number(parsed?.body_fat_pct);
  return {
    shoulder_waist_ratio: Number.isFinite(ratio) ? ratio : DEFAULT_TARGET.shoulder_waist_ratio,
    body_fat_pct: Number.isFinite(bodyFatPct) ? bodyFatPct : DEFAULT_TARGET.body_fat_pct
  };
}

export function loadPhysiqueTarget({ readFileSyncImpl, config = TARGETS_CONFIG } = {}) {
  if (readFileSyncImpl) {
    try {
      return fromLegacyYaml(readFileSyncImpl(CONFIG_PATH, 'utf8'));
    } catch {
      return { ...DEFAULT_TARGET };
    }
  }
  return fromForecast(config);
}
