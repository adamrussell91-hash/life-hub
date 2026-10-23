// apps/teaching/src/lecture/api.ts
import { apiPost } from '@/api/client';
import { getApiBaseUrl } from '@/api/config';
import { deviceToken } from '@/quiz/dom';

export type LectureIdentity = { need: 'class' | 'initials' | null; initials: string | null };
export type MyHandup = { id: string; scene_id: string; scene_label: string; text: string; status: 'open' | 'answered'; reply: string; at: string };
export type LectureStatus = { identity: LectureIdentity; handups: MyHandup[] };
export type ProgressBody = { reached: string[]; replays: Record<string, number>; last_scene: string; missed: string[]; ticked: number; finished: boolean };

/** What the player needs from the server. Preview passes null and sends nothing. */
export type LectureClient = {
  status(): Promise<LectureStatus>;
  claim(initials: string): Promise<LectureStatus>;
  handup(input: { scene_id: string; scene_label: string; clip_s: number; text: string }): Promise<LectureStatus>;
  progress(body: ProgressBody, leaving?: boolean): void;
};

/**
 * Students are known by the class initials the quiz uses: the same device
 * token per class, so a student who claimed for a quiz is already known here.
 */
export function lectureClient(lessonId: string, classId: string | undefined): LectureClient {
  const endpoint = `/api/published/lecture/${encodeURIComponent(lessonId)}`;
  const classToken = classId ? deviceToken(`class:${classId}`) : null;
  const fields = classId ? { class_id: classId, ...(classToken ? { class_token: classToken } : {}) } : {};
  const call = (action: string, extra: Record<string, unknown> = {}) => apiPost<LectureStatus>(endpoint, { action, ...fields, ...extra });
  return {
    status: () => call('status'),
    claim: (initials) => call('claim', { initials }),
    handup: (input) => call('handup', input),
    progress(body, leaving = false) {
      const payload = { action: 'progress', ...fields, ...body };
      if (leaving) {
        // keepalive lets the last save finish while the tab closes; same URL and cookie as apiPost.
        void fetch(`${getApiBaseUrl()}${endpoint}`, {
          method: 'POST',
          credentials: 'include',
          keepalive: true,
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).catch(() => {});
      } else {
        void apiPost(endpoint, payload).catch(() => {});
      }
    }
  };
}
