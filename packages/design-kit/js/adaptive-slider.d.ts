export const DEFAULT_MIN: number;
export const DEFAULT_MAX: number;
export const DEFAULT_STEP: number;
export const DEFAULT_VALUE: number;
export const DEFAULT_DOTS: number;

export function sliderPercentage(value: number, min: number, max: number): number;
export function sliderBand(percentage: number): 'low' | 'mid' | 'high';
export function clampSliderValue(value: number, min: number, max: number, step?: number): number;
export function sliderCeiling(value: number, target: number, step?: number): number;

export type AdaptiveSliderApi = {
  el: HTMLElement;
  input: HTMLInputElement;
  getValue: () => number;
  getStep: () => number;
  getRange: () => { min: number; max: number; step: number };
  isDragging: () => boolean;
  setValue: (value: number, opts?: { silent?: boolean; force?: boolean }) => number;
  setRange: (range?: { min?: number; max?: number; step?: number }) => { min: number; max: number; step: number };
  destroy: () => void;
};

export function createAdaptiveSlider(options?: {
  root?: ParentNode & { createElement: typeof document.createElement };
  el?: HTMLElement;
  label?: string;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  value?: number;
  defaultValue?: number;
  dots?: number;
  readonly?: boolean;
  className?: string;
  onChange?: (value: number) => void;
}): AdaptiveSliderApi;

export function mountAdaptiveSlider(
  el: HTMLElement | null | undefined,
  options?: { onChange?: (value: number) => void }
): AdaptiveSliderApi | null;

export function mountAdaptiveSliders(scope?: ParentNode): AdaptiveSliderApi[];

export function resetAdaptiveSliderForTests(): void;
