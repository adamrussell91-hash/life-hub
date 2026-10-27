import type { Block } from '@/schemas/block';
import { apiPost } from '@/api/client';
import type { RenderContext, RenderMode } from '@/blocks/render';
import { button, deviceToken, el, errorText, labelled } from '@/quiz/dom';
import './done.css';

/**
 * Done: the student marks the lesson finished. A device that already holds a class claim
 * needs one tap; a new device types initials, which claim them through the profile endpoint.
 * No names, no accounts: the server decides whose record it is from the device's claim.
 */

type DoneBlock = Extract<Block, { block_type: 'done' }>;
type ProfileReply = { need: 'initials' | null; initials?: string; map?: { lessons: Array<{ id: string; done: boolean }> } };
type ProfileCall = (action: 'status' | 'claim' | 'done', extra?: Record<string, unknown>) => Promise<ProfileReply>;
/** `profileCall` replaces the network call in tests. */
export type DoneContext = RenderContext & { profileCall?: ProfileCall };

function networkCall(classId: string): ProfileCall {
  return (action, extra = {}) => apiPost<ProfileReply>(`/api/published/profile/${encodeURIComponent(classId)}`, { action, class_token: deviceToken(`class:${classId}`), ...extra });
}

export function renderDone(block: DoneBlock, mode: RenderMode, ctx: DoneContext = {}): HTMLElement {
  const root = el('section', 'dn-done');
  const label = block.content.label || 'I’ve finished this';
  if (mode !== 'student') {
    const preview = button(label, 'primary', () => {});
    preview.disabled = true;
    root.append(preview);
    return root;
  }
  const call = ctx.profileCall ?? (ctx.classId ? networkCall(ctx.classId) : null);
  const lessonId = ctx.lessonId;
  // Outside a class there is no one to record it for.
  if (!call || !lessonId) {
    root.hidden = true;
    return root;
  }

  const message = el('p', 'dn-done__message');
  message.setAttribute('role', 'alert');
  message.hidden = true;
  const fail = (error: unknown): void => {
    message.textContent = errorText(error);
    message.hidden = false;
  };
  const finished = (): void => {
    root.replaceChildren(el('p', 'dn-done__finished', 'Marked done'));
  };
  const record = async (): Promise<void> => {
    message.hidden = true;
    try {
      await call('done', { lesson_id: lessonId });
      finished();
    } catch (error) {
      fail(error);
    }
  };

  const showKnown = (initials: string): void => {
    const done = button(`${label} (Done as ${initials})`, 'primary', () => void record());
    root.replaceChildren(done, message);
  };
  const showInitials = (): void => {
    const input = el('input', 'dn-done__initials');
    input.type = 'text';
    input.maxLength = 6;
    input.autocomplete = 'off';
    input.autocapitalize = 'characters';
    input.placeholder = 'Your initials';
    const done = button('Done', 'primary', () => {
      message.hidden = true;
      void (async () => {
        try {
          await call('claim', { initials: input.value });
          await call('done', { lesson_id: lessonId });
          finished();
        } catch (error) {
          fail(error);
        }
      })();
    });
    root.replaceChildren(labelled('Type your initials, then tap Done', input), done, message);
  };

  void call('status')
    .then((reply) => {
      if (reply.map?.lessons.find((l) => l.id === lessonId)?.done) finished();
      else if (reply.need === 'initials') showInitials();
      else showKnown(reply.initials ?? '');
    })
    .catch((error) => {
      root.replaceChildren(message);
      fail(error);
    });
  return root;
}

export function createDoneEditor(block: DoneBlock, onChange: (b: DoneBlock) => void): HTMLElement {
  const root = el('div', 'dn-done dn-done--editor');
  let current = block;
  const input = el('input');
  input.type = 'text';
  input.maxLength = 120;
  input.value = current.content.label;
  input.addEventListener('input', () => {
    current = { ...current, content: { ...current.content, label: input.value } };
    onChange(current);
  });
  root.append(labelled('Button text', input, 'Students tap this at the bottom of the lesson to mark it finished.'));
  return root;
}
