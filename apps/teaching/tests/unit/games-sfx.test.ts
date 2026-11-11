import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// A fake AudioContext that counts the oscillators an effect starts.
let oscillators = 0;
class FakeParam {
  setValueAtTime() {}
  linearRampToValueAtTime() {}
  exponentialRampToValueAtTime() {}
}
class FakeNode {
  frequency = new FakeParam();
  gain = new FakeParam();
  type = 'sine';
  connect(n: unknown) {
    return n;
  }
  start() {}
  stop() {}
}
class FakeAudioContext {
  currentTime = 0;
  destination = {};
  resume() {
    return Promise.resolve();
  }
  createOscillator() {
    oscillators += 1;
    return new FakeNode();
  }
  createGain() {
    return new FakeNode();
  }
}

type Sfx = typeof import('@/games/sound/sfx');
type Sound = typeof import('@/blocks/classroom-tools/sound');
let S: Sfx;
let sound: Sound;

beforeAll(async () => {
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
  S = await import('@/games/sound/sfx');
  sound = await import('@/blocks/classroom-tools/sound');
});

beforeEach(() => {
  localStorage.clear();
  sound.setMuted(false);
  localStorage.clear();
  S.resetSfxForTests();
  oscillators = 0;
});
afterEach(() => vi.restoreAllMocks());

describe('game sound effects', () => {
  it('has every effect the spec lists', () => {
    expect([...S.SFX_NAMES].sort()).toEqual(['buzz', 'click', 'coin', 'ding', 'fanfare', 'lock', 'reveal', 'right', 'tick', 'whoosh', 'wrong']);
  });

  it('phones are silent by default', () => {
    expect(S.sfxRole()).toBe('phone');
    expect(S.soundOn()).toBe(false);
    expect(S.sfx.right()).toBe(false);
    expect(oscillators).toBe(0);
  });

  it('a phone plays once the student turns sound on, remembered on the device', () => {
    S.setPhoneSound(true);
    expect(localStorage.getItem('teaching-hub.games.phone-sound')).toBe('1');
    expect(S.play('right')).toBe(true);
    expect(oscillators).toBe(2);
    S.resetSfxForTests();
    expect(S.phoneSoundOn()).toBe(true);
  });

  it('the board plays by default and shares the classroom tools mute', () => {
    S.setSfxRole('board');
    expect(S.sfx.ding()).toBe(true);
    sound.setMuted(true);
    expect(S.soundOn()).toBe(false);
    expect(S.sfx.ding()).toBe(false);
    S.setSoundOn(true);
    expect(sound.isMuted()).toBe(false);
  });

  it('the classroom tools mute silences a phone too, until the student turns game sound on', () => {
    sound.setMuted(true);
    expect(S.soundOn()).toBe(false);
    S.setPhoneSound(true);
    expect(sound.isMuted()).toBe(false);
    expect(S.soundOn()).toBe(true);
  });

  it('blocked storage: phones stay silent and nothing throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(S.phoneSoundOn()).toBe(false);
    expect(() => S.setPhoneSound(true)).not.toThrow();
    expect(S.phoneSoundOn()).toBe(true);
  });

  it('the toggle is a real button with aria-pressed', () => {
    const b = S.soundToggle();
    expect(b.getAttribute('aria-pressed')).toBe('false');
    expect(b.textContent).toBe('Sound off');
    b.click();
    expect(b.getAttribute('aria-pressed')).toBe('true');
    expect(S.phoneSoundOn()).toBe(true);
  });
});
