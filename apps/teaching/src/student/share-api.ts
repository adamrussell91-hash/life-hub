import { apiPost } from '@/api/client';
import { deviceToken } from '@/quiz/dom';

export type ShareTickKind = 'tick' | 'untick' | 'quiz';
export type ShareTick = { lesson_id: string; title: string; at: string; via: 'tick' | 'quiz' | 'teacher'; planned?: string; record: Array<{ at: string; kind: ShareTickKind }> };
export type ShareBurst = { from: string; to: string; count: number };
export type SharePage = {
  student: { first_name: string };
  class_title: string;
  viewer_initials: string;
  lesson_ids: string[];
  next: Array<{ title: string; lesson_id: string; box: 'now' | 'next' }>;
  unit: { title: string; core_done: number; core_total: number };
  countdowns: Array<{ title: string; lesson_id: string; due_date: string; due_time: string; assessment: boolean }>;
  ticks: ShareTick[];
  bursts: ShareBurst[];
  practice: { streak: number; days: string[]; weekly: Array<{ week_start: string; right: number; seen: number }>; today: { left: number; answered: number } | null };
  feedback: { to_act: Array<{ title: string; redraft: boolean }>; waiting: number };
};
export type ShareReply = SharePage | { need: 'sign_in' };

const path = (token: string) => `/api/published/share/${encodeURIComponent(token)}`;
const device = (token: string) => deviceToken(`share:${token}`);

export const sharePage = (token: string) => apiPost<ShareReply>(path(token), { action: 'page', device_token: device(token) });
export const shareSignIn = (token: string, initials: string, pin: string) => apiPost<ShareReply>(path(token), { action: 'sign_in', device_token: device(token), initials, pin });
export const shareSignOut = (token: string) => apiPost<ShareReply>(path(token), { action: 'sign_out', device_token: device(token) });

export const isSignInNeeded = (reply: ShareReply): reply is { need: 'sign_in' } => 'need' in reply;
