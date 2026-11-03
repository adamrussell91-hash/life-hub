import { apiGet, apiPost } from './client';
import type { SharedSheet } from '@teaching/student/sheet-render';

export interface SheetPicks {
  title: string;
  message: string;
  from: string;
  summary: boolean;
  notes: boolean;
  annotations: boolean;
  voice: boolean;
  minutes: boolean;
  coaching: boolean;
  off_layers: string[];
}

export interface SheetOptions {
  title: string;
  summary: boolean;
  notes: boolean;
  annotations: boolean;
  voice: boolean;
  minutes: boolean;
  coaching: boolean;
  layers: Array<{ id: string; name: string; colour?: string; private: boolean }>;
}

export interface SheetShare {
  token: string;
  created_at: string;
  updated_at: string;
  picks: SheetPicks;
  sheet: SharedSheet | null;
}

export interface SheetLeftOff {
  blocks: number;
  promise_lines: number;
  minutes_sections: number;
  voice_unpublished: number;
}

const path = (meetingId: string, action?: string) =>
  `/api/meeting-sheets?meeting_id=${encodeURIComponent(meetingId)}${action ? `&action=${action}` : ''}`;

export function loadSheetState(meetingId: string): Promise<{ options: SheetOptions; picks: SheetPicks; share: SheetShare | null }> {
  return apiGet(path(meetingId));
}

export function previewSheet(meetingId: string, picks: SheetPicks): Promise<{ sheet: SharedSheet; left_off: SheetLeftOff }> {
  return apiPost(path(meetingId, 'preview'), { picks });
}

export function publishSheet(meetingId: string, picks: SheetPicks): Promise<{ share: SheetShare; left_off: SheetLeftOff }> {
  return apiPost(path(meetingId, 'publish'), { picks });
}

export function stopSheet(meetingId: string): Promise<{ share: null }> {
  return apiPost(path(meetingId, 'stop'), {});
}
