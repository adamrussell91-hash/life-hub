import type { Block } from '@/schemas/block';
import { NOTE_CUE_KINDS } from '@/schemas/block';
import type { RenderMode } from '@/blocks/render';
import { editorShell, type BlockChangeHandler } from '@/blocks/editors';
import { applyHubPillsThumb } from '../../design-kit/js/hub-motion.js';

type NoteCueBlock = Extract<Block, { block_type: 'note_cue' }>;
type Kind = NoteCueBlock['content']['kind'];

export const NOTE_CUE_KIND_LABEL: Record<Kind, string> = {
  copy: 'Copy this',
  own_words: 'Your own words',
  draw: 'Draw it',
  question: 'Question'
};

const PLACEHOLDER: Record<Kind, string> = {
  copy: 'Write: Juxtaposition — placing two contrasting things side by side.',
  own_words: 'In one sentence, why does the speaker change tone here?',
  draw: 'Sketch the cycle with all four stages labelled.',
  question: 'Write one thing you’re unsure about.'
};

/**
 * A prompt to write in their book. Notes always go in books, never the app.
 * A lecture stops on it until the student ticks Done (lecture/player.ts);
 * anywhere else it reads as a plain card.
 */
export function renderNoteCue(block: NoteCueBlock, _mode: RenderMode): HTMLElement {
  const root = document.createElement('div');
  root.className = `block-note-cue block-note-cue--${block.content.kind}`;
  const head = document.createElement('p');
  head.className = 'block-note-cue__head';
  const icon = document.createElement('span');
  icon.className = 'block-note-cue__icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '📓';
  const label = document.createElement('span');
  label.className = 'block-note-cue__label';
  label.textContent = 'In your book';
  const kind = document.createElement('span');
  kind.className = 'block-note-cue__kind';
  kind.textContent = NOTE_CUE_KIND_LABEL[block.content.kind];
  head.append(icon, label, kind);
  const prompt = document.createElement('p');
  prompt.className = 'block-note-cue__prompt block-body';
  prompt.textContent = block.content.prompt;
  root.append(head, prompt);
  if (block.content.kind === 'question') {
    // Shown only inside the lecture player, which opens the hand-up sheet from it.
    const raise = document.createElement('button');
    raise.type = 'button';
    raise.className = 'lecture-raise';
    raise.dataset.prompt = block.content.prompt;
    raise.textContent = 'Raise it with ✋';
    root.append(raise);
  }
  return root;
}

export function createNoteCueEditor(
  block: NoteCueBlock,
  onChange: BlockChangeHandler<NoteCueBlock>,
  getLatest: () => NoteCueBlock = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';
  const kinds = document.createElement('div');
  kinds.className = 'hub-pills block-editor__note-cue-kinds';
  kinds.setAttribute('role', 'group');
  kinds.setAttribute('aria-label', 'Kind of note');
  const prompt = document.createElement('textarea');
  prompt.className = 'block-editor__note-cue-prompt';
  prompt.rows = 2;
  prompt.value = block.content.prompt;
  prompt.setAttribute('aria-label', 'What should they write?');

  const emit = (patch: Partial<NoteCueBlock['content']>) => {
    const latest = getLatest();
    onChange({ ...latest, content: { ...latest.content, ...patch } });
  };
  const paint = () => {
    const current = getLatest().content.kind;
    prompt.placeholder = PLACEHOLDER[current];
    for (const pill of kinds.querySelectorAll<HTMLButtonElement>('button')) {
      const on = pill.dataset.kind === current;
      pill.setAttribute('aria-pressed', String(on));
      pill.classList.toggle('is-active', on);
    }
    requestAnimationFrame(() => applyHubPillsThumb(kinds));
  };
  for (const kind of NOTE_CUE_KINDS) {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'hub-pills__btn';
    pill.dataset.kind = kind;
    pill.textContent = NOTE_CUE_KIND_LABEL[kind];
    pill.addEventListener('click', () => {
      emit({ kind });
      paint();
    });
    kinds.append(pill);
  }
  prompt.addEventListener('input', () => emit({ prompt: prompt.value }));
  fields.append(kinds, prompt);
  paint();
  return editorShell(block, onChange, fields, getLatest);
}
