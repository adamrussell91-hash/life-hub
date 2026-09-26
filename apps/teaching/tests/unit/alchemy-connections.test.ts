import { describe, expect, it } from 'vitest';
import { knowledgeHubPageUrl, parseAlchemyResult } from '@/alchemy/connections';

describe('parseAlchemyResult', () => {
  it('keeps valid connections and slices to five', () => {
    const connections = Array.from({ length: 6 }, (_, i) => ({
      sourcePageId: `p${i}`,
      summary: `S${i}`,
      icon: 'Irony'
    }));
    const result = parseAlchemyResult({ mode: 'synthesis', connections: [...connections, { nope: true }] });
    expect(result.mode).toBe('synthesis');
    expect(result.connections).toHaveLength(5);
    expect(result.connections[0]?.sourcePageId).toBe('p0');
  });
});

describe('knowledgeHubPageUrl', () => {
  it('builds a #page/ deep link under the umbrella Knowledge base', () => {
    expect(knowledgeHubPageUrl('https://life-hub.adam-russell.com/knowledge/', 'note_1')).toBe(
      'https://life-hub.adam-russell.com/knowledge/#page/note_1'
    );
  });
});
