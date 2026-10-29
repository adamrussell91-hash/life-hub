import { describe, expect, it } from 'vitest';
import { caseIssues, newDoc, newOption, newPart, publishChecklist, seedCase } from '@/case-study/model';
import type { CaseSettings } from '@/case-study/schema';

const doc = { id: 'd1', kind: 'memo' as const, title: 'Memo', source: '', text: 'Body' };

/** A case that passes every publish rule, teacher pace. */
function complete(): CaseSettings {
  return {
    purpose: 'spot a slow-building risk',
    outcomes: [],
    flow: 'A',
    pace: 'teacher',
    support: 'standard',
    release: 'whole',
    parts: [{ id: 'p1', title: 'Part 1', docs: [doc] }],
    decision: { prompt: 'What do you do?', options: [{ id: 'o1', label: 'A' }, { id: 'o2', label: 'B' }] },
    outcome: { text: 'It rained late.', source: 'Authority report' },
    objections: [],
    transfer: { title: 'Another valley', docs: [{ ...doc, id: 'd2' }], question: 'What would you do?' }
  };
}

describe('caseIssues', () => {
  it('passes a complete case', () => {
    expect(caseIssues({ case: complete() })).toEqual([]);
  });

  it('blocks a missing purpose, decision and outcome source', () => {
    const c = complete();
    c.purpose = ' ';
    c.decision = { prompt: '', options: [] };
    c.outcome = { text: 'Happened', source: '' };
    const issues = caseIssues({ case: c }).join('|');
    expect(issues).toMatch(/able to do/);
    expect(issues).toMatch(/decision question/);
    expect(issues).toMatch(/needs a source/);
  });

  it('needs 2 to 4 options when guided', () => {
    const c = { ...complete(), support: 'guided' as const, decision: { prompt: 'Q', options: [{ id: 'o1', label: 'A' }] } };
    expect(caseIssues({ case: c })).toContain('A guided case needs 2 to 4 options.');
  });

  it('treats objections as optional at their own pace', () => {
    const c = { ...complete(), pace: 'own' as const };
    expect(caseIssues({ case: c })).toEqual([]);
    expect(caseIssues({ case: { ...c, objections: ['Why me first?'] } })).toEqual([]);
  });

  it('needs a question on every part but the last when layered', () => {
    const c = { ...complete(), release: 'layered' as const, parts: [{ id: 'p1', title: 'One', docs: [doc] }, { id: 'p2', title: 'Two', docs: [{ ...doc, id: 'd3' }] }] };
    expect(caseIssues({ case: c }).some((m) => /question on every part/.test(m))).toBe(true);
    c.parts[0]!.docs = [doc];
    expect(caseIssues({ case: { ...c, parts: [{ ...c.parts[0]!, question: 'Biggest risk?' }, c.parts[1]!] } })).toEqual([]);
  });

  it('needs the unseen case written', () => {
    const c = complete();
    delete c.transfer;
    expect(caseIssues({ case: c }).some((m) => /unseen case/.test(m))).toBe(true);
  });
});

describe('seedCase', () => {
  it('maps route role to support and pace', () => {
    expect(seedCase({ route_role: 'support' }).support).toBe('guided');
    expect(seedCase({ route_role: 'support' }).decision?.options).toHaveLength(2);
    expect(seedCase({ route_role: 'extension' }).support).toBe('open');
    expect(seedCase({ route_role: 'core' })).toMatchObject({ support: 'standard', pace: 'teacher' });
    expect(seedCase({ route_role: 'optional' }).pace).toBe('own');
    expect(seedCase({}, 'own').pace).toBe('own');
  });

  it('hands out ids that stay unique', () => {
    const c = seedCase({});
    const part = newPart(c);
    expect(part.id).not.toBe(c.parts[0]!.id);
    expect(part.docs[0]!.id).not.toBe(c.parts[0]!.docs[0]!.id);
    const withOne = { ...c, decision: { prompt: '', options: [newOption(c)] } };
    expect(newOption(withOne).id).not.toBe(withOne.decision.options[0]!.id);
    expect(newDoc(c, 'data').kind).toBe('data');
  });
});

describe('publishChecklist', () => {
  it('lists what is missing and marks a complete case ok', () => {
    expect(publishChecklist(seedCase({})).some((i) => !i.ok)).toBe(true);
    expect(publishChecklist(complete()).every((i) => i.ok)).toBe(true);
  });
  it('adds a part question for layered, and no objection item for own pace', () => {
    const labels = publishChecklist({ ...complete(), pace: 'own', release: 'layered' }).map((i) => i.label);
    expect(labels.some((l) => /objection/.test(l))).toBe(false);
    expect(labels).toContain('A question on every part but the last');
  });
});
