import { describe, expect, it } from 'vitest';
import { expandTags, kindOf, tagLabel, payloadEvidence } from '@/evidence/tags';
import type { Evidence, InsightPayload } from '@/evidence/types';
import type { LiteraryElementsTable } from '@/blocks/literary-elements';

const table = {
  version: '1', source: 't',
  families: [{ key: 'Comparative', name: 'Comparative', colour: '#000' }],
  subgroups: [{ id: 'comparative-figurative', family: 'Comparative', name: 'Figurative', definition: '' }],
  techniques: [
    { id: 'simile', symbol: 'Si', name: 'Simile', subgroup: 'comparative-figurative', definition: '', effect: '', example: '', related: [] },
    { id: 'metaphor', symbol: 'Me', name: 'Metaphor', subgroup: 'comparative-figurative', definition: '', effect: '', example: '', related: [] }
  ]
} as unknown as LiteraryElementsTable;
const ev = (tags: string[], why: Evidence['why'] = []): Evidence => ({ item: 'q1', tags, share: 0, why, student: 's1', source: 'quiz:l1', date: '2026-10-20', confidence: null });

describe('tags', () => {
  it('kindOf reads the prefix', () => {
    expect(kindOf('tech:simile')).toBe('tech');
    expect(kindOf('fam:Comparative')).toBe('fam');
    expect(kindOf('nope')).toBe(null);
  });
  it('resolves name tags and adds the family, also inside whys', () => {
    const [e] = expandTags([ev(['tech:~simile', 'out:X'], [{ type: 'named', as: 'tech:~metaphor', target: 'tech:~simile' }])], table);
    expect(e.tags.sort()).toEqual(['fam:Comparative', 'out:X', 'tech:simile']);
    expect(e.why).toEqual([{ type: 'named', as: 'tech:metaphor', target: 'tech:simile' }]);
  });
  it('leaves unknown names as name tags', () => {
    const [e] = expandTags([ev(['tech:~zeugma'])], table);
    expect(e.tags).toEqual(['tech:~zeugma']);
  });
  it('labels each kind', () => {
    const ctx = { table, outcomes: [{ id: 'X', code: 'EN5-RVL-01', title: 'Reads', group: 'g' }], skills: null };
    expect(tagLabel('tech:simile', ctx)).toBe('Simile');
    expect(tagLabel('tech:~zeugma', ctx)).toBe('Zeugma');
    expect(tagLabel('fam:Comparative', ctx)).toBe('Comparative');
    expect(tagLabel('out:X', ctx)).toBe('EN5-RVL-01');
    expect(tagLabel('skill:reading.inference', ctx)).toBe('reading.inference');
  });
  it('payloadEvidence places each item', () => {
    const p = {
      lesson_id: 'l1',
      attempts: [{ student: 's1', attempt_id: 'a', submitted_at: '2026-10-20T01:00:00Z', score: 0, max: 1, pending: 0, rows: [{ id: 'q1', awarded: 0, max: 1, confidence: 3, codes: [], outcomes: [], items: [{ item: 'q1', tags: ['tech:simile'], share: 0, why: [] }] }] }]
    } as unknown as InsightPayload;
    expect(payloadEvidence(p)).toEqual([{ item: 'q1', tags: ['tech:simile'], share: 0, why: [], student: 's1', source: 'quiz:l1', date: '2026-10-20', confidence: 3 }]);
  });
});
