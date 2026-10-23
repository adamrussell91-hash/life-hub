import { apiPost } from '@/api/client';
import { deviceToken } from '@/quiz/dom';
import type { Block } from '@/schemas/block';
import type { LectureClient, LectureStatus, MyHandup } from '@/lecture/api';
import type { TutorialStage } from './schema';

export type TutorialStatus = {
  identity: { need: 'class' | 'initials' | null; initials: string | null };
  anonymous?: boolean;
  not_for_you?: boolean;
  group: { id: string; goal: string; blocks: Block[] } | null;
  sitting: boolean;
  unlocked: boolean;
  shown: { text: string; label: string } | null;
  handups: MyHandup[];
};

export type TutorialClient = {
  status(): Promise<TutorialStatus>;
  claim(initials: string): Promise<TutorialStatus>;
  progress(stage: TutorialStage): Promise<TutorialStatus>;
  answer(blockId: string, parts: Record<number, string>, rating: 'right' | 'wrong'): Promise<TutorialStatus>;
  /** The lecture player's client, so its ✋ and initials claim talk to the tutorial. Progress is sent by stage instead. */
  forPlayer(): LectureClient;
};

export function tutorialClient(lessonId: string, classId: string): TutorialClient {
  const endpoint = `/api/published/tutorial/${encodeURIComponent(lessonId)}`;
  const classToken = deviceToken(`class:${classId}`);
  const fields = { class_id: classId, ...(classToken ? { class_token: classToken } : {}) };
  const call = (action: string, extra: Record<string, unknown> = {}) => apiPost<TutorialStatus>(endpoint, { action, ...fields, ...extra });
  const asLecture = (s: TutorialStatus): LectureStatus => ({ identity: s.identity, handups: s.handups, ...(s.anonymous ? { anonymous: true } : {}) });
  return {
    status: () => call('status'),
    claim: (initials) => call('claim', { initials }),
    // progress and answer reply with handups: [] always; read hand-ups from status.
    progress: (stage) => call('progress', { stage }),
    answer: (blockId, parts, rating) => call('answer', { block_id: blockId, parts, rating }),
    forPlayer: () => ({
      status: () => call('status').then(asLecture),
      claim: (initials) => call('claim', { initials }).then(asLecture),
      handup: (input) => call('handup', input).then(asLecture),
      progress: () => {}
    })
  };
}
