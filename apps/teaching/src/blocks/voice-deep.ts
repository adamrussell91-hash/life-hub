import type { Block } from '@/schemas/block';
import { apiGet } from '@/api/client';
import { button, el } from '@/blocks/peer-feedback-ui';
import { deepApi, type DeepProgress } from '@/deep/api';
import { evidenceStepOf, passChecks, targetPieces, type EvidenceStep } from '@/deep/block-tags';
import { STEP_LABEL, type DeepUnderstanding, type PlacedStep } from '@/deep/schema';

/**
 * The deep understanding panel on a Voice marking screen, for a question that
 * is a step's evidence task: what a pass sounds like, the target pieces to tick
 * used or missed, and the Pass button. Ticks and passes save to the class's
 * deep progress, the same record Monitoring reads.
 */

export type Who = { classId: string; studentId: string } | null;
/** What the AI heard in this take (To mark): dashed until the teacher decides. */
export type VoiceAiRead = { checks: { met: boolean; quote?: string; why?: string }[]; pieces: Record<string, boolean> };
type Deps = {
  ai?: VoiceAiRead | null;
  loadUnit?: (lessonId: string) => Promise<{ unitId: string; deep: DeepUnderstanding[] }>;
  api?: Pick<typeof deepApi, 'load' | 'setStep' | 'setWriting'>;
};

const PLACED: PlacedStep[] = ['2a', '2b', '3', '4'];
const PREV: Record<PlacedStep, PlacedStep | null> = { '2a': null, '2b': '2a', '3': '2b', '4': '3' };

async function defaultLoadUnit(lessonId: string): Promise<{ unitId: string; deep: DeepUnderstanding[] }> {
  const lesson = await apiGet<{ unit_id?: string }>(`/api/lessons/${encodeURIComponent(lessonId)}`);
  if (!lesson.unit_id) return { unitId: '', deep: [] };
  const unit = await apiGet<{ deep_understandings?: DeepUnderstanding[] }>(`/api/units/${encodeURIComponent(lesson.unit_id)}`);
  return { unitId: lesson.unit_id, deep: unit.deep_understandings ?? [] };
}

/** Null when the question isn't a step's evidence task. `setWho` repaints for another student. */
export function mountVoiceDeep(block: Pick<Block, 'id' | 'settings'>, lessonId: string, who: Who, deps: Deps = {}): { el: HTMLElement; setWho: (next: Who) => void } | null {
  const found = evidenceStepOf(block);
  if (!found) return null;
  const step: EvidenceStep = found;
  const checks = passChecks(block);
  const targets = targetPieces(block);
  const api = deps.api ?? deepApi;

  const box = el('details', 'voice-pass');
  box.open = !window.matchMedia?.('(max-width: 560px)').matches;
  box.append(el('summary', 'voice-pass__title', `Step ${STEP_LABEL[step.step]} evidence${checks.length ? ', listen for' : ''}`));

  if (checks.length) {
    const list = el('ul', 'voice-pass__list');
    checks.forEach((check, n) => {
      const label = el('label', 'voice-pass__item');
      const tick = el('input');
      tick.type = 'checkbox';
      const heard = deps.ai?.checks[n];
      if (heard) {
        tick.checked = heard.met;
        label.classList.add('is-ai');
      }
      // Hand focus back at once, so number and letter keys keep tagging.
      tick.addEventListener('change', () => {
        tick.blur();
        label.classList.remove('is-ai');
      });
      const text = el('span', undefined, check);
      if (heard?.quote || heard?.why) text.append(el('small', 'voice-pass__heard', heard.quote ? `“${heard.quote}”` : heard.why));
      label.append(tick, text);
      const item = el('li');
      item.append(label);
      list.append(item);
    });
    box.append(list);
  }

  const live = el('div', 'voice-pass__live');
  const status = el('p', 'voice-pass__note block-secondary');
  status.setAttribute('role', 'status');
  box.append(live, status);

  let current = who;
  let unit: { unitId: string; deep: DeepUnderstanding[] } | null = null;
  let progress: DeepProgress | null = null;
  let loadedFor = '';
  let unitLoad: Promise<void> | null = null;

  const pieceText = (id: string): string => unit?.deep.flatMap((d) => d.pieces).find((p) => p.id === id)?.text ?? id;
  const duNumber = (): number => (unit?.deep.findIndex((d) => d.id === step.du) ?? -1) + 1;

  async function save(run: () => Promise<DeepProgress>): Promise<void> {
    status.textContent = 'Saving…';
    try {
      progress = await run();
      status.textContent = 'Saved.';
    } catch {
      status.textContent = 'Could not save. Try again.';
    }
    paint();
  }

  function paint(): void {
    live.replaceChildren();
    if (!current) {
      live.append(el('p', 'voice-pass__note block-secondary', 'Pick the student above to tick pieces and pass the step.'));
      return;
    }
    if (!unit || !progress) return;
    const { classId, studentId } = current;
    const n = duNumber();
    if (!n) {
      live.append(el('p', 'voice-pass__note block-secondary', 'This deep understanding is no longer on the unit.'));
      return;
    }

    if (targets.length) {
      const pieces = el('div', 'voice-pass__pieces');
      pieces.append(el('span', 'voice-strip__label', 'Pieces used'));
      const tick = progress.writing[block.id]?.[studentId] ?? { used: [], missed: [], at: '' };
      for (const id of targets) {
        const marked = tick.used.includes(id) ? 'used' : tick.missed.includes(id) ? 'missed' : 'blank';
        // A blank piece shows what the AI heard; the first tap keeps it.
        const heard = marked === 'blank' && typeof deps.ai?.pieces[id] === 'boolean' ? (deps.ai.pieces[id] ? 'used' : 'missed') : null;
        const state = heard ?? marked;
        const b = button('', 'ghost', () => {
          b.blur();
          const next = heard ?? (state === 'blank' ? 'used' : state === 'used' ? 'missed' : 'blank');
          const used = tick.used.filter((x) => x !== id).concat(next === 'used' ? [id] : []);
          const missed = tick.missed.filter((x) => x !== id).concat(next === 'missed' ? [id] : []);
          void save(() => api.setWriting(classId, unit!.unitId, block.id, studentId, used, missed));
        });
        b.className = `voice-pass__piece is-${state}${heard ? ' is-ai' : ''}`;
        b.setAttribute('aria-label', `${pieceText(id)}: ${state === 'used' ? 'used' : state === 'missed' ? 'missed' : 'not marked'}. Tap to change.`);
        b.append(el('span', 'voice-pass__mark', state === 'used' ? '✓' : state === 'missed' ? '–' : ''), el('span', undefined, pieceText(id)));
        pieces.append(b);
      }
      live.append(pieces);
    }

    const passed = progress.steps[studentId]?.[step.du]?.step;
    const passedIdx = passed ? PLACED.indexOf(passed) : -1;
    const mine = PLACED.indexOf(step.step);
    const prev = PREV[step.step];
    const row = el('div', 'voice-pass__step');
    row.append(el('span', 'voice-pass__now', passed ? `DU ${n}: passed Step ${STEP_LABEL[passed]}` : `DU ${n}: no step passed yet`));
    if (passedIdx >= mine) {
      row.append(button(`Undo Step ${STEP_LABEL[step.step]}`, 'ghost', () => void save(() => api.setStep(classId, unit!.unitId, studentId, step.du, prev, false))));
    } else if (passedIdx === mine - 1) {
      row.append(button(`Pass on Step ${STEP_LABEL[step.step]}`, 'secondary', () => void save(() => api.setStep(classId, unit!.unitId, studentId, step.du, step.step, false))));
      if (!prev) row.append(el('span', 'voice-pass__note block-secondary', 'Check Step 1 is through in Monitoring first.'));
    } else {
      row.append(el('span', 'voice-pass__note block-secondary', `Pass Step ${STEP_LABEL[prev!]} first. This take still counts as practice.`));
    }
    live.append(row);
  }

  async function refresh(): Promise<void> {
    paint();
    if (!current) return;
    try {
      unitLoad ??= (deps.loadUnit ?? defaultLoadUnit)(lessonId).then((u) => { unit = u; });
      await unitLoad;
      if (!unit?.unitId) { status.textContent = 'This lesson is not in a unit.'; return; }
      if (loadedFor !== current.classId) {
        progress = await api.load(current.classId, unit.unitId);
        loadedFor = current.classId;
      }
      status.textContent = '';
    } catch {
      status.textContent = 'Could not load deep understanding progress.';
    }
    paint();
  }

  void refresh();
  return {
    el: box,
    setWho(next) {
      current = next;
      void refresh();
    }
  };
}
