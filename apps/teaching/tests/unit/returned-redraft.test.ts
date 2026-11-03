import { describe, expect, it, vi } from 'vitest';
import { pieceView, returnedList, type PiecePayload } from '@/student/returned-view';

const piece = (over: Partial<PiecePayload> = {}): PiecePayload => ({
  id: 'w:l1:b1', kind: 'written', title: 'Harbour', date: '3 Nov', comment: 'Well found.',
  text: { answers: { q1: 'Latest words.' } }, tags: [],
  criteria: [{ label: 'Analysis', step: 'secure' as never, was: null, first: 'building' as never }],
  ...over
});
const api = () => ({ load: vi.fn().mockResolvedValue({ scope: 'whole', text: { answers: { q1: 'Latest words.' } }, prompts: {}, working: {} }), save: vi.fn(), send: vi.fn() });

describe('returned piece with drafts', () => {
  it('names the first step when a redraft moved it', () => {
    expect(pieceView(piece(), () => undefined).textContent).toContain('Building, then Secure after redraft');
  });
  it('flips between drafts', () => {
    const root = pieceView(piece({ draft: 2, drafts: [{ n: 1, text: { answers: { q1: 'Old words.' } }, tags: [], comment: 'Earlier note.', date: '1 Nov' }] }), () => undefined);
    expect(root.textContent).toContain('Latest words.');
    [...root.querySelectorAll<HTMLElement>('.pg-draft-pill')].find((b) => b.textContent === 'Draft 1')!.click();
    expect(root.textContent).toContain('Old words.');
    expect(root.textContent).toContain('Earlier note.');
  });
  it('an ask opens the editor when the student can act on it', () => {
    const root = pieceView(piece({ redraft: { scope: 'whole' } }), () => undefined, { redraft: api(), onSent: () => undefined });
    expect(root.querySelector('.pg-ask')!.textContent).toBe('Your teacher asked for a redraft of this piece.');
    expect(root.querySelector('.pg-redraft')).not.toBeNull();
  });
  it('an ask is only a note in the teacher view', () => {
    const root = pieceView(piece({ redraft: { scope: { part: 'answers', field: 'q1', start: 0, end: 3 } } }), () => undefined);
    expect(root.querySelector('.pg-ask')!.textContent).toBe('Your teacher asked for a redraft of one section.');
    expect(root.querySelector('.pg-redraft')).toBeNull();
  });
  it('a sent redraft says so', () => {
    expect(pieceView(piece({ sent: true }), () => undefined).querySelector('.pg-ask')!.textContent).toBe('Sent. Your teacher has it.');
  });
});

describe('returned list', () => {
  it('flags an ask until it is sent', () => {
    const box = returnedList([{ id: 'w:l:b', kind: 'written', title: 'Harbour', date: '3 Nov', new: false, redraft: 'asked' }] as never, () => undefined);
    expect(box.querySelector('.pg-returned__ask')!.textContent).toBe('Redraft asked');
  });
});
