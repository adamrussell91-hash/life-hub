import { apiPost } from '@/api/client';
import { deviceToken } from '@/quiz/dom';
import type { ProfilePayload } from '@/student/profile-view';

export type ShareTickKind = 'tick' | 'untick' | 'quiz';
export type ShareTick = { lesson_id: string; title: string; at: string; via: 'tick' | 'quiz' | 'teacher'; planned?: string; record: Array<{ at: string; kind: ShareTickKind }> };
export type ShareBurst = { from: string; to: string; count: number };
export type SharePage = {
  student: { first_name: string };
  class_title: string;
  viewer_initials: string;
  lesson_ids: string[];
  ticks: ShareTick[];
  bursts: ShareBurst[];
  /** The student's own My progress payload, cut for a viewer (progress-share-page.mjs). */
  profile: ProfilePayload;
};
export type ShareReply = SharePage | { need: 'sign_in' };

const path = (token: string) => `/api/published/share/${encodeURIComponent(token)}`;
const device = (token: string) => deviceToken(`share:${token}`);

export const sharePage = (token: string) => apiPost<ShareReply>(path(token), { action: 'page', device_token: device(token) });
export const shareSignIn = (token: string, initials: string, pin: string) => apiPost<ShareReply>(path(token), { action: 'sign_in', device_token: device(token), initials, pin });
export const shareSignOut = (token: string) => apiPost<ShareReply>(path(token), { action: 'sign_out', device_token: device(token) });

export const isSignInNeeded = (reply: ShareReply): reply is { need: 'sign_in' } => 'need' in reply;
