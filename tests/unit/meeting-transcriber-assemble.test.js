import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assemble, nameVoices, voteForTap, speakerAt, labelWords, groupLines } from '../../tools/meeting-transcriber/lib/assemble.mjs';
import { segmentRuns, speakerCount, whisperWords } from '../../tools/meeting-transcriber/worker.mjs';

// Small expect() over node:assert, so the file runs in the root node:test suite.
function expect(actual) {
  return {
    toBe: (want) => assert.equal(actual, want),
    toEqual: (want) => assert.deepEqual(actual, want),
    toHaveLength: (n) => assert.equal(actual.length, n),
    toBeGreaterThan: (n) => assert.ok(actual > n, `${actual} > ${n}`)
  };
}

// Invented words only. Each word 400 ms long, 100 ms apart, starting at `at`.
function say(text, at, step = 500) {
  return text.split(' ').map((w, i) => ({ start_ms: at + i * step, end_ms: at + i * step + 400, text: (i ? ' ' : ' ') + w }));
}
const seg = (speaker, start_ms, end_ms) => ({ speaker, start_ms, end_ms });

describe('speaker at word midpoint', () => {
  it('takes the segment holding the midpoint, not the word start', () => {
    const segs = [seg('S1', 0, 1000), seg('S2', 1000, 5000)];
    // word 800-1400 has midpoint 1100 -> S2 although it starts inside S1
    expect(speakerAt(segs, 1100)).toBe('S2');
    const out = labelWords([{ start_ms: 800, end_ms: 1400, text: ' hi' }], segs);
    expect(out[0].speaker).toBe('S2');
  });
  it('uses the nearest segment within a second, else carries the previous voice', () => {
    const segs = [seg('S1', 0, 1000), seg('S2', 5000, 6000)];
    expect(speakerAt(segs, 1500)).toBe('S1');
    expect(speakerAt(segs, 3000)).toBe(null);
    const words = [...say('one two', 0), { start_ms: 3000, end_ms: 3400, text: ' gap' }];
    expect(labelWords(words, segs)[2].speaker).toBe('S1');
  });
});

describe('line grouping', () => {
  it('splits at a speaker change', () => {
    const words = [...say('Hello there everyone.', 0), ...say('Thanks for coming today.', 2000)];
    const segs = [seg('S1', 0, 1900), seg('S2', 1900, 4000)];
    const { lines } = assemble({ words, segments: segs });
    expect(lines.map((l) => l.speaker)).toEqual(['S1', 'S2']);
    expect(lines[0].text).toBe('Hello there everyone.');
    expect(lines[1].start_ms).toBe(2000);
  });
  it('splits at a pause over 1.5 s but not at exactly 1.5 s', () => {
    const segs = [seg('S1', 0, 20000)];
    const a = say('first part', 0); // ends 900
    const long = assemble({ words: [...a, ...say('second part', 900 + 1501)], segments: segs });
    expect(long.lines).toHaveLength(2);
    const edge = assemble({ words: [...a, ...say('second part', 900 + 1500)], segments: segs });
    expect(edge.lines).toHaveLength(1);
  });
  it('joins a short stray run into its sentence so the sentence stays whole', () => {
    const words = say('We should move the essay to week seven.', 0);
    // voice flips for two words in the middle only
    const segs = [seg('S1', 0, 1800), seg('S2', 1800, 2800), seg('S1', 2800, 6000)];
    const { lines } = assemble({ words, segments: segs });
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe('We should move the essay to week seven.');
  });
  it('keeps a real quick exchange split', () => {
    const words = [...say('Is it ready?', 0), ...say('Yes.', 1600, 300)];
    const segs = [seg('S1', 0, 1500), seg('S2', 1500, 3000)];
    expect(assemble({ words, segments: segs }).lines.map((l) => l.speaker)).toEqual(['S1', 'S2']);
  });
  it('drops bracketed noise tokens and fills the line shape', () => {
    const words = [{ start_ms: 0, end_ms: 300, text: ' [BLANK_AUDIO]' }, ...say('Hello.', 400)];
    const { lines } = assemble({ words, segments: [seg('S1', 0, 2000)] });
    expect(lines).toEqual([{ start_ms: 400, end_ms: 800, speaker: 'S1', text: 'Hello.', who_override: null, moved: false, unsure: false }]);
  });
});

describe('tap vote', () => {
  const segs = [seg('S1', 0, 10000), seg('S2', 10000, 20000)];
  it('counts a late tap inside the t-2s window', () => {
    // S2 starts at 10000; tapping at 11500 still looks back to 9500 and S2 has more time
    expect(voteForTap(segs, 11500)).toBe('S2');
    // tap at 12500: window 10500-13500 is all S2
    expect(voteForTap(segs, 12500)).toBe('S2');
  });
  it('lets the previous speaker not steal a tap made as the next one starts', () => {
    // window 8200-11200 holds S1 1800 ms vs S2 1200 ms -> S1 (the speaker who talked most)
    expect(voteForTap(segs, 10200)).toBe('S1');
    // tap a bit later: window 9000-12000, S1 1000 vs S2 2000
    expect(voteForTap(segs, 11000)).toBe('S2');
  });
  it('gives no vote on a tie or when nobody speaks', () => {
    expect(voteForTap([seg('S1', 0, 1000), seg('S2', 1000, 2000)], 1000)).toBe(null);
    expect(voteForTap(segs, 60000)).toBe(null);
  });
  it('names a voice with 2 votes', () => {
    const taps = [{ who: 'me', at_ms: 3000 }, { who: 'me', at_ms: 5000 }, { who: 'p1', at_ms: 14000 }, { who: 'p1', at_ms: 16000 }];
    expect(nameVoices(segs, taps)).toEqual({ S1: 'me', S2: 'p1' });
  });
  it('leaves a voice unnamed with too few votes', () => {
    expect(nameVoices(segs, [{ who: 'me', at_ms: 3000 }, { who: 'p1', at_ms: 14000 }])).toEqual({});
  });
  it('needs two thirds of the voice votes', () => {
    const mixed = [{ who: 'me', at_ms: 2000 }, { who: 'me', at_ms: 4000 }, { who: 'p1', at_ms: 6000 }];
    expect(nameVoices(segs, mixed)).toEqual({ S1: 'me' }); // 2 of 3 = exactly two thirds
    const split = [...mixed, { who: 'p1', at_ms: 8000 }];
    expect(nameVoices(segs, split)).toEqual({}); // 2 of 4
  });
  it('leaves a tie between names unnamed', () => {
    const tie = [{ who: 'me', at_ms: 2000 }, { who: 'me', at_ms: 4000 }, { who: 'p1', at_ms: 6000 }, { who: 'p1', at_ms: 8000 }];
    expect(nameVoices(segs, tie)).toEqual({});
  });
  it('ignores malformed taps', () => {
    expect(nameVoices(segs, [null, { who: 'me' }, { at_ms: 3000 }])).toEqual({});
  });
});

describe('merging voices won by the same name', () => {
  it('merges two voices, sums talk time and joins adjacent lines', () => {
    const segs = [seg('S1', 0, 4000), seg('S2', 4200, 8000), seg('S3', 8000, 12000)];
    const words = [...say('Right then.', 0), ...say('Let us begin.', 4300), ...say('Sounds good to me.', 8100)];
    const taps = [
      { who: 'me', at_ms: 2000 }, { who: 'me', at_ms: 3000 },
      { who: 'me', at_ms: 6000 }, { who: 'me', at_ms: 7000 },
      { who: 'p1', at_ms: 10000 }, { who: 'p1', at_ms: 11000 },
    ];
    const { voices, lines } = assemble({ words, segments: segs, taps });
    expect(voices.map((v) => [v.key, v.who, v.source])).toEqual([['S1', 'me', 'taps'], ['S3', 'p1', 'taps']]);
    expect(voices[0].talk_ms).toBe(4000 + 3800);
    // the long pause between the two S1 lines still splits them
    expect(lines.map((l) => l.speaker)).toEqual(['S1', 'S1', 'S3']);
  });
  it('joins merged voices into one line when there is no pause between them', () => {
    const segs = [seg('S1', 0, 2000), seg('S2', 2000, 4000), seg('S3', 8000, 10000)];
    const words = [...say('Right then.', 0), ...say('Let us begin.', 1400), ...say('Fine.', 8100)];
    const taps = [{ who: 'me', at_ms: 1000 }, { who: 'me', at_ms: 1500 }, { who: 'me', at_ms: 3000 }, { who: 'me', at_ms: 3500 }];
    const { lines } = assemble({ words, segments: segs, taps });
    expect(lines.map((l) => l.speaker)).toEqual(['S1', 'S3']);
    expect(lines[0].text).toBe('Right then. Let us begin.');
  });
  it('keeps unnamed voices with who null and talk_ms', () => {
    const { voices } = assemble({ words: say('Hi all.', 0), segments: [seg('S1', 0, 1500)], taps: [] });
    expect(voices).toEqual([{ key: 'S1', who: null, source: null, talk_ms: 1500 }]);
  });
});

describe('long monologues', () => {
  it('breaks at a sentence end once a line is very long', () => {
    const sentence = 'word '.repeat(30).trim() + '.';
    let words = [];
    for (let i = 0; i < 6; i++) words = words.concat(say(sentence, i * 16000, 500));
    const { lines } = assemble({ words, segments: [seg('S1', 0, 200000)] });
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((l) => /[.]$/.test(l.text))).toBe(true);
  });
});

describe('worker helpers', () => {
  it('counts voices as attendees plus me, plus one for the room', () => {
    expect(speakerCount({ attendees: [{}, {}] })).toBe(3);
    expect(speakerCount({ attendees: [{}], room: true })).toBe(3);
    expect(speakerCount({})).toBe(1);
  });
  it('reads whisper-cli JSON offsets', () => {
    const w = whisperWords({ transcription: [{ text: ' Hi', offsets: { from: 10, to: 300 } }, { text: ' ', offsets: { from: 300, to: 400 } }] });
    expect(w).toEqual([{ start_ms: 10, end_ms: 300, text: ' Hi' }]);
  });
});

describe('segmentRuns', () => {
  it('splits parts where a mic switch started a fresh recorder', () => {
    expect(segmentRuns([0, 3], 5)).toEqual([[0, 3], [3, 5]]);
  });
  it('treats a missing or empty list as one run', () => {
    expect(segmentRuns(undefined, 4)).toEqual([[0, 4]]);
    expect(segmentRuns([], 4)).toEqual([[0, 4]]);
  });
});
