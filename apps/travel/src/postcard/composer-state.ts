/**
 * What the postcard sheet knows, and how each thing that happens changes it. Pure: the
 * sheet (composer.ts) only draws this and runs the uploads.
 */
import type { PostcardInput } from '@/api/travel';
import { POSTCARD_MAX_AUDIO_S, POSTCARD_MAX_TEXT_CHARS, tidyAddress } from '@/postcard/model';
import type { PostcardOrientation } from '@/types';

export interface ComposerState {
  photoName: string | null;
  orientation: PostcardOrientation | null;
  photoBusy: boolean;
  photoError: string | null;
  recording: boolean;
  elapsedS: number;
  /** Length of the clip in hand, or null with no clip. */
  clipSeconds: number | null;
  micError: string | null;
  audioId: string | null;
  audio: 'idle' | 'uploading' | 'failed';
  transcript: 'idle' | 'working' | 'failed';
  text: string;
  /** Always four lines; blank ones are dropped when posting. */
  address: string[];
  addressTouched: boolean;
  posting: boolean;
  error: string | null;
  restored: boolean;
}

export type ComposerEvent =
  | { type: 'photo_reading' }
  | { type: 'photo_ready'; name: string; orientation: PostcardOrientation }
  | { type: 'photo_failed'; message: string }
  | { type: 'photo_removed' }
  | { type: 'address_resolved'; lines: string[] }
  | { type: 'address_edited'; index: number; value: string }
  | { type: 'record_started' }
  | { type: 'record_tick'; elapsedS: number }
  | { type: 'record_ended'; seconds: number | null }
  | { type: 'record_failed'; message: string }
  | { type: 'clip_removed' }
  | { type: 'audio_uploading' }
  | { type: 'audio_uploaded'; audioId: string }
  | { type: 'audio_failed' }
  | { type: 'transcript_working' }
  | { type: 'transcript_done'; text: string }
  | { type: 'transcript_failed' }
  | { type: 'text_edited'; value: string }
  | { type: 'post_started' }
  | { type: 'post_failed'; message: string }
  | { type: 'reset'; address: string[] };

const fourLines = (lines: string[]): string[] => [0, 1, 2, 3].map((i) => lines[i] ?? '');
const cutText = (value: string): string => Array.from(value).slice(0, POSTCARD_MAX_TEXT_CHARS).join('');

export function initialComposerState(address: string[], restored: Partial<ComposerState> = {}): ComposerState {
  return {
    photoName: null,
    orientation: null,
    photoBusy: false,
    photoError: null,
    recording: false,
    elapsedS: 0,
    clipSeconds: null,
    micError: null,
    audioId: null,
    audio: 'idle',
    transcript: 'idle',
    text: '',
    address: fourLines(address),
    addressTouched: false,
    posting: false,
    error: null,
    restored: false,
    ...restored
  };
}

export function composerReducer(state: ComposerState, event: ComposerEvent): ComposerState {
  switch (event.type) {
    case 'photo_reading':
      return { ...state, photoBusy: true, photoError: null };
    case 'photo_ready':
      return { ...state, photoBusy: false, photoError: null, photoName: event.name, orientation: event.orientation, error: null };
    case 'photo_failed':
      return { ...state, photoBusy: false, photoError: event.message, photoName: null, orientation: null };
    case 'photo_removed':
      return { ...state, photoName: null, orientation: null, photoError: null };
    case 'address_resolved':
      // A lookup never replaces what the owner typed.
      return state.addressTouched ? state : { ...state, address: fourLines(event.lines) };
    case 'address_edited':
      return {
        ...state,
        addressTouched: true,
        address: state.address.map((line, i) => (i === event.index ? event.value : line))
      };
    case 'record_started':
      return { ...state, recording: true, elapsedS: 0, micError: null, clipSeconds: null, audioId: null, audio: 'idle', transcript: 'idle' };
    case 'record_tick':
      return state.recording ? { ...state, elapsedS: event.elapsedS } : state;
    case 'record_ended':
      return event.seconds === null
        ? { ...state, recording: false, micError: 'Nothing was recorded. Try again.' }
        : { ...state, recording: false, clipSeconds: event.seconds };
    case 'record_failed':
      return { ...state, recording: false, micError: event.message };
    case 'clip_removed':
      return { ...state, clipSeconds: null, audioId: null, audio: 'idle', transcript: 'idle', micError: null };
    case 'audio_uploading':
      return { ...state, audio: 'uploading' };
    case 'audio_uploaded':
      return { ...state, audio: 'idle', audioId: event.audioId };
    case 'audio_failed':
      return { ...state, audio: 'failed' };
    case 'transcript_working':
      return { ...state, transcript: 'working' };
    case 'transcript_done':
      // The words fill the box only when the owner has not written their own.
      return { ...state, transcript: 'idle', text: state.text.trim() ? state.text : cutText(event.text) };
    case 'transcript_failed':
      return { ...state, transcript: 'failed' };
    case 'text_edited':
      return { ...state, text: cutText(event.value) };
    case 'post_started':
      return { ...state, posting: true, error: null };
    case 'post_failed':
      return { ...state, posting: false, error: event.message };
    case 'reset':
      return initialComposerState(event.address);
  }
}

/** Why Post cannot be pressed yet, in words, or null when it can. Transcription never holds it back. */
export function postBlocker(state: ComposerState): string | null {
  if (state.photoBusy) return 'Reading the photo…';
  if (!state.photoName || !state.orientation) return 'Choose a photo to post.';
  if (state.recording) return 'Stop the recording first.';
  if (state.clipSeconds !== null && !state.audioId) {
    return state.audio === 'failed'
      ? "The recording didn't send. Try again, or remove it."
      : 'Sending the recording…';
  }
  return null;
}

/** True once the sheet holds anything worth keeping. */
export function hasContent(state: ComposerState): boolean {
  return Boolean(state.photoName || state.clipSeconds !== null || state.text.trim() || state.addressTouched);
}

/** The postcard as the server takes it. Blank address lines are dropped; none at all means the fallback. */
export function buildPostcard(state: ComposerState, photoId: string, fallbackAddress: string[]): PostcardInput {
  const address = tidyAddress(state.address);
  const text = state.text.replace(/\s+/g, ' ').trim();
  return {
    photo_id: photoId,
    orientation: state.orientation ?? 'landscape',
    address: address.length ? address : tidyAddress(fallbackAddress),
    ...(state.audioId && state.clipSeconds !== null
      ? { audio_id: state.audioId, audio_s: Math.min(POSTCARD_MAX_AUDIO_S, Math.max(1, Math.round(state.clipSeconds))) }
      : {}),
    ...(text ? { text } : {})
  };
}
