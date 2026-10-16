/**
 * Live captions for the annotation voice recorder via the browser's own
 * speech recognition (Safari / Chrome). Shows words while the teacher speaks
 * and keeps a timed word list as the fallback transcript when the Whisper
 * job is slow or fails. Timings are estimated: each recognised phrase is
 * spread across the time between its first interim result and its final one.
 */
import { distributeWordTimes, type VoiceWord } from '@/blocks/voice-transcript';

type RecognitionAlternative = { transcript: string };
type RecognitionResult = { isFinal: boolean; length: number; [index: number]: RecognitionAlternative };
type RecognitionEvent = {
  resultIndex: number;
  results: { length: number; [index: number]: RecognitionResult };
};

export type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
};

export type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

export function speechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type LiveCaptions = {
  supported: boolean;
  start: () => void;
  stop: () => void;
  words: () => VoiceWord[];
  text: () => string;
  dispose: () => void;
};

export function createLiveCaptions(options: {
  /** Seconds of recorded audio so far (pauses excluded). */
  elapsedS: () => number;
  onText: (finalText: string, interim: string) => void;
  onUnavailable?: (reason: string) => void;
  lang?: string;
  Recognition?: SpeechRecognitionCtor | null;
}): LiveCaptions {
  const Ctor = options.Recognition === undefined ? speechRecognitionCtor() : options.Recognition;
  const words: VoiceWord[] = [];
  const finals: string[] = [];
  let recognition: SpeechRecognitionLike | null = null;
  let active = false;
  let blocked = false;
  // Per recognition session: when each result index first appeared, and which are done.
  let firstSeen = new Map<number, number>();
  let done = new Set<number>();

  function emit(interim: string): void {
    options.onText(finals.join(' '), interim);
  }

  function open(): void {
    if (!Ctor || blocked) return;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = options.lang || (typeof navigator !== 'undefined' ? navigator.language : '') || 'en-GB';
    firstSeen = new Map();
    done = new Set();
    rec.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]!;
        const transcript = (result[0]?.transcript ?? '').trim();
        if (!firstSeen.has(i)) firstSeen.set(i, Math.max(0, options.elapsedS() - 0.4));
        if (result.isFinal) {
          if (done.has(i) || !transcript) continue;
          done.add(i);
          const start = firstSeen.get(i) ?? 0;
          const lastEnd = words.length > 0 ? words[words.length - 1]!.end : 0;
          words.push(
            ...distributeWordTimes({
              text: transcript,
              start: Math.max(start, lastEnd),
              end: Math.max(start, lastEnd, options.elapsedS())
            })
          );
          finals.push(transcript);
        } else {
          interim += `${transcript} `;
        }
      }
      emit(interim.trim());
    };
    rec.onerror = (event) => {
      const code = event?.error ?? '';
      if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') {
        blocked = true;
        options.onUnavailable?.('Live captions are blocked in this browser. The transcript arrives after you stop.');
      }
    };
    // Recognition ends itself after silence; keep it going while recording.
    rec.onend = () => {
      recognition = null;
      if (active && !blocked) open();
    };
    recognition = rec;
    try {
      rec.start();
    } catch {
      recognition = null;
    }
  }

  return {
    supported: Boolean(Ctor),
    start() {
      if (!Ctor || active) return;
      active = true;
      open();
    },
    stop() {
      active = false;
      try {
        recognition?.stop();
      } catch {
        // already stopped
      }
    },
    words: () => words.map((w) => ({ ...w })),
    text: () => finals.join(' '),
    dispose() {
      active = false;
      try {
        recognition?.abort?.();
      } catch {
        // ignore
      }
      recognition = null;
    }
  };
}
