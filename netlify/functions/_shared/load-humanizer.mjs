import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findAgent } from './agent-directory.mjs';

const HUMANIZER_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../config/humanizer'
);
const VOICES_DIR = join(HUMANIZER_DIR, 'voices');

export const HUMANIZER_UPSTREAM = {
  repository: 'https://github.com/blader/humanizer',
  version: '2.11.2',
  commit: 'e2e92e7b4b8229253ed5c8e81dc65463fdeddda5',
  integrated: '2026-09-05'
};

export const HUMANIZER_LAYER_HEADING = '# Life Hub Humanizer layer';

function readOptional(path, readFileSyncImpl) {
  try {
    const text = readFileSyncImpl(path, 'utf8');
    return typeof text === 'string' ? text.trim() : '';
  } catch {
    return '';
  }
}

export function loadHumanizerOrigin({ readFileSyncImpl = readFileSync } = {}) {
  return readOptional(join(HUMANIZER_DIR, 'ORIGIN.md'), readFileSyncImpl);
}

export function loadHumanizerSkill({ readFileSyncImpl = readFileSync } = {}) {
  return readOptional(join(HUMANIZER_DIR, 'SKILL.md'), readFileSyncImpl);
}

export function loadHumanizerIntegration({ readFileSyncImpl = readFileSync } = {}) {
  return readOptional(join(HUMANIZER_DIR, 'integration.md'), readFileSyncImpl);
}

export function loadPersonalityWritingSample(slug, { readFileSyncImpl = readFileSync } = {}) {
  if (!findAgent(slug)) return '';
  return readOptional(join(VOICES_DIR, `${slug}.md`), readFileSyncImpl);
}

export function formatWritingSampleBlock(sample) {
  const text = typeof sample === 'string' ? sample.trim() : '';
  if (!text) return '';
  return [
    'Approved writing sample for this personality (genuine reference, not a generated imitation).',
    'Match its sentence length, vocabulary, paragraph openings, punctuation, recurring expressions, and transitions.',
    'This sample outranks Humanizer generic style defaults, including the dash rule in §14.',
    '',
    text
  ].join('\n');
}

export function loadHumanizerGuidance({ readFileSyncImpl = readFileSync } = {}) {
  const integration = loadHumanizerIntegration({ readFileSyncImpl });
  const skill = loadHumanizerSkill({ readFileSyncImpl });
  return [integration, skill].filter(Boolean).join('\n\n');
}

export const KNOWLEDGE_QUALITY_HEADING = '# Knowledge Hub quality attachment';

export function formatKnowledgeQualityBlock({ readFileSyncImpl = readFileSync } = {}) {
  const guidance = loadHumanizerGuidance({ readFileSyncImpl });
  if (!guidance) return '';
  return [
    KNOWLEDGE_QUALITY_HEADING,
    '',
    'This attachment does not change research, retrieval, hats, archive search, citation format, or structured jobs.',
    'Keep [Title](pageId) citations exact. Never invent a page or URL.',
    'Keep required synthesis structure when the hat asks for it: central claim, theme clusters, source counts, limitations table, markdown note links.',
    'Do not refuse a question as the wrong office.',
    'If this turn requires JSON only, ignore the Humanizer skill and return the JSON contract unchanged.',
    '',
    guidance
  ].join('\n');
}
