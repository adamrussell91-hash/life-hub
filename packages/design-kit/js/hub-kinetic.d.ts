export type SplitMode = 'words' | 'characters' | 'lines';
export type RevealDirection = 'up' | 'down' | 'left' | 'right';
export type StaggerOrigin = 'start' | 'end' | 'center' | 'edges' | 'random' | number;

export interface Segment {
  value: string;
  animated: boolean;
  index: number;
}

export const KINETIC_SELECTOR: string;
export const DEFAULT_STAGGER_MS: number;

export function splitIntoGraphemes(value: string): string[];
export function getSegments(text: string, splitBy?: SplitMode): Segment[];
export function getDelay(
  index: number,
  total: number,
  stagger: number,
  staggerFrom?: StaggerOrigin
): number;
export function enhanceKinetic(el: Element, reduced?: boolean): void;
export function playKinetic(el: Element): void;
export function resetKinetic(el: Element): void;
