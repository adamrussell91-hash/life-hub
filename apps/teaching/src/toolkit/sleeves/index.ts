import { SKILL_SLEEVES } from './skills';
import { TOOL_SLEEVES } from './tools';
import type { SleeveContent } from './types';
import { VALUE_SLEEVES } from './values';

export * from './types';

/** Every sleeve, in library order within each kind: values, tools, skills. */
export const SLEEVE_CONTENT: readonly SleeveContent[] = [...VALUE_SLEEVES, ...TOOL_SLEEVES, ...SKILL_SLEEVES];

const BY_ID = new Map(SLEEVE_CONTENT.map((item) => [item.id, item]));

export function sleeveContent(id: string): SleeveContent | undefined {
  return BY_ID.get(id);
}
