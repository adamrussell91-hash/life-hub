import type { Block } from '@/schemas/block';
import { el } from '@/blocks/peer-feedback-ui';
import { voiceReadForRubric, type VoiceAiRead } from '@/marking/ai-read';
import { rubricTags, type Rubric } from '@/marking/rubric-model';
import { mountRubricPanel, type RubricPanel, type RubricSetup } from '@/marking/rubric-panel';
import { deepApi } from '@/deep/api';
import { loadRubricSetup, passedOf, type RubricDeps } from '@/marking/rubric-setup';
import { loadStudentRungs } from '@/skills/rungs-api';

/**
 * The rubric on a Voice marking screen, in the dock under the player and codes.
 * It folds and scrolls on its own, so a long rubric never pushes the codes out
 * of reach. What it holds saves with the take (voice-teacher.ts), which records
 * the rungs, ticks and passes on the server.
 */

export type { VoiceAiRead };
export type Who = { classId: string; studentId: string } | null;
type Deps = {
  ai?: VoiceAiRead | null;
  saved?: Rubric | null;
  tagged?: () => { code_id: string; positive: boolean }[];
  onChange?: () => void;
  load?: RubricDeps;
  progress?: (classId: string, unitId: string) => Promise<{ steps: Record<string, Record<string, { step: string }>> }>;
};

export type VoiceRubric = {
  el: HTMLElement;
  setWho: (next: Who) => void;
  saveFields: RubricPanel['saveFields'];
  failed: () => void;
  applyReply: (reply: unknown) => boolean;
  touch: () => void;
  refresh: () => void;
  /** Settled once the panel is drawn. */
  ready: Promise<void>;
};

const PICK_FIRST = 'Pick the student above so this counts.';

/** Null when the question carries no tags. `setWho` follows the student picker. */
export function mountVoiceDeep(block: Pick<Block, 'id' | 'settings'>, lessonId: string, who: Who, deps: Deps = {}): VoiceRubric | null {
  const tags = rubricTags(block);
  if (!tags.skills.length && !tags.pieces.length && !tags.steps.length) return null;

  const box = el('details', 'voice-rubric');
  box.open = !window.matchMedia?.('(max-width: 560px)').matches;
  const summary = el('summary', 'voice-rubric__title', 'Rubric');
  const status = el('p', 'block-secondary', 'Opening the rubric…');
  box.append(summary, status);

  let current = who;
  let panel: RubricPanel | null = null;
  let setup: RubricSetup | null = null;
  let touched = false;

  const paintLast = async (): Promise<void> => {
    if (!panel || !setup?.rows.skills.length) return;
    if (!current) { panel.setLast(null); return; }
    const { studentId, classId } = current;
    const rungs = await (deps.load?.rungs ?? loadStudentRungs)(classId, studentId).catch(() => null);
    if (current?.studentId === studentId) panel.setLast(rungs);
  };

  const paintWho = async (): Promise<void> => {
    if (!panel || !setup) return;
    panel.setNote(current ? '' : PICK_FIRST);
    void paintLast();
    if (!current || !setup.unitId || !setup.rows.steps.length) {
      panel.setPassed(null, current?.studentId ?? null);
      return;
    }
    const { studentId, classId } = current;
    const load = deps.progress ?? ((c: string, u: string) => deepApi.load(c, u));
    const progress = await load(classId, setup.unitId).catch(() => null);
    if (current?.studentId === studentId) panel.setPassed(progress ? passedOf(progress, studentId) : null, studentId);
  };

  const ready = loadRubricSetup({ lessonId, blockId: block.id }, deps.load).then(
    (loaded) => {
      setup = loaded;
      if (!loaded) {
        status.textContent = 'Could not open the rubric. Reload to try again.';
        return;
      }
      panel = mountRubricPanel(loaded, {
        saved: deps.saved ?? null,
        ai: voiceReadForRubric(deps.ai, loaded.rows),
        ...(deps.tagged ? { tagged: deps.tagged } : {}),
        ...(deps.onChange ? { onChange: deps.onChange } : {}),
        studentId: current?.studentId ?? null
      });
      if (touched) panel.touch();
      status.remove();
      box.append(panel.el);
      return paintWho();
    },
    () => { status.textContent = 'Could not open the rubric. Reload to try again.'; }
  );

  return {
    el: box,
    ready,
    setWho(next) {
      current = next;
      void paintWho();
    },
    saveFields: () => panel?.saveFields() ?? {},
    failed: () => panel?.failed(),
    applyReply(reply) {
      const stayed = panel?.applyReply(reply) ?? false;
      if (stayed) box.open = true;
      return stayed;
    },
    touch() {
      touched = true;
      panel?.touch();
    },
    refresh: () => panel?.refresh()
  };
}
