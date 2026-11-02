import { describe, expect, it, vi } from 'vitest';
import { mountVoiceDeep } from '@/blocks/voice-deep';

const block = {
  id: 'blk1',
  settings: {
    deep_step: { du: 'du_hybform', step: '3' },
    deep_targets: ['kp_hf01', 'kp_hf02'],
    deep_checks: ['Names two poems']
  }
};
const unit = {
  deep_understandings: [{ id: 'du_hybform', dot_points: [], pieces: [{ id: 'kp_hf01', text: 'Form acts out', tier: 'essential' }, { id: 'kp_hf02', text: 'Haibun', tier: 'essential' }], steps: [] }]
};
const load = { lesson: async () => ({ unit_id: 'unit_1', blocks: [{ ...block, block_type: 'audio', content: {} }] }) as never, unit: async () => unit as never, codes: async () => [] };
const progress = (step?: string) => vi.fn(async () => ({ steps: step ? { st1: { du_hybform: { step } } } : {} }));
const who = { classId: 'class_1', studentId: 'st1' };
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('the rubric in the Voice marking dock', () => {
  it('is absent for a question with no tags', () => {
    expect(mountVoiceDeep({ id: 'b', settings: {} }, 'lesson_1', null)).toBeNull();
  });

  it('appears for a question tagged with only a skill', () => {
    expect(mountVoiceDeep({ id: 'b', settings: { deep_skills: ['arguing.thesis'] } }, 'lesson_1', null, { load })).not.toBeNull();
  });

  it('asks for the student, and shows the rows', async () => {
    const panel = mountVoiceDeep(block, 'lesson_1', null, { load, progress: progress() })!;
    await panel.ready;
    expect(panel.el.textContent).toContain('Names two poems');
    expect(panel.el.textContent).toContain('Form acts out');
    expect(panel.el.textContent).toContain('Pick the student');
    panel.setWho(who);
    await settle();
    expect(panel.el.textContent).not.toContain('Pick the student');
  });

  it('offers Pass once the step before is passed, and sends it with the take, leaving no direct save', async () => {
    const onChange = vi.fn();
    const panel = mountVoiceDeep(block, 'lesson_1', who, { load, progress: progress('2b'), onChange })!;
    await panel.ready;
    await settle();
    const pass = [...panel.el.querySelectorAll('button')].find((b) => b.textContent === 'Pass on Step 3')!;
    expect(pass.hidden).toBe(false);
    pass.click();
    expect(onChange).toHaveBeenCalled();
    expect(panel.saveFields().rubric!.steps).toEqual({ 'du_hybform:3': { checks: [false], pass: true } });
  });

  it('holds Pass back until the earlier step is passed', async () => {
    const panel = mountVoiceDeep(block, 'lesson_1', who, { load, progress: progress() })!;
    await panel.ready;
    await settle();
    expect(panel.el.querySelector<HTMLElement>('.rb-pass')!.hidden).toBe(true);
    expect(panel.el.textContent).toContain('Pass Step 2B first');
  });

  it('shows the AI read dashed with what it heard, keeps it on request, and never passes', async () => {
    const ai = { checks: [{ met: true, quote: 'two poems here' }], pieces: { kp_hf01: true, kp_hf02: false } };
    const panel = mountVoiceDeep(block, 'lesson_1', who, { load, progress: progress('2b'), ai })!;
    await panel.ready;
    expect(panel.el.querySelector('.rb-check')!.classList.contains('is-ai')).toBe(true);
    expect(panel.el.textContent).toContain('“two poems here”');
    expect(panel.el.querySelectorAll('.rb-pill.is-ai')).toHaveLength(2);
    expect(panel.saveFields()).toEqual({});
    [...panel.el.querySelectorAll('button')].find((b) => b.textContent === 'Keep the AI’s read')!.click();
    const rubric = panel.saveFields().rubric!;
    expect(rubric.pieces).toEqual({ kp_hf01: 'used', kp_hf02: 'missed' });
    expect(rubric.steps['du_hybform:3']).toEqual({ checks: [true], pass: false });
  });

  it('opens itself to say a step stayed practice', async () => {
    const panel = mountVoiceDeep(block, 'lesson_1', who, { load, progress: progress('2b') })!;
    await panel.ready;
    (panel.el as HTMLDetailsElement).open = false;
    expect(panel.applyReply({ blocked: ['du_hybform:3'] })).toBe(true);
    expect((panel.el as HTMLDetailsElement).open).toBe(true);
    expect(panel.el.textContent).toContain('stays as practice');
  });
});
