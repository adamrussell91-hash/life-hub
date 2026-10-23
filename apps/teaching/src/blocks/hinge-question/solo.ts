import { apiPost } from '@/api/client';
import { el, errorText, readJSON, writeJSON } from '@/blocks/peer-feedback-ui';
import { emitAnswered } from '@/lecture/answered';
import { LETTERS, type HingeBlock } from './shared';

type Saved = { pick: string; correct_id: string; right: boolean };

/**
 * A hinge question inside a lecture: the student answers alone, once, and
 * sees right or wrong with the right answer marked. In the teacher's preview
 * the draft still holds the answer, so it checks locally and sends nothing.
 */
const previewAnswers = new Map<string, Saved>();

/** Preview answers last until the teacher closes the preview (Start again clears them too). */
export function clearPreviewAnswers(): void {
  previewAnswers.clear();
}

export function mountSolo(block: HingeBlock, lessonId: string, preview: boolean): HTMLElement {
  const saveKey = `hinge:${lessonId}:${block.id}:solo`;
  const deviceKey = `hinge:${lessonId}:${block.id}:device`;
  const root = el('div', 'hq-run hq-solo');
  const alert = el('p', 'pf-alert');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  // The teacher's preview keeps answers in memory only, so a re-render after a detour still shows them.
  let saved = preview ? previewAnswers.get(saveKey) ?? null : readJSON<Saved>(saveKey);
  let busy = false;

  function token(): string | null {
    const have = readJSON<string>(deviceKey);
    if (have && /^[a-f0-9]{48}$/.test(have)) return have;
    const fresh = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('');
    return writeJSON(deviceKey, fresh) ? fresh : null;
  }

  async function pick(id: string): Promise<void> {
    if (busy || saved) return;
    busy = true;
    try {
      if (preview) {
        const correct = (block.content as { correct_id?: string }).correct_id ?? '';
        saved = { pick: id, correct_id: correct, right: id === correct };
        previewAnswers.set(saveKey, saved);
      } else {
        const res = await apiPost<{ mine: string; correct_id: string; right: boolean }>(
          `/api/published/hinge/${encodeURIComponent(lessonId)}/${encodeURIComponent(block.id)}`,
          { action: 'solo', token: token(), pick: id }
        );
        saved = { pick: res.mine, correct_id: res.correct_id, right: res.right };
        writeJSON(saveKey, saved);
      }
      alert.hidden = true;
      paint();
      emitAnswered(root, block.id, saved.right ? 'right' : 'wrong');
    } catch (error) {
      alert.textContent = errorText(error);
      alert.hidden = false;
    } finally {
      busy = false;
    }
  }

  function paint(): void {
    const list = el('div', 'hq-choices');
    list.setAttribute('role', 'radiogroup');
    list.setAttribute('aria-label', 'Your answer');
    block.content.options.forEach((o, i) => {
      const choice = el('button', 'hq-choice');
      choice.type = 'button';
      choice.setAttribute('role', 'radio');
      choice.setAttribute('aria-checked', String(saved?.pick === o.id));
      choice.dataset.chosen = String(saved?.pick === o.id);
      if (saved) choice.dataset.right = String(o.id === saved.correct_id);
      choice.disabled = !!saved;
      choice.append(el('span', 'hq-letter', LETTERS[i] ?? '?'), el('span', 'hq-choice__text', o.text));
      choice.addEventListener('click', () => void pick(o.id));
      list.append(choice);
    });
    const parts: HTMLElement[] = [list];
    if (saved) {
      const box = el('div', `hq-verdict hq-verdict--${saved.right ? 'right' : 'wrong'}`);
      box.setAttribute('role', 'status');
      box.append(el('p', 'hq-verdict__title block-subtitle', saved.right ? 'You got it.' : 'Not this time.'), el('p', 'block-body', saved.right ? 'Your answer was right.' : 'The right answer is marked above.'));
      parts.push(box);
    }
    root.replaceChildren(...parts, alert);
  }

  paint();
  return root;
}
