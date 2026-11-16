import { describe, expect, it } from 'vitest';
import { formatTalkLength, parseTalkLength, talkLengthInputValue } from '@/lib/talk-length';

describe('talk length', () => {
  it('reads hours, minutes and clock lengths', () => {
    expect(parseTalkLength('')).toBeNull();
    expect(parseTalkLength('0.2')).toBe(0.2);
    expect(parseTalkLength('.5')).toBe(0.5);
    expect(parseTalkLength('0,75')).toBe(0.75);
    expect(parseTalkLength('2')).toBe(2);
    expect(parseTalkLength('1.5h')).toBe(1.5);
    expect(parseTalkLength('20m')).toBe(0.33);
    expect(parseTalkLength('45 min')).toBe(0.75);
    expect(parseTalkLength('90 mins')).toBe(1.5);
    expect(parseTalkLength('1h 30m')).toBe(1.5);
    expect(parseTalkLength('1:30')).toBe(1.5);
  });

  it('rejects text it cannot read and lengths over a day', () => {
    expect(parseTalkLength('soon')).toBeUndefined();
    expect(parseTalkLength('25')).toBeUndefined();
    expect(parseTalkLength('-1')).toBeUndefined();
  });

  it('shows short lengths in minutes', () => {
    expect(formatTalkLength(0.2)).toBe('12 min');
    expect(formatTalkLength(1.5)).toBe('1.5 h');
    expect(talkLengthInputValue(0.25)).toBe('15m');
    expect(talkLengthInputValue(2)).toBe('2h');
    expect(talkLengthInputValue(null)).toBe('');
  });
});
