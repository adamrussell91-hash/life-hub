#!/usr/bin/env node
// Meeting transcriber: one run per launch. Logs carry ids, sizes and timings only, never transcript text.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, statSync, unlinkSync, writeSync } from 'node:fs';
import { mkdtemp, readFile, writeFile, stat } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConfig, readToken } from './lib/config.mjs';
import { assemble } from './lib/assemble.mjs';

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const VERSION = '1.0.0';
const LOCK = join(homedir(), '.config', 'meeting-transcriber', 'worker.lock');
const LOCK_MAX_AGE_MS = 4 * 60 * 60 * 1000;
const ENV = { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ''}` };

const log = (...a) => console.log(new Date().toISOString(), ...a);

class StageError extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

function takeLock() {
  mkdirSync(dirname(LOCK), { recursive: true });
  for (let tries = 0; tries < 2; tries++) {
    try {
      const fd = openSync(LOCK, 'wx');
      writeSync(fd, String(process.pid));
      closeSync(fd);
      return true;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let stale = false;
      try {
        const pid = Number(readFileSync(LOCK, 'utf8'));
        const age = Date.now() - statSync(LOCK).mtimeMs;
        let alive = true;
        try { process.kill(pid, 0); } catch (err) { alive = err.code === 'EPERM'; }
        stale = !alive || age > LOCK_MAX_AGE_MS;
      } catch { stale = true; }
      if (!stale) return false;
      try { unlinkSync(LOCK); } catch { /* raced */ }
    }
  }
  return false;
}
function releaseLock() {
  try { unlinkSync(LOCK); } catch { /* gone */ }
}

function api(cfg, token) {
  const base = `${cfg.api_base}/api/meeting-recordings`;
  const headers = { Authorization: `Bearer ${token}` };
  async function call(method, action, { query = {}, body, raw = false, timeout = 60000 } = {}) {
    const qs = new URLSearchParams({ action, ...query }).toString();
    const res = await fetch(`${base}?${qs}`, {
      method,
      headers: body ? { ...headers, 'Content-Type': 'application/json' } : headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout),
    });
    if (raw) {
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
      return Buffer.from(await res.arrayBuffer());
    }
    const text = await res.text();
    let json = {};
    try { json = text ? JSON.parse(text) : {}; } catch { /* non-JSON error page */ }
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status, code: json?.error?.code });
    // Life Hub replies { ok, data }; older shapes are returned as they are.
    return json && typeof json === 'object' && 'data' in json ? json.data : json;
  }
  return {
    heartbeat: () => call('POST', 'heartbeat', { body: { version: VERSION } }),
    queue: () => call('GET', 'queue'),
    claim: (m, r) => call('POST', 'claim', { body: { meeting_id: m, recording_id: r } }),
    part: (m, i) => call('GET', 'worker-part', { query: { meeting_id: m, index: String(i) }, raw: true, timeout: 120000 }),
    transcript: (body) => call('POST', 'transcript', { body, timeout: 180000 }),
    deleteAudio: (m, r) => call('POST', 'delete-audio', { body: { meeting_id: m, recording_id: r } }),
    fail: (m, r, reason) => call('POST', 'fail', { body: { meeting_id: m, recording_id: r, reason } }),
  };
}

async function tool(bin, args, what) {
  try {
    return await run(bin, args, { env: ENV, maxBuffer: 64 * 1024 * 1024, timeout: 6 * 60 * 60 * 1000 });
  } catch (e) {
    // Never echo tool output: it could hold speech. Exit code only.
    throw new StageError(`${what} stopped unexpectedly (exit ${e.code ?? 'unknown'}${e.killed ? ', timed out' : ''})`);
  }
}

export function whisperWords(json) {
  return (json.transcription || [])
    .filter((s) => s && typeof s.text === 'string' && s.text.trim())
    .map((s) => ({ start_ms: s.offsets.from, end_ms: s.offsets.to, text: s.text }));
}

export function speakerCount(work) {
  const attendees = Array.isArray(work.attendees) ? work.attendees.length : 0;
  return attendees + 1 + (work.room ? 1 : 0);
}

// ---- local write-up (private recordings) ----

async function loadPrompts() {
  const path = join(HERE, '..', '..', 'netlify', 'functions', '_shared', 'meeting-writeup.mjs');
  if (!existsSync(path)) return null;
  const mod = await import(pathToFileURL(path).href);
  for (const n of ['sentenceChunks', 'speakerCheckPrompt', 'parseSpeakerCheck', 'writeupPrompt', 'parseWriteup']) {
    if (typeof mod[n] !== 'function') return null;
  }
  return mod;
}

function toMessages(prompt) {
  if (typeof prompt === 'string') return [{ role: 'user', content: prompt }];
  if (Array.isArray(prompt)) return prompt;
  const out = [];
  if (prompt.system) out.push({ role: 'system', content: prompt.system });
  out.push({ role: 'user', content: prompt.user ?? prompt.prompt ?? '' });
  return out;
}

async function localChat(cfg, prompt) {
  const url = cfg.local_llm_url.includes('/chat/completions') ? cfg.local_llm_url : `${cfg.local_llm_url.replace(/\/+$/, '')}/v1/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: cfg.local_llm_model, messages: toMessages(prompt), temperature: 0, response_format: { type: 'json_object' } }),
    signal: AbortSignal.timeout(30 * 60 * 1000),
  });
  if (!res.ok) throw new Error(`local model HTTP ${res.status}`);
  const j = await res.json();
  return j.choices?.[0]?.message?.content ?? '';
}

async function localWriteup(cfg, work, transcript) {
  const mod = await loadPrompts();
  if (!mod) { log('local write-up skipped: prompt module not available'); return null; }
  const ctx = { attendees: work.attendees || [], room: !!work.room, taps: work.taps || [], flags: work.flags || [], glossary: work.glossary || [], private: true };
  let checked = true;
  try {
    for (const chunk of mod.sentenceChunks(transcript)) {
      const reply = await localChat(cfg, mod.speakerCheckPrompt(ctx, chunk));
      const r = mod.parseSpeakerCheck(reply, chunk, ctx);
      if (typeof mod.applySpeakerCheck === 'function') mod.applySpeakerCheck(transcript, r);
      else {
        for (const c of r.changes || []) {
          const l = transcript.lines[c.line];
          if (l) { l.who_override = c.who; l.moved = true; }
        }
        for (const i of r.unsure || []) if (transcript.lines[i]) transcript.lines[i].unsure = true;
      }
    }
  } catch (e) {
    checked = false;
    log('local speaker check failed', e.message);
  }
  transcript.speakers_checked = checked;
  try {
    const reply = await localChat(cfg, mod.writeupPrompt(ctx, transcript, work.notes || [], work.flags || []));
    const w = mod.parseWriteup(reply, ctx, transcript, work.notes || []);
    w.speakers_checked = checked;
    w.status = checked ? 'done' : 'unchecked';
    return w;
  } catch (e) {
    log('local write-up failed', e.message);
    return null;
  }
}

/** [from, to) part ranges, one per recorder run. */
export function segmentRuns(segmentStarts, n) {
  const starts = (Array.isArray(segmentStarts) ? segmentStarts : [0]).filter((i) => Number.isInteger(i) && i > 0 && i < n);
  const edges = [0, ...new Set(starts.sort((a, b) => a - b)), n];
  return edges.slice(0, -1).map((from, k) => [from, edges[k + 1]]);
}

// ---- one recording ----

async function process_(cfg, A, work) {
  const { meeting_id: mid, recording_id: rid } = work;
  const t0 = Date.now();
  const tmp = await mkdtemp(join(tmpdir(), 'mt-'));
  chmodSync(tmp, 0o700);
  try {
    let stage = 'download';
    try {
      const n = Number(work.parts_expected) || 0;
      if (!n) throw new StageError('The recording has no audio parts');
      const bufs = [];
      for (let i = 0; i < n; i++) {
        try { bufs.push(await A.part(mid, i)); } catch (e) { throw new StageError(`Part ${i + 1} of ${n} would not download (${e.status || 'network'})`); }
      }
      log('downloaded', rid, 'parts', n, 'bytes', bufs.reduce((s, b) => s + b.length, 0));

      // A mic switch starts a fresh recorder whose first part carries its own file header,
      // so each run of parts is converted on its own and the WAVs are joined after.
      stage = 'convert';
      const starts = segmentRuns(work.segment_starts, n);
      const wav = join(tmp, 'in.wav');
      let t = Date.now();
      const pieces = [];
      for (const [k, [from, to]] of starts.entries()) {
        const raw = join(tmp, `seg${k}.bin`);
        await writeFile(raw, Buffer.concat(bufs.slice(from, to)), { mode: 0o600 });
        const piece = starts.length === 1 ? wav : join(tmp, `seg${k}.wav`);
        await tool(cfg.ffmpeg_bin, ['-loglevel', 'error', '-y', '-i', raw, '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', piece], 'Audio conversion');
        rmSync(raw, { force: true });
        pieces.push(piece);
      }
      if (pieces.length > 1) {
        const list = join(tmp, 'list.txt');
        await writeFile(list, pieces.map((p) => `file '${p}'`).join('\n'), { mode: 0o600 });
        await tool(cfg.ffmpeg_bin, ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', wav], 'Audio joining');
        for (const p of pieces) rmSync(p, { force: true });
      }
      const wavBytes = (await stat(wav)).size;
      const wavMs = Math.round(((wavBytes - 44) / 32000) * 1000);
      log('converted', rid, 'ms', Date.now() - t, 'audio_ms', wavMs, 'segments', starts.length);

      stage = 'words';
      t = Date.now();
      await tool(cfg.whisper_bin, ['-m', cfg.whisper_model, '-f', wav, '-l', 'en', '-ml', '1', '-sow', '-oj', '-of', join(tmp, 'w'), '-np'], 'Word transcription');
      const words = whisperWords(JSON.parse(await readFile(join(tmp, 'w.json'), 'utf8')));
      log('words', rid, 'count', words.length, 'ms', Date.now() - t);

      stage = 'speakers';
      t = Date.now();
      const count = speakerCount(work);
      const d = await tool(cfg.diarize_python, [join(HERE, 'diarize.py'), wav, String(count), '--models', cfg.diarize_models], 'Speaker labelling');
      let segments;
      try {
        segments = JSON.parse(d.stdout).map((s) => ({ start_ms: Math.round(s.start * 1000), end_ms: Math.round(s.end * 1000), speaker: s.speaker }));
      } catch { throw new StageError('Speaker labelling returned nothing readable'); }
      log('speakers', rid, 'segments', segments.length, 'count', count, 'ms', Date.now() - t);

      stage = 'assemble';
      const { voices, lines } = assemble({ words, segments, taps: work.taps || [] });
      if (!lines.length) throw new StageError('No speech was found in the recording');
      const transcript = {
        recording_id: rid,
        duration_ms: Number(work.duration_ms) > 0 ? Number(work.duration_ms) : wavMs,
        engine: { words: 'whisper.cpp large-v3-turbo-q5_0', speakers: 'sherpa-onnx titanet_small' },
        voices,
        lines,
        speakers_checked: false,
      };

      let writeup = null;
      if (work.private && cfg.local_llm_url) {
        stage = 'local write-up';
        t = Date.now();
        writeup = await localWriteup(cfg, work, transcript);
        log('local write-up', rid, writeup ? writeup.status : 'none', 'ms', Date.now() - t);
      }

      stage = 'send';
      let sent;
      try {
        sent = await A.transcript({ meeting_id: mid, recording_id: rid, transcript, writeup });
      } catch (e) {
        // Already stored on an earlier run: go on and delete the audio.
        if (e.status === 409 && e.code === 'not_transcribing') sent = { stored_key: 'earlier' };
        else throw new StageError(`Life Hub would not take the transcript (${e.status || 'network'})`);
      }
      log('transcript stored', rid, 'lines', lines.length, 'voices', voices.length, 'key', sent?.stored_key ? 'yes' : 'no');

      stage = 'delete';
      await A.deleteAudio(mid, rid).catch((e) => log('delete-audio failed, next run retries', rid, e.status || e.message));
    } catch (e) {
      const reason = e instanceof StageError ? e.reason : `The worker hit a problem at the ${stage} step`;
      log('failed', rid, stage, reason);
      await A.fail(mid, rid, reason).catch(() => log('fail call did not reach Life Hub', rid));
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    log('done', rid, 'total_ms', Date.now() - t0);
  }
}

async function main() {
  if (!takeLock()) { log('another run is active, leaving'); return; }
  try {
    const cfg = loadConfig();
    const A = api(cfg, readToken());
    await A.heartbeat();
    const q = await A.queue();
    for (const d of q.delete_audio || []) {
      try { await A.deleteAudio(d.meeting_id, d.recording_id); log('deleted pending audio', d.recording_id); }
      catch (e) { log('pending delete failed', d.recording_id, e.status || e.message); }
    }
    for (const work of q.work || []) {
      try { await A.claim(work.meeting_id, work.recording_id); }
      catch (e) { if (e.status === 409) continue; throw e; }
      log('claimed', work.recording_id, 'duration_ms', work.duration_ms, 'private', !!work.private);
      await process_(cfg, A, work);
      break; // one recording per run
    }
  } finally {
    releaseLock();
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((e) => { log('run failed', e.message); process.exitCode = 1; });
}
