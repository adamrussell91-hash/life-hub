import { apiGet, apiPost } from '@/api/client';

export const uploadMinutesFile = (meetingId: string, data: string) =>
  apiPost<{ file_key: string }>('/api/meetings/minutes-file', { meeting_id: meetingId, media_type: 'application/pdf', data });

export const fetchMinutesFile = (key: string) =>
  apiGet<{ media_type: string; data: string }>(`/api/meetings/minutes-file?key=${encodeURIComponent(key)}`);
