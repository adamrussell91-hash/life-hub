import { afterEach, describe, expect, it, vi } from 'vitest';
import { openCheckInPanel } from '@/guides/check-in/panel';
import { renderCheckInCard } from '@/guides/check-in/card';
import { checkInTimelinePoints, draftSaid, forHandover, hasContent, newCheckIn, newFollowUps, reportMayBeNeeded } from '@/guides/check-in/model';
import { openGuidePanel } from '@/guides/guide-panel';
import { GUIDES } from '@/guides/registry';
import type { CheckInRecord, CheckInText } from '@/guides/check-in/types';

// Filler wording and an invented student. The real text lives in the private data repo.
const TEXT: CheckInText = {
  version: 1,
  steps: (['open', 'safety', 'listen', 'hope', 'help'] as const).map((id) => ({
    id, title: id[0]!.toUpperCase() + id.slice(1), ask: `Lorem ${id}`, say: ['Lorem say'], listen: id === 'safety' ? ['Lorem listen'] : [],
    ...(id === 'help' ? { chips: [{ label: 'Lorem group', items: ['Lorem A', 'Lorem B'] }] } : {})
  })),
  sides: [
    { id: 'side-one', label: 'Lorem side one', ask: 'Lorem ask one', steps: ['Lorem step'], report: true },
    { id: 'side-two', label: 'Lorem side two', ask: 'Lorem ask two', steps: ['Lorem step'], report: false }
  ],
  safety: { title: 'Lorem safety title', steps: ['Lorem stay'], contacts: [{ role: 'Lorem lead', how: 'ext 1' }] },
  follow_ups: ['Lorem follow-up'],
  sources: []
};
const MEETING = 'meeting_00000000-0000-4000-8000-000000000001';
const who = [{ ref: 'shared:person:p_sam', name: 'Sam Okafor' }];
const flush = () => new Promise((r) => setTimeout(r, 0));
const live = (selector: string) => document.querySelector<HTMLElement>(`.ci-screen:not(.is-leaving) ${selector}`);
const click = (selector: string) => {
  // The live screen first; head, pills and sheets sit outside the stage.
  const target = live(`[data-part="${selector}"]`)
    ?? [...document.querySelectorAll<HTMLElement>(`.ci-panel [data-part="${selector}"]`)].find((n) => !n.closest('.ci-stage'));
  if (!target) throw new Error(`missing ${selector}`);
  target.click();
};
const screenName = () => document.querySelector<HTMLElement>('.ci-screen:not(.is-leaving)')?.dataset.screen;

async function open(extra: Partial<Parameters<typeof openCheckInPanel>[1]> = {}) {
  const onSave = vi.fn(async () => undefined);
  const handle = openCheckInPanel(document, {
    meetingId: MEETING, about: who, onSave, loadText: async () => TEXT,
    now: () => '2026-11-02T01:00:00.000Z', newId: () => 'checkin_test-0001', ...extra
  });
  await flush();
  return { handle, onSave };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('check-in model', () => {
  const base = () => newCheckIn({ id: 'checkin_test-0001', meetingId: MEETING, personRef: 'r', personName: 'Sam', now: 'x' });
  it('drafts what was said from the step lines, once', () => {
    const r = { ...base(), lines: { listen: 'Second', open: 'First' } };
    expect(draftSaid(r)).toBe('First\nSecond');
    expect(forHandover(r).said).toBe('First\nSecond');
    expect(forHandover({ ...r, said: 'Mine' }).said).toBe('Mine');
  });
  it('knows when a report may be needed, what is new, and whether there is anything to lose', () => {
    expect(reportMayBeNeeded({ ...base(), sides: ['side-two'] }, TEXT)).toBe(false);
    expect(reportMayBeNeeded({ ...base(), sides: ['side-one'] }, TEXT)).toBe(true);
    expect(newFollowUps(['a'], ['a', 'b'])).toEqual(['b']);
    expect(hasContent(base())).toBe(false);
    expect(hasContent({ ...base(), lines: { open: ' x ' } })).toBe(true);
  });
  it('timeline markers carry no content', () => {
    const [point] = checkInTimelinePoints([{ id: 'checkin_test-0001', meeting_id: MEETING, person_ref: 'r', person_name: 'Sam', created_at: 'a', updated_at: 'a' }]);
    expect(point).toEqual({ id: 'check_in_checkin_test-0001', at: 'a', label: 'Check-in · see meeting' });
  });
});

describe('check-in panel', () => {
  it('walks the steps, opens a side card, and saves a handover', async () => {
    const { onSave } = await open();
    expect(screenName()).toBe('step-open');
    expect(document.querySelectorAll('.ci-pill').length).toBe(5);
    expect(document.querySelector('.ci-head__who')?.textContent).toContain('Sam Okafor');

    click('check-in-line-open');
    const line = live('.ci-line input') as HTMLInputElement;
    line.value = 'Lorem first line';
    line.dispatchEvent(new Event('input'));

    click('check-in-next');
    expect(screenName()).toBe('step-safety');
    click('check-in-safety-concern');
    expect(screenName()).toBe('picker');
    click('check-in-side-side-one');
    expect(screenName()).toBe('side-side-one');
    expect(live('.ci-flag')).not.toBeNull();
    click('check-in-back');
    expect(screenName()).toBe('picker');

    click('check-in-pill-help');
    expect(screenName()).toBe('step-help');
    const chip = [...document.querySelectorAll<HTMLButtonElement>('.ci-screen:not(.is-leaving) .ci-tick')].find((b) => b.textContent === 'Lorem A')!;
    chip.click();
    expect(chip.getAttribute('aria-pressed')).toBe('true');

    click('check-in-finish');
    expect(screenName()).toBe('handover');
    expect(document.querySelector('.ci-pills')?.classList.contains('is-hidden')).toBe(true);
    expect((live('textarea') as HTMLTextAreaElement).value).toBe('Lorem first line');
    expect(live('[data-part="check-in-report"]')?.classList.contains('is-open')).toBe(true);

    click('check-in-save');
    await flush();
    expect(onSave).toHaveBeenCalledTimes(1);
    const [saved, before] = onSave.mock.calls[0] as unknown as [CheckInRecord, CheckInRecord | null];
    expect(before).toBeNull();
    expect(saved).toMatchObject({ id: 'checkin_test-0001', meeting_id: MEETING, person_name: 'Sam Okafor', safety: 'concern', sides: ['side-one'], help: ['Lorem A'], said: 'Lorem first line', lines: { open: 'Lorem first line' } });
  });

  it('keeps the safety steps behind a quiet ⋯ that Escape closes', async () => {
    await open();
    const more = document.querySelector<HTMLButtonElement>('[data-part="check-in-more"]')!;
    expect(more.textContent).toBe('⋯');
    expect(document.querySelector('[data-part="check-in-quiet"]')).toBeNull();
    more.click();
    const sheet = document.querySelector('[data-part="check-in-quiet"]')!;
    expect(sheet.textContent).toContain('Lorem stay');
    expect(sheet.textContent).toContain('Lorem lead · ext 1');
    expect(more.getAttribute('aria-expanded')).toBe('true');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('.ci-panel')).not.toBeNull();
  });

  it('asks before closing with something unsaved, and closes straight away when empty', async () => {
    await open();
    click('check-in-close');
    await new Promise((r) => setTimeout(r, 400));
    expect(document.querySelector('.ci-panel')).toBeNull();

    await open();
    click('check-in-next');
    click('check-in-safety-none');
    click('check-in-close');
    expect(document.querySelector('.ci-confirm')).not.toBeNull();
    (document.querySelector('[data-part="check-in-keep"]') as HTMLButtonElement).click();
    expect(document.querySelector('.ci-confirm:not(.is-leaving)')).toBeNull();
    click('check-in-close');
    (document.querySelector('[data-part="check-in-discard"]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 400));
    expect(document.querySelector('.ci-panel')).toBeNull();
  });

  it('opens a saved record on the handover, and deletes only on a second tap', async () => {
    const edit: CheckInRecord = { ...newCheckIn({ id: 'checkin_test-0002', meetingId: MEETING, personRef: who[0]!.ref, personName: 'Sam Okafor', now: 'x' }), said: 'Lorem said', follow_ups: ['Lorem follow-up'] };
    const onDelete = vi.fn(async () => undefined);
    await open({ edit, onDelete });
    expect(screenName()).toBe('handover');
    expect((live('textarea') as HTMLTextAreaElement).value).toBe('Lorem said');
    const made = [...document.querySelectorAll<HTMLButtonElement>('.ci-screen:not(.is-leaving) .ci-tick')].find((b) => b.textContent === 'Lorem follow-up')!;
    expect(made.disabled).toBe(true);
    click('check-in-delete');
    expect(onDelete).not.toHaveBeenCalled();
    click('check-in-delete');
    await flush();
    expect(onDelete).toHaveBeenCalledWith('checkin_test-0002');
  });

  it('asks who it is about when more than one person is in the room', async () => {
    await open({ about: [...who, { ref: 'shared:person:p_lee', name: 'Lee Park' }] });
    expect(screenName()).toBe('who');
    click('check-in-who-1');
    expect(document.querySelector('.ci-head__who')?.textContent).toContain('Lee Park');
  });

  it('shows a retry when the guide text does not load', async () => {
    await open({ loadText: async () => { throw new Error('Lorem failed'); } });
    expect(document.querySelector('.ci-panel')?.textContent).toContain('Lorem failed');
    expect(document.querySelector('[data-part="check-in-retry"]')).not.toBeNull();
  });
});

describe('check-in on the shelf and the meeting page', () => {
  it('appears on the Guides shelf and hands over to its own panel', () => {
    const start = vi.fn();
    openGuidePanel(document, {
      guides: GUIDES, about: who, placedRuns: async () => [], onSave: async () => undefined,
      protocols: [{ id: 'check_in', name: 'Check-in', line: 'Lorem line', emblem: '<svg></svg>', start }]
    });
    const card = document.querySelector<HTMLButtonElement>('.guide-shelf-card[data-guide="check_in"]')!;
    expect(card.textContent).toContain('Check-in');
    card.click();
    expect(start).toHaveBeenCalled();
    expect(document.querySelector('.guide-panel')).toBeNull();
  });

  it('the saved card shows who and when, locked, and opens on request', async () => {
    const onOpen = vi.fn(async () => undefined);
    const card = renderCheckInCard(document, { id: 'checkin_test-0001', meeting_id: MEETING, person_ref: 'r', person_name: 'Sam Okafor', created_at: '2026-11-02T01:52:00.000Z', updated_at: 'x' }, onOpen);
    expect(card.textContent).toContain('Check-in · Sam Okafor');
    expect(card.textContent).toContain('locked');
    (card.querySelector('[data-part="check-in-open"]') as HTMLButtonElement).click();
    await flush();
    expect(onOpen).toHaveBeenCalled();
  });
});
