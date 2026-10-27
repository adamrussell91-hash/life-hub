// packages/change-book/families/index.mjs
// The Change Book's own chart families, beside the shared Decision Book ones: time_value
// (Multitasking's split star) and attribution ((Un)Happiness's table of forces).
import { timeValueTool } from './time-value.mjs';
import { attributionTool } from './attribution.mjs';

export { timeValueTool, attributionTool };

export const CHANGE_FAMILIES = Object.freeze({
  time_value: timeValueTool,
  attribution: attributionTool
});
