import { describe, expect, it } from 'vitest';
import { knowledgeBadge } from '@/blocks/anthology-view';
import type { KnowledgeItem } from '@/blocks/anthology-knowledge';

const item = (extra: Partial<KnowledgeItem> = {}): KnowledgeItem => ({
  id: 'k1',
  title: 'An invented card',
  quote: 'An invented line.',
  info: 'An invented fact.',
  themes: ['Hope and growth'],
  concepts: [],
  created_at: '2026-11-09T00:00:00.000Z',
  ...extra
});

describe('class additions on the Anthology map', () => {
  it('shows the teacher the writer’s initials', () => {
    expect(knowledgeBadge(item({ initials: 'XY', symbol: '1-2' }), true, document.body)).toEqual({ text: 'XY' });
  });

  it('shows students the writer’s token, never initials', () => {
    const badge = knowledgeBadge(item({ symbol: '1-2' }), false, document.body);
    expect(badge && 'path' in badge).toBe(true);
    expect(badge && 'text' in badge).toBe(false);
  });

  it('falls back to a plain ring without a token', () => {
    expect(knowledgeBadge(item(), false, document.body)).toBeNull();
  });
});
