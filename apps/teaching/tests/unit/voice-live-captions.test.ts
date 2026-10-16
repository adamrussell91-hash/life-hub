import { describe, expect, it } from 'vitest';
import {
  createLiveCaptions,
  type SpeechRecognitionLike
} from '@/blocks/voice-live-captions';

class FakeRecognition implements SpeechRecognitionLike {
  static instances: FakeRecognition[] = [];
  continuous = false;
  interimResults = false;
  lang = '';
  onresult: SpeechRecognitionLike['onresult'] = null;
  onerror: SpeechRecognitionLike['onerror'] = null;
  onend: SpeechRecognitionLike['onend'] = null;
  started = 0;
  constructor() {
    FakeRecognition.instances.push(this);
  }
  start() {
    this.started += 1;
  }
  stop() {
    this.onend?.();
  }
  emit(results: Array<{ text: string; final: boolean }>, resultIndex = 0) {
    const list = results.map((r) => Object.assign([{ transcript: r.text }], { isFinal: r.final }));
    this.onresult?.({ resultIndex, results: Object.assign(list, { length: list.length }) as never });
  }
}

function setup() {
  FakeRecognition.instances = [];
  let now = 0;
  const seen: Array<[string, string]> = [];
  const captions = createLiveCaptions({
    elapsedS: () => now,
    onText: (finalText, interim) => seen.push([finalText, interim]),
    Recognition: FakeRecognition
  });
  return { captions, seen, tick: (s: number) => (now = s) };
}

describe('live captions', () => {
  it('shows interim words, then keeps final words with estimated times', () => {
    const { captions, seen, tick } = setup();
    captions.start();
    const rec = FakeRecognition.instances[0]!;
    tick(1);
    rec.emit([{ text: 'cold spectres', final: false }]);
    expect(seen.at(-1)).toEqual(['', 'cold spectres']);
    tick(3);
    rec.emit([{ text: 'cold spectres muse the wind', final: true }]);
    expect(seen.at(-1)).toEqual(['cold spectres muse the wind', '']);
    const words = captions.words();
    expect(words.map((w) => w.w)).toEqual(['cold', 'spectres', 'muse', 'the', 'wind']);
    expect(words[0]!.start).toBeCloseTo(0.6);
    expect(words.at(-1)!.end).toBeCloseTo(3);
  });

  it('restarts recognition when the browser ends it mid-recording, not after stop', () => {
    const { captions } = setup();
    captions.start();
    FakeRecognition.instances[0]!.onend?.();
    expect(FakeRecognition.instances).toHaveLength(2);
    captions.stop();
    expect(FakeRecognition.instances).toHaveLength(2);
  });

  it('gives up quietly when the microphone is not allowed for captions', () => {
    const reasons: string[] = [];
    FakeRecognition.instances = [];
    const captions = createLiveCaptions({
      elapsedS: () => 0,
      onText: () => undefined,
      onUnavailable: (reason) => reasons.push(reason),
      Recognition: FakeRecognition
    });
    captions.start();
    const rec = FakeRecognition.instances[0]!;
    rec.onerror?.({ error: 'not-allowed' });
    rec.onend?.();
    expect(FakeRecognition.instances).toHaveLength(1);
    expect(reasons[0]).toMatch(/blocked/);
  });

  it('reports unsupported browsers', () => {
    const captions = createLiveCaptions({ elapsedS: () => 0, onText: () => undefined, Recognition: null });
    expect(captions.supported).toBe(false);
    captions.start();
    expect(captions.words()).toEqual([]);
  });
});
