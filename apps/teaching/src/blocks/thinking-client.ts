import { apiGet, apiPost } from '@/api/client';
import { pulseDeviceId } from '@/student/block-pulse';
import { cleanInitials, rememberInitials, voiceDevice } from '@/blocks/voice-client';

/**
 * Calls for the thinking blocks' class responses (Diamond 9, Two-text Venn,
 * choice board). Server: netlify/functions/_shared/thinking-responses.mjs.
 * One record per device per block; a resend replaces it.
 */

export type ThinkingResponse<T> = { at: string; kind: string; initials: string; data: T };
export type ThinkingSet<T> = { lesson_id: string; block_id: string; responses: Array<ThinkingResponse<T>> };
export type ThinkingReply = { saved: true; class?: { layouts: string[][] } };

/** The initials this device last typed (shared with the Voice block's box). */
export function savedInitials(): string {
  return voiceDevice().initials ?? '';
}

export function keepInitials(value: string): string {
  const clean = cleanInitials(value);
  if (clean) rememberInitials(clean);
  return clean;
}

export function sendThinking<T extends object>(lessonId: string, blockId: string, initials: string, data: T): Promise<ThinkingReply> {
  return apiPost<ThinkingReply>(`/api/published/thinking/${encodeURIComponent(lessonId)}`, {
    block_id: blockId,
    device_id: pulseDeviceId(),
    initials: cleanInitials(initials),
    data
  });
}

export function fetchThinking<T>(lessonId: string, blockId: string): Promise<ThinkingSet<T>> {
  return apiGet<ThinkingSet<T>>(`/api/lessons/${encodeURIComponent(lessonId)}/thinking?block_id=${encodeURIComponent(blockId)}`);
}

export function resetThinking<T>(lessonId: string, blockId: string): Promise<ThinkingSet<T>> {
  return apiPost<ThinkingSet<T>>(`/api/lessons/${encodeURIComponent(lessonId)}/thinking`, { action: 'reset', block_id: blockId });
}
