// Pure: turns word timings + speaker segments + taps into transcript lines and named voices.
// Times are milliseconds. words: [{ start_ms, end_ms, text }]. segments: [{ start_ms, end_ms, speaker }].
// taps: [{ who, at_ms }]. No I/O, no transcript text ever logged here.

export const PAUSE_MS = 1500;
export const TAP_BEFORE_MS = 2000;
export const TAP_AFTER_MS = 1000;
export const MIN_VOTES = 2;
export const MIN_SHARE = 2 / 3;
const NEAREST_MS = 1000;
const MIN_RUN_WORDS = 3; // a run shorter than this inside a sentence joins the sentence's main voice
const MAX_LINE_CHARS = 420;

const SENTENCE_END = /[.?!]["')\]]*$/;

export function cleanWords(words) {
  return (words || [])
    .filter((w) => w && typeof w.text === 'string' && w.text.trim() && !/^\[.*\]$/.test(w.text.trim()))
    .map((w) => ({ start_ms: Number(w.start_ms), end_ms: Math.max(Number(w.end_ms), Number(w.start_ms)), text: w.text }));
}

// Speaker active at time t: the segment containing it, else the nearest within 1 s, else null.
export function speakerAt(segments, t) {
  let best = null;
  for (const s of segments) {
    if (s.start_ms <= t && t <= s.end_ms) return s.speaker;
    const d = Math.min(Math.abs(t - s.start_ms), Math.abs(t - s.end_ms));
    if (best === null || d < best.d) best = { d, speaker: s.speaker };
  }
  return best && best.d < NEAREST_MS ? best.speaker : null;
}

function joinText(words) {
  return words.map((w) => w.text).join('').replace(/\s+/g, ' ').trim();
}

// Group words into sentences: end at . ? ! or a pause longer than PAUSE_MS.
function sentences(words) {
  const out = [];
  let cur = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (cur.length && w.start_ms - cur[cur.length - 1].end_ms > PAUSE_MS) {
      out.push(cur);
      cur = [];
    }
    cur.push(w);
    if (SENTENCE_END.test(w.text.trim())) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

// Speaker per word at its midpoint; gaps carry the previous speaker. Short stray runs inside a sentence
// join that sentence's main voice, so lines hold whole sentences wherever the voice evidence allows.
export function labelWords(words, segments) {
  const labelled = words.map((w) => ({ ...w, speaker: speakerAt(segments, (w.start_ms + w.end_ms) / 2) }));
  let prev = null;
  for (const w of labelled) {
    if (w.speaker === null) w.speaker = prev;
    else prev = w.speaker;
  }
  const firstKnown = labelled.find((w) => w.speaker !== null);
  for (const w of labelled) if (w.speaker === null) w.speaker = firstKnown ? firstKnown.speaker : 'S1';

  let at = 0;
  for (const sent of sentences(words)) {
    const group = labelled.slice(at, at + sent.length);
    at += sent.length;
    const runs = [];
    for (const w of group) {
      const last = runs[runs.length - 1];
      if (last && last.speaker === w.speaker) last.items.push(w);
      else runs.push({ speaker: w.speaker, items: [w] });
    }
    if (runs.length < 2) continue;
    const time = new Map();
    for (const w of group) time.set(w.speaker, (time.get(w.speaker) || 0) + Math.max(1, w.end_ms - w.start_ms));
    const main = [...time.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0][0];
    // Never absorb a run when every run is short (a quick back and forth stays split).
    if (!runs.some((r) => r.items.length >= MIN_RUN_WORDS)) continue;
    for (const r of runs) if (r.items.length < MIN_RUN_WORDS) for (const w of r.items) w.speaker = main;
  }
  return labelled;
}

export function groupLines(labelled) {
  const lines = [];
  let cur = null;
  for (const w of labelled) {
    const gap = cur ? w.start_ms - cur.end_ms : 0;
    const tooLong = cur && cur.words.length && SENTENCE_END.test(cur.words[cur.words.length - 1].text.trim()) && joinText(cur.words).length > MAX_LINE_CHARS;
    if (!cur || cur.speaker !== w.speaker || gap > PAUSE_MS || tooLong) {
      if (cur) lines.push(cur);
      cur = { speaker: w.speaker, start_ms: w.start_ms, end_ms: w.end_ms, words: [] };
    }
    cur.words.push(w);
    cur.end_ms = Math.max(cur.end_ms, w.end_ms);
  }
  if (cur) lines.push(cur);
  return lines.map((l) => ({
    start_ms: l.start_ms,
    end_ms: l.end_ms,
    speaker: l.speaker,
    text: joinText(l.words),
    who_override: null,
    moved: false,
    unsure: false,
  }));
}

export function talkByVoice(segments) {
  const talk = {};
  for (const s of segments) talk[s.speaker] = (talk[s.speaker] || 0) + Math.max(0, s.end_ms - s.start_ms);
  return talk;
}

// One tap votes for the speaker with the most talk time in [t - 2 s, t + 1 s]. A tie gives no vote.
export function voteForTap(segments, atMs) {
  const lo = atMs - TAP_BEFORE_MS;
  const hi = atMs + TAP_AFTER_MS;
  const hit = {};
  for (const s of segments) {
    const o = Math.min(s.end_ms, hi) - Math.max(s.start_ms, lo);
    if (o > 0) hit[s.speaker] = (hit[s.speaker] || 0) + o;
  }
  const ranked = Object.entries(hit).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return null;
  if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) return null;
  return ranked[0][0];
}

// A voice takes a name with >= 2 votes and >= 2/3 of its votes. Equal top counts leave it unnamed.
export function nameVoices(segments, taps) {
  const votes = {};
  for (const tap of taps || []) {
    if (!tap || tap.who === undefined || tap.who === null || !Number.isFinite(Number(tap.at_ms))) continue;
    const voice = voteForTap(segments, Number(tap.at_ms));
    if (!voice) continue;
    votes[voice] = votes[voice] || {};
    votes[voice][tap.who] = (votes[voice][tap.who] || 0) + 1;
  }
  const names = {};
  for (const [voice, counts] of Object.entries(votes)) {
    const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const total = ranked.reduce((n, [, c]) => n + c, 0);
    const [who, n] = ranked[0];
    if (ranked.length > 1 && ranked[1][1] === n) continue;
    if (n >= MIN_VOTES && n >= MIN_SHARE * total) names[voice] = who;
  }
  return names;
}

function keyOrder(a, b) {
  return String(a).localeCompare(String(b), 'en', { numeric: true });
}

// Main entry. Returns { voices, lines } in the transcript shape.
export function assemble({ words, segments, taps = [] }) {
  const segs = (segments || []).filter((s) => s.end_ms > s.start_ms).sort((a, b) => a.start_ms - b.start_ms);
  const clean = cleanWords(words).sort((a, b) => a.start_ms - b.start_ms);
  const names = nameVoices(segs, taps);
  const talk = talkByVoice(segs);

  // Voices won by the same name merge into the lowest-numbered one.
  const byName = {};
  for (const key of Object.keys(names).sort(keyOrder)) (byName[names[key]] ||= []).push(key);
  const remap = {};
  for (const keys of Object.values(byName)) for (const k of keys) remap[k] = keys[0];
  const target = (k) => remap[k] || k;

  const labelled = labelWords(clean, segs).map((w) => ({ ...w, speaker: target(w.speaker) }));
  const lines = groupLines(labelled);

  const talkMerged = {};
  for (const [k, ms] of Object.entries(talk)) talkMerged[target(k)] = (talkMerged[target(k)] || 0) + ms;
  const keys = new Set([...Object.keys(talkMerged), ...lines.map((l) => l.speaker)]);
  const voices = [...keys].sort(keyOrder).map((key) => {
    const who = names[key] !== undefined ? names[key] : null;
    return { key, who, source: who !== null ? 'taps' : null, talk_ms: Math.round(talkMerged[key] || 0) };
  });
  return { voices, lines };
}
