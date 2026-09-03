/**
 * Anthropic retires models on a published schedule, but a lesson keeps whatever
 * model id it was saved with. Sonnet 4 retiring took the whole chat panel down;
 * rewriting retired ids at request time stops a stored id doing that again.
 *
 * Retirements and replacements: https://platform.claude.com/docs/en/about-claude/model-deprecations
 * Reviewed 16 August 2026.
 */

export const CURRENT_SONNET_MODEL = 'claude-sonnet-4-6';
export const CURRENT_OPUS_MODEL = 'claude-opus-4-8';
export const CURRENT_HAIKU_MODEL = 'claude-haiku-4-5-20251001';

/** Model used when a caller sends nothing. */
export const DEFAULT_ANTHROPIC_MODEL = CURRENT_SONNET_MODEL;

/**
 * Retired ids mapped to Anthropic's recommended replacement, plus the bare
 * family aliases, because the html_app lane takes a model as free text and a
 * teacher may have typed `claude-3-5-sonnet` rather than a dated id.
 */
export const RETIRED_ANTHROPIC_MODELS: Readonly<Record<string, string>> = {
  'claude-sonnet-4-20250514': CURRENT_SONNET_MODEL,
  'claude-sonnet-4': CURRENT_SONNET_MODEL,
  'claude-3-7-sonnet-20250219': CURRENT_SONNET_MODEL,
  'claude-3-7-sonnet': CURRENT_SONNET_MODEL,
  'claude-3-5-sonnet-20241022': CURRENT_SONNET_MODEL,
  'claude-3-5-sonnet-20240620': CURRENT_SONNET_MODEL,
  'claude-3-5-sonnet': CURRENT_SONNET_MODEL,
  'claude-3-sonnet-20240229': CURRENT_SONNET_MODEL,
  'claude-3-sonnet': CURRENT_SONNET_MODEL,

  'claude-opus-4-1-20250805': CURRENT_OPUS_MODEL,
  'claude-opus-4-1': CURRENT_OPUS_MODEL,
  'claude-opus-4-20250514': CURRENT_OPUS_MODEL,
  'claude-opus-4': CURRENT_OPUS_MODEL,
  'claude-3-opus-20240229': CURRENT_OPUS_MODEL,
  'claude-3-opus': CURRENT_OPUS_MODEL,
  'claude-2.0': CURRENT_OPUS_MODEL,
  'claude-2.1': CURRENT_OPUS_MODEL,

  'claude-3-5-haiku-20241022': CURRENT_HAIKU_MODEL,
  'claude-3-5-haiku': CURRENT_HAIKU_MODEL,
  'claude-3-haiku-20240307': CURRENT_HAIKU_MODEL,
  'claude-3-haiku': CURRENT_HAIKU_MODEL,
  'claude-1.0': CURRENT_HAIKU_MODEL,
  'claude-1.1': CURRENT_HAIKU_MODEL,
  'claude-1.2': CURRENT_HAIKU_MODEL,
  'claude-1.3': CURRENT_HAIKU_MODEL,
  'claude-instant-1.0': CURRENT_HAIKU_MODEL,
  'claude-instant-1.1': CURRENT_HAIKU_MODEL,
  'claude-instant-1.2': CURRENT_HAIKU_MODEL
};

/**
 * Unknown ids pass through untouched so a model Anthropic ships after this list
 * was written still works without a deploy.
 */
export function resolveAnthropicModel(model?: string | null): string {
  const requested = typeof model === 'string' ? model.trim() : '';
  if (!requested) return DEFAULT_ANTHROPIC_MODEL;
  return RETIRED_ANTHROPIC_MODELS[requested] ?? requested;
}

/** True when the id would be rewritten, for logging and editor hints. */
export function isRetiredAnthropicModel(model?: string | null): boolean {
  const requested = typeof model === 'string' ? model.trim() : '';
  return requested.length > 0 && requested in RETIRED_ANTHROPIC_MODELS;
}
