import type { Block } from '@/schemas/block';
import type { RenderContext, RenderMode } from '@/blocks/render';
import { el } from '@/blocks/peer-feedback-ui';
import { taskCard } from '@/blocks/peer-feedback-task';
import { mountVoiceStudent, speakingSeconds } from '@/blocks/voice-student';
import { mountVoiceTeacher } from '@/blocks/voice-teacher';
import { durationLabel } from '@/blocks/voice-pacing';
import '@/blocks/peer-feedback.css';
import '@/blocks/peer-annotate.css';
import '@/blocks/voice.css';

/**
 * The Voice block's respond and viva modes (listen mode stays the plain
 * audio player in render.ts). Students record on the published lesson; the
 * teacher marks submissions from the same block.
 */

type VoiceBlock = Extract<Block, { block_type: 'audio' }>;

export function renderVoiceTask(block: VoiceBlock, mode: RenderMode, ctx: RenderContext = {}): HTMLElement {
  const isViva = block.content.mode === 'viva';
  const root = el('section', 'voice-block peer-feedback');
  root.dataset.blockId = block.id;
  const head = el('header', 'pf-head');
  head.append(el('h3', 'pf-eyebrow block-eyebrow', isViva ? 'Viva practice' : 'Spoken response'));
  const prompt = block.content.prompt?.trim();
  head.append(taskCard(prompt || 'Record a spoken answer.'));
  const seconds = speakingSeconds(block, { points: [] });
  const facts = [
    block.content.student_chooses_time ? 'You choose 60 s, 90 s or 2 min' : seconds ? `Speak for ${durationLabel(seconds)}` : null,
    isViva ? 'Plan your dot points first' : null
  ].filter(Boolean);
  if (facts.length) head.append(el('p', 'voice-facts block-secondary', facts.join(' · ')));
  root.append(head);

  if (mode === 'print') {
    const sheet = el('div', 'pf-print');
    sheet.append(el('p', 'pf-print__label', isViva ? 'Your dot points' : 'Notes'), el('div', 'pf-print__lines'));
    root.append(sheet);
    return root;
  }
  if (!ctx.lessonId) {
    root.append(el('p', 'pf-note block-secondary', 'Students record from the published lesson.'));
    return root;
  }
  root.append(mode === 'teacher' ? mountVoiceTeacher(block, ctx.lessonId) : mountVoiceStudent(block, ctx.lessonId));
  return root;
}
