import { describe, expect, it } from 'vitest';
import tableJson from '@/data/literary-elements.json';
import type { LiteraryElementsTable } from '@/blocks/literary-elements';
import {
  approveTechniques,
  confidenceTier,
  createTechniqueScan,
  foundTechniqueIds,
  normaliseTechniqueFindings,
  quotesForTechnique,
  readTechniqueScan,
  resolveTechnique,
  spinnerTechniques
} from '@/blocks/technique-scan';

const table = tableJson as unknown as LiteraryElementsTable;

const serverFindings = [
  {
    quote: 'clear and sunny',
    techniques: [
      { technique: 'Visual Imagery', confidence: 82, explanation: 'Plain sight detail.' },
      { technique: 'foreshadowing', confidence: 35, explanation: 'Too bright.' },
      { technique: 'Identity Assertion', confidence: 90, explanation: 'Not a table entry.' }
    ]
  },
  { quote: 'of course', techniques: [{ technique: 'Understatement', confidence: 55, explanation: 'Casual.' }] },
  { quote: 'the lottery', techniques: [{ technique: 'Foreshadowing', confidence: 74, explanation: 'The title.' }] }
];

describe('technique scan', () => {
  it('maps names onto table ids and drops names the table does not have', () => {
    expect(resolveTechnique(table, 'visual imagery')?.id).toBe('visual-imagery');
    expect(resolveTechnique(table, 'Identity Assertion')).toBeUndefined();
    const findings = normaliseTechniqueFindings(serverFindings, table);
    expect(findings[0].techniques.map((hit) => hit.id)).toEqual(['visual-imagery', 'foreshadowing']);
    expect(normaliseTechniqueFindings('nope', table)).toEqual([]);
  });

  it('lists each found technique once, strongest first', () => {
    const findings = normaliseTechniqueFindings(serverFindings, table);
    expect(foundTechniqueIds(findings)).toEqual(['visual-imagery', 'foreshadowing', 'understatement']);
    expect(quotesForTechnique(createTechniqueScan(findings), 'foreshadowing')).toEqual(['clear and sunny', 'the lottery']);
  });

  it('gives students nothing until the teacher approves, then only what was approved', () => {
    const findings = normaliseTechniqueFindings(serverFindings, table);
    const scan = createTechniqueScan(findings, new Date('2026-10-17T09:00:00Z'));
    const block = { settings: { technique_scan: scan } };
    expect(spinnerTechniques(block, table)).toEqual([]);

    const approved = approveTechniques(scan, ['understatement', 'foreshadowing', 'simile'], new Date('2026-10-17T09:05:00Z'));
    expect(approved.approved_ids).toEqual(['foreshadowing', 'understatement']);
    expect(approved.approved_at).toBe('2026-10-17T09:05:00.000Z');
    const saved = JSON.parse(JSON.stringify({ settings: { technique_scan: approved } }));
    expect(spinnerTechniques(saved, table).map((tech) => tech.name)).toEqual(['Foreshadowing', 'Understatement']);
  });

  it('reads a saved scan defensively', () => {
    expect(readTechniqueScan({}, table)).toBeNull();
    const tampered = {
      settings: {
        technique_scan: {
          findings: [{ quote: 'of course', techniques: [{ id: 'understatement', confidence: 55, explanation: '' }] }],
          scanned_at: '2026-10-17T09:00:00.000Z',
          approved_ids: ['understatement', 'metaphor', 7]
        }
      }
    };
    expect(readTechniqueScan(tampered, table)?.approved_ids).toEqual(['understatement']);
  });

  it('names confidence tiers like the widget', () => {
    expect([confidenceTier(85), confidenceTier(50), confidenceTier(25)]).toEqual(['Likely', 'Possible', 'Worth considering']);
  });
});
