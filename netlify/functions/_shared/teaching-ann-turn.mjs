/**
 * Phase 5 Teaching entry — same runner as Life Ann.
 * Presentation stays on Teaching. Retrieval, kernel, and memory do not fork.
 */
import { runSurfaceAgentTurn } from './agent-surface.mjs';

export function runTeachingAnnTurn({
  message,
  today,
  now = new Date(),
  stores = {},
  tools = [],
  env = {},
  flag,
  sourceMeta = {},
  slug = 'ann'
} = {}) {
  return runSurfaceAgentTurn({
    surface: 'teaching',
    slug,
    message,
    today,
    now,
    stores,
    tools,
    env,
    flag,
    sourceMeta
  });
}
