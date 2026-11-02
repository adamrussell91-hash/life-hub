import { describe, expect, it } from 'vitest';
import { evidenceStepOf, passChecks, piecesTaught, targetPieces, withEvidenceStep, withPassChecks, withPiecesTaught, withTargetPieces } from '@/deep/block-tags';
import { filterBlocksForStudent } from '@/blocks/visibility';

const block = { id: 'b1', block_type: 'rich_text', visibility: 'all', content: { html: '<p>x</p>' }, settings: { walkthru: 'w1-cold-calling' } } as never;

describe('deep understanding block tags', () => {
  it('round-trips taught pieces, the evidence step and target pieces', () => {
    let b = withPiecesTaught(block, ['kp_aa11bb', 'kp_aa11bb', 'kp_cc22dd']);
    b = withEvidenceStep(b, { du: 'du_ab12cd', step: '2a' });
    b = withTargetPieces(b, ['kp_cc22dd']);
    expect(piecesTaught(b)).toEqual(['kp_aa11bb', 'kp_cc22dd']);
    expect(evidenceStepOf(b)).toEqual({ du: 'du_ab12cd', step: '2a' });
    expect(targetPieces(b)).toEqual(['kp_cc22dd']);
    expect(piecesTaught(withPiecesTaught(b, []))).toEqual([]);
    expect(evidenceStepOf(withEvidenceStep(b, null))).toBeNull();
  });
  it('keeps a pass checklist of trimmed, non-empty lines', () => {
    const b = withPassChecks(block, ['  Names two texts ', '', 'Says what each does differently']);
    expect(passChecks(b)).toEqual(['Names two texts', 'Says what each does differently']);
    expect(passChecks(withPassChecks(b, ['', ' ']))).toEqual([]);
    expect(passChecks(withPassChecks(block, Array.from({ length: 9 }, (_, i) => `line ${i}`)))).toHaveLength(6);
  });
  it('ignores junk', () => {
    expect(piecesTaught({ settings: { deep_taught: ['nope', 3] } } as never)).toEqual([]);
    expect(evidenceStepOf({ settings: { deep_step: { du: 'x', step: '9' } } } as never)).toBeNull();
  });
  it('students never get the fields', () => {
    const tagged = withPassChecks(withTargetPieces(withEvidenceStep(withPiecesTaught(block, ['kp_aa11bb']), { du: 'du_ab12cd', step: '3' }), ['kp_aa11bb']), ['Names two texts']);
    const [out] = filterBlocksForStudent([tagged]) as Array<{ settings?: Record<string, unknown> }>;
    expect(out!.settings ?? {}).toEqual({});
  });
});
