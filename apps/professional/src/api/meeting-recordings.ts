/**
 * Typed client for `/api/meeting-recordings` (browser routes) and `/api/people-said`.
 * Shapes follow docs/superpowers/plans/2026-11-19-meeting-recording-build.md exactly.
 * Part uploads go through `fetch` + FormData (not apiPost, which gives up at 20 s).
 */
import { apiGet, apiPatch, apiPost, ApiClientError, parseApiResponse } from '@/api/client';
import { getApiBaseUrl } from '@/api/config';

/** `'me'`, an attendee's person ref, `'room'` (someone in the audience) or `null` (unnamed voice). */
export type Who = string | null;

export type RecordingKind = 'meeting' | 'event';
export type RecordingStatus = 'recording' | 'uploaded' | 'transcribing' | 'writing_up' | 'done' | 'failed';
export type WriteupStatus = 'none' | 'running' | 'done' | 'unchecked' | 'failed' | 'private_none';

export interface RecordingTap { who: string; at_ms: number }
export interface RecordingFlag { kind: 'task' | 'poi'; at_ms: number }
export interface RecordingAttendee { who: string; name: string; role: string | null }

export interface MeetingRecording {
  id: string;
  meeting_id: string;
  kind: RecordingKind;
  status: RecordingStatus;
  private: boolean;
  consent_confirmed_at: string;
  started_at: string;
  stopped_at: string | null;
  duration_ms: number;
  parts_expected: number | null;
  parts_received: number[];
  taps: RecordingTap[];
  flags: RecordingFlag[];
  notes: string[];
  attendees: RecordingAttendee[];
  room: boolean;
  attempts: number;
  error: string | null;
  claimed_until: string | null;
  transcript_key: string | null;
  audio_deleted_at: string | null;
  writeup_status: WriteupStatus;
  writeup_job?: { id: string; queued_at: string | null; started_at: string | null } | null;
}

export interface TranscriptVoice {
  key: string;
  who: Who;
  source: 'taps' | 'picked' | 'check' | null;
  talk_ms: number;
}

export interface TranscriptLine {
  start_ms: number;
  end_ms: number;
  speaker: string;
  text: string;
  who_override: Who;
  moved: boolean;
  unsure: boolean;
}

export interface MeetingTranscript {
  recording_id: string;
  duration_ms: number;
  engine: { words: string; speakers: string };
  voices: TranscriptVoice[];
  lines: TranscriptLine[];
  speakers_checked: boolean;
}

/** `start_ms` and `line` may be null when the write-up couldn't place a point in the transcript. */
export interface WriteupFlowSegment { start_ms: number | null; mins: number; title: string; text: string; who: string[]; line: number | null }
export interface WriteupBuilt { note_index: number | null; text: string; who: Who; start_ms: number | null; line: number | null }
export interface WriteupPickMine { text: string; due: string | null; due_label: string | null; quote: string; start_ms: number | null; line: number | null }
export interface WriteupPickOther { who: Who; text: string; due: string | null; quote: string; start_ms: number | null; line: number | null }
export interface WriteupPickPoi { who: Who; text: string; quote: string; start_ms: number | null; line: number | null }
export interface WriteupPerson { who: string; points: Array<{ text: string; star: boolean }>; quote?: string; line?: number | null }

export type BuiltReviewState = 'kept' | 'gone';
export interface PickReview { state: 'done' | 'x'; note: string }

export interface MeetingWriteup {
  status: 'done' | 'unchecked' | 'failed' | 'private_none';
  speakers_checked: boolean;
  /** Escaped HTML with only <b> allowed (render as HTML). Every other field is plain text. */
  overview: string;
  flow: WriteupFlowSegment[];
  built: WriteupBuilt[];
  picks: { mine: WriteupPickMine[]; others: WriteupPickOther[]; poi: WriteupPickPoi[] };
  persons: WriteupPerson[];
  review: { built: Record<string, BuiltReviewState>; picks: Record<string, PickReview> };
  error: string | null;
  created_at: string;
}

export interface MacStatus { last_seen_at: string | null; version: string | null }

export interface RecordingBundle {
  recording: MeetingRecording | null;
  transcript?: MeetingTranscript | null;
  writeup?: MeetingWriteup | null;
  mac: MacStatus;
}

export interface PeopleSaidEntry {
  person_ref: string;
  meeting_id: string;
  meeting_title: string;
  date: string;
  kind: RecordingKind;
  points: Array<{ text: string; star: boolean }>;
  quote: string;
  line: number;
}

const BASE = '/api/meeting-recordings';

function q(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}

export function getRecordingBundle(meetingId: string, options: { signal?: AbortSignal } = {}): Promise<RecordingBundle> {
  return apiGet<RecordingBundle>(`${BASE}?${q({ meeting_id: meetingId })}`, options);
}

export function startRecording(body: {
  meeting_id: string;
  consent_confirmed: true;
  private: boolean;
  kind: RecordingKind;
  attendees: RecordingAttendee[];
  room: boolean;
  replace?: boolean;
}): Promise<{ recording: MeetingRecording }> {
  return apiPost(`${BASE}?action=start`, body);
}

/** The server takes a part of at most 4.5 MB. A 60 s slice at 32 kbps is about 240 KB. */
export const PART_MAX_BYTES = 4.5 * 1024 * 1024;

/**
 * One slice as multipart, with the session cookie, like the Teaching voice recorder's
 * `/api/annotation/voice/part`. Idempotent on the server, so a retry is always safe.
 */
export async function uploadRecordingPart(input: {
  meeting_id: string;
  recording_id: string;
  index: number;
  blob: Blob;
  signal?: AbortSignal;
}): Promise<{ index: number; bytes: number; parts_received: number[] }> {
  if (input.blob.size > PART_MAX_BYTES) {
    throw new ApiClientError({ code: 'part_too_large', message: `Part ${input.index + 1} is too large to upload.` });
  }
  const form = new FormData();
  form.append('meeting_id', input.meeting_id);
  form.append('recording_id', input.recording_id);
  form.append('index', String(input.index));
  form.append('file', input.blob, `part-${String(input.index).padStart(4, '0')}`);
  const signal = input.signal ?? (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(120_000) : undefined);
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${BASE}?action=part`, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      body: form,
      signal
    });
  } catch (cause) {
    throw new ApiClientError({ code: 'network_error', message: cause instanceof Error ? cause.message : 'Upload failed' });
  }
  const result = await parseApiResponse<{ index: number; bytes: number; parts_received: number[] }>(response);
  if (!result.ok) throw new ApiClientError(result.error, response.status, result.data);
  return result.data;
}

export function stopRecording(body: {
  meeting_id: string;
  recording_id: string;
  parts_expected: number;
  duration_ms: number;
  taps: RecordingTap[];
  flags: RecordingFlag[];
  notes: string[];
  /** Part indices where a new audio container starts (a resumed recording). Extra to the contract; ignored if unknown. */
  segment_starts?: number[];
}): Promise<{ recording: MeetingRecording; missing: number[] }> {
  return apiPost(`${BASE}?action=stop`, body);
}

export function saveRecordingNotes(meetingId: string, notes: string[]): Promise<{ recording: MeetingRecording }> {
  return apiPost(`${BASE}?action=notes`, { meeting_id: meetingId, notes });
}

export function patchSpeakers(body: {
  meeting_id: string;
  voices?: Record<string, Who>;
  lines?: Record<string, Who>;
}): Promise<{ transcript: MeetingTranscript; writeup: MeetingWriteup | null }> {
  return apiPatch(`${BASE}?action=speakers`, { voices: {}, lines: {}, ...body });
}

export function rerunWriteup(meetingId: string): Promise<{ recording: MeetingRecording }> {
  return apiPost(`${BASE}?action=writeup`, { meeting_id: meetingId });
}

export function patchReview(body: {
  meeting_id: string;
  built?: Record<string, BuiltReviewState>;
  picks?: Record<string, PickReview>;
}): Promise<{ writeup: MeetingWriteup }> {
  return apiPatch(`${BASE}?action=review`, body);
}

export function retryRecording(meetingId: string): Promise<{ recording: MeetingRecording }> {
  return apiPost(`${BASE}?action=retry`, { meeting_id: meetingId });
}

/** One stored part's bytes, while Life Hub still holds the audio (404 once deleted). */
export async function fetchRecordingPart(meetingId: string, index: number): Promise<Blob> {
  const response = await fetch(`${getApiBaseUrl()}${BASE}?${q({ action: 'audio', meeting_id: meetingId, index: String(index) })}`, {
    credentials: 'include',
    cache: 'no-store'
  });
  if (!response.ok) {
    throw new ApiClientError({ code: response.status === 404 ? 'not_found' : 'download_failed', message: response.status === 404 ? 'Life Hub no longer has that audio.' : `Download failed (HTTP ${response.status})` }, response.status);
  }
  return response.blob();
}

export async function deleteRecording(meetingId: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${BASE}?${q({ meeting_id: meetingId })}`, {
      method: 'DELETE',
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
  } catch (cause) {
    throw new ApiClientError({ code: 'network_error', message: cause instanceof Error ? cause.message : 'Delete failed' });
  }
  const result = await parseApiResponse<unknown>(response);
  if (!result.ok) throw new ApiClientError(result.error, response.status, result.data);
}

export function listPeopleSaid(personRef: string, options: { signal?: AbortSignal } = {}): Promise<{ entries: PeopleSaidEntry[] }> {
  return apiGet(`/api/people-said?${q({ person_ref: personRef })}`, options);
}
