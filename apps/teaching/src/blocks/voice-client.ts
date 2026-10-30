import { apiPost, ApiClientError } from '@/api/client';
import { getApiBaseUrl } from '@/api/config';
import { readJSON, writeJSON } from '@/blocks/peer-feedback-ui';
import type { FeedbackCode } from '@/blocks/feedback-codes';
import { deviceToken } from '@/quiz/dom';

/**
 * Student-side calls for the Voice block. Students have no accounts: the
 * device keeps a random token (shared by every Voice block) and the initials
 * the student typed once. The server only ever sees the token's hash.
 */

const DEVICE_KEY = 'voice:device';
export const VOICE_PART_BYTES = 4 * 1024 * 1024;

export type VoiceDevice = { token: string; initials?: string };

export type VoiceTag = {
  id: string;
  code_id: string;
  code: string;
  label: string;
  positive: boolean;
  t: number;
  w: [number, number];
  note?: string;
};

export type WhisperTranscript = Record<string, unknown> & { text?: string };

export type MineState =
  | { submitted: false }
  | {
      submitted: true;
      initials: string;
      submitted_at: string;
      duration_s: number;
      status: 'waiting' | 'returned';
      audio_url: string | null;
      audio_deleted: boolean;
      audio_delete_after: string;
      returned_at?: string;
      prompt?: string;
      points?: Array<{ label: string; t: number }>;
      transcript?: WhisperTranscript | null;
      tags?: VoiceTag[];
      comment?: string;
      codes?: FeedbackCode[];
    };

function randomHex(bytes: number): string {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return [...values].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function voiceDevice(): VoiceDevice {
  const saved = readJSON<VoiceDevice>(DEVICE_KEY);
  if (saved && /^[a-f0-9]{48}$/.test(saved.token)) return saved;
  const fresh = { token: randomHex(24) };
  writeJSON(DEVICE_KEY, fresh);
  return fresh;
}

export function rememberInitials(initials: string): void {
  writeJSON(DEVICE_KEY, { ...voiceDevice(), initials });
}

export function cleanInitials(value: string): string {
  return value.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4);
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function audioUrl(path: string): string {
  return /^(https?:|blob:)/.test(path) ? path : `${getApiBaseUrl()}${path}`;
}

const endpoint = (lessonId: string, blockId: string) => `/api/published/voice/${encodeURIComponent(lessonId)}/${encodeURIComponent(blockId)}`;

export function fetchMine(lessonId: string, blockId: string): Promise<MineState> {
  return apiPost<MineState>(endpoint(lessonId, blockId), { action: 'mine', token: voiceDevice().token });
}

async function withRetry<T>(job: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      return await job();
    } catch (error) {
      last = error;
      if (error instanceof ApiClientError && error.code !== 'network_error' && error.code !== 'missing_part') throw error;
      if (attempt < tries - 1) await new Promise((resolve) => setTimeout(resolve, 800 * 2 ** attempt));
    }
  }
  throw last;
}

async function postPart(path: string, form: FormData): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, { method: 'POST', credentials: 'include', headers: { Accept: 'application/json' }, body: form });
  } catch (cause) {
    throw new ApiClientError({ code: 'network_error', message: cause instanceof Error ? cause.message : 'Network request failed' });
  }
  const body = (await response.json().catch(() => null)) as { ok?: boolean; error?: { code: string; message: string } } | null;
  if (!response.ok || !body?.ok) throw new ApiClientError(body?.error ?? { code: 'upload_failed', message: `Upload failed (${response.status})` });
}

let voiceClass: string | null = null;
/** The class page this lesson was opened from. A take then says whose it is, using the device's class claim. */
export function setVoiceClass(classId: string | null): void {
  voiceClass = classId;
}

/** Sends one take in ≤4 MB parts, then submits it. Each part retries on its own. */
export async function submitTake(input: {
  lessonId: string;
  blockId: string;
  blob: Blob;
  mime: string;
  duration_s: number;
  initials: string;
  points: Array<{ label: string; t: number }>;
  onProgress?: (sent: number, total: number) => void;
}): Promise<MineState> {
  const { token } = voiceDevice();
  const uploadId = `${(await sha256Hex(token)).slice(0, 16)}_${randomHex(6)}`;
  const total = Math.max(1, Math.ceil(input.blob.size / VOICE_PART_BYTES));
  const base = endpoint(input.lessonId, input.blockId);
  for (let index = 0; index < total; index += 1) {
    const part = input.blob.slice(index * VOICE_PART_BYTES, (index + 1) * VOICE_PART_BYTES);
    await withRetry(() => {
      const form = new FormData();
      form.append('token', token);
      form.append('upload_id', uploadId);
      form.append('index', String(index));
      form.append('file', part, `part-${index}`);
      return postPart(`${base}/part`, form);
    });
    input.onProgress?.(index + 1, total);
  }
  return withRetry(() =>
    apiPost<MineState>(base, {
      action: 'submit',
      token,
      initials: input.initials,
      ...(voiceClass ? { class_id: voiceClass, class_token: deviceToken(`class:${voiceClass}`) } : {}),
      upload_id: uploadId,
      parts: total,
      mime: input.mime,
      duration_s: input.duration_s,
      points: input.points
    })
  );
}
