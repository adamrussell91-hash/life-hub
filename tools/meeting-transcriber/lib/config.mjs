import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const SPIKE = join(homedir(), 'Tools', 'meeting-transcriber');

export const CONFIG_PATH = join(homedir(), '.config', 'meeting-transcriber', 'config.json');

export function defaults() {
  return {
    // Site origin; the worker adds /api/meeting-recordings.
    api_base: 'https://life-hub.adam-russell.com',
    whisper_bin: '/opt/homebrew/bin/whisper-cli',
    whisper_model: join(SPIKE, 'models', 'ggml-large-v3-turbo-q5_0.bin'),
    ffmpeg_bin: '/opt/homebrew/bin/ffmpeg',
    diarize_python: join(SPIKE, '.venv', 'bin', 'python'),
    diarize_models: join(SPIKE, 'models'),
    local_llm_url: null,
    local_llm_model: 'local',
  };
}

export function loadConfig(path = process.env.MEETING_TRANSCRIBER_CONFIG || CONFIG_PATH) {
  let file = {};
  try {
    file = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') throw new Error('Config file is not valid JSON');
  }
  const cfg = { ...defaults(), ...file };
  for (const k of ['whisper_model', 'diarize_models', 'diarize_python', 'whisper_bin', 'ffmpeg_bin']) {
    if (typeof cfg[k] === 'string' && cfg[k].startsWith('~/')) cfg[k] = join(homedir(), cfg[k].slice(2));
  }
  cfg.api_base = String(cfg.api_base).replace(/\/+$/, '');
  return cfg;
}

// Token comes from the Keychain only; it is never written to a file or logged.
export function readToken() {
  // For a local end-to-end check against a test server only; launchd never sets it.
  if (process.env.MEETING_TRANSCRIBER_TEST_TOKEN) return process.env.MEETING_TRANSCRIBER_TEST_TOKEN;
  try {
    return execFileSync('security', ['find-generic-password', '-s', 'life-hub-meeting-transcriber', '-w'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    throw new Error('No token in the Keychain (service life-hub-meeting-transcriber)');
  }
}
