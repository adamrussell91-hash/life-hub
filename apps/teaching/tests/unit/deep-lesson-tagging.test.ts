import { describe, expect, it, vi } from 'vitest';
import { setUnitDeep, unitDeep } from '@/deep/context';
import { deepBlockLine, deepMenuItems } from '@/deep/block-menu';
import { piecesTaught } from '@/deep/block-tags';

const du = { id: 'du_ab12cd', claim: 'c', why: '', dot_points: ['a:U1'], concept_bullets: ['ARG1'], pieces: [{ id: 'kp_aa11bb', text: 'Piece one', tier: 'essential' as const }], shared_piece_ids: [], steps: [] };
const block = { id: 'b1', block_type: 'rich_text', visibility: 'all', content: {}, settings: {} } as never;

describe('tagging from the lesson', () => {
  it('holds the open lesson’s unit pieces', () => {
    setUnitDeep([du]);
    expect(unitDeep().map((d) => d.id)).toEqual(['du_ab12cd']);
    setUnitDeep([]);
    expect(unitDeep()).toEqual([]);
  });
  it('offers one menu item when the unit has deep understandings, none otherwise', () => {
    expect(deepMenuItems(block, [], vi.fn())).toEqual([]);
    const items = deepMenuItems(block, [du], vi.fn());
    expect(items).toHaveLength(1);
    expect(items[0]!.label).toBe('Deep understanding…');
  });
  it('the sheet’s apply writes taught pieces', async () => {
    const onChange = vi.fn();
    const items = deepMenuItems(block, [du], onChange, { ask: async () => ({ taught: ['kp_aa11bb'], step: null, targets: [] }) });
    await items[0]!.onSelect();
    expect(piecesTaught(onChange.mock.calls[0]![0])).toEqual(['kp_aa11bb']);
  });
  it('words the quiet line from the tags', () => {
    const tagged = { ...(block as object), settings: { deep_taught: ['kp_aa11bb'], deep_step: { du: 'du_ab12cd', step: '2a' } } } as never;
    expect(deepBlockLine(tagged, [du])).toBe('Teaches 1 piece · Evidence for DU 1 Step 2A');
    expect(deepBlockLine(block, [du])).toBe('');
  });
});
