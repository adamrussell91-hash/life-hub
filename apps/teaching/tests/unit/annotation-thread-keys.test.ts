import { describe, expect, it } from 'vitest';
import {
  clampStepIndex,
  resolveAnnotationKey,
  stepThreadIndex
} from '@/blocks/annotation-thread-keys';

describe('resolveAnnotationKey', () => {
  it('ignores keys in text controls', () => {
    expect(
      resolveAnnotationKey({
        key: 'ArrowRight',
        focusThreadId: 't1',
        sliderFocused: false,
        panelOpen: false,
        isTextControl: true
      })
    ).toBeNull();
  });

  it('Escape closes panel before exiting focus', () => {
    expect(
      resolveAnnotationKey({
        key: 'Escape',
        focusThreadId: 't1',
        sliderFocused: false,
        panelOpen: true,
        isTextControl: false
      })
    ).toEqual({ type: 'close_panel' });
    expect(
      resolveAnnotationKey({
        key: 'Escape',
        focusThreadId: 't1',
        sliderFocused: false,
        panelOpen: false,
        isTextControl: false
      })
    ).toEqual({ type: 'exit_focus' });
  });

  it('arrows step the thread while focused unless the slider is focused', () => {
    expect(
      resolveAnnotationKey({
        key: 'ArrowRight',
        focusThreadId: 't1',
        sliderFocused: false,
        panelOpen: false,
        isTextControl: false
      })
    ).toEqual({ type: 'step_thread', delta: 1 });
    expect(
      resolveAnnotationKey({
        key: 'ArrowLeft',
        focusThreadId: 't1',
        sliderFocused: false,
        panelOpen: false,
        isTextControl: false
      })
    ).toEqual({ type: 'step_thread', delta: -1 });
    expect(
      resolveAnnotationKey({
        key: 'ArrowRight',
        focusThreadId: 't1',
        sliderFocused: true,
        panelOpen: false,
        isTextControl: false
      })
    ).toEqual({ type: 'step_slider', delta: 1 });
  });

  it('arrows step the layer slider when not in thread focus', () => {
    expect(
      resolveAnnotationKey({
        key: 'ArrowUp',
        focusThreadId: null,
        sliderFocused: false,
        panelOpen: false,
        isTextControl: false
      })
    ).toEqual({ type: 'step_slider', delta: 1 });
    expect(
      resolveAnnotationKey({
        key: 'Home',
        focusThreadId: null,
        sliderFocused: false,
        panelOpen: false,
        isTextControl: false
      })
    ).toEqual({ type: 'slider_home' });
  });

  it('Home/End do not move the slider while thread focus owns the keys', () => {
    expect(
      resolveAnnotationKey({
        key: 'Home',
        focusThreadId: 't1',
        sliderFocused: false,
        panelOpen: false,
        isTextControl: false
      })
    ).toBeNull();
    expect(
      resolveAnnotationKey({
        key: 'End',
        focusThreadId: 't1',
        sliderFocused: true,
        panelOpen: false,
        isTextControl: false
      })
    ).toEqual({ type: 'slider_end' });
  });
});

describe('stepThreadIndex', () => {
  it('starts at the end for backward step and clamps', () => {
    expect(stepThreadIndex(null, 5, 1)).toBe(0);
    expect(stepThreadIndex(null, 5, -1)).toBe(4);
    expect(stepThreadIndex(0, 5, -1)).toBe(0);
    expect(stepThreadIndex(4, 5, 1)).toBe(4);
    expect(clampStepIndex(9, 5)).toBe(4);
  });
});
