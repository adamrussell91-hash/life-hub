import { describe, expect, it } from 'vitest';
import { readReadingReply, readingPrompt, type ReadingQuestion } from '@/ai/voice-read-jobs';
import { findQuoteWords } from '@/blocks/voice-marking';

const q: ReadingQuestion = { prompt: 'Why a road?', checks: ['Names two poems', 'Links form to meaning'], pieces: [{ ref: 'p1', text: 'Form acts out meaning' }] };
const sent = [{ id: 't1', text: 'The road keeps going.' }, { id: 't2', text: 'I am not sure.' }];
const reply = (reads: unknown) => JSON.stringify({ reads });

describe('reading a viva take', () => {
  it('sends the question, checks and pieces with opaque take ids', () => {
    const prompt = readingPrompt(q, sent);
    expect(prompt).toContain('1. Names two poems');
    expect(prompt).toContain('p1: Form acts out meaning');
    expect(prompt).toContain('{"id":"t1"');
  });

  it('keeps a quote when a check is met and a why when it is missed', () => {
    const [read] = readReadingReply(reply([{ id: 't1', checks: [{ n: 1, met: true, quote: 'The road', why: 'ignored' }, { n: 2, met: false, quote: 'ignored', why: 'No link made.' }], pieces: { p1: true } }]), q, sent, 'm');
    expect(read).toEqual({ id: 't1', checks: [{ met: true, quote: 'The road' }, { met: false, why: 'No link made.' }], pieces: { p1: true }, model: 'm' });
  });

  it('drops takes it never sent, repeats, and reads that skip a check or piece', () => {
    const whole = { checks: [{ n: 1, met: true }, { n: 2, met: false }], pieces: { p1: false } };
    const reads = readReadingReply(reply([
      { id: 't9', ...whole },
      { id: 't1', ...whole },
      { id: 't1', ...whole, pieces: { p1: true } },
      { id: 't2', ...whole, checks: [{ n: 1, met: true }] }
    ]), q, sent, 'm');
    expect(reads.map((r) => [r.id, r.pieces.p1])).toEqual([['t1', false]]);
    expect(readReadingReply('not json', q, sent, 'm')).toEqual([]);
  });

  it('finds a quote in the spoken words, ignoring case and punctuation', () => {
    const words = ['The', 'road,', 'keeps', 'going.'].map((w, i) => ({ w, s: i, e: i + 1 }));
    expect(findQuoteWords(words as never, 'road keeps')).toEqual([1, 2]);
    expect(findQuoteWords(words as never, 'keeps road')).toBeNull();
    expect(findQuoteWords(words as never, '  ')).toBeNull();
  });
});
