import { describe, expect, it } from 'vitest';
import { guessChannel, homeNudges, nextWalkIn, quickLogBody } from '@/lib/walk-in';

const now = new Date('2026-10-13T21:31:00.000Z'); // Wed 14/10 8:31 am Sydney

describe('nextWalkIn', () => {
  it('picks the soonest comm or meeting starting within 10 minutes, or already running under 15', () => {
    const items = [
      { kind: 'comm' as const, id: 'c1', title: 'Fletcher W. · session 8', start: '2026-10-13T21:40:00.000Z', href: '#/communication/c1' },
      { kind: 'meeting' as const, id: 'm1', title: 'Nina · gifted audit', start: '2026-10-13T23:20:00.000Z', href: '#/meeting/m1' }
    ];
    expect(nextWalkIn(items, now)?.id).toBe('c1');
    expect(nextWalkIn(items, now)?.minutes).toBe(9);
    expect(nextWalkIn(items, new Date('2026-10-13T21:20:00.000Z'))).toBeNull();
    expect(nextWalkIn(items, new Date('2026-10-13T21:50:00.000Z'))?.minutes).toBe(-10);
  });
});

describe('homeNudges', () => {
  it('orders late promises, wrap-ups and quiet threads, at most 5', () => {
    const nudges = homeNudges({
      late: [{ text: 'Email Denielle J.', days_late: 3, href: '#/communication/c0' }],
      wrapUps: [{ title: 'Declan J. + Denielle', href: '#/communication/c2' }],
      quiet: [{ title: 'Kathleen E. · enrichment', days: 9, href: '#/thread/t1' }]
    });
    expect(nudges.map((nudge) => nudge.text)).toEqual([
      'Email Denielle J. · 3 days late',
      'Wrap up Declan J. + Denielle',
      'Kathleen E. · enrichment has been quiet for 9 days'
    ]);
  });
});

describe('guessChannel', () => {
  it('in person during school hours on a weekday, otherwise a text', () => {
    expect(guessChannel(new Date('2026-10-14T02:47:00.000Z'))).toBe('in_person'); // Wed 12:47
    expect(guessChannel(new Date('2026-10-14T09:00:00.000Z'))).toBe('message'); // Wed 8 pm
    expect(guessChannel(new Date('2026-10-17T02:00:00.000Z'))).toBe('message'); // Sat
  });
});

describe('quickLogBody', () => {
  it('builds a logged comm with the person as recipient and pulls out »me', () => {
    const body = quickLogBody({
      personRef: 'shared:person:p_declan', channel: 'in_person',
      line: 'Chat after period 4: essay plan fine, needs a quote bank. »me send quote bank by Thu',
      at: new Date('2026-10-14T02:47:00.000Z')
    });
    expect(body.communication).toEqual({
      direction: 'outbound', channel: 'in_person', occurred_at: '2026-10-14T02:47:00.000Z',
      subject: 'Chat after period 4: essay plan fine, needs a quote bank.',
      summary: 'Chat after period 4: essay plan fine, needs a quote bank. »me send quote bank by Thu',
      links: [{ relationship_type: 'recipient', target_ref: 'shared:person:p_declan' }]
    });
    expect(body.promises).toEqual([{ direction: 'you_owe', person_ref: 'shared:person:p_declan', text: 'send quote bank by Thu' }]);
  });
});
