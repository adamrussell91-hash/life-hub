// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  CURRENT_HAIKU_MODEL,
  CURRENT_OPUS_MODEL,
  CURRENT_SONNET_MODEL,
  DEFAULT_ANTHROPIC_MODEL,
  isRetiredAnthropicModel,
  resolveAnthropicModel,
  RETIRED_ANTHROPIC_MODELS
} from '@/ai/models';

describe('resolveAnthropicModel', () => {
  it('rewrites the Sonnet 4 id that broke live chat', () => {
    expect(resolveAnthropicModel('claude-sonnet-4-20250514')).toBe(CURRENT_SONNET_MODEL);
  });

  it('keeps a retired model within its own family', () => {
    expect(resolveAnthropicModel('claude-opus-4-1-20250805')).toBe(CURRENT_OPUS_MODEL);
    expect(resolveAnthropicModel('claude-3-5-haiku-20241022')).toBe(CURRENT_HAIKU_MODEL);
    expect(resolveAnthropicModel('claude-3-7-sonnet-20250219')).toBe(CURRENT_SONNET_MODEL);
  });

  it('rewrites bare family aliases a teacher may have typed', () => {
    expect(resolveAnthropicModel('claude-3-5-sonnet')).toBe(CURRENT_SONNET_MODEL);
    expect(resolveAnthropicModel('  claude-3-opus  ')).toBe(CURRENT_OPUS_MODEL);
  });

  it('leaves active models alone', () => {
    for (const active of [
      CURRENT_SONNET_MODEL,
      CURRENT_OPUS_MODEL,
      CURRENT_HAIKU_MODEL,
      'claude-sonnet-4-5-20250929',
      'claude-opus-4-5-20251101'
    ]) {
      expect(resolveAnthropicModel(active)).toBe(active);
    }
  });

  it('passes through ids newer than this list', () => {
    expect(resolveAnthropicModel('claude-sonnet-9-20301201')).toBe('claude-sonnet-9-20301201');
  });

  it('falls back to the default when nothing is asked for', () => {
    expect(resolveAnthropicModel('')).toBe(DEFAULT_ANTHROPIC_MODEL);
    expect(resolveAnthropicModel('   ')).toBe(DEFAULT_ANTHROPIC_MODEL);
    expect(resolveAnthropicModel(undefined)).toBe(DEFAULT_ANTHROPIC_MODEL);
    expect(resolveAnthropicModel(null)).toBe(DEFAULT_ANTHROPIC_MODEL);
  });

  it('never rewrites one retired id into another', () => {
    for (const replacement of Object.values(RETIRED_ANTHROPIC_MODELS)) {
      expect(isRetiredAnthropicModel(replacement)).toBe(false);
    }
  });
});
