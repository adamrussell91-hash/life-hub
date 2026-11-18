import { afterEach, describe, expect, it, vi } from 'vitest';
import fixtureTrip from '../../fixtures/test-trip.json';
import type { Checkin, Item, Trip } from '@/types';
import { ApiClientError } from '@/api/client';
import type { TripEnvelope } from '@/api/travel';
import { closeAllJournalOverlays } from '@/journal/overlay-host';
import { openPostcardComposer, type ComposerDeps } from '@/postcard/composer';
import { memoryDraftStore } from '@/postcard/draft';
import { PhotoUnreadableError } from '@/postcard/photo-place';
import { VoiceClipError, type StartVoiceClipOptions } from '@/postcard/voice-clip';

const trip = fixtureTrip as unknown as Trip;
const STOP = 'itm_testtodo01';
const item = trip.items.find((i) => i.id === STOP) as Item;
const tick: Checkin = { id: 'chk_1', at: '2027-03-04T11:00:00.000Z', city_id: 'lis', label: 'Safe', item_id: STOP };
const NO_SIGNAL = "Couldn't reach the server. Check your signal and try again.";

function setup(over: Partial<ComposerDeps> = {}) {
  const drafts = memoryDraftStore();
  const onPosted = vi.fn<(saved: TripEnvelope) => void>();
  const deps = {
    preparePhoto: vi.fn(async () => ({
      file: new File(['jpeg'], 'a.jpg', { type: 'image/jpeg' }),
      orientation: 'portrait' as const,
      coordinates: { lat: 38.7, lon: -9.1 }
    })),
    addressForPhoto: vi.fn(async () => ['Rua do Exemplo', 'Alfama', '1100-000 Lisboa', 'Portugal']),
    startVoiceClip: vi.fn(async (options: StartVoiceClipOptions) => ({
      stop: () => options.onEnd({ blob: new Blob(['audio'], { type: 'audio/mp4' }), seconds: 21.2 })
    })),
    uploadAudio: vi.fn(async () => ({ audio_id: 'tau_a1' })),
    deleteAudio: vi.fn(async () => undefined),
    transcribe: vi.fn(async () => ({ text: 'All good here.' })),
    uploadPhoto: vi.fn(async () => ({ photo_id: 'tph_p1' })),
    setPostcard: vi.fn(async () => ({ trip, version: 'v2' })),
    getTrip: vi.fn(async () => ({ trip, version: 'v9' })),
    drafts,
    ...over
  };
  const open = () => openPostcardComposer({ trip: { ...trip, checkins: [tick] }, version: 'v1', item, onPosted, deps });
  return { deps, drafts, onPosted, open };
}

const sheet = (): HTMLElement => document.querySelector<HTMLElement>('.postcard-composer')!;
const btn = (text: string): HTMLButtonElement =>
  [...sheet().querySelectorAll('button')].find((b) => b.textContent === text) as HTMLButtonElement;
const words = (): HTMLTextAreaElement => sheet().querySelector('textarea')!;
const lines = (): string[] => [...sheet().querySelectorAll<HTMLInputElement>('.postcard-composer__line')].map((i) => i.value);
const note = (selector: string): HTMLElement => sheet().querySelector<HTMLElement>(selector)!;

async function choose(name = 'IMG_1.jpg'): Promise<void> {
  const input = sheet().querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, 'files', { value: [new File(['x'], name, { type: 'image/jpeg' })], configurable: true });
  input.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(sheet().querySelector('.postcard-composer__name')!.textContent).toBe(name));
}
async function recordAndStop(): Promise<void> {
  btn('Record').click();
  await vi.waitFor(() => expect(btn('Stop').hidden).toBe(false));
  btn('Stop').click();
}
function post(): void {
  expect(btn('Post postcard').disabled).toBe(false);
  sheet().querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
}
function type(value: string): void {
  words().value = value;
  words().dispatchEvent(new Event('input'));
}

afterEach(() => {
  closeAllJournalOverlays();
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('the postcard sheet', () => {
  it('opens inside its backdrop with the stop as the address, and Post off with its reason', async () => {
    await setup().open().ready;
    expect(document.querySelector('.sheet-back')!.contains(sheet())).toBe(true);
    expect(sheet().getAttribute('role')).toBe('dialog');
    expect(lines()).toEqual(['Belém Tower', 'Lisbon', 'Portugal', '']);
    expect(btn('Post postcard').disabled).toBe(true);
    expect(btn('Preview').disabled).toBe(true);
    expect(note('.postcard-composer__blocker').textContent).toBe('Choose a photo to post.');
    // A labelled button, not the browser's own file box.
    expect(sheet().querySelector<HTMLInputElement>('input[type="file"]')!.hidden).toBe(true);
    expect(btn('Choose photo')).toBeTruthy();
  });

  it('a photo fills the address from where it was taken and can be posted with nothing else', async () => {
    const { open, deps, onPosted, drafts } = setup();
    await open().ready;
    await choose();
    await vi.waitFor(() => expect(lines()).toEqual(['Rua do Exemplo', 'Alfama', '1100-000 Lisboa', 'Portugal']));
    expect(deps.addressForPhoto).toHaveBeenCalledWith({ lat: 38.7, lon: -9.1 }, ['Belém Tower', 'Lisbon', 'Portugal']);
    post();
    await vi.waitFor(() => expect(onPosted).toHaveBeenCalledTimes(1));
    expect(deps.setPostcard).toHaveBeenCalledWith(trip.id, STOP, 'v1', {
      photo_id: 'tph_p1',
      orientation: 'portrait',
      address: ['Rua do Exemplo', 'Alfama', '1100-000 Lisboa', 'Portugal']
    });
    expect(onPosted).toHaveBeenCalledWith({ trip, version: 'v2' });
    expect(document.querySelector('.postcard-composer')).toBeNull();
    expect(drafts.size()).toBe(0);
  });

  it('refuses a photo it cannot read and says so', async () => {
    const { open } = setup({
      preparePhoto: vi.fn(async () => {
        throw new PhotoUnreadableError();
      })
    });
    await open().ready;
    const input = sheet().querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'odd.heic', { type: 'image/heic' })], configurable: true });
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(note('.postcard-composer__part .postcard-composer__note').hidden).toBe(false));
    expect(note('.postcard-composer__part .postcard-composer__note').textContent).toBe("That photo can't be read. Try a different one.");
    expect(btn('Post postcard').disabled).toBe(true);
  });

  it('a recording is sent, written out into the box, and posted with its length', async () => {
    const { open, deps, onPosted } = setup();
    await open().ready;
    await choose();
    await recordAndStop();
    await vi.waitFor(() => expect(words().value).toBe('All good here.'));
    expect(deps.uploadAudio).toHaveBeenCalledTimes(1);
    expect(deps.transcribe).toHaveBeenCalledWith(trip.id, 'tau_a1');
    post();
    await vi.waitFor(() => expect(onPosted).toHaveBeenCalled());
    expect(vi.mocked(deps.setPostcard).mock.calls[0]![3]).toMatchObject({ audio_id: 'tau_a1', audio_s: 21, text: 'All good here.' });
  });

  it('words typed while the transcript is on its way are kept', async () => {
    let finish: (value: { text: string }) => void = () => undefined;
    const { open } = setup({ transcribe: vi.fn(() => new Promise<{ text: string }>((resolve) => (finish = resolve))) });
    await open().ready;
    await choose();
    await recordAndStop();
    await vi.waitFor(() => expect(sheet().textContent).toContain('Writing out what you said…'));
    type('My own words');
    finish({ text: 'All good here.' });
    await vi.waitFor(() => expect(sheet().textContent).not.toContain('Writing out what you said…'));
    expect(words().value).toBe('My own words');
  });

  it('posting never waits for the transcript', async () => {
    const { open, deps, onPosted } = setup({ transcribe: vi.fn(() => new Promise<{ text: string }>(() => undefined)) });
    await open().ready;
    await choose();
    await recordAndStop();
    await vi.waitFor(() => expect(btn('Post postcard').disabled).toBe(false));
    post();
    await vi.waitFor(() => expect(onPosted).toHaveBeenCalledTimes(1));
    const sent = vi.mocked(deps.setPostcard).mock.calls[0]![3];
    expect(sent).toMatchObject({ audio_id: 'tau_a1' });
    expect('text' in sent).toBe(false);
  });

  it('says when the words could not be written out, and Try again asks once more', async () => {
    const transcribe = vi
      .fn<ComposerDeps['transcribe']>()
      .mockRejectedValueOnce(new ApiClientError({ code: 'transcription_failed', message: 'x' }, 502))
      .mockResolvedValueOnce({ text: 'Second try.' });
    const { open } = setup({ transcribe });
    await open().ready;
    await choose();
    await recordAndStop();
    await vi.waitFor(() => expect(sheet().textContent).toContain("Couldn't write out the words."));
    expect(btn('Post postcard').disabled).toBe(false);
    const retry = [...sheet().querySelectorAll('button')].filter((b) => b.textContent === 'Try again' && !b.hidden);
    expect(retry).toHaveLength(1);
    retry[0]!.click();
    await vi.waitFor(() => expect(words().value).toBe('Second try.'));
  });

  it('says when the microphone is refused, and the photo can still be posted', async () => {
    const { open } = setup({
      startVoiceClip: vi.fn(async () => {
        throw new VoiceClipError('Microphone access was not allowed. You can still post the photo and type the words.');
      })
    });
    await open().ready;
    await choose();
    btn('Record').click();
    await vi.waitFor(() => expect(sheet().textContent).toContain('Microphone access was not allowed.'));
    expect(btn('Post postcard').disabled).toBe(false);
  });

  it('recording again removes the take that was already sent', async () => {
    const { open, deps } = setup();
    await open().ready;
    await choose();
    await recordAndStop();
    await vi.waitFor(() => expect(btn('Record again').hidden).toBe(false));
    await vi.waitFor(() => expect(deps.transcribe).toHaveBeenCalled());
    btn('Record again').click();
    await vi.waitFor(() => expect(deps.deleteAudio).toHaveBeenCalledWith('tau_a1'));
  });

  it('a failed post says why, keeps the sheet and what is in it, and does not send the photo twice', async () => {
    const setPostcard = vi
      .fn<ComposerDeps['setPostcard']>()
      .mockRejectedValueOnce(new ApiClientError({ code: 'network_error', message: 'Load failed' }))
      .mockResolvedValueOnce({ trip, version: 'v2' });
    const { open, deps, onPosted, drafts } = setup({ setPostcard });
    await open().ready;
    await choose();
    type('Hello from the tower');
    post();
    await vi.waitFor(() => expect(note('.postcard-composer__error').hidden).toBe(false));
    expect(note('.postcard-composer__error').textContent).toBe(NO_SIGNAL);
    expect(words().value).toBe('Hello from the tower');
    expect(btn('Post postcard').disabled).toBe(false);
    expect(onPosted).not.toHaveBeenCalled();
    expect(drafts.size()).toBe(1);
    post();
    await vi.waitFor(() => expect(onPosted).toHaveBeenCalledTimes(1));
    expect(deps.uploadPhoto).toHaveBeenCalledTimes(1);
  });

  it('when someone else changed the trip, it fetches the latest and tries once more', async () => {
    const setPostcard = vi
      .fn<ComposerDeps['setPostcard']>()
      .mockRejectedValueOnce(new ApiClientError({ code: 'conflict', message: 'The trip changed.' }, 409))
      .mockResolvedValueOnce({ trip, version: 'v10' });
    const { open, deps, onPosted } = setup({ setPostcard });
    await open().ready;
    await choose();
    post();
    await vi.waitFor(() => expect(onPosted).toHaveBeenCalledWith({ trip, version: 'v10' }));
    expect(deps.getTrip).toHaveBeenCalledTimes(1);
    expect(setPostcard.mock.calls.map((call) => call[2])).toEqual(['v1', 'v9']);
  });

  it('keeps a draft on the phone when the sheet is closed, and puts it back', async () => {
    const { open, drafts, deps } = setup();
    await open().ready;
    await choose();
    type('Half a thought');
    btn('Cancel').click();
    expect(document.querySelector('.postcard-composer')).toBeNull();
    await vi.waitFor(() => expect(drafts.size()).toBe(1));

    await open().ready;
    expect(sheet().querySelector('.postcard-composer__name')!.textContent).toBe('IMG_1.jpg');
    expect(words().value).toBe('Half a thought');
    expect(sheet().textContent).toContain('Draft restored from this phone.');
    expect(btn('Post postcard').disabled).toBe(false);
    expect(deps.preparePhoto).toHaveBeenCalledTimes(1);

    btn('Discard draft').click();
    await vi.waitFor(() => expect(drafts.size()).toBe(0));
    expect(words().value).toBe('');
    expect(lines()).toEqual(['Belém Tower', 'Lisbon', 'Portugal', '']);
    expect(btn('Post postcard').disabled).toBe(true);
  });

  it('a restored clip that never reached the server is sent again', async () => {
    const { open, drafts, deps } = setup();
    await drafts.save({
      tripId: trip.id,
      itemId: STOP,
      photo: new Blob(['jpeg'], { type: 'image/jpeg' }),
      photoName: 'IMG_9.jpg',
      orientation: 'landscape',
      clip: new Blob(['audio'], { type: 'audio/mp4' }),
      clipSeconds: 12,
      audioId: null,
      text: '',
      address: ['By the river', '', '', ''],
      addressTouched: true,
      updatedAt: '2027-03-04T11:00:00.000Z'
    });
    await open().ready;
    await vi.waitFor(() => expect(deps.uploadAudio).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(words().value).toBe('All good here.'));
    expect(lines()[0]).toBe('By the river');
  });

  it('Preview opens the card over the sheet, and closing it leaves the sheet where it was', async () => {
    const { open } = setup();
    await open().ready;
    await choose();
    type('All good here.');
    btn('Preview').click();
    const viewer = document.querySelector<HTMLElement>('.postcard-viewer')!;
    expect(viewer).not.toBeNull();
    expect(viewer.querySelector('.postcard__text')!.textContent).toBe('All good here.');
    expect(viewer.querySelector('[role="dialog"]')!.getAttribute('aria-label')).toBe('Postcard preview');
    [...viewer.querySelectorAll('button')].find((b) => b.textContent === 'Close')!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.querySelector('.postcard-viewer')).toBeNull();
    expect(document.querySelector('.postcard-composer')).not.toBeNull();
    expect(words().value).toBe('All good here.');
  });

  it('Escape while typing leaves the field, not the sheet; Escape elsewhere closes it', async () => {
    await setup().open().ready;
    words().focus();
    words().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.postcard-composer')).not.toBeNull();
    sheet().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.postcard-composer')).toBeNull();
  });
});

describe('from the trip page', () => {
  it('the stop\'s own Postcard button opens the sheet, and the posted card lands on the stop', async () => {
    vi.resetModules();
    const ticked: Trip = { ...trip, checkins: [tick] };
    const posted: Trip = {
      ...trip,
      checkins: [
        {
          ...tick,
          photo_id: 'tph_p1',
          postcard: { photo_id: 'tph_p1', orientation: 'portrait', address: ['Belém Tower', 'Lisbon'], posted_at: '2027-03-04T11:30:00.000Z' }
        }
      ]
    };
    const save = vi.fn(async () => ({ trip: posted, version: 'v2' }));
    vi.doMock('@/api/travel', async () => ({
      ...(await vi.importActual<object>('@/api/travel')),
      getTrip: vi.fn(async () => ({ trip: ticked, version: 'v1' })),
      uploadTravelPhoto: vi.fn(async () => ({ photo_id: 'tph_p1' })),
      setPostcard: save
    }));
    vi.doMock('@/api/travel-atlas', () => ({ getAtlas: vi.fn(async () => null) }));
    vi.doMock('@/postcard/photo-place', async () => ({
      ...(await vi.importActual<object>('@/postcard/photo-place')),
      preparePostcardPhoto: vi.fn(async () => ({ file: new File(['jpeg'], 'a.jpg', { type: 'image/jpeg' }), orientation: 'portrait' })),
      addressForPhoto: vi.fn(async (_coordinates: unknown, fallback: string[]) => fallback)
    }));
    const { renderTripPage } = await import('@/views/trip-page');
    const canvas = document.createElement('div');
    document.body.append(canvas);
    await renderTripPage(canvas, trip.id, { cityId: 'lis', isCurrent: () => true });
    // The page opens on the city's first day; the stop is on the second.
    [...canvas.querySelectorAll<HTMLButtonElement>('.daybtn')].find((b) => b.textContent!.includes('4 Mar'))!.click();

    const open = [...canvas.querySelectorAll('button')].find((b) => b.textContent === 'Postcard');
    expect(open).toBeTruthy();
    open!.click();
    expect(document.querySelector('.postcard-composer')).not.toBeNull();
    await choose();
    post();
    await vi.waitFor(() => expect(canvas.querySelector('button.safe-mark__postcard')).not.toBeNull());
    expect(save).toHaveBeenCalledWith(trip.id, STOP, 'v1', expect.objectContaining({ photo_id: 'tph_p1', orientation: 'portrait' }));
    expect(document.querySelector('.postcard-composer')).toBeNull();
    expect([...canvas.querySelectorAll('button')].some((b) => b.textContent === 'Postcard')).toBe(false);

    vi.doUnmock('@/api/travel');
    vi.doUnmock('@/api/travel-atlas');
    vi.doUnmock('@/postcard/photo-place');
  });
});
