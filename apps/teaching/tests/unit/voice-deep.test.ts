import { describe, expect, it, vi } from 'vitest';
import { mountVoiceDeep } from '@/blocks/voice-deep';
import type { DeepProgress } from '@/deep/api';

const block = {
  id: 'blk1',
  settings: {
    deep_step: { du: 'du_hybform', step: '3' },
    deep_targets: ['kp_hf01', 'kp_hf02'],
    deep_checks: ['Names two poems']
  }
};
const unit = {
  unitId: 'unit_1',
  deep: [{ id: 'du_hybform', pieces: [{ id: 'kp_hf01', text: 'Form acts out', tier: 'essential' }, { id: 'kp_hf02', text: 'Haibun', tier: 'essential' }] }]
} as never;

function fakeApi(progress: DeepProgress) {
  return {
    load: vi.fn(async () => progress),
    setStep: vi.fn(async () => progress),
    setWriting: vi.fn(async () => progress)
  };
}
const settle = () => new Promise((r) => setTimeout(r, 0));
const buttons = (root: HTMLElement) => [...root.querySelectorAll('button')].map((b) => b.textContent ?? '');

describe('voice marking deep panel', () => {
  it('is absent for a question that is no step evidence', () => {
    expect(mountVoiceDeep({ id: 'b', settings: {} }, 'lesson_1', null)).toBeNull();
  });

  it('asks for the student before showing ticks', async () => {
    const panel = mountVoiceDeep(block, 'lesson_1', null, { loadUnit: async () => unit, api: fakeApi({ steps: {}, writing: {} }) })!;
    await settle();
    expect(panel.el.textContent).toContain('Names two poems');
    expect(panel.el.textContent).toContain('Pick the student');
  });

  it('offers Pass once the step before is passed, and saves it', async () => {
    const api = fakeApi({ steps: { st1: { du_hybform: { step: '2b', at: '2026-11-01' } } }, writing: {} });
    const panel = mountVoiceDeep(block, 'lesson_1', { classId: 'class_1', studentId: 'st1' }, { loadUnit: async () => unit, api })!;
    await settle();
    await settle();
    const pass = [...panel.el.querySelectorAll('button')].find((b) => b.textContent === 'Pass on Step 3')!;
    pass.click();
    expect(api.setStep).toHaveBeenCalledWith('class_1', 'unit_1', 'st1', 'du_hybform', '3', false);
  });

  it('holds Pass back until the earlier step is passed', async () => {
    const panel = mountVoiceDeep(block, 'lesson_1', { classId: 'class_1', studentId: 'st1' }, { loadUnit: async () => unit, api: fakeApi({ steps: {}, writing: {} }) })!;
    await settle();
    await settle();
    expect(buttons(panel.el)).not.toContain('Pass on Step 3');
    expect(panel.el.textContent).toContain('Pass Step 2B first');
  });

  it('cycles a piece from blank to used', async () => {
    const api = fakeApi({ steps: {}, writing: {} });
    const panel = mountVoiceDeep(block, 'lesson_1', { classId: 'class_1', studentId: 'st1' }, { loadUnit: async () => unit, api })!;
    await settle();
    await settle();
    const piece = [...panel.el.querySelectorAll('button')].find((b) => b.textContent?.includes('Haibun'))!;
    piece.click();
    expect(api.setWriting).toHaveBeenCalledWith('class_1', 'unit_1', 'blk1', 'st1', ['kp_hf02'], []);
  });
});
